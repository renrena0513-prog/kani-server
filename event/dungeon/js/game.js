(function () {
    const { DIRECTIONS, CARRY_LIMIT } = window.DUNGEON_CONSTANTS;
    const api = window.DUNGEON_API;
    const ui = window.DUNGEON_UI;

    const state = {
        user: null,
        userId: null,
        profile: null,
        stocks: [],
        catalog: [],
        run: null,
        floor: null,
        logs: [],
        selectedCarryItems: [],
        lastPopupStep: null,
        stairsPromptDismissed: false,
        mobilePadVisible: false
    };

    function hydratePayload(payload) {
        if (!payload) return;
        state.run = payload.run || state.run;
        state.floor = payload.floor || state.floor;
        state.logs = payload.logs || state.logs;
        if (payload.profile) state.profile = payload.profile;
    }

    function getCarryLimit() {
        const hasGreedyBag = (state.stocks || []).some((stock) => stock.item_code === 'greedy_bag' && Number(stock.quantity || 0) > 0);
        return hasGreedyBag ? CARRY_LIMIT + 1 : CARRY_LIMIT;
    }

    function syncSelectedCarryItems() {
        const carryLimit = getCarryLimit();
        const autoSelected = (state.stocks || [])
            .filter((stock) => stock.is_set && stock.evd_item_catalog?.carry_in_allowed && Number(stock.quantity || 0) > 0)
            .slice(0, carryLimit)
            .map((stock) => stock.item_code);
        state.selectedCarryItems = autoSelected;
    }

    function renderStart() {
        const carryLimit = getCarryLimit();
        ui.showScreen('start');
        ui.renderCarryList(state.stocks, state.selectedCarryItems);
        ui.renderPrepShop(state.catalog, state.stocks, state.profile?.coins || 0);
        ui.setStatus(`1000コインを支払い、持ち込み ${carryLimit} 個までで探索開始。`);
        document.getElementById('entry-fee-label').textContent = '1000 コイン';
        document.getElementById('wallet-coins-label').textContent = new Intl.NumberFormat('ja-JP').format(state.profile?.coins || 0);
        const carryLimitNote = document.getElementById('carry-limit-note');
        if (carryLimitNote) {
            carryLimitNote.textContent = `在庫から ${carryLimit} 個まで選択できます。`;
        }
        document.getElementById('resume-run-btn').classList.add('d-none');
    }

    function renderGame() {
        if (!state.run || !state.floor) return;
        ui.showScreen('game');
        ui.renderHud(state);
        ui.renderInventory(state);
        ui.renderBoard(state);
        ui.renderShop(state);
        ui.renderAltarRewardPrompt(state);
        ui.renderThiefPrompt(state);
        ui.renderLogs(state.logs);

        const currentCell = state.floor?.grid?.[state.run.current_y]?.[state.run.current_x];
        const onStairs = currentCell?.type === '下り階段';
        if (!onStairs) {
            state.stairsPromptDismissed = false;
        }
        ui.renderStairsPrompt(
            onStairs && !state.stairsPromptDismissed && !state.run.inventory_state?.pending_altar_reward,
            state
        );
        ui.setMobileDirectionPadVisible(state.mobilePadVisible);
    }

    function renderResult() {
        ui.showScreen('result');
        ui.renderResult(state.run, state.catalog);
        ui.renderLogs(state.logs, 'result-log');
    }

    async function reloadRunSnapshot() {
        const [floorRes, logsRes] = await Promise.all([
            api.getCurrentFloor(state.run.id, state.run.current_floor),
            api.getLogs(state.run.id)
        ]);
        if (floorRes.error) throw floorRes.error;
        if (logsRes.error) throw logsRes.error;
        state.floor = floorRes.data;
        state.logs = (logsRes.data || []).reverse();
    }

    async function bootstrap() {
        ui.setBusy(true);
        try {
            const data = await api.getBootstrap();
            Object.assign(state, data);
            syncSelectedCarryItems();

            if (state.run && state.run.status === '進行中') {
                renderGame();
            } else {
                renderStart();
            }
        } catch (error) {
            console.error(error);
            ui.setStatus(error.message || '読み込みに失敗しました。', 'danger');
        } finally {
            ui.setBusy(false);
        }
    }

    function showLatestTilePopup() {
        const latest = state.logs[state.logs.length - 1];
        if (!latest || !latest.payload?.tile_type || latest.step_no === state.lastPopupStep) return;
        if (latest.payload.tile_type === 'アイテム') {
            state.lastPopupStep = latest.step_no;
            const matchedItem = latest.payload.item_code
                ? (state.catalog || []).find((item) => item.code === latest.payload.item_code)
                : (state.catalog || []).find((item) => latest.message?.includes(item.name));
            ui.showItemAcquiredModal(matchedItem?.code || null, matchedItem?.name || null, latest.message);
            return;
        }
        if (['ショップ', '限定ショップ', '下り階段'].includes(latest.payload.tile_type)) {
            state.lastPopupStep = latest.step_no;
            return;
        }
        if (latest.payload.tile_type === '盗賊') {
            state.lastPopupStep = latest.step_no;
            return;
        }

        state.lastPopupStep = latest.step_no;
        ui.showTilePopup(latest.payload.tile_type, latest.message);
    }

    async function toggleCarry(itemCode) {
        const carryLimit = getCarryLimit();
        const index = state.selectedCarryItems.indexOf(itemCode);
        const shouldSet = index < 0;

        if (shouldSet && state.selectedCarryItems.length >= carryLimit) {
            ui.setStatus(`持ち込みは ${carryLimit} 個までです。`, 'danger');
            return;
        }

        ui.setBusy(true);
        try {
            const payload = await api.rpc('evd_set_stock_item_set', {
                p_item_code: itemCode,
                p_is_set: shouldSet
            });
            if (payload?.stocks) {
                state.stocks = payload.stocks;
            } else {
                state.stocks = (state.stocks || []).map((stock) => (
                    stock.item_code === itemCode ? { ...stock, is_set: shouldSet } : stock
                ));
            }
            syncSelectedCarryItems();
            ui.renderCarryList(state.stocks, state.selectedCarryItems);
        } catch (error) {
            console.error(error);
            ui.setStatus(error.message || '持ち込み設定の保存に失敗しました。', 'danger');
        } finally {
            ui.setBusy(false);
        }
    }

    async function startRun() {
        ui.setBusy(true);
        try {
            const payload = await api.rpc('evd_start_run', {
                p_carry_items: state.selectedCarryItems
            });
            hydratePayload(payload);
            await reloadRunSnapshot();
            ui.setStatus('欲望ダンジョンに足を踏み入れた。');
            renderGame();
        } catch (error) {
            console.error(error);
            ui.setStatus(error.message || 'ラン開始に失敗しました。', 'danger');
        } finally {
            ui.setBusy(false);
        }
    }

    function findDirectionByTarget(x, y) {
        const deltaX = x - state.run.current_x;
        const deltaY = y - state.run.current_y;
        return Object.entries(DIRECTIONS).find(([, dir]) => dir.x === deltaX && dir.y === deltaY)?.[0] || null;
    }

    async function moveTo(x, y) {
        if (state.run?.inventory_state?.pending_thief || state.run?.inventory_state?.pending_altar_reward) return;
        const direction = findDirectionByTarget(x, y);
        if (!direction) return;
        ui.hideTilePopup();
        ui.hideItemAcquiredModal();
        ui.setBusy(true);
        try {
            const payload = await api.rpc('evd_move', {
                p_run_id: state.run.id,
                p_direction: direction
            });
            hydratePayload(payload);
            await reloadRunSnapshot();
            state.stairsPromptDismissed = false;

            if (state.run.status === '進行中') {
                renderGame();
                showLatestTilePopup();
            } else {
                renderResult();
                showLatestTilePopup();
            }
        } catch (error) {
            console.error(error);
            ui.setStatus(error.message || '移動に失敗しました。', 'danger');
        } finally {
            ui.setBusy(false);
        }
    }

    async function moveByDirection(directionKey) {
        if (!state.run || state.run.status !== '進行中') return;
        if (state.run.inventory_state?.pending_thief || state.run.inventory_state?.pending_altar_reward) return;
        const dir = DIRECTIONS[directionKey];
        if (!dir) return;
        await moveTo(state.run.current_x + dir.x, state.run.current_y + dir.y);
    }

    async function useItem(itemCode) {
        ui.hideTilePopup();
        ui.hideItemAcquiredModal();
        ui.setBusy(true);
        try {
            const payload = await api.rpc('evd_use_item', {
                p_run_id: state.run.id,
                p_item_code: itemCode
            });
            hydratePayload(payload);
            await reloadRunSnapshot();
            if (state.run.status === '進行中') {
                renderGame();
            } else {
                renderResult();
            }
        } catch (error) {
            console.error(error);
            ui.setStatus(error.message || 'アイテム使用に失敗しました。', 'danger');
        } finally {
            ui.setBusy(false);
        }
    }

    async function resolveStairs(action) {
        ui.hideTilePopup();
        ui.hideItemAcquiredModal();
        ui.setBusy(true);
        try {
            const payload = await api.rpc('evd_resolve_stairs', {
                p_run_id: state.run.id,
                p_action: action
            });
            hydratePayload(payload);
            if (state.run.status === '進行中') {
                await reloadRunSnapshot();
                state.stairsPromptDismissed = false;
                renderGame();
            } else {
                await reloadRunSnapshot().catch(() => { });
                renderResult();
            }
        } catch (error) {
            console.error(error);
            ui.setStatus(error.message || '階段処理に失敗しました。', 'danger');
        } finally {
            ui.setBusy(false);
        }
    }

    async function claimAltarReward(itemCode) {
        ui.hideTilePopup();
        ui.hideItemAcquiredModal();
        ui.setBusy(true);
        try {
            const payload = await api.rpc('evd_claim_altar_reward', {
                p_run_id: state.run.id,
                p_item_code: itemCode
            });
            hydratePayload(payload);
            await reloadRunSnapshot();
            if (state.run.status === '進行中') {
                renderGame();
            } else {
                renderResult();
            }
        } catch (error) {
            console.error(error);
            ui.setStatus(error.message || '祭壇報酬の受け取りに失敗しました。', 'danger');
        } finally {
            ui.setBusy(false);
        }
    }

    async function resolveThief(action) {
        const pending = state.run?.inventory_state?.pending_thief || null;
        const itemCount = Object.values(state.run?.inventory_state?.items || {}).reduce((total, item) => (
            total + Math.max(Number(item?.quantity || 0), 0)
        ), 0);
        const ransom = Number(pending?.ransom || 0);
        const runCoins = Number(state.run?.run_coins || 0);

        if (action === 'item' && itemCount <= 0) {
            ui.showNoticePopup('盗賊', 'アイテムを持っていない', '⚠️');
            return;
        }
        if (action === 'coin' && runCoins < ransom) {
            ui.showNoticePopup('盗賊', '所持金が足りない', '⚠️');
            return;
        }

        ui.hideTilePopup();
        ui.hideItemAcquiredModal();
        ui.setBusy(true);
        try {
            const payload = await api.rpc('evd_resolve_thief', {
                p_run_id: state.run.id,
                p_action: action
            });
            hydratePayload(payload);
            await reloadRunSnapshot();
            if (state.run.status === '進行中') {
                renderGame();
            } else {
                renderResult();
            }
        } catch (error) {
            console.error(error);
            ui.setStatus(error.message || '盗賊イベントの解決に失敗しました。', 'danger');
        } finally {
            ui.setBusy(false);
        }
    }

    async function buyItem(itemCode) {
        ui.setBusy(true);
        try {
            const payload = await api.rpc('evd_shop_purchase', {
                p_run_id: state.run.id,
                p_item_code: itemCode
            });
            hydratePayload(payload);
            await reloadRunSnapshot();
            renderGame();
        } catch (error) {
            console.error(error);
            const message = String(error?.message || '');
            if (message.includes('コインが足りません')) {
                ui.showNoticePopup('行商人', '所持金が足りません。', '⚠️');
            }
            ui.setStatus(error.message || '購入に失敗しました。', 'danger');
        } finally {
            ui.setBusy(false);
        }
    }

    async function buyStock(itemCode) {
        ui.setBusy(true);
        try {
            const payload = await api.rpc('evd_buy_stock_item', {
                p_item_code: itemCode
            });

            state.profile = payload.profile || state.profile;
            state.stocks = payload.stocks || state.stocks;
            ui.setStatus(payload.message || '在庫を購入しました。');
            ui.showNoticePopup('入場前ショップ', payload.message || 'アイテムを購入しました。', '🛍️');
            renderStart();
        } catch (error) {
            console.error(error);
            ui.setStatus(error.message || '入場前ショップでの購入に失敗しました。', 'danger');
        } finally {
            ui.setBusy(false);
        }
    }

    async function skipShop() {
        ui.setBusy(true);
        try {
            const payload = await api.rpc('evd_shop_purchase', {
                p_run_id: state.run.id,
                p_item_code: null
            });
            hydratePayload(payload);
            await reloadRunSnapshot();
            renderGame();
        } catch (error) {
            console.error(error);
            ui.setStatus(error.message || 'ショップ処理に失敗しました。', 'danger');
        } finally {
            ui.setBusy(false);
        }
    }

    function bindKeyboard() {
        document.addEventListener('keydown', (event) => {
            if (!state.run || state.run.status !== '進行中') return;
            if (state.run.inventory_state?.pending_thief || state.run.inventory_state?.pending_altar_reward) return;
            const keyMap = {
                ArrowUp: 'up',
                ArrowDown: 'down',
                ArrowLeft: 'left',
                ArrowRight: 'right',
                w: 'up',
                W: 'up',
                s: 'down',
                S: 'down',
                a: 'left',
                A: 'left',
                d: 'right',
                D: 'right'
            };
            const direction = keyMap[event.key];
            if (!direction) return;
            event.preventDefault();
            const dir = DIRECTIONS[direction];
            moveTo(state.run.current_x + dir.x, state.run.current_y + dir.y);
        });
    }

    ui.bindCarrySelection(toggleCarry);
    ui.bindBoard(moveTo);
    ui.bindActions({
        onStartRun: startRun,
        onResumeRun: renderGame,
        onContinueExplore: () => {
            state.stairsPromptDismissed = true;
            ui.hideTilePopup();
            ui.renderStairsPrompt(false);
        },
        onResolveStairs: resolveStairs,
        onClaimAltarReward: claimAltarReward,
        onResolveThief: resolveThief,
        onUseItem: useItem,
        onBuyItem: buyItem,
        onBuyStock: buyStock,
        onSkipShop: skipShop,
        onToggleShopHeldItems: () => {
            const panel = document.getElementById('shop-held-panel');
            const button = document.getElementById('shop-held-toggle-btn');
            const offers = document.getElementById('shop-offers');
            const skip = document.getElementById('shop-skip-btn');
            const notice = document.querySelector('.shop-notice-line');
            if (!panel || !button || !offers || !skip || !notice) return;
            const showHeldOnly = panel.classList.contains('d-none');
            panel.classList.toggle('d-none', !showHeldOnly);
            offers.classList.toggle('d-none', showHeldOnly);
            skip.classList.toggle('d-none', showHeldOnly);
            notice.classList.toggle('d-none', showHeldOnly);
            button.textContent = showHeldOnly ? '買い物に戻る' : '所持アイテム';
        },
        onToggleThiefHeldItems: () => {
            const panel = document.getElementById('thief-held-panel');
            const button = document.getElementById('thief-held-toggle-btn');
            const choices = document.querySelector('#thief-modal .thief-choice-list');
            const warning = document.getElementById('thief-warning-text');
            if (!panel || !button) return;
            const showHeldOnly = panel.classList.contains('d-none');
            panel.classList.toggle('d-none', !showHeldOnly);
            if (choices) choices.classList.toggle('d-none', showHeldOnly);
            if (warning) warning.classList.toggle('d-none', showHeldOnly);
            button.textContent = showHeldOnly ? '選択に戻る' : '所持アイテム';
        },
        onToggleMobilePad: () => {
            state.mobilePadVisible = !state.mobilePadVisible;
            ui.setMobileDirectionPadVisible(state.mobilePadVisible);
        },
        onMobileMoveDir: moveByDirection,
        onClosePopup: () => ui.hideTilePopup(),
        onCloseItemModal: () => ui.hideItemAcquiredModal(),
        onRetry: () => {
            state.run = null;
            state.floor = null;
            state.logs = [];
            state.selectedCarryItems = [];
            state.lastPopupStep = null;
            state.stairsPromptDismissed = false;
            state.mobilePadVisible = false;
            ui.hideItemAcquiredModal();
            bootstrap();
        }
    });
    bindKeyboard();
    bootstrap();
})();

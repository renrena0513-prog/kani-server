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
        lastPopupStep: null
    };

    function hydratePayload(payload) {
        if (!payload) return;
        state.run = payload.run || state.run;
        state.floor = payload.floor || state.floor;
        state.logs = payload.logs || state.logs;
        if (payload.profile) state.profile = payload.profile;
    }

    function renderStart() {
        ui.showScreen('start');
        ui.renderCarryList(state.stocks, state.selectedCarryItems);
        ui.renderPrepShop(state.catalog, state.stocks, state.profile?.coins || 0);
        ui.setStatus('1000コインを支払い、持ち込み 2 個までで探索開始。');
        document.getElementById('entry-fee-label').textContent = '1000 コイン';
        document.getElementById('wallet-coins-label').textContent = new Intl.NumberFormat('ja-JP').format(state.profile?.coins || 0);
        document.getElementById('resume-run-btn').classList.add('d-none');
    }

    function renderGame() {
        if (!state.run || !state.floor) return;
        ui.showScreen('game');
        ui.renderHud(state);
        ui.renderInventory(state.run, state.catalog);
        ui.renderBoard(state);
        ui.renderShop(state);
        ui.renderLogs(state.logs);

        const pending = state.run.inventory_state?.pending_resolution;
        document.getElementById('stairs-panel').classList.toggle('d-none', pending?.type !== 'stairs');
    }

    function renderResult() {
        ui.showScreen('result');
        ui.renderResult(state.run);
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

        state.lastPopupStep = latest.step_no;
        ui.showTilePopup(latest.payload.tile_type, latest.message);
    }

    function toggleCarry(itemCode) {
        const index = state.selectedCarryItems.indexOf(itemCode);
        if (index >= 0) {
            state.selectedCarryItems.splice(index, 1);
        } else {
            if (state.selectedCarryItems.length >= CARRY_LIMIT) {
                ui.setStatus('持ち込みは 2 個までです。', 'danger');
                return;
            }
            state.selectedCarryItems.push(itemCode);
        }
        ui.renderCarryList(state.stocks, state.selectedCarryItems);
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
        const direction = findDirectionByTarget(x, y);
        if (!direction) return;
        ui.setBusy(true);
        try {
            const payload = await api.rpc('evd_move', {
                p_run_id: state.run.id,
                p_direction: direction
            });
            hydratePayload(payload);
            await reloadRunSnapshot();

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

    async function useItem(itemCode) {
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
        ui.setBusy(true);
        try {
            const payload = await api.rpc('evd_resolve_stairs', {
                p_run_id: state.run.id,
                p_action: action
            });
            hydratePayload(payload);
            if (state.run.status === '進行中') {
                await reloadRunSnapshot();
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
            const keyMap = {
                ArrowUp: 'up',
                ArrowDown: 'down',
                ArrowLeft: 'left',
                ArrowRight: 'right'
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
        onResolveStairs: resolveStairs,
        onUseItem: useItem,
        onBuyItem: buyItem,
        onBuyStock: buyStock,
        onSkipShop: skipShop,
        onClosePopup: () => ui.hideTilePopup(),
        onRetry: () => {
            state.run = null;
            state.floor = null;
            state.logs = [];
            state.selectedCarryItems = [];
            state.lastPopupStep = null;
            bootstrap();
        }
    });
    bindKeyboard();
    bootstrap();
})();

(function () {
    const { TILE_LABELS, MANUAL_ITEM_CODES } = window.DUNGEON_CONSTANTS;
    const ITEM_FALLBACK_EMOJI = {
        escape_rope: '🪢',
        bomb_radar: '📡',
        healing_potion: '🧪',
        stairs_search: '🧭',
        calamity_map: '🗺️',
        full_scan_map: '🛰️',
        abyss_ticket: '🕳️',
        holy_grail: '🏆',
        insurance_token: '🛡️',
        golden_contract: '📜',
        substitute_doll: '🪆'
    };
    const TILE_POPUP_META = {
        '空白': { icon: '🪨', title: '空白マス' },
        '小銭': { icon: '🪙', title: '小銭' },
        '宝箱': { icon: '📦', title: '宝箱' },
        '財宝箱': { icon: '💰', title: '財宝箱' },
        '秘宝箱': { icon: '📛', title: '秘宝箱' },
        '宝石箱': { icon: '💎', title: '宝石箱' },
        '祝福': { icon: '✨', title: '祝福' },
        '泉': { icon: '⛲', title: '泉' },
        '爆弾': { icon: '💣', title: '爆弾' },
        '大爆発': { icon: '☄️', title: '大爆発' },
        '罠': { icon: '🕳️', title: '罠' },
        '呪い': { icon: '🕸️', title: '呪い' },
        '盗賊': { icon: '🦹', title: '盗賊' },
        '落とし穴': { icon: '🌀', title: '落とし穴' },
        '転送罠': { icon: '🧭', title: '転送罠' },
        'ショップ': { icon: '🛒', title: 'ショップ' },
        '限定ショップ': { icon: '🏪', title: '限定ショップ' },
        '下り階段': { icon: '🪜', title: '下り階段' }
    };

    function formatNumber(value) {
        return new Intl.NumberFormat('ja-JP').format(Number(value || 0));
    }

    function formatLifeHearts(life, maxLife) {
        const safeMax = Math.max(0, Number(maxLife || 0));
        const safeLife = Math.max(0, Math.min(safeMax, Number(life || 0)));
        const filled = '❤'.repeat(safeLife);
        const empty = '♡'.repeat(Math.max(0, safeMax - safeLife));
        return `${filled}${empty}` || '♡';
    }

    function normalizeLifeMessage(message) {
        return String(message || '')
            .replace(/ライフを\s*(\d+)\s*失った/g, '❤を$1失った')
            .replace(/ライフを\s*(\d+)\s*回復した/g, '❤を$1回復した');
    }

    function playerAvatarUrl(user) {
        return user?.user_metadata?.avatar_url
            || user?.user_metadata?.picture
            || user?.user_metadata?.avatar
            || null;
    }

    function renderItemVisual(itemCode, itemName) {
        const emoji = ITEM_FALLBACK_EMOJI[itemCode] || '🎒';
        const src = `/event/dungeon/images/${itemCode}.png`;
        return `
            <span class="item-visual" aria-hidden="true">
                <img class="item-image" src="${src}" alt="${itemName || itemCode}" loading="lazy"
                     onerror="this.style.display='none'; if(this.nextElementSibling){ this.nextElementSibling.style.display='grid'; }">
                <span class="item-emoji-fallback">${emoji}</span>
            </span>
        `;
    }

    function el(id) {
        return document.getElementById(id);
    }

    function setText(id, value) {
        const node = el(id);
        if (node) node.textContent = value;
    }

    function setTexts(ids, value) {
        ids.forEach((id) => setText(id, value));
    }

    function setHtml(id, value) {
        const node = el(id);
        if (node) node.innerHTML = value;
    }

    function showScreen(screenName) {
        document.querySelectorAll('[data-screen]').forEach((node) => {
            node.classList.toggle('d-none', node.dataset.screen !== screenName);
        });
        const mobileLife = el('mobile-life-fixed');
        if (mobileLife) {
            mobileLife.classList.toggle('d-none', screenName !== 'game');
        }
        if (screenName !== 'game') {
            setMobileDirectionPadVisible(false);
            const shopModalEl = el('shop-modal');
            if (shopModalEl && window.bootstrap?.Modal) {
                window.bootstrap.Modal.getOrCreateInstance(shopModalEl).hide();
            }
        }
        if (screenName !== 'start') {
            const prepShopModalEl = el('prep-shop-modal');
            if (prepShopModalEl && window.bootstrap?.Modal) {
                window.bootstrap.Modal.getOrCreateInstance(prepShopModalEl).hide();
            }
        }
    }

    function renderCarryList(stocks, selectedItems) {
        const wrap = el('carry-items');
        if (!wrap) return;

        if (!stocks.length) {
            wrap.innerHTML = '<div class="dungeon-empty">持ち込み可能な在庫がありません。</div>';
            return;
        }

        wrap.innerHTML = stocks.map((stock) => {
            const item = stock.evd_item_catalog || {};
            const selected = selectedItems.includes(stock.item_code);
            const disabled = !item.carry_in_allowed;
            return `
                <button class="carry-item ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}" data-item-code="${stock.item_code}" ${disabled ? 'disabled' : ''}>
                    <div class="item-entry-head">
                        ${renderItemVisual(stock.item_code, item.name)}
                        <div>
                            <div class="carry-item-name">${item.name}</div>
                            <div class="carry-item-desc">${item.description || ''}</div>
                        </div>
                    </div>
                    <div class="carry-item-meta">在庫 ${formatNumber(stock.quantity)} / ${item.item_kind || '手動'}</div>
                </button>
            `;
        }).join('');
    }

    function renderPrepShop(catalog, stocks, walletCoins) {
        const wrap = el('prep-shop-list');
        if (!wrap) return;

        const stockMap = Object.fromEntries((stocks || []).map((stock) => [stock.item_code, stock.quantity]));
        const buyable = (catalog || []).filter((item) => ['通常', '両方'].includes(item.shop_pool));

        if (!buyable.length) {
            wrap.innerHTML = '<div class="dungeon-empty">購入できるアイテムがありません。</div>';
            return;
        }

        wrap.innerHTML = buyable.map((item) => {
            const disabled = Number(walletCoins || 0) < Number(item.base_price || 0);
            const stock = stockMap[item.code] || 0;
            return `
                <div class="prep-shop-card">
                    <div class="item-entry-head">
                        ${renderItemVisual(item.code, item.name)}
                        <div>
                            <div class="shop-offer-name">${item.name}</div>
                            <div class="shop-offer-desc">${item.description || ''}</div>
                        </div>
                        <div class="carry-item-meta">価格 ${formatNumber(item.base_price)} / 所持 ${formatNumber(stock)} / ${item.shop_pool}</div>
                    </div>
                    <button class="btn btn-sm dungeon-btn-primary" data-buy-stock="${item.code}" ${disabled ? 'disabled' : ''}>購入</button>
                </div>
            `;
        }).join('');
    }

    function renderHud(state) {
        const run = state.run;
        const profile = state.profile || {};
        if (!run) return;

        const mobileLife = el('mobile-life-fixed');
        if (mobileLife) {
            mobileLife.classList.toggle('d-none', run.status !== '進行中');
        }

        const lifeText = formatLifeHearts(run.life, run.max_life);
        setTexts(['hud-floor', 'mobile-hud-floor'], `${run.current_floor} / ${run.max_floors}`);
        setTexts(['hud-life', 'mobile-hud-life'], lifeText);
        setText('mobile-life-fixed', `LIFE ${lifeText}`);
        setTexts(['hud-run-coins', 'mobile-hud-run-coins'], formatNumber(run.run_coins));
        setTexts(['hud-secured-coins', 'mobile-hud-secured-coins'], formatNumber(run.secured_coins));
        setTexts(['hud-badges', 'mobile-hud-badges'], formatNumber(run.badges_gained));
        setTexts(['hud-gacha', 'mobile-hud-gacha'], formatNumber(run.gacha_tickets_gained));
        setTexts(['hud-mangan', 'mobile-hud-mangan'], formatNumber(run.mangan_tickets_gained));
        setTexts(['hud-negates', 'mobile-hud-negates'], formatNumber(run.substitute_negates_remaining));
        setTexts(['hud-wallet', 'mobile-hud-wallet'], formatNumber(profile.coins));
        setTexts(['hud-assets', 'mobile-hud-assets'], formatNumber(profile.total_assets));

        const flags = run.inventory_state?.flags || {};
        const bonusMap = run.inventory_state?.floor_bonus_preview || {};
        const nextBonus = bonusMap[String(Math.min(run.current_floor + 1, run.max_floors))] || 0;
        setTexts(['hud-next-bonus', 'mobile-hud-next-bonus'], `${formatNumber(nextBonus)} コイン`);
        setTexts(['hud-final-multiplier', 'mobile-hud-final-multiplier'], `x${Number(run.final_return_multiplier || 1).toFixed(1)}`);
        setText('run-status', run.status);
        setText('run-flags', [
            flags.insurance_active ? '保険札' : null,
            flags.golden_contract_active ? '黄金契約書' : null,
            flags.stairs_known ? '階段補足中' : null,
            flags.hazards_known ? '厄災可視化中' : null,
            flags.bombs_known ? '爆弾可視化中' : null
        ].filter(Boolean).join(' / ') || '特記事項なし');
    }

    function renderInventoryInto(wrap, run, catalog) {
        if (!wrap || !run) return;
        const items = run.inventory_state?.items || {};
        const catalogMap = Object.fromEntries((catalog || []).map((item) => [item.code, item]));
        const itemCodes = Object.keys(items).filter((code) => items[code]?.quantity > 0);

        if (!itemCodes.length) {
            wrap.innerHTML = '<div class="dungeon-empty">所持アイテムはありません。</div>';
            return;
        }

        wrap.innerHTML = itemCodes.map((code) => {
            const itemState = items[code];
            const item = catalogMap[code] || {};
            const usable = MANUAL_ITEM_CODES.includes(code);
            return `
                <div class="inventory-item">
                    <div class="item-entry-head">
                        ${renderItemVisual(code, item.name || code)}
                        <div>
                            <div class="inventory-item-name">${item.name || code}</div>
                            <div class="inventory-item-desc">${item.description || ''}</div>
                        </div>
                    </div>
                    <div class="inventory-item-actions">
                        <span class="inventory-qty">x${formatNumber(itemState.quantity)}</span>
                        ${usable ? `<button class="btn btn-sm dungeon-btn-secondary" data-use-item="${code}">使う</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderInventory(run, catalog) {
        renderInventoryInto(el('inventory-list'), run, catalog);
        renderInventoryInto(el('mobile-inventory-list'), run, catalog);
    }

    function renderBoard(state) {
        const board = el('dungeon-board');
        if (!board || !state.floor || !state.run) return;

        const grid = state.floor.grid || [];
        const flags = state.run.inventory_state?.flags || {};
        const currentX = state.run.current_x;
        const currentY = state.run.current_y;
        const avatarUrl = playerAvatarUrl(state.user);

        board.innerHTML = grid.map((row, y) => row.map((cell, x) => {
            const isPlayer = x === currentX && y === currentY;
            const isAdjacent = Math.abs(currentX - x) + Math.abs(currentY - y) === 1;
            const isMove = isAdjacent && state.run.status === '進行中';
            const classes = ['tile'];
            if (cell.revealed) classes.push('revealed');
            if (cell.visited) classes.push('visited');
            if (isPlayer) classes.push('player');
            if (cell.type === '下り階段' && (cell.revealed || flags.stairs_known)) classes.push('stairs');
            if ((cell.hint === 'bomb' && flags.bombs_known) || (cell.hint === 'hazard' && flags.hazards_known)) classes.push('hinted');
            if ((cell.type === 'ショップ' || cell.type === '限定ショップ') && cell.revealed) classes.push('shop');

            let content = '？';
            if (isPlayer) {
                content = avatarUrl
                    ? `<img class="player-avatar" src="${avatarUrl}" alt="player" loading="lazy" onerror="this.outerHTML='🧙';">`
                    : '🧙';
            } else if (cell.revealed) {
                content = TILE_LABELS[cell.type] || '・';
            } else if (flags.stairs_known && cell.type === '下り階段') {
                content = TILE_LABELS[cell.type];
            } else if (flags.bombs_known && cell.hint === 'bomb') {
                content = '⚠️';
            } else if (flags.hazards_known && cell.hint === 'hazard') {
                content = '☠️';
            }

            return `
                <button class="${classes.join(' ')}" data-x="${x}" data-y="${y}" ${isMove ? '' : 'disabled'}>
                    <span>${content}</span>
                </button>
            `;
        }).join('')).join('');
    }

    function renderShop(state) {
        const modalEl = el('shop-modal');
        if (!modalEl || !window.bootstrap?.Modal) return;
        const offers = state.run?.inventory_state?.pending_shop?.offers || [];
        const type = state.run?.inventory_state?.pending_shop?.shop_type;
        const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);

        if (!offers.length) {
            modal.hide();
            return;
        }

        setText('shop-title', type === '限定ショップ' ? '限定商人が現れた' : '行商人に出会った');
        setHtml('shop-offers', offers.map((offer) => `
            <button class="shop-offer" data-buy-item="${offer.code}">
                <div class="item-entry-head">
                    ${renderItemVisual(offer.code, offer.name)}
                    <div>
                        <div class="shop-offer-name">${offer.name}</div>
                        <div class="shop-offer-desc">${offer.description}</div>
                    </div>
                </div>
                <div class="shop-offer-price">${formatNumber(offer.price)} コイン</div>
            </button>
        `).join(''));
        if (!modalEl.classList.contains('show')) {
            modal.show();
        }
    }

    function renderLogs(logs, targetId = 'adventure-log') {
        const wrap = el(targetId);
        if (!wrap) return;
        if (!logs.length) {
            wrap.innerHTML = '<div class="dungeon-empty">冒険ログはまだありません。</div>';
            return;
        }
        wrap.innerHTML = logs.slice().reverse().map((log) => `
            <div class="log-line">
                <span class="log-time">${new Date(log.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</span>
                <span>${normalizeLifeMessage(log.message)}</span>
            </div>
        `).join('');
    }

    function renderResult(run) {
        if (!run) return;
        setText('result-status', run.status);
        setText('result-payout', `${formatNumber(run.result_payout)} コイン`);
        setText('result-secured', `${formatNumber(run.secured_coins)} コイン`);
        setText('result-badges', `${formatNumber(run.badges_gained)} 個`);
        setText('result-gacha', `${formatNumber(run.gacha_tickets_gained)} 枚`);
        setText('result-mangan', `${formatNumber(run.mangan_tickets_gained)} 枚`);
        setText('result-death-reason', run.death_reason || '生還');
    }

    function setBusy(isBusy) {
        document.querySelectorAll('[data-busy-disable]').forEach((node) => {
            node.disabled = !!isBusy;
        });
    }

    function setStatus(message, tone = 'normal') {
        const node = el('status-banner');
        if (!node) return;
        node.textContent = message;
        node.dataset.tone = tone;
    }

    function showTilePopup(tileType, message) {
        const overlay = el('tile-popup');
        if (!overlay) return;
        const meta = TILE_POPUP_META[tileType] || { icon: '❔', title: tileType || 'イベント' };
        setText('tile-popup-icon', meta.icon);
        setText('tile-popup-title', meta.title);
        setText('tile-popup-message', normalizeLifeMessage(message || ''));
        overlay.classList.add('show');
    }

    function hideTilePopup() {
        el('tile-popup')?.classList.remove('show');
    }

    function setMobileDirectionPadVisible(visible) {
        const pad = el('mobile-direction-pad');
        const toggle = el('mobile-arrow-toggle-btn');
        const isVisible = !!visible;
        if (pad) pad.classList.toggle('d-none', !isVisible);
        if (toggle) toggle.textContent = isVisible ? '矢印キーを非表示' : '矢印キー表示';
        document.body.classList.toggle('mobile-pad-open', isVisible);
    }

    function bindCarrySelection(onSelect) {
        const wrap = el('carry-items');
        if (!wrap) return;
        wrap.onclick = (event) => {
            const button = event.target.closest('[data-item-code]');
            if (!button || button.disabled) return;
            onSelect(button.dataset.itemCode);
        };
    }

    function bindBoard(onMove) {
        const board = el('dungeon-board');
        if (!board) return;
        board.onclick = (event) => {
            const tile = event.target.closest('[data-x][data-y]');
            if (!tile || tile.disabled) return;
            onMove(Number(tile.dataset.x), Number(tile.dataset.y));
        };
    }

    function bindActions(handlers) {
        document.body.addEventListener('click', (event) => {
            const useItem = event.target.closest('[data-use-item]');
            if (useItem) handlers.onUseItem(useItem.dataset.useItem);

            const buyItem = event.target.closest('[data-buy-item]');
            if (buyItem) handlers.onBuyItem(buyItem.dataset.buyItem);

            const buyStock = event.target.closest('[data-buy-stock]');
            if (buyStock) handlers.onBuyStock(buyStock.dataset.buyStock);
        });

        el('start-run-btn')?.addEventListener('click', handlers.onStartRun);
        el('resume-run-btn')?.addEventListener('click', handlers.onResumeRun);
        el('stairs-continue-btn')?.addEventListener('click', handlers.onContinueExplore);
        el('stairs-descend-btn')?.addEventListener('click', () => handlers.onResolveStairs('descend'));
        el('stairs-return-btn')?.addEventListener('click', () => handlers.onResolveStairs('return'));
        el('shop-skip-btn')?.addEventListener('click', handlers.onSkipShop);
        el('retry-run-btn')?.addEventListener('click', handlers.onRetry);
        el('tile-popup-close')?.addEventListener('click', handlers.onClosePopup);
        el('mobile-arrow-toggle-btn')?.addEventListener('click', handlers.onToggleMobilePad);

        document.body.addEventListener('click', (event) => {
            const move = event.target.closest('[data-mobile-dir]');
            if (!move) return;
            handlers.onMobileMoveDir(move.dataset.mobileDir);
        });
    }

    window.DUNGEON_UI = {
        showScreen,
        renderCarryList,
        renderPrepShop,
        renderHud,
        renderInventory,
        renderBoard,
        renderShop,
        renderLogs,
        renderResult,
        setBusy,
        setStatus,
        showTilePopup,
        hideTilePopup,
        setMobileDirectionPadVisible,
        bindCarrySelection,
        bindBoard,
        bindActions
    };
})();

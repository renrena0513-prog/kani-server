(function () {
    const { TILE_LABELS, MANUAL_ITEM_CODES } = window.DUNGEON_CONSTANTS;
    const ITEM_FALLBACK_EMOJI = {
        calamity_map: '🗺️',
        full_scan_map: '🛰️',
        abyss_ticket: '🕳️',
        holy_grail: '🏆',
        golden_contract: '📜',
        substitute_doll: '🪆',
        giant_cup: '🏆',
        greedy_bag: '🎒',
        vault_box: '📜',
        golden_return: '🌟',
        escape_talisman: '🏃',
        doom_eye: '👁️',
        collector_coffin: '⚰️',
        underworld_wallet: '👛',
        merchant_seal: '🪙'
    };

    const TILE_POPUP_META = {
        '空白': { icon: '▫️', title: '空白マス' },
        '小銭': { icon: '🪙', title: '小銭' },
        '宝箱': { icon: '🧰', title: '宝箱' },
        '財宝箱': { icon: '💰', title: '財宝箱' },
        '秘宝箱': { icon: '🗝️', title: '秘宝箱' },
        '宝石箱': { icon: '💎', title: '宝石箱' },
        'アイテム': { icon: '🎁', title: 'アイテム' },
        '祝福': { icon: '✨', title: '祝福' },
        '泉': { icon: '⛲', title: '泉' },
        '爆弾': { icon: '💣', title: '爆弾' },
        '大爆発': { icon: '💥', title: '大爆発' },
        '罠': { icon: '⚠️', title: '罠' },
        '呪い': { icon: '☠️', title: '呪い' },
        '盗賊': { icon: '🥷', title: '盗賊' },
        '落とし穴': { icon: '🕳️', title: '落とし穴' },
        '転送罠': { icon: '🌀', title: '転送罠' },
        'ショップ': { icon: '🛒', title: 'ショップ' },
        '限定ショップ': { icon: '🏬', title: '限定ショップ' },
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

    function normalizeRarity(value) {
        if (value === 'レア' || value === 'エピック' || value === 'レジェンド') return value;
        return 'ノーマル';
    }

    function rarityClass(item) {
        const rarity = normalizeRarity(item?.rarity);
        return {
            'ノーマル': 'item-rarity-normal',
            'レア': 'item-rarity-rare',
            'エピック': 'item-rarity-epic',
            'レジェンド': 'item-rarity-legend'
        }[rarity];
    }

    function displayItemKind(item) {
        if (item?.shop_pool === 'レリック' || item?.item_kind === '永続') return '';
        return item?.item_kind || '手動';
    }

    function stockQuantity(stocks, itemCode) {
        return Number((stocks || []).find((stock) => stock.item_code === itemCode)?.quantity || 0);
    }

    function merchantDiscountRate(stocks) {
        return Math.min(stockQuantity(stocks, 'merchant_seal'), 4) * 0.05;
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
        document.body.dataset.dungeonScreen = screenName;
        document.querySelectorAll('[data-screen]').forEach((node) => {
            node.classList.toggle('d-none', node.dataset.screen !== screenName);
        });
        const mobileLife = el('mobile-life-fixed');
        if (mobileLife) {
            mobileLife.classList.toggle('d-none', screenName !== 'game');
        }
        if (screenName !== 'game') {
            setMobileDirectionPadVisible(false);
            hideItemAcquiredModal();
            const shopModalEl = el('shop-modal');
            if (shopModalEl && window.bootstrap?.Modal) {
                window.bootstrap.Modal.getOrCreateInstance(shopModalEl).hide();
            }
            const stairsModalEl = el('stairs-modal');
            if (stairsModalEl && window.bootstrap?.Modal) {
                window.bootstrap.Modal.getOrCreateInstance(stairsModalEl).hide();
            }
            const thiefModalEl = el('thief-modal');
            if (thiefModalEl && window.bootstrap?.Modal) {
                window.bootstrap.Modal.getOrCreateInstance(thiefModalEl).hide();
            }
            const altarModalEl = el('altar-reward-modal');
            if (altarModalEl && window.bootstrap?.Modal) {
                window.bootstrap.Modal.getOrCreateInstance(altarModalEl).hide();
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
        const carryWrap = el('carry-items');
        const relicWrap = el('relic-items');
        if (!carryWrap || !relicWrap) return;

        const renderStocks = (target, stockList, emptyMessage, { selectable = true } = {}) => {
            if (!stockList.length) {
                target.innerHTML = `<div class="dungeon-empty">${emptyMessage}</div>`;
                return;
            }

            target.innerHTML = stockList.map((stock) => {
                const item = stock.evd_item_catalog || {};
                const selected = selectedItems.includes(stock.item_code);
                const disabled = selectable && !item.carry_in_allowed;
                const itemCodeAttr = selectable ? `data-item-code="${stock.item_code}"` : '';
                return `
                    <button class="carry-item ${rarityClass(item)} ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''} ${selectable ? '' : 'carry-item-static'}" type="button" ${itemCodeAttr} ${disabled ? 'disabled' : ''}>
                        <div class="carry-item-layout">
                            ${renderItemVisual(stock.item_code, item.name)}
                            <div class="carry-item-body">
                                <div class="carry-item-head">
                                    <div class="carry-item-name">${item.name}</div>
                                    ${selected ? '<span class="carry-selected-badge">選択中</span>' : ''}
                                </div>
                                <div class="carry-item-desc">${item.description || ''}</div>
                                <div class="carry-item-meta">在庫 ${formatNumber(stock.quantity)} / ${item.item_kind || '手動'}</div>
                            </div>
                        </div>
                    </button>
                `;
            }).join('');
        };

        const regularStocks = (stocks || []).filter((stock) => {
            const item = stock.evd_item_catalog || {};
            return item.shop_pool !== 'レリック' && item.carry_in_allowed;
        });
        const relicStocks = (stocks || []).filter((stock) => stock.evd_item_catalog?.shop_pool === 'レリック');

        renderStocks(carryWrap, regularStocks, '持ち込み可能な在庫がありません。');
        renderStocks(relicWrap, relicStocks, '所持レリックはありません。', { selectable: false });
    }

    function renderPrepShop(catalog, stocks, walletCoins) {
        const wrap = el('prep-shop-list');
        if (!wrap) return;

        const stockMap = Object.fromEntries((stocks || []).map((stock) => [stock.item_code, stock.quantity]));
        const buyable = (catalog || []).filter((item) => ['通常', '両方'].includes(item.shop_pool));
        const discountRate = merchantDiscountRate(stocks);

        if (!buyable.length) {
            wrap.innerHTML = '<div class="dungeon-empty">購入できるアイテムがありません。</div>';
            return;
        }

        wrap.innerHTML = buyable.map((item) => {
            const price = Math.floor(Number(item.base_price || 0) * Math.max(0, 1 - discountRate));
            const disabled = Number(walletCoins || 0) < price;
            const stock = stockMap[item.code] || 0;
            return `
                <div class="prep-shop-card ${rarityClass(item)}">
                    <div class="item-entry-head">
                        ${renderItemVisual(item.code, item.name)}
                        <div>
                            <div class="shop-offer-name">${item.name}</div>
                            <div class="shop-offer-desc">${item.description || ''}</div>
                            <div class="carry-item-meta">価格 ${formatNumber(price)} / 所持 ${formatNumber(stock)} / ${item.shop_pool}</div>
                        </div>
                    </div>
                    <button class="dungeon-btn-primary prep-shop-buy-btn" data-buy-stock="${item.code}" ${disabled ? 'disabled' : ''}>購入</button>
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
        setTexts(['hud-gacha', 'mobile-hud-gacha'], formatNumber(run.gacha_tickets_gained));
        setTexts(['hud-mangan', 'mobile-hud-mangan'], formatNumber(run.mangan_tickets_gained));
        setTexts(['hud-wallet', 'mobile-hud-wallet'], formatNumber(profile.coins));

        const flags = run.inventory_state?.flags || {};
        const nextBonus = Number(run.next_floor_bonus || 0);
        const returnMultiplier = Number(run.final_return_multiplier || 1)
            * (flags.golden_contract_active ? 2 : 1);
        setTexts(['hud-next-bonus', 'mobile-hud-next-bonus'], `${formatNumber(nextBonus)} コイン`);
        setTexts(['hud-final-multiplier', 'mobile-hud-final-multiplier'], `x${returnMultiplier.toFixed(2)}`);
    }

    function buildInventoryEntries(state) {
        const run = state?.run;
        const catalog = state?.catalog || [];
        const floor = state?.floor || null;
        const stocks = state?.stocks || [];
        if (!run) return { entries: new Map(), bombCount: 0, catalogMap: {} };
        const items = run.inventory_state?.items || {};
        const carriedItems = run.inventory_state?.carried_items || {};
        const catalogMap = Object.fromEntries((catalog || []).map((item) => [item.code, item]));
        const bombCount = (floor?.grid || []).reduce((total, row) => total + (row || []).filter((cell) => (
            cell?.type === '爆弾' || cell?.type === '大爆発'
        )).length, 0);
        const inventoryEntries = new Map();

        Object.entries(items).forEach(([code, itemState]) => {
            const quantity = Number(itemState?.quantity || 0);
            if (code === 'substitute_doll' && Number(run.substitute_negates_remaining || 0) <= 0) return;
            if (quantity <= 0) return;
            inventoryEntries.set(code, { code, quantity, source: 'items' });
        });

        Object.entries(carriedItems).forEach(([code, itemState]) => {
            const quantity = Number(itemState?.quantity || 0);
            const item = catalogMap[code] || {};
            if (code === 'substitute_doll' && Number(run.substitute_negates_remaining || 0) <= 0) return;
            if (quantity <= 0) return;
            if (inventoryEntries.has(code)) {
                const current = inventoryEntries.get(code);
                inventoryEntries.set(code, { ...current, quantity: Math.max(current.quantity, quantity) });
                return;
            }
            inventoryEntries.set(code, { code, quantity, source: 'carried' });
            if (item.shop_pool === 'レリック') {
                inventoryEntries.set(code, { code, quantity, source: 'relic' });
            }
        });

        (stocks || []).forEach((stock) => {
            const item = stock.evd_item_catalog || catalogMap[stock.item_code] || {};
            if (item.shop_pool !== 'レリック' || Number(stock.quantity || 0) <= 0) return;
            if (!inventoryEntries.has(stock.item_code)) {
                inventoryEntries.set(stock.item_code, { code: stock.item_code, quantity: Number(stock.quantity || 0), source: 'relic' });
            }
        });

        if (Number(run.substitute_negates_remaining || 0) > 0 && !inventoryEntries.has('substitute_doll')) {
            inventoryEntries.set('substitute_doll', {
                code: 'substitute_doll',
                quantity: Number(run.substitute_negates_remaining || 0),
                source: 'carried'
            });
        }

        return { entries: inventoryEntries, bombCount, catalogMap };
    }

    function renderInventoryInto(wrap, state, { relicOnly = false } = {}) {
        const run = state?.run;
        if (!wrap || !run) return;
        const { entries, bombCount, catalogMap } = buildInventoryEntries(state);

        const itemCodes = Array.from(entries.keys()).filter((code) => {
            const item = catalogMap[code] || {};
            const isRelic = item.shop_pool === 'レリック' || item.item_kind === '永続';
            return relicOnly ? isRelic : !isRelic;
        });
        if (!itemCodes.length) {
            wrap.innerHTML = `<div class="dungeon-empty">${relicOnly ? '所持レリックはありません。' : '所持アイテムはありません。'}</div>`;
            return;
        }

        wrap.innerHTML = itemCodes.map((code) => {
            const entry = entries.get(code) || { quantity: 0 };
            const item = catalogMap[code] || {};
            const usable = MANUAL_ITEM_CODES.includes(code) && entry.source !== 'relic';
            let description = item.description || '';
            if (code === 'substitute_doll') {
                description = `マイナス効果をあと ${formatNumber(run.substitute_negates_remaining)} 回まで無効化する。`;
            } else if (code === 'bomb_radar') {
                description = `この階層の爆弾は ${formatNumber(bombCount)} 個。`;
            } else if (code === 'doom_eye') {
                description = `破滅の魔眼が暴く。この階層の爆弾は ${formatNumber(bombCount)} 個。`;
            } else if (code === 'golden_return') {
                description = `持ち帰り倍率を底上げする。現在の効果量は +${Math.min(entry.quantity, 4) * 5}% 。`;
            } else if (code === 'underworld_wallet') {
                description = `死亡時のコイン持ち帰り率を上げる。現在の追加効果は ${Math.min(entry.quantity, 5) * 2}% 。`;
            } else if (code === 'merchant_seal') {
                description = `ショップ価格を下げる。現在の割引率は ${Math.min(entry.quantity, 4) * 5}% 。`;
            }
            return `
                <div class="inventory-item ${rarityClass(item)}">
                    <div class="item-entry-head">
                        ${renderItemVisual(code, item.name || code)}
                        <div>
                            <div class="inventory-item-name">${item.name || code}</div>
                            ${displayItemKind(item) ? `<div class="inventory-item-kind">${displayItemKind(item)}</div>` : ''}
                            <div class="inventory-item-desc">${description}</div>
                        </div>
                    </div>
                    <div class="inventory-item-actions">
                        <span class="inventory-qty">x${formatNumber(entry.quantity)}</span>
                        ${usable && !relicOnly ? `<button class="btn btn-sm dungeon-btn-secondary" data-use-item="${code}">使う</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderInventory(state) {
        renderInventoryInto(el('inventory-list'), state, { relicOnly: false });
        renderInventoryInto(el('mobile-inventory-list'), state, { relicOnly: false });
        renderInventoryInto(el('relic-inventory-list'), state, { relicOnly: true });
        renderInventoryInto(el('mobile-relic-inventory-list'), state, { relicOnly: true });
    }

    function renderResultInventory(state) {
        const run = state?.run;
        const catalog = state?.catalog || [];
        const stocks = state?.stocks || [];
        const wrap = el('result-inventory-list');
        if (!wrap || !run) return;

        const items = run.inventory_state?.items || {};
        const carriedItems = run.inventory_state?.carried_items || {};
        const catalogMap = Object.fromEntries((catalog || []).map((item) => [item.code, item]));
        const hasCollectorCoffin = (stocks || []).some((stock) => (
            stock.item_code === 'collector_coffin' && Number(stock.quantity || 0) > 0
        ));

        const resultEntries = new Map();
        const addResultEntry = (code, quantity) => {
            if (quantity <= 0) return;
            resultEntries.set(code, (resultEntries.get(code) || 0) + quantity);
        };

        Object.entries(items).forEach(([code, itemState]) => {
            const quantity = Number(itemState?.quantity || 0);
            const item = catalogMap[code] || {};
            if (quantity <= 0) return;

            if (run.status === '帰還') {
                if (['手動', '死亡時', '永続'].includes(item.item_kind)) {
                    addResultEntry(code, quantity);
                }
                return;
            }

            if (item.item_kind === '永続') {
                addResultEntry(code, quantity);
                return;
            }

            if (item.item_kind === '手動' && hasCollectorCoffin) {
                addResultEntry(code, quantity);
            }
        });

        Object.entries(carriedItems).forEach(([code, itemState]) => {
            const quantity = Number(itemState?.quantity || 0);
            const item = catalogMap[code] || {};
            if (quantity <= 0) return;

            if (run.status === '帰還') {
                if (['死亡時', '永続'].includes(item.item_kind)) {
                    addResultEntry(code, quantity);
                }
                return;
            }

            if (item.item_kind === '永続') {
                addResultEntry(code, quantity);
            }
        });

        const itemCodes = Array.from(resultEntries.keys());

        if (!itemCodes.length) {
            wrap.innerHTML = '<div class="dungeon-empty">持ち帰ったアイテムはありません。</div>';
            return;
        }

        wrap.innerHTML = itemCodes.map((code) => {
            const item = catalogMap[code] || {};
            const quantity = resultEntries.get(code) || 0;

            return `
                <div class="inventory-item ${rarityClass(item)}">
                    <div class="item-entry-head">
                        ${renderItemVisual(code, item.name || code)}
                        <div>
                            <div class="inventory-item-name">${item.name || code}</div>
                            <div class="inventory-item-desc">${item.description || ''}</div>
                        </div>
                    </div>
                    <div class="inventory-item-actions">
                        <span class="inventory-qty">x${formatNumber(quantity)}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderBoard(state) {
        const board = el('dungeon-board');
        if (!board || !state.floor || !state.run) return;

        const grid = state.floor.grid || [];
        const flags = state.run.inventory_state?.flags || {};
        const interactionLocked = !!state.run.inventory_state?.pending_shop
            || !!state.run.inventory_state?.pending_thief
            || !!state.run.inventory_state?.pending_altar_reward;
        const currentX = state.run.current_x;
        const currentY = state.run.current_y;
        const avatarUrl = playerAvatarUrl(state.user);

        board.innerHTML = grid.map((row, y) => row.map((cell, x) => {
            const isPlayer = x === currentX && y === currentY;
            const isAdjacent = Math.abs(currentX - x) + Math.abs(currentY - y) === 1;
            const isMove = isAdjacent && state.run.status === '進行中' && !interactionLocked;
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
        const banner = el('shop-event-banner');
        const latest = (state.logs || [])[state.logs.length - 1];
        const catalogMap = Object.fromEntries((state.catalog || []).map((item) => [item.code, item]));
        const items = state.run?.inventory_state?.items || {};
        const carriedItems = state.run?.inventory_state?.carried_items || {};
        const heldItemCodes = [...new Set([...Object.keys(items), ...Object.keys(carriedItems)])]
            .filter((code) => Math.max(
                Number(items[code]?.quantity || 0),
                Number(carriedItems[code]?.quantity || 0)
            ) > 0);

        if (!offers.length) {
            modal.hide();
            if (banner) {
                banner.classList.add('d-none');
                banner.textContent = '';
            }
            el('shop-held-panel')?.classList.add('d-none');
            el('shop-offers')?.classList.remove('d-none');
            el('shop-skip-btn')?.classList.remove('d-none');
            el('shop-notice-line')?.classList.remove('d-none');
            setText('shop-held-toggle-btn', '所持アイテム');
            setHtml('shop-held-items', '');
            return;
        }

        setText('shop-title', type === '限定ショップ' ? '限定商人が現れた' : '行商人に出会った');
        setText('shop-run-coins', formatNumber(state.run?.run_coins || 0));
        setText('shop-held-toggle-btn', '所持アイテム');
        el('shop-held-panel')?.classList.add('d-none');
        el('shop-offers')?.classList.remove('d-none');
        el('shop-skip-btn')?.classList.remove('d-none');
        el('shop-notice-line')?.classList.remove('d-none');
        if (banner) {
            if (latest?.payload?.tile_type && ['ショップ', '限定ショップ'].includes(latest.payload.tile_type) && latest?.message) {
                banner.textContent = latest.message;
                banner.classList.remove('d-none');
            } else {
                banner.classList.add('d-none');
                banner.textContent = '';
            }
        }
        setHtml('shop-held-items', heldItemCodes.length ? heldItemCodes.map((code) => {
            const item = catalogMap[code] || {};
            const quantity = Math.max(
                Number(items[code]?.quantity || 0),
                Number(carriedItems[code]?.quantity || 0)
            );
            return `
                <div class="inventory-item shop-held-item ${rarityClass(item)}">
                    <div class="item-entry-head">
                        ${renderItemVisual(code, item.name || code)}
                        <div>
                            <div class="inventory-item-name">${item.name || code}</div>
                            <div class="inventory-item-desc">${item.description || ''}</div>
                        </div>
                    </div>
                    <div class="inventory-item-actions">
                        <span class="inventory-qty">x${formatNumber(quantity)}</span>
                    </div>
                </div>
            `;
        }).join('') : '<div class="dungeon-empty">手持ちアイテムはありません。</div>');
        setHtml('shop-offers', offers.map((offer) => `
            <button class="shop-offer ${rarityClass(offer)}" data-buy-item="${offer.code}">
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

    function renderStairsPrompt(visible, state = null) {
        const modalEl = el('stairs-modal');
        if (!modalEl || !window.bootstrap?.Modal) return;
        const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
        const isFinalFloor = Number(state?.run?.current_floor || 0) >= Number(state?.run?.max_floors || 0);

        setText('stairs-modal-title', isFinalFloor ? '深部の祭壇を見つけた' : '下り階段を見つけた');
        setText('stairs-modal-description', isFinalFloor
            ? 'ここが最深部だ。さらに先へは進めない。この階層の探索を続けるか、祭壇に祈りを捧げて帰還する。'
            : 'ここで探索続行、帰還、次の階への降下を選べます。続行後も階段を踏めば再度選択できます。');
        setText('stairs-return-btn', isFinalFloor ? '祭壇に祈りを捧げて帰還' : '戦利品を持って帰還');
        el('stairs-continue-btn')?.classList.remove('d-none');
        el('stairs-descend-btn')?.classList.toggle('d-none', isFinalFloor);

        if (visible) {
            if (!modalEl.classList.contains('show')) modal.show();
        } else {
            modal.hide();
        }
    }

    function renderAltarRewardPrompt(state) {
        const modalEl = el('altar-reward-modal');
        if (!modalEl || !window.bootstrap?.Modal) return;

        const pending = state?.run?.inventory_state?.pending_altar_reward || null;
        const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
        if (!pending?.offers?.length) {
            modal.hide();
            setHtml('altar-reward-offers', '');
            return;
        }

        setHtml('altar-reward-offers', pending.offers.map((offer) => `
            <button class="shop-offer ${rarityClass(offer)}" data-altar-reward="${offer.code}">
                <div class="item-entry-head">
                    ${renderItemVisual(offer.code, offer.name)}
                    <div>
                        <div class="shop-offer-name">${offer.name}</div>
                        <div class="shop-offer-desc">${offer.description || ''}</div>
                    </div>
                </div>
            </button>
        `).join(''));

        if (!modalEl.classList.contains('show')) {
            modal.show();
        }
    }

    function renderThiefPrompt(state) {
        const modalEl = el('thief-modal');
        if (!modalEl || !window.bootstrap?.Modal) return;

        const run = state?.run;
        const pending = run?.inventory_state?.pending_thief || null;
        const modal = window.bootstrap.Modal.getOrCreateInstance(modalEl);
        if (!pending) {
            modal.hide();
            el('thief-held-panel')?.classList.add('d-none');
            el('thief-modal')?.querySelector('.thief-choice-list')?.classList.remove('d-none');
            el('thief-warning-text')?.classList.remove('d-none');
            setText('thief-held-toggle-btn', '所持アイテム');
            setHtml('thief-held-items', '');
            return;
        }

        const ransom = Number(pending.ransom || 0);
        const itemCount = Object.values(run?.inventory_state?.items || {}).reduce((total, item) => (
            total + Math.max(Number(item?.quantity || 0), 0)
        ), 0);
        const currentCoins = Number(run?.run_coins || 0);
        const canGiveItem = itemCount > 0;
        const canPayCoin = currentCoins >= ransom;

        el('thief-held-panel')?.classList.add('d-none');
        el('thief-modal')?.querySelector('.thief-choice-list')?.classList.remove('d-none');
        el('thief-warning-text')?.classList.remove('d-none');
        setText('thief-held-toggle-btn', '所持アイテム');
        setText('thief-run-coins', formatNumber(currentCoins));
        setText('thief-item-note', canGiveItem
            ? '所持アイテムからランダムに 1 個奪われる。'
            : '差し出せるアイテムがない。');
        setText('thief-coin-title', `お金を ${formatNumber(ransom)} コイン差し出す`);
        setText('thief-coin-note', `${formatNumber(ransom)} コインを差し出す。現在 ${formatNumber(currentCoins)} コイン所持。`);
        setText('thief-warning-text', canGiveItem || canPayCoin
            ? '逃げるのは危険だ。慎重に選べ。'
            : '差し出せる物がない。逃げるしかない。');

        const itemBtn = el('thief-give-item-btn');
        const coinBtn = el('thief-pay-coin-btn');
        if (itemBtn) {
            itemBtn.classList.toggle('is-unavailable', !canGiveItem);
            itemBtn.dataset.available = canGiveItem ? 'true' : 'false';
        }
        if (coinBtn) {
            coinBtn.classList.toggle('is-unavailable', !canPayCoin);
            coinBtn.dataset.available = canPayCoin ? 'true' : 'false';
        }

        renderInventoryInto(el('thief-held-items'), state.run, state.catalog, state.floor);

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

    function renderResult(state) {
        const run = state?.run;
        const catalog = state?.catalog || [];
        if (!run) return;
        setText('result-status', run.status);
        setText('result-payout', `${formatNumber(run.result_payout)} コイン`);
        setText('result-badges', `${formatNumber(run.badges_gained)} 個`);
        setText('result-gacha', `${formatNumber(run.gacha_tickets_gained)} 枚`);
        setText('result-mangan', `${formatNumber(run.mangan_tickets_gained)} 枚`);
        setText('result-death-reason', run.death_reason || '生還');
        renderResultInventory(state);
    }

    function setBusy(isBusy) {
        document.querySelectorAll('[data-busy-disable]').forEach((node) => {
            node.disabled = !!isBusy;
        });
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

    function showNoticePopup(title, message, icon = '🔔') {
        const overlay = el('tile-popup');
        if (!overlay) return;
        setText('tile-popup-icon', icon);
        setText('tile-popup-title', title || 'お知らせ');
        setText('tile-popup-message', normalizeLifeMessage(message || ''));
        overlay.classList.add('show');
    }

    function hideTilePopup() {
        el('tile-popup')?.classList.remove('show');
    }

    function showItemAcquiredModal(itemCode, itemName, message, itemRarity = 'ノーマル') {
        const overlay = el('item-acquired-modal');
        const visual = el('item-acquired-visual');
        const card = overlay?.querySelector('.item-acquired-card');
        if (!overlay || !visual || !card) return;

        card.classList.remove('item-rarity-normal', 'item-rarity-rare', 'item-rarity-epic', 'item-rarity-legend');
        card.classList.add(rarityClass({ rarity: itemRarity }));

        setText('item-acquired-title', itemName ? `${itemName} を獲得` : 'アイテムを獲得');
        setText('item-acquired-message', normalizeLifeMessage(message || ''));
        visual.innerHTML = itemCode
            ? renderItemVisual(itemCode, itemName || itemCode)
            : '<span class="item-acquired-fallback">🎁</span>';
        overlay.classList.add('show');
        overlay.setAttribute('aria-hidden', 'false');
    }

    function hideItemAcquiredModal() {
        const overlay = el('item-acquired-modal');
        if (!overlay) return;
        overlay.classList.remove('show');
        overlay.setAttribute('aria-hidden', 'true');
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

            const altarReward = event.target.closest('[data-altar-reward]');
            if (altarReward) handlers.onClaimAltarReward(altarReward.dataset.altarReward);
        });

        el('start-run-btn')?.addEventListener('click', handlers.onStartRun);
        el('resume-run-btn')?.addEventListener('click', handlers.onResumeRun);
        el('stairs-continue-btn')?.addEventListener('click', handlers.onContinueExplore);
        el('stairs-descend-btn')?.addEventListener('click', () => handlers.onResolveStairs('descend'));
        el('stairs-return-btn')?.addEventListener('click', () => handlers.onResolveStairs('return'));
        el('thief-give-item-btn')?.addEventListener('click', () => handlers.onResolveThief('item'));
        el('thief-pay-coin-btn')?.addEventListener('click', () => handlers.onResolveThief('coin'));
        el('thief-run-btn')?.addEventListener('click', () => handlers.onResolveThief('escape'));
        el('thief-held-toggle-btn')?.addEventListener('click', handlers.onToggleThiefHeldItems);
        el('shop-skip-btn')?.addEventListener('click', handlers.onSkipShop);
        el('shop-held-toggle-btn')?.addEventListener('click', handlers.onToggleShopHeldItems);
        el('retry-run-btn')?.addEventListener('click', handlers.onRetry);
        el('tile-popup-close')?.addEventListener('click', handlers.onClosePopup);
        el('item-acquired-close')?.addEventListener('click', handlers.onCloseItemModal);
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
        renderStairsPrompt,
        renderAltarRewardPrompt,
        renderThiefPrompt,
        renderLogs,
        renderResult,
        setBusy,
        showTilePopup,
        showNoticePopup,
        hideTilePopup,
        showItemAcquiredModal,
        hideItemAcquiredModal,
        setMobileDirectionPadVisible,
        bindCarrySelection,
        bindBoard,
        bindActions
    };
})();

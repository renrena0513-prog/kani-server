// ======= マイページ用：所持バッジ在庫モーダル（ショップUI流用） =======
let inventoryMode = 'sell'; // 'sell' or 'transfer'
let currentShopActionUUID = null;
let allInventoryBadges = [];
let currentInventoryPage = 1;
const INVENTORY_ITEMS_PER_PAGE = 10;
let expandedBadgeId = null;

function openInventoryModalFor(mode) {
    if (typeof isViewMode !== 'undefined' && isViewMode) return;
    inventoryMode = mode === 'transfer' ? 'transfer' : 'sell';

    const title = inventoryMode === 'transfer' ? '🎁 譲渡するバッジ' : '💸 売却するバッジ';
    const hint = inventoryMode === 'transfer'
        ? '※ ここから直接譲渡できます。'
        : '※ ここから直接売却できます。';

    const titleEl = document.getElementById('inventoryModalLabel');
    if (titleEl) titleEl.textContent = title;
    const hintEl = document.getElementById('inventory-hint');
    if (hintEl) hintEl.textContent = hint;

    const modal = new bootstrap.Modal(document.getElementById('inventoryModal'));
    modal.show();
    loadInventory();
}

async function loadInventory() {
    const listEl = document.getElementById('inventory-list');
    if (listEl) listEl.innerHTML = '<div class="text-center py-4 text-muted">読み込み中...</div>';

    try {
        const { data: myBadges, error } = await supabaseClient
            .from('user_badges_new')
            .select('*, badges(*)')
            .eq('user_id', targetId)
            .order('acquired_at', { ascending: false });

        if (error) throw error;

        const { data: thresholds } = await supabaseClient
            .from('rarity_thresholds')
            .select('*')
            .order('threshold_value', { ascending: true });

        const badgeIds = [...new Set((myBadges || []).map(ub => ub.badge_id))];
        const marketCounts = {};

        if (badgeIds.length > 0) {
            const { data: allOwned } = await supabaseClient.from('user_badges_new').select('badge_id');
            if (allOwned) {
                allOwned.forEach(o => {
                    marketCounts[o.badge_id] = (marketCounts[o.badge_id] || 0) + 1;
                });
            }
        }

        const creatorIds = [...new Set((myBadges || []).map(ub => ub.badges?.discord_user_id).filter(Boolean))];
        const creatorMap = new Map();
        if (creatorIds.length > 0) {
            const { data: creators } = await supabaseClient
                .from('profiles')
                .select('discord_user_id, account_name, avatar_url')
                .in('discord_user_id', creatorIds);
            (creators || []).forEach(c => creatorMap.set(c.discord_user_id, {
                name: c.account_name || c.discord_user_id,
                avatar: c.avatar_url || ''
            }));
        }

        allInventoryBadges = (myBadges || []).map(inventoryItem => {
            const badge = inventoryItem.badges;
            if (!badge) return null;

            // 限定品は対象外
            if (badge.sales_type === '限定品') return null;
            // 譲渡の場合は換金品も対象外
            if (inventoryMode === 'transfer' && badge.sales_type === '換金品') return null;

            const count = marketCounts[badge.id] || 1;
            const circulationCount = marketCounts[badge.id] || 0;
            const valResult = BadgeUtils.calculateBadgeValues(badge, count, thresholds || []);
            const sellPrice = valResult.sellPrice * (inventoryItem.is_mutant ? 3 : 1);
            const sellStar = Math.max((valResult.starLevel || 1) - 2, 1);
            const sellRarity = thresholds?.[sellStar - 1]?.rarity_name || valResult.rarityName || '';
            const creatorInfo = creatorMap.get(badge.discord_user_id) || { name: '不明', avatar: '' };
            const isConvertible = badge.sales_type === '換金品';
            const marketValue = isConvertible ? badge.price : valResult.marketValue;
            const sellValue = isConvertible ? badge.price : sellPrice;
            const displayRarity = isConvertible ? '' : valResult.rarityName;
            const displaySellRarity = isConvertible ? '' : sellRarity;

            return {
                ...inventoryItem,
                badge_name: badge.name,
                badge_image_url: badge.image_url,
                rarity_name: displayRarity,
                sell_rarity_name: displaySellRarity,
                price: badge.price,
                fixed_rarity_name: badge.fixed_rarity_name,
                sales_type: badge.sales_type,
                is_gacha_eligible: badge.is_gacha_eligible,
                market_value: marketValue,
                sell_price: sellValue,
                purchased_price: inventoryItem.purchased_price,
                creator_name: creatorInfo.name,
                creator_avatar: creatorInfo.avatar,
                market_count: circulationCount,
                acquired_at: new Date(inventoryItem.acquired_at)
            };
        }).filter(Boolean);

        filterAndRenderInventoryBadges();
    } catch (err) {
        console.error('Error loading inventory:', err);
        if (listEl) listEl.innerHTML = '<div class="text-center py-4 text-danger">読み込みエラーが発生しました</div>';
    }
}

function filterAndRenderInventoryBadges() {
    const listEl = document.getElementById('inventory-list');
    const searchVal = document.getElementById('inventory-search')?.value.toLowerCase() || '';
    const sortVal = document.getElementById('inventory-sort')?.value || 'acquired_desc';
    const filterVal = document.getElementById('inventory-filter')?.value || 'all';

    let filtered = allInventoryBadges.filter(item => {
        if (searchVal && !item.badge_name.toLowerCase().includes(searchVal)) return false;

        switch (filterVal) {
            case 'fixed':
                return item.sales_type === '固定型';
            case 'variable':
                return item.sales_type === '変動型';
            case 'shrine':
                return item.is_gacha_eligible === true;
            case 'mutant':
                return item.is_mutant;
            case 'all':
            default:
                return true;
        }
    });

    filtered.sort((a, b) => {
        if (sortVal === 'acquired_desc') return b.acquired_at - a.acquired_at;
        if (sortVal === 'acquired_asc') return a.acquired_at - b.acquired_at;
        if (sortVal === 'name_asc') return a.badge_name.localeCompare(b.badge_name);
        if (sortVal === 'rarity_desc' || sortVal === 'rarity_asc') {
            const pA = a.market_value || 0;
            const pB = b.market_value || 0;
            return sortVal === 'rarity_desc' ? pB - pA : pA - pB;
        }
        return 0;
    });

    const groups = new Map();
    filtered.forEach(item => {
        if (!groups.has(item.badge_id)) {
            groups.set(item.badge_id, {
                badge_id: item.badge_id,
                badge_name: item.badge_name,
                badge_image_url: item.badge_image_url,
                items: []
            });
        }
        groups.get(item.badge_id).items.push(item);
    });

    const groupArray = Array.from(groups.values());
    const totalPages = Math.ceil(groupArray.length / INVENTORY_ITEMS_PER_PAGE);
    if (currentInventoryPage > totalPages && totalPages > 0) currentInventoryPage = totalPages;
    if (currentInventoryPage < 1) currentInventoryPage = 1;

    const start = (currentInventoryPage - 1) * INVENTORY_ITEMS_PER_PAGE;
    const end = start + INVENTORY_ITEMS_PER_PAGE;
    const pageGroups = groupArray.slice(start, end);

    if (!listEl) return;
    if (pageGroups.length === 0) {
        listEl.innerHTML = '<div class="text-center py-4 text-muted">該当するバッジがありません</div>';
        document.getElementById('inventory-pagination-area').style.display = 'none';
        return;
    }

    listEl.innerHTML = pageGroups.map(group => {
        const isExpanded = expandedBadgeId === group.badge_id;
        const totalCount = group.items.length;
        const mutantCount = group.items.filter(i => i.is_mutant).length;
        const repItem = group.items[0];

        let actionArea = '';
        let detailHtml = '';

        if (totalCount === 1) {
            const item = repItem;
            if (item.sales_type === '限定品') {
                actionArea = '<span class="badge bg-secondary text-nowrap">対象外</span>';
            } else if (item.sales_type === '換金品' && inventoryMode === 'sell') {
                actionArea = `<button class="btn btn-sm btn-outline-success rounded-pill text-nowrap" onclick="confirmSellFromMyPage('${item.uuid}')">換金</button>`;
            } else {
                const btnLabel = inventoryMode === 'transfer' ? '譲渡' : '売却';
                const btnClass = inventoryMode === 'transfer' ? 'btn-outline-primary' : 'btn-outline-danger';
                const handler = inventoryMode === 'transfer' ? `startTransferFromMyPage('${item.uuid}')` : `confirmSellFromMyPage('${item.uuid}')`;
                actionArea = `<button class="btn btn-sm ${btnClass} rounded-pill text-nowrap" onclick="${handler}">${btnLabel}</button>`;
            }
        } else {
            actionArea = `<button class="btn btn-sm ${isExpanded ? 'btn-secondary' : 'btn-primary'} rounded-pill text-nowrap" onclick="toggleInventoryExpand('${group.badge_id}')">${isExpanded ? '閉じる' : '選択'}</button>`;

            if (isExpanded) {
                const listItemsHtml = group.items.map(item => {
                    if (item.sales_type === '限定品') return '';
                    if (inventoryMode === 'transfer' && item.sales_type === '換金品') return '';

                    const isMutant = item.is_mutant;
                    let imgHtml = '';
                    if (isMutant) {
                        imgHtml = `
                            <div class="mutant-badge-container mini active me-3" style="width: 40px; height: 40px;">
                                ${window.MutantBadge ? window.MutantBadge.renderShine(true) : '<div class="mutant-badge-shine"></div>'}
                                <img src="${group.badge_image_url}" class="w-100 h-100 object-fit-contain">
                            </div>
                        `;
                    } else {
                        imgHtml = `<img src="${group.badge_image_url}" class="rounded me-3" style="width: 40px; height: 40px; object-fit: contain;">`;
                    }

                    const pPrice = item.purchased_price || 0;
                    const sPrice = item.sell_price;

                    const btnLabel = inventoryMode === 'transfer' ? '譲渡' : '売却';
                    const btnClass = inventoryMode === 'transfer' ? 'btn-outline-primary' : 'btn-outline-danger';
                    const handler = inventoryMode === 'transfer' ? `startTransferFromMyPage('${item.uuid}')` : `confirmSellFromMyPage('${item.uuid}')`;

                    return `
                        <div class="d-flex align-items-center justify-content-between p-2 rounded bg-white" style="border: 1px solid #eee;">
                            <div class="d-flex align-items-center overflow-hidden">
                                ${imgHtml}
                                <div class="small">
                                    <div class="text-muted">購入: 🪙${pPrice.toLocaleString()}</div>
                                    <div class="text-danger fw-bold">売却: 🪙${Math.floor(sPrice).toLocaleString()}</div>
                                </div>
                            </div>
                            <button class="btn btn-sm ${btnClass} rounded-pill ms-2 text-nowrap" style="font-size: 0.8rem; flex-shrink: 0;" onclick="${handler}">${btnLabel}</button>
                        </div>
                    `;
                }).join('');

                detailHtml = `
                    <div class="mt-3 border-top pt-2">
                        <div class="small fw-bold text-muted mb-2">所持リスト (${totalCount}個)</div>
                        <div class="vstack gap-2">
                            ${listItemsHtml}
                        </div>
                    </div>
                `;
            }
        }

        const rarityClass = getRarityClass(repItem.rarity_name || '');

        return `
            <div class="p-2 rounded shadow-sm bg-white border mb-2">
                <div class="d-flex align-items-center">
                    <div style="width: 50px; height: 50px; flex-shrink: 0;" class="me-3">
                         <img src="${group.badge_image_url}" class="w-100 h-100 object-fit-contain rounded">
                    </div>
                    <div class="flex-grow-1" style="min-width: 0; margin-right: 10px;">
                        <div class="fw-bold text-truncate">${group.badge_name}</div>
                        <div class="small text-muted d-flex align-items-center flex-wrap gap-2">
                            <span class="badge ${rarityClass || 'bg-light text-dark border'}">${repItem.rarity_name || '-'}</span>
                            <div>所持: <span class="fw-bold text-dark">${totalCount}</span>個</div>
                            ${mutantCount > 0 ? `<span class="badge bg-warning text-dark">内ミュータント: ${mutantCount}</span>` : ''}
                        </div>
                    </div>
                    <div style="flex-shrink: 0;">
                         ${actionArea}
                    </div>
                </div>
                ${detailHtml}
            </div>
        `;
    }).join('');

    renderInventoryPagination(totalPages);
}

function toggleInventoryExpand(badgeId) {
    expandedBadgeId = expandedBadgeId === badgeId ? null : badgeId;
    filterAndRenderInventoryBadges();
}

function goToInventoryPage(page) {
    currentInventoryPage = page;
    filterAndRenderInventoryBadges();
}

function renderInventoryPagination(totalPages) {
    const nav = document.getElementById('inventory-pagination-area');
    const ul = document.getElementById('inventory-pagination');
    if (!nav || !ul) return;

    if (totalPages <= 1) {
        nav.style.display = 'none';
        return;
    }

    nav.style.display = 'block';
    let html = '';

    html += `<li class="page-item ${currentInventoryPage === 1 ? 'disabled' : ''}">
        <a class="page-link" href="javascript:void(0)" onclick="goToInventoryPage(${currentInventoryPage - 1})">‹</a></li>`;

    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentInventoryPage - 1 && i <= currentInventoryPage + 1)) {
            html += `<li class="page-item ${i === currentInventoryPage ? 'active' : ''}">
                <a class="page-link" href="javascript:void(0)" onclick="goToInventoryPage(${i})">${i}</a></li>`;
        } else if (i === currentInventoryPage - 2 || i === currentInventoryPage + 2) {
            html += `<li class="page-item disabled"><a class="page-link">...</a></li>`;
        }
    }

    html += `<li class="page-item ${currentInventoryPage === totalPages ? 'disabled' : ''}">
        <a class="page-link" href="javascript:void(0)" onclick="goToInventoryPage(${currentInventoryPage + 1})">›</a></li>`;

    ul.innerHTML = html;
}

function showShopActionModal(contentHtml, onConfirm, confirmLabel) {
    const content = document.getElementById('shopActionContent');
    const btnExec = document.getElementById('btnShopActionExec');
    if (content) content.innerHTML = contentHtml;
    if (btnExec) {
        btnExec.textContent = confirmLabel || '実行';
        btnExec.onclick = onConfirm;
    }
    new bootstrap.Modal(document.getElementById('shopActionModal')).show();
}

function confirmSellFromMyPage(uuid) {
    const item = allInventoryBadges.find(i => i.uuid === uuid);
    if (!item) return;

    const name = item.badge_name;
    const buyPrice = item.purchased_price || 0;
    const sellPrice = item.sell_price;
    const profit = sellPrice - buyPrice;
    const profitStr = (profit >= 0 ? '+' : '') + profit.toLocaleString();
    const rarityLabel = item.rarity_name || '';
    const sellRarityLabel = item.sell_rarity_name || rarityLabel;
    const creatorName = item.creator_name || '不明';
    const creatorAvatar = item.creator_avatar || '';
    const typeLabel = item.sales_type || '固定型';
    const circulation = item.market_count || 0;
    const isConvertible = item.sales_type === '換金品';
    const purchaseLabel = buyPrice <= 0 ? '無料' : `${rarityLabel}🪙${buyPrice.toLocaleString()}`;
    const assetLabel = isConvertible
        ? `🪙${(item.market_value || 0).toLocaleString()}`
        : `${rarityLabel}🪙${(item.market_value || 0).toLocaleString()}`;
    const sellLabel = isConvertible
        ? `🪙${sellPrice.toLocaleString()}`
        : `${sellRarityLabel}🪙${sellPrice.toLocaleString()}`;
    const creatorAvatarHtml = creatorAvatar
        ? `<img src="${creatorAvatar}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;">`
        : '';

    currentShopActionUUID = uuid;

    const content = `
        <h5 class="fw-bold mb-2">売却の確認</h5>
        <div class="fw-bold mb-1">${name}</div>
        <div class="text-muted mb-2 d-flex align-items-center justify-content-center gap-2">
            ${typeLabel}
            <span class="d-flex align-items-center gap-1">
                ${creatorAvatarHtml}
                <span>${creatorName}</span>
            </span>
        </div>
        <div class="text-muted mb-3">流通数：${circulation}枚</div>
        <div class="text-start small">
            <div>購入額：${purchaseLabel}</div>
            <div>資産価値：${assetLabel}</div>
            <div>売却額：${sellLabel}</div>
            <div class="fw-bold mt-2">損益：🪙${profitStr}</div>
        </div>
    `;

    showShopActionModal(content, executeSellFromMyPage, '売却する');
}

async function executeSellFromMyPage() {
    bootstrap.Modal.getInstance(document.getElementById('shopActionModal'))?.hide();
    toggleLoading(true);

    try {
        const { data, error } = await supabaseClient.rpc('sell_badge_v2', {
            p_user_id: targetId,
            p_badge_uuid: currentShopActionUUID
        });

        if (error) throw error;
        if (!data.ok) throw new Error(data.error);

        alert(`売却しました！ (🪙 +${data.sell_price.toLocaleString()})`);

        await loadOwnedBadges();
        await loadActivityLogs();
        await loadTargetUserInfo();
        await loadInventory();
    } catch (err) {
        alert('エラーが発生しました: ' + err.message);
    } finally {
        toggleLoading(false);
    }
}

function startTransferFromMyPage(uuid) {
    const item = allInventoryBadges.find(i => i.uuid === uuid);
    if (!item) return;

    currentActionUUID = uuid;
    currentActionBadgeName = item.badge_name;
    currentActionDetails = `所持価格: ${item.purchased_price || 0} / 売却参考: ${item.sell_price.toLocaleString()}`;

    const modalEl = document.getElementById('inventoryModal');
    bootstrap.Modal.getInstance(modalEl)?.hide();

    openUserSelectModal('badge_transfer');
}

function showBadgeTransferConfirm(toUserId, toUserName) {
    const item = allInventoryBadges.find(i => i.uuid === currentActionUUID);
    if (!item) return;

    const name = item.badge_name;
    const buyPrice = item.purchased_price || 0;
    const sellPrice = item.sell_price;
    const profit = sellPrice - buyPrice;
    const profitStr = (profit >= 0 ? '+' : '') + profit.toLocaleString();

    const content = `
        <h5 class="fw-bold mb-3">譲渡の確認</h5>
        <p class="mb-2">「<span class="fw-bold">${name}</span>」を</p>
        <p class="mb-2"><span class="fw-bold">${toUserName}</span>さんに譲渡しますか？</p>
        <div class="alert alert-secondary d-inline-block text-start py-2 px-4">
            <div>購入額: 🪙 ${buyPrice.toLocaleString()}</div>
            <div class="fw-bold text-danger border-top border-secondary pt-1 mt-1">売却参考: 🪙 ${sellPrice.toLocaleString()}</div>
            <div class="small text-end opacity-75 mt-1">損益: ${profitStr}</div>
        </div>
    `;

    showShopActionModal(content, () => executeBadgeTransfer(toUserId, toUserName), '譲渡する');
}

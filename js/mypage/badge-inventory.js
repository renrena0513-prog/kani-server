// ======= マイページ用：所持バッジ在庫モーダル（ショップUI流用） =======
let inventoryMode = 'sell'; // 'sell' or 'transfer'
let currentShopActionUUID = null;
let allInventoryBadges = [];
let currentInventoryPage = 1;
const INVENTORY_ITEMS_PER_PAGE = 10;
let expandedBadgeId = null;
let inventoryMutantOnly = false;
let inventoryRarityOrder = [];
const inventoryCreatorMap = new Map();
const inventoryFilters = {
    rarity: '',
    creator: '',
    type: '',
    label: '',
    tag: '',
    method: ''
};

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
        inventoryRarityOrder = getInventoryRarityOrder();

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
        inventoryCreatorMap.clear();
        if (creatorIds.length > 0) {
            const { data: creators } = await supabaseClient
                .from('profiles')
                .select('discord_user_id, account_name, avatar_url')
                .in('discord_user_id', creatorIds);
            (creators || []).forEach(c => inventoryCreatorMap.set(c.discord_user_id, {
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
            const creatorInfo = inventoryCreatorMap.get(badge.discord_user_id) || { name: '不明', avatar: '' };
            const isConvertible = badge.sales_type === '換金品';
            const marketValue = isConvertible ? badge.price : valResult.marketValue;
            const sellValue = isConvertible ? badge.price * (inventoryItem.is_mutant ? 3 : 1) : sellPrice;
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
                is_shop_listed: badge.is_shop_listed,
                label: badge.label,
                tags: badge.tags,
                sort_order: badge.sort_order,
                creator_id: badge.discord_user_id,
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
    const typeSelect = document.getElementById('inventory-type-filter');
    const labelSelect = document.getElementById('inventory-label-filter');
    const tagSelect = document.getElementById('inventory-tag-filter');
    const methodSelect = document.getElementById('inventory-method-filter');
    inventoryFilters.rarity = document.getElementById('inventory-rarity-filter')?.value || '';
    inventoryFilters.creator = document.getElementById('inventory-creator-filter')?.value || '';
    inventoryFilters.type = typeSelect?.value || '';
    inventoryFilters.label = labelSelect?.value || '';
    inventoryFilters.tag = tagSelect?.value || '';
    inventoryFilters.method = methodSelect?.value || '';
    updateInventoryDynamicFilterOptions(allInventoryBadges);

    let filtered = allInventoryBadges.filter(item => {
        if (searchVal && !item.badge_name.toLowerCase().includes(searchVal)) return false;
        if (inventoryFilters.method && !matchesInventoryMethod(item, inventoryFilters.method)) return false;
        if (inventoryFilters.rarity) {
            const r = getInventoryRarity(item);
            if (r !== inventoryFilters.rarity) return false;
        }
        if (inventoryFilters.creator && item.creator_id !== inventoryFilters.creator) return false;
        if (inventoryFilters.type && item.sales_type !== inventoryFilters.type) return false;
        if (inventoryFilters.label && (item.label || '').trim() !== inventoryFilters.label) return false;
        if (inventoryFilters.tag) {
            const tags = getInventoryBadgeTags(item);
            if (!tags.includes(inventoryFilters.tag)) return false;
        }
        if (inventoryMutantOnly && !item.is_mutant) return false;
        return true;
    });

    const groups = new Map();
    filtered.forEach(item => {
        if (!groups.has(item.badge_id)) {
            groups.set(item.badge_id, {
                badge_id: item.badge_id,
                badge_name: item.badge_name,
                badge_image_url: item.badge_image_url,
                latestAcquiredAt: item.acquired_at,
                repItem: item,
                items: []
            });
        }
        const group = groups.get(item.badge_id);
        group.items.push(item);
        if (item.acquired_at > group.latestAcquiredAt) {
            group.latestAcquiredAt = item.acquired_at;
            group.repItem = item;
        }
    });

    const groupArray = Array.from(groups.values());
    groupArray.sort((a, b) => {
        const aItem = a.repItem;
        const bItem = b.repItem;
        switch (sortVal) {
            case 'acquired_desc':
                return b.latestAcquiredAt - a.latestAcquiredAt;
            case 'acquired_asc':
                return a.latestAcquiredAt - b.latestAcquiredAt;
            case 'id_asc':
                return (Number(a.badge_id) || 0) - (Number(b.badge_id) || 0);
            case 'id_desc':
                return (Number(b.badge_id) || 0) - (Number(a.badge_id) || 0);
            case 'price_desc':
                return (Number(bItem.market_value) || 0) - (Number(aItem.market_value) || 0);
            case 'price_asc':
                return (Number(aItem.market_value) || 0) - (Number(bItem.market_value) || 0);
            case 'count_desc':
                return b.items.length - a.items.length;
            case 'count_asc':
                return a.items.length - b.items.length;
            case 'circulation_desc':
                return (Number(bItem.market_count) || 0) - (Number(aItem.market_count) || 0);
            case 'circulation_asc':
                return (Number(aItem.market_count) || 0) - (Number(bItem.market_count) || 0);
            case 'name':
                return (a.badge_name || '').localeCompare(b.badge_name || '');
            default:
                return 0;
        }
    });
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
        const repItem = group.repItem || group.items[0];

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
            if (inventoryMode === 'sell' && repItem.sales_type === '換金品') {
                actionArea = `
                    <div class="d-flex gap-2 flex-wrap">
                        <button class="btn btn-sm ${isExpanded ? 'btn-secondary' : 'btn-primary'} rounded-pill text-nowrap" onclick="toggleInventoryExpand('${group.badge_id}')">${isExpanded ? '閉じる' : '選択'}</button>
                        <button class="btn btn-sm btn-outline-success rounded-pill text-nowrap" onclick="confirmSellAllConvertibleFromMyPage('${group.badge_id}')">一括売却</button>
                    </div>
                `;
            } else {
                actionArea = `<button class="btn btn-sm ${isExpanded ? 'btn-secondary' : 'btn-primary'} rounded-pill text-nowrap" onclick="toggleInventoryExpand('${group.badge_id}')">${isExpanded ? '閉じる' : '選択'}</button>`;
            }

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

function toggleInventoryMutantFilter() {
    inventoryMutantOnly = !inventoryMutantOnly;
    const btn = document.getElementById('inventory-mutant-btn');
    if (btn) {
        if (inventoryMutantOnly) {
            btn.classList.add('active');
            btn.style.background = 'linear-gradient(135deg, var(--deep-purple), var(--soft-purple))';
            btn.style.color = 'white';
            btn.style.borderColor = 'transparent';
        } else {
            btn.classList.remove('active');
            btn.style.background = 'white';
            btn.style.color = '#333';
            btn.style.borderColor = '#dee2e6';
        }
    }
    currentInventoryPage = 1;
    filterAndRenderInventoryBadges();
}

function resetInventoryFilters() {
    const search = document.getElementById('inventory-search');
    const sort = document.getElementById('inventory-sort');
    const typeSelect = document.getElementById('inventory-type-filter');
    const labelSelect = document.getElementById('inventory-label-filter');
    const tagSelect = document.getElementById('inventory-tag-filter');
    const methodSelect = document.getElementById('inventory-method-filter');
    if (search) search.value = '';
    if (sort) sort.value = 'acquired_desc';
    if (typeSelect) typeSelect.value = '';
    if (labelSelect) labelSelect.value = '';
    if (tagSelect) tagSelect.value = '';
    if (methodSelect) methodSelect.value = '';
    setInventoryRarityFilter('', 'すべて');
    setInventoryCreatorFilter('', 'すべて', '');
    inventoryMutantOnly = false;
    const btn = document.getElementById('inventory-mutant-btn');
    if (btn) {
        btn.classList.remove('active');
        btn.style.background = 'white';
        btn.style.color = '#333';
        btn.style.borderColor = '#dee2e6';
    }
    currentInventoryPage = 1;
    filterAndRenderInventoryBadges();
}

function isValidAvatarUrl(url) {
    return typeof url === 'string' && /^https?:\/\//.test(url);
}

function setInventoryRarityFilter(value, name) {
    const input = document.getElementById('inventory-rarity-filter');
    const label = document.getElementById('inventory-rarity-filter-label');
    if (input) input.value = value || '';
    if (label) label.textContent = name || 'すべて';
    currentInventoryPage = 1;
    filterAndRenderInventoryBadges();
}

function setInventoryCreatorFilter(id, name, avatar) {
    const input = document.getElementById('inventory-creator-filter');
    const label = document.getElementById('inventory-creator-filter-label');
    const img = document.getElementById('inventory-creator-filter-avatar');
    if (input) input.value = id || '';
    if (label) label.textContent = name || 'すべて';
    if (img) {
        if (avatar && isValidAvatarUrl(avatar)) {
            img.src = avatar;
            img.style.display = 'block';
        } else {
            img.style.display = 'none';
        }
    }
    currentInventoryPage = 1;
    filterAndRenderInventoryBadges();
}

function getInventoryRarityOrder() {
    if (rarityThresholds && rarityThresholds.length) {
        return rarityThresholds.map(r => r.rarity_name).concat(['-']);
    }
    return ['-'];
}

function getInventoryBadgeTags(item) {
    if (!item) return [];
    const tags = item.tags;
    if (!Array.isArray(tags)) return [];
    return tags.map(t => (t || '').trim()).filter(Boolean);
}

function getInventoryRarity(item) {
    const r = (item.rarity_name || '').trim();
    return r || '-';
}

function matchesInventoryMethod(item, method) {
    if (!method) return true;
    if (method === 'shop') return item.is_shop_listed;
    if (method === 'gacha') return item.is_gacha_eligible;
    if (method === 'not_for_sale') {
        if (item.is_shop_listed || item.is_gacha_eligible) return false;
        if (item.sales_type === '限定品' || item.sales_type === '換金品') return false;
        return true;
    }
    return true;
}

function matchesInventoryFilters(item, opts, excludeKey = '') {
    if (opts.searchVal && !item.badge_name.toLowerCase().includes(opts.searchVal)) return false;
    if (excludeKey !== 'method' && opts.method && !matchesInventoryMethod(item, opts.method)) return false;
    if (excludeKey !== 'rarity' && opts.rarity) {
        const r = getInventoryRarity(item);
        if (r !== opts.rarity) return false;
    }
    if (excludeKey !== 'creator' && opts.creator && item.creator_id !== opts.creator) return false;
    if (excludeKey !== 'type' && opts.type && item.sales_type !== opts.type) return false;
    if (excludeKey !== 'label' && opts.label && (item.label || '').trim() !== opts.label) return false;
    if (excludeKey !== 'tag' && opts.tag) {
        const tags = getInventoryBadgeTags(item);
        if (!tags.includes(opts.tag)) return false;
    }
    return true;
}

function updateInventoryDynamicFilterOptions(sourceItems) {
    const searchVal = document.getElementById('inventory-search')?.value.toLowerCase() || '';
    const currentType = document.getElementById('inventory-type-filter')?.value || '';
    const currentLabel = document.getElementById('inventory-label-filter')?.value || '';
    const currentTag = document.getElementById('inventory-tag-filter')?.value || '';
    const currentMethod = document.getElementById('inventory-method-filter')?.value || '';
    const baseOpts = {
        searchVal,
        rarity: inventoryFilters.rarity,
        creator: inventoryFilters.creator,
        type: inventoryFilters.type,
        label: inventoryFilters.label,
        tag: inventoryFilters.tag,
        method: inventoryFilters.method
    };

    const baseForRarity = sourceItems.filter(b => matchesInventoryFilters(b, baseOpts, 'rarity'));
    const baseForCreator = sourceItems.filter(b => matchesInventoryFilters(b, baseOpts, 'creator'));
    const baseForType = sourceItems.filter(b => matchesInventoryFilters(b, baseOpts, 'type'));
    const baseForLabel = sourceItems.filter(b => matchesInventoryFilters(b, baseOpts, 'label'));
    const baseForTag = sourceItems.filter(b => matchesInventoryFilters(b, baseOpts, 'tag'));
    const baseForMethod = sourceItems.filter(b => matchesInventoryFilters(b, baseOpts, 'method'));

    const rarityCounts = {};
    baseForRarity.forEach(b => {
        const r = getInventoryRarity(b) || '-';
        rarityCounts[r] = (rarityCounts[r] || 0) + 1;
    });
    buildInventoryRarityMenuFromCounts(rarityCounts);

    buildInventoryCreatorMenuFromBase(baseForCreator);

    const typeSelect = document.getElementById('inventory-type-filter');
    if (typeSelect) {
        const counts = {};
        baseForType.forEach(info => {
            const t = info.sales_type;
            if (!t) return;
            counts[t] = (counts[t] || 0) + 1;
        });
        const options = Object.entries(counts)
            .filter(([, c]) => c > 0)
            .map(([t, c]) => `<option value="${t}">${t} (${c})</option>`)
            .join('');
        typeSelect.innerHTML = `<option value="">すべて</option>${options}`;
        if ([...typeSelect.options].some(o => o.value === currentType)) {
            typeSelect.value = currentType;
        } else {
            typeSelect.value = '';
        }
    }

    const labelSelect = document.getElementById('inventory-label-filter');
    if (labelSelect) {
        const counts = {};
        baseForLabel.forEach(info => {
            const label = (info.label || '').trim();
            if (!label) return;
            counts[label] = (counts[label] || 0) + 1;
        });
        const options = Object.entries(counts)
            .filter(([, c]) => c > 0)
            .map(([l, c]) => `<option value="${l}">${l} (${c})</option>`)
            .join('');
        labelSelect.innerHTML = `<option value="">すべて</option>${options}`;
        if ([...labelSelect.options].some(o => o.value === currentLabel)) {
            labelSelect.value = currentLabel;
        } else {
            labelSelect.value = '';
        }
    }

    const tagSelect = document.getElementById('inventory-tag-filter');
    if (tagSelect) {
        const counts = {};
        baseForTag.forEach(info => {
            getInventoryBadgeTags(info).forEach(tag => {
                counts[tag] = (counts[tag] || 0) + 1;
            });
        });
        const options = Object.entries(counts)
            .filter(([, c]) => c > 0)
            .sort((a, b) => a[0].localeCompare(b[0], 'ja'))
            .map(([t, c]) => `<option value="${t}">${t} (${c})</option>`)
            .join('');
        tagSelect.innerHTML = `<option value="">すべて</option>${options}`;
        if ([...tagSelect.options].some(o => o.value === currentTag)) {
            tagSelect.value = currentTag;
        } else {
            tagSelect.value = '';
        }
    }

    const methodSelect = document.getElementById('inventory-method-filter');
    if (methodSelect) {
        const counts = {
            shop: baseForMethod.filter(b => b.is_shop_listed).length,
            gacha: baseForMethod.filter(b => b.is_gacha_eligible).length,
            not_for_sale: baseForMethod.filter(b => !b.is_shop_listed && !b.is_gacha_eligible && b.sales_type !== '限定品' && b.sales_type !== '換金品').length
        };
        const options = [];
        if (counts.shop > 0) options.push(`<option value="shop">ショップ販売中 (${counts.shop})</option>`);
        if (counts.gacha > 0) options.push(`<option value="gacha">ガチャ排出 (${counts.gacha})</option>`);
        if (counts.not_for_sale > 0) options.push(`<option value="not_for_sale">非売品 (${counts.not_for_sale})</option>`);
        methodSelect.innerHTML = `<option value="">すべて</option>${options.join('')}`;
        if ([...methodSelect.options].some(o => o.value === currentMethod)) {
            methodSelect.value = currentMethod;
        } else {
            methodSelect.value = '';
        }
    }
}

function buildInventoryCreatorMenuFromBase(baseItems) {
    const menu = document.getElementById('inventory-creator-filter-menu');
    const btn = document.getElementById('inventory-creator-filter-btn');
    if (!menu || !btn) return;
    const counts = {};
    baseItems.forEach(info => {
        const id = info.creator_id;
        if (!id) return;
        counts[id] = (counts[id] || 0) + 1;
    });
    const creatorIds = new Set(Object.keys(counts));
    const items = [{ id: '', name: 'すべて', avatar: '' }]
        .concat(
            [...creatorIds].map(id => {
                const info = inventoryCreatorMap.get(id) || { name: id, avatar: '' };
                return { id, name: info.name, avatar: info.avatar, count: counts[id] };
            }).sort((a, b) => a.name.localeCompare(b.name))
        );
    menu.innerHTML = items.map(item => `
        <div class="creator-item" data-id="${item.id}" data-name="${item.name}" data-avatar="${item.avatar || ''}">
            ${isValidAvatarUrl(item.avatar) ? `<img src="${item.avatar}" class="creator-avatar" style="display:block;">` : '<span class="creator-avatar" style="display:inline-block;"></span>'}
            <span>${item.name}</span>
            ${item.id ? `<span class="ms-auto text-muted small">(${item.count})</span>` : ''}
        </div>
    `).join('');
    menu.querySelectorAll('.creator-item').forEach(el => {
        el.addEventListener('click', () => {
            setInventoryCreatorFilter(el.dataset.id, el.dataset.name, el.dataset.avatar);
            menu.style.display = 'none';
        });
    });
    if (!btn.dataset.bound) {
        btn.addEventListener('click', () => {
            menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
        });
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target) && !btn.contains(e.target)) {
                menu.style.display = 'none';
            }
        });
        btn.dataset.bound = '1';
    }
}

function buildInventoryRarityMenuFromCounts(rarityCounts) {
    const menu = document.getElementById('inventory-rarity-filter-menu');
    const btn = document.getElementById('inventory-rarity-filter-btn');
    if (!menu || !btn) return;
    const items = [{ name: 'すべて', value: '' }]
        .concat(Object.keys(rarityCounts).map(r => ({ name: r, value: r, count: rarityCounts[r] })))
        .sort((a, b) => {
            if (a.value === '') return -1;
            if (b.value === '') return 1;
            const aIdx = inventoryRarityOrder.indexOf(a.name);
            const bIdx = inventoryRarityOrder.indexOf(b.name);
            if (aIdx === -1 && bIdx === -1) return a.name.localeCompare(b.name);
            if (aIdx === -1) return 1;
            if (bIdx === -1) return -1;
            return aIdx - bIdx;
        });
    menu.innerHTML = items.map(item => {
        if (item.value === '') {
            return `<div class="creator-item" data-value="" data-name="すべて"><span>すべて</span></div>`;
        }
        const cls = getRarityClass(item.name);
        const displayName = cls ? item.name : '★???';
        const badgeClass = cls ? cls : 'rarity-unknown';
        return `
            <div class="creator-item" data-value="${item.value}" data-name="${item.name}">
                <span class="badge ${badgeClass} text-white" title="${item.name}">${displayName}</span>
                <span class="ms-auto text-muted small">(${item.count})</span>
            </div>
        `;
    }).join('');
    menu.querySelectorAll('.creator-item').forEach(el => {
        el.addEventListener('click', () => {
            setInventoryRarityFilter(el.dataset.value, el.dataset.name);
            menu.style.display = 'none';
        });
    });
    if (!btn.dataset.bound) {
        btn.addEventListener('click', () => {
            menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
        });
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target) && !btn.contains(e.target)) {
                menu.style.display = 'none';
            }
        });
        btn.dataset.bound = '1';
    }
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
    currentShopActionUUID = uuid;
    BadgeSellUI.renderSellConfirmModal(item, executeSellFromMyPage, { confirmLabel: '売却する' });
}

let isBulkSellingConvertible = false;
async function confirmSellAllConvertibleFromMyPage(badgeId) {
    const targets = allInventoryBadges.filter(i => i.badge_id === badgeId && i.sales_type === '換金品');
    if (!targets.length) {
        showNotice('一括売却できる換金品が見つかりませんでした。', 'warning');
        return;
    }

    const badgeName = targets[0].badge_name || '';
    const total = targets.reduce((sum, item) => sum + (item.sell_price || 0), 0);
    const confirmed = confirm(`「${badgeName}」を ${targets.length} 個一括売却しますか？（合計: 🪙${Math.floor(total).toLocaleString()}）`);
    if (!confirmed) return;

    if (isBulkSellingConvertible) return;
    isBulkSellingConvertible = true;
    toggleLoading(true);

    try {
        let successCount = 0;
        let actualTotal = 0;
        for (const item of targets) {
            const { data, error } = await supabaseClient.rpc('sell_badge_v2', {
                p_user_id: targetId,
                p_badge_uuid: item.uuid
            });
            if (error || !data.ok) {
                console.error('一括売却エラー:', error || data.error);
                continue;
            }
            successCount++;
            actualTotal += data.sell_price || 0;
        }

        if (successCount > 0) {
            showNotice(`「${badgeName}」を ${successCount} 個一括売却しました。（合計: 🪙${Math.floor(actualTotal).toLocaleString()}）`, 'success');
            if (typeof logActivity === 'function') {
                await logActivity(targetId, 'badge_sell', {
                    amount: actualTotal,
                    badgeId: badgeId,
                    details: {
                        badge_id: badgeId,
                        badge_name: badgeName,
                        quantity: successCount
                    }
                });
            }
        }

        await loadOwnedBadges();
        await loadActivityLogs();
        await loadTargetUserInfo();
        await loadInventory();
    } catch (err) {
        showNotice('エラーが発生しました: ' + err.message, 'error');
    } finally {
        toggleLoading(false);
        isBulkSellingConvertible = false;
    }
}

async function executeSellFromMyPage() {
    bootstrap.Modal.getInstance(document.getElementById('shopActionModal'))?.hide();
    toggleLoading(true);

    try {
        const sellItem = allInventoryBadges.find(i => i.uuid === currentShopActionUUID) || null;
        const badgeIdForLog = sellItem?.badge_id || null;
        const badgeNameForLog = sellItem?.badge_name || '';
        const { data, error } = await supabaseClient.rpc('sell_badge_v2', {
            p_user_id: targetId,
            p_badge_uuid: currentShopActionUUID
        });

        if (error) throw error;
        if (!data.ok) throw new Error(data.error);

        showNotice(`売却しました！ (🪙 +${data.sell_price.toLocaleString()})`, 'success');
        if (typeof logActivity === 'function') {
            await logActivity(targetId, 'badge_sell', {
                amount: data.sell_price,
                badgeId: badgeIdForLog,
                details: { badge_uuid: currentShopActionUUID, badge_name: badgeNameForLog }
            });
        }

        await loadOwnedBadges();
        await loadActivityLogs();
        await loadTargetUserInfo();
        await loadInventory();
    } catch (err) {
        showNotice('エラーが発生しました: ' + err.message, 'error');
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

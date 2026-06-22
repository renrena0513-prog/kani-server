        // ============ バッジ管理機能 ============

        // バッジデータのグローバル保存用
        let allBadgeGroups = [];
        let specialBadges = [];
        let convertibleBadges = [];
        let purchasableBadges = [];
        let currentBadgePage = 1;
        let isMutantFilterActive = false;
        const BADGES_PER_PAGE = 12; // 4x3グリッド
        let rarityOrder = [];
        const creatorMap = new Map();
        const badgeFilters = {
            rarity: '',
            creator: '',
            type: '',
            label: '',
            tag: '',
            method: ''
        };

        function getBadgeTagsFromBadge(badge) {
            if (!badge) return [];
            const raw = badge.tags;
            if (Array.isArray(raw)) {
                return raw.map(t => (t || '').trim()).filter(Boolean);
            }
            if (typeof raw === 'string') {
                const trimmed = raw.trim();
                if (!trimmed) return [];
                try {
                    const parsed = JSON.parse(trimmed);
                    if (Array.isArray(parsed)) {
                        return parsed.map(t => (t || '').trim()).filter(Boolean);
                    }
                } catch (_) {
                    // ignore JSON parse errors
                }
                return trimmed
                    .split(/[,\s]+/g)
                    .map(t => t.trim())
                    .filter(Boolean);
            }
            return [];
        }

        function buildBadgeMetaRowHtml(badge, rarity) {
            const label = (badge?.label || '').trim();
            const labelHtml = label
                ? `<a class="badge-label-strong badge-tag-link" href="../badge/list.html?label=${encodeURIComponent(label)}"
                    onclick="event.stopPropagation();">${label}</a>`
                : '';
            const typeLabel = badge?.sales_type === '変動型' ? '変動型' : '固定型';
            const typeClass = badge?.sales_type === '変動型' ? 'rarity-epic' : 'bg-light text-dark border';
            return `
                <div class="badge-meta-row">
                    <div class="rarity-pill" style="background: rgba(0,0,0,0.2);">${rarity}</div>
                    <span class="badge badge-type-pill ${typeClass}">${typeLabel}</span>
                    ${labelHtml}
                </div>
            `;
        }

        function buildBadgeTagListHtml(badge) {
            const tags = getBadgeTagsFromBadge(badge);
            if (!tags.length) return '';
            return `
                <div class="badge-tag-list">
                    ${tags.map(t => `<a class="badge-tag badge-tag-link" href="../badge/list.html?tag=${encodeURIComponent(t)}"
                        onclick="event.stopPropagation();">#${t}</a>`).join('')}
                </div>
            `;
        }

        function toggleMutantFilter() {
            isMutantFilterActive = !isMutantFilterActive;
            const btn = document.getElementById('filter-mutant-btn');
            if (btn) {
                if (isMutantFilterActive) {
                    btn.classList.add('active');
                    btn.classList.replace('btn-outline-secondary', 'btn-primary'); // 初期時用
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
            currentBadgePage = 1;
            filterAndRenderBadges();
        }


        async function loadOwnedBadges() {
            const section = document.getElementById('badge-collection-section');
            const noBadgesMsg = document.getElementById('no-badges-msg');

            if (!section) return;
            section.style.display = 'block';

            try {
                const fetchAllBadgeCounts = async () => {
                    const batchSize = 1000;
                    let all = [];
                    let from = 0;
                    while (true) {
                        const { data, error } = await supabaseClient
                            .from('user_badges_new')
                            .select('uuid, badge_id')
                            .order('uuid', { ascending: true })
                            .range(from, from + batchSize - 1);
                        if (error) throw error;
                        all = all.concat(data || []);
                        if (!data || data.length < batchSize) break;
                        from += batchSize;
                    }
                    return all;
                };

                const [ownedRes, marketCountRes, profileRes, thresholdsRes] = await Promise.all([
                    supabaseClient.from('user_badges_new').select('*, badges(*)').eq('user_id', targetId),
                    fetchAllBadgeCounts(),
                    supabaseClient.from('profiles').select('coins, equipped_badge_id, equipped_badge_id_right, total_assets').eq('discord_user_id', targetId).maybeSingle(),
                    supabaseClient.from('rarity_thresholds').select('*').order('threshold_value', { ascending: true })
                ]);

                if (ownedRes.error) throw ownedRes.error;
                const thresholds = thresholdsRes.data || [];
                rarityOrder = getRarityOrder();

                function getDynamicRarity(assetValue, fixedRarity) {
                    if (fixedRarity) return fixedRarity;
                    if (!thresholds || thresholds.length === 0) return '-';
                    let current = thresholds[0].rarity_name;
                    for (const t of thresholds) {
                        if (assetValue >= t.threshold_value) {
                            current = t.rarity_name;
                        } else {
                            break;
                        }
                    }
                    return current;
                }
                const owned = ownedRes.data || [];
                const creatorIds = [...new Set(owned.map(item => item.badges?.discord_user_id).filter(Boolean))];
                if (creatorIds.length > 0) {
                    const { data: creators } = await supabaseClient
                        .from('profiles')
                        .select('discord_user_id, account_name, avatar_url')
                        .in('discord_user_id', creatorIds);
                    (creators || []).forEach(c => {
                        creatorMap.set(c.discord_user_id, { name: c.account_name || c.discord_user_id, avatar: c.avatar_url || '' });
                    });
                }
                // 入手順（acquired_atの降順）でソート
                owned.sort((a, b) => {
                    const dateA = new Date(a.acquired_at || 0);
                    const dateB = new Date(b.acquired_at || 0);
                    return dateB - dateA;
                });
                const profileData = profileRes.data;
                const userCoins = profileData?.coins || 0;
                const equippedId = profileData?.equipped_badge_id;
                const equippedRightId = profileData?.equipped_badge_id_right;

                // 各バッジの現在流通数 n を集計
                const marketCounts = {};
                (marketCountRes || []).forEach(s => {
                    marketCounts[s.badge_id] = (marketCounts[s.badge_id] || 0) + 1;
                });

                // 自分のページなら管理ボタンを表示
                const badgeBtn = document.getElementById('badge-change-btn');
                const transferBtn = document.getElementById('badge-transfer-btn');
                const sellBtn = document.getElementById('badge-sell-btn');
                if (!isViewMode) {
                    if (badgeBtn) badgeBtn.style.display = 'inline-block';
                    if (transferBtn) transferBtn.style.display = 'inline-block';
                    if (sellBtn) sellBtn.style.display = 'inline-block';
                }

                if (!owned || owned.length === 0) {
                    document.getElementById('special-badges-section').style.display = 'none';
                    document.getElementById('convertible-badges-section').style.display = 'none';
                    document.getElementById('purchasable-badges-section').style.display = 'none';
                    if (noBadgesMsg) noBadgesMsg.style.display = 'block';
                    const totalAssetsEl = document.getElementById('total-assets-value');
                    if (totalAssetsEl) {
                        totalAssetsEl.textContent = userCoins.toLocaleString();
                    }
                    return;
                }

                // バッジのグルーピング処理 (badge_id ごとにまとめる)
                const groupedOwned = {};
                owned.forEach(item => {
                    const bid = item.badge_id;
                    const itemId = Number(item.user_badges_new || item.id) || 0;

                    if (!groupedOwned[bid]) {
                        groupedOwned[bid] = {
                            badge: item.badges,
                            instances: [],
                            isEquippedLeft: false,
                            isEquippedRight: false,
                            latestAcquiredAt: item.acquired_at || '' // ソート基準用の最新日時
                        };
                    }
                    groupedOwned[bid].instances.push(item);

                    // 最新の取得日時を基準にする
                    if (!groupedOwned[bid].latestAcquiredAt || new Date(item.acquired_at) > new Date(groupedOwned[bid].latestAcquiredAt)) {
                        groupedOwned[bid].latestAcquiredAt = item.acquired_at;
                    }

                    if (item.badge_id === equippedId) {
                        groupedOwned[bid].isEquippedLeft = true;
                    }
                    if (item.badge_id === equippedRightId) {
                        groupedOwned[bid].isEquippedRight = true;
                    }
                });

                // 各グループの mainItem を最新（latestAcquiredAt）の個体に設定
                Object.values(groupedOwned).forEach(group => {
                    group.mainItem = group.instances.find(inst => inst.acquired_at === group.latestAcquiredAt) || group.instances[0];
                });

                let totalBadgeAssetValue = 0;
                specialBadges = [];
                convertibleBadges = [];
                purchasableBadges = [];

                // グループ化されたバッジを分類して保存
                Object.values(groupedOwned).forEach(group => {
                    const badge = group.badge;
                    if (!badge) return;

                    const count = group.instances.length;
                    const mainItem = group.instances[0];

                    const n = marketCounts[badge.id] || 0;
                    const badgeResult = BadgeUtils.calculateBadgeValues(badge, n, rarityThresholds);
                    const pValue = badgeResult.marketValue;

                    // ミュータントは価値3倍で計算
                    group.instances.forEach(inst => {
                        const multiplier = inst.is_mutant ? 3 : 1;
                        totalBadgeAssetValue += (pValue * multiplier);
                    });

                    const rarity = getDynamicRarity(pValue, badge.fixed_rarity_name);
                    const hasMutant = group.instances.some(i => i.is_mutant);

                    // バッジ情報オブジェクト
                    const badgeInfo = {
                        group,
                        badge,
                        count,
                        mainItem,
                        pValue,
                        rarity,
                        hasMutant,
                        n,
                        getDynamicRarity,
                        marketCounts
                    };

                    // 分類
                    if (badge.sales_type === '換金品') {
                        convertibleBadges.push(badgeInfo);
                    } else if (badge.sales_type === '限定品') {
                        specialBadges.push(badgeInfo);
                    } else {
                        purchasableBadges.push(badgeInfo);
                    }
                });

                // 限定バッジをナンバー順にソート
                specialBadges.sort((a, b) => (a.badge.id || 0) - (b.badge.id || 0));

                // 換金品をナンバー順にソート
                convertibleBadges.sort((a, b) => (a.badge.id || 0) - (b.badge.id || 0));

                // 限定バッジの表示
                if (specialBadges.length > 0) {
                    renderSpecialBadges();
                    document.getElementById('special-badges-section').style.display = 'block';
                } else {
                    document.getElementById('special-badges-section').style.display = 'none';
                }

                // 換金品の表示
                if (convertibleBadges.length > 0) {
                    renderConvertibleBadges();
                    document.getElementById('convertible-badges-section').style.display = 'block';
                } else {
                    document.getElementById('convertible-badges-section').style.display = 'none';
                }

                // 購入バッジの表示（フィルター・ソート・ページネーション適用）
                if (purchasableBadges.length > 0) {
                    document.getElementById('purchasable-badges-section').style.display = 'block';
                    filterAndRenderBadges();
                } else {
                    document.getElementById('purchasable-badges-section').style.display = 'none';
                }

                if (noBadgesMsg) noBadgesMsg.style.display = 'none';

                // バッジの総資産を更新
                const totalAssetsEl = document.getElementById('total-assets-value');
                if (totalAssetsEl) {
                    totalAssetsEl.textContent = (totalBadgeAssetValue + userCoins).toLocaleString();
                }

            } catch (err) {
                console.error('バッジ取得エラー:', err);
                if (noBadgesMsg) {
                    noBadgesMsg.textContent = '読み込み中にエラーが発生しました';
                    noBadgesMsg.style.display = 'block';
                }
            }
        }

        // バッジカードを描画するヘルパー関数
        function renderBadgeCard(badgeInfo, equippedId, equippedRightId) {
            const { group, badge, count, hasMutant, rarity } = badgeInfo;
            const rarityClass = getRarityClass(rarity);
            const isEquippedLeft = group.isEquippedLeft;
            const isEquippedRight = group.isEquippedRight;
            const isEquipped = isEquippedLeft || isEquippedRight;
            const isNonSaleable = (badge.sales_type === '限定品');
            const countLabel = count > 1 ? `<span class="badge bg-dark position-absolute bottom-0 end-0 m-1" style="font-size:0.6rem; z-index:4; opacity: 0.9;">x${count}</span>` : '';
            const metaRowHtml = buildBadgeMetaRowHtml(badge, rarity);
            const tagHtml = buildBadgeTagListHtml(badge);

            return `
                <div class="col-6 col-sm-4 col-md-3 mb-3">
                    <div class="card h-100 shadow-sm border-0 position-relative badge-card ${rarityClass}" style="border-radius: 12px; overflow: hidden; transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-3px)'" onmouseout="this.style.transform='translateY(0)'">
                        <div class="card-body p-2 d-flex flex-column align-items-center justify-content-center text-center">
                            ${metaRowHtml}
                            <a href="../badge/index.html?id=${badge.id}${hasMutant ? '&view=mutant' : ''}" class="text-decoration-none w-100 d-flex flex-column align-items-center justify-content-center" style="color: inherit;">
                                <div class="small opacity-75 text-truncate w-100 px-1 mt-1" style="font-size: 0.65rem; line-height: 1.2;">${badge.name}</div>
                                <div class="position-relative mb-1 mt-1">
                                    <div class="badge-item ${isEquipped ? 'equipped' : ''} ${hasMutant ? 'mutant-badge-container active' : ''}" style="width: 70px; height: 70px; padding: 5px; background: transparent; border-width: 2px; border-radius: 50%;">
                                        <img src="${badge.image_url}" alt="${badge.name}" style="width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 2px 5px rgba(0,0,0,0.2)); ${hasMutant ? 'position: relative; z-index: 1;' : ''}">
                                        ${hasMutant ? (window.MutantBadge ? window.MutantBadge.renderShine(true) : '<div class="mutant-badge-shine"></div>') : ''}
                                    </div>
                                    ${isEquipped ? `
                                        <span class="badge bg-gold position-absolute top-0 start-0 d-flex align-items-center justify-content-center" style="font-size:0.4rem; z-index:2; min-width: 45px; height: 16px; transform: translate(-10%, -10%);">
                                            ${isEquippedLeft && isEquippedRight ? '◀左右▶' : (isEquippedLeft ? '◀左 装着' : '右 装着▶')}
                                        </span>` : ''}
                                    ${countLabel}
                                </div>
                            </a>
                            ${tagHtml}
                        </div>

                        ${(!isViewMode && !isNonSaleable) ? `
                            <div class="dropdown position-absolute top-0 end-0" style="z-index: 5;">
                                <button class="btn btn-link btn-sm p-1" data-bs-toggle="dropdown" style="font-size: 0.7rem; color: inherit; opacity: 0.5;">
                                    <i class="bi bi-three-dots-vertical"></i>
                                </button>
                                <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0" style="font-size: 0.75rem; min-width: 80px;">
                                    <li><a class="dropdown-item py-1" href="javascript:void(0)" onclick="openBadgeSelectionModal('sell')">売却</a></li>
                                    <li><a class="dropdown-item py-1" href="javascript:void(0)" onclick="openBadgeSelectionModal('transfer')">譲渡</a></li>
                                </ul>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }

        // 限定バッジを描画
        function renderSpecialBadges() {
            const list = document.getElementById('special-badge-list');
            const countEl = document.getElementById('special-count');
            if (!list || !countEl) return;

            let html = '';
            specialBadges.forEach(badgeInfo => {
                html += renderBadgeCard(badgeInfo, null, null);
            });

            list.innerHTML = html;
            countEl.textContent = specialBadges.length;
        }

        // 換金品を描画
        function renderConvertibleBadges() {
            const list = document.getElementById('convertible-badge-list');
            const countEl = document.getElementById('convertible-count');
            if (!list || !countEl) return;

            let html = '';
            convertibleBadges.forEach(badgeInfo => {
                const { badge, count, rarity } = badgeInfo;
                const rarityClass = getRarityClass(rarity);
                const fixedSellPrice = badge.price;
                const metaRowHtml = buildBadgeMetaRowHtml(badge, rarity);
                const tagHtml = buildBadgeTagListHtml(badge);

                html += `
                    <div class="col-6 col-sm-4 col-md-3 mb-3">
                        <div class="card h-100 shadow-sm border-0 ${rarityClass}" style="border-radius: 12px; overflow: hidden; transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-3px)'" onmouseout="this.style.transform='translateY(0)'">
                            <div class="card-body p-3 d-flex flex-column align-items-center justify-content-center text-center">
                                ${metaRowHtml}
                                <a href="../badge/index.html?id=${badge.id}" class="text-decoration-none w-100 d-flex flex-column align-items-center justify-content-center" style="color: inherit;">
                                    <div class="small fw-bold text-truncate w-100 mt-1" style="font-size: 0.75rem; line-height: 1.2;">${badge.name}</div>
                                    <div class="d-flex align-items-center justify-content-center mb-2" style="gap: 8px;">
                                        <div style="width: 70px; height: 70px;">
                                            <img src="${badge.image_url}" alt="${badge.name}" style="width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 2px 5px rgba(0,0,0,0.2));">
                                        </div>
                                        <span class="badge bg-dark" style="font-size:0.75rem; padding: 4px 8px;">×${count}</span>
                                    </div>
                                    <div class="small text-muted mt-1" style="font-size: 0.7rem;">💵 ${fixedSellPrice.toLocaleString()} M</div>
                                </a>
                                ${tagHtml}
                            </div>
                        </div>
                    </div>
                `;
            });

            list.innerHTML = html;
            countEl.textContent = convertibleBadges.length;
        }

        // 折りたたみトグル
        function toggleBadgeSection(type) {
            const content = document.getElementById(`${type}-badge-content`);
            const icon = document.getElementById(`${type}-toggle-icon`);

            if (content.style.display === 'none') {
                content.style.display = 'block';
                icon.textContent = '▼';
            } else {
                content.style.display = 'none';
                icon.textContent = '▶';
            }
        }

        // フィルター・ソート・ページネーション機能
        function filterAndRenderBadges() {
            const searchInput = document.getElementById('badge-search');
            const sortSelect = document.getElementById('badge-sort');
            const typeSelect = document.getElementById('badge-type-filter');
            const labelSelect = document.getElementById('badge-label-filter');
            const tagSelect = document.getElementById('badge-tag-filter');
            const methodSelect = document.getElementById('badge-method-filter');

            const searchTerm = searchInput?.value.toLowerCase() || '';
            const sortBy = sortSelect?.value || 'acquired_desc';
            const mutantOnly = isMutantFilterActive;
            badgeFilters.rarity = document.getElementById('rarity-filter')?.value || '';
            badgeFilters.creator = document.getElementById('creator-filter')?.value || '';
            badgeFilters.type = typeSelect?.value || '';
            badgeFilters.label = labelSelect?.value || '';
            badgeFilters.tag = tagSelect?.value || '';
            badgeFilters.method = methodSelect?.value || '';
            updateDynamicFilterOptions(purchasableBadges);

            // フィルター適用
            let filtered = purchasableBadges.filter(badgeInfo => {
                const { badge, hasMutant } = badgeInfo;

                // 検索フィルター
                if (searchTerm && !badge.name.toLowerCase().includes(searchTerm)) {
                    return false;
                }

                if (badgeFilters.method && !matchesMethodFilter(badge, badgeFilters.method)) return false;
                if (badgeFilters.rarity) {
                    const r = getRarityForBadge(badgeInfo);
                    if (r !== badgeFilters.rarity) return false;
                }
                if (badgeFilters.creator && badge.discord_user_id !== badgeFilters.creator) return false;
                if (badgeFilters.type && badge.sales_type !== badgeFilters.type) return false;
                if (badgeFilters.label && (badge.label || '').trim() !== badgeFilters.label) return false;
                if (badgeFilters.tag) {
                    const tags = getBadgeTags(badge);
                    if (!tags.includes(badgeFilters.tag)) return false;
                }

                // ミュータントフィルター
                if (mutantOnly && !hasMutant) {
                    return false;
                }

                return true;
            });

            filtered.forEach(info => {
                const r = getRarityForBadge(info);
                const res = BadgeUtils.calculateBadgeValues(info.badge, info.n || 0, rarityThresholds);
                info._assetValue = res.marketValue;
                info._rarity = r;
                info._starLevel = res.starLevel;
            });

            // ソート適用
            filtered.sort((a, b) => {
                const valA = a;
                const valB = b;

                // 入手順のための取得日時
                const getAcquiredTime = (item) => new Date(item.acquired_at || 0).getTime();

                switch (sortBy) {
                    case 'acquired_desc':
                        return getAcquiredTime(valB.mainItem) - getAcquiredTime(valA.mainItem);
                    case 'acquired_asc':
                        return getAcquiredTime(valA.mainItem) - getAcquiredTime(valB.mainItem);
                    case 'id_asc':
                    case 'number':
                        return (Number(valA.badge.sort_order ?? valA.badge.id) || 0) - (Number(valB.badge.sort_order ?? valB.badge.id) || 0);
                    case 'id_desc':
                        return (Number(valB.badge.sort_order ?? valB.badge.id) || 0) - (Number(valA.badge.sort_order ?? valA.badge.id) || 0);
                    case 'price_desc':
                        return (Number(valB._assetValue) || 0) - (Number(valA._assetValue) || 0);
                    case 'price_asc':
                        return (Number(valA._assetValue) || 0) - (Number(valB._assetValue) || 0);
                    case 'count':
                    case 'count_desc':
                        return (Number(valB.count) || 0) - (Number(valA.count) || 0);
                    case 'count_asc':
                        return (Number(valA.count) || 0) - (Number(valB.count) || 0);
                    case 'circulation_desc':
                        return (Number(valB.n) || 0) - (Number(valA.n) || 0);
                    case 'circulation_asc':
                        return (Number(valA.n) || 0) - (Number(valB.n) || 0);
                    case 'name':
                        return (valA.badge.name || '').localeCompare(valB.badge.name || '');
                    default:
                        return 0;
                }
            });

            // ページネーション: モバイル10個、PC12個
            const isMobile = window.innerWidth < 768;
            const itemsPerPage = isMobile ? 10 : 12;
            const totalPages = Math.ceil(filtered.length / itemsPerPage);

            // ページ番号が範囲外の場合は1ページ目に戻す
            if (currentBadgePage > totalPages) {
                currentBadgePage = 1;
            }
            if (currentBadgePage < 1) {
                currentBadgePage = 1;
            }

            const startIdx = (currentBadgePage - 1) * itemsPerPage;
            const endIdx = startIdx + itemsPerPage;
            const pageItems = filtered.slice(startIdx, endIdx);

            // バッジ描画
            const list = document.getElementById('purchasable-badge-list');
            if (list) {
                let html = '';
                pageItems.forEach(badgeInfo => {
                    html += renderBadgeCard(badgeInfo, null, null);
                });
                list.innerHTML = html || '<div class="col-12 text-center text-muted">該当するバッジがありません</div>';
            }

            // ページネーション描画
            const paginationArea = document.getElementById('badge-pagination-area');
            const pagination = document.getElementById('badge-pagination');
            const showingInfo = document.getElementById('badge-showing-info');
            const countStatus = document.getElementById('badge-count-status');
            if (countStatus) countStatus.textContent = `${filtered.length} / ${purchasableBadges.length} 件`;

            if (totalPages > 1) {
                paginationArea.style.display = 'block';

                // 表示情報
                showingInfo.textContent = `${startIdx + 1}-${Math.min(endIdx, filtered.length)} / ${filtered.length}件`;

                // ページボタン
                let paginationHtml = '';

                // 前へボタン
                paginationHtml += `
                    <li class="page-item ${currentBadgePage === 1 ? 'disabled' : ''}">
                        <a class="page-link" href="javascript:void(0)" onclick="goToBadgePage(${currentBadgePage - 1})">‹</a>
                    </li>
                `;

                // ページ番号（最大7個表示）
                let startPage = Math.max(1, currentBadgePage - 3);
                let endPage = Math.min(totalPages, startPage + 6);

                if (endPage - startPage < 6) {
                    startPage = Math.max(1, endPage - 6);
                }

                for (let i = startPage; i <= endPage; i++) {
                    paginationHtml += `
                        <li class="page-item ${i === currentBadgePage ? 'active' : ''}">
                            <a class="page-link" href="javascript:void(0)" onclick="goToBadgePage(${i})">${i}</a>
                        </li>
                    `;
                }

                // 次へボタン
                paginationHtml += `
                    <li class="page-item ${currentBadgePage === totalPages ? 'disabled' : ''}">
                        <a class="page-link" href="javascript:void(0)" onclick="goToBadgePage(${currentBadgePage + 1})">›</a>
                    </li>
                `;

                pagination.innerHTML = paginationHtml;
            } else {
                paginationArea.style.display = 'none';
            }
        }

        // ページ移動
        function goToBadgePage(page) {
            currentBadgePage = page;
            filterAndRenderBadges();
            // ページ移動時、バッジセクションまでスクロール
            document.getElementById('purchasable-badges-section')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }

        function resetMyBadgeFilters() {
            const search = document.getElementById('badge-search');
            const sort = document.getElementById('badge-sort');
            const typeSelect = document.getElementById('badge-type-filter');
            const labelSelect = document.getElementById('badge-label-filter');
            const tagSelect = document.getElementById('badge-tag-filter');
            const methodSelect = document.getElementById('badge-method-filter');
            if (search) search.value = '';
            if (sort) sort.value = 'acquired_desc';
            if (typeSelect) typeSelect.value = '';
            if (labelSelect) labelSelect.value = '';
            if (tagSelect) tagSelect.value = '';
            if (methodSelect) methodSelect.value = '';
            setRarityFilter('', 'すべて');
            setCreatorFilter('', 'すべて', '');
            isMutantFilterActive = false;
            const btn = document.getElementById('filter-mutant-btn');
            if (btn) {
                btn.classList.remove('active');
                btn.style.background = 'white';
                btn.style.color = '#333';
                btn.style.borderColor = '#dee2e6';
            }
            currentBadgePage = 1;
            filterAndRenderBadges();
        }

        function isValidAvatarUrl(url) {
            return typeof url === 'string' && /^https?:\/\//.test(url);
        }

        function setRarityFilter(value, name) {
            const input = document.getElementById('rarity-filter');
            const label = document.getElementById('rarity-filter-label');
            if (input) input.value = value || '';
            if (label) label.textContent = name || 'すべて';
            currentBadgePage = 1;
            filterAndRenderBadges();
        }

        function setCreatorFilter(id, name, avatar) {
            const input = document.getElementById('creator-filter');
            const label = document.getElementById('creator-filter-label');
            const img = document.getElementById('creator-filter-avatar');
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
            currentBadgePage = 1;
            filterAndRenderBadges();
        }

        function getRarityOrder() {
            if (rarityThresholds && rarityThresholds.length) {
                return rarityThresholds.map(r => r.rarity_name).concat(['-']);
            }
            return ['-'];
        }

        function getBadgeTags(badge) {
            if (!badge) return [];
            const tags = badge.tags;
            if (!Array.isArray(tags)) return [];
            return tags.map(t => (t || '').trim()).filter(Boolean);
        }

        function getRarityForBadge(badgeInfo) {
            const b = badgeInfo.badge;
            const circulationCount = badgeInfo.n || 0;
            const result = BadgeUtils.calculateBadgeValues(b, circulationCount, rarityThresholds);
            return result.rarityName;
        }

        function matchesMethodFilter(badge, method) {
            if (!method) return true;
            if (method === 'shop') return badge.is_shop_listed;
            if (method === 'gacha') return badge.is_gacha_eligible;
            if (method === 'not_for_sale') {
                if (badge.is_shop_listed || badge.is_gacha_eligible) return false;
                if (badge.sales_type === '限定品' || badge.sales_type === '換金品') return false;
                return true;
            }
            return true;
        }

        function matchesFiltersInfo(info, opts, excludeKey = '') {
            const badge = info.badge;
            if (opts.searchVal && !badge.name.toLowerCase().includes(opts.searchVal)) return false;
            if (excludeKey !== 'method' && opts.method && !matchesMethodFilter(badge, opts.method)) return false;
            if (excludeKey !== 'rarity' && opts.rarity) {
                const r = getRarityForBadge(info);
                if (r !== opts.rarity) return false;
            }
            if (excludeKey !== 'creator' && opts.creator && badge.discord_user_id !== opts.creator) return false;
            if (excludeKey !== 'type' && opts.type && badge.sales_type !== opts.type) return false;
            if (excludeKey !== 'label' && opts.label && (badge.label || '').trim() !== opts.label) return false;
            if (excludeKey !== 'tag' && opts.tag) {
                const tags = getBadgeTags(badge);
                if (!tags.includes(opts.tag)) return false;
            }
            return true;
        }

        function updateDynamicFilterOptions(sourceInfos) {
            const searchVal = document.getElementById('badge-search')?.value.toLowerCase() || '';
            const currentType = document.getElementById('badge-type-filter')?.value || '';
            const currentLabel = document.getElementById('badge-label-filter')?.value || '';
            const currentTag = document.getElementById('badge-tag-filter')?.value || '';
            const currentMethod = document.getElementById('badge-method-filter')?.value || '';
            const baseOpts = {
                searchVal,
                rarity: badgeFilters.rarity,
                creator: badgeFilters.creator,
                type: badgeFilters.type,
                label: badgeFilters.label,
                tag: badgeFilters.tag,
                method: badgeFilters.method
            };

            const baseForRarity = sourceInfos.filter(b => matchesFiltersInfo(b, baseOpts, 'rarity'));
            const baseForCreator = sourceInfos.filter(b => matchesFiltersInfo(b, baseOpts, 'creator'));
            const baseForType = sourceInfos.filter(b => matchesFiltersInfo(b, baseOpts, 'type'));
            const baseForLabel = sourceInfos.filter(b => matchesFiltersInfo(b, baseOpts, 'label'));
            const baseForTag = sourceInfos.filter(b => matchesFiltersInfo(b, baseOpts, 'tag'));
            const baseForMethod = sourceInfos.filter(b => matchesFiltersInfo(b, baseOpts, 'method'));

            const rarityCounts = {};
            baseForRarity.forEach(b => {
                const r = getRarityForBadge(b) || '-';
                rarityCounts[r] = (rarityCounts[r] || 0) + 1;
            });
            buildRarityMenuFromCounts(rarityCounts);

            buildCreatorMenuFromBase(baseForCreator);

            const typeSelect = document.getElementById('badge-type-filter');
            if (typeSelect) {
                const counts = {};
                baseForType.forEach(info => {
                    const t = info.badge.sales_type;
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

            const labelSelect = document.getElementById('badge-label-filter');
            if (labelSelect) {
                const counts = {};
                baseForLabel.forEach(info => {
                    const label = (info.badge.label || '').trim();
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

            const tagSelect = document.getElementById('badge-tag-filter');
            if (tagSelect) {
                const counts = {};
                baseForTag.forEach(info => {
                    getBadgeTags(info.badge).forEach(tag => {
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

            const methodSelect = document.getElementById('badge-method-filter');
            if (methodSelect) {
                const counts = {
                    shop: baseForMethod.filter(b => b.badge.is_shop_listed).length,
                    gacha: baseForMethod.filter(b => b.badge.is_gacha_eligible).length,
                    not_for_sale: baseForMethod.filter(b => !b.badge.is_shop_listed && !b.badge.is_gacha_eligible && b.badge.sales_type !== '限定品' && b.badge.sales_type !== '換金品').length
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

        function buildCreatorMenuFromBase(baseInfos) {
            const menu = document.getElementById('creator-filter-menu');
            const btn = document.getElementById('creator-filter-btn');
            if (!menu || !btn) return;
            const counts = {};
            baseInfos.forEach(info => {
                const id = info.badge.discord_user_id;
                if (!id) return;
                counts[id] = (counts[id] || 0) + 1;
            });
            const creatorIds = new Set(Object.keys(counts));
            const items = [{ id: '', name: 'すべて', avatar: '' }]
                .concat(
                    [...creatorIds].map(id => {
                        const info = creatorMap.get(id) || { name: id, avatar: '' };
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
                    setCreatorFilter(el.dataset.id, el.dataset.name, el.dataset.avatar);
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

        function buildRarityMenuFromCounts(rarityCounts) {
            const menu = document.getElementById('rarity-filter-menu');
            const btn = document.getElementById('rarity-filter-btn');
            if (!menu || !btn) return;
            const items = [{ name: 'すべて', value: '' }]
                .concat(Object.keys(rarityCounts).map(r => ({ name: r, value: r, count: rarityCounts[r] })))
                .sort((a, b) => {
                    if (a.value === '') return -1;
                    if (b.value === '') return 1;
                    const aIdx = rarityOrder.indexOf(a.name);
                    const bIdx = rarityOrder.indexOf(b.name);
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
                    setRarityFilter(el.dataset.value, el.dataset.name);
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

        // ============ 販売実績の読み込み ============
        async function loadRevenueStats() {
            const section = document.getElementById('revenue-section');
            if (!section) return;

            try {
                // royalty_receive（売上還元）のログを取得
                const { data: logs, error } = await supabaseClient
                    .from('activity_logs')
                    .select('amount')
                    .eq('user_id', targetId)
                    .eq('action_type', 'royalty_receive');

                if (error) {
                    console.log('Activity logs table may not exist yet:', error);
                    return;
                }

                if (!logs || logs.length === 0) {
                    // 販売実績がない場合は非表示のまま
                    return;
                }

                section.style.display = 'block';

                const totalRevenue = logs.reduce((sum, log) => sum + (log.amount || 0), 0);
                document.getElementById('total-revenue').textContent = `💵 ${totalRevenue.toLocaleString()}`;
                document.getElementById('revenue-count').textContent = logs.length;

            } catch (err) {
                console.error('販売実績取得エラー:', err);
            }
        }


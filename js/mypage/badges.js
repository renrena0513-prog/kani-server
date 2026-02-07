        // ============ バッジ管理機能 ============

        // バッジデータのグローバル保存用
        let allBadgeGroups = [];
        let specialBadges = [];
        let convertibleBadges = [];
        let purchasableBadges = [];
        let currentBadgePage = 1;
        let isMutantFilterActive = false;
        const BADGES_PER_PAGE = 12; // 4x3グリッド

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
                const [ownedRes, marketCountRes, profileRes, thresholdsRes] = await Promise.all([
                    supabaseClient.from('user_badges_new').select('*, badges(*)').eq('user_id', targetId),
                    supabaseClient.from('user_badges_new').select('*'),
                    supabaseClient.from('profiles').select('coins, equipped_badge_id, equipped_badge_id_right, total_assets').eq('discord_user_id', targetId).maybeSingle(),
                    supabaseClient.from('rarity_thresholds').select('*').order('threshold_value', { ascending: true })
                ]);

                if (ownedRes.error) throw ownedRes.error;
                const thresholds = thresholdsRes.data || [];

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
                (marketCountRes.data || []).forEach(s => {
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

            return `
                <div class="col-6 col-sm-4 col-md-3 mb-3">
                    <div class="card h-100 shadow-sm border-0 position-relative badge-card ${rarityClass}" style="border-radius: 12px; overflow: hidden; transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-3px)'" onmouseout="this.style.transform='translateY(0)'">
                        <a href="../badge/index.html?id=${badge.id}${hasMutant ? '&view=mutant' : ''}" class="text-decoration-none w-100 h-100 d-flex flex-column align-items-center justify-content-center" style="color: inherit;">
                            <div class="card-body p-2 d-flex flex-column align-items-center justify-content-center text-center">
                                <div class="position-relative mb-1">
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
                                <div class="small opacity-75 text-truncate w-100 px-1" style="font-size: 0.65rem; line-height: 1.2;">${badge.name}</div>
                                <span class="badge mt-1" style="background: rgba(0,0,0,0.2); font-size: 0.45rem; padding: 2px 5px;">${rarity}</span>
                            </div>
                        </a>
                        
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

                html += `
                    <div class="col-6 col-sm-4 col-md-3 mb-3">
                        <div class="card h-100 shadow-sm border-0 ${rarityClass}" style="border-radius: 12px; overflow: hidden; transition: transform 0.2s;" onmouseover="this.style.transform='translateY(-3px)'" onmouseout="this.style.transform='translateY(0)'">
                            <a href="../badge/index.html?id=${badge.id}" class="text-decoration-none w-100 h-100" style="color: inherit;">
                                <div class="card-body p-3 d-flex flex-column align-items-center justify-content-center text-center">
                                    <div class="small text-muted mb-1" style="font-size: 0.65rem;">${rarity}</div>
                                    <div class="d-flex align-items-center justify-content-center mb-2" style="gap: 8px;">
                                        <div style="width: 70px; height: 70px;">
                                            <img src="${badge.image_url}" alt="${badge.name}" style="width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 2px 5px rgba(0,0,0,0.2));">
                                        </div>
                                        <span class="badge bg-dark" style="font-size:0.75rem; padding: 4px 8px;">×${count}</span>
                                    </div>
                                    <div class="small fw-bold text-truncate w-100" style="font-size: 0.75rem; line-height: 1.2;">${badge.name}</div>
                                    <div class="small text-muted mt-1" style="font-size: 0.7rem;">💰 ${fixedSellPrice.toLocaleString()} C</div>
                                </div>
                            </a>
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

            const searchTerm = searchInput?.value.toLowerCase() || '';
            const sortBy = sortSelect?.value || 'acquired_desc';
            const typeFilter = typeSelect?.value || '';
            const mutantOnly = isMutantFilterActive;

            // フィルター適用
            let filtered = purchasableBadges.filter(badgeInfo => {
                const { badge, hasMutant } = badgeInfo;

                // 検索フィルター
                if (searchTerm && !badge.name.toLowerCase().includes(searchTerm)) {
                    return false;
                }

                // 形式フィルター
                if (typeFilter) {
                    if (typeFilter === 'ガチャ限定') {
                        // is_gacha_eligible が真（true, 1, "true"など）かどうか
                        if (!badge.is_gacha_eligible || badge.is_gacha_eligible === 'false') return false;
                    } else if (typeFilter === '変動型') {
                        if (badge.sales_type !== '変動型') return false;
                    } else if (typeFilter === '固定型') {
                        if (badge.sales_type !== '固定型') return false;
                    }
                }

                // ミュータントフィルター
                if (mutantOnly && !hasMutant) {
                    return false;
                }

                return true;
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
                    case 'number':
                        return (Number(valA.badge.id) || 0) - (Number(valB.badge.id) || 0);
                    case 'price_desc':
                        return (Number(valB.pValue) || 0) - (Number(valA.pValue) || 0);
                    case 'price_asc':
                        return (Number(valA.pValue) || 0) - (Number(valB.pValue) || 0);
                    case 'count':
                        return (Number(valB.count) || 0) - (Number(valA.count) || 0);
                    case 'circulation':
                        return (Number(valB.n) || 0) - (Number(valA.n) || 0);
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
                document.getElementById('total-revenue').textContent = `🪙 ${totalRevenue.toLocaleString()}`;
                document.getElementById('revenue-count').textContent = logs.length;

            } catch (err) {
                console.error('販売実績取得エラー:', err);
            }
        }


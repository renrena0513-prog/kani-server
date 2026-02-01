        // ============ バッジ譲渡・売却：バッジ選択モーダル ============
        // ============ バッジ譲渡・売却：バッジ選択モーダル ============
        async function openBadgeSelectionModal(mode) {
            const listEl = document.getElementById('action-badge-list');
            listEl.innerHTML = '<p class="text-center text-muted py-3">読み込み中...</p>';

            document.getElementById('badgeActionModalLabel').textContent = mode === 'transfer' ? '譲渡するバッジを選択' : '売却するバッジを選択';

            const modalEl = document.getElementById('badgeActionModal');
            const modal = new bootstrap.Modal(modalEl);
            modal.show();

            try {
                // 所持バッジの取得（新テーブル user_badges_new を使用）
                const { data: owned, error } = await supabaseClient
                    .from('user_badges_new')
                    .select('*, badges(*)')
                    .eq('user_id', targetId);

                if (error) throw error;

                // 全バッジの流通数を取得（価格計算用）
                const { data: marketCountRes } = await supabaseClient
                    .from('user_badges_new')
                    .select('*');

                const marketCounts = {};
                (marketCountRes || []).forEach(s => {
                    marketCounts[s.badge_id] = (marketCounts[s.badge_id] || 0) + 1;
                });

                if (!owned || owned.length === 0) {
                    listEl.innerHTML = '<p class="text-center text-muted py-3">対象のバッジを持っていません</p>';
                    return;
                }

                // 非売品（限定品）を除外
                let targetBadges = owned.filter(item => item.badges && item.badges.sales_type !== '限定品');

                // 譲渡モードの場合のみ換金品を除外
                if (mode === 'transfer') {
                    targetBadges = targetBadges.filter(item => item.badges && item.badges.sales_type !== '換金品');
                }

                if (targetBadges.length === 0) {
                    listEl.innerHTML = '<p class="text-center text-muted py-3">譲渡・売却可能なバッジを持っていません</p>';
                    return;
                }

                // 換金品と通常バッジを分離
                const convertibleGroups = new Map();
                const normalItems = [];

                targetBadges.forEach(item => {
                    if (!item.badges) return;

                    if (item.badges.sales_type === '換金品') {
                        const badgeId = item.badges.id;
                        if (!convertibleGroups.has(badgeId)) {
                            convertibleGroups.set(badgeId, {
                                badge: item.badges,
                                count: 0
                            });
                        }
                        convertibleGroups.get(badgeId).count++;
                    } else {
                        normalItems.push(item);
                    }
                });

                let htmlParts = [];

                // クリエイター名の取得
                const creatorIds = Array.from(new Set(targetBadges.map(item => item.badges?.discord_user_id).filter(Boolean)));
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

                // 換金品のHTML生成（グループ化）
                convertibleGroups.forEach(group => {
                    const badge = group.badge;
                    const count = group.count;
                    const sellPrice = badge.price;
                    const totalSell = sellPrice * count;

                    htmlParts.push(`
                        <div class="user-select-item" onclick="openConvertibleSellModal('${badge.id}', '${badge.name.replace(/'/g, "\\'")}', ${count}, ${sellPrice})">
                            <img src="${badge.image_url}" class="user-select-avatar" style="border-radius: 8px;">
                            <div class="flex-grow-1">
                                <div class="user-select-name">${badge.name} <span class="badge bg-dark">×${count}</span></div>
                                <div class="small text-muted" style="font-size: 0.75rem;">
                                    売却: 🪙${sellPrice.toLocaleString()} C × ${count} = 🪙${totalSell.toLocaleString()} C
                                </div>
                            </div>
                            <div class="text-danger fw-bold">売却</div>
                        </div>
                    `);
                });

                // 通常バッジの処理
                listEl.innerHTML = htmlParts.join('') + normalItems.map(item => {
                    const badge = item.badges;
                    if (!badge) return '';

                    const n = marketCounts[badge.id] || 0;

                    // 新レアリティシステムで計算
                    const badgeResult = BadgeUtils.calculateBadgeValues(badge, n, rarityThresholds);
                    const pValue = badgeResult.marketValue;

                    // 売却価格: 2段階下のレアリティ価格（ミュータントは3倍）
                    const pSell = badgeResult.sellPrice * (item.is_mutant ? 3 : 1);
                    const buyPrice = item.purchased_price || 0;
                    const rarityName = badgeResult.rarityName || '';
                    const sellStar = Math.max((badgeResult.starLevel || 1) - 2, 1);
                    const sellRarity = rarityThresholds?.[sellStar - 1]?.rarity_name || rarityName;
                    const creatorInfo = creatorMap.get(badge.discord_user_id) || { name: '不明', avatar: '' };
                    const creatorName = creatorInfo.name;
                    const creatorAvatar = creatorInfo.avatar;

                    const mutantLabel = item.is_mutant ? '<span class="text-warning fw-bold">(Mutant)</span>' : '';

                    if (mode === 'transfer') {
                        return `
                    <div class="user-select-item" onclick="openUUIDTransferModal('${item.uuid}', '${badge.name.replace(/'/g, "\\'")}', ${buyPrice}, ${pValue}, ${pSell})">
                        <img src="${badge.image_url}" class="user-select-avatar" style="border-radius: 8px;">
                                <div class="flex-grow-1">
                                    <div class="user-select-name">${badge.name} ${mutantLabel}</div>
                                    <div class="small text-muted" style="font-size: 0.75rem;">
                                        購入: 🪙${buyPrice.toLocaleString()} | 
                                        時価: 🪙${pValue.toLocaleString()} | 
                                        売却: 🪙${pSell.toLocaleString()}
                                    </div>
                                </div>
                                <div class="text-primary fw-bold">選択</div>
                            </div>
                    `;
                    } else {
                        return `
                    <div class="user-select-item" onclick="sellBadgeConfirm('${item.uuid}', '${badge.name.replace(/'/g, "\\'")}', ${buyPrice}, ${pValue}, ${pSell}, '${badge.sales_type || ''}', '${creatorName.replace(/'/g, "\\'")}', '${creatorAvatar.replace(/'/g, "\\'")}', ${n}, '${rarityName.replace(/'/g, "\\'")}', '${sellRarity.replace(/'/g, "\\'")}')">
                        <img src="${badge.image_url}" class="user-select-avatar" style="border-radius: 8px;">
                                <div class="flex-grow-1">
                                    <div class="user-select-name">${badge.name} ${mutantLabel}</div>
                                    <div class="small text-muted" style="font-size: 0.75rem;">
                                        購入: 🪙${buyPrice.toLocaleString()} | 
                                        時価: 🪙${pValue.toLocaleString()} | 
                                        売却: 🪙${pSell.toLocaleString()}
                                    </div>
                                </div>
                                <div class="text-danger fw-bold">売却</div>
                            </div>
                    `;
                    }
                }).join('');
            } catch (err) {
                console.error('Error loading action badges:', err);
                listEl.innerHTML = '<p class="text-center text-danger py-3">エラーが発生しました</p>';
            }
        }

        // ======= バッジ売却・譲渡 =======
        let currentActionUUID = null;
        let currentActionBadgeName = null;
        let currentActionDetails = null;

        function sellBadgeConfirm(uuid, name, purchasedPrice, pValue, pSell, salesType, creatorName, creatorAvatar, circulation, rarityName, sellRarity) {
            currentActionUUID = uuid;
            currentActionBadgeName = name;

            // 安全な数値変換とデフォルト値設定
            const pPrice = Number(purchasedPrice) || 0;
            const pVal = Number(pValue) || 0;
            const sPrice = Number(pSell) || 0;
            const profit = sPrice - pPrice;
            const profitStr = (profit >= 0 ? '+' : '') + profit.toLocaleString();

            const typeLabel = salesType || '固定型';
            const rarityLabel = rarityName || '';
            const sellRarityLabel = sellRarity || rarityLabel;
            const rarityClass = rarityLabel ? getRarityClass(rarityLabel) : '';

            const isFree = pPrice <= 0;
            const purchaseLabel = isFree ? '無料' : `${rarityLabel}🪙${pPrice.toLocaleString()}`;
            const assetLabel = (salesType === '換金品')
                ? `🪙${pVal.toLocaleString()}`
                : `${rarityLabel}🪙${pVal.toLocaleString()}`;
            const sellLabel = (salesType === '換金品')
                ? `🪙${sPrice.toLocaleString()}`
                : `${sellRarityLabel}🪙${sPrice.toLocaleString()}`;
            const creatorAvatarHtml = creatorAvatar
                ? `<img src="${creatorAvatar}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;">`
                : '';
            const profitClass = profit < 0 ? 'profit-negative' : '';

            const content = `
                <h5 class="fw-bold mb-2">売却の確認</h5>
                <div class="fw-bold mb-1">${name}</div>
                <div class="d-flex justify-content-center gap-2 flex-wrap mb-2">
                    ${rarityLabel ? `<span class="rarity-pill ${rarityClass}" style="background: rgba(0,0,0,0.2);">${rarityLabel}</span>` : ''}
                    <span class="badge badge-type-pill ${typeLabel === '変動型' ? 'rarity-epic' : 'bg-light text-dark border'}">${typeLabel}</span>
                    <span class="creator-pill">${creatorAvatarHtml}<span>${creatorName || '不明'}</span></span>
                </div>
                <div class="text-muted mb-3">流通数：${circulation || 0}枚</div>
                <div class="text-start sell-detail-large">
                    <div>購入額：${purchaseLabel}</div>
                    <div>資産価値：${assetLabel}</div>
                    <div>売却額：${sellLabel}</div>
                    <div class="fw-bold mt-2 ${profitClass}">損益：🪙${profitStr}</div>
                </div>
            `;

            // 選択モーダルを閉じる
            const modalEl = document.getElementById('badgeActionModal');
            if (modalEl) {
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
            }
            showShopActionModal(content, executeSellUUID, '売却する');
        }

        let isSellingBadge = false;
        async function executeSellUUID() {
            if (isSellingBadge) return;
            isSellingBadge = true;
            toggleLoading(true);
            try {
                let badgeIdForLog = null;
                try {
                    const { data: bInfo } = await supabaseClient
                        .from('user_badges_new')
                        .select('badge_id')
                        .eq('uuid', currentActionUUID)
                        .single();
                    badgeIdForLog = bInfo?.badge_id || null;
                } catch (err) {
                    console.warn('売却前badge_id取得失敗:', err);
                }

                const { data, error } = await supabaseClient.rpc('sell_badge_v2', {
                    p_user_id: targetId,
                    p_badge_uuid: currentActionUUID
                });

                if (error) throw error;
                if (!data.ok) throw new Error(data.error);

                alert(`バッジを 🪙${data.sell_price.toLocaleString()} で売却しました。`);
                // 活動ログ記録
                if (typeof logActivity === 'function') {
                    await logActivity(targetId, 'badge_sell', {
                        amount: data.sell_price,
                        badgeId: badgeIdForLog,
                        details: { badge_uuid: currentActionUUID, badge_name: currentActionBadgeName }
                    });
                }
                // モーダルを閉じる
                const modalEl = document.getElementById('badgeActionModal');
                if (modalEl) {
                    const modal = bootstrap.Modal.getInstance(modalEl);
                    if (modal) modal.hide();
                }
                loadOwnedBadges();
                loadActivityLogs();
                // 自分の情報を再読み込み
                const user = await getCurrentUser();
                if (user) displayMyInfo(user);
            } catch (err) {
                console.error('売却エラー:', err);
                alert('売却に失敗しました: ' + err.message);
            } finally {
                toggleLoading(false);
                isSellingBadge = false;
            }
        }

        // ============ 換金品の売却 ============
        let isSellingConvertible = false;
        async function openConvertibleSellModal(badgeId, badgeName, totalCount, fixedPrice) {
            const quantity = prompt(`「${badgeName}」を何個売却しますか？（所持数: ${totalCount} 個、売却価格: ${fixedPrice.toLocaleString()} C / 個）`, '1');

            if (!quantity) return;

            const count = parseInt(quantity);
            if (isNaN(count) || count <= 0) {
                alert('有効な個数を入力してください。');
                return;
            }

            if (count > totalCount) {
                alert(`所持数（${totalCount} 個）を超えています。`);
                return;
            }

            const totalPrice = fixedPrice * count;
            if (!confirm(`「${badgeName}」を ${count} 個売却しますか？（合計: 💰${totalPrice.toLocaleString()} C）`)) return;

            if (isSellingConvertible) return;
            isSellingConvertible = true;
            toggleLoading(true);
            try {
                // 所持している換金品の UUID を取得
                const { data: ownedItems, error: fetchError } = await supabaseClient
                    .from('user_badges_new')
                    .select('uuid')
                    .eq('user_id', targetId)
                    .eq('badge_id', badgeId)
                    .limit(count);

                if (fetchError) throw fetchError;
                if (!ownedItems || ownedItems.length < count) throw new Error('指定した数のバッジが見つかりません。');

                // 一つずつ売却
                let successCount = 0;
                for (const item of ownedItems) {
                    const { data, error } = await supabaseClient.rpc('sell_badge_v2', {
                        p_user_id: targetId,
                        p_badge_uuid: item.uuid
                    });

                    if (error || !data.ok) {
                        console.error('売却エラー:', error || data.error);
                        continue;
                    }
                    successCount++;
                }

                if (successCount > 0) {
                    const actualTotalPrice = fixedPrice * successCount;
                    alert(`「${badgeName}」を ${successCount} 個売却しました。（合計: 💰${actualTotalPrice.toLocaleString()} C）`);

                    // 活動ログ記録
                    if (typeof logActivity === 'function') {
                        await logActivity(targetId, 'badge_sell', {
                            amount: actualTotalPrice,
                            badgeId: badgeId,
                            details: {
                                badge_id: badgeId,
                                badge_name: badgeName,
                                quantity: successCount,
                                unit_price: fixedPrice
                            }
                        });
                    }

                    // モーダルを閉じる
                    const modalEl = document.getElementById('badgeActionModal');
                    if (modalEl) {
                        const modal = bootstrap.Modal.getInstance(modalEl);
                        if (modal) modal.hide();
                    }
                    loadOwnedBadges();
                    loadActivityLogs();
                    loadTargetUserInfo(); // 装着バッジが売却された場合自動で外す
                    const user = await getCurrentUser();
                    if (user) displayMyInfo(user);
                } else {
                    throw new Error('売却に失敗しました。');
                }
            } catch (err) {
                console.error('換金品売却エラー:', err);
                alert('売却に失敗しました: ' + err.message);
            } finally {
                toggleLoading(false);
                isSellingConvertible = false;
            }
        }

        function openUUIDTransferModal(uuid, name, purchasedPrice, pValue, pSell) {
            currentActionUUID = uuid;
            currentActionBadgeName = name;

            // 譲渡時にも詳細情報を表示するために詳細文字列を構築
            currentActionDetails =
                `・購入額: 🪙 ${purchasedPrice.toLocaleString()} \n` +
                `・現在価値: 🪙 ${pValue.toLocaleString()} \n` +
                `・期待売却額: 🪙 ${pSell.toLocaleString()} \n` +
                `--------------------------\n` +
                `※譲渡するとあなたの手元からはなくなります。`;

            // 選択モーダルを閉じる
            const modalEl = document.getElementById('badgeActionModal');
            if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
            openUserSelectModal('badge_transfer');
        }

        // 譲渡実行のオーバーライド（共有されている openUserSelectModal から呼ばれる）
        // 既存の executeTransferConfirmation は badge_id ベースの可能性があるため、UUID対応版に差し替えが必要な場合は
        // ここで再定義するか、グローバルに調整する。mypage/index.html 内に定義されている場合、それを上書きする。

        // ============ バッジ装着 ============
        let selectedBadgeIdForEquip = null;

        function selectBadgeInModal(badgeId) {
            selectedBadgeIdForEquip = badgeId;
            document.querySelectorAll('#badge-modal-list .badge-item').forEach(el => {
                el.classList.remove('selected');
            });
            const targetEl = document.querySelector(`.badge-item[data-badge-id="${badgeId}"]`);
            if (targetEl) targetEl.classList.add('selected');

            const btn = document.getElementById('btn-execute-equip');
            if (btn) btn.disabled = false;
        }

        async function executeSelectedEquip() {
            if (!selectedBadgeIdForEquip) return;
            const posRadio = document.querySelector('input[name="badge-position"]:checked');
            const position = posRadio ? posRadio.value : 'left';

            toggleLoading(true);
            await equipBadge(selectedBadgeIdForEquip, position);
            toggleLoading(false);

            selectedBadgeIdForEquip = null;
        }

        async function equipBadge(badgeId, position = null) {
            if (isViewMode) return;

            // positionが指定されていない場合はラジオボタンの値を取得
            if (!position) {
                const posRadio = document.querySelector('input[name="badge-position"]:checked');
                position = posRadio ? posRadio.value : 'left';
            }

            const columnName = position === 'right' ? 'equipped_badge_id_right' : 'equipped_badge_id';

            // 現在の装着状況を確認
            const { data: current } = await supabaseClient
                .from('profiles')
                .select('equipped_badge_id, equipped_badge_id_right')
                .eq('discord_user_id', targetId)
                .maybeSingle();

            // 同じバッジをクリックした場合は外す
            const currentBadgeId = position === 'right' ? current?.equipped_badge_id_right : current?.equipped_badge_id;
            const oppositeBadgeId = position === 'right' ? current?.equipped_badge_id : current?.equipped_badge_id_right;
            const oppositeColumn = position === 'right' ? 'equipped_badge_id' : 'equipped_badge_id_right';

            const newBadgeId = (currentBadgeId === badgeId) ? null : badgeId;

            // 反対側のスロットに同じバッジが装着されている場合は移動（反対側を外す）
            let updateData = { [columnName]: newBadgeId };
            if (badgeId && badgeId === oppositeBadgeId) {
                updateData[oppositeColumn] = null; // 反対側を外す
            }

            try {
                const { error } = await supabaseClient
                    .from('profiles')
                    .update(updateData)
                    .eq('discord_user_id', targetId);

                if (error) throw error;

                await loadOwnedBadges(); // リスト更新
                await loadTargetUserInfo(); // 名前横のバッジ更新

                // モーダルを閉じる
                const modalEl = document.getElementById('badgeChangeModal');
                bootstrap.Modal.getInstance(modalEl)?.hide();
            } catch (err) {
                console.error('装着エラー:', err);
                alert('バッジの変更に失敗しました');
            }
        }

        // 装着バッジの変更モーダル
        async function openBadgeChangeModal() {
            selectedBadgeIdForEquip = null;
            const btnExec = document.getElementById('btn-execute-equip');
            if (btnExec) btnExec.disabled = true;

            const listEl = document.getElementById('badge-modal-list');
            listEl.innerHTML = '<p class="text-center text-muted py-3">読み込み中...</p>';

            // ラジオボタンのイベントリスナー（1回だけ設定）
            const posRadios = document.querySelectorAll('input[name="badge-position"]');
            posRadios.forEach(radio => {
                if (!radio.dataset.listenerAdded) {
                    radio.addEventListener('change', (e) => {
                        const indicator = document.getElementById('badge-position-indicator');
                        if (indicator) {
                            indicator.textContent = e.target.value === 'left' ? '◀ 左に装着' : '右に装着 ▶';
                        }
                    });
                    radio.dataset.listenerAdded = "true";
                }
            });

            // 初期化
            const leftRadio = document.getElementById('pos-left');
            const indicator = document.getElementById('badge-position-indicator');
            if (indicator) {
                if (leftRadio && leftRadio.checked) {
                    indicator.textContent = '◀ 左に装着';
                } else {
                    indicator.textContent = '右に装着 ▶';
                }
            }

            const modalEl = document.getElementById('badgeChangeModal');
            const modal = new bootstrap.Modal(modalEl);
            modal.show();

            try {
                // 所持バッジ（ユニークなIDのみ抽出）
                const { data: owned, error } = await supabaseClient
                    .from('user_badges_new')
                    .select('badge_id, badges(*)')
                    .eq('user_id', targetId);

                if (error) throw error;

                const uniqueBadges = [];
                const seen = new Set();
                owned.forEach(item => {
                    if (item.badges && !seen.has(item.badge_id)) {
                        uniqueBadges.push(item.badges);
                        seen.add(item.badge_id);
                    }
                });

                const { data: profile } = await supabaseClient
                    .from('profiles').select('equipped_badge_id, equipped_badge_id_right').eq('discord_user_id', targetId).maybeSingle();
                const equippedLeftId = profile?.equipped_badge_id;
                const equippedRightId = profile?.equipped_badge_id_right;

                if (uniqueBadges.length === 0) {
                    listEl.innerHTML = '<p class="text-center text-muted py-3">バッジを持っていません</p>';
                    return;
                }

                listEl.innerHTML = uniqueBadges.map(badge => {
                    const isEquippedLeft = badge.id === equippedLeftId;
                    const isEquippedRight = badge.id === equippedRightId;
                    const isEquipped = isEquippedLeft || isEquippedRight;

                    let posLabel = '';
                    if (isEquippedLeft) posLabel = '◀左';
                    if (isEquippedRight) posLabel = '右▶';
                    if (isEquippedLeft && isEquippedRight) posLabel = '◀左右▶';

                    return `
                    <div class="col-4 col-md-3 text-center" >
                            <div class="badge-item ${isEquipped ? 'equipped' : ''}"
                                data-badge-id="${badge.id}"
                                onclick="selectBadgeInModal('${badge.id}')"
                                style="cursor: pointer; position: relative;"
                                title="${badge.name}${isEquipped ? ' (装着中)' : ''}">
                                <img src="${badge.image_url}" alt="${badge.name}" style="width: 60px; height: 60px; object-fit: contain;">
                                ${isEquipped ? `<span class="position-absolute top-0 start-50 translate-middle badge bg-primary" style="font-size: 0.6rem; z-index: 10;">${posLabel}</span>` : ''}
                            </div>
                            <div class="small text-truncate mt-1" style="font-size: 0.7rem;">${badge.name}</div>
                        </div>
                    `;
                }).join('');
            } catch (err) {
                console.error('バッジ読み込みエラー:', err);
                listEl.innerHTML = '<p class="text-center text-danger py-3">エラーが発生しました</p>';
            }
        }

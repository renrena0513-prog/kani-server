        let currentSelectMode = '';
        async function openUserSelectModal(mode) {
            currentSelectMode = mode;
            const listEl = document.getElementById('transfer-user-list');
            listEl.innerHTML = '<p class="text-center text-muted py-3">読み込み中...</p>';
            new bootstrap.Modal(document.getElementById('userSelectModal')).show();

            try {
                const { data: profiles, error } = await supabaseClient
                    .from('profiles')
                    .select('discord_user_id, account_name, avatar_url, equipped_badge_id, badges!equipped_badge_id(image_url)')
                    .neq('discord_user_id', targetId)
                    .order('account_name');

                if (error) throw error;
                listEl.innerHTML = profiles.map(p => `
                    <div class="user-select-item" onclick="confirmSelection('${p.discord_user_id}', '${p.account_name.replace(/'/g, "\\'")}')">
                        <img src="${p.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png'}" class="user-select-avatar">
                        <span class="user-select-name">${p.account_name}</span>
                        ${p.badges ? `<img src="${p.badges.image_url}" class="user-select-badge">` : ''}
                    </div>
                `).join('');
            } catch (err) {
                listEl.innerHTML = '<p class="text-center text-danger py-3">読み込み失敗</p>';
            }
        }

        let selectedToUserId = '';
        let selectedToUserName = '';
        function confirmSelection(id, name) {
            selectedToUserId = id;
            selectedToUserName = name;
            bootstrap.Modal.getInstance(document.getElementById('userSelectModal'))?.hide();
            if (currentSelectMode === 'coin_transfer') {
                document.getElementById('coin-transfer-target-name').textContent = `${name} さんへ送金`;
                // 所持金を表示に反映
                const myProfile = allProfiles.find(p => p.discord_user_id === targetId);
                const currentCoins = (myProfile && myProfile.coins !== undefined) ? myProfile.coins : 0;
                const coinsRefEl = document.getElementById('my-coins-ref');
                if (coinsRefEl) coinsRefEl.textContent = currentCoins.toLocaleString();

                new bootstrap.Modal(document.getElementById('coinAmountModal')).show();
            } else if (currentSelectMode === 'badge_transfer') {
                if (typeof showBadgeTransferConfirm === 'function') {
                    showBadgeTransferConfirm(id, name);
                } else {
                    const msg = `「${currentActionBadgeName}」を ${name} さんに譲渡しますか？\n\n` +
                        (currentActionDetails || '');
                    if (confirm(msg)) {
                        executeBadgeTransfer(id, name);
                    }
                }
            } else if (currentSelectMode === 'ticket_transfer') {
                executeTicketTransfer(id, name);
            } else if (currentSelectMode === 'gacha_ticket_transfer') {
                executeGachaTicketTransfer(id, name);
            }
        }

        async function executeBadgeTransfer(toUserId, toUserName) {
            toggleLoading(true);
            try {
                // 1. バッジの user_id を変更
                const { error: updateError } = await supabaseClient
                    .from('user_badges_new')
                    .update({ user_id: toUserId })
                    .eq('uuid', currentActionUUID);

                if (updateError) throw updateError;

                // 2. 活動ログを記録
                if (typeof logActivity === 'function') {
                    const sender = allProfiles.find(p => p.discord_user_id === targetId);
                    const senderName = sender?.account_name || '誰か';

                    // バッジID(整数)を取得
                    const { data: bInfo } = await supabaseClient.from('user_badges_new').select('badge_id').eq('uuid', currentActionUUID).single();
                    const bId = bInfo?.badge_id;

                    await logActivity(targetId, 'badge_transfer', {
                        badgeId: bId, // UUIDではなく整数IDを渡す
                        targetUserId: toUserId,
                        details: { target_name: toUserName, badge_name: currentActionBadgeName, badge_uuid: currentActionUUID }
                    });
                    await logActivity(toUserId, 'badge_receive', {
                        badgeId: bId, // UUIDではなく整数IDを渡す
                        targetUserId: targetId,
                        details: { sender_name: senderName, badge_name: currentActionBadgeName, badge_uuid: currentActionUUID }
                    });
                }

                alert(`${toUserName} さんにバッジを譲渡しました！`);
                // ヘッダーの所持金・バッジ情報も更新
                await loadOwnedBadges();
                await loadTargetUserInfo(); // 装着バッジが譲渡された場合自動で外す
                await loadActivityLogs();
                if (!isViewMode) {
                    const user = await getCurrentUser();
                    if (user) await displayMyInfo(user);
                }
            } catch (err) {
                console.error('譲渡エラー:', err);
                alert('譲渡に失敗しました');
            } finally {
                toggleLoading(false);
            }
        }

        async function executeCoinTransfer() {
            const amount = parseInt(document.getElementById('coin-transfer-amount').value);
            if (!amount || amount <= 0) return alert('金額を入力してください');

            toggleLoading(true);
            try {
                const { data, error } = await supabaseClient.rpc('transfer_coins', {
                    p_amount: amount,
                    p_from_id: targetId,
                    p_to_id: selectedToUserId
                });

                if (error) throw error;
                if (!data.ok) throw new Error(data.error || '送金に失敗しました');

                alert(`${selectedToUserName} さんに 🪙${amount.toLocaleString()} 送金しました。`);
                // 活動ログ記録
                if (typeof logActivity === 'function') {
                    const sender = allProfiles.find(p => p.discord_user_id === targetId);
                    const senderName = sender?.account_name || '誰か';

                    await logActivity(targetId, 'transfer_send', {
                        amount: -amount, // 送金はマイナス
                        targetUserId: selectedToUserId,
                        details: { target_name: selectedToUserName }
                    });
                    await logActivity(selectedToUserId, 'transfer_receive', {
                        amount: amount,
                        targetUserId: targetId,
                        details: { sender_name: senderName }
                    });
                }

                // UI更新
                if (!isViewMode) {
                    const user = await getCurrentUser();
                    if (user) await displayMyInfo(user);
                }
                await loadOwnedBadges();
                await loadActivityLogs();
            } catch (err) {
                console.error('送金エラー:', err);
                alert('送金失敗: ' + (err.message || '不明なエラー'));
            } finally {
                toggleLoading(false);
            }
        }

        /**
         * 引換券の譲渡実行
         */
        async function executeTicketTransfer(toUserId, toUserName) {
            const amountStr = prompt(`「${currentTicketRarity}引換券」を何枚譲渡しますか？ (最大: ${currentTicketMax}枚)`, "1");
            if (amountStr === null) return; // キャンセル
            const amount = parseInt(amountStr);
            if (isNaN(amount) || amount <= 0) return alert('有効な枚数を入力してください');
            if (amount > currentTicketMax) return alert('所持数以上の枚数は譲渡できません');

            toggleLoading(true);
            try {
                const { data, error } = await supabaseClient.rpc('transfer_exchange_tickets', {
                    p_from_id: targetId,
                    p_to_id: toUserId,
                    p_rarity: currentTicketRarity,
                    p_amount: amount
                });

                if (error) throw error;
                if (!data.ok) throw new Error(data.error);

                alert(`${toUserName} さんに ${currentTicketRarity}引換券 を ${amount}枚 譲渡しました！`);

                // 活動ログ記録
                if (typeof logActivity === 'function') {
                    const sender = allProfiles.find(p => p.discord_user_id === targetId);
                    const senderName = sender?.account_name || '誰か';

                    await logActivity(targetId, 'badge_transfer', {
                        amount: 0,
                        targetUserId: toUserId,
                        details: { target_name: toUserName, badge_name: `${currentTicketRarity}引換券 x${amount}` }
                    });
                    await logActivity(toUserId, 'badge_receive', {
                        amount: 0,
                        targetUserId: targetId,
                        details: { sender_name: senderName, badge_name: `${currentTicketRarity}引換券 x${amount}` }
                    });
                }

                // UI更新
                await openPossessionsModal();
                await loadActivityLogs();
            } catch (err) {
                console.error('引換券譲渡エラー:', err);
                alert('譲渡に失敗しました: ' + (err.message || '不明なエラー'));
            } finally {
                toggleLoading(false);
            }
        }

        /**
         * 祈願符の譲渡実行
         */
        async function executeGachaTicketTransfer(toUserId, toUserName) {
            const amountStr = prompt(`「祈願符」を何枚譲渡しますか？ (最大: ${currentTicketMax}枚)`, "1");
            if (amountStr === null) return;
            const amount = parseInt(amountStr);
            if (isNaN(amount) || amount <= 0) return alert('有効な枚数を入力してください');
            if (amount > currentTicketMax) return alert('所持数以上の枚数は譲渡できません');

            toggleLoading(true);
            try {
                const { data, error } = await supabaseClient.rpc('transfer_gacha_tickets', {
                    p_from_id: targetId,
                    p_to_id: toUserId,
                    p_amount: amount
                });

                if (error) throw error;
                if (!data.ok) throw new Error(data.error);

                alert(`${toUserName} さんに 祈願符 を ${amount}枚 譲渡しました！`);

                // 活動ログ記録
                if (typeof logActivity === 'function') {
                    const sender = allProfiles.find(p => p.discord_user_id === targetId);
                    const senderName = sender?.account_name || '誰か';

                    await logActivity(targetId, 'badge_transfer', {
                        amount: 0,
                        targetUserId: toUserId,
                        details: { target_name: toUserName, badge_name: `祈願符 x${amount}` }
                    });
                    await logActivity(toUserId, 'badge_receive', {
                        amount: 0,
                        targetUserId: targetId,
                        details: { sender_name: senderName, badge_name: `祈願符 x${amount}` }
                    });
                }

                // UI更新
                await openPossessionsModal();
                await loadActivityLogs();
                // 表示されている祈願符枚数も更新
                const countEl = document.getElementById('user-tickets-value');
                if (countEl) {
                    const current = parseInt(countEl.textContent.replace(/,/g, '')) || 0;
                    countEl.textContent = (current - amount).toLocaleString();
                }
            } catch (err) {
                console.error('祈願符譲渡エラー:', err);
                alert('譲渡に失敗しました: ' + (err.message || '不明なエラー'));
            } finally {
                toggleLoading(false);
            }
        }
        function openCoinTransferModal() { openUserSelectModal('coin_transfer'); }

        /**
         * 所持品モーダルを開く
         */
        async function openPossessionsModal() {
            const { data: profile, error } = await supabaseClient
                .from('profiles')
                .select('gacha_tickets, exchange_tickets')
                .eq('discord_user_id', targetId)
                .maybeSingle();

            if (error) {
                console.error('所持品取得エラー:', error);
                return;
            }

            const gachaTickets = profile?.gacha_tickets || 0;
            document.getElementById('modal-tickets-count').textContent = gachaTickets.toLocaleString();

            const ticketsParent = document.getElementById('modal-tickets-count').parentElement.parentElement;
            if (!isViewMode && gachaTickets > 0 && !document.getElementById('gacha-ticket-transfer-btn')) {
                const transferBtn = document.createElement('button');
                transferBtn.id = 'gacha-ticket-transfer-btn';
                transferBtn.className = 'btn btn-sm btn-outline-warning rounded-pill py-0 px-2 ms-2';
                transferBtn.style.fontSize = '0.65rem';
                transferBtn.textContent = '🎁 譲渡';
                transferBtn.onclick = () => {
                    currentTicketMax = gachaTickets;
                    const modalEl = document.getElementById('possessionsModal');
                    bootstrap.Modal.getInstance(modalEl)?.hide();
                    openUserSelectModal('gacha_ticket_transfer');
                };
                document.getElementById('modal-tickets-count').parentElement.appendChild(transferBtn);
            } else if (gachaTickets <= 0 && document.getElementById('gacha-ticket-transfer-btn')) {
                document.getElementById('gacha-ticket-transfer-btn').remove();
            }

            const listEl = document.getElementById('exchange-tickets-list');
            const exchanges = profile?.exchange_tickets || {};

            if (Object.keys(exchanges).length === 0) {
                listEl.innerHTML = '<div class="col-12 text-center text-muted py-3">所持している引換券はありません</div>';
            } else {
                listEl.innerHTML = Object.entries(exchanges).map(([rarity, count]) => {
                    if (count <= 0) return '';
                    const rarityClass = getRarityClass(rarity);
                    return `
                        <div class="col-6 mb-3">
                            <div class="card shadow-sm border-0 ${rarityClass} p-2 text-center position-relative" style="border-radius: 12px; border: 1px solid rgba(0,0,0,0.1) !important;">
                                <div class="small fw-bold opacity-75 mb-1">${rarity}引換券</div>
                                <div class="d-flex align-items-center justify-content-center gap-2 mb-2">
                                    <span style="font-size: 1.2rem;">🎫</span>
                                    <div class="fs-5 fw-bold">${count}枚</div>
                                </div>
                                ${!isViewMode ? `
                                    <button class="btn btn-sm btn-outline-dark rounded-pill py-0 px-2" style="font-size: 0.65rem;" 
                                        onclick="initTicketTransfer('${rarity}', ${count})">
                                        🎁 譲渡
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                    `;
                }).join('');
            }

            const modal = new bootstrap.Modal(document.getElementById('possessionsModal'));
            modal.show();
        }

        let currentTicketRarity = '';
        let currentTicketMax = 0;
        function initTicketTransfer(rarity, count) {
            currentTicketRarity = rarity;
            currentTicketMax = count;
            // 所持品モーダルを閉じる
            const modalEl = document.getElementById('possessionsModal');
            bootstrap.Modal.getInstance(modalEl)?.hide();
            openUserSelectModal('ticket_transfer');
        }

        // ============ 最近の活動ログの読み込み ============
        let activityPage = 0;
        const ACTIVITY_PER_PAGE = 10;

        async function loadActivityLogs(page = 1) {
            const listEl = document.getElementById('activity-list');
            const paginationEl = document.getElementById('activity-pagination');
            const section = document.getElementById('activity-section');
            if (!listEl) return;

            const itemsPerPage = 10;
            const from = (page - 1) * itemsPerPage;
            const to = from + itemsPerPage - 1;

            console.log('--- loadActivityLogs start ---', { targetId, page, from, to });

            try {
                const targetProfile = allProfiles.find(u => u.discord_user_id === targetId);
                const targetName = targetProfile?.account_name;
                const actionFilter = document.getElementById('activity-action-filter')?.value || 'all';

                // バッジ情報の取得 (gacha_draw表示用) - これはキャッシュしてもいいが一旦そのまま
                let badgeMap = {};
                try {
                    const { data: badgesData } = await supabaseClient
                        .from('badges')
                        .select('id, name, image_url');
                    if (badgesData) {
                        badgesData.forEach(b => badgeMap[b.id] = b);
                    }
                } catch (e) { console.error('バッジ情報取得エラー:', e); }

                // サーバーサイド・フィルタリングを適用
                // 1. 活動ログ (送金・おみくじ等)
                let logsQuery = supabaseClient
                    .from('activity_logs')
                    .select('*', { count: 'exact' })
                    .eq('user_id', targetId) // 最初から本人のみ
                    .order('created_at', { ascending: false });

                // 不要なログを除外（queryで除外できるものはここでする）
                // mahjong(DB用), admin_edit, badge_equip は表示しない
                logsQuery = logsQuery.not('action_type', 'eq', 'mahjong')
                    .not('action_type', 'eq', 'admin_edit')
                    .not('action_type', 'eq', 'badge_equip');

                // フィルター適用
                if (actionFilter !== 'all') {
                    if (actionFilter === 'transfer') {
                        logsQuery = logsQuery.in('action_type', ['transfer_send', 'transfer_receive']);
                    } else if (actionFilter === 'badge') {
                        logsQuery = logsQuery.in('action_type', ['badge_transfer', 'badge_receive', 'badge_sell', 'badge_purchase']);
                    } else if (actionFilter === 'mahjong') {
                        // 麻雀記録はここでは取得しない（matchesで取得）
                        logsQuery = logsQuery.eq('action_type', 'none_xyz');
                    } else {
                        logsQuery = logsQuery.eq('action_type', actionFilter);
                    }
                }

                // 2. 麻雀記録 (discord_user_id でフィルタ)
                let matchesQuery = supabaseClient
                    .from('match_results')
                    .select('*', { count: 'exact' })
                    .eq('discord_user_id', targetId)
                    .order('event_datetime', { ascending: false });

                // 麻雀フィルター時はログを取得しない
                const showMatches = actionFilter === 'all' || actionFilter === 'mahjong';

                // 3. 過去大会データ (discord_user_id でフィルタ)
                let legacyQuery = supabaseClient
                    .from('tournament_player_stats_snapshot')
                    .select('*', { count: 'exact' })
                    .eq('discord_user_id', targetId);

                // 同時実行して結果をマージするが、ページネーションのためにある程度多めに取得する。
                // 複数のテーブルをマージする場合、正確なページネーションは難しいが、
                // 本人のデータのみに絞っているため、以前の500件よりは全件に近いデータが取得できる。
                const [logsRes, matchesRes, legacyRes] = await Promise.all([
                    logsQuery.limit(200),
                    showMatches ? matchesQuery.limit(200) : Promise.resolve({ data: [] }),
                    showMatches ? legacyQuery.limit(100) : Promise.resolve({ data: [] })
                ]);

                let combined = [];

                if (logsRes.data) {
                    logsRes.data.forEach(l => {
                        let details = l.details;
                        if (typeof details === 'string') { try { details = JSON.parse(details); } catch (e) { } }
                        if (details?.is_internal) return; // 内部的なものは除外
                        combined.push({ ...l, details, timestamp: new Date(l.created_at), isMatch: false });
                    });
                }

                if (matchesRes.data) {
                    matchesRes.data.forEach(m => {
                        combined.push({
                            action_type: 'mahjong', amount: null, match_id: m.match_id,
                            timestamp: new Date(m.event_datetime),
                            details: {
                                rank: m.rank,
                                final_score: m.final_score,
                                mode: m.mahjong_mode,
                                tournament_type: m.tournament_type,
                                match_mode: m.match_mode
                            },
                            isMatch: true
                        });
                    });
                }

                if (legacyRes.data) {
                    legacyRes.data.forEach(m => {
                        combined.push({
                            action_type: 'mahjong', amount: null, match_id: 'legacy-' + Math.random(),
                            timestamp: new Date(m.created_at || m.updated_at || '2024-01-01'),
                            details: {
                                rank: null,
                                final_score: m.score_total,
                                mode: '【第一回麻雀大会】',
                                is_legacy: true
                            },
                            isMatch: true
                        });
                    });
                }

                combined.sort((a, b) => b.timestamp - a.timestamp);

                if (combined.length === 0) {
                    listEl.innerHTML = `<div class="text-center text-muted py-3" > 活動ログはまだありません</div> `;
                    section.style.display = 'block';
                    paginationEl.style.display = 'none';
                    return;
                }

                section.style.display = 'block';

                // ページネーション（マージした後の仮想ページネーション）
                const totalPages = Math.ceil(combined.length / itemsPerPage);
                const pageItems = combined.slice((page - 1) * itemsPerPage, page * itemsPerPage);

                const typeNames = {
                    'mahjong': '🀄 麻雀記録',
                    'transfer_send': '💸 送金(送)',
                    'transfer_receive': '🧧 送金(受)',
                    'badge_transfer': '🎁 バッジ譲渡',
                    'badge_receive': '📦 バッジ受取',
                    'badge_sell': '💴 バッジ売却',
                    'badge_purchase': '🛒 バッジ購入',
                    'omikuji': '🎋 おみくじ',
                    'royalty_receive': '💎 売上還元',
                    'gacha_draw': '⛩️ お賽銭'
                };

                listEl.innerHTML = pageItems.map(log => {
                    const date = log.timestamp.toLocaleString('ja-JP', {
                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                    });
                    const typeName = typeNames[log.action_type] || log.action_type;

                    // 金額表示の構築
                    let amountStr = '';
                    if (log.isMatch) {
                        // 麻雀の場合はスコアを右側に表示
                        const score = log.details?.final_score || 0;
                        const scoreFormatted = Number(score) >= 0 ? `+${score}` : `${score}`;
                        amountStr = `<span class="text-secondary">${scoreFormatted} pts</span>`;
                    } else {
                        const isTicketOmikuji = log.action_type === 'omikuji' && log.details?.ticket_reward;
                        // ガチャでコイン0の場合は祈願符（チケット）使用なので🎫-1表示
                        const isTicketGacha = log.action_type === 'gacha_draw' && log.amount === 0;
                        amountStr = isTicketGacha ? '🎫 -1' : (log.amount !== null && (!isTicketOmikuji || log.amount !== 0)) ? `🪙 ${log.amount.toLocaleString()}` : '';
                    }

                    // 相手の情報を取得（基本は target_user_id。常に最新のプロフィールを参照）
                    const otherId = log.target_user_id;
                    const otherProfile = otherId ? allProfiles.find(p => p.discord_user_id === String(otherId)) : null;

                    const otherHtml = otherProfile ? `
                        <div class="d-inline-flex align-items-center gap-1 mx-1" >
                            <img src="${otherProfile.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png'}"
                                class="rounded-circle shadow-sm" style="width: 24px; height: 24px; object-fit: cover;">
                                <span class="fw-bold">${otherProfile.account_name || '誰か'}</span>
                            </div>` : (otherId ? ` <span class="badge bg-secondary" > ID: ${otherId}</span> ` : '');

                    let detailsStr = '';
                    if (log.isMatch) {
                        const rank = log.details?.rank;
                        const mode = log.details?.mode || ''; // mahjong_mode
                        const tType = log.details?.tournament_type || '';
                        const mMode = log.details?.match_mode || '';

                        // 大会種別の表示用ラベル
                        const tLabel = mMode ? `${mMode} ` : (tType.includes('個人') ? '個人戦' : (tType.includes('団体') ? '団体戦' : tType));
                        const tPrefix = tLabel ? `<span class="text-muted small me-1" > [${tLabel}]</span> ` : '';

                        // 過去大会（legacy）の場合は順位を非表示
                        const showRank = !log.details?.is_legacy && rank !== null && rank !== undefined;

                        detailsStr = `
                        <div class="d-inline-flex align-items-center flex-wrap" >
                            ${tPrefix}
                            <span class="fw-bold text-dark me-2">${mode}</span>
                            ${showRank ? `<span class="badge bg-primary bg-opacity-10 text-primary border border-primary border-opacity-25 me-2" style="font-size: 0.8rem;">${rank}位</span>` : ''}
                        </div>
                        `;
                    } else if (log.action_type === 'transfer_send') {
                        detailsStr = `➡ ${otherHtml} への送金`;
                    } else if (log.action_type === 'transfer_receive') {
                        detailsStr = `⬅ ${otherHtml} からの送金`;
                    } else if (log.action_type === 'badge_transfer') {
                        detailsStr = `🎁 「${log.details?.badge_name || 'バッジ'}」を ${otherHtml} へ譲渡`;
                    } else if (log.action_type === 'badge_receive') {
                        detailsStr = `📦 「${log.details?.badge_name || 'バッジ'}」を ${otherHtml} から受取`;
                    } else if (log.action_type === 'badge_sell') {
                        detailsStr = `💴 「${log.details?.badge_name || 'バッジ'}」を売却`;
                    } else if (log.action_type === 'badge_purchase') {
                        detailsStr = `🛒 「${log.details?.badge_name || 'バッジ'}」を購入`;
                    } else if (log.action_type === 'omikuji') {
                        const tr = log.details?.ticket_reward;
                        const rank = log.details?.rank || '不明';
                        if (tr) {
                            detailsStr = `🎋 運勢: <strong>${rank}</strong> <span class="badge bg-warning text-dark ms-1" style="font-size: 0.75rem;">🎫 +${tr}枚 祈願符</span>`;
                        } else {
                            detailsStr = `🎋 運勢: <strong>${rank}</strong>`;
                        }
                    } else if (log.action_type === 'royalty_receive') {
                        detailsStr = `💎 「${log.details?.badge_name || 'バッジ'}」の売買還元 ${otherId ? `(by ${otherHtml})` : ''} `;
                    } else if (log.action_type === 'admin_edit') {
                        detailsStr = `⚙️ 管理者による${log.amount >= 0 ? '加算' : '減算'} `;
                    } else if (log.action_type === 'gacha_draw') {
                        const bId = log.badge_id;
                        const resultName = log.details?.result_name || log.details?.name || 'アイテム';
                        const resultType = log.details?.result_type || log.details?.type;

                        if (bId && badgeMap[bId]) {
                            const badge = badgeMap[bId];
                            detailsStr = `
                        <div class="d-inline-flex align-items-center gap-1" >
                            <img src="${badge.image_url}" style="width: 30px; height: 30px; object-fit: contain;" title="${badge.name}">
                                <span>${badge.name} を獲得</span>
                            </div>
                    `;
                        } else {
                            let icon = '🎁';
                            if (resultType === 'exchange_ticket') icon = '🎫';
                            else if (resultType === 'stone') icon = '💠';

                            detailsStr = `${icon} ${resultName} を獲得`;
                        }
                    }

                    // バッジ関連のログで、detailsにbadge_idがないがlog本体にある場合のアイコン表示
                    const bId = log.badge_id;
                    if (['badge_transfer', 'badge_receive', 'badge_sell', 'badge_purchase'].includes(log.action_type) && bId && badgeMap[bId]) {
                        const badge = badgeMap[bId];
                        const originalDetails = detailsStr;
                        detailsStr = `
                            <div class="d-inline-flex align-items-center gap-1">
                                <img src="${badge.image_url}" style="width: 24px; height: 24px; object-fit: contain;" title="${badge.name}">
                                <span>${originalDetails}</span>
                            </div>
                        `;
                    }

                    return `
                        <div class="activity-item-card" >
                            <span class="activity-date">${date}</span>
                            <div class="row align-items-center g-2">
                                <div class="col">
                                    <div class="d-flex flex-wrap align-items-center gap-2">
                                        <span class="activity-type-badge">${typeName}</span>
                                        <span class="activity-details">${detailsStr}</span>
                                    </div>
                                </div>
                                <div class="col-auto text-end">
                                    <span class="activity-amount ${log.amount > 0 ? 'text-success' : log.amount < 0 ? 'text-danger' : ''}">${amountStr}</span>
                                </div>
                            </div>
                        </div>
                        `;
                }).join('');


                // 6. ページネーションUI（改善版）
                const paginationArea = document.getElementById('activity-pagination-area');
                if (totalPages > 1) {
                    // 画面幅に応じてボタン表示数を切り替え (モバイル:3, 中間:4, PC:5+)
                    const width = window.innerWidth;
                    const groupSize = width < 576 ? 3 : (width < 992 ? 4 : 5);
                    const pageGroup = Math.ceil(page / groupSize);
                    const startPage = (pageGroup - 1) * groupSize + 1;
                    const endPage = Math.min(startPage + (groupSize - 1), totalPages);

                    let pagHtml = '';

                    // 「最初へ」ボタン
                    pagHtml += `
                        <li class="page-item ${page === 1 ? 'disabled' : ''}">
                            <a class="page-link shadow-sm" href="javascript:void(0)" onclick="loadActivityLogs(1)">«</a>
                        </li>`;

                    // 「前のグループ」ボタン
                    if (startPage > 1) {
                        pagHtml += `
                        <li class="page-item">
                            <a class="page-link shadow-sm" href="javascript:void(0)" onclick="loadActivityLogs(${startPage - 1})">‹</a>
                        </li>`;
                    }

                    // 現在のグループのページ番号（最大5個）
                    for (let i = startPage; i <= endPage; i++) {
                        pagHtml += `
                        <li class="page-item ${i === page ? 'active' : ''}">
                            <a class="page-link shadow-sm" href="javascript:void(0)" onclick="loadActivityLogs(${i})">${i}</a>
                        </li>`;
                    }

                    // 「次のグループ」ボタン
                    if (endPage < totalPages) {
                        pagHtml += `
                        <li class="page-item">
                            <a class="page-link shadow-sm" href="javascript:void(0)" onclick="loadActivityLogs(${endPage + 1})">›</a>
                        </li>`;
                    }

                    // 「最後へ」ボタン
                    pagHtml += `
                        <li class="page-item ${page === totalPages ? 'disabled' : ''}">
                            <a class="page-link shadow-sm" href="javascript:void(0)" onclick="loadActivityLogs(${totalPages})">»</a>
                        </li>`;

                    // プルダウンによるページ選択 (モバイルではコンパクトに)
                    const selectWidth = width < 576 ? '100px' : 'auto';
                    pagHtml += `
                        <li class="page-item ms-sm-2">
                            <select class="form-select form-select-sm shadow-sm" onchange="if(this.value) loadActivityLogs(parseInt(this.value))" style="width: ${selectWidth}; display: inline-block; font-size: 0.75rem;">
                                <option value="">ページ...</option>`;

                    for (let i = 1; i <= totalPages; i++) {
                        pagHtml += `<option value="${i}" ${i === page ? 'selected' : ''}>${i}ページ</option>`;
                    }

                    pagHtml += `
                            </select>
                        </li>`;

                    paginationEl.innerHTML = pagHtml;
                    if (paginationArea) paginationArea.style.display = 'block';
                } else {
                    if (paginationArea) paginationArea.style.display = 'none';
                }


            } catch (err) {
                console.error('Activity logs error:', err);
                listEl.innerHTML = '<div class="text-center text-danger py-3">エラーが発生しました</div>';
            }
        }

        // ============ 麻雀統計機能 ============
        let allMahjongRecords = [];
        let myAccountName = '';
        let currentMyTournament = '第二回麻雀大会';

        async function loadMahjongStats() {
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const targetUserId = urlParams.get('user');

                if (targetUserId) {
                    myAccountName = targetUserId;
                } else {
                    const user = await getCurrentUser();
                    if (!user) return;
                    myAccountName = user.user_metadata.provider_id;
                }

                // 第二回麻雀大会のデータを取得（match_resultsテーブル）
                // Supabaseのデフォルト1000件制限を回避するため、すべてのデータを明示的に取得
                let allCurrentData = [];
                let page = 0;
                const pageSize = 1000;

                while (true) {
                    const { data, error } = await supabaseClient
                        .from('match_results')
                        .select('*')
                        .range(page * pageSize, (page + 1) * pageSize - 1);

                    if (error) {
                        console.warn('第二回データ取得エラー:', error);
                        break;
                    }
                    if (!data || data.length === 0) break;

                    allCurrentData = allCurrentData.concat(data);

                    if (data.length < pageSize) break;
                    page++;
                }

                console.log('✅ マイページ: match_results取得完了:', allCurrentData.length, '件');
                const currentData = allCurrentData;

                let legacyData = [];
                try {
                    const { data, error: legacyError } = await supabaseClient
                        .from('tournament_player_stats_snapshot')
                        .select('*');
                    if (!legacyError) legacyData = data || [];
                } catch (e) {
                    console.warn('第一回データ取得スキップ:', e);
                }

                const taggedCurrentData = (currentData || []).map(r => ({ ...r, tournament_type: r.tournament_type || '第二回麻雀大会' }));
                const taggedLegacyData = (legacyData || []).map(r => ({ ...r, tournament_type: r.tournament_type || '第一回麻雀大会' }));

                allMahjongRecords = [...taggedCurrentData, ...taggedLegacyData];
                renderTournamentDropdown();
                displayMahjongStats();
            } catch (err) {
                console.error('麻雀統計取得エラー:', err);
                document.getElementById('stats-loading').style.display = 'none';
                document.getElementById('no-stats-msg').style.display = 'block';
            }
        }

        function renderTournamentDropdown() {
            const select = document.getElementById('tournament-select');
            if (!select) return;
            const tournaments = ['第二回麻雀大会', '第一回麻雀大会'];
            let html = tournaments.map(t => `<option value="${t}" ${currentMyTournament === t ? 'selected' : ''}>${t}</option>`).join('');
            html += `<option value="all" ${currentMyTournament === 'all' ? 'selected' : ''}>全シーズン</option>`;
            select.innerHTML = html;
        }

        function handleTournamentChange() {
            const select = document.getElementById('tournament-select');
            currentMyTournament = select.value;
            displayMahjongStats();
        }

        let currentMahjongMode = 'individual_yonma'; // 四麻/三麻

        function handleModeChange() {
            const select = document.getElementById('mode-select');
            currentMahjongMode = select.value;
            displayMahjongStats();
        }

        function displayMahjongStats() {
            let records = allMahjongRecords;

            // 大会フィルター
            if (currentMyTournament !== 'all') {
                records = records.filter(r => r.tournament_type === currentMyTournament);
            }

            // メインフィルター（対戦形式）
            if (currentMahjongMode === 'individual_yonma') {
                records = records.filter(r => (r.mahjong_mode || r.mode) === '四麻');
            } else if (currentMahjongMode === 'individual_sanma') {
                records = records.filter(r => (r.mahjong_mode || r.mode) === '三麻');
            }

            const playerStats = calculateAllPlayerStats(records);
            const myStats = playerStats.find(p => p.name === myAccountName);

            document.getElementById('stats-loading').style.display = 'none';
            document.getElementById('stats-content').style.display = 'block';

            const statsGrid = document.getElementById('stats-grid');
            const noStatsMsg = document.getElementById('no-stats-msg');

            if (!myStats || myStats.games === 0) {
                if (statsGrid) statsGrid.style.display = 'none';
                noStatsMsg.style.display = 'block';
                return;
            }
            if (statsGrid) statsGrid.style.display = 'block';
            noStatsMsg.style.display = 'none';

            const formatScore = (val) => (typeof val !== 'number') ? val : Math.round(val * 10) / 10;
            const games = myStats.games;

            updateStatCard('total', formatScore(myStats.total), playerStats, 'total', true, games);
            updateStatCard('avg-score', formatScore(myStats.avgScore), playerStats, 'avgScore', true, games);
            updateStatCard('max-score', formatScore(myStats.maxScore), playerStats, 'maxScore', true, games);
            updateStatCard('win-rate', myStats.winRate.toFixed(1) + '%', playerStats, 'winRate', true, games);
            updateStatCard('deal-rate', myStats.dealRate.toFixed(1) + '%', playerStats, 'dealRate', false, games);
            updateStatCard('skill', myStats.skill.toFixed(1) + '%', playerStats, 'skill', true, games);
            updateStatCard('avg-rank', myStats.avgRank.toFixed(2), playerStats, 'avgRank', false, games);
            updateStatCard('top-rate', myStats.topRate.toFixed(1) + '%', playerStats, 'topRate', true, games);
            updateStatCard('avoid-rate', myStats.avoidRate.toFixed(1) + '%', playerStats, 'avoidRate', true, games);
            updateStatCard('games', myStats.games, playerStats, 'games', true, games);

            // 局数とレーティング（順位なし）
            const handsEl = document.getElementById('stat-hands');
            if (handsEl) handsEl.textContent = myStats.hands || 0;

            const ratingEl = document.getElementById('stat-rating');
            if (ratingEl) ratingEl.textContent = '-'; // 未実装

            // 対戦相手統計を計算・表示
            displayOpponentStats(records, myAccountName);
        }

        function displayOpponentStats(records, myId) {
            const section = document.getElementById('opponent-stats-section');
            const topList = document.getElementById('top-opponents-list');
            const bestMatchup = document.getElementById('best-matchup');
            const worstMatchup = document.getElementById('worst-matchup');

            if (!section || !topList || !bestMatchup || !worstMatchup) return;

            // プレイヤーID特定ロジック（discord_user_idがあれば優先、なければ名前）
            const getPlayerId = (r) => {
                let id = r.discord_user_id;
                if (!id || id === 'null') id = r.nickname || r.account_name || r.name || 'Unknown';
                return String(id);
            };

            // 表示名特定ロジック（プロフィールの名前を優先）
            const getDisplayName = (id, fallbackName) => {
                const profile = allProfiles.find(p => p.discord_user_id === String(id));
                return profile ? profile.account_name : (fallbackName || id);
            };

            // 自分が参加した試合のmatch_idを取得
            // calculateAllPlayerStatsと同様のID抽出ロジックを使用
            const myMatches = records.filter(r => getPlayerId(r) === myId);
            const myMatchIds = [...new Set(myMatches.map(r => r.match_id).filter(id => id))];

            if (myMatchIds.length === 0) {
                section.style.display = 'none';
                return;
            }

            // 同じmatch_idの他プレイヤーを集計
            const opponentData = {};

            myMatchIds.forEach(matchId => {
                const matchRecords = records.filter(r => r.match_id === matchId);
                const myRecord = matchRecords.find(r => getPlayerId(r) === myId);
                if (!myRecord) return;

                const myScore = Number(myRecord.final_score || myRecord.score_total || 0);

                matchRecords.forEach(r => {
                    const oppId = getPlayerId(r);
                    if (oppId === myId) return; // 自分は除外

                    if (!opponentData[oppId]) {
                        opponentData[oppId] = {
                            count: 0,
                            myScoreSum: 0,
                            opponentScoreSum: 0,
                            fallbackName: r.nickname || r.account_name || r.name || oppId
                        };
                    }
                    opponentData[oppId].count++;
                    opponentData[oppId].myScoreSum += myScore;
                    opponentData[oppId].opponentScoreSum += Number(r.final_score || r.score_total || 0);
                });
            });

            const opponents = Object.entries(opponentData).map(([id, data]) => ({
                id,
                name: getDisplayName(id, data.fallbackName),
                count: data.count,
                scoreDiff: data.myScoreSum - data.opponentScoreSum
            }));

            if (opponents.length === 0) {
                section.style.display = 'none';
                return;
            }

            section.style.display = 'block';

            // トップ3対戦相手（回数順）
            const top3 = [...opponents].sort((a, b) => b.count - a.count).slice(0, 3);
            topList.innerHTML = top3.map((opp, i) => {
                const medalColors = ['#ffd700', '#c0c0c0', '#cd7f32'];
                const medal = i < 3 ? `<span style="color: ${medalColors[i]}; font-weight: bold;">${i + 1}位</span>` : `${i + 1}位`;

                // プロフィールからアバターを取得
                const profile = allProfiles.find(p => p.discord_user_id === String(opp.id));
                const avatarUrl = profile?.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png';

                // リンク先の設定（プロフィールがあればリンク化）
                const linkUrl = profile ? `index.html?user=${opp.id}` : null;
                const wrapperStart = linkUrl ? `<a href="${linkUrl}" class="text-decoration-none text-dark d-flex align-items-center gap-2 px-2 py-2 rounded" style="background: #f8f9fa; border: 1px solid #eee; transition: background 0.2s;" onmouseover="this.style.background='#e9ecef'" onmouseout="this.style.background='#f8f9fa'">`
                    : `<div class="d-flex align-items-center gap-2 px-2 py-2 rounded" style="background: #f8f9fa; border: 1px solid #eee;">`;
                const wrapperEnd = linkUrl ? `</a>` : `</div>`;

                return `
                    ${wrapperStart}
                        ${medal}
                        <img src="${avatarUrl}" class="rounded-circle shadow-sm" style="width: 24px; height: 24px; object-fit: cover;">
                        <span class="fw-bold" style="font-size: 0.9rem;">${opp.name}</span>
                        <span class="text-muted" style="font-size: 0.8rem;">${opp.count}試合</span>
                    ${wrapperEnd}
                `;
            }).join('');

            // ヘルパー: マッチアップカード生成
            const createMatchupCard = (opp, isBest) => {
                if (!opp) return '<span class="text-muted small">-</span>';

                const profile = allProfiles.find(p => p.discord_user_id === String(opp.id));
                const avatarUrl = profile?.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png';
                const scoreClass = isBest ? 'text-success' : 'text-danger';
                const scorePrefix = isBest && opp.scoreDiff > 0 ? '+' : '';

                // リンク設定
                const linkUrl = profile ? `index.html?user=${opp.id}` : null;
                const content = `
                    <img src="${avatarUrl}" class="rounded-circle shadow-sm" style="width: 20px; height: 20px; object-fit: cover;">
                    <span class="fw-bold" style="font-size: 0.95rem;">${opp.name}</span>
                    <span class="${scoreClass} fw-bold ms-auto" style="font-size: 0.95rem;">${scorePrefix}${opp.scoreDiff.toFixed(1)}</span>
                `;

                if (linkUrl) {
                    return `<a href="${linkUrl}" class="text-decoration-none text-dark d-flex align-items-center gap-2 w-100">${content}</a>`;
                } else {
                    return content; // 既存の構造上、外側のdivにクラスがあるので、内部要素だけで良いか確認が必要だが、元の実装は innerHTML に直書きだった
                    // 元の実装:
                    // bestMatchup.innerHTML = `...`;
                    // bestMatchup 自体は div#best-matchup class="d-flex align-items-center gap-2"
                    // ここで中身を <a> で包むと a が flex item になる。
                    // a に w-100 d-flex align-items-center gap-2 をつければOK
                }
            };

            // 一番勝ち越し
            const bestOpp = [...opponents].sort((a, b) => b.scoreDiff - a.scoreDiff)[0];
            if (bestOpp && bestOpp.scoreDiff > 0) {
                bestMatchup.innerHTML = createMatchupCard(bestOpp, true);
            } else {
                bestMatchup.innerHTML = '<span class="text-muted small">-</span>';
            }

            // 一番負け越し
            const worstOpp = [...opponents].sort((a, b) => a.scoreDiff - b.scoreDiff)[0];
            if (worstOpp && worstOpp.scoreDiff < 0) {
                worstMatchup.innerHTML = createMatchupCard(worstOpp, false);
            } else {
                worstMatchup.innerHTML = '<span class="text-muted small">-</span>';
            }
        }

        function redirectToRanking(subFilter) {
            // 現在のフィルター設定を取得
            const tournament = currentMyTournament;
            const main = currentMahjongMode;

            // 自分のIDを取得（アンカー用）
            // myAccountName は DiscordID または ニックネームが入っている
            const anchor = `#rank-player-${myAccountName}`;

            // URL構築
            const url = `../mahjong/index.html?tournament=${encodeURIComponent(tournament)}&main=${encodeURIComponent(main)}&sub=${encodeURIComponent(subFilter)}${anchor}`;

            // 遷移
            window.location.href = url;
        }

        function updateStatCard(id, value, allStats, key, higherIsBetter, myGames) {
            const el = document.getElementById('stat-' + id);
            if (el) el.textContent = value;

            // 10試合以上のプレイヤーのみをランキング対象にする
            const qualified = [...allStats].filter(p => p.games >= 10);
            const sorted = qualified.sort((a, b) => higherIsBetter ? b[key] - a[key] : a[key] - b[key]);
            const myRank = sorted.findIndex(p => p.name === myAccountName) + 1;
            const total = sorted.length;

            const rankEl = document.getElementById('rank-' + id);
            const cardEl = el ? el.closest('.stat-card-mini') : null;

            if (cardEl) {
                // 既存のランククラスを削除
                cardEl.classList.remove('rank-1', 'rank-2', 'rank-3');
                // 10試合以上かつ3位以内の場合にクラスを付与
                if (myGames >= 10 && myRank >= 1 && myRank <= 3) {
                    cardEl.classList.add(`rank-${myRank}`);
                }
            }

            if (rankEl) {
                // 自分が10試合未満の場合はランク外
                if (myGames < 10) {
                    rankEl.textContent = 'ランク外';
                    rankEl.classList.add('no-data');
                } else if (myRank > 0) {
                    rankEl.textContent = `${myRank}/${total}位`;
                    rankEl.classList.remove('no-data');
                } else {
                    rankEl.textContent = '-';
                    rankEl.classList.add('no-data');
                }
            }
        }

        function calculateAllPlayerStats(records) {
            const players = {};
            records.forEach(r => {
                let id = r.discord_user_id;
                if (!id || id === 'null') id = r.nickname || r.account_name || 'Unknown';
                if (!id) return;

                if (!players[id]) {
                    players[id] = { name: id, score: 0, sanma: 0, yonma: 0, count: 0, win: 0, deal: 0, r1: 0, r2: 0, r3: 0, r4: 0, max_score: -Infinity, hand_total: 0 };
                }

                const p = players[id];
                const mode = r.mahjong_mode || r.mode || '';

                if (r.tournament_type === '第一回麻雀大会') {
                    p.score += Number(r.score_total || 0);
                    p.count += Number(r.matches_played || 0);
                    p.r1 += Number(r.rank1_count || 0); p.r2 += Number(r.rank2_count || 0); p.r3 += Number(r.rank3_count || 0); p.r4 += Number(r.rank4_count || 0);
                    p.max_score = Math.max(p.max_score, Number(r.score_max || 0));
                    p.hand_total += Number(r.hands_played || 0);
                } else {
                    p.score += Number(r.final_score || 0);
                    p.count += 1;
                    const rk = Number(r.rank);
                    if (rk === 1) p.r1++; else if (rk === 2) p.r2++; else if (rk === 3) p.r3++; else if (rk === 4) p.r4++;
                    p.max_score = Math.max(p.max_score, Number(r.final_score || 0));
                    p.hand_total += Number(r.hand_count || 0);
                }
                p.win += Number(r.win_count || r.wins || 0);
                p.deal += Number(r.deal_in_count || r.deals || 0);
                if (mode === '三麻') p.sanma += Number(r.final_score || r.score_total || 0);
                if (mode === '四麻') p.yonma += Number(r.final_score || r.score_total || 0);
            });

            return Object.values(players).map(p => {
                const count = p.count;
                const hands = p.hand_total;
                return {
                    name: p.name, total: p.score, sanma: p.sanma, yonma: p.yonma,
                    avgScore: count > 0 ? p.score / count : 0,
                    maxScore: p.max_score === -Infinity ? 0 : p.max_score,
                    // 和了率・放銃率は局数ベースで計算（%）
                    winRate: hands > 0 ? (p.win / hands * 100) : 0,
                    dealRate: hands > 0 ? (p.deal / hands * 100) : 0,
                    // バランス雀力 = (和了数 - 放銃数) / 局数 * 100
                    skill: hands > 0 ? ((p.win - p.deal) / hands * 100) : 0,
                    avgRank: count > 0 ? (1 * p.r1 + 2 * p.r2 + 3 * p.r3 + 4 * p.r4) / count : 0,
                    topRate: count > 0 ? (p.r1 / count) * 100 : 0,
                    avoidRate: count > 0 ? (1 - ((p.r4 === 0 && p.r3 > 0 ? p.r3 : p.r4) / count)) * 100 : 0,
                    games: count,
                    hands: hands
                };
            });
        }


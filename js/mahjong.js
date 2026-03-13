let allRecords = [];
let allProfiles = []; // プロフィール情報（アイコン付き）
let currentTournament = 'all'; // 初期表示は全シーズン
let currentMainFilter = 'individual_yonma'; // 個人戦（四麻）をデフォルト
let currentSubFilter = 'all';  // 合計スコア, 平均スコア, 最大スコア, etc.

document.addEventListener('DOMContentLoaded', () => {
    fetchData();
});


async function fetchData() {
    try {
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

            if (error) throw error;
            if (!data || data.length === 0) break;

            allCurrentData = allCurrentData.concat(data);

            // データが pageSize より少なければ、これが最後のページ
            if (data.length < pageSize) break;
            page++;
        }

        console.log('✅ match_results取得完了:', allCurrentData.length, '件');

        // 第一回麻雀大会のデータを取得（tournament_player_stats_snapshotテーブル）
        const { data: legacyData, error: legacyError } = await supabaseClient
            .from('tournament_player_stats_snapshot')
            .select('*');

        if (legacyError) {
            console.warn('過去データの取得に失敗:', legacyError);
        }

        // 新データにも tournament_type を保障（初期データ等で抜けている場合のため）
        const taggedCurrentData = (allCurrentData || []).map(r => ({
            ...r,
            tournament_type: r.tournament_type || '第二回麻雀大会'
        }));

        // 過去データに tournament_type を付与（タグ付けされていない場合）
        // また、discord_user_idに含まれる改行コードを除去
        const taggedLegacyData = (legacyData || []).map(r => ({
            ...r,
            tournament_type: r.tournament_type || '第一回麻雀大会',
            discord_user_id: r.discord_user_id ? r.discord_user_id.trim() : null
        }));

        // 両方のデータを結合
        allRecords = [...taggedCurrentData, ...taggedLegacyData];

        console.log('📊 取得したレコード数:', allRecords.length);
        console.log('第二回（match_results）:', taggedCurrentData.length);
        console.log('第一回（tournament_player_stats_snapshot）:', taggedLegacyData.length);

        renderTournamentButtons();

        // 全プロフィール取得（アイコン・バッジ用）
        const { data: profiles, error: pError } = await supabaseClient
            .from('profiles')
            .select('*, is_hidden, badges!equipped_badge_id(image_url, name), badges_right:badges!equipped_badge_id_right(image_url, name)');
        const visibleProfiles = (profiles || []).filter(p => !p.is_hidden);
        if (!pError && visibleProfiles.length > 0) {
            allProfiles = visibleProfiles;
        } else {
            // 背景：profilesが空（まだ誰もログインして同期してない）場合
            // match_results から過去の名前を拾って仮のリストを作る
            const names = Array.from(new Set(allRecords.map(r => r.account_name)));
            allProfiles = names.map(n => ({ account_name: n, avatar_url: '' }));
        }

        // ミュータント情報を取得
        const { data: userBadges } = await supabaseClient
            .from('user_badges_new')
            .select('user_id, badge_id')
            .eq('is_mutant', true);

        window.userMutantMap = {}; // global cache
        (userBadges || []).forEach(ub => {
            window.userMutantMap[`${ub.user_id}_${ub.badge_id}`] = true;
        });

        // チーム情報取得（ロゴ用）
        const { data: teamsData } = await supabaseClient
            .from('teams')
            .select('team_name, logo_badge:badges!logo_badge_id(image_url)');

        window.teamLogoMap = {};
        if (teamsData) {
            teamsData.forEach(t => {
                if (t.logo_badge && t.logo_badge.image_url) {
                    window.teamLogoMap[t.team_name] = t.logo_badge.image_url;
                }
            });
        }


        renderMainFilters();

        // URLパラメータの処理
        const params = new URLSearchParams(window.location.search);
        const t = params.get('tournament');
        const m = params.get('main');
        const s_filter = params.get('sub');

        if (t) currentTournament = t;
        if (m) currentMainFilter = m;
        if (s_filter) currentSubFilter = s_filter;

        if (t || m || s_filter) {
            renderTournamentButtons();
            renderMainFilters();
        }

        showRanking(); // 初期表示

        // アンカーへのスクロール処理
        const hash = window.location.hash;
        if (hash.startsWith('#rank-player-')) {
            setTimeout(() => {
                const target = document.querySelector(hash);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    target.classList.add('highlight-row');
                    setTimeout(() => target.classList.remove('highlight-row'), 3000);
                }
            }, 500);
        }
    } catch (err) {
        console.error('データ取得エラー:', err);
    }
}

// 大会フィルターボタンを動的に生成
function renderTournamentButtons() {
    const container = document.getElementById('tournament-filter-container');
    if (!container) return;

    // ユニークな大会名を取得。順序を制御したい場合は手動で定義するか、日付等でソートする
    const tournaments = ['第二回麻雀大会', '第一回麻雀大会']; // 明示的に並びを固定
    // もしデータから自動取得する場合は:
    // const types = [...new Set(allRecords.map(r => r.tournament_type))].filter(t => t);

    let html = '<div class="btn-group" role="group">';

    // 大会ごとのボタン
    tournaments.forEach(t => {
        const isActive = currentTournament === t;
        const label = t.replace('麻雀大会', ''); // 短く表示
        html += `<button type="button" class="btn ${isActive ? 'btn-primary' : 'btn-outline-primary'}" onclick="setTournament('${t}')">${label}</button>`;
    });

    // 全シーズンボタン
    const isAllActive = currentTournament === 'all';
    html += `<button type="button" class="btn ${isAllActive ? 'btn-primary' : 'btn-outline-primary'}" onclick="setTournament('all')">全シーズン</button>`;

    html += '</div>';
    container.innerHTML = html;
}

// メインフィルターを動的に生成
function renderMainFilters() {
    const container = document.getElementById('main-filter-container');
    if (!container) return;

    let filters = [];
    if (currentTournament === '第一回麻雀大会') {
        filters = [
            { id: 'team', label: 'チーム戦' },
            { id: 'individual_yonma', label: '個人戦（四麻）' }
        ];
        // 第一回で現在のフィルタが不正な場合はデフォルトへ
        if (currentMainFilter !== 'team' && currentMainFilter !== 'individual_yonma') {
            currentMainFilter = 'individual_yonma';
        }
    } else {
        filters = [
            { id: 'team', label: 'チーム戦' },
            { id: 'individual_yonma', label: '個人戦（四麻）' },
            { id: 'individual_sanma', label: '個人戦（三麻）' }
        ];
    }

    let html = '';
    filters.forEach(f => {
        const isActive = currentMainFilter === f.id;
        html += `<button class="btn ${isActive ? 'btn-success' : 'btn-outline-success'}" onclick="updateMainFilter('${f.id}')">${f.label}</button>`;
    });
    container.innerHTML = html;
}

// 大会切り替え
function setTournament(type) {
    currentTournament = type;

    // タイトルの更新
    const seasonTitle = document.getElementById('season-title');
    const pageMainTitle = document.getElementById('page-main-title');

    if (type === 'all') {
        seasonTitle.textContent = '🀄 全シーズン記録';
        pageMainTitle.textContent = '🀄 歴代ランキング';
    } else {
        seasonTitle.textContent = `🀄 ${type}`;
        pageMainTitle.textContent = '🀄 麻雀ランキング';
    }

    renderTournamentButtons();
    renderMainFilters(); // メインフィルターを再生成
    showRanking();
}

function updateMainFilter(type) {
    currentMainFilter = type;
    renderMainFilters(); // ボタンの状態更新
    showRanking();
}

function updateSubFilter(type) {
    currentSubFilter = type;
    showRanking();
}

// ランキング切り替え
function showRanking() {
    const type = currentSubFilter;
    const category = currentMainFilter;
    const title = document.getElementById('ranking-title');
    const nameHeader = document.getElementById('name-header');

    // ボタンのスタイル更新 (サブフィルターのみ)
    const subButtons = document.querySelectorAll('#sub-filter-nav .sub-filter-btn');
    const subTypeMap = {
        'all': 0, 'avg_score': 1, 'max_score': 2, 'match_count': 3, 'win': 4, 'deal': 5, 'skill': 6, 'avg_rank': 7, 'top': 8, 'avoid': 9
    };

    subButtons.forEach(btn => btn.classList.remove('active'));
    if (subButtons[subTypeMap[type]]) subButtons[subTypeMap[type]].classList.add('active');

    // 大会フィルタリング
    let seasonFiltered = allRecords;
    if (currentTournament !== 'all') {
        seasonFiltered = allRecords.filter(r => r.tournament_type === currentTournament);
    }

    // レコード抽出ロジック
    let filtered = seasonFiltered;
    let groupKey = 'account_name';

    if (category === 'team') {
        title.textContent = 'チーム戦ランキング';
        filtered = seasonFiltered.filter(r => {
            if (r.tournament_type === '第一回麻雀大会') return !!r.team_name;
            return r.match_mode === 'チーム戦' && r.team_name;
        });
        groupKey = 'team_name';
        nameHeader.textContent = 'チーム名';
    } else if (category === 'individual_yonma') {
        title.textContent = '個人戦（四麻）ランキング';
        filtered = seasonFiltered.filter(r => {
            if (r.tournament_type === '第一回麻雀大会') return true; // 第一回は四麻扱い
            return r.mahjong_mode === '四麻';
        });
        nameHeader.textContent = '名前';
    } else if (category === 'individual_sanma') {
        title.textContent = '個人戦（三麻）ランキング';
        filtered = seasonFiltered.filter(r => {
            if (r.tournament_type === '第一回麻雀大会') return false; // 第一回に三麻はない
            return r.mahjong_mode === '三麻';
        });
        nameHeader.textContent = '名前';
    } else {
        // デフォルト: 個人戦（四麻）
        title.textContent = '個人戦（四麻）ランキング';
        nameHeader.textContent = '名前';
        filtered = seasonFiltered.filter(r => {
            if (r.tournament_type === '第一回麻雀大会') return true;
            return r.mahjong_mode === '四麻';
        });
    }

    const statHeader = document.getElementById('stat-header');
    const subTitleMap = {
        'all': '合計スコア', 'avg_score': '平均スコア', 'max_score': '最大スコア',
        'match_count': '試合数', 'win': '和了率', 'deal': '放銃率',
        'skill': 'バランス雀力', 'avg_rank': '平均順位', 'top': 'トップ率', 'avoid': 'ラス回避'
    };
    if (statHeader) {
        statHeader.style.display = ''; // チーム戦でも表示するように
        statHeader.textContent = subTitleMap[type] || '合計スコア';
    }

    // 以前の注釈ロジックを削除
    const noticeId = 'ranking-notice';
    const oldNotice = document.getElementById(noticeId);
    if (oldNotice) oldNotice.remove();

    // テーブルヘッダーの取得または作成
    let tableHeaderRow = document.getElementById('table-header-row');
    if (!tableHeaderRow) {
        tableHeaderRow = document.querySelector('.ranking-table thead tr');
        if (tableHeaderRow) tableHeaderRow.id = 'table-header-row';
    }

    const headerContent = `
            <th style="width: 80px;">順位</th>
            <th id="name-header">${nameHeader.textContent}</th>
            <th id="stat-header" style="width: 180px;">${statHeader.textContent}</th>
            ${type === 'max_score' ? '' : '<th style="width: 120px;">24時間比</th>'}
            <th style="width: 120px;">${type === 'match_count' ? '局数' : '試合数'}</th>
        `;

    if (tableHeaderRow) tableHeaderRow.innerHTML = headerContent;
    const rankOutHeader = document.getElementById('rank-out-header');
    if (rankOutHeader) rankOutHeader.innerHTML = headerContent;

    // 圏外セクションの表示制御
    const rankOutSection = document.getElementById('rank-out-section');
    const targetTypes = ['avg_score', 'max_score', 'deal', 'win', 'skill', 'avg_rank', 'top', 'avoid'];
    if (rankOutSection) {
        rankOutSection.style.display = targetTypes.includes(type) ? 'block' : 'none';
    }

    console.log(`🎯 ランキングタイプ: ${type}, 大会: ${currentTournament}`);
    renderRanking(filtered, groupKey, type);
}

function renderRanking(records, groupKey, type = 'all') {
    // ランキング集計
    const summary = {};
    const summaryOld = {};
    const nowTs = Date.now();

    const ensureSummary = (target, key, r) => {
        if (!target[key]) {
            target[key] = {
                key: key,
                discord_user_id: groupKey === 'team_name' ? null : (r.discord_user_id || null),
                nickname: groupKey === 'team_name' ? key : (r.nickname || r.account_name || key),
                display: key,
                score: 0,
                count: 0,
                win: 0,
                deal: 0,
                r1: 0, r2: 0, r3: 0, r4: 0,
                max_score: -Infinity,
                hand_total: 0,
                sanma_count: 0,
                yonma_count: 0,
                sanma_last: 0,
                yonma_last: 0,
                isTeam: (groupKey === 'team_name')
            };
        }
        return target[key];
    };

    const addRecord = (target, r) => {
        let key;
        if (groupKey === 'team_name') {
            key = r.team_name;
        } else {
            key = r.discord_user_id;
            if (!key || key === 'null') {
                const playerName = r.nickname || r.account_name;
                const matchedProfile = allProfiles.find(p => p.account_name === playerName);
                if (matchedProfile && matchedProfile.discord_user_id) {
                    key = matchedProfile.discord_user_id;
                } else {
                    key = playerName || 'Unknown';
                }
            }
        }

        if (!key) return;
        const s = ensureSummary(target, key, r);

        if (r.tournament_type === '第一回麻雀大会') {
            s.score += Number(r.score_total || 0);
            s.count += Number(r.matches_played || 0);
            s.r1 += Number(r.rank1_count || 0);
            s.r2 += Number(r.rank2_count || 0);
            s.r3 += Number(r.rank3_count || 0);
            s.r4 += Number(r.rank4_count || 0);
            s.max_score = Math.max(s.max_score, Number(r.score_max || 0));
            s.hand_total += Number(r.hands_played || 0);
            s.win += Number(r.win_count || 0);
            s.deal += Number(r.deal_in_count || 0);
            s.yonma_count += Number(r.matches_played || 0);
            s.yonma_last += Number(r.rank4_count || 0);
        } else {
            s.score += Number(r.final_score || 0);
            s.count += 1;
            const rk = Number(r.rank);
            if (rk === 1) s.r1++;
            else if (rk === 2) s.r2++;
            else if (rk === 3) s.r3++;
            else if (rk === 4) s.r4++;
            s.max_score = Math.max(s.max_score, Number(r.final_score || 0));
            s.hand_total += Number(r.hand_count || 0);
            s.win += Number(r.win_count || 0);
            s.deal += Number(r.deal_in_count || 0);

            if (r.mahjong_mode === '三麻') {
                s.sanma_count++;
                if (rk === 3) s.sanma_last++;
            } else {
                s.yonma_count++;
                if (rk === 4) s.yonma_last++;
            }
        }
    };

    const finalizeSummary = (target) => {
        Object.values(target).forEach(s => {
            s.avg_win = s.hand_total > 0 ? (s.win / s.hand_total * 100) : 0;
            s.avg_deal = s.hand_total > 0 ? (s.deal / s.hand_total * 100) : 0;
            s.top_rate = s.count > 0 ? (s.r1 / s.count) * 100 : 0;
            const lastCount = s.sanma_last + s.yonma_last;
            s.avoid_rate = s.count > 0 ? (1 - (lastCount / s.count)) * 100 : 0;
            s.avg_rank = s.count > 0 ? (1 * s.r1 + 2 * s.r2 + 3 * s.r3 + 4 * s.r4) / s.count : 0;
            s.avg_score = s.count > 0 ? s.score / s.count : 0;
            if (s.max_score === -Infinity) s.max_score = 0;
            s.skill = s.hand_total > 0 ? ((s.win - s.deal) / s.hand_total * 100) : 0;
        });
    };

    const isRecent = (r) => {
        if (!r.event_datetime) return false;
        const ts = new Date(r.event_datetime).getTime();
        if (Number.isNaN(ts)) return false;
        return (nowTs - ts) < (24 * 60 * 60 * 1000);
    };
    records.forEach(r => {
        addRecord(summary, r);
        if (!isRecent(r)) {
            addRecord(summaryOld, r);
        }
    });

    finalizeSummary(summary);
    finalizeSummary(summaryOld);

    const getStatValueNum = (s, kind) => {
        if (!s) return 0;
        if (kind === 'win') return s.avg_win;
        if (kind === 'deal') return s.avg_deal;
        if (kind === 'top') return s.top_rate;
        if (kind === 'avoid') return s.avoid_rate;
        if (kind === 'avg_rank') return s.avg_rank;
        if (kind === 'max_score') return s.max_score;
        if (kind === 'avg_score') return s.avg_score;
        if (kind === 'match_count') return s.count;
        if (kind === 'skill') return s.skill;
        return s.score;
    };

    const formatDelta = (value, kind) => {
        const sign = value > 0 ? '+' : '';
        if (kind === 'win' || kind === 'deal' || kind === 'top' || kind === 'avoid' || kind === 'skill') {
            const rounded = Number(value.toFixed(1));
            if (rounded === 0) return { text: '―', cls: 'delta-zero', color: '#6c757d' };
            if (kind === 'deal') {
                return { text: `${sign}${rounded.toFixed(1)}%`, cls: value < 0 ? 'delta-pos' : 'delta-neg', color: value < 0 ? '#0d6efd' : '#dc3545' };
            }
            return { text: `${sign}${rounded.toFixed(1)}%`, cls: value > 0 ? 'delta-pos' : 'delta-neg', color: value > 0 ? '#0d6efd' : '#dc3545' };
        }
        if (kind === 'avg_rank') {
            const rounded = Number(value.toFixed(2));
            if (rounded === 0) return { text: '―', cls: 'delta-zero', color: '#6c757d' };
            return { text: `${sign}${rounded.toFixed(2)}`, cls: value > 0 ? 'delta-pos' : 'delta-neg', color: value > 0 ? '#0d6efd' : '#dc3545' };
        }
        if (kind === 'avg_score' || kind === 'max_score') {
            const rounded = Number(value.toFixed(1));
            if (rounded === 0) return { text: '―', cls: 'delta-zero', color: '#6c757d' };
            return { text: `${sign}${rounded.toFixed(1)}`, cls: value > 0 ? 'delta-pos' : 'delta-neg', color: value > 0 ? '#0d6efd' : '#dc3545' };
        }
        const rounded = Math.round(value);
        if (rounded === 0) return { text: '―', cls: 'delta-zero', color: '#6c757d' };
        return { text: `${sign}${rounded}`, cls: value > 0 ? 'delta-pos' : 'delta-neg', color: value > 0 ? '#0d6efd' : '#dc3545' };
    };

    // ソート
    const targetTypes = ['avg_score', 'max_score', 'deal', 'win', 'skill', 'avg_rank', 'top', 'avoid'];
    const isTargetType = targetTypes.includes(type);

    const fullSortedList = Object.values(summary).sort((a, b) => {
        if (type === 'win') return b.avg_win - a.avg_win;
        if (type === 'deal') return a.avg_deal - b.avg_deal;
        if (type === 'top') return b.top_rate - a.top_rate;
        if (type === 'avoid') return b.avoid_rate - a.avoid_rate;
        if (type === 'avg_rank') return (a.avg_rank || 4) - (b.avg_rank || 4);
        if (type === 'max_score') return b.max_score - a.max_score;
        if (type === 'avg_score') return b.avg_score - a.avg_score;
        if (type === 'match_count') return b.count - a.count;
        if (type === 'skill') return b.skill - a.skill;
        return b.score - a.score;
    });

    // ランク内と圏外に分離
    let rankedPlayers = [];
    let rankOutPlayers = [];

    if (isTargetType) {
        rankedPlayers = fullSortedList.filter(s => s.count >= 10);
        rankOutPlayers = fullSortedList.filter(s => s.count < 10);
    } else {
        rankedPlayers = fullSortedList;
    }

    const mainBody = document.getElementById('ranking-body');
    const outBody = document.getElementById('rank-out-body');
    const podiumContainer = document.getElementById('ranking-podium');

    // 表彰台のレンダリング
    const renderPodium = (top3, type) => {
        if (!top3 || top3.length === 0) return '';

        const podiumHtml = top3.map((s, i) => {
            if (!s) return '';

            const rank = i + 1;
            const rankClass = rank === 1 ? 'podium-first' : (rank === 2 ? 'podium-second' : 'podium-third');
            const crown = rank === 1 ? '<div class="podium-crown">👑</div>' : '';

            // プロフィール・アイコン取得
            let profile = null;
            let displayName = 'Unknown';
            let avatarUrl = '';
            let canLink = false;
            let badgeHtmlLeft = '';
            let badgeHtmlRight = '';

            // 過去ログ用の名前マッピング（必要に応じて追加）
            const legacyNameMap = {
                'Yellow': 'Yellow', // もしprofilesに'Yellow'がいればそのまま、いなければID等で紐付け
                // 例: '旧名': '新名' または '旧名': 'discord_id'
            };

            if (!s.isTeam) {
                // 1. まずはIDで検索
                if (s.discord_user_id) {
                    profile = allProfiles.find(p => p.discord_user_id === s.discord_user_id);
                }

                // 2. IDでヒットしない場合は名前で検索
                if (!profile) {
                    const searchName = legacyNameMap[s.nickname] || s.nickname || s.account_name;
                    profile = allProfiles.find(p => p.account_name === searchName);
                }

                if (profile) {
                    displayName = profile.account_name;
                    avatarUrl = profile.avatar_url;
                    if (profile.discord_user_id) {
                        canLink = true;
                        // s に ID がない場合のために補完（リンク用）
                        s.discord_user_id = profile.discord_user_id;
                    }
                } else {
                    displayName = s.nickname || s.account_name || 'Unknown';
                    avatarUrl = '';
                }

                const badge = profile?.badges;
                const badgeRight = profile?.badges_right;

                if (badge) {
                    const isMutant = window.userMutantMap?.[`${profile.discord_user_id}_${profile.equipped_badge_id}`];
                    badgeHtmlLeft = `
                        <div class="mutant-badge-container ${isMutant ? 'active' : ''}">
                            <div class="podium-badge-left">
                                <img src="${badge.image_url}" title="${badge.name}">
                            </div>
                            ${MutantBadge.renderShine(isMutant)}
                        </div>`;
                }

                if (badgeRight) {
                    const isMutant = window.userMutantMap?.[`${profile.discord_user_id}_${profile.equipped_badge_id_right}`];
                    badgeHtmlRight = `
                        <div class="mutant-badge-container ${isMutant ? 'active' : ''}">
                            <div class="podium-badge-right">
                                <img src="${badgeRight.image_url}" title="${badgeRight.name}">
                            </div>
                            ${MutantBadge.renderShine(isMutant)}
                        </div>`;
                }
            } else {
                displayName = s.nickname || 'Unknown';
            }

            // 指標値のフォーマット
            let statValue = '';
            if (type === 'win') statValue = `${s.avg_win.toFixed(1)}%`;
            else if (type === 'deal') statValue = `${s.avg_deal.toFixed(1)}%`;
            else if (type === 'avg_rank') statValue = `${s.avg_rank.toFixed(2)}`;
            else if (type === 'top') statValue = `${s.top_rate.toFixed(1)}%`;
            else if (type === 'avoid') statValue = `${s.avoid_rate.toFixed(1)}%`;
            else if (type === 'skill') statValue = `${s.skill.toFixed(1)}%`;
            else if (type === 'max_score') statValue = `${s.max_score.toFixed(1)}`;
            else if (type === 'avg_score') statValue = `${s.avg_score.toFixed(1)}`;
            else if (type === 'match_count') statValue = `${s.count}`;
            else statValue = `${s.score.toFixed(1)}`;

            const statLabel = document.getElementById('stat-header')?.textContent || '合計スコア';

            const linkUrl = canLink ? `../mypage/index.html?user=${s.discord_user_id}` : '#';
            const linkClass = canLink ? '' : 'pe-none text-dark';

            const deltaValue = getStatValueNum(s, type) - getStatValueNum(summaryOld[s.key], type);
            const delta = formatDelta(deltaValue, type);
            const anchorId = s.isTeam ? `rank-team-${encodeURIComponent(s.key)}` : `rank-player-${s.discord_user_id || 'unknown'}`;
            return `
                <div class="col-12" id="${anchorId}">
                    <div class="podium-card ${rankClass}">
                        <div class="podium-card-left">
                            <div class="podium-rank-box">
                                ${crown}
                                <div class="podium-rank">${rank}</div>
                            </div>
                            <a href="${linkUrl}" class="text-decoration-none podium-player-info ${linkClass}">
                                <div class="podium-avatar-wrapper">
                                    <div style="width: 64px; height: 64px;" class="flex-shrink-0 d-flex align-items-center justify-content-center">
                                        ${avatarUrl ?
                    `<img src="${avatarUrl}" alt="${displayName}" class="podium-avatar">` :
                    (s.isTeam ?
                        (window.teamLogoMap && window.teamLogoMap[s.key] ?
                            `<img src="${window.teamLogoMap[s.key]}" alt="${s.key}" class="podium-avatar" style="border-radius: 8px; border: none; box-shadow: none;">` :
                            `<span style="font-size: 2rem;">🏅</span>`
                        ) :
                        `<img src="https://cdn.discordapp.com/embed/avatars/0.png" class="podium-avatar">`)}
                                    </div>
                                </div>
                                <div class="podium-identity-row">
                                    ${badgeHtmlLeft}
                                    <div class="podium-name ${canLink ? 'hover-underline' : ''}">${displayName}</div>
                                    ${badgeHtmlRight}
                                </div>
                            </a>
                        </div>
                        <div class="podium-card-right">
                            <div class="podium-stat-grid">
                                <div class="podium-stat-item">
                                    <div class="podium-stat-label">${statLabel}</div>
                                    <div class="podium-stat-value">${statValue}</div>
                                </div>
                                ${type === 'max_score' ? '' : `
                                <div class="podium-stat-item">
                                    <div class="podium-stat-label">24時間比</div>
                                    <div class="podium-stat-value ${delta.cls}" style="color: ${delta.color};">${delta.text}</div>
                                </div>
                                `}
                                <div class="podium-stat-item">
                                    <div class="podium-stat-label">${type === 'match_count' ? '局数' : '試合数'}</div>
                                    <div class="podium-stat-value podium-match-count">${type === 'match_count' ? s.hand_total : s.count}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        return podiumHtml;
    };

    const renderRows = (list, offset = 0) => {
        return list.map((s, idx) => {
            let rankValue = (offset === -1) ? '-' : (idx + 1 + offset);

            let profile = null;
            let displayName = 'Unknown';
            let avatarUrl = '';
            let canLink = false;
            let badgeHtmlLeft = '';
            let badgeHtmlRight = '';

            // 過去ログ用の名前マッピング（必要に応じて追加）
            const legacyNameMap = {
                'Yellow': 'Yellow',
            };

            if (!s.isTeam) {
                if (s.discord_user_id) {
                    profile = allProfiles.find(p => p.discord_user_id === s.discord_user_id);
                }
                if (!profile) {
                    const searchName = legacyNameMap[s.nickname] || s.nickname || s.account_name;
                    profile = allProfiles.find(p => p.account_name === searchName);
                }

                if (profile) {
                    displayName = profile.account_name;
                    avatarUrl = profile.avatar_url;
                    if (profile.discord_user_id) {
                        canLink = true;
                        s.discord_user_id = profile.discord_user_id;
                    }
                } else {
                    displayName = s.nickname || s.account_name || 'Unknown';
                }

                const badge = profile?.badges;
                const badgeRight = profile?.badges_right;

                if (badge) {
                    const isMutant = window.userMutantMap?.[`${profile.discord_user_id}_${profile.equipped_badge_id}`];
                    badgeHtmlLeft = `
                        <div class="mutant-badge-container mini ${isMutant ? 'active' : ''}">
                            <img src="${badge.image_url}" title="${badge.name}"
                                 style="width: 24px; height: 24px; object-fit: contain; border-radius: 4px;">
                            ${MutantBadge.renderShine(isMutant)}
                        </div>`;
                }

                if (badgeRight) {
                    const isMutant = window.userMutantMap?.[`${profile.discord_user_id}_${profile.equipped_badge_id_right}`];
                    badgeHtmlRight = `
                        <div class="mutant-badge-container mini ${isMutant ? 'active' : ''}">
                            <img src="${badgeRight.image_url}" title="${badgeRight.name}"
                                 style="width: 24px; height: 24px; object-fit: contain; border-radius: 4px;">
                            ${MutantBadge.renderShine(isMutant)}
                        </div>`;
                }
            } else {
                displayName = s.nickname || 'Unknown';
            }

            let avatarHtml = '';
            if (!s.isTeam) {
                avatarHtml = `
                    <div class="d-flex align-items-center gap-3">
                        <div style="width: 32px; height: 32px;" class="flex-shrink-0 d-flex align-items-center justify-content-center">
                            ${avatarUrl ?
                        `<img src="${avatarUrl}"
                                   alt="${displayName}"
                                   class="rounded-circle"
                                   style="width: 32px; height: 32px; object-fit: cover;">` : ''}
                        </div>
                        ${badgeHtmlLeft}
                    </div>`;
            } else {
                const teamLogoUrl = window.teamLogoMap && window.teamLogoMap[s.key];
                avatarHtml = `
                    <div style="width: 32px; height: 32px;" class="flex-shrink-0 d-flex align-items-center justify-content-center">
                        ${teamLogoUrl ?
                        `<img src="${teamLogoUrl}" alt="${s.key}" style="width: 32px; height: 32px; object-fit: contain;">` :
                        `<span style="font-size: 1.2rem;">🏅</span>`
                    }
                    </div>`;
            }

            const linkUrl = canLink ? `../mypage/index.html?user=${s.discord_user_id}` : '#';
            const linkClass = canLink ? '' : 'pe-none text-dark';

            let statValue = '';
            let statColorClass = 'text-dark';

            if (type === 'win') {
                statValue = `${s.avg_win.toFixed(1)}%`;
                statColorClass = 'text-dark';
            } else if (type === 'deal') {
                statValue = `${s.avg_deal.toFixed(1)}%`;
                statColorClass = 'text-dark';
            } else if (type === 'top') {
                statValue = `${s.top_rate.toFixed(1)}%`;
            } else if (type === 'avoid') {
                statValue = `${s.avoid_rate.toFixed(1)}%`;
                statColorClass = 'text-dark';
            } else if (type === 'avg_rank') {
                statValue = `${s.avg_rank.toFixed(2)}`;
                statColorClass = 'text-dark';
            } else if (type === 'max_score') {
                statValue = `${(s.max_score > 0 ? '+' : '') + s.max_score.toFixed(1)}`;
                statColorClass = 'text-dark';
            } else if (type === 'avg_score') {
                statValue = `${(s.avg_score > 0 ? '+' : '') + s.avg_score.toFixed(1)}`;
                statColorClass = 'text-dark';
            } else if (type === 'match_count') {
                statValue = `${s.count}`;
                statColorClass = 'text-dark';
            } else if (type === 'skill') {
                statValue = `${(s.skill > 0 ? '+' : '') + s.skill.toFixed(1)}%`;
                statColorClass = 'text-dark';
            } else if (type === 'all' || type === 'individual_yonma' || type === 'individual_sanma') {
                statValue = `${(s.score > 0 ? '+' : '') + s.score.toFixed(1)}`;
                statColorClass = 'text-dark';
            }

            const labelText = document.getElementById('stat-header')?.textContent || '合計スコア';
            const deltaValue = getStatValueNum(s, type) - getStatValueNum(summaryOld[s.key], type);
            const delta = formatDelta(deltaValue, type);

            const anchorRowId = s.isTeam ? `rank-team-${encodeURIComponent(s.key)}` : `rank-player-${s.discord_user_id || 'unknown'}`;
            return `
                <tr id="${anchorRowId}">
                    <td>${rankValue}</td>
                    <td class="ps-4 text-start">
                        <a href="${linkUrl}" 
                           class="text-decoration-none d-flex align-items-center justify-content-start gap-2 ${linkClass}">
                            ${avatarHtml}
                            <span class="${canLink ? 'hover-underline' : ''} fw-bold">${displayName}</span>
                            ${badgeHtmlRight}
                        </a>
                    </td>
                    <td class="fw-bold ${statColorClass}" data-label="${labelText}" style="font-size: 1.1rem;">
                        ${statValue}
                    </td>
                    ${type === 'max_score' ? '' : `<td data-label="24時間比"><span class="${delta.cls}" style="color: ${delta.color};">${delta.text}</span></td>`}
                    <td data-label="${type === 'match_count' ? '局数' : '試合数'}">${type === 'match_count' ? s.hand_total : s.count}</td>
                </tr>
            `;
        }).join('');
    };

    // 表彰台とテーブルの振り分け
    const top3 = rankedPlayers.slice(0, 3);
    const others = rankedPlayers.slice(3);

    if (podiumContainer) {
        podiumContainer.innerHTML = renderPodium(top3, type);
    }

    mainBody.innerHTML = renderRows(others, 3);

    if (outBody) {
        outBody.innerHTML = renderRows(rankOutPlayers, -1);
    }

    if (rankedPlayers.length === 0) {
        if (podiumContainer) podiumContainer.innerHTML = '';
        mainBody.innerHTML = '<tr><td colspan="4" class="text-muted py-4">該当するデータがありません</td></tr>';
    }
}

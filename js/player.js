// URLパラメータからプレイヤーIDを取得
const urlParams = new URLSearchParams(window.location.search);
const playerId = urlParams.get('id');

let allMahjongRecords = [];
let allMatches = [];
let currentFilter = 'all';
let currentSeasonMode = 'current';

// ページ読み込み時の処理
async function loadPlayerData() {
    if (!playerId) {
        alert('プレイヤーIDが指定されていません');
        window.location.href = '../mahjong/index.html';
        return;
    }

    try {
        // プロフィール情報を取得
        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('discord_user_id', playerId)
            .maybeSingle();

        if (profile) {
            document.getElementById('player-avatar').src = profile.avatar_url || 'https://via.placeholder.com/80';
            document.getElementById('player-name').textContent = profile.account_name || playerId;
        } else {
            document.getElementById('player-name').textContent = playerId;
        }

        // 第二回麻雀大会データ
        const { data: currentData } = await supabaseClient
            .from('match_results')
            .select('*');

        // 第一回麻雀大会データ
        let legacyData = [];
        try {
            const { data, error: legacyError } = await supabaseClient
                .from('tournament_player_stats_snapshot')
                .select('*');
            if (!legacyError) legacyData = data || [];
        } catch (e) {
            console.warn('過去データ取得スキップ');
        }

        allMahjongRecords = [...(currentData || []), ...legacyData];

        // 試合履歴用（表示用フィルタリング前）
        allMatches = (currentData || []).filter(m => m.discord_user_id === playerId);

        displayMahjongStats();
        renderMatches(allMatches);

    } catch (err) {
        console.error('Error loading player data:', err);
        document.getElementById('stats-loading').style.display = 'none';
        document.getElementById('no-stats-msg').style.display = 'block';
    }
}

function toggleSeason(season) {
    currentSeasonMode = season;

    // ボタンスタイル更新
    const btns = document.querySelectorAll('.profile-card .btn-group .btn');
    btns.forEach(btn => {
        if (btn.textContent === '今シーズン' && season === 'current') {
            btn.classList.replace('btn-outline-primary', 'btn-primary');
        } else if (btn.textContent === '全シーズン' && season === 'all') {
            btn.classList.replace('btn-outline-primary', 'btn-primary');
        } else {
            btn.classList.replace('btn-primary', 'btn-outline-primary');
        }
    });

    displayMahjongStats();
}

function displayMahjongStats() {
    // シーズンフィルタ
    let records = allMahjongRecords;
    if (currentSeasonMode === 'current') {
        records = records.filter(r => r.tournament_type === '第二回麻雀大会');
    }

    // 全プレイヤーの統計計算
    const playerStats = calculateAllPlayerStats(records);

    // このプレイヤーの統計を取得
    const myStats = playerStats.find(p => p.name === playerId);

    document.getElementById('stats-loading').style.display = 'none';
    document.getElementById('stats-content').style.display = 'block';

    if (!myStats || myStats.games === 0) {
        document.getElementById('no-stats-msg').style.display = 'block';
        document.getElementById('stats-content').style.display = 'none';
        return;
    }
    document.getElementById('no-stats-msg').style.display = 'none';
    document.getElementById('stats-content').style.display = 'block';

    // 各統計を表示
    updateStatCard('total', myStats.total, playerStats, 'total', true);
    updateStatCard('sanma', myStats.sanma, playerStats, 'sanma', true);
    updateStatCard('yonma', myStats.yonma, playerStats, 'yonma', true);
    updateStatCard('avg-score', myStats.avgScore.toFixed(1), playerStats, 'avgScore', true);
    updateStatCard('max-score', myStats.maxScore, playerStats, 'maxScore', true);
    updateStatCard('win-rate', myStats.winRate.toFixed(2) + ' / 試合', playerStats, 'winRate', true);
    updateStatCard('deal-rate', myStats.dealRate.toFixed(2) + ' / 試合', playerStats, 'dealRate', false);
    updateStatCard('top-rate', myStats.topRate.toFixed(1) + '%', playerStats, 'topRate', true);
    updateStatCard('avoid-rate', myStats.avoidRate.toFixed(1) + '%', playerStats, 'avoidRate', true);
    updateStatCard('avg-rank', myStats.avgRank.toFixed(2), playerStats, 'avgRank', false);
    updateStatCard('games', myStats.games, playerStats, 'games', true);
}

function updateStatCard(id, value, allStats, key, higherIsBetter) {
    const valEl = document.getElementById('stat-' + id);
    if (valEl) valEl.textContent = value;

    // 順位計算
    const sorted = [...allStats].filter(p => p.games > 0).sort((a, b) =>
        higherIsBetter ? b[key] - a[key] : a[key] - b[key]
    );
    const myRank = sorted.findIndex(p => p.name === playerId) + 1;
    const total = sorted.length;

    const rankEl = document.getElementById('rank-' + id);
    if (rankEl) {
        if (myRank > 0) {
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
        if (!id || id === 'null') {
            id = r.nickname || r.account_name || 'Unknown';
        }
        if (!id) return;

        if (!players[id]) {
            players[id] = {
                name: id,
                score: 0, sanma: 0, yonma: 0,
                count: 0, win: 0, deal: 0,
                r1: 0, r2: 0, r3: 0, r4: 0,
                max_score: -Infinity
            };
        }

        const p = players[id];
        const mode = r.mahjong_mode || r.mode || '';

        if (r.tournament_type === '第一回麻雀大会') {
            p.score += Number(r.score_total || 0);
            p.count += Number(r.matches_played || 0);
            p.r1 += Number(r.rank1_count || 0);
            p.r2 += Number(r.rank2_count || 0);
            p.r3 += Number(r.rank3_count || 0);
            p.r4 += Number(r.rank4_count || 0);
            p.max_score = Math.max(p.max_score, Number(r.score_max || 0));
        } else {
            p.score += Number(r.final_score || 0);
            p.count += 1;
            const rk = Number(r.rank);
            if (rk === 1) p.r1++;
            else if (rk === 2) p.r2++;
            else if (rk === 3) p.r3++;
            else if (rk === 4) p.r4++;
            p.max_score = Math.max(p.max_score, Number(r.final_score || 0));
        }

        p.win += Number(r.win_count || r.wins || 0);
        p.deal += Number(r.deal_in_count || r.deals || 0);

        if (mode === '三麻') p.sanma += Number(r.final_score || r.score_total || 0);
        if (mode === '四麻') p.yonma += Number(r.final_score || r.score_total || 0);
    });

    return Object.values(players).map(p => {
        const avgWin = p.count > 0 ? (p.win / p.count) : 0;
        const avgDeal = p.count > 0 ? (p.deal / p.count) : 0;
        const topRate = p.count > 0 ? (p.r1 / p.count) * 100 : 0;
        let lastCount = p.r4;
        if (p.r4 === 0 && p.r3 > 0) lastCount = p.r3;
        const avoidRate = p.count > 0 ? (1 - (lastCount / p.count)) * 100 : 0;
        const avgRank = p.count > 0 ? (1 * p.r1 + 2 * p.r2 + 3 * p.r3 + 4 * p.r4) / p.count : 0;
        const avgScore = p.count > 0 ? p.score / p.count : 0;

        return {
            name: p.name,
            total: p.score,
            sanma: p.sanma,
            yonma: p.yonma,
            avgScore: avgScore,
            maxScore: p.max_score === -Infinity ? 0 : p.max_score,
            winRate: avgWin,
            dealRate: avgDeal,
            avgRank: avgRank,
            topRate: topRate,
            avoidRate: avoidRate,
            games: p.count
        };
    });
}

// 試合履歴を表示
function renderMatches(matches) {
    const tbody = document.getElementById('match-history');
    if (!tbody) return;

    if (matches.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">試合データがありません</td></tr>';
        return;
    }

    tbody.innerHTML = matches.map(m => {
        const date = new Date(m.event_datetime);
        const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
        const rankClass = `rank-${m.rank}`;
        const scoreClass = m.final_score > 0 ? 'text-success fw-bold' : (m.final_score < 0 ? 'text-danger fw-bold' : '');

        return `
            <tr>
                <td>${dateStr}</td>
                <td>${m.mahjong_mode}</td>
                <td><span class="rank-badge ${rankClass}">${m.rank}位</span></td>
                <td>${(m.raw_points || 0).toLocaleString()}点</td>
                <td class="${scoreClass}">${(m.final_score > 0 ? '+' : '') + m.final_score.toFixed(1)}</td>
            </tr>
        `;
    }).join('');
}

function filterMatches(mode) {
    currentFilter = mode;
    const buttons = document.querySelectorAll('.match-history-section .btn-group .btn');
    buttons.forEach(btn => btn.classList.replace('btn-success', 'btn-outline-success'));

    if (mode === 'all') buttons[0]?.classList.replace('btn-outline-success', 'btn-success');
    else if (mode === '三麻') buttons[1]?.classList.replace('btn-outline-success', 'btn-success');
    else if (mode === '四麻') buttons[2]?.classList.replace('btn-outline-success', 'btn-success');

    let filtered = allMatches;
    if (mode !== 'all') {
        filtered = allMatches.filter(m => m.mahjong_mode === mode);
    }
    renderMatches(filtered);
}

loadPlayerData();

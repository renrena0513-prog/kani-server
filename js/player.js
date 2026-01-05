// URLパラメータからプレイヤーIDを取得
const urlParams = new URLSearchParams(window.location.search);
const playerId = urlParams.get('id');

let allMatches = [];
let currentFilter = 'all';

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

        // 試合履歴を取得
        const { data: matches, error } = await supabaseClient
            .from('match_results')
            .select('*')
            .eq('discord_user_id', playerId)
            .eq('tournament_type', '第二回麻雀大会')
            .order('event_datetime', { ascending: false });

        if (error) throw error;

        allMatches = matches || [];
        calculateStats(allMatches);
        renderMatches(allMatches);

    } catch (err) {
        console.error('Error loading player data:', err);
        alert('データの読み込みに失敗しました');
    }
}

// 統計情報を計算
function calculateStats(matches) {
    if (matches.length === 0) {
        document.getElementById('total-matches').textContent = '0';
        document.getElementById('avg-rank').textContent = '-';
        document.getElementById('total-score').textContent = '-';
        document.getElementById('first-rate').textContent = '-';
        return;
    }

    const totalMatches = matches.length;
    const sumRank = matches.reduce((sum, m) => sum + (m.rank || 0), 0);
    const avgRank = (sumRank / totalMatches).toFixed(2);
    const totalScore = matches.reduce((sum, m) => sum + (m.final_score || 0), 0);
    const firstPlaceCount = matches.filter(m => m.rank === 1).length;
    const firstRate = ((firstPlaceCount / totalMatches) * 100).toFixed(1);

    document.getElementById('total-matches').textContent = totalMatches;
    document.getElementById('avg-rank').textContent = avgRank;
    document.getElementById('total-score').textContent = (totalScore > 0 ? '+' : '') + totalScore.toFixed(1);
    document.getElementById('first-rate').textContent = firstRate + '%';
}

// 試合履歴を表示
function renderMatches(matches) {
    const tbody = document.getElementById('match-history');

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
                <td>${m.raw_points.toLocaleString()}点</td>
                <td class="${scoreClass}">${(m.final_score > 0 ? '+' : '') + m.final_score.toFixed(1)}</td>
            </tr>
        `;
    }).join('');
}

// フィルター機能
function filterMatches(mode) {
    currentFilter = mode;

    // ボタンのスタイル更新
    const buttons = document.querySelectorAll('.btn-group .btn');
    buttons.forEach(btn => btn.classList.replace('btn-success', 'btn-outline-success'));

    if (mode === 'all') {
        buttons[0].classList.replace('btn-outline-success', 'btn-success');
    } else if (mode === '三麻') {
        buttons[1].classList.replace('btn-outline-success', 'btn-success');
    } else if (mode === '四麻') {
        buttons[2].classList.replace('btn-outline-success', 'btn-success');
    }

    // フィルタリング
    let filtered = allMatches;
    if (mode !== 'all') {
        filtered = allMatches.filter(m => m.mahjong_mode === mode);
    }

    calculateStats(filtered);
    renderMatches(filtered);
}

// ページロード時に実行
loadPlayerData();

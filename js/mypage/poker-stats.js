// マイページ ポーカー統計
let pokerRecordsAll = [];

async function loadPokerStats() {
    try {
        const urlParams = new URLSearchParams(window.location.search);
        let targetDiscordId = urlParams.get('user');
        if (!targetDiscordId) {
            const user = await getCurrentUser();
            if (!user) return;
            targetDiscordId = user.user_metadata.provider_id;
        }

        const { data, error } = await supabaseClient
            .from('poker_results')
            .select('final_score, rank, player_count, match_mode, tournament_type')
            .eq('discord_user_id', targetDiscordId);
        if (error) throw error;

        pokerRecordsAll = (data || []).filter(r => r.match_mode !== 'チーム戦');

        // 大会セレクト更新
        const sel = document.getElementById('poker-tournament-select');
        if (sel) {
            const types = [...new Set(pokerRecordsAll.map(r => r.tournament_type).filter(Boolean))];
            types.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t;
                opt.textContent = t;
                sel.appendChild(opt);
            });
        }

        document.getElementById('poker-stats-loading').style.display = 'none';
        renderPokerStats();
    } catch (err) {
        console.error('ポーカー統計取得エラー:', err);
        document.getElementById('poker-stats-loading').style.display = 'none';
        document.getElementById('poker-no-stats-msg').style.display = '';
    }
}

function renderPokerStats() {
    const sel = document.getElementById('poker-tournament-select');
    const tournament = sel ? sel.value : 'all';

    let records = pokerRecordsAll;
    if (tournament !== 'all') {
        records = records.filter(r => r.tournament_type === tournament);
    }

    const content = document.getElementById('poker-stats-content');
    const noMsg = document.getElementById('poker-no-stats-msg');

    if (records.length === 0) {
        content.style.display = 'none';
        noMsg.style.display = '';
        return;
    }
    noMsg.style.display = 'none';
    content.style.display = '';

    const count = records.length;
    const total = records.reduce((s, r) => s + Number(r.final_score || 0), 0);
    const avg = total / count;
    const max = Math.max(...records.map(r => Number(r.final_score || 0)));
    const r1 = records.filter(r => Number(r.rank) === 1).length;
    const rLast = records.filter(r => Number(r.rank) === Number(r.player_count || 4)).length;
    const rankSum = records.reduce((s, r) => s + Number(r.rank || 0), 0);
    const avgRank = rankSum / count;
    const winRate = (r1 / count) * 100;
    const avoidRate = (1 - rLast / count) * 100;

    const fmt = n => n >= 0 ? `+${n.toFixed(1)}` : n.toFixed(1);

    document.getElementById('poker-stat-games').textContent = count;
    document.getElementById('poker-stat-total').textContent = fmt(total);
    document.getElementById('poker-stat-avg').textContent = fmt(avg);
    document.getElementById('poker-stat-max').textContent = fmt(max);
    document.getElementById('poker-stat-win-rate').textContent = `${winRate.toFixed(1)}%`;
    document.getElementById('poker-stat-avoid').textContent = `${avoidRate.toFixed(1)}%`;
    document.getElementById('poker-stat-avg-rank').textContent = avgRank.toFixed(2);

    ['poker-stat-total', 'poker-stat-avg', 'poker-stat-max'].forEach(id => {
        const el = document.getElementById(id);
        el.style.color = parseFloat(el.textContent) >= 0 ? '#1e7e34' : '#b31d1d';
    });
}

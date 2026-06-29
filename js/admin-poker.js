// ポーカー記録管理（管理画面用）
let pokerRecordsRaw = [];
let pokerMatchGroups = {};

// =====================================
// 記録リスト読み込み・表示
// =====================================
async function fetchPokerRecords() {
    document.getElementById('poker-records-body').innerHTML =
        '<tr><td colspan="3" class="text-center text-muted py-4"><span class="spinner-border spinner-border-sm me-2"></span>読み込み中...</td></tr>';

    const { data, error } = await supabaseClient
        .from('poker_results')
        .select('*')
        .order('event_datetime', { ascending: false });

    if (error) {
        document.getElementById('poker-records-body').innerHTML =
            `<tr><td colspan="3" class="text-center text-danger py-4">読み込みエラー: ${error.message}</td></tr>`;
        return;
    }

    pokerRecordsRaw = data || [];
    pokerMatchGroups = {};
    pokerRecordsRaw.forEach(r => {
        if (!pokerMatchGroups[r.match_id]) pokerMatchGroups[r.match_id] = [];
        pokerMatchGroups[r.match_id].push(r);
    });

    renderPokerRecords();
}

function renderPokerRecords() {
    const tbody = document.getElementById('poker-records-body');
    const groups = Object.values(pokerMatchGroups);

    if (groups.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-4">記録がありません</td></tr>';
        return;
    }

    tbody.innerHTML = groups.map(players => {
        const first = players[0];
        const dt = new Date(first.event_datetime).toLocaleString('ja-JP', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
        const sorted = [...players].sort((a, b) => a.rank - b.rank);
        const summary = sorted.map(p => {
            const score = p.final_score > 0 ? `+${p.final_score}` : String(p.final_score);
            const team = p.team_name ? `(${p.team_name})` : '';
            return `<span class="badge ${p.rank === 1 ? 'bg-warning text-dark' : p.rank === 2 ? 'bg-info text-dark' : p.rank === 3 ? 'bg-success' : 'bg-secondary'} me-1">${p.rank}位</span>${p.account_name}${team} <small class="text-muted">${score}pt</small>`;
        }).join('<br>');

        return `<tr>
            <td style="white-space:nowrap;">${dt}</td>
            <td style="font-size:0.85rem;line-height:1.8;">${summary}</td>
            <td style="white-space:nowrap;">
                <button class="btn btn-sm btn-outline-danger" onclick="deletePokerMatch('${first.match_id}')">🗑️ 削除</button>
            </td>
        </tr>`;
    }).join('');
}

// =====================================
// 削除
// =====================================
async function deletePokerMatch(matchId) {
    const players = pokerMatchGroups[matchId] || [];
    const names = players.sort((a, b) => a.rank - b.rank).map(p => `${p.rank}位: ${p.account_name}`).join('\n');
    if (!confirm(`以下の試合記録を削除します。\n付与されたマネーと活動ログも削除されます。\n\n${names}`)) return;

    try {
        const { data: logs, error: logFetchErr } = await supabaseClient
            .from('activity_logs')
            .select('user_id, amount, details')
            .eq('match_id', matchId)
            .eq('action_type', 'poker');
        if (logFetchErr) throw logFetchErr;

        const coinByUser = {};
        const chipByUser = {};
        (logs || []).forEach(log => {
            if (!log.user_id) return;
            if (log.amount > 0) coinByUser[log.user_id] = (coinByUser[log.user_id] || 0) + log.amount;
            const chipReward = log.details?.chip_reward || 0;
            if (chipReward > 0) chipByUser[log.user_id] = (chipByUser[log.user_id] || 0) + chipReward;
        });

        const allUserIds = new Set([...Object.keys(coinByUser), ...Object.keys(chipByUser)]);
        for (const userId of allUserIds) {
            const { data: profile, error: profErr } = await supabaseClient
                .from('profiles').select('coins, total_assets, tip').eq('discord_user_id', userId).maybeSingle();
            if (profErr) throw profErr;
            if (profile) {
                const updates = {};
                if (coinByUser[userId]) {
                    updates.coins = Math.max(0, (profile.coins || 0) - coinByUser[userId]);
                    updates.total_assets = Math.max(0, (profile.total_assets || 0) - coinByUser[userId]);
                }
                if (chipByUser[userId]) updates.tip = Math.max(0, (profile.tip || 0) - chipByUser[userId]);
                await supabaseClient.from('profiles').update(updates).eq('discord_user_id', userId);
            }
        }

        await supabaseClient.from('activity_logs').delete().eq('match_id', matchId).eq('action_type', 'poker');

        const { error: recDelErr, count: delCount } = await supabaseClient
            .from('poker_results').delete({ count: 'exact' }).eq('match_id', matchId);
        if (recDelErr) throw recDelErr;
        if (delCount === 0) throw new Error('RLSにより削除がブロックされました。');

        await fetchPokerRecords();
        alert('削除しました。');
    } catch (err) {
        alert('削除エラー: ' + err.message);
        console.error(err);
    }
}

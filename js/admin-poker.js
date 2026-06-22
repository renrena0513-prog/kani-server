// ポーカー記録管理（管理画面用）
let pokerRecordsRaw = [];
let pokerMatchGroups = {};
let pokerAdminTeams = [];
let pokerAdminProfiles = [];
let editingPokerMatchId = null;

async function fetchPokerRecords() {
    document.getElementById('poker-records-body').innerHTML =
        '<tr><td colspan="4" class="text-center text-muted py-4"><span class="spinner-border spinner-border-sm me-2"></span>読み込み中...</td></tr>';

    const { data, error } = await supabaseClient
        .from('poker_results')
        .select('*')
        .order('event_datetime', { ascending: false });

    if (error) {
        document.getElementById('poker-records-body').innerHTML =
            `<tr><td colspan="4" class="text-center text-danger py-4">読み込みエラー: ${error.message}</td></tr>`;
        return;
    }

    pokerRecordsRaw = data || [];

    // match_id でグループ化
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
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4">記録がありません</td></tr>';
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
            <td>${first.player_count}人</td>
            <td style="font-size:0.85rem;line-height:1.8;">${summary}</td>
            <td style="white-space:nowrap;">
                <button class="btn btn-sm btn-outline-primary me-1" onclick="openPokerEditModal('${first.match_id}')">編集</button>
                <button class="btn btn-sm btn-outline-danger" onclick="deletePokerMatch('${first.match_id}')">削除</button>
            </td>
        </tr>`;
    }).join('');
}

async function deletePokerMatch(matchId) {
    const players = pokerMatchGroups[matchId] || [];
    const names = players.sort((a, b) => a.rank - b.rank).map(p => `${p.rank}位: ${p.account_name}`).join('\n');
    if (!confirm(`以下の試合記録を削除します。\n付与されたマネーと活動ログも削除されます。\n\n${names}`)) return;

    try {
        // 1. この試合の活動ログを取得（付与マネー・チップ額を確認）
        const { data: logs, error: logFetchErr } = await supabaseClient
            .from('activity_logs')
            .select('user_id, amount, details')
            .eq('match_id', matchId)
            .eq('action_type', 'poker');
        if (logFetchErr) throw logFetchErr;

        // 2. ユーザーごとの付与マネー・チップ合計を集計
        const coinByUser = {};
        const chipByUser = {};
        (logs || []).forEach(log => {
            if (!log.user_id) return;
            if (log.amount > 0) {
                coinByUser[log.user_id] = (coinByUser[log.user_id] || 0) + log.amount;
            }
            const chipReward = log.details?.chip_reward || 0;
            if (chipReward > 0) {
                chipByUser[log.user_id] = (chipByUser[log.user_id] || 0) + chipReward;
            }
        });

        // 3. マネー・チップを引き戻す
        const allUserIds = new Set([...Object.keys(coinByUser), ...Object.keys(chipByUser)]);
        for (const userId of allUserIds) {
            const { data: profile, error: profErr } = await supabaseClient
                .from('profiles')
                .select('coins, total_assets, tip')
                .eq('discord_user_id', userId)
                .maybeSingle();
            if (profErr) throw profErr;
            if (profile) {
                const updates = {};
                if (coinByUser[userId]) {
                    updates.coins = Math.max(0, (profile.coins || 0) - coinByUser[userId]);
                    updates.total_assets = Math.max(0, (profile.total_assets || 0) - coinByUser[userId]);
                }
                if (chipByUser[userId]) {
                    updates.tip = Math.max(0, (profile.tip || 0) - chipByUser[userId]);
                }
                const { error: updErr } = await supabaseClient.from('profiles').update(updates).eq('discord_user_id', userId);
                if (updErr) throw updErr;
            }
        }

        // 4. 活動ログを削除
        const { error: logDelErr } = await supabaseClient
            .from('activity_logs')
            .delete()
            .eq('match_id', matchId)
            .eq('action_type', 'poker');
        if (logDelErr) throw logDelErr;

        // 5. poker_results を削除（count で実際に消えたか確認）
        const { error: recDelErr, count: delCount } = await supabaseClient
            .from('poker_results')
            .delete({ count: 'exact' })
            .eq('match_id', matchId);
        if (recDelErr) throw recDelErr;
        if (delCount === 0) throw new Error('RLSポリシーにより削除がブロックされました。Supabase ダッシュボードで poker_results テーブルに DELETE ポリシーを追加してください。');

        await fetchPokerRecords();
        alert('削除しました。付与マネーと活動ログも取り消しました。');
    } catch (err) {
        alert('削除エラー: ' + err.message);
        console.error('deletePokerMatch error:', err);
    }
}

async function openPokerEditModal(matchId) {
    editingPokerMatchId = matchId;
    const players = (pokerMatchGroups[matchId] || []).sort((a, b) => a.rank - b.rank);
    const first = players[0];

    // チーム・プロフィール未ロード時に取得
    if (pokerAdminTeams.length === 0) {
        const { data } = await supabaseClient.from('poker_teams').select('id, team_name').order('team_name');
        pokerAdminTeams = data || [];
    }
    if (pokerAdminProfiles.length === 0) {
        const { data } = await supabaseClient
            .from('profiles')
            .select('discord_user_id, account_name')
            .eq('is_hidden', false)
            .order('account_name');
        pokerAdminProfiles = data || [];
    }

    // 日時セット（datetime-local用にローカル時刻に変換）
    const dtLocal = new Date(first.event_datetime);
    dtLocal.setMinutes(dtLocal.getMinutes() - dtLocal.getTimezoneOffset());
    document.getElementById('poker-edit-datetime').value = dtLocal.toISOString().slice(0, 16);
    document.getElementById('poker-edit-player-count').value = first.player_count;

    const teamOptions = pokerAdminTeams.map(t =>
        `<option value="${t.team_name}">${t.team_name}</option>`
    ).join('');

    const profileOptions = pokerAdminProfiles.map(p =>
        `<option value="${p.discord_user_id}">${p.account_name}</option>`
    ).join('');

    document.getElementById('poker-edit-players').innerHTML = players.map(p => `
        <div class="card p-3 mb-2" data-record-id="${p.id}">
            <div class="row g-2 align-items-end">
                <div class="col-md-3">
                    <label class="small text-muted">アカウント</label>
                    <select class="form-select form-select-sm poker-edit-account">
                        <option value="">-- 手入力 --</option>
                        ${pokerAdminProfiles.map(pr =>
                            `<option value="${pr.discord_user_id}" ${pr.discord_user_id === p.discord_user_id ? 'selected' : ''}>${pr.account_name}</option>`
                        ).join('')}
                    </select>
                    <input type="text" class="form-control form-control-sm mt-1 poker-edit-account-name"
                        placeholder="名前（直接入力も可）" value="${p.account_name}">
                    <input type="hidden" class="poker-edit-discord-id" value="${p.discord_user_id || ''}">
                </div>
                <div class="col-md-3">
                    <label class="small text-muted">チーム</label>
                    <select class="form-select form-select-sm poker-edit-team">
                        <option value="">なし</option>
                        ${pokerAdminTeams.map(t =>
                            `<option value="${t.team_name}" ${t.team_name === p.team_name ? 'selected' : ''}>${t.team_name}</option>`
                        ).join('')}
                    </select>
                </div>
                <div class="col-md-2">
                    <label class="small text-muted">順位</label>
                    <input type="number" class="form-control form-control-sm poker-edit-rank"
                        value="${p.rank}" min="1" max="8">
                </div>
                <div class="col-md-2">
                    <label class="small text-muted">スコア(pts)</label>
                    <input type="number" class="form-control form-control-sm poker-edit-score"
                        value="${p.final_score}">
                </div>
            </div>
        </div>
    `).join('');

    // アカウント選択 → 名前欄を自動更新
    document.querySelectorAll('#poker-edit-players .poker-edit-account').forEach(sel => {
        sel.addEventListener('change', function () {
            const card = this.closest('[data-record-id]');
            const profile = pokerAdminProfiles.find(pr => pr.discord_user_id === this.value);
            if (profile) {
                card.querySelector('.poker-edit-account-name').value = profile.account_name;
                card.querySelector('.poker-edit-discord-id').value = profile.discord_user_id;
            }
        });
    });

    new bootstrap.Modal(document.getElementById('pokerEditModal')).show();
}

async function savePokerMatch() {
    const matchId = editingPokerMatchId;
    if (!matchId) return;

    const datetimeVal = document.getElementById('poker-edit-datetime').value;
    const playerCount = Number(document.getElementById('poker-edit-player-count').value);
    const eventDatetime = new Date(datetimeVal).toISOString();

    const cards = document.querySelectorAll('#poker-edit-players [data-record-id]');
    const updates = [];
    cards.forEach(card => {
        updates.push({
            id: card.dataset.recordId,
            event_datetime: eventDatetime,
            discord_user_id: card.querySelector('.poker-edit-discord-id').value || null,
            account_name: card.querySelector('.poker-edit-account-name').value.trim(),
            team_name: card.querySelector('.poker-edit-team').value || null,
            rank: Number(card.querySelector('.poker-edit-rank').value),
            final_score: Number(card.querySelector('.poker-edit-score').value),
            player_count: playerCount,
        });
    });

    try {
        for (const u of updates) {
            const { id, ...fields } = u;
            const { error } = await supabaseClient.from('poker_results').update(fields).eq('id', id);
            if (error) throw error;
        }
        bootstrap.Modal.getInstance(document.getElementById('pokerEditModal'))?.hide();
        await fetchPokerRecords();
    } catch (err) {
        alert('保存エラー: ' + err.message);
    }
}

// ポーカー記録管理（管理画面用）
let pokerRecordsRaw = [];
let pokerMatchGroups = {};
let editingPokerMatchId = null;

const _POKER_UMA = {
    4: { 1:  4, 2:  2, 3: -2, 4: -4 },
    5: { 1:  5, 2:  3, 3:  0, 4: -3, 5: -5 },
    6: { 1:  6, 2:  4, 3:  1, 4: -1, 5: -4, 6: -6 },
    7: { 1:  7, 2:  5, 3:  2, 4:  0, 5: -2, 6: -5, 7: -7 },
    8: { 1:  8, 2:  6, 3:  3, 4:  1, 5: -1, 6: -3, 7: -6, 8: -8 },
};
const _POKER_CHIP = {
    4: { 1: 100, 2:  60, 3:  30, 4:  10 },
    5: { 1: 130, 2:  80, 3:  50, 4:  20, 5:  10 },
    6: { 1: 160, 2: 100, 3:  70, 4:  30, 5:  20, 6:  10 },
    7: { 1: 190, 2: 120, 3:  90, 4:  40, 5:  30, 6:  20, 7:  10 },
    8: { 1: 220, 2: 140, 3: 110, 4:  50, 5:  40, 6:  30, 7:  20, 8:  10 },
};
const _POKER_COIN = {
    4: { 1: 1800, 2: 1400, 3:  600, 4:  200 },
    5: { 1: 2200, 2: 1800, 3: 1200, 4:  600, 5:  200 },
    6: { 1: 2600, 2: 2200, 3: 1600, 4: 1200, 5:  600, 6:  200 },
    7: { 1: 3000, 2: 2600, 3: 2000, 4: 1600, 5: 1200, 6:  600, 7:  200 },
    8: { 1: 3400, 2: 3000, 3: 2400, 4: 2000, 5: 1600, 6: 1200, 7:  600, 8:  200 },
};

// =====================================
// 記録リスト読み込み・表示
// =====================================
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
                <button class="btn btn-sm btn-outline-primary me-1" onclick="openPokerEditModal('${first.match_id}')">✏️ 編集</button>
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

// =====================================
// ドラッグ&ドロップ編集
// =====================================
let _dragSrc = null;

async function openPokerEditModal(matchId) {
    editingPokerMatchId = matchId;
    const players = (pokerMatchGroups[matchId] || []).sort((a, b) => a.rank - b.rank);
    if (players.length === 0) return;

    const first = players[0];
    const pc = first.player_count;

    const dt = new Date(first.event_datetime).toLocaleString('ja-JP', {
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
    document.getElementById('poker-edit-info').textContent =
        `${dt}　${first.match_mode || ''}　${pc}人`;

    const list = document.getElementById('poker-drag-list');
    list.innerHTML = '';

    const RANK_COLORS = ['#d4a853', '#adb5bd', '#cd7f32'];

    players.forEach(p => {
        const row = document.createElement('div');
        row.className = 'poker-drag-row';
        row.draggable = true;
        row.dataset.recordId = p.id;
        row.dataset.originalRank = p.rank;
        row.dataset.discordId = p.discord_user_id || '';
        row.dataset.accountName = p.account_name;
        row.dataset.playerCount = pc;

        const rankColor = RANK_COLORS[p.rank - 1] || '#6c757d';

        row.innerHTML = `
            <div class="pdr-handle" title="ドラッグして順位変更">⠿</div>
            <div class="pdr-rank" style="color:${rankColor};">${p.rank}位</div>
            <div class="pdr-name">
                <span class="fw-bold">${p.account_name}</span>
                ${p.team_name ? `<span class="pdr-team">${p.team_name}</span>` : ''}
            </div>
            <div class="pdr-reward">
                <span class="pdr-score"></span>
                <span class="pdr-chip ms-2">🪙<span class="pdr-chip-val"></span></span>
            </div>`;

        list.appendChild(row);

        row.addEventListener('dragstart', e => {
            _dragSrc = row;
            e.dataTransfer.effectAllowed = 'move';
            setTimeout(() => row.classList.add('pdr-dragging'), 0);
        });
        row.addEventListener('dragend', () => {
            row.classList.remove('pdr-dragging');
            list.querySelectorAll('.poker-drag-row').forEach(r => r.classList.remove('pdr-over'));
            _dragSrc = null;
            _refreshPokerDragUI();
        });
        row.addEventListener('dragover', e => {
            e.preventDefault();
            if (_dragSrc && _dragSrc !== row) {
                list.querySelectorAll('.poker-drag-row').forEach(r => r.classList.remove('pdr-over'));
                row.classList.add('pdr-over');
            }
        });
        row.addEventListener('dragleave', () => row.classList.remove('pdr-over'));
        row.addEventListener('drop', e => {
            e.preventDefault();
            if (_dragSrc && _dragSrc !== row) {
                const allRows = [...list.querySelectorAll('.poker-drag-row')];
                const srcIdx = allRows.indexOf(_dragSrc);
                const tgtIdx = allRows.indexOf(row);
                if (srcIdx < tgtIdx) list.insertBefore(_dragSrc, row.nextSibling);
                else list.insertBefore(_dragSrc, row);
                row.classList.remove('pdr-over');
                _refreshPokerDragUI();
            }
        });
    });

    _refreshPokerDragUI();
    new bootstrap.Modal(document.getElementById('pokerEditModal')).show();
}

function _refreshPokerDragUI() {
    const list = document.getElementById('poker-drag-list');
    const rows = [...list.querySelectorAll('.poker-drag-row')];
    const RANK_COLORS = ['#d4a853', '#adb5bd', '#cd7f32'];

    rows.forEach((row, idx) => {
        const newRank = idx + 1;
        const pc = Number(row.dataset.playerCount);
        const newScore = _POKER_UMA[pc]?.[newRank] ?? 0;
        const newChip  = _POKER_CHIP[pc]?.[newRank] ?? 0;
        const origRank = Number(row.dataset.originalRank);

        const rankColor = RANK_COLORS[newRank - 1] || '#6c757d';
        row.querySelector('.pdr-rank').textContent = `${newRank}位`;
        row.querySelector('.pdr-rank').style.color = rankColor;

        const scoreEl = row.querySelector('.pdr-score');
        scoreEl.textContent = (newScore >= 0 ? '+' : '') + newScore + 'pt';
        scoreEl.style.color = newScore >= 0 ? '#1e7e34' : '#b31d1d';

        row.querySelector('.pdr-chip-val').textContent = newChip;

        const changed = newRank !== origRank;
        row.classList.toggle('pdr-changed', changed);
    });

    _updatePokerChangePreview(rows);
}

function _updatePokerChangePreview(rows) {
    const preview = document.getElementById('poker-change-preview');
    const changes = [];

    rows.forEach((row, idx) => {
        const newRank  = idx + 1;
        const origRank = Number(row.dataset.originalRank);
        if (newRank === origRank) return;

        const pc = Number(row.dataset.playerCount);
        const origScore = _POKER_UMA[pc]?.[origRank] ?? 0;
        const newScore  = _POKER_UMA[pc]?.[newRank]  ?? 0;
        const origCoin  = _POKER_COIN[pc]?.[origRank] ?? 0;
        const newCoin   = _POKER_COIN[pc]?.[newRank]  ?? 0;
        const origChip  = _POKER_CHIP[pc]?.[origRank] ?? 0;
        const newChip   = _POKER_CHIP[pc]?.[newRank]  ?? 0;

        const arrow = newRank < origRank ? '⬆️' : '⬇️';
        changes.push({
            name: row.dataset.accountName,
            arrow,
            origRank, newRank,
            scoreDiff: newScore - origScore,
            coinDiff:  newCoin  - origCoin,
            chipDiff:  newChip  - origChip,
        });
    });

    if (changes.length === 0) {
        preview.innerHTML = '<p class="text-muted small mb-0">変更なし</p>';
        return;
    }

    const fmt = n => (n >= 0 ? '+' : '') + n.toLocaleString();
    preview.innerHTML = `
        <div class="alert alert-warning py-2 mb-0" style="font-size:0.88rem;">
            <strong>変更内容プレビュー</strong>
            <table class="table table-sm table-borderless mb-0 mt-1">
                <thead><tr>
                    <th>プレイヤー</th><th>順位</th>
                    <th>スコア差分</th><th>コイン差分</th><th>チップ差分</th>
                </tr></thead>
                <tbody>
                    ${changes.map(c => `<tr>
                        <td>${c.arrow} <strong>${c.name}</strong></td>
                        <td>${c.origRank}位 → ${c.newRank}位</td>
                        <td style="color:${c.scoreDiff >= 0 ? '#1e7e34' : '#b31d1d'}">${fmt(c.scoreDiff)}pt</td>
                        <td style="color:${c.coinDiff  >= 0 ? '#1e7e34' : '#b31d1d'}">${fmt(c.coinDiff)}</td>
                        <td style="color:${c.chipDiff  >= 0 ? '#1e7e34' : '#b31d1d'}">${fmt(c.chipDiff)}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>`;
}

async function savePokerMatch() {
    const matchId = editingPokerMatchId;
    if (!matchId) return;

    const list = document.getElementById('poker-drag-list');
    const rows = [...list.querySelectorAll('.poker-drag-row')];
    const players = pokerMatchGroups[matchId] || [];
    if (players.length === 0) return;
    const first = players[0];
    const pc = first.player_count;

    const updates = rows.map((row, idx) => {
        const newRank  = idx + 1;
        const origRank = Number(row.dataset.originalRank);
        return {
            recordId:    row.dataset.recordId,
            discordId:   row.dataset.discordId,
            accountName: row.dataset.accountName,
            origRank, newRank,
            newScore:  _POKER_UMA[pc]?.[newRank]  ?? 0,
            coinDiff: (_POKER_COIN[pc]?.[newRank] ?? 0) - (_POKER_COIN[pc]?.[origRank] ?? 0),
            chipDiff: (_POKER_CHIP[pc]?.[newRank] ?? 0) - (_POKER_CHIP[pc]?.[origRank] ?? 0),
        };
    });

    const changed = updates.filter(u => u.origRank !== u.newRank);
    if (changed.length === 0) {
        bootstrap.Modal.getInstance(document.getElementById('pokerEditModal'))?.hide();
        return;
    }

    if (!confirm(`${changed.length}人の順位を修正します。\nスコア・コイン・チップの差分が反映されます。\nDiscordにも通知されます。よろしいですか？`)) return;

    const saveBtn = document.querySelector('#pokerEditModal .btn-primary');
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = '保存中...'; }

    try {
        // 1. poker_results 更新
        for (const u of changed) {
            const { error } = await supabaseClient
                .from('poker_results')
                .update({ rank: u.newRank, final_score: u.newScore })
                .eq('id', u.recordId);
            if (error) throw error;
        }

        // 2. profiles 差分反映（管理者はRLS admin_all ポリシーで直接更新可能）
        for (const u of changed) {
            if (!u.discordId) continue;
            const { data: profile, error: pErr } = await supabaseClient
                .from('profiles').select('coins, total_assets, tip')
                .eq('discord_user_id', u.discordId).maybeSingle();
            if (pErr) throw pErr;
            if (!profile) continue;

            await supabaseClient.from('profiles').update({
                coins:        Math.max(0, (profile.coins        || 0) + u.coinDiff),
                total_assets: Math.max(0, (profile.total_assets || 0) + u.coinDiff),
                tip:          Math.max(0, (profile.tip          || 0) + u.chipDiff),
            }).eq('discord_user_id', u.discordId);
        }

        // 3. activity_logs 差分更新
        for (const u of changed) {
            if (!u.discordId) continue;
            const { data: logs } = await supabaseClient
                .from('activity_logs').select('id, details, amount')
                .eq('user_id', u.discordId).eq('match_id', matchId).eq('action_type', 'poker');
            if (!logs?.length) continue;
            const log = logs[0];
            const newCoin = _POKER_COIN[pc]?.[u.newRank] ?? 0;
            const newChip = _POKER_CHIP[pc]?.[u.newRank] ?? 0;
            await supabaseClient.from('activity_logs').update({
                amount: newCoin,
                details: { ...log.details, rank: u.newRank, score: u.newScore, coin_reward: newCoin, chip_reward: newChip },
            }).eq('id', log.id);
        }

        // 4. Discord通知
        await _sendPokerEditDiscord(first, pc, changed);

        // 5. 後処理
        pokerMatchGroups[matchId].forEach(p => {
            const u = updates.find(x => x.recordId === p.id);
            if (u) { p.rank = u.newRank; p.final_score = u.newScore; }
        });

        bootstrap.Modal.getInstance(document.getElementById('pokerEditModal'))?.hide();
        await fetchPokerRecords();
        alert('修正完了！Discordに通知しました。');
    } catch (err) {
        alert('保存エラー: ' + err.message);
        console.error(err);
    } finally {
        if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = '💾 保存して通知'; }
    }
}

async function _sendPokerEditDiscord(matchInfo, pc, changed) {
    if (typeof DISCORD_WEBHOOK_URL === 'undefined' || !DISCORD_WEBHOOK_URL) return;

    const dt = new Date(matchInfo.event_datetime).toLocaleString('ja-JP', {
        year: 'numeric', month: 'numeric', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
    const MEDALS = ['🥇', '🥈', '🥉'];

    const fields = changed.map(u => {
        const nameDisplay = u.discordId ? `<@${u.discordId}>` : `**${u.accountName}**`;
        const om = MEDALS[u.origRank - 1] || `${u.origRank}位`;
        const nm = MEDALS[u.newRank  - 1] || `${u.newRank}位`;
        const origScore = _POKER_UMA[pc]?.[u.origRank] ?? 0;
        const fmt = n => (n >= 0 ? '+' : '') + n;
        return {
            name: `${om} → ${nm}　${nameDisplay}`,
            value: [
                `スコア: **${fmt(origScore)}pt → ${fmt(u.newScore)}pt**`,
                `コイン差分: ${u.coinDiff >= 0 ? '+' : ''}${u.coinDiff.toLocaleString()}`,
                `チップ差分: ${u.chipDiff >= 0 ? '+' : ''}${u.chipDiff}`,
            ].join('\n'),
            inline: false,
        };
    });

    const embed = {
        title: `🛠️ ポーカー記録修正　${dt}`,
        color: 0xe67e22,
        description: `${matchInfo.match_mode || 'チーム戦'} ・ ${pc}人トーナメント`,
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: '管理者による記録修正' },
    };

    try {
        const res = await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] }),
        });
        if (!res.ok) console.error('Discord通知失敗:', res.status, await res.text());
    } catch (err) {
        console.error('Discord通知エラー:', err);
    }
}

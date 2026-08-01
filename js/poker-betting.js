// 決勝卓予想（優勝チーム予想ベッティング）ページ用ロジック
let isAdmin = false;
let allTeams = [];
let currentUserId = null;
let currentEvent = null;
let selectedBetTeam = null;
let selectedSettleWinner = null;
let openEventRowSeq = 0;

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

document.addEventListener('DOMContentLoaded', async () => {
    currentUserId = await getEffectiveUserId();
    await Promise.all([checkAdminStatus(), fetchTeams()]);
    await loadEventState();

    const openModalEl = document.getElementById('openEventModal');
    openModalEl.addEventListener('show.bs.modal', resetOpenEventModal);
});

async function checkAdminStatus() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user) {
        isAdmin = ADMIN_DISCORD_IDS.includes(user.user_metadata.provider_id);
    }
}

async function fetchTeams() {
    const { data, error } = await supabaseClient
        .from('poker_teams')
        .select('id, team_name, icon_url')
        .order('team_name');
    if (!error) allTeams = data || [];
}

// ===== イベント状態の読み込み・表示切替 =====
async function loadEventState() {
    document.getElementById('state-loading').style.display = '';
    document.getElementById('state-none').style.display = 'none';
    document.getElementById('state-open').style.display = 'none';
    document.getElementById('state-settled').style.display = 'none';
    document.getElementById('btn-settle-event').style.display = 'none';
    document.getElementById('btn-open-event').style.display = 'none';

    const { data, error } = await supabaseClient
        .from('poker_finals_predictions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

    document.getElementById('state-loading').style.display = 'none';

    if (error) {
        showNotice('読み込みエラー: ' + error.message, 'error');
        return;
    }

    currentEvent = (data && data[0]) || null;

    if (!currentEvent) {
        document.getElementById('state-none').style.display = '';
        if (isAdmin) document.getElementById('btn-open-event').style.display = '';
        return;
    }

    if (currentEvent.status === 'open') {
        if (isAdmin) document.getElementById('btn-settle-event').style.display = '';
        await renderOpenState();
    } else {
        if (isAdmin) document.getElementById('btn-open-event').style.display = '';
        await renderSettledState();
    }
}

// ===== 開催中（賭け受付）画面 =====
async function renderOpenState() {
    const teams = currentEvent.teams || [];
    selectedBetTeam = null;

    document.getElementById('open-event-title').textContent = `🎯 ${currentEvent.title}`;

    const grid = document.getElementById('open-team-grid');
    grid.innerHTML = teams.map(t => `
        <div class="team-bet-card" data-team-name="${escapeHtml(t.team_name)}" onclick="selectBetTeam('${escapeHtml(t.team_name).replace(/'/g, "\\'")}')">
            <div class="t-name">${escapeHtml(t.team_name)}</div>
            <div class="t-odds">${Number(t.odds).toFixed(1)}<span style="font-size:0.9rem;">倍</span></div>
            <div class="t-odds-label">オッズ</div>
        </div>
    `).join('');

    const { data: profile } = await supabaseClient
        .from('profiles').select('coins').eq('discord_user_id', currentUserId).maybeSingle();
    const balance = profile?.coins || 0;
    document.getElementById('my-balance-display').textContent = balance.toLocaleString() + ' マネー';

    const { data: myBet } = await supabaseClient
        .from('poker_finals_bets')
        .select('*')
        .eq('event_id', currentEvent.id)
        .eq('discord_user_id', currentUserId)
        .maybeSingle();

    document.getElementById('state-open').style.display = '';

    if (myBet) {
        document.getElementById('bet-form-area').style.display = 'none';
        const myBetArea = document.getElementById('my-bet-area');
        myBetArea.style.display = '';
        myBetArea.innerHTML = `
            <div class="my-bet-card">
                <div class="text-muted">あなたの予想</div>
                <div style="font-size:1.3rem;font-weight:700;margin:6px 0;">${escapeHtml(myBet.team_name)}</div>
                <div>${Number(myBet.amount).toLocaleString()} マネー ・ オッズ ${Number(myBet.odds).toFixed(1)}倍</div>
                <div class="text-muted mt-2">的中時の払戻: ${Math.round(myBet.amount * myBet.odds).toLocaleString()} マネー</div>
            </div>
        `;
    } else {
        document.getElementById('bet-form-area').style.display = '';
        document.getElementById('my-bet-area').style.display = 'none';
        document.getElementById('bet-amount-input').value = '';
        document.getElementById('btn-place-bet').disabled = true;
    }
}

function selectBetTeam(teamName) {
    selectedBetTeam = teamName;
    document.querySelectorAll('#open-team-grid .team-bet-card').forEach(card => {
        card.classList.toggle('selected', card.dataset.teamName === teamName);
    });
    document.getElementById('btn-place-bet').disabled = false;
}

async function placeBet() {
    if (!selectedBetTeam) {
        showNotice('チームを選択してください。', 'warning');
        return;
    }
    const amount = Number(document.getElementById('bet-amount-input').value);
    if (!amount || amount <= 0) {
        showNotice('賭ける金額を入力してください。', 'warning');
        return;
    }

    const btn = document.getElementById('btn-place-bet');
    btn.disabled = true;

    const { data, error } = await supabaseClient.rpc('poker_bet_place', {
        p_discord_user_id: currentUserId,
        p_event_id: currentEvent.id,
        p_team_name: selectedBetTeam,
        p_amount: amount
    });

    if (error) {
        showNotice('送信エラー: ' + error.message, 'error');
        btn.disabled = false;
        return;
    }
    if (!data.ok) {
        showNotice(data.error || '賭けに失敗しました。', 'warning');
        btn.disabled = false;
        return;
    }

    showNotice(`${selectedBetTeam} に ${amount.toLocaleString()} マネー賭けました！`, 'success');
    await renderOpenState();
}

// ===== 結果画面 =====
async function renderSettledState() {
    const teams = currentEvent.teams || [];

    document.getElementById('settled-winner-name').textContent = currentEvent.winner_team_name || '-';

    const grid = document.getElementById('settled-team-grid');
    grid.innerHTML = teams.map(t => `
        <div class="team-bet-card ${t.team_name === currentEvent.winner_team_name ? 'winner' : ''}">
            <div class="t-name">${t.team_name === currentEvent.winner_team_name ? '🏆 ' : ''}${escapeHtml(t.team_name)}</div>
            <div class="t-odds">${Number(t.odds).toFixed(1)}<span style="font-size:0.9rem;">倍</span></div>
            <div class="t-odds-label">オッズ</div>
        </div>
    `).join('');

    const { data: myBet } = await supabaseClient
        .from('poker_finals_bets')
        .select('*')
        .eq('event_id', currentEvent.id)
        .eq('discord_user_id', currentUserId)
        .maybeSingle();

    const outcomeArea = document.getElementById('settled-outcome-area');
    if (!myBet) {
        outcomeArea.innerHTML = `<p class="text-muted text-center mt-3">今回はこのイベントに参加していません。</p>`;
    } else {
        const won = myBet.payout > 0;
        const profit = (myBet.payout || 0) - myBet.amount;
        outcomeArea.innerHTML = `
            <div class="result-outcome ${won ? 'win' : 'lose'}">
                <div>${escapeHtml(myBet.team_name)} に ${Number(myBet.amount).toLocaleString()} マネー賭けました</div>
                <div class="profit mt-2">${won ? '🎉 的中！' : '😢 不的中'} ${profit >= 0 ? '+' : ''}${profit.toLocaleString()} マネー</div>
                ${won ? `<div class="text-muted mt-1">払戻: ${Number(myBet.payout).toLocaleString()} マネー</div>` : ''}
            </div>
        `;
    }

    document.getElementById('state-settled').style.display = '';
}

// ===== 管理者: 開催 =====
function resetOpenEventModal() {
    document.getElementById('open-event-title-input').value = '';
    document.getElementById('open-event-error').style.display = 'none';
    document.getElementById('open-event-team-rows').innerHTML = '';
    openEventRowSeq = 0;
    addOpenEventTeamRow();
    addOpenEventTeamRow();
}

function addOpenEventTeamRow() {
    openEventRowSeq++;
    const id = openEventRowSeq;
    const options = allTeams.map(t => `<option value="${escapeHtml(t.team_name)}">${escapeHtml(t.team_name)}</option>`).join('');
    document.getElementById('open-event-team-rows').insertAdjacentHTML('beforeend', `
        <div class="team-row" id="open-event-row-${id}">
            <select class="form-select team-select">
                <option value="">チームを選択</option>
                ${options}
            </select>
            <input type="number" class="form-control odds-input" placeholder="オッズ" step="0.1" min="0.1">
            <button type="button" class="btn-remove-row" onclick="removeOpenEventTeamRow(${id})">×</button>
        </div>
    `);
}

function removeOpenEventTeamRow(id) {
    const rows = document.querySelectorAll('#open-event-team-rows .team-row');
    if (rows.length <= 2) {
        showNotice('チームは最低2つ必要です。', 'warning');
        return;
    }
    document.getElementById(`open-event-row-${id}`)?.remove();
}

async function confirmOpenEvent() {
    const errorEl = document.getElementById('open-event-error');
    errorEl.style.display = 'none';

    const rows = document.querySelectorAll('#open-event-team-rows .team-row');
    const teams = [];
    const seenNames = new Set();
    for (const row of rows) {
        const teamName = row.querySelector('.team-select').value;
        const odds = Number(row.querySelector('.odds-input').value);
        if (!teamName) {
            errorEl.textContent = 'チームを選択してください。';
            errorEl.style.display = '';
            return;
        }
        if (seenNames.has(teamName)) {
            errorEl.textContent = '同じチームが複数選択されています。';
            errorEl.style.display = '';
            return;
        }
        if (!odds || odds <= 0) {
            errorEl.textContent = `${teamName} のオッズを正しく入力してください。`;
            errorEl.style.display = '';
            return;
        }
        seenNames.add(teamName);
        teams.push({ team_name: teamName, odds });
    }
    if (teams.length < 2) {
        errorEl.textContent = 'チームは2つ以上必要です。';
        errorEl.style.display = '';
        return;
    }

    const title = document.getElementById('open-event-title-input').value.trim();
    const btn = document.getElementById('btn-confirm-open');
    btn.disabled = true;

    const { data, error } = await supabaseClient.rpc('poker_bet_open_event', {
        p_teams: teams,
        p_title: title || null
    });

    btn.disabled = false;

    if (error) {
        errorEl.textContent = '送信エラー: ' + error.message;
        errorEl.style.display = '';
        return;
    }
    if (!data.ok) {
        errorEl.textContent = data.error || '開催に失敗しました。';
        errorEl.style.display = '';
        return;
    }

    bootstrap.Modal.getInstance(document.getElementById('openEventModal'))?.hide();
    showNotice('決勝卓予想を開催しました！', 'success');
    await loadEventState();
}

// ===== 管理者: 結果を入力 =====
document.addEventListener('DOMContentLoaded', () => {
    const settleModalEl = document.getElementById('settleModal');
    settleModalEl.addEventListener('show.bs.modal', () => {
        selectedSettleWinner = null;
        document.getElementById('settle-error').style.display = 'none';
        document.getElementById('btn-confirm-settle').disabled = true;
        const teams = currentEvent?.teams || [];
        document.getElementById('settle-team-list').innerHTML = teams.map(t => `
            <div class="team-row settle-option" data-team-name="${escapeHtml(t.team_name)}"
                 style="cursor:pointer;padding:12px 16px;border:1.5px solid rgba(255,255,255,0.15);border-radius:12px;margin-bottom:8px;"
                 onclick="selectSettleWinner('${escapeHtml(t.team_name).replace(/'/g, "\\'")}', this)">
                <span style="font-weight:700;">${escapeHtml(t.team_name)}</span>
                <span class="text-muted" style="margin-left:8px;">オッズ ${Number(t.odds).toFixed(1)}倍</span>
            </div>
        `).join('');
    });
});

function selectSettleWinner(teamName, el) {
    selectedSettleWinner = teamName;
    document.querySelectorAll('#settle-team-list .settle-option').forEach(row => {
        row.style.borderColor = row === el ? 'var(--gold)' : 'rgba(255,255,255,0.15)';
        row.style.background = row === el ? 'rgba(212,168,83,0.18)' : '';
    });
    document.getElementById('btn-confirm-settle').disabled = false;
}

async function confirmSettleEvent() {
    if (!selectedSettleWinner) return;
    const errorEl = document.getElementById('settle-error');
    errorEl.style.display = 'none';

    if (!confirm(`「${selectedSettleWinner}」の優勝で結果を確定します。全プレイヤーへの払戻が行われます。よろしいですか？`)) return;

    const btn = document.getElementById('btn-confirm-settle');
    btn.disabled = true;

    const { data, error } = await supabaseClient.rpc('poker_bet_settle', {
        p_event_id: currentEvent.id,
        p_winner_team_name: selectedSettleWinner
    });

    if (error) {
        errorEl.textContent = '送信エラー: ' + error.message;
        errorEl.style.display = '';
        btn.disabled = false;
        return;
    }
    if (!data.ok) {
        errorEl.textContent = data.error || '結果確定に失敗しました。';
        errorEl.style.display = '';
        btn.disabled = false;
        return;
    }

    bootstrap.Modal.getInstance(document.getElementById('settleModal'))?.hide();
    showNotice(`結果を確定しました。${data.winners}人に払戻（合計${Number(data.total_payout).toLocaleString()}マネー）を行いました。`, 'success');
    await loadEventState();
}

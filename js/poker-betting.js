// 決勝卓予想（優勝チーム予想ベッティング）ページ用ロジック
let isAdmin = false;
let allTeams = [];
let teamIconMap = {}; // team_name -> icon_url
let currentUserId = null;
let currentEvent = null;
let bettingSettings = null;

let selectedBetType = 'win';
let selectedSelection = null; // 配列。win/place=[team]、trio/trifecta=[team,team,team]
let selectedOdds = null;
let comboLists = { trio: [], trifecta: [] }; // 現在のイベントの全組み合わせ（オッズ検索用）

let openEventRowSeq = 0;
let previewData = { place: [], trio: [], trifecta: [] };
let previewTab = 'place';

const BET_TYPE_LABELS = { win: '単勝', place: '複勝', trio: '三連複', trifecta: '三連単' };
const BET_TYPE_DESCRIPTIONS = {
    win: '🥇 1位になるチームを当てます。的中すればオッズ通りの配当がもらえます。',
    place: '🎖️ 3位以内に入るチームを当てます。的中しやすい分、配当は控えめです。',
    trio: '🎯 1〜3位に入る3チームを「順不同」で当てます。着順は関係ありません。',
    trifecta: '🏆 1位・2位・3位を「着順通り」に当てます。的中は難しい分、高配当が狙えます。'
};

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/** チームアイコンHTML（カード/表彰台向け・40px・中央揃え） */
function teamIconBlockHtml(teamName) {
    const url = teamIconMap[teamName];
    return url
        ? `<img src="${escapeHtml(url)}" class="team-icon-img" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'team-icon-placeholder',textContent:'🏅'}))">`
        : `<span class="team-icon-placeholder">🏅</span>`;
}

/** チームアイコンHTML（文中向け・20px・インライン） */
function teamIconInlineHtml(teamName) {
    const url = teamIconMap[teamName];
    return url
        ? `<img src="${escapeHtml(url)}" class="team-icon-inline" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'team-icon-placeholder-inline',textContent:'🏅'}))">`
        : `<span class="team-icon-placeholder-inline">🏅</span>`;
}

document.addEventListener('DOMContentLoaded', async () => {
    currentUserId = await getEffectiveUserId();
    await Promise.all([checkAdminStatus(), fetchTeams()]);
    if (isAdmin) await fetchSettings();
    await loadEventState();

    document.getElementById('openEventModal').addEventListener('show.bs.modal', resetOpenEventModal);

    document.getElementById('settleModal').addEventListener('show.bs.modal', () => {
        document.getElementById('settle-error').style.display = 'none';
        const teams = currentEvent?.teams || [];
        const optHtml = '<option value="">選択してください</option>' +
            teams.map(t => `<option value="${escapeHtml(t.team_name)}">${escapeHtml(t.team_name)}</option>`).join('');
        document.getElementById('settle-select-1').innerHTML = optHtml;
        document.getElementById('settle-select-2').innerHTML = optHtml;
        document.getElementById('settle-select-3').innerHTML = optHtml;
    });

    document.getElementById('settingsModal').addEventListener('show.bs.modal', () => {
        const s = bettingSettings || { payout_rate: 0.8, min_odds: 1.1, max_odds: 999 };
        document.getElementById('settings-payout-rate').value = Math.round(s.payout_rate * 100);
        document.getElementById('settings-min-odds').value = s.min_odds;
        document.getElementById('settings-max-odds').value = s.max_odds;
        document.getElementById('settings-error').style.display = 'none';
    });

    document.getElementById('betsOverviewModal').addEventListener('show.bs.modal', openBetsOverview);
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
    if (!error) {
        allTeams = data || [];
        teamIconMap = {};
        allTeams.forEach(t => { if (t.icon_url) teamIconMap[t.team_name] = t.icon_url; });
    }
}

async function fetchSettings() {
    const { data } = await supabaseClient.from('poker_betting_settings').select('*').eq('id', 1).maybeSingle();
    if (data) {
        bettingSettings = {
            payout_rate: Number(data.payout_rate),
            min_odds: Number(data.min_odds),
            max_odds: Number(data.max_odds)
        };
    }
}

// ===== イベント状態の読み込み・表示切替 =====
async function loadEventState() {
    document.getElementById('state-loading').style.display = '';
    document.getElementById('state-none').style.display = 'none';
    document.getElementById('state-cancelled').style.display = 'none';
    document.getElementById('state-open').style.display = 'none';
    document.getElementById('state-settled').style.display = 'none';
    document.getElementById('btn-settle-event').style.display = 'none';
    document.getElementById('btn-cancel-event').style.display = 'none';
    document.getElementById('btn-open-event').style.display = 'none';
    document.getElementById('btn-bets-overview').style.display = 'none';

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

    if (isAdmin) document.getElementById('btn-bets-overview').style.display = '';

    if (currentEvent.status === 'open') {
        if (isAdmin) {
            document.getElementById('btn-settle-event').style.display = '';
            document.getElementById('btn-cancel-event').style.display = '';
        }
        await renderOpenState();
    } else if (currentEvent.status === 'cancelled') {
        if (isAdmin) document.getElementById('btn-open-event').style.display = '';
        document.getElementById('state-cancelled').style.display = '';
    } else {
        if (isAdmin) document.getElementById('btn-open-event').style.display = '';
        await renderSettledState();
    }
}

// ===== 開催中（賭け受付）画面 =====
async function renderOpenState() {
    const teams = currentEvent.teams || [];

    document.getElementById('open-event-title').textContent = `🎯 ${currentEvent.title}`;

    const grid = document.getElementById('win-team-grid');
    grid.innerHTML = teams.map(t => `
        <div class="team-bet-card" data-team-name="${escapeHtml(t.team_name)}" onclick="selectWinTeam('${escapeHtml(t.team_name).replace(/'/g, "\\'")}')">
            ${teamIconBlockHtml(t.team_name)}
            <div class="t-name">${escapeHtml(t.team_name)}</div>
            <div class="t-odds">${Number(t.odds).toFixed(1)}<span style="font-size:0.85rem;">倍</span></div>
            <div class="t-odds-label">単勝オッズ</div>
        </div>
    `).join('');

    const placeGrid = document.getElementById('place-team-grid');
    placeGrid.innerHTML = (currentEvent.place_odds || []).map(t => `
        <div class="team-bet-card" data-team-name="${escapeHtml(t.team_name)}" onclick="selectPlaceTeam('${escapeHtml(t.team_name).replace(/'/g, "\\'")}')">
            ${teamIconBlockHtml(t.team_name)}
            <div class="t-name">${escapeHtml(t.team_name)}</div>
            <div class="t-odds">${Number(t.odds).toFixed(1)}<span style="font-size:0.85rem;">倍</span></div>
            <div class="t-odds-label">複勝オッズ</div>
        </div>
    `).join('');

    comboLists.trio = [...(currentEvent.trio_odds || [])].sort((a, b) => a.odds - b.odds);
    comboLists.trifecta = [...(currentEvent.trifecta_odds || [])].sort((a, b) => a.odds - b.odds);

    switchBetType('win');
    await refreshBalance();

    document.getElementById('state-open').style.display = '';
    await renderMyBets();
}

async function refreshBalance() {
    const { data: profile } = await supabaseClient
        .from('profiles').select('coins').eq('discord_user_id', currentUserId).maybeSingle();
    document.getElementById('my-balance-display').textContent = (profile?.coins || 0).toLocaleString() + ' マネー';
}

function switchBetType(type) {
    selectedBetType = type;
    selectedSelection = null;
    selectedOdds = null;

    document.querySelectorAll('.bet-type-tab').forEach(tab => tab.classList.toggle('active', tab.dataset.type === type));
    document.getElementById('bet-type-desc').textContent = BET_TYPE_DESCRIPTIONS[type] || '';
    document.getElementById('win-bet-panel').style.display = type === 'win' ? '' : 'none';
    document.getElementById('place-bet-panel').style.display = type === 'place' ? '' : 'none';
    document.getElementById('trio-bet-panel').style.display = type === 'trio' ? '' : 'none';
    document.getElementById('trifecta-bet-panel').style.display = type === 'trifecta' ? '' : 'none';

    document.querySelectorAll('#win-team-grid .team-bet-card, #place-team-grid .team-bet-card').forEach(c => c.classList.remove('selected'));
    if (type === 'trio' || type === 'trifecta') {
        document.getElementById(`${type}-pick-1`).value = '';
        document.getElementById(`${type}-pick-2`).value = '';
        document.getElementById(`${type}-pick-3`).value = '';
        document.getElementById(`${type}-picker-odds`).innerHTML = '';
        document.getElementById(`${type}-picker-preview`).innerHTML = '';
        populateComboPickers(type);
    }

    updateSelectedHint();
}

/** 三連複・三連単の1〜3着（または組み合わせ）プルダウンを、既に選ばれているチームを除外しつつ再描画 */
function populateComboPickers(type) {
    const teamNames = (currentEvent?.teams || []).map(t => t.team_name);
    const labels = type === 'trifecta' ? ['1着', '2着', '3着'] : ['チーム1', 'チーム2', 'チーム3'];
    for (let slot = 1; slot <= 3; slot++) {
        const sel = document.getElementById(`${type}-pick-${slot}`);
        const current = sel.value;
        const others = [1, 2, 3].filter(s => s !== slot)
            .map(s => document.getElementById(`${type}-pick-${s}`).value)
            .filter(Boolean);
        const options = teamNames.filter(t => t === current || !others.includes(t));
        sel.innerHTML = `<option value="">${labels[slot - 1]}</option>` +
            options.map(t => `<option value="${escapeHtml(t)}" ${t === current ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('');
    }
}

function updateComboPicker(type) {
    populateComboPickers(type);

    const picks = [1, 2, 3].map(s => document.getElementById(`${type}-pick-${s}`).value);
    const oddsEl = document.getElementById(`${type}-picker-odds`);
    const previewEl = document.getElementById(`${type}-picker-preview`);

    const labels = type === 'trifecta' ? ['1着', '2着', '3着'] : ['', '', ''];
    previewEl.innerHTML = picks.map((p, i) => p
        ? `<div class="cp-item">${teamIconBlockHtml(p)}<span>${labels[i] ? labels[i] + ' ' : ''}${escapeHtml(p)}</span></div>`
        : ''
    ).join('');

    if (picks.some(p => !p)) {
        oddsEl.innerHTML = '';
        selectedSelection = null;
        updateSelectedHint();
        return;
    }

    const lookupKey = type === 'trifecta' ? picks : [...picks].sort();
    const entry = comboLists[type].find(e => JSON.stringify(e.teams) === JSON.stringify(lookupKey));

    if (!entry) {
        oddsEl.textContent = '無効な組み合わせです';
        selectedSelection = null;
        updateSelectedHint();
        return;
    }

    oddsEl.innerHTML = `オッズ: <b>${Number(entry.odds).toFixed(1)}倍</b>`;
    selectedBetType = type;
    selectedSelection = picks;
    selectedOdds = entry.odds;
    updateSelectedHint();
}

function selectWinTeam(teamName) {
    const t = (currentEvent.teams || []).find(t => t.team_name === teamName);
    selectedBetType = 'win';
    selectedSelection = [teamName];
    selectedOdds = t ? Number(t.odds) : null;
    document.querySelectorAll('#win-team-grid .team-bet-card').forEach(card => {
        card.classList.toggle('selected', card.dataset.teamName === teamName);
    });
    updateSelectedHint();
}

function selectPlaceTeam(teamName) {
    const t = (currentEvent.place_odds || []).find(t => t.team_name === teamName);
    selectedBetType = 'place';
    selectedSelection = [teamName];
    selectedOdds = t ? Number(t.odds) : null;
    document.querySelectorAll('#place-team-grid .team-bet-card').forEach(card => {
        card.classList.toggle('selected', card.dataset.teamName === teamName);
    });
    updateSelectedHint();
}

function updateSelectedHint() {
    const hint = document.getElementById('selected-hint');
    const btn = document.getElementById('btn-place-bet');
    if (!selectedSelection) {
        hint.textContent = 'チームを選択してください';
        btn.disabled = true;
        updatePayoutPreview();
        return;
    }
    const sep = selectedBetType === 'trifecta' ? ' → ' : '・';
    hint.innerHTML = `${BET_TYPE_LABELS[selectedBetType]}: <b>${selectedSelection.map(escapeHtml).join(sep)}</b>`;
    btn.disabled = false;
    updatePayoutPreview();
}

/** 賭ける金額入力に応じて、予想払戻（金額×オッズ）をリアルタイム表示 */
function updatePayoutPreview() {
    const el = document.getElementById('payout-preview');
    const amount = Number(document.getElementById('bet-amount-input').value);
    if (!selectedOdds || !amount || amount <= 0) {
        el.innerHTML = '';
        return;
    }
    el.innerHTML = `予想払戻: <b>${Math.round(amount * selectedOdds).toLocaleString()}</b> マネー`;
}

async function placeBet() {
    if (!selectedSelection) {
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
        p_bet_type: selectedBetType,
        p_selection: selectedSelection,
        p_amount: amount
    });

    btn.disabled = false;

    if (error) {
        showNotice('送信エラー: ' + error.message, 'error');
        return;
    }
    if (!data.ok) {
        showNotice(data.error || '賭けに失敗しました。', 'warning');
        return;
    }

    showNotice(`賭けました！（オッズ ${Number(data.odds).toFixed(1)}倍）`, 'success');
    document.getElementById('bet-amount-input').value = '';
    updatePayoutPreview();
    await refreshBalance();
    await renderMyBets();
}

async function renderMyBets() {
    const { data: myBets } = await supabaseClient
        .from('poker_finals_bets')
        .select('*')
        .eq('event_id', currentEvent.id)
        .eq('discord_user_id', currentUserId)
        .order('created_at', { ascending: true });

    const list = myBets || [];
    const section = document.getElementById('my-bets-section');
    const container = document.getElementById('my-bets-list');

    if (list.length === 0) {
        section.style.display = 'none';
        return list;
    }
    section.style.display = '';

    const sep = t => t === 'trifecta' ? ' → ' : '・';

    container.innerHTML = list.map(b => {
        const settled = b.payout !== null;
        const won = settled && b.payout > 0;
        const rowCls = !settled ? '' : (won ? 'win-row' : 'lose-row');
        const payoutHtml = !settled
            ? `<span class="text-muted">払戻見込 ${Math.round(b.amount * b.odds).toLocaleString()}</span>`
            : won
                ? `<span style="color:#4ade80;">+${(b.payout - b.amount).toLocaleString()}</span>`
                : `<span style="color:#f87171;">-${Number(b.amount).toLocaleString()}</span>`;
        const selectionHtml = b.selection.map(t => teamIconInlineHtml(t) + escapeHtml(t)).join(sep(b.bet_type));
        return `<div class="my-bet-row ${rowCls}">
            <span><span class="bt-type">${BET_TYPE_LABELS[b.bet_type]}</span>${selectionHtml}</span>
            <span class="bt-amount">${Number(b.amount).toLocaleString()}マネー ・ ${Number(b.odds).toFixed(1)}倍</span>
            <span class="bt-payout">${payoutHtml}</span>
        </div>`;
    }).join('');

    return list;
}

// ===== 結果画面 =====
async function renderSettledState() {
    const order = currentEvent.result_order || [];
    document.getElementById('settled-1st').innerHTML = order[0] ? teamIconBlockHtml(order[0]) + escapeHtml(order[0]) : '-';
    document.getElementById('settled-2nd').innerHTML = order[1] ? teamIconBlockHtml(order[1]) + escapeHtml(order[1]) : '-';
    document.getElementById('settled-3rd').innerHTML = order[2] ? teamIconBlockHtml(order[2]) + escapeHtml(order[2]) : '-';

    const { data: myBets } = await supabaseClient
        .from('poker_finals_bets')
        .select('*')
        .eq('event_id', currentEvent.id)
        .eq('discord_user_id', currentUserId)
        .order('created_at', { ascending: true });

    const list = myBets || [];
    const outcomeArea = document.getElementById('settled-outcome-area');

    if (list.length === 0) {
        outcomeArea.innerHTML = `<p class="text-muted text-center mt-3">今回はこのイベントに参加していません。</p>`;
    } else {
        const totalStake = list.reduce((s, b) => s + b.amount, 0);
        const totalPayout = list.reduce((s, b) => s + (b.payout || 0), 0);
        const profit = totalPayout - totalStake;
        const cls = profit > 0 ? 'win' : profit < 0 ? 'lose' : 'none';
        const sep = t => t === 'trifecta' ? ' → ' : '・';

        const rows = list.map(b => {
            const won = b.payout > 0;
            const selectionHtml = b.selection.map(t => teamIconInlineHtml(t) + escapeHtml(t)).join(sep(b.bet_type));
            return `<div class="my-bet-row ${won ? 'win-row' : 'lose-row'}">
                <span><span class="bt-type">${BET_TYPE_LABELS[b.bet_type]}</span>${selectionHtml}</span>
                <span class="bt-amount">${Number(b.amount).toLocaleString()}マネー ・ ${Number(b.odds).toFixed(1)}倍</span>
                <span class="bt-payout" style="color:${won ? '#4ade80' : '#f87171'};">${won ? '+' + (b.payout - b.amount).toLocaleString() : '-' + Number(b.amount).toLocaleString()}</span>
            </div>`;
        }).join('');

        outcomeArea.innerHTML = `
            <div class="profit-summary ${cls}">
                <div class="text-muted">収支</div>
                <div class="profit">${profit >= 0 ? '+' : ''}${profit.toLocaleString()} マネー</div>
            </div>
            <div class="my-bets-list">${rows}</div>
        `;
    }

    document.getElementById('state-settled').style.display = '';
}

// ===== 管理者: 開催（オッズプレビュー付き） =====
function resetOpenEventModal() {
    document.getElementById('open-event-title-input').value = '';
    document.getElementById('open-event-error').style.display = 'none';
    document.getElementById('open-event-team-rows').innerHTML = '';
    openEventRowSeq = 0;
    addOpenEventTeamRow();
    addOpenEventTeamRow();
    addOpenEventTeamRow();

    const s = bettingSettings || { payout_rate: 0.8, min_odds: 1.1, max_odds: 999 };
    document.getElementById('open-event-settings-hint').textContent =
        `現在の設定: 払戻率 ${Math.round(s.payout_rate * 100)}% ／ 最低 ${s.min_odds}倍 ／ 最高 ${s.max_odds}倍`;

    switchPreviewTab('place');
}

function addOpenEventTeamRow() {
    openEventRowSeq++;
    const id = openEventRowSeq;
    const options = allTeams.map(t => `<option value="${escapeHtml(t.team_name)}">${escapeHtml(t.team_name)}</option>`).join('');
    document.getElementById('open-event-team-rows').insertAdjacentHTML('beforeend', `
        <div class="team-row" id="open-event-row-${id}">
            <select class="form-select team-select" onchange="recalcPreview()">
                <option value="">チームを選択</option>
                ${options}
            </select>
            <input type="number" class="form-control odds-input" placeholder="単勝オッズ" step="0.1" min="1.01" oninput="recalcPreview()">
            <button type="button" class="btn-remove-row" onclick="removeOpenEventTeamRow(${id})">×</button>
        </div>
    `);
    recalcPreview();
}

function removeOpenEventTeamRow(id) {
    const rows = document.querySelectorAll('#open-event-team-rows .team-row');
    if (rows.length <= 3) {
        showNotice('チームは最低3つ必要です。', 'warning');
        return;
    }
    document.getElementById(`open-event-row-${id}`)?.remove();
    recalcPreview();
}

/** 単複・三連複・三連単オッズを算出（管理者プレビュー専用。実際の確定オッズはサーバー側で再計算する） */
function computeOddsPreview(teams, payoutRate, minOdds, maxOdds) {
    const n = teams.length;
    if (n < 3) return { place: [], trio: [], trifecta: [] };

    const strength = teams.map(t => 1 / t.odds);
    const total = strength.reduce((a, b) => a + b, 0);

    function permProb(sA, sB, sC) {
        const d2 = total - sA, d3 = total - sA - sB;
        if (d2 <= 0 || d3 <= 0) return 0;
        return (sA / total) * (sB / d2) * (sC / d3);
    }
    function clampOdds(p) {
        if (!(p > 0)) return maxOdds;
        return Math.round(Math.min(Math.max(payoutRate / p, minOdds), maxOdds) * 10) / 10;
    }

    const trifecta = [];
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            if (j === i) continue;
            for (let k = 0; k < n; k++) {
                if (k === i || k === j) continue;
                trifecta.push({
                    teams: [teams[i].team_name, teams[j].team_name, teams[k].team_name],
                    odds: clampOdds(permProb(strength[i], strength[j], strength[k]))
                });
            }
        }
    }

    const trio = [];
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            for (let k = j + 1; k < n; k++) {
                const p = permProb(strength[i], strength[j], strength[k]) + permProb(strength[i], strength[k], strength[j])
                        + permProb(strength[j], strength[i], strength[k]) + permProb(strength[j], strength[k], strength[i])
                        + permProb(strength[k], strength[i], strength[j]) + permProb(strength[k], strength[j], strength[i]);
                trio.push({
                    teams: [teams[i].team_name, teams[j].team_name, teams[k].team_name].sort(),
                    odds: clampOdds(p)
                });
            }
        }
    }

    // 複勝: 各チームが3着以内に入る周辺確率 = P(1着)+P(2着)+P(3着)
    const place = [];
    for (let i = 0; i < n; i++) {
        let p = strength[i] / total; // P(1着)
        for (let j = 0; j < n; j++) { // P(2着): j=1着
            if (j === i) continue;
            const d2 = total - strength[j];
            if (d2 > 0) p += (strength[j] / total) * (strength[i] / d2);
        }
        for (let j = 0; j < n; j++) { // P(3着): j,k=1着,2着
            if (j === i) continue;
            for (let k = 0; k < n; k++) {
                if (k === i || k === j) continue;
                p += permProb(strength[j], strength[k], strength[i]);
            }
        }
        place.push({ teams: [teams[i].team_name], odds: clampOdds(p) });
    }

    return { place, trio, trifecta };
}

function recalcPreview() {
    const rows = document.querySelectorAll('#open-event-team-rows .team-row');
    const teams = [];
    const seen = new Set();
    rows.forEach(row => {
        const name = row.querySelector('.team-select').value;
        const odds = Number(row.querySelector('.odds-input').value);
        if (name && odds > 0 && !seen.has(name)) {
            seen.add(name);
            teams.push({ team_name: name, odds });
        }
    });
    const s = bettingSettings || { payout_rate: 0.8, min_odds: 1.1, max_odds: 999 };
    previewData = computeOddsPreview(teams, s.payout_rate, s.min_odds, s.max_odds);
    renderPreviewTable();
}

function switchPreviewTab(tab) {
    previewTab = tab;
    document.querySelectorAll('.preview-tab').forEach(b => b.classList.toggle('active', b.dataset.ptab === tab));
    renderPreviewTable();
}

function renderPreviewTable() {
    const body = document.getElementById('preview-table-body');
    const list = previewData[previewTab] || [];
    if (list.length === 0) {
        body.innerHTML = '<tr><td colspan="2" class="text-center text-muted py-3">チームと単勝オッズを3つ以上正しく入力してください</td></tr>';
        return;
    }
    const sep = previewTab === 'trifecta' ? ' → ' : previewTab === 'trio' ? '・' : '';
    const sorted = [...list].sort((a, b) => a.odds - b.odds);
    body.innerHTML = sorted.map(e => `<tr><td>${e.teams.map(escapeHtml).join(sep)}</td><td>${e.odds.toFixed(1)}倍</td></tr>`).join('');
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
            errorEl.textContent = `${teamName} の単勝オッズを正しく入力してください。`;
            errorEl.style.display = '';
            return;
        }
        seenNames.add(teamName);
        teams.push({ team_name: teamName, odds });
    }
    if (teams.length < 3) {
        errorEl.textContent = 'チームは3つ以上必要です。';
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

// ===== 管理者: 結果を入力（1位・2位・3位） =====
async function confirmSettleEvent() {
    const errorEl = document.getElementById('settle-error');
    errorEl.style.display = 'none';

    const s1 = document.getElementById('settle-select-1').value;
    const s2 = document.getElementById('settle-select-2').value;
    const s3 = document.getElementById('settle-select-3').value;

    if (!s1 || !s2 || !s3) {
        errorEl.textContent = '1位・2位・3位をすべて選択してください。';
        errorEl.style.display = '';
        return;
    }
    if (new Set([s1, s2, s3]).size !== 3) {
        errorEl.textContent = '同じチームが複数指定されています。';
        errorEl.style.display = '';
        return;
    }

    if (!confirm(`1位: ${s1} / 2位: ${s2} / 3位: ${s3} で結果を確定します。全プレイヤーへの払戻が行われます。よろしいですか？`)) return;

    const { data, error } = await supabaseClient.rpc('poker_bet_settle', {
        p_event_id: currentEvent.id,
        p_result_order: [s1, s2, s3]
    });

    if (error) {
        errorEl.textContent = '送信エラー: ' + error.message;
        errorEl.style.display = '';
        return;
    }
    if (!data.ok) {
        errorEl.textContent = data.error || '結果確定に失敗しました。';
        errorEl.style.display = '';
        return;
    }

    bootstrap.Modal.getInstance(document.getElementById('settleModal'))?.hide();
    showNotice(`結果を確定しました。${data.winners}件に払戻（合計${Number(data.total_payout).toLocaleString()}マネー）を行いました。`, 'success');
    await loadEventState();
}

// ===== 管理者: 設定（払戻率・オッズ上下限） =====
async function saveSettings() {
    const errorEl = document.getElementById('settings-error');
    errorEl.style.display = 'none';

    const rate = Number(document.getElementById('settings-payout-rate').value) / 100;
    const minOdds = Number(document.getElementById('settings-min-odds').value);
    const maxOdds = Number(document.getElementById('settings-max-odds').value);

    const { data, error } = await supabaseClient.rpc('poker_bet_update_settings', {
        p_payout_rate: rate,
        p_min_odds: minOdds,
        p_max_odds: maxOdds
    });

    if (error) {
        errorEl.textContent = '送信エラー: ' + error.message;
        errorEl.style.display = '';
        return;
    }
    if (!data.ok) {
        errorEl.textContent = data.error || '保存に失敗しました。';
        errorEl.style.display = '';
        return;
    }

    bettingSettings = { payout_rate: rate, min_odds: minOdds, max_odds: maxOdds };
    bootstrap.Modal.getInstance(document.getElementById('settingsModal'))?.hide();
    showNotice('設定を保存しました。', 'success');
}

// ===== 管理者: 中止（全額返金） =====
async function cancelEvent() {
    if (!currentEvent) return;
    if (!confirm('決勝卓予想を中止します。すでに賭けられているマネーは全額返金されます。よろしいですか？')) return;

    const { data, error } = await supabaseClient.rpc('poker_bet_cancel_event', {
        p_event_id: currentEvent.id
    });

    if (error) {
        showNotice('送信エラー: ' + error.message, 'error');
        return;
    }
    if (!data.ok) {
        showNotice(data.error || '中止に失敗しました。', 'warning');
        return;
    }

    showNotice(`中止しました。${data.refunded}件（合計${Number(data.total_refund).toLocaleString()}マネー）を返金しました。`, 'success');
    await loadEventState();
}

// ===== 管理者: 賭け状況一覧・結果シミュレーション =====
let overviewBetsCache = [];

async function openBetsOverview() {
    document.getElementById('bets-overview-summary').textContent = '読み込み中...';
    document.getElementById('bets-overview-body').innerHTML = '';
    document.getElementById('simulation-result').innerHTML = '';
    if (!currentEvent) return;

    const { data: bets } = await supabaseClient
        .from('poker_finals_bets')
        .select('*')
        .eq('event_id', currentEvent.id)
        .order('created_at', { ascending: true });

    overviewBetsCache = bets || [];

    const userIds = [...new Set(overviewBetsCache.map(b => b.discord_user_id))];
    let profileMap = {};
    if (userIds.length > 0) {
        const { data: profiles } = await supabaseClient
            .from('profiles').select('discord_user_id, account_name, avatar_url').in('discord_user_id', userIds);
        (profiles || []).forEach(p => { profileMap[p.discord_user_id] = p; });
    }

    renderBetsOverviewSummary();
    renderBetsOverviewTable(profileMap);

    const teams = currentEvent.teams || [];
    const optHtml = '<option value="">選択してください</option>' +
        teams.map(t => `<option value="${escapeHtml(t.team_name)}">${escapeHtml(t.team_name)}</option>`).join('');
    document.getElementById('sim-select-1').innerHTML = optHtml;
    document.getElementById('sim-select-2').innerHTML = optHtml;
    document.getElementById('sim-select-3').innerHTML = optHtml;

    if (currentEvent.status !== 'open' && currentEvent.result_order) {
        document.getElementById('sim-select-1').value = currentEvent.result_order[0] || '';
        document.getElementById('sim-select-2').value = currentEvent.result_order[1] || '';
        document.getElementById('sim-select-3').value = currentEvent.result_order[2] || '';
        runSimulation();
    }
}

function renderBetsOverviewSummary() {
    const total = overviewBetsCache.reduce((s, b) => s + b.amount, 0);
    document.getElementById('bets-overview-summary').innerHTML =
        `合計賭け金: <b>${total.toLocaleString()}</b> マネー （${overviewBetsCache.length}件）`;
}

function renderBetsOverviewTable(profileMap) {
    const sep = t => t === 'trifecta' ? ' → ' : '・';
    const body = document.getElementById('bets-overview-body');
    if (overviewBetsCache.length === 0) {
        body.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-3">まだ賭けがありません</td></tr>';
        return;
    }
    body.innerHTML = overviewBetsCache.map(b => {
        const p = profileMap[b.discord_user_id];
        const name = p?.account_name || b.discord_user_id;
        const avatarHtml = p?.avatar_url
            ? `<img src="${escapeHtml(p.avatar_url)}" style="width:22px;height:22px;border-radius:50%;object-fit:cover;margin-right:6px;vertical-align:middle;" alt="">`
            : '';
        const selectionHtml = b.selection.map(t => teamIconInlineHtml(t) + escapeHtml(t)).join(sep(b.bet_type));
        return `<tr>
            <td>${avatarHtml}${escapeHtml(name)}</td>
            <td>${BET_TYPE_LABELS[b.bet_type]}</td>
            <td>${selectionHtml}</td>
            <td>${Number(b.amount).toLocaleString()}</td>
            <td>${Number(b.odds).toFixed(1)}倍</td>
        </tr>`;
    }).join('');
}

/** 1〜3位を仮に指定した場合の的中件数・払戻総額を試算する（実際の確定処理は行わない） */
function runSimulation() {
    const s1 = document.getElementById('sim-select-1').value;
    const s2 = document.getElementById('sim-select-2').value;
    const s3 = document.getElementById('sim-select-3').value;
    const resultEl = document.getElementById('simulation-result');

    if (!s1 || !s2 || !s3) {
        resultEl.innerHTML = '';
        return;
    }
    if (new Set([s1, s2, s3]).size !== 3) {
        resultEl.innerHTML = `<span style="color:#f87171;">同じチームが複数指定されています</span>`;
        return;
    }

    const order = [s1, s2, s3];
    const sortedOrder = [...order].sort();
    let winners = 0;
    let totalPayout = 0;

    overviewBetsCache.forEach(b => {
        let won = false;
        if (b.bet_type === 'win') won = b.selection[0] === order[0];
        else if (b.bet_type === 'place') won = order.includes(b.selection[0]);
        else if (b.bet_type === 'trifecta') won = JSON.stringify(b.selection) === JSON.stringify(order);
        else won = JSON.stringify([...b.selection].sort()) === JSON.stringify(sortedOrder);

        if (won) {
            winners++;
            totalPayout += Math.round(b.amount * b.odds);
        }
    });

    const totalStake = overviewBetsCache.reduce((s, b) => s + b.amount, 0);
    const net = totalStake - totalPayout;

    resultEl.innerHTML = `この結果の場合: <b>${winners}件</b>的中 ／ 払戻合計 <b>${totalPayout.toLocaleString()}</b> マネー<br>` +
        `<span class="text-muted" style="font-size:0.85rem;">総賭け金 ${totalStake.toLocaleString()} に対する収支: ${net >= 0 ? '+' : ''}${net.toLocaleString()}</span>`;
}

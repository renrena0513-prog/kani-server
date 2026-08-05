// 決勝卓予想（優勝チーム予想ベッティング）ページ用ロジック
let isAdmin = false;
let allTeams = [];
let teamIconMap = {}; // team_name -> icon_url
let currentUserId = null;
let currentEvent = null;
let bettingSettings = null;

let selectedBetType = 'win';
let selectedSelection = null; // 配列。win/place=[team]、exacta/quinella=[team,team]、trio/trifecta=[team,team,team]
let selectedOdds = null;
let comboLists = { exacta: [], quinella: [], trio: [], trifecta: [] }; // 現在のイベントの全組み合わせ（オッズ検索用）
let comboPickValue = { exacta: ['', ''], quinella: ['', ''], trio: ['', '', ''], trifecta: ['', '', ''] }; // ピッカーの選択状態
const COMBO_SLOT_COUNT = { exacta: 2, quinella: 2, trio: 3, trifecta: 3 };
const COMBO_ORDERED_TYPES = ['trifecta', 'exacta']; // 着順（順序）に意味がある賭式
let myBetsCache = []; // 自分のベット一覧（合計ベット上限チェック用）

let openEventRowSeq = 0;
let previewData = { place: [], exacta: [], quinella: [], trio: [], trifecta: [] };
let previewTab = 'place';

const BET_TYPE_LABELS = { win: '単勝', place: '複勝', exacta: '二連単', quinella: '二連複', trio: '三連複', trifecta: '三連単' };
const BET_TYPE_DESCRIPTIONS = {
    win: '🥇 1位になるチームを当てます。的中すればオッズ通りの配当がもらえます。',
    place: '🎖️ 3位以内に入るチームを当てます。的中しやすい分、配当は控えめです。',
    exacta: '🎯 1位・2位を「着順通り」に当てます。二連複より高配当が狙えます。',
    quinella: '🎯 1〜2位に入る2チームを「順不同」で当てます。着順は関係ありません。',
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

/** 要素を表示し、フェードイン・アップのアニメーションを毎回再生させる */
function showCard(el) {
    if (!el) return;
    el.style.display = '';
    el.classList.remove('anim-fade-in');
    void el.offsetWidth; // reflow を強制してアニメーションを再トリガー
    el.classList.add('anim-fade-in');
}

/** チームアイコンHTML（カード/表彰台向け・40px・中央揃え） */
function teamIconBlockHtml(teamName) {
    const url = teamIconMap[teamName];
    return url
        ? `<img src="${escapeHtml(url)}" class="team-icon-img" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'team-icon-placeholder',textContent:'🏅'}))">`
        : `<span class="team-icon-placeholder">🏅</span>`;
}

/** カード背景に薄く敷くチームアイコンの背景画像スタイル（CSSカスタムプロパティ） */
function cardIconBgStyle(teamName) {
    const url = teamIconMap[teamName];
    return url ? `--icon-bg:url('${url}');` : '';
}

/** チームアイコンHTML（文中向け・20px・インライン） */
function teamIconInlineHtml(teamName) {
    const url = teamIconMap[teamName];
    return url
        ? `<img src="${escapeHtml(url)}" class="team-icon-inline" alt="" onerror="this.replaceWith(Object.assign(document.createElement('span'),{className:'team-icon-placeholder-inline',textContent:'🏅'}))">`
        : `<span class="team-icon-placeholder-inline">🏅</span>`;
}

/** {team_name/team_name, odds} を持つ配列をオッズ昇順（本命=強いチーム順）に並べ替え */
function sortedByOdds(list) {
    return [...(list || [])].sort((a, b) => a.odds - b.odds);
}

/** 現イベントのチーム名を単勝オッズ昇順で返す */
function sortedTeamNamesByWinOdds() {
    return sortedByOdds(currentEvent?.teams || []).map(t => t.team_name);
}

document.addEventListener('DOMContentLoaded', async () => {
    currentUserId = await getEffectiveUserId();
    await Promise.all([checkAdminStatus(), fetchTeams()]);
    if (isAdmin) await fetchSettings();
    await loadEventState();

    document.getElementById('openEventModal').addEventListener('show.bs.modal', resetOpenEventModal);

    document.getElementById('settleModal').addEventListener('show.bs.modal', () => {
        document.getElementById('settle-error').style.display = 'none';
        const teams = sortedByOdds(currentEvent?.teams || []);
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

    document.getElementById('editOddsModal').addEventListener('show.bs.modal', () => {
        document.getElementById('edit-odds-error').style.display = 'none';
        const teams = currentEvent?.teams || [];
        document.getElementById('edit-odds-team-rows').innerHTML = teams.map(t => `
            <div class="team-row" data-team-name="${escapeHtml(t.team_name)}">
                <span style="flex:1;display:flex;align-items:center;gap:6px;">${teamIconInlineHtml(t.team_name)}${escapeHtml(t.team_name)}</span>
                <input type="number" class="form-control odds-input" value="${t.odds}" step="0.1" min="1.01" oninput="recalcEditPreview()">
            </div>
        `).join('');
        switchEditPreviewTab('place');
    });
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
    document.getElementById('btn-close-event').style.display = 'none';
    document.getElementById('btn-settle-event').style.display = 'none';
    document.getElementById('btn-cancel-event').style.display = 'none';
    document.getElementById('btn-edit-odds').style.display = 'none';
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
        showCard(document.getElementById('state-none'));
        if (isAdmin) document.getElementById('btn-open-event').style.display = '';
        return;
    }

    if (isAdmin) document.getElementById('btn-bets-overview').style.display = '';

    if (currentEvent.status === 'open' || currentEvent.status === 'closed') {
        if (isAdmin) {
            document.getElementById('btn-close-event').style.display = currentEvent.status === 'open' ? '' : 'none';
            document.getElementById('btn-settle-event').style.display = '';
            document.getElementById('btn-cancel-event').style.display = '';
            document.getElementById('btn-edit-odds').style.display = currentEvent.status === 'open' ? '' : 'none';
        }
        await renderOpenState();
    } else if (currentEvent.status === 'cancelled') {
        if (isAdmin) document.getElementById('btn-open-event').style.display = '';
        showCard(document.getElementById('state-cancelled'));
    } else {
        if (isAdmin) document.getElementById('btn-open-event').style.display = '';
        await renderSettledState();
    }
}

// ===== 開催中（賭け受付）画面 =====
async function renderOpenState() {
    const teams = currentEvent.teams || [];
    const isClosed = currentEvent.status === 'closed';

    document.getElementById('open-event-title').textContent = `${isClosed ? '🔒' : '🎯'} ${currentEvent.title}`;
    document.getElementById('state-open').classList.toggle('betting-closed', isClosed);
    document.getElementById('betting-locked-banner').style.display = isClosed ? '' : 'none';
    document.getElementById('betting-action-area').style.display = isClosed ? 'none' : '';

    const rankLabels = ['1番人気', '2番人気', '3番人気'];
    const grid = document.getElementById('win-team-grid');
    grid.innerHTML = sortedByOdds(teams).map((t, i) => `
        <div class="team-bet-card${i < 3 ? ' rank-' + (i + 1) : ''}" style="--i:${i};${escapeHtml(cardIconBgStyle(t.team_name))}" data-team-name="${escapeHtml(t.team_name)}" onclick="selectWinTeam('${escapeHtml(t.team_name).replace(/'/g, "\\'")}')">
            ${i < 3 ? `<span class="rank-flag">${rankLabels[i]}</span>` : ''}
            ${teamIconBlockHtml(t.team_name)}
            <div class="t-name">${escapeHtml(t.team_name)}</div>
            <div class="t-odds-chip"><span class="val">${Number(t.odds).toFixed(1)}</span><span class="suffix">倍</span></div>
            <div class="t-odds-label">単勝オッズ</div>
        </div>
    `).join('');

    const placeGrid = document.getElementById('place-team-grid');
    placeGrid.innerHTML = sortedByOdds(currentEvent.place_odds || []).map((t, i) => `
        <div class="team-bet-card" style="--i:${i};${escapeHtml(cardIconBgStyle(t.team_name))}" data-team-name="${escapeHtml(t.team_name)}" onclick="selectPlaceTeam('${escapeHtml(t.team_name).replace(/'/g, "\\'")}')">
            ${teamIconBlockHtml(t.team_name)}
            <div class="t-name">${escapeHtml(t.team_name)}</div>
            <div class="t-odds-chip"><span class="val">${Number(t.odds).toFixed(1)}</span><span class="suffix">倍</span></div>
            <div class="t-odds-label">複勝オッズ</div>
        </div>
    `).join('');

    comboLists.exacta = [...(currentEvent.exacta_odds || [])].sort((a, b) => a.odds - b.odds);
    comboLists.quinella = [...(currentEvent.quinella_odds || [])].sort((a, b) => a.odds - b.odds);
    comboLists.trio = [...(currentEvent.trio_odds || [])].sort((a, b) => a.odds - b.odds);
    comboLists.trifecta = [...(currentEvent.trifecta_odds || [])].sort((a, b) => a.odds - b.odds);

    switchBetType('win');
    await refreshBalance();

    showCard(document.getElementById('state-open'));
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
    document.getElementById('exacta-bet-panel').style.display = type === 'exacta' ? '' : 'none';
    document.getElementById('quinella-bet-panel').style.display = type === 'quinella' ? '' : 'none';
    document.getElementById('trio-bet-panel').style.display = type === 'trio' ? '' : 'none';
    document.getElementById('trifecta-bet-panel').style.display = type === 'trifecta' ? '' : 'none';

    document.querySelectorAll('#win-team-grid .team-bet-card, #place-team-grid .team-bet-card').forEach(c => c.classList.remove('selected'));
    if (COMBO_SLOT_COUNT[type]) {
        comboPickValue[type] = new Array(COMBO_SLOT_COUNT[type]).fill('');
        document.getElementById(`${type}-picker-odds`).innerHTML = '';
        renderComboPickerSlots(type);
    }

    updateSelectedHint();
}

/** 二連単/二連複/三連複・三連単の着順（または組み合わせ）スロットをアイコン付きカスタムドロップダウンとして描画 */
function renderComboPickerSlots(type) {
    const slotCount = COMBO_SLOT_COUNT[type];
    const isOrdered = COMBO_ORDERED_TYPES.includes(type);
    const labels = slotCount === 2
        ? (isOrdered ? ['1着', '2着'] : ['チーム1', 'チーム2'])
        : (isOrdered ? ['1着', '2着', '3着'] : ['チーム1', 'チーム2', 'チーム3']);
    const container = document.getElementById(`${type}-pick-container`);
    container.innerHTML = Array.from({ length: slotCount }, (_, i) => i + 1).map(slot => `
        <div class="custom-dropdown-container combo-pick-wrap">
            <div class="combo-pick-display" onclick="toggleComboPickList('${type}', ${slot})">
                <span class="cp-slot-label">${labels[slot - 1]}</span>
                <span class="cp-slot-value" id="${type}-pick-value-${slot}">未選択</span>
                <span class="cp-caret">▼</span>
            </div>
            <div class="custom-dropdown-list" id="${type}-pick-list-${slot}"></div>
        </div>
    `).join('');
}

function toggleComboPickList(type, slot) {
    const list = document.getElementById(`${type}-pick-list-${slot}`);
    const wasOpen = list.classList.contains('open');
    document.querySelectorAll('.custom-dropdown-list.open').forEach(l => l.classList.remove('open'));
    if (wasOpen) return;

    renderComboPickListItems(type, slot);
    list.classList.add('open');

    setTimeout(() => {
        const h = (e) => {
            if (!list.contains(e.target) && !e.target.closest('.combo-pick-wrap')) {
                list.classList.remove('open');
                document.removeEventListener('mousedown', h);
            }
        };
        document.addEventListener('mousedown', h);
    }, 10);
}

function renderComboPickListItems(type, slot) {
    const list = document.getElementById(`${type}-pick-list-${slot}`);
    const teamNames = sortedTeamNamesByWinOdds();
    const slotCount = COMBO_SLOT_COUNT[type];
    const others = Array.from({ length: slotCount }, (_, i) => i + 1)
        .filter(s => s !== slot).map(s => comboPickValue[type][s - 1]).filter(Boolean);
    const available = teamNames.filter(t => !others.includes(t));

    let html = '';
    if (comboPickValue[type][slot - 1]) {
        html += `<div class="dropdown-item-flex" onclick="clearComboPickSlot('${type}', ${slot})"><span style="color:rgba(255,255,255,0.5);">選択解除</span></div>`;
    }
    html += available.map(t => `
        <div class="dropdown-item-flex" onclick="selectComboPickTeam('${type}', ${slot}, '${t.replace(/'/g, "\\'")}')">
            ${teamIconInlineHtml(t)}<span>${escapeHtml(t)}</span>
        </div>
    `).join('');
    list.innerHTML = html || '<div class="p-2 small text-muted">選択可能なチームがありません</div>';
}

function selectComboPickTeam(type, slot, teamName) {
    comboPickValue[type][slot - 1] = teamName;
    const display = document.getElementById(`${type}-pick-value-${slot}`).closest('.combo-pick-display');
    document.getElementById(`${type}-pick-value-${slot}`).innerHTML = teamIconInlineHtml(teamName) + escapeHtml(teamName);
    display.classList.add('filled');
    document.getElementById(`${type}-pick-list-${slot}`).classList.remove('open');
    updateComboPicker(type);
}

function clearComboPickSlot(type, slot) {
    comboPickValue[type][slot - 1] = '';
    const display = document.getElementById(`${type}-pick-value-${slot}`).closest('.combo-pick-display');
    document.getElementById(`${type}-pick-value-${slot}`).textContent = '未選択';
    display.classList.remove('filled');
    document.getElementById(`${type}-pick-list-${slot}`).classList.remove('open');
    updateComboPicker(type);
}

function updateComboPicker(type) {
    const picks = comboPickValue[type];
    const oddsEl = document.getElementById(`${type}-picker-odds`);

    if (picks.some(p => !p)) {
        oddsEl.innerHTML = '';
        selectedSelection = null;
        updateSelectedHint();
        return;
    }

    // 順不同の賭式は集合として比較する（JSの文字列ソート順とDB側の照合順序が日本語では一致しないため、
    // 配列を揃えてから文字列比較するとズレて「無効な組み合わせ」に誤判定されることがある）
    const isOrdered = COMBO_ORDERED_TYPES.includes(type);
    const entry = comboLists[type].find(e =>
        isOrdered
            ? JSON.stringify(e.teams) === JSON.stringify(picks)
            : e.teams.length === picks.length && picks.every(p => e.teams.includes(p))
    );

    if (!entry) {
        oddsEl.textContent = '無効な組み合わせです';
        selectedSelection = null;
        updateSelectedHint();
        return;
    }

    oddsEl.innerHTML = `🪙 オッズ: <b>${Number(entry.odds).toFixed(1)}倍</b>`;
    selectedBetType = type;
    selectedSelection = [...picks];
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
    const sep = COMBO_ORDERED_TYPES.includes(selectedBetType) ? ' → ' : '・';
    hint.innerHTML = `${BET_TYPE_LABELS[selectedBetType]}: <b>${selectedSelection.map(escapeHtml).join(sep)}</b>`;
    btn.disabled = false;
    updatePayoutPreview();
}

/** 入力欄は「1000単位の口数」を受け取る（例: 5 → 5,000マネー）。数字以外を除去し、末尾に薄く表示する「000」の位置を再計算する */
function handleAmountInput() {
    const input = document.getElementById('bet-amount-input');
    let v = input.value.replace(/[^0-9]/g, '');
    if (v.length > 1) v = v.replace(/^0+/, '') || '0';
    input.value = v;
    positionAmountSuffix();
    updatePayoutPreview();
}

/** 入力済みテキストの実測幅ぶんだけ「000」サフィックスを右へずらし、常に入力文字のすぐ後ろに表示する */
function positionAmountSuffix() {
    const input = document.getElementById('bet-amount-input');
    const suffix = document.getElementById('amount-suffix');
    if (!input || !suffix) return;
    if (!input.value) {
        suffix.style.left = '16px';
        return;
    }
    if (!positionAmountSuffix._canvas) {
        positionAmountSuffix._canvas = document.createElement('canvas');
    }
    const ctx = positionAmountSuffix._canvas.getContext('2d');
    const cs = getComputedStyle(input);
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const textWidth = ctx.measureText(input.value).width;
    const paddingLeft = parseFloat(cs.paddingLeft) || 16;
    suffix.style.left = `${paddingLeft + textWidth}px`;
}

/** 入力欄の値（口数）を実際の賭け金額（口数×1000）に変換する */
function getBetAmountFromInput() {
    const units = Number(document.getElementById('bet-amount-input').value);
    return units > 0 ? units * 1000 : 0;
}

/** 賭ける金額入力に応じて、予想払戻（金額×オッズ）をリアルタイム表示 */
function updatePayoutPreview() {
    const el = document.getElementById('payout-preview');
    const amount = getBetAmountFromInput();
    if (!selectedOdds || !amount) {
        el.innerHTML = '';
        return;
    }
    el.innerHTML = `賭け金: <b>${amount.toLocaleString()}</b> マネー / 予想払戻: <b>${Math.round(amount * selectedOdds).toLocaleString()}</b> マネー`;
}

/** 賭式+選択を正規化したグルーピングキー（三連複・二連複は順不同なので昇順に揃える） */
function selectionKey(betType, selection) {
    const sel = (betType === 'trio' || betType === 'quinella') ? [...selection].sort() : selection;
    return betType + '|' + JSON.stringify(sel);
}

/** 1〜3位の仮定 order に対して、この賭けが的中するかどうかを判定する（管理者・プレイヤー双方のシミュレーションで共用） */
function betWon(bet, order) {
    const sortedOrder = [...order].sort();
    const top2Sorted = [...order.slice(0, 2)].sort();
    if (bet.bet_type === 'win') return bet.selection[0] === order[0];
    if (bet.bet_type === 'place') return order.includes(bet.selection[0]);
    if (bet.bet_type === 'exacta') return JSON.stringify(bet.selection) === JSON.stringify(order.slice(0, 2));
    if (bet.bet_type === 'quinella') return JSON.stringify([...bet.selection].sort()) === JSON.stringify(top2Sorted);
    if (bet.bet_type === 'trifecta') return JSON.stringify(bet.selection) === JSON.stringify(order);
    return JSON.stringify([...bet.selection].sort()) === JSON.stringify(sortedOrder);
}

async function placeBet() {
    if (!selectedSelection) {
        showNotice('チームを選択してください。', 'warning');
        return;
    }
    const amount = getBetAmountFromInput();
    if (!amount) {
        showNotice('金額を入力してください。', 'warning');
        return;
    }

    const key = selectionKey(selectedBetType, selectedSelection);
    const existingSum = myBetsCache
        .filter(b => selectionKey(b.bet_type, b.selection) === key)
        .reduce((s, b) => s + b.amount, 0);
    if (existingSum + amount > 50000) {
        showNotice(`同じ賭け方への合計ベット額は50,000マネーまでです（現在の合計: ${existingSum.toLocaleString()}マネー）`, 'warning');
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
    positionAmountSuffix();
    updatePayoutPreview();
    await refreshBalance();
    await renderMyBets();
}

/** 同じ賭式・同じ選択の複数ベットを合算して1行にまとめる（表示専用。集計元データは変更しない） */
function mergeBetsBySelection(list) {
    const map = new Map();
    for (const b of list) {
        const key = selectionKey(b.bet_type, b.selection);
        if (!map.has(key)) {
            map.set(key, { ...b, amount: 0, payout: b.payout === null ? null : 0 });
        }
        const merged = map.get(key);
        merged.amount += b.amount;
        if (merged.payout !== null && b.payout !== null) merged.payout += b.payout;
    }
    return [...map.values()];
}

async function renderMyBets() {
    const { data: myBets } = await supabaseClient
        .from('poker_finals_bets')
        .select('*')
        .eq('event_id', currentEvent.id)
        .eq('discord_user_id', currentUserId)
        .order('created_at', { ascending: true });

    const list = myBets || [];
    myBetsCache = list;
    const section = document.getElementById('my-bets-section');
    const container = document.getElementById('my-bets-list');
    const totalEl = document.getElementById('my-bets-total');
    const simBox = document.getElementById('my-sim-box');

    if (list.length === 0) {
        section.style.display = 'none';
        return list;
    }
    section.style.display = '';

    const totalAmount = list.reduce((s, b) => s + b.amount, 0);
    totalEl.innerHTML = `合計賭け金額: <b>${totalAmount.toLocaleString()}</b> マネー`;

    simBox.style.display = '';
    const teams = sortedByOdds(currentEvent.teams || []);
    const optHtml = '<option value="">選択してください</option>' +
        teams.map(t => `<option value="${escapeHtml(t.team_name)}">${escapeHtml(t.team_name)}</option>`).join('');
    for (const n of [1, 2, 3]) {
        const sel = document.getElementById(`my-sim-select-${n}`);
        const prevValue = sel.value;
        sel.innerHTML = optHtml;
        if ([...sel.options].some(o => o.value === prevValue)) sel.value = prevValue;
    }
    runMySimulation();

    const sep = t => COMBO_ORDERED_TYPES.includes(t) ? ' → ' : '・';

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
        const cancelHtml = (!settled && currentEvent.status === 'open') ? `<button type="button" class="btn-cancel-bet" onclick="cancelMyBet('${b.id}')" title="この賭けを取り消す">✕</button>` : '';
        return `<div class="my-bet-row ${rowCls}">
            <span><span class="bt-type">${BET_TYPE_LABELS[b.bet_type]}</span>${selectionHtml}</span>
            <span class="bt-amount">${Number(b.amount).toLocaleString()}マネー ・ ${Number(b.odds).toFixed(1)}倍</span>
            <span class="bt-payout">${payoutHtml}</span>
            ${cancelHtml}
        </div>`;
    }).join('');

    return list;
}

/** 自分の賭けを取消し、全額返金する（開催中のイベントのみ） */
async function cancelMyBet(betId) {
    const bet = myBetsCache.find(b => b.id === betId);
    if (!bet) return;
    const selectionText = bet.selection.join('・');

    if (!confirm(`この賭け（${BET_TYPE_LABELS[bet.bet_type]} ${selectionText} / ${Number(bet.amount).toLocaleString()}マネー）を取り消して返金します。よろしいですか？`)) return;

    const { data, error } = await supabaseClient.rpc('poker_bet_cancel_own', {
        p_discord_user_id: currentUserId,
        p_bet_id: betId
    });

    if (error) {
        showNotice('送信エラー: ' + error.message, 'error');
        return;
    }
    if (!data.ok) {
        showNotice(data.error || '取消に失敗しました。', 'warning');
        return;
    }

    showNotice(`取り消しました。${Number(data.refund_amount).toLocaleString()} マネーを返金しました。`, 'success');
    await refreshBalance();
    await renderMyBets();
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
        const sep = t => COMBO_ORDERED_TYPES.includes(t) ? ' → ' : '・';

        const rows = mergeBetsBySelection(list).map(b => {
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

    showCard(document.getElementById('state-settled'));
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
    if (n < 3) return { place: [], exacta: [], quinella: [], trio: [], trifecta: [] };

    const strength = teams.map(t => 1 / t.odds);
    const total = strength.reduce((a, b) => a + b, 0);

    function permProb(sA, sB, sC) {
        const d2 = total - sA, d3 = total - sA - sB;
        if (d2 <= 0 || d3 <= 0) return 0;
        return (sA / total) * (sB / d2) * (sC / d3);
    }
    function pairProb(sA, sB) {
        const d2 = total - sA;
        if (d2 <= 0) return 0;
        return (sA / total) * (sB / d2);
    }
    function clampOdds(p) {
        if (!(p > 0)) return maxOdds;
        return Math.round(Math.min(Math.max(payoutRate / p, minOdds), maxOdds) * 10) / 10;
    }

    const exacta = [];
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            if (j === i) continue;
            exacta.push({
                teams: [teams[i].team_name, teams[j].team_name],
                odds: clampOdds(pairProb(strength[i], strength[j]))
            });
        }
    }

    const quinella = [];
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            const p = pairProb(strength[i], strength[j]) + pairProb(strength[j], strength[i]);
            quinella.push({
                teams: [teams[i].team_name, teams[j].team_name].sort(),
                odds: clampOdds(p)
            });
        }
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

    return { place, exacta, quinella, trio, trifecta };
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
    document.querySelectorAll('#openEventModal .preview-tab').forEach(b => b.classList.toggle('active', b.dataset.ptab === tab));
    renderPreviewTable();
}

function renderPreviewTable() {
    const body = document.getElementById('preview-table-body');
    const list = previewData[previewTab] || [];
    if (list.length === 0) {
        body.innerHTML = '<tr><td colspan="2" class="text-center text-muted py-3">チームと単勝オッズを3つ以上正しく入力してください</td></tr>';
        return;
    }
    const sep = COMBO_ORDERED_TYPES.includes(previewTab) ? ' → ' : (previewTab === 'trio' || previewTab === 'quinella') ? '・' : '';
    const sorted = [...list].sort((a, b) => a.odds - b.odds);
    body.innerHTML = sorted.map(e => `<tr><td>${e.teams.map(escapeHtml).join(sep)}</td><td>${e.odds.toFixed(1)}倍</td></tr>`).join('');
}

// ===== 管理者: オッズ編集（開催中のみ・チーム追加削除不可） =====
let editPreviewData = { place: [], exacta: [], quinella: [], trio: [], trifecta: [] };
let editPreviewTab = 'place';

function switchEditPreviewTab(tab) {
    editPreviewTab = tab;
    document.querySelectorAll('#editOddsModal .preview-tab').forEach(b => b.classList.toggle('active', b.dataset.eptab === tab));
    recalcEditPreview();
}

function recalcEditPreview() {
    const rows = document.querySelectorAll('#edit-odds-team-rows .team-row');
    const teams = [];
    rows.forEach(row => {
        const name = row.dataset.teamName;
        const odds = Number(row.querySelector('.odds-input').value);
        if (name && odds > 0) teams.push({ team_name: name, odds });
    });
    const s = {
        payout_rate: Number(currentEvent.payout_rate),
        min_odds: Number(currentEvent.min_odds),
        max_odds: Number(currentEvent.max_odds)
    };
    editPreviewData = computeOddsPreview(teams, s.payout_rate, s.min_odds, s.max_odds);
    renderEditPreviewTable();
}

function renderEditPreviewTable() {
    const body = document.getElementById('edit-preview-table-body');
    const list = editPreviewData[editPreviewTab] || [];
    if (list.length === 0) {
        body.innerHTML = '<tr><td colspan="2" class="text-center text-muted py-3">オッズを正しく入力してください</td></tr>';
        return;
    }
    const sep = COMBO_ORDERED_TYPES.includes(editPreviewTab) ? ' → ' : (editPreviewTab === 'trio' || editPreviewTab === 'quinella') ? '・' : '';
    const sorted = [...list].sort((a, b) => a.odds - b.odds);
    body.innerHTML = sorted.map(e => `<tr><td>${e.teams.map(escapeHtml).join(sep)}</td><td>${e.odds.toFixed(1)}倍</td></tr>`).join('');
}

async function confirmEditOdds() {
    const errorEl = document.getElementById('edit-odds-error');
    errorEl.style.display = 'none';

    const rows = document.querySelectorAll('#edit-odds-team-rows .team-row');
    const teams = [];
    for (const row of rows) {
        const name = row.dataset.teamName;
        const odds = Number(row.querySelector('.odds-input').value);
        if (!odds || odds <= 0) {
            errorEl.textContent = `${name} のオッズを正しく入力してください。`;
            errorEl.style.display = '';
            return;
        }
        teams.push({ team_name: name, odds });
    }

    const { data, error } = await supabaseClient.rpc('poker_bet_edit_odds', {
        p_event_id: currentEvent.id,
        p_teams: teams
    });

    if (error) {
        errorEl.textContent = '送信エラー: ' + error.message;
        errorEl.style.display = '';
        return;
    }
    if (!data.ok) {
        errorEl.textContent = data.error || '編集に失敗しました。';
        errorEl.style.display = '';
        return;
    }

    bootstrap.Modal.getInstance(document.getElementById('editOddsModal'))?.hide();
    showNotice('オッズを更新しました。', 'success');
    await loadEventState();
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

// ===== 管理者: 締め切り（新規ベットのみ停止、返金なし） =====
async function closeEvent() {
    if (!currentEvent) return;
    if (!confirm('決勝卓予想を締め切ります。これ以降、新しい賭けはできなくなります。よろしいですか？')) return;

    const { data, error } = await supabaseClient.rpc('poker_bet_close_event', {
        p_event_id: currentEvent.id
    });

    if (error) {
        showNotice('送信エラー: ' + error.message, 'error');
        return;
    }
    if (!data.ok) {
        showNotice(data.error || '締め切りに失敗しました。', 'warning');
        return;
    }

    showNotice('締め切りました。以降は新しい賭けを受け付けません。', 'success');
    await loadEventState();
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

let overviewProfileMap = {};
let overviewPage = 1;
const OVERVIEW_PAGE_SIZE = 20;

async function openBetsOverview() {
    document.getElementById('bets-overview-summary').textContent = '読み込み中...';
    document.getElementById('bets-overview-body').innerHTML = '';
    document.getElementById('simulation-result').innerHTML = '';
    document.getElementById('simulation-player-breakdown').innerHTML = '';
    overviewPage = 1;
    if (!currentEvent) return;

    const { data: bets } = await supabaseClient
        .from('poker_finals_bets')
        .select('*')
        .eq('event_id', currentEvent.id)
        .order('created_at', { ascending: true });

    overviewBetsCache = bets || [];

    const userIds = [...new Set(overviewBetsCache.map(b => b.discord_user_id))];
    overviewProfileMap = {};
    if (userIds.length > 0) {
        const { data: profiles, error: profilesError } = await supabaseClient
            .rpc('poker_bet_admin_profiles', { p_discord_user_ids: userIds });
        if (profilesError) console.error('プロフィール取得エラー:', profilesError);
        (profiles || []).forEach(p => { overviewProfileMap[p.discord_user_id] = p; });
    }

    renderBetsOverviewSummary();
    renderBetsOverviewTable();

    const teams = sortedByOdds(currentEvent.teams || []);
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

function renderBetsOverviewTable() {
    const sep = t => COMBO_ORDERED_TYPES.includes(t) ? ' → ' : '・';
    const body = document.getElementById('bets-overview-body');
    const canCancel = currentEvent?.status === 'open';
    const headRow = document.querySelector('#bets-overview-table thead tr');
    if (headRow) {
        const existingOpCol = headRow.querySelector('.overview-op-col');
        if (canCancel && !existingOpCol) {
            headRow.insertAdjacentHTML('beforeend', '<th class="overview-op-col">操作</th>');
        } else if (!canCancel && existingOpCol) {
            existingOpCol.remove();
        }
    }

    const totalCount = overviewBetsCache.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / OVERVIEW_PAGE_SIZE));
    overviewPage = Math.min(Math.max(overviewPage, 1), totalPages);

    if (totalCount === 0) {
        body.innerHTML = `<tr><td colspan="${canCancel ? 6 : 5}" class="text-center text-muted py-3">まだ賭けがありません</td></tr>`;
        renderOverviewPagination(0, totalPages);
        return;
    }

    const startIdx = (overviewPage - 1) * OVERVIEW_PAGE_SIZE;
    const pageItems = overviewBetsCache.slice(startIdx, startIdx + OVERVIEW_PAGE_SIZE);

    body.innerHTML = pageItems.map(b => {
        const p = overviewProfileMap[b.discord_user_id];
        const name = p?.account_name || b.discord_user_id;
        const avatarHtml = p?.avatar_url
            ? `<img src="${escapeHtml(p.avatar_url)}" style="width:22px;height:22px;border-radius:50%;object-fit:cover;margin-right:6px;vertical-align:middle;" alt="">`
            : '';
        const selectionHtml = b.selection.map(t => teamIconInlineHtml(t) + escapeHtml(t)).join(sep(b.bet_type));
        const opCell = canCancel
            ? `<td><button type="button" class="btn btn-sm btn-danger-outline" style="padding:4px 12px;font-size:0.78rem;" onclick="cancelSingleBet('${b.id}')">取消</button></td>`
            : '';
        return `<tr>
            <td>${avatarHtml}${escapeHtml(name)}</td>
            <td>${BET_TYPE_LABELS[b.bet_type]}</td>
            <td>${selectionHtml}</td>
            <td>${Number(b.amount).toLocaleString()}</td>
            <td>${Number(b.odds).toFixed(1)}倍</td>
            ${opCell}
        </tr>`;
    }).join('');

    renderOverviewPagination(totalCount, totalPages);
}

/** 賭け状況テーブルのページネーション表示を更新する */
function renderOverviewPagination(totalCount, totalPages) {
    const el = document.getElementById('bets-overview-pagination');
    if (!el) return;
    if (totalCount === 0 || totalPages <= 1) {
        el.innerHTML = '';
        return;
    }
    const startIdx = (overviewPage - 1) * OVERVIEW_PAGE_SIZE + 1;
    const endIdx = Math.min(overviewPage * OVERVIEW_PAGE_SIZE, totalCount);
    el.innerHTML = `
        <button type="button" class="btn-page-nav" onclick="changeOverviewPage(-1)" ${overviewPage <= 1 ? 'disabled' : ''}>‹ 前へ</button>
        <span class="page-indicator">${startIdx}-${endIdx} / ${totalCount}件（${overviewPage} / ${totalPages}ページ）</span>
        <button type="button" class="btn-page-nav" onclick="changeOverviewPage(1)" ${overviewPage >= totalPages ? 'disabled' : ''}>次へ ›</button>
    `;
}

/** 賭け状況テーブルのページを移動する */
function changeOverviewPage(delta) {
    overviewPage += delta;
    renderBetsOverviewTable();
}

/** 個別の賭けを取消し、賭けた本人へ全額返金する（開催中のイベントのみ） */
async function cancelSingleBet(betId) {
    const bet = overviewBetsCache.find(b => b.id === betId);
    if (!bet) return;
    const p = overviewProfileMap[bet.discord_user_id];
    const name = p?.account_name || bet.discord_user_id;

    if (!confirm(`${name} の賭け（${BET_TYPE_LABELS[bet.bet_type]} ${bet.selection.join('・')} / ${Number(bet.amount).toLocaleString()}マネー）を取り消して返金します。よろしいですか？`)) return;

    const { data, error } = await supabaseClient.rpc('poker_bet_cancel_single', { p_bet_id: betId });

    if (error) {
        showNotice('送信エラー: ' + error.message, 'error');
        return;
    }
    if (!data.ok) {
        showNotice(data.error || '取消に失敗しました。', 'warning');
        return;
    }

    showNotice(`取り消しました。${name} へ ${Number(data.refund_amount).toLocaleString()} マネーを返金しました。`, 'success');
    await openBetsOverview();
    await refreshBalance();
    await renderMyBets();
}

/** 1〜3位を仮に指定した場合の的中件数・払戻総額を試算する（実際の確定処理は行わない） */
function runSimulation() {
    const s1 = document.getElementById('sim-select-1').value;
    const s2 = document.getElementById('sim-select-2').value;
    const s3 = document.getElementById('sim-select-3').value;
    const resultEl = document.getElementById('simulation-result');
    const breakdownEl = document.getElementById('simulation-player-breakdown');

    if (!s1 || !s2 || !s3) {
        resultEl.innerHTML = '';
        breakdownEl.innerHTML = '';
        return;
    }
    if (new Set([s1, s2, s3]).size !== 3) {
        resultEl.innerHTML = `<span style="color:#f87171;">同じチームが複数指定されています</span>`;
        breakdownEl.innerHTML = '';
        return;
    }

    const order = [s1, s2, s3];
    let winners = 0;
    let totalPayout = 0;
    const playerStats = new Map(); // discord_user_id -> { stake, payout }

    overviewBetsCache.forEach(b => {
        if (!playerStats.has(b.discord_user_id)) playerStats.set(b.discord_user_id, { stake: 0, payout: 0 });
        const stat = playerStats.get(b.discord_user_id);
        stat.stake += b.amount;
        if (betWon(b, order)) {
            winners++;
            const payout = Math.round(b.amount * b.odds);
            totalPayout += payout;
            stat.payout += payout;
        }
    });

    const totalStake = overviewBetsCache.reduce((s, b) => s + b.amount, 0);
    const net = totalStake - totalPayout;

    resultEl.innerHTML = `この結果の場合: <b>${winners}件</b>的中 ／ 払戻合計 <b>${totalPayout.toLocaleString()}</b> マネー<br>` +
        `<span class="text-muted" style="font-size:0.85rem;">総賭け金 ${totalStake.toLocaleString()} に対する収支: ${net >= 0 ? '+' : ''}${net.toLocaleString()}</span>`;

    renderSimulationPlayerBreakdown(playerStats);
}

/** プレイヤーごとの収支内訳を一覧表示する（収支の大きい順） */
function renderSimulationPlayerBreakdown(playerStats) {
    const container = document.getElementById('simulation-player-breakdown');
    if (!container) return;

    const rows = [...playerStats.entries()]
        .map(([userId, stat]) => ({ userId, ...stat, net: stat.payout - stat.stake }))
        .sort((a, b) => b.net - a.net);

    if (rows.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <div class="sim-player-breakdown-title">👤 プレイヤー別収支（${rows.length}人）</div>
        <div class="sim-player-breakdown-list">
            ${rows.map(r => {
                const p = overviewProfileMap[r.userId];
                const name = p?.account_name || r.userId;
                const avatarHtml = p?.avatar_url
                    ? `<img src="${escapeHtml(p.avatar_url)}" class="sim-player-avatar" alt="">`
                    : '';
                const cls = r.net > 0 ? 'win' : r.net < 0 ? 'lose' : 'even';
                return `<div class="sim-player-row ${cls}">
                    <span class="sim-player-name">${avatarHtml}${escapeHtml(name)}</span>
                    <span class="sim-player-net">${r.net >= 0 ? '+' : ''}${r.net.toLocaleString()}</span>
                </div>`;
            }).join('')}
        </div>
    `;
}

/** 1〜3位を仮に指定した場合、自分の賭けがどれだけ的中し、いくら収支になるかを試算する */
function runMySimulation() {
    const resultEl = document.getElementById('my-simulation-result');
    if (!resultEl) return;
    const s1 = document.getElementById('my-sim-select-1').value;
    const s2 = document.getElementById('my-sim-select-2').value;
    const s3 = document.getElementById('my-sim-select-3').value;

    if (!s1 || !s2 || !s3) {
        resultEl.innerHTML = '';
        return;
    }
    if (new Set([s1, s2, s3]).size !== 3) {
        resultEl.innerHTML = `<span style="color:#f87171;">同じチームが複数指定されています</span>`;
        return;
    }

    const order = [s1, s2, s3];
    let winners = 0;
    let totalPayout = 0;

    myBetsCache.forEach(b => {
        if (betWon(b, order)) {
            winners++;
            totalPayout += Math.round(b.amount * b.odds);
        }
    });

    const totalStake = myBetsCache.reduce((s, b) => s + b.amount, 0);
    const net = totalPayout - totalStake;

    resultEl.innerHTML = `この結果の場合: <b>${winners}件</b>的中 ／ 払戻合計 <b>${totalPayout.toLocaleString()}</b> マネー<br>` +
        `<span class="text-muted" style="font-size:0.85rem;">収支: <span style="color:${net >= 0 ? '#4ade80' : '#f87171'};">${net >= 0 ? '+' : ''}${net.toLocaleString()}</span></span>`;
}

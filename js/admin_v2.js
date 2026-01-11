console.log('admin_v2.js loaded - version 2026.01.11.04');
// 管理画面用ロジック（大会記録管理版）
let recordModal;

document.addEventListener('DOMContentLoaded', () => {
    // モーダルの初期化
    const modalElement = document.getElementById('recordModal');
    if (modalElement) {
        recordModal = new bootstrap.Modal(modalElement);
    }

    const badgeModalElement = document.getElementById('badgeModal');
    if (badgeModalElement) {
        window.badgeModal = new bootstrap.Modal(badgeModalElement);
    }

    const coinModalElement = document.getElementById('coinModal');
    if (coinModalElement) {
        window.coinModal = new bootstrap.Modal(coinModalElement);
    }

    // 画像プレビューの連動
    const badgeImageFile = document.getElementById('badge-image-file');
    if (badgeImageFile) {
        badgeImageFile.addEventListener('change', function (e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function (e) {
                    const preview = document.getElementById('badge-image-preview');
                    preview.querySelector('img').src = e.target.result;
                    preview.style.display = 'block';
                }
                reader.readAsDataURL(file);
            }
        });
    }

    // 記録一覧の取得
    fetchRecords();

    // 編集モーダルの入力変更イベントリスナー
    const modalInputs = ['mahjong_mode', 'dist_points', 'opt_tobi', 'opt_yakitori'];
    modalInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', calculateFinalScores);
    });

    document.querySelectorAll('.player-edit-card').forEach(card => {
        const inputs = ['.player-raw-points', '.player-win-count', '.player-rank'];
        inputs.forEach(sel => {
            const el = card.querySelector(sel);
            if (el) el.addEventListener('input', calculateFinalScores);
        });
    });
});

// ローディング表示の切り替え
function toggleLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.visibility = show ? 'visible' : 'hidden';
    }
}

let allRecords = []; // 取得した全データ
let filteredRecords = []; // フィルター適用後のデータ
let sortConfig = { key: 'event_datetime', direction: 'desc' };

// 現在のフィルター選択状態
let filterState = {
    accounts: [],
    tournaments: [],
    teams: [],
    modes: [],
    match_modes: []
};

// 新規記録用のモーダル
function openRecordModal() {
    document.getElementById('recordModalLabel').textContent = '大会記録 追加 (一括)';
    document.getElementById('record-form').reset();
    document.getElementById('match-id').value = '';

    // 日時を現在時刻に設定
    const now = new Date();
    // JST調整 (簡易版)
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('event_datetime').value = now.toISOString().slice(0, 16);

    // プレイヤー別項目をすべて表示（新規追加時は4人分用意）
    const cards = document.querySelectorAll('.player-edit-card');
    cards.forEach(card => {
        card.style.display = 'block';
        card.querySelector('.player-record-id').value = '';
        card.querySelector('.player-account-name').value = '';
        card.querySelector('.player-final-score').value = '';
        card.querySelector('.player-rank').value = '';
        card.querySelector('.player-win-count').value = '0';
        card.querySelector('.player-deal-in-count').value = '0';
        card.querySelector('.player-discord-id').value = '';
    });

    recordModal.show();
}

// 記録一覧の取得
async function fetchRecords() {
    try {
        const { data: records, error } = await supabaseClient
            .from('match_results')
            .select('*');

        if (error) throw error;

        allRecords = records;
        updateFilterOptions();
        applyFiltersAndSort();
    } catch (err) {
        console.error('記録取得エラー:', err.message);
        const listBody = document.getElementById('records-list-body');
        if (listBody) {
            listBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">エラー: ${err.message}</td></tr>`;
        }
    }
}

// フィルターパネルの開閉
function toggleFilterPanel() {
    const panel = document.getElementById('filter-panel');
    if (panel) {
        const isVisible = panel.style.display === 'block';
        panel.style.display = isVisible ? 'none' : 'block';
    }
}

// フィルター選択肢の動的生成
function updateFilterOptions() {
    const accountSet = new Set();
    const tournamentSet = new Set();
    const teamSet = new Set();
    const modeSet = new Set();
    const matchModeSet = new Set();

    allRecords.forEach(r => {
        if (r.account_name) accountSet.add(r.account_name);
        if (r.tournament_type) tournamentSet.add(r.tournament_type);
        if (r.team_name) teamSet.add(r.team_name);
        if (r.mahjong_mode) modeSet.add(r.mahjong_mode);
        if (r.match_mode) matchModeSet.add(r.match_mode);
    });

    renderCheckboxes('filter-accounts', Array.from(accountSet), 'accounts');
    renderCheckboxes('filter-tournaments', Array.from(tournamentSet), 'tournaments');
    renderCheckboxes('filter-teams', Array.from(teamSet), 'teams');
    renderCheckboxes('filter-modes', Array.from(modeSet), 'modes');
    renderCheckboxes('filter-match-modes', Array.from(matchModeSet), 'match_modes');
}

function renderCheckboxes(containerId, options, category) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (options.length === 0) {
        container.innerHTML = '<span class="text-muted small">データなし</span>';
        return;
    }

    container.innerHTML = options.sort().map(opt => `
        <div class="form-check p-0">
            <input type="checkbox" id="chk-${category}-${opt}" class="btn-check" 
                   value="${opt}" onchange="handleFilterChange('${category}', this)">
            <label class="filter-checkbox-label" for="chk-${category}-${opt}">${opt}</label>
        </div>
    `).join('');
}

// フィルター変更時の処理
function handleFilterChange(category, checkbox) {
    const val = checkbox.value;
    if (checkbox.checked) {
        filterState[category].push(val);
    } else {
        filterState[category] = filterState[category].filter(v => v !== val);
    }
    applyFiltersAndSort();
}

// フィルターのリセット
function clearFilters() {
    filterState = { accounts: [], tournaments: [], teams: [], modes: [], match_modes: [] };
    document.querySelectorAll('#filter-panel input[type="checkbox"]').forEach(chk => chk.checked = false);
    applyFiltersAndSort();
}

// ソート関数
function sortRecords(key) {
    if (sortConfig.key === key) {
        sortConfig.direction = (sortConfig.direction === 'asc' ? 'desc' : 'asc');
    } else {
        sortConfig.key = key;
        sortConfig.direction = 'desc';
    }

    document.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('asc', 'desc');
    });
    const th = document.getElementById(`th-${key}`);
    if (th) th.classList.add(sortConfig.direction);

    applyFiltersAndSort();
}

// フィルターとソートを統合して適用
function applyFiltersAndSort() {
    filteredRecords = allRecords.filter(record => {
        const matchAccount = filterState.accounts.length === 0 || filterState.accounts.includes(record.account_name);
        const matchTournament = filterState.tournaments.length === 0 || filterState.tournaments.includes(record.tournament_type);
        const matchTeam = filterState.teams.length === 0 || filterState.teams.includes(record.team_name);
        const matchMode = filterState.modes.length === 0 || filterState.modes.includes(record.mahjong_mode);
        const matchMethod = filterState.match_modes.length === 0 || filterState.match_modes.includes(record.match_mode);
        return matchAccount && matchTournament && matchTeam && matchMode && matchMethod;
    });

    const { key, direction } = sortConfig;
    filteredRecords.sort((a, b) => {
        let valA = a[key];
        let valB = b[key];
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;
        if (typeof valA === 'string') {
            valA = valA.toLowerCase();
            valB = valB.toLowerCase();
        }
        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
    });

    displayRecords(filteredRecords);
}

// 記録の表示
function displayRecords(records) {
    const listBody = document.getElementById('records-list-body');
    if (!listBody) return;

    listBody.innerHTML = '';
    if (!records || records.length === 0) {
        listBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">登録されている記録はありません</td></tr>';
        return;
    }

    // match_id でグループ化
    const matches = {};
    records.forEach(r => {
        const mid = r.match_id || `no-id-${r.id}`;
        if (!matches[mid]) matches[mid] = [];
        matches[mid].push(r);
    });

    // 試合単位で表示
    Object.keys(matches).forEach(mid => {
        const matchRecords = matches[mid];
        matchRecords.sort((a, b) => (a.rank || 99) - (b.rank || 99));

        const first = matchRecords[0];
        const tr = document.createElement('tr');
        const dateStr = new Date(first.event_datetime).toLocaleString('ja-JP', {
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
        });

        const accountsHtml = matchRecords.map(r => `
            <div class="mb-1">
                <span class="badge bg-light text-dark" style="min-width: 80px;">${r.account_name}</span>
            </div>
        `).join('');

        const scoresHtml = matchRecords.map(r => {
            const color = (r.final_score > 0) ? 'text-success' : (r.final_score < 0 ? 'text-danger' : '');
            return `<div class="fw-bold ${color} mb-1">${r.final_score !== null ? (r.final_score > 0 ? '+' : '') + r.final_score.toFixed(1) : '-'}</div>`;
        }).join('');

        const ranksHtml = matchRecords.map(r => `
            <div class="mb-1">${r.rank ? `<span class="badge bg-primary">${r.rank}位</span>` : '-'}</div>
        `).join('');

        tr.innerHTML = `
            <td>${dateStr}</td>
            <td>${accountsHtml}</td>
            <td>
                <div class="small fw-bold">${first.tournament_type || '-'}</div>
                <div class="small text-muted">${first.mahjong_mode || ''} / ${first.match_mode || ''}</div>
            </td>
            <td>${scoresHtml}</td>
            <td>${ranksHtml}</td>
            <td>${first.hand_count || 1}局</td>
            <td>
                <div class="d-flex flex-column gap-1">
                    <button onclick='editMatch("${mid}")' class="btn btn-sm btn-outline-primary">編集</button>
                    <button onclick='deleteMatch("${mid}")' class="btn btn-sm btn-outline-danger">削除</button>
                </div>
            </td>
        `;
        listBody.appendChild(tr);
    });
}

// 試合の削除
async function deleteMatch(matchId) {
    if (!confirm('この試合の全記録を削除してもよろしいですか？')) return;
    toggleLoading(true);
    try {
        const { error } = await supabaseClient.from('match_results').delete().eq('match_id', matchId);
        if (error) throw error;
        fetchRecords();
    } catch (err) {
        alert('削除エラー: ' + err.message);
    } finally {
        toggleLoading(false);
    }
}

// 編集用データの取得
async function editMatch(matchId) {
    toggleLoading(true);
    try {
        const { data: records, error } = await supabaseClient
            .from('match_results')
            .select('*')
            .eq('match_id', matchId);

        if (error) throw error;

        document.getElementById('recordModalLabel').textContent = '大会記録 編集';
        document.getElementById('match-id').value = matchId;

        const first = records[0];
        document.getElementById('event_datetime').value = new Date(first.event_datetime).toISOString().slice(0, 16);
        document.getElementById('tournament_type').value = first.tournament_type || '';
        document.getElementById('mahjong_mode').value = first.mahjong_mode || '四麻';
        document.getElementById('match_mode').value = first.match_mode || '東風戦';
        document.getElementById('dist_points').value = first.dist_points || 25000;
        document.getElementById('opt_tobi').checked = !!first.opt_tobi;
        document.getElementById('opt_yakitori').checked = !!first.opt_yakitori;

        const cards = document.querySelectorAll('.player-edit-card');
        cards.forEach(card => card.style.display = 'none');

        records.forEach((r, idx) => {
            if (idx < cards.length) {
                const card = cards[idx];
                card.style.display = 'block';
                card.querySelector('.player-record-id').value = r.id;
                card.querySelector('.player-account-name').value = r.account_name || '';
                card.querySelector('.player-team-name').value = r.team_name || '';
                card.querySelector('.player-raw-points').value = r.raw_points || 0;
                card.querySelector('.player-final-score').value = r.final_score || 0;
                card.querySelector('.player-rank').value = r.rank || '';
                card.querySelector('.player-win-count').value = r.win_count || 0;
                card.querySelector('.player-deal-in-count').value = r.deal_in_count || 0;
                card.querySelector('.player-discord-id').value = r.discord_user_id || '';
            }
        });

        recordModal.show();
    } catch (err) {
        alert('データ取得エラー: ' + err.message);
    } finally {
        toggleLoading(false);
    }
}

function calculateFinalScores() {
    const mahjongMode = document.getElementById('mahjong_mode').value;
    const distPoints = parseInt(document.getElementById('dist_points').value) || 25000;
    const cards = Array.from(document.querySelectorAll('.player-edit-card')).filter(c => c.style.display !== 'none');

    const players = cards.map(card => ({
        rawPoints: parseInt(card.querySelector('.player-raw-points').value) || 0,
        rankInput: card.querySelector('.player-rank'),
        scoreEl: card.querySelector('.player-final-score')
    }));

    const sorted = players.slice().sort((a, b) => b.rawPoints - a.rawPoints);
    players.forEach(p => {
        p.tempRank = sorted.indexOf(p) + 1;
        p.rankInput.value = p.tempRank;
    });

    let uma = [20, 10, -10, -20];
    if (mahjongMode === '三麻') uma = [20, 0, -20];
    else if (distPoints >= 30000) uma = [30, 10, -10, -30];

    players.forEach(p => {
        const u = uma[p.tempRank - 1] || 0;
        let final = (p.rawPoints - distPoints) / 1000 + u;
        p.scoreEl.value = final.toFixed(1);
    });
}

async function saveRecord() {
    const matchId = document.getElementById('match-id').value || crypto.randomUUID();
    const eventDatetime = document.getElementById('event_datetime').value;
    const tournamentType = document.getElementById('tournament_type').value;
    const mahjongMode = document.getElementById('mahjong_mode').value;
    const matchMode = document.getElementById('match_mode').value;
    const distPoints = parseInt(document.getElementById('dist_points').value);
    const optTobi = document.getElementById('opt_tobi').checked;
    const optYakitori = document.getElementById('opt_yakitori').checked;

    const cards = Array.from(document.querySelectorAll('.player-edit-card')).filter(c => c.style.display !== 'none');
    const records = cards.map(card => {
        const id = card.querySelector('.player-record-id').value;
        const data = {
            match_id: matchId,
            event_datetime: eventDatetime,
            tournament_type: tournamentType,
            mahjong_mode: mahjongMode,
            match_mode: matchMode,
            dist_points: distPoints,
            opt_tobi: optTobi,
            opt_yakitori: optYakitori,
            account_name: card.querySelector('.player-account-name').value,
            team_name: card.querySelector('.player-team-name').value,
            raw_points: parseInt(card.querySelector('.player-raw-points').value) || 0,
            final_score: parseFloat(card.querySelector('.player-final-score').value) || 0,
            rank: parseInt(card.querySelector('.player-rank').value) || null,
            win_count: parseInt(card.querySelector('.player-win-count').value) || 0,
            deal_in_count: parseInt(card.querySelector('.player-deal-in-count').value) || 0,
            discord_user_id: card.querySelector('.player-discord-id').value.trim() || null
        };
        if (id) data.id = id;
        return data;
    });

    toggleLoading(true);
    try {
        const { error } = await supabaseClient.from('match_results').upsert(records);
        if (error) throw error;
        recordModal.hide();
        fetchRecords();
    } catch (err) { alert(err.message); }
    finally { toggleLoading(false); }
}

async function fetchUsers() {
    const listBody = document.getElementById('users-list-body');
    if (!listBody) return;

    listBody.innerHTML = '<tr><td colspan="4" class="text-center">読み込み中...</td></tr>';

    try {
        const { data: users, error } = await supabaseClient.from('profiles').select('*').order('account_name');
        if (error) throw error;

        if (!users || users.length === 0) {
            listBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">ユーザーがいません</td></tr>';
            return;
        }

        listBody.innerHTML = '';
        users.forEach(user => {
            const tr = document.createElement('tr');
            const name = user.account_name || '名前なし';
            const discordId = user.discord_user_id || '';
            const coins = user.coins || 0;
            const teamName = user.team_name || '-';
            const avatarUrl = user.avatar_url || '';

            tr.innerHTML = `
                <td>
                    <div class="d-flex align-items-center gap-2">
                        <img src="${escapeHtml(avatarUrl)}" class="rounded-circle border" style="width: 32px; height: 32px;" onerror="this.style.display='none'">
                        <div>
                            <div class="fw-bold">${escapeHtml(name)}</div>
                            <div class="small text-muted" style="font-size: 0.7rem;">${escapeHtml(discordId)}</div>
                        </div>
                    </div>
                </td>
                <td><span class="badge bg-light text-dark border">🪙 ${coins.toLocaleString()}</span></td>
                <td>${escapeHtml(teamName)}</td>
                <td>
                    <div class="d-flex gap-1 flex-wrap">
                        <button class="btn btn-sm btn-outline-warning btn-coin" data-id="${escapeHtml(discordId)}" data-name="${escapeHtml(name)}" data-coins="${coins}">コイン</button>
                        <button class="btn btn-sm btn-outline-info btn-badge" data-id="${escapeHtml(discordId)}" data-name="${escapeHtml(name)}">バッジ</button>
                        <button class="btn btn-sm btn-outline-secondary btn-impersonate" data-id="${escapeHtml(discordId)}" data-name="${escapeHtml(name)}" data-avatar="${escapeHtml(avatarUrl)}">なりすまし</button>
                    </div>
                </td>
            `;
            listBody.appendChild(tr);
        });

        // イベントリスナーを追加
        listBody.querySelectorAll('.btn-coin').forEach(btn => {
            btn.addEventListener('click', function () {
                openCoinModal(this.dataset.id, this.dataset.name, parseInt(this.dataset.coins) || 0);
            });
        });
        listBody.querySelectorAll('.btn-badge').forEach(btn => {
            btn.addEventListener('click', function () {
                openBadgeGrantModal(this.dataset.id, this.dataset.name);
            });
        });
        listBody.querySelectorAll('.btn-impersonate').forEach(btn => {
            btn.addEventListener('click', function () {
                impersonateUser(this.dataset.id, this.dataset.name, this.dataset.avatar);
            });
        });

    } catch (err) {
        console.error('ユーザー取得エラー:', err);
        listBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">エラー: ${err.message}</td></tr>`;
    }
}

// HTMLエスケープ用ヘルパー関数
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function openCoinModal(userId, userName, currentCoins) {
    document.getElementById('coin-edit-user-id').value = userId;
    document.getElementById('coin-edit-user-name').textContent = userName;
    document.getElementById('coin-amount').value = currentCoins;
    new bootstrap.Modal(document.getElementById('coinModal')).show();
}

async function saveUserCoins() {
    const userId = document.getElementById('coin-edit-user-id').value;
    const newAmount = parseInt(document.getElementById('coin-amount').value) || 0;

    toggleLoading(true);
    try {
        // 現在の値を取得
        const { data: profile, error: fetchError } = await supabaseClient
            .from('profiles')
            .select('coins, total_assets')
            .eq('discord_user_id', userId)
            .single();

        if (fetchError) throw fetchError;

        const currentCoins = profile.coins || 0;
        const currentAssets = profile.total_assets || 0;
        const difference = newAmount - currentCoins;

        // coins と total_assets を更新
        const { error } = await supabaseClient.from('profiles').update({
            coins: newAmount,
            total_assets: currentAssets + difference
        }).eq('discord_user_id', userId);
        if (error) throw error;

        alert(`コインを更新しました（差額: ${difference >= 0 ? '+' : ''}${difference}）`);
        bootstrap.Modal.getInstance(document.getElementById('coinModal'))?.hide();
        fetchUsers();
    } catch (err) {
        console.error('コイン更新エラー:', err);
        alert('エラー: ' + err.message);
    } finally {
        toggleLoading(false);
    }
}

async function openBadgeGrantModal(userId, userName) {
    document.getElementById('badge-grant-user-id').value = userId;
    document.getElementById('badge-grant-user-name').textContent = userName;
    const ownedList = document.getElementById('badge-grant-owned-list');
    const availableList = document.getElementById('badge-grant-list');

    try {
        const { data: userBadges } = await supabaseClient.from('user_badges_new').select('*, badge:badges(*)').eq('user_id', userId);
        const { data: allBadges } = await supabaseClient.from('badges').select('*').order('name');

        ownedList.innerHTML = (userBadges || []).map(ub => `
            <span class="badge bg-secondary">${escapeHtml(ub.badge?.name || '不明')}</span>
        `).join('') || '<span class="text-muted">なし</span>';

        availableList.innerHTML = (allBadges || []).map(b => `
            <div class="col-6 col-md-4">
                <div class="form-check">
                    <input class="form-check-input badge-grant-checkbox" type="checkbox" value="${b.id}" id="grant-${b.id}">
                    <label class="form-check-label small" for="grant-${b.id}">${escapeHtml(b.name)}</label>
                </div>
            </div>
        `).join('');

        new bootstrap.Modal(document.getElementById('badgeGrantModal')).show();
    } catch (err) {
        console.error('バッジ付与モーダルエラー:', err);
        alert('エラー: ' + err.message);
    }
}

async function grantBadge(userId, badgeId, badgeName) {
    if (!confirm(`「${badgeName}」を付与しますか？`)) return;
    toggleLoading(true);
    try {
        await supabaseClient.from('user_badges_new').insert([{ user_id: userId, badge_id: badgeId, purchased_price: 0 }]);
        openBadgeGrantModal(userId, document.getElementById('badge-grant-user-name').textContent);
    } catch (err) { alert(err.message); }
    finally { toggleLoading(false); }
}

async function grantMultiBadges() {
    const userId = document.getElementById('badge-grant-user-id').value;
    const userName = document.getElementById('badge-grant-user-name').textContent;
    const checkboxes = document.querySelectorAll('.badge-grant-checkbox:checked');

    if (checkboxes.length === 0) {
        alert('付与するバッジを選択してください');
        return;
    }

    if (!confirm(`${checkboxes.length}個のバッジを付与しますか？`)) return;

    toggleLoading(true);
    try {
        const inserts = Array.from(checkboxes).map(cb => ({
            user_id: userId,
            badge_id: cb.value,
            purchased_price: 0
        }));

        const { error } = await supabaseClient.from('user_badges_new').insert(inserts);
        if (error) throw error;

        alert(`${checkboxes.length}個のバッジを付与しました`);
        bootstrap.Modal.getInstance(document.getElementById('badgeGrantModal'))?.hide();
    } catch (err) {
        console.error('バッジ付与エラー:', err);
        alert('エラー: ' + err.message);
    } finally {
        toggleLoading(false);
    }
}

async function revokeBadge(userId, badgeId, badgeName) {
    if (!confirm(`「${badgeName}」を1つ剥奪しますか？`)) return;
    toggleLoading(true);
    try {
        const { data: targetRows } = await supabaseClient.from('user_badges_new').select('uuid').eq('user_id', userId).eq('badge_id', badgeId).limit(1);
        if (targetRows?.length > 0) {
            await supabaseClient.from('user_badges_new').delete().eq('uuid', targetRows[0].uuid);
            openBadgeGrantModal(userId, document.getElementById('badge-grant-user-name').textContent);
        }
    } catch (err) { alert(err.message); }
    finally { toggleLoading(false); }
}

async function fetchBadges() {
    const list = document.getElementById('badges-list');
    if (!list) return;
    try {
        const { data: badges } = await supabaseClient.from('badges').select('*').order('sort_order', { ascending: true });
        list.innerHTML = badges.map(badge => `
            <div class="col-md-4 col-lg-3">
                <div class="card h-100 shadow-sm border-0 badge-card">
                    <div class="card-body text-center">
                        <img src="${badge.image_url}" class="mb-3 badge-thumb shadow-sm" style="width: 64px; height: 64px; object-fit: contain;">
                        <h6 class="fw-bold mb-1">${badge.name}</h6>
                        <div class="mt-3 d-flex gap-1 justify-content-center">
                            <button onclick='openBadgeModal(${JSON.stringify(badge).replace(/'/g, "&apos;")})' class="btn btn-sm btn-outline-primary">編集</button>
                            <button onclick="deleteBadge('${badge.id}')" class="btn btn-sm btn-outline-danger">削除</button>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (err) { console.error(err); }
}

async function openBadgeModal(badge = null) {
    const form = document.getElementById('badge-form');
    form.reset();
    if (badge) {
        document.getElementById('badge-id').value = badge.id;
        document.getElementById('badge-name').value = badge.name;
        document.getElementById('badge-description').value = badge.description || '';
        document.getElementById('badge-image-url').value = badge.image_url;
    } else {
        document.getElementById('badge-id').value = '';
    }
    window.badgeModal.show();
}

async function saveBadge() {
    const id = document.getElementById('badge-id').value;
    const name = document.getElementById('badge-name').value;
    const description = document.getElementById('badge-description').value;
    let image_url = document.getElementById('badge-image-url').value;
    const imageFile = document.getElementById('badge-image-file').files[0];

    toggleLoading(true);
    try {
        if (imageFile) {
            const fileName = `${Math.random().toString(36).substring(2)}.${imageFile.name.split('.').pop()}`;
            await supabaseClient.storage.from('badges').upload(fileName, imageFile);
            const { data } = supabaseClient.storage.from('badges').getPublicUrl(fileName);
            image_url = data.publicUrl;
        }

        const badgeData = { name, description, image_url };
        if (id) await supabaseClient.from('badges').update(badgeData).eq('id', id);
        else await supabaseClient.from('badges').insert([badgeData]);
        window.badgeModal.hide();
        fetchBadges();
    } catch (err) { alert(err.message); }
    finally { toggleLoading(false); }
}

async function deleteBadge(id) {
    if (!confirm('削除しますか？')) return;
    await supabaseClient.from('badges').delete().eq('id', id);
    fetchBadges();
}

async function handleBulkBadgeUpload(event) {
    const files = Array.from(event.target.files);
    toggleLoading(true);
    for (const file of files) {
        try {
            const fileName = `${Math.random().toString(36).substring(2)}.${file.name.split('.').pop()}`;
            await supabaseClient.storage.from('badges').upload(fileName, file);
            const { data } = supabaseClient.storage.from('badges').getPublicUrl(fileName);
            await supabaseClient.from('badges').insert([{ name: file.name.replace(/\.[^/.]+$/, ''), image_url: data.publicUrl }]);
        } catch (err) { console.error(err); }
    }
    toggleLoading(false);
    fetchBadges();
}

async function exportBadgesToCSV() {
    const { data: badges } = await supabaseClient.from('badges').select('*');
    const headers = ['id', 'name', 'description', 'image_url'];
    const csvRows = [headers.join(',')];
    badges.forEach(b => csvRows.push(headers.map(h => `"${String(b[h] || '').replace(/"/g, '""')}"`).join(',')));
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvRows.join('\n')], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'badges.csv';
    link.click();
}

async function handleBadgeCSVImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        const lines = e.target.result.split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const items = [];
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            const obj = {};
            headers.forEach((h, idx) => obj[h] = values[idx]);
            if (obj.name) items.push(obj);
        }
        await supabaseClient.from('badges').upsert(items);
        fetchBadges();
    };
    reader.readAsText(file);
}

function impersonateUser(id, name, avatar) {
    if (!confirm(`${name} として操作しますか？`)) return;
    localStorage.setItem('admin_impersonate_user', JSON.stringify({ discord_user_id: id, name, avatar_url: avatar }));
    window.location.href = '../mypage/index.html';
}

async function exportToCSV() {
    const headers = ['id', 'event_datetime', 'account_name', 'final_score', 'rank'];
    const csvRows = [headers.join(',')];
    filteredRecords.forEach(r => csvRows.push(headers.map(h => `"${String(r[h] || '').replace(/"/g, '""')}"`).join(',')));
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvRows.join('\n')], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'records.csv';
    link.click();
}

async function handleCSVImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        const lines = e.target.result.split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            const obj = {};
            headers.forEach((h, idx) => obj[h] = values[idx]);
            if (obj.event_datetime) data.push(obj);
        }
        await supabaseClient.from('match_results').upsert(data);
        fetchRecords();
    };
    reader.readAsText(file);
}

async function fetchTeamRequests() {
    const { data: kicks } = await supabaseClient.from('team_admin_requests').select('*').eq('type', 'kick').eq('status', 'pending');
    const { data: diss } = await supabaseClient.from('team_admin_requests').select('*').eq('type', 'dissolution').eq('status', 'pending');
    const badge = document.getElementById('team-requests-badge');
    const count = (kicks?.length || 0) + (diss?.length || 0);
    if (badge) { badge.textContent = count; badge.style.display = count > 0 ? 'inline' : 'none'; }
}

async function approveKick(id) {
    const { data: req } = await supabaseClient.from('team_admin_requests').select('*').eq('id', id).single();
    await supabaseClient.from('profiles').update({ team_id: null }).eq('discord_user_id', req.target_discord_id);
    await supabaseClient.from('team_admin_requests').update({ status: 'approved' }).eq('id', id);
    fetchTeamRequests();
}

async function approveDissolution(id, teamId) {
    await supabaseClient.from('profiles').update({ team_id: null }).eq('team_id', teamId);
    await supabaseClient.from('teams').delete().eq('id', teamId);
    await supabaseClient.from('team_admin_requests').update({ status: 'approved' }).eq('id', id);
    fetchTeamRequests();
}

let currentLogsPage = 1;
const LOGS_PER_PAGE = 10;
let profilesCache = {};

async function loadProfilesCache() {
    const { data } = await supabaseClient.from('profiles').select('discord_user_id, account_name, avatar_url');
    profilesCache = {};
    if (data) data.forEach(p => profilesCache[p.discord_user_id] = { name: p.account_name, avatar: p.avatar_url });
}

async function fetchActivityLogs(page = 1) {
    currentLogsPage = page;
    if (Object.keys(profilesCache).length === 0) await loadProfilesCache();
    const from = (page - 1) * LOGS_PER_PAGE;
    const to = from + LOGS_PER_PAGE - 1;
    const { data: logs, count } = await supabaseClient.from('activity_logs').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(from, to);

    const listBody = document.getElementById('logs-list-body');
    if (listBody) {
        // テーブルヘッダーにチェックボックスを追加
        const thead = listBody.closest('table')?.querySelector('thead tr');
        if (thead && !thead.querySelector('.log-select-all')) {
            const th = document.createElement('th');
            th.innerHTML = `<input type="checkbox" class="form-check-input log-select-all" onchange="toggleAllLogs(this)">`;
            thead.insertBefore(th, thead.firstChild);
        }

        // 一括操作ボタンを追加
        const container = listBody.closest('.card-body') || listBody.parentElement;
        let bulkActions = document.getElementById('bulk-log-actions');
        if (!bulkActions) {
            bulkActions = document.createElement('div');
            bulkActions.id = 'bulk-log-actions';
            bulkActions.className = 'd-flex gap-2 mb-3 align-items-center';
            bulkActions.innerHTML = `
                <span class="text-muted small" id="selected-logs-count">0件選択中</span>
                <button class="btn btn-sm btn-danger" onclick="revertSelectedLogs()" id="bulk-revert-btn" disabled>
                    🗑️ 選択を一括取消
                </button>
            `;
            const table = listBody.closest('table');
            if (table) table.parentElement.insertBefore(bulkActions, table);
        }

        listBody.innerHTML = logs.map(log => {
            const u = profilesCache[log.user_id] || { name: '不明', avatar: '' };
            const target = log.target_user_id ? (profilesCache[log.target_user_id] || { name: '不明' }) : null;

            // アクションタイプのアイコンと日本語名
            const actionMap = {
                'badge_purchase': { icon: '🛒', label: 'バッジ購入' },
                'badge_sell': { icon: '💰', label: 'バッジ売却' },
                'badge_transfer': { icon: '🎁', label: 'バッジ譲渡' },
                'badge_receive': { icon: '📥', label: 'バッジ受取' },
                'gacha_draw': { icon: '🎰', label: 'ガチャ' },
                'coin_transfer': { icon: '💸', label: 'コイン送金' },
                'coin_receive': { icon: '📩', label: 'コイン受取' },
                'omikuji': { icon: '⛩️', label: 'おみくじ' },
                'ticket_transfer': { icon: '🎟️', label: 'チケット譲渡' },
                'ticket_receive': { icon: '🎫', label: 'チケット受取' },
                'admin_coin_adjust': { icon: '🔧', label: '管理者調整' }
            };
            const action = actionMap[log.action_type] || { icon: '📋', label: log.action_type };

            // 金額の表示
            const amountColor = log.amount > 0 ? 'text-success' : (log.amount < 0 ? 'text-danger' : '');
            const amountPrefix = log.amount > 0 ? '+' : '';
            const amountDisplay = log.amount !== null ? `${amountPrefix}${log.amount.toLocaleString()}` : '-';

            // 対象者の表示
            const targetDisplay = target ? `→ ${escapeHtml(target.name)}` : '';

            return `
                <tr>
                    <td>
                        <input type="checkbox" class="form-check-input log-checkbox" value="${log.id}" onchange="updateSelectedCount()">
                    </td>
                    <td>
                        <div class="small">${new Date(log.created_at).toLocaleDateString('ja-JP')}</div>
                        <div class="small text-muted">${new Date(log.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</div>
                    </td>
                    <td>
                        <div class="d-flex align-items-center gap-2">
                            <img src="${u.avatar || ''}" class="rounded-circle" style="width: 28px; height: 28px;" onerror="this.style.display='none'">
                            <span class="fw-bold">${escapeHtml(u.name)}</span>
                        </div>
                    </td>
                    <td>
                        <span class="badge bg-light text-dark border">
                            ${action.icon} ${action.label}
                        </span>
                    </td>
                    <td class="small text-muted">${targetDisplay}</td>
                    <td class="fw-bold ${amountColor}">${amountDisplay}</td>
                    <td><button onclick="revertLog('${log.id}')" class="btn btn-sm btn-outline-danger">🔄</button></td>
                </tr>
            `;
        }).join('');
    }

    const pageInfo = document.getElementById('logs-page-info');
    if (pageInfo) pageInfo.textContent = `${page} / ${Math.ceil(count / LOGS_PER_PAGE) || 1}`;
}

function changeLogsPage(delta) {
    fetchActivityLogs(currentLogsPage + delta);
}

async function revertLog(logId) {
    if (!confirm('取り消しますか？')) return;

    console.log('=== revertLog called ===');
    console.log('logId:', logId);
    console.log('logId type:', typeof logId);

    toggleLoading(true);
    try {
        const { data, error } = await supabaseClient.rpc('revert_activity_log', { p_log_id: logId });

        console.log('RPC response - data:', data);
        console.log('RPC response - error:', error);

        if (error) {
            console.error('RPC Error details:', JSON.stringify(error, null, 2));
            throw error;
        }

        if (data?.ok) {
            alert('成功');
            fetchActivityLogs();
        } else {
            alert('エラー: ' + (data?.error || '取消に失敗しました'));
        }
    } catch (err) {
        console.error('revertLog exception:', err);
        alert('エラーが発生しました: ' + err.message);
    }
    finally { toggleLoading(false); }
}

// 全選択/全解除
function toggleAllLogs(selectAllCheckbox) {
    const checkboxes = document.querySelectorAll('.log-checkbox');
    checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
    updateSelectedCount();
}

// 選択件数の更新
function updateSelectedCount() {
    const checkboxes = document.querySelectorAll('.log-checkbox:checked');
    const count = checkboxes.length;
    const countEl = document.getElementById('selected-logs-count');
    const btn = document.getElementById('bulk-revert-btn');

    if (countEl) countEl.textContent = `${count}件選択中`;
    if (btn) btn.disabled = count === 0;
}

// 選択したログを一括取り消し
async function revertSelectedLogs() {
    const checkboxes = document.querySelectorAll('.log-checkbox:checked');
    const logIds = Array.from(checkboxes).map(cb => cb.value);

    if (logIds.length === 0) {
        alert('取り消すログを選択してください');
        return;
    }

    if (!confirm(`${logIds.length}件のログを取り消しますか？\nこの操作は元に戻せません。`)) return;

    toggleLoading(true);
    let successCount = 0;
    let errorCount = 0;

    for (const logId of logIds) {
        try {
            const { data, error } = await supabaseClient.rpc('revert_activity_log', { p_log_id: logId });
            if (error) throw error;
            if (data?.ok) successCount++;
            else errorCount++;
        } catch (err) {
            console.error('一括取消エラー:', logId, err);
            errorCount++;
        }
    }

    toggleLoading(false);
    alert(`完了: ${successCount}件成功、${errorCount}件失敗`);
    fetchActivityLogs();
}
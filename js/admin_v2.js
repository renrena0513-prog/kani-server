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
    try {
        const { data: users } = await supabaseClient.from('profiles').select('*').order('account_name');
        listBody.innerHTML = users.map(user => `
            <tr>
                <td>${user.account_name}</td>
                <td> ${user.total_coins || 0}</td>
                <td>${user.team_name || '-'}</td>
                <td>
                    <button onclick="openCoinModal('${user.discord_user_id}', '${user.account_name}', ${user.total_coins || 0})" class="btn btn-sm btn-outline-warning">コイン</button>
                    <button onclick="openBadgeGrantModal('${user.discord_user_id}', '${user.account_name}')" class="btn btn-sm btn-outline-info">バッジ</button>
                    <button onclick="impersonateUser('${user.discord_user_id}', '${user.account_name}', '${user.avatar_url}')" class="btn btn-sm btn-outline-secondary">なりすまし</button>
                </td>
            </tr>
        `).join('');
    } catch (err) { console.error(err); }
}

function openCoinModal(userId, userName, currentCoins) {
    document.getElementById('coin-user-id').value = userId;
    document.getElementById('coin-user-name').textContent = userName;
    document.getElementById('coin-amount').value = currentCoins;
    window.coinModal.show();
}

async function saveCoins() {
    const userId = document.getElementById('coin-user-id').value;
    const amount = parseInt(document.getElementById('coin-amount').value);
    await supabaseClient.from('profiles').update({ total_coins: amount }).eq('discord_user_id', userId);
    window.coinModal.hide();
    fetchUsers();
}

async function openBadgeGrantModal(userId, userName) {
    document.getElementById('badge-grant-user-id').value = userId;
    document.getElementById('badge-grant-user-name').textContent = userName;
    const currentList = document.getElementById('current-badges-list');
    const availableList = document.getElementById('available-badges-list');
    const { data: userBadges } = await supabaseClient.from('user_badges_new').select('*, badge:badges(*)').eq('user_id', userId);
    const { data: allBadges } = await supabaseClient.from('badges').select('*').order('name');
    
    currentList.innerHTML = userBadges.map(ub => `
        <div class="d-flex justify-content-between p-1 border-bottom">
            <span>${ub.badge?.name}</span>
            <button onclick="revokeBadge('${userId}', '${ub.badge_id}', '${ub.badge?.name}')" class="btn btn-sm btn-outline-danger">-</button>
        </div>
    `).join('') || 'なし';

    availableList.innerHTML = allBadges.map(b => `
        <div class="d-flex justify-content-between p-1 border-bottom">
            <span>${b.name}</span>
            <button onclick="grantBadge('${userId}', '${b.id}', '${b.name}')" class="btn btn-sm btn-outline-primary">付与</button>
        </div>
    `).join('');
    new bootstrap.Modal(document.getElementById('badgeGrantModal')).show();
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
        listBody.innerHTML = logs.map(log => {
            const u = profilesCache[log.user_id] || { name: '不明' };
            const color = log.amount > 0 ? 'text-success' : 'text-danger';
            return `
                <tr>
                    <td>${new Date(log.created_at).toLocaleString()}</td>
                    <td>${u.name}</td>
                    <td>${log.action_type}</td>
                    <td class="${color}">${log.amount}</td>
                    <td><button onclick="revertLog('${log.id}')" class="btn btn-sm btn-outline-danger">取消</button></td>
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
    toggleLoading(true);
    try {
        const { data, error } = await supabaseClient.rpc('revert_activity_log', { p_log_id: logId });
        if (error) throw error;
        if (data?.ok) { alert('成功'); fetchActivityLogs(); }
        else { alert('エラー: ' + data?.error); }
    } catch (err) { alert(err.message); }
    finally { toggleLoading(false); }
}
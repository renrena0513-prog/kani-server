// 管理画面用ロジック（大会記録管理版）
let recordModal;

document.addEventListener('DOMContentLoaded', () => {
    // モーダルの初期化
    const modalElement = document.getElementById('recordModal');
    if (modalElement) {
        recordModal = new bootstrap.Modal(modalElement);
    }

    // 記録一覧の取得
    fetchRecords();
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

// 記録一覧の取得
async function fetchRecords() {
    try {
        const { data: records, error } = await supabaseClient
            .from('match_results')
            .select('*');

        if (error) throw error;

        allRecords = records;
        updateFilterOptions(); // フィルターの選択肢を更新
        applyFiltersAndSort();
    } catch (err) {
        console.error('記録取得エラー:', err.message);
        const listBody = document.getElementById('records-list-body');
        if (listBody) {
            if (err.message.includes('relation "match_results" does not exist')) {
                listBody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">テーブル "match_results" が見つかりません。</td></tr>';
            } else {
                listBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">エラー: ${err.message}</td></tr>`;
            }
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
    if (records.length === 0) {
        listBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">登録されている記録はありません</td></tr>';
        return;
    }

    records.forEach(record => {
        const tr = document.createElement('tr');
        const dateStr = new Date(record.event_datetime).toLocaleString('ja-JP', {
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
        });
        const scoreColor = (record.final_score > 0) ? 'text-success' : (record.final_score < 0 ? 'text-danger' : '');

        tr.innerHTML = `
            <td>${dateStr}</td>
            <td><span class="badge bg-light text-dark">${record.account_name}</span></td>
            <td>
                <div class="small fw-bold">${record.tournament_type || '-'}</div>
                <div class="small text-muted">${record.mahjong_mode || ''} / ${record.match_mode || ''}</div>
            </td>
            <td class="fw-bold ${scoreColor}">${record.final_score !== null ? (record.final_score > 0 ? '+' : '') + record.final_score.toFixed(1) : '-'}</td>
            <td>${record.rank ? `<span class="badge bg-primary">${record.rank}位</span>` : '-'}</td>
            <td>${record.matches_played || 1}局</td>
            <td>
                <button onclick='editRecord(${JSON.stringify(record).replace(/'/g, "&apos;")})' class="btn btn-sm btn-outline-primary">編集</button>
                <button onclick="deleteRecord('${record.id}')" class="btn btn-sm btn-outline-danger">削除</button>
            </td>
        `;
        listBody.appendChild(tr);
    });
}

// モーダル制御
function openRecordModal() {
    document.getElementById('recordModalLabel').textContent = '大会記録 追加';
    document.getElementById('record-form').reset();
    document.getElementById('record-id').value = '';
    recordModal.show();
}

function editRecord(record) {
    document.getElementById('recordModalLabel').textContent = '大会記録 編集';
    document.getElementById('record-id').value = record.id;
    const fields = [
        'event_datetime', 'account_name', 'tournament_type', 'team_name',
        'mahjong_mode', 'match_mode', 'final_score', 'rank',
        'matches_played', 'win_count', 'deal_in_count', 'discord_user_id'
    ];
    fields.forEach(field => {
        let val = record[field] || '';
        if (field === 'event_datetime' && val) val = val.slice(0, 16);
        const el = document.getElementById(field);
        if (el) el.value = val;
    });
    recordModal.show();
}

async function saveRecordFromForm() {
    const id = document.getElementById('record-id').value;
    const fields = [
        'event_datetime', 'account_name', 'tournament_type', 'team_name',
        'mahjong_mode', 'match_mode', 'final_score', 'rank',
        'matches_played', 'win_count', 'deal_in_count', 'discord_user_id'
    ];
    const data = {};
    fields.forEach(field => {
        const el = document.getElementById(field);
        if (!el) return;
        let val = el.value;
        if (['final_score', 'rank', 'matches_played', 'win_count', 'deal_in_count'].includes(field)) {
            val = val !== '' ? Number(val) : null;
        }
        data[field] = val;
    });

    if (!data.event_datetime || !data.account_name) {
        alert('日時とアカウント名は必須です');
        return;
    }

    toggleLoading(true);
    try {
        let error;
        if (id) {
            ({ error } = await supabaseClient.from('match_results').update(data).eq('id', id));
        } else {
            ({ error } = await supabaseClient.from('match_results').insert([data]));
        }
        if (error) throw error;
        recordModal.hide();
        fetchRecords();
    } catch (err) {
        alert('保存エラー: ' + err.message);
    } finally {
        toggleLoading(false);
    }
}

async function deleteRecord(id) {
    if (!confirm('この記録を削除してもよろしいですか？')) return;
    toggleLoading(true);
    try {
        const { error } = await supabaseClient.from('match_results').delete().eq('id', id);
        if (error) throw error;
        fetchRecords();
    } catch (err) {
        alert('削除エラー: ' + err.message);
    } finally {
        toggleLoading(false);
    }
}

// ユーザー一覧取得
async function fetchUsers() {
    const listBody = document.getElementById('users-list-body');
    if (!listBody) return;

    try {
        const { data: users, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .order('updated_at', { ascending: false });

        if (error) throw error;
        listBody.innerHTML = '';
        if (users.length === 0) {
            listBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4">登録されているユーザーはいません</td></tr>';
            return;
        }

        users.forEach(user => {
            const tr = document.createElement('tr');
            const dateStr = user.updated_at ? new Date(user.updated_at).toLocaleString('ja-JP') : '-';
            const avatarHtml = user.avatar_url ? `<img src="${user.avatar_url}" width="32" height="32" class="rounded-circle shadow-sm">` : '<div class="bg-secondary rounded-circle" style="width:32px;height:32px;"></div>';
            tr.innerHTML = `
                <td>${avatarHtml}</td>
                <td>
                    <div class="fw-bold">${user.account_name || '名称未設定'}</div>
                    <div class="small text-muted">${user.discord_account || ''}</div>
                </td>
                <td><code>${user.discord_user_id || '-'}</code></td>
                <td class="small text-muted">${dateStr}</td>
                <td>
                    <button onclick="impersonateUser('${user.discord_user_id}', '${(user.account_name || '名称未設定').replace(/'/g, "\\'")}', '${user.avatar_url || ''}')" class="btn btn-sm btn-outline-warning">
                        🎭 操作
                    </button>
                </td>
            `;
            listBody.appendChild(tr);
        });
    } catch (err) {
        console.error('ユーザー取得エラー:', err.message);
        listBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">エラー: ${err.message}</td></tr>`;
    }
}

// ユーザーのなりすましを開始
function impersonateUser(discordUserId, accountName, avatarUrl) {
    if (!confirm(`${accountName} として操作を開始しますか？\n（管理者メニューへのアクセスは維持されますが、他の機能はそのユーザーとして動作します）`)) return;

    const userData = {
        discord_user_id: discordUserId,
        name: accountName,
        avatar_url: avatarUrl
    };

    localStorage.setItem('admin_impersonate_user', JSON.stringify(userData));

    // トップページに遷移して操作を開始
    window.location.href = '../index.html';
}

// CSV処理
async function exportToCSV() {
    try {
        if (filteredRecords.length === 0) {
            alert('データがありません');
            return;
        }
        const headers = [
            'id', 'event_datetime', 'account_name', 'tournament_type', 'team_name',
            'mahjong_mode', 'match_mode', 'final_score', 'rank', 'matches_played',
            'win_count', 'deal_in_count', 'discord_user_id'
        ];
        const csvRows = [headers.join(',')];
        filteredRecords.forEach(row => {
            const values = headers.map(header => {
                const val = row[header] ?? '';
                return `"${String(val).replace(/"/g, '""')}"`;
            });
            csvRows.push(values.join(','));
        });
        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `match_results_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
    } catch (err) {
        alert('CSV出力エラー: ' + err.message);
    }
}

async function handleCSVImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        const text = e.target.result;
        const rows = text.split(/\r?\n/).filter(row => row.trim() !== '');
        if (rows.length < 2) return;
        const headers = rows[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const dataToInsert = [];
        for (let i = 1; i < rows.length; i++) {
            const values = rows[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
            const obj = {};
            headers.forEach((h, idx) => {
                let val = values[idx];
                if (['final_score', 'rank', 'matches_played', 'win_count', 'deal_in_count'].includes(h)) {
                    val = (val !== '' && val !== undefined) ? Number(val) : null;
                }
                if (val !== undefined) obj[h] = val;
            });
            if (!obj.id || obj.id === '' || obj.id === 'null') delete obj.id;
            if (obj.event_datetime && obj.account_name) dataToInsert.push(obj);
        }
        if (dataToInsert.length === 0) {
            alert('有効なデータが見つかりませんでした');
            return;
        }
        if (confirm(`${dataToInsert.length}件をインポートしますか？`)) {
            toggleLoading(true);
            try {
                const { error } = await supabaseClient.from('match_results').upsert(dataToInsert);
                if (error) throw error;
                alert('インポート完了');
                fetchRecords();
            } catch (err) {
                alert('インポートエラー: ' + err.message);
            } finally {
                toggleLoading(false);
            }
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// チーム管理申請の取得
async function fetchTeamRequests() {
    try {
        // 追放申請取得
        const { data: kickRequests } = await supabaseClient
            .from('team_admin_requests')
            .select('*')
            .eq('type', 'kick')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        // 解散申請取得
        const { data: dissolutionRequests } = await supabaseClient
            .from('team_admin_requests')
            .select('*')
            .eq('type', 'dissolution')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        const totalPending = (kickRequests?.length || 0) + (dissolutionRequests?.length || 0);
        const badge = document.getElementById('team-requests-badge');
        if (totalPending > 0) {
            badge.textContent = totalPending;
            badge.style.display = 'inline';
        } else {
            badge.style.display = 'none';
        }

        // 追放申請リスト表示
        const kickList = document.getElementById('kick-requests-list');
        if (!kickRequests || kickRequests.length === 0) {
            kickList.innerHTML = '<p class="text-muted">保留中の追放申請はありません</p>';
        } else {
            kickList.innerHTML = kickRequests.map(req => `
                <div class="event-list-item">
                    <div>
                        <strong>チーム:</strong> ${req.team_name || '不明'}<br>
                        <strong>対象メンバー:</strong> ${req.target_name || '不明'}<br>
                        <small class="text-muted">申請者: ${req.requester_name || '不明'}</small>
                    </div>
                    <div>
                        <button class="btn btn-success btn-sm me-2" onclick="approveKick('${req.id}')">承認</button>
                        <button class="btn btn-outline-danger btn-sm" onclick="rejectKick('${req.id}')">却下</button>
                    </div>
                </div>
            `).join('');
        }

        // 解散申請リスト表示
        const dissolveList = document.getElementById('dissolution-requests-list');
        if (!dissolutionRequests || dissolutionRequests.length === 0) {
            dissolveList.innerHTML = '<p class="text-muted">保留中の解散申請はありません</p>';
        } else {
            dissolveList.innerHTML = dissolutionRequests.map(req => `
                <div class="event-list-item">
                    <div>
                        <strong>チーム:</strong> ${req.team_name || '不明'}<br>
                        <small class="text-muted">申請者: ${req.requester_name || '不明'}</small>
                    </div>
                    <div>
                        <button class="btn btn-danger btn-sm me-2" onclick="approveDissolution('${req.id}', '${req.team_id}')">解散を承認</button>
                        <button class="btn btn-outline-secondary btn-sm" onclick="rejectDissolution('${req.id}')">却下</button>
                    </div>
                </div>
            `).join('');
        }
    } catch (err) {
        console.error('チーム申請取得エラー:', err);
    }
}

// 追放申請を承認
async function approveKick(requestId) {
    if (!confirm('この追放申請を承認しますか？')) return;
    try {
        // 申請情報取得
        const { data: request } = await supabaseClient
            .from('team_admin_requests')
            .select('*')
            .eq('id', requestId)
            .single();

        if (!request) throw new Error('申請が見つかりません');

        // メンバーをチームから外す
        await supabaseClient
            .from('profiles')
            .update({ team_id: null })
            .eq('discord_user_id', request.target_discord_id);

        // 申請を承認済みに
        await supabaseClient
            .from('team_admin_requests')
            .update({ status: 'approved' })
            .eq('id', requestId);

        alert('追放を承認しました');
        fetchTeamRequests();
    } catch (err) {
        console.error('追放承認エラー:', err);
        alert('エラーが発生しました');
    }
}

// 追放申請を却下
async function rejectKick(requestId) {
    if (!confirm('この追放申請を却下しますか？')) return;
    try {
        await supabaseClient
            .from('team_admin_requests')
            .update({ status: 'rejected' })
            .eq('id', requestId);

        alert('追放申請を却下しました');
        fetchTeamRequests();
    } catch (err) {
        console.error('却下エラー:', err);
        alert('エラーが発生しました');
    }
}

// 解散申請を承認
async function approveDissolution(requestId, teamId) {
    if (!confirm('このチームを解散しますか？この操作は取り消せません')) return;
    if (!confirm('本当に解散しますか？')) return;

    try {
        // メンバーのteam_idをnullに
        await supabaseClient
            .from('profiles')
            .update({ team_id: null })
            .eq('team_id', teamId);

        // このチームに関連する全ての申請を削除（外部キー制約のため先に削除）
        await supabaseClient
            .from('team_admin_requests')
            .delete()
            .eq('team_id', teamId);

        // チームを削除
        await supabaseClient
            .from('teams')
            .delete()
            .eq('id', teamId);

        // 申請を承認済みに
        await supabaseClient
            .from('team_admin_requests')
            .update({ status: 'approved' })
            .eq('id', requestId);

        alert('チームを解散しました');
        fetchTeamRequests();
    } catch (err) {
        console.error('解散承認エラー:', err);
        alert('エラーが発生しました');
    }
}

// 解散申請を却下
async function rejectDissolution(requestId) {
    if (!confirm('この解散申請を却下しますか？')) return;
    try {
        await supabaseClient
            .from('team_admin_requests')
            .update({ status: 'rejected' })
            .eq('id', requestId);

        alert('解散申請を却下しました');
        fetchTeamRequests();
    } catch (err) {
        console.error('却下エラー:', err);
        alert('エラーが発生しました');
    }
}

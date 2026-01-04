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
    modes: [],
    match_modes: []
};




// 記録一覧の取得
async function fetchRecords() {
    try {
        const { data: records, error } = await supabaseClient
            .from('tournament_records')
            .select('*');

        if (error) throw error;

        allRecords = records;
        updateFilterOptions(); // フィルターの選択肢を更新
        applyFiltersAndSort();
    } catch (err) {
        console.error('記録取得エラー:', err.message);
        if (err.message.includes('relation "tournament_records" does not exist')) {
            const listBody = document.getElementById('records-list-body');
            if (listBody) listBody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">テーブル "tournament_records" が見つかりません。Supabaseでテーブルを作成してください。</td></tr>';
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
    const modeSet = new Set();
    const matchModeSet = new Set();

    allRecords.forEach(r => {
        if (r.discord_account) accountSet.add(r.discord_account);
        if (r.tournament_type) tournamentSet.add(r.tournament_type);
        if (r.mahjong_mode) modeSet.add(r.mahjong_mode);
        if (r.match_mode) matchModeSet.add(r.match_mode);
    });

    renderCheckboxes('filter-accounts', Array.from(accountSet), 'accounts');
    renderCheckboxes('filter-tournaments', Array.from(tournamentSet), 'tournaments');
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

    container.innerHTML = options.map(opt => `
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
    filterState = { accounts: [], tournaments: [], modes: [], match_modes: [] };
    document.querySelectorAll('#filter-panel input[type="checkbox"]').forEach(chk => chk.checked = false);
    applyFiltersAndSort();
}



// ソート関数
function sortRecords(key) {
    if (sortConfig.key === key) {
        sortConfig.direction = (sortConfig.direction === 'asc' ? 'desc' : 'asc');
    } else {
        sortConfig.key = key;
        sortConfig.direction = 'desc'; // デフォルトは降順
    }

    // UIのクラス更新
    document.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('asc', 'desc');
    });
    const th = document.getElementById(`th-${key}`);
    if (th) th.classList.add(sortConfig.direction);

    applyFiltersAndSort();
}

// フィルターとソートを統合して適用
function applyFiltersAndSort() {
    // 1. フィルタリング (マルチセレクト - アカウント、大会名、モード、試合方法)
    filteredRecords = allRecords.filter(record => {
        const matchAccount = filterState.accounts.length === 0 || filterState.accounts.includes(record.discord_account);
        const matchTournament = filterState.tournaments.length === 0 || filterState.tournaments.includes(record.tournament_type);
        const matchMode = filterState.modes.length === 0 || filterState.modes.includes(record.mahjong_mode);
        const matchMethod = filterState.match_modes.length === 0 || filterState.match_modes.includes(record.match_mode);

        return matchAccount && matchTournament && matchMode && matchMethod;
    });


    // 2. ソート
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

        const scoreColor = (record.score > 0) ? 'text-success' : (record.score < 0 ? 'text-danger' : '');

        tr.innerHTML = `
            <td>${dateStr}</td>
            <td><span class="badge bg-light text-dark">${record.discord_account}</span></td>
            <td>
                <div class="small fw-bold">${record.tournament_type || '-'}</div>
                <div class="small text-muted">${record.mahjong_mode || ''} / ${record.match_mode || ''}</div>
            </td>
            <td class="fw-bold ${scoreColor}">${record.score !== null ? (record.score > 0 ? '+' : '') + record.score : '-'}</td>
            <td>${record.hand_count || '-'}</td>
            <td>
                <span class="badge bg-danger bg-opacity-10 text-danger">${record.deal_in_count || 0} 放</span>
                <span class="badge bg-success bg-opacity-10 text-success">${record.win_count || 0} 和</span>
            </td>
            <td>
                <button onclick="editRecord(${JSON.stringify(record).replace(/"/g, '&quot;')})" class="btn btn-sm btn-outline-primary">編集</button>
                <button onclick="deleteRecord('${record.id}')" class="btn btn-sm btn-outline-danger">削除</button>
            </td>
        `;
        listBody.appendChild(tr);
    });
}

// モーダルを開く（新規）
function openRecordModal() {
    document.getElementById('recordModalLabel').textContent = '大会記録 追加';
    document.getElementById('record-form').reset();
    document.getElementById('record-id').value = '';
    recordModal.show();
}

// 編集画面を開く
function editRecord(record) {
    document.getElementById('recordModalLabel').textContent = '大会記録 編集';
    document.getElementById('record-id').value = record.id;

    // フィールド埋め
    const fields = [
        'event_datetime', 'discord_account', 'tournament_type', 'team_name',
        'mahjong_mode', 'match_mode', 'score', 'hand_count',
        'deal_in_count', 'win_count', 'opt1', 'opt2', 'opt3', 'opt4', 'opt5'
    ];


    fields.forEach(field => {
        let val = record[field] || '';
        if (field === 'event_datetime' && val) val = val.slice(0, 16);
        document.getElementById(field).value = val;
    });

    recordModal.show();
}

// 保存処理
async function saveRecordFromForm() {
    const id = document.getElementById('record-id').value;

    const fields = [
        'event_datetime', 'discord_account', 'tournament_type',
        'mahjong_mode', 'match_mode', 'score', 'hand_count',
        'deal_in_count', 'win_count', 'opt1', 'opt2', 'opt3', 'opt4', 'opt5'
    ];

    const data = {};
    fields.forEach(field => {
        let val = document.getElementById(field).value;
        if (['score', 'hand_count', 'deal_in_count', 'win_count'].includes(field)) {
            val = val !== '' ? Number(val) : null;
        }
        data[field] = val;
    });

    if (!data.event_datetime || !data.discord_account) {
        alert('日時とDiscordアカウントは必須です');
        return;
    }

    toggleLoading(true);
    try {
        let result;
        if (id) {
            result = await supabaseClient.from('tournament_records').update(data).eq('id', id);
        } else {
            result = await supabaseClient.from('tournament_records').insert([data]);
        }

        if (result.error) throw result.error;

        recordModal.hide();
        fetchRecords();
    } catch (err) {
        alert('保存エラー: ' + err.message);
    } finally {
        toggleLoading(false);
    }
}

// 削除処理
async function deleteRecord(id) {
    if (!confirm('この記録を削除してもよろしいですか？')) return;

    toggleLoading(true);
    try {
        const { error } = await supabaseClient.from('tournament_records').delete().eq('id', id);
        if (error) throw error;
        fetchRecords();
    } catch (err) {
        alert('削除エラー: ' + err.message);
    } finally {
        toggleLoading(false);
    }
}

// CSVエクスポート
async function exportToCSV() {
    try {
        if (filteredRecords.length === 0) {
            alert('データがありません（またはフィルターで全データが除外されています）');
            return;
        }

        const headers = [
            'id', 'event_datetime', 'discord_account', 'tournament_type', 'team_name',
            'mahjong_mode', 'match_mode', 'score', 'hand_count',
            'deal_in_count', 'win_count', 'opt1', 'opt2', 'opt3', 'opt4', 'opt5'
        ];

        const csvRows = [headers.join(',')];

        // 現在表示されている順序・内容 (filteredRecords) で出力
        filteredRecords.forEach(row => {
            const values = headers.map(header => {
                const val = row[header] || '';
                return `"${String(val).replace(/"/g, '""')}"`;
            });
            csvRows.push(values.join(','));
        });



        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `tournament_records_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (err) {
        alert('CSV出力エラー: ' + err.message);
    }
}

// CSVインポート
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
                if (['score', 'hand_count', 'deal_in_count', 'win_count'].includes(h)) {
                    val = (val !== '' && val !== undefined) ? Number(val) : null;
                }
                if (val !== undefined) obj[h] = val;
            });

            // IDが空、または "null" 文字列の場合は削除して自動生成を促す
            if (!obj.id || obj.id === '' || obj.id === 'null') {
                delete obj.id;
            }

            if (obj.event_datetime && obj.discord_account) {
                dataToInsert.push(obj);
            }
        }

        if (dataToInsert.length === 0) {
            alert('有効なデータが見つかりませんでした。ヘッダー（カラム名）が合っているか確認してください。');
            return;
        }

        if (confirm(`${dataToInsert.length}件の記録をインポート（同一IDは上書き）しますか？`)) {
            toggleLoading(true);
            try {
                const { error } = await supabaseClient.from('tournament_records').upsert(dataToInsert);
                if (error) throw error;
                alert('インポート完了');
                fetchRecords();
            } catch (err) {
                alert('インポートエラー: ' + err.message);
            } finally {
                toggleLoading(false);
            }
        }

        event.target.value = '';
    };
    reader.readAsText(file);
}

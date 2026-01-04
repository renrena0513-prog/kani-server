// 管理画面用ロジック
let eventModal;

document.addEventListener('DOMContentLoaded', () => {
    // モーダルの初期化
    const modalElement = document.getElementById('eventModal');
    if (modalElement) {
        eventModal = new bootstrap.Modal(modalElement);
    }

    // イベント一覧の取得
    fetchEvents();
});

// ローディング表示の切り替え
function toggleLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.visibility = show ? 'visible' : 'hidden';
    }
}

// イベント一覧の取得
async function fetchEvents() {
    try {
        const { data: events, error } = await supabaseClient
            .from('events')
            .select('*')
            .order('event_date', { ascending: false });

        if (error) throw error;

        displayEvents(events);
    } catch (err) {
        console.error('イベント取得エラー:', err.message);
        // テーブルがまだ無い、などの場合はエラーが出ますが、初回のみSQL実行の案内を表示
        if (err.message.includes('relation "events" does not exist')) {
            const listIds = ['mahjong-events-list', 'poker-events-list'];
            listIds.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = '<p class="text-danger">テーブル "events" が見つかりません。Supabaseでテーブルを作成してください。</p>';
            });
        }
    }
}

// イベントの表示
function displayEvents(events) {
    const mahjongList = document.getElementById('mahjong-events-list');
    const pokerList = document.getElementById('poker-events-list');

    if (mahjongList) mahjongList.innerHTML = '';
    if (pokerList) pokerList.innerHTML = '';

    events.forEach(event => {
        const item = document.createElement('div');
        item.className = 'event-list-item';

        const dateStr = new Date(event.event_date).toLocaleString('ja-JP', {
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
        });

        item.innerHTML = `
            <div class="event-info">
                <img src="${event.image_url || '../images/start_screen/title_logo.png'}" class="event-thumb" onerror="this.src='../images/start_screen/title_logo.png'">
                <div>
                    <div class="fw-bold">${event.title}</div>
                    <div class="small text-muted">${dateStr}</div>
                </div>
            </div>
            <div>
                <button onclick="editEvent(${JSON.stringify(event).replace(/"/g, '&quot;')})" class="btn btn-sm btn-outline-primary me-1">編集</button>
                <button onclick="deleteEvent('${event.id}')" class="btn btn-sm btn-outline-danger">削除</button>
            </div>
        `;

        if (event.event_type === 'mahjong' && mahjongList) {
            mahjongList.appendChild(item);
        } else if (event.event_type === 'poker' && pokerList) {
            pokerList.appendChild(item);
        }
    });

    // 空の場合のメッセージ
    if (mahjongList && mahjongList.innerHTML === '') {
        mahjongList.innerHTML = '<p class="text-muted text-center py-3">登録されている麻雀大会はありません</p>';
    }
    if (pokerList && pokerList.innerHTML === '') {
        pokerList.innerHTML = '<p class="text-muted text-center py-3">登録されているポーカー大会はありません</p>';
    }
}

// モーダルを開く（新規）
function openEventModal(type) {
    document.getElementById('eventModalLabel').textContent = (type === 'mahjong' ? '🀄 麻雀' : '🃏 ポーカー') + '大会 追加';
    document.getElementById('event-form').reset();
    document.getElementById('event-id').value = '';
    document.getElementById('event-type').value = type;
    eventModal.show();
}

// 編集画面を開く
function editEvent(event) {
    document.getElementById('eventModalLabel').textContent = 'イベント編集';
    document.getElementById('event-id').value = event.id;
    document.getElementById('event-type').value = event.event_type;
    document.getElementById('event-title').value = event.title;
    document.getElementById('event-date').value = event.event_date.slice(0, 16); // format for datetime-local
    document.getElementById('event-image-url').value = event.image_url || '';
    document.getElementById('event-description').value = event.description || '';
    eventModal.show();
}

// 保存処理（フォームから）
async function saveEventFromForm() {
    const id = document.getElementById('event-id').value;
    const type = document.getElementById('event-type').value;
    const title = document.getElementById('event-title').value;
    const date = document.getElementById('event-date').value;
    const imageUrl = document.getElementById('event-image-url').value;
    const description = document.getElementById('event-description').value;

    if (!title || !date) {
        alert('タイトルと日時は必須です');
        return;
    }

    const data = {
        title,
        event_date: date,
        event_type: type,
        image_url: imageUrl,
        description
    };

    toggleLoading(true);
    try {
        let result;
        if (id) {
            // 更新
            result = await supabaseClient.from('events').update(data).eq('id', id);
        } else {
            // 新規
            result = await supabaseClient.from('events').insert([data]);
        }

        if (result.error) throw result.error;

        eventModal.hide();
        fetchEvents();
    } catch (err) {
        alert('保存エラー: ' + err.message);
    } finally {
        toggleLoading(false);
    }
}

// 削除処理
async function deleteEvent(id) {
    if (!confirm('このイベントを削除してもよろしいですか？')) return;

    toggleLoading(true);
    try {
        const { error } = await supabaseClient.from('events').delete().eq('id', id);
        if (error) throw error;
        fetchEvents();
    } catch (err) {
        alert('削除エラー: ' + err.message);
    } finally {
        toggleLoading(false);
    }
}

// CSVエクスポート
async function exportToCSV() {
    try {
        const { data: events, error } = await supabaseClient.from('events').select('*');
        if (error) throw error;

        if (events.length === 0) {
            alert('データがありません');
            return;
        }

        const headers = ['title', 'event_date', 'event_type', 'image_url', 'description'];
        const csvRows = [headers.join(',')];

        events.forEach(row => {
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
        link.setAttribute('download', `events_export_${new Date().toISOString().slice(0, 10)}.csv`);
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
        const headers = rows[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

        const dataToInsert = [];
        for (let i = 1; i < rows.length; i++) {
            const values = rows[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
            const obj = {};
            headers.forEach((h, idx) => {
                obj[h] = values[idx];
            });

            // 必須チェック（最小限）
            if (obj.title && obj.event_type) {
                dataToInsert.push({
                    title: obj.title,
                    event_date: obj.event_date || new Date().toISOString(),
                    event_type: obj.event_type,
                    image_url: obj.image_url || '',
                    description: obj.description || ''
                });
            }
        }

        if (dataToInsert.length === 0) {
            alert('有効なデータが見つかりませんでした');
            return;
        }

        if (confirm(`${dataToInsert.length}件のデータをインポートしますか？`)) {
            toggleLoading(true);
            try {
                const { error } = await supabaseClient.from('events').insert(dataToInsert);
                if (error) throw error;
                alert('インポート完了');
                fetchEvents();
            } catch (err) {
                alert('インポートエラー: ' + err.message);
            } finally {
                toggleLoading(false);
            }
        }
        event.target.value = ''; // Reset file input
    };
    reader.readAsText(file);
}

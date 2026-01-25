/**
 * ページアクセス管理用のスクリプト
 */

// ページ設定の取得と表示
async function fetchPageSettings() {
    const listBody = document.getElementById('pages-list-body');
    if (listBody) {
        listBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">読み込み中...</td></tr>';
    }

    try {
        const { data, error } = await supabaseClient
            .from('page_settings')
            .select('*')
            .order('path');

        if (error) throw error;

        renderPageSettings(data);
    } catch (err) {
        console.error('ページ設定取得エラー:', err);
        if (listBody) {
            listBody.innerHTML = `<tr><td colspan="5" class="text-center text-danger">エラー: ${err.message}</td></tr>`;
        }
    }
}

// ページ設定のレンダリング
function renderPageSettings(pages) {
    const listBody = document.getElementById('pages-list-body');
    if (!listBody) return;

    listBody.innerHTML = '';

    if (!pages || pages.length === 0) {
        listBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">設定が見つかりません</td></tr>';
        return;
    }

    pages.forEach(page => {
        const tr = document.createElement('tr');
        const statusBadge = page.is_active
            ? '<span class="badge bg-success">有効 (ON)</span>'
            : '<span class="badge bg-danger">無効 (OFF)</span>';

        const toggleBtnClass = page.is_active ? 'btn-outline-danger' : 'btn-outline-success';
        const toggleBtnText = page.is_active ? '停止する (OFF)' : '有効化する (ON)';
        const toggleIcon = page.is_active ? '⛔' : '✅';

        tr.innerHTML = `
            <td>
                <div class="fw-bold">${page.name}</div>
                <div class="small text-muted">${page.path}</div>
            </td>
            <td>${statusBadge}</td>
            <td>
                <div class="text-muted small">${new Date(page.updated_at).toLocaleString('ja-JP')}</div>
                <div class="text-muted small" style="font-size: 0.75rem;">by ${page.updated_by || 'system'}</div>
            </td>
            <td>
                <button onclick="togglePageStatus('${page.id}', ${page.is_active}, '${page.name}')" 
                        class="btn btn-sm ${toggleBtnClass} d-flex align-items-center gap-1">
                    <span>${toggleIcon}</span> ${toggleBtnText}
                </button>
            </td>
        `;
        listBody.appendChild(tr);
    });
}

// ステータスの切り替え
async function togglePageStatus(id, currentStatus, pageName) {
    const newStatus = !currentStatus;
    const action = newStatus ? '有効化' : '停止';

    if (!confirm(`「${pageName}」を${action}しますか？\n\n停止すると、管理者以外のユーザーはアクセスできなくなります。`)) return;

    try {
        // 更新者の情報を取得
        const { data: { user } } = await supabaseClient.auth.getUser();
        const updatedBy = user ? (user.user_metadata.full_name || user.email) : 'unknown';

        const { error } = await supabaseClient
            .from('page_settings')
            .update({
                is_active: newStatus,
                updated_at: new Date().toISOString(),
                updated_by: updatedBy
            })
            .eq('id', id);

        if (error) throw error;

        // ログ記録
        await logActivity(user.user_metadata.provider_id, 'admin_edit', {
            details: {
                target: 'page_settings',
                page: pageName,
                action: action,
                new_status: newStatus
            }
        });

        // リスト再取得
        fetchPageSettings();

        // ユーザーに変更を通知（トーストなどがあれば）
        alert(`${pageName}を${action}しました。`);

    } catch (err) {
        console.error('更新エラー:', err);
        alert(`更新に失敗しました: ${err.message}`);
    }
}

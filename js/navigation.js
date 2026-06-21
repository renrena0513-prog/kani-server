// ===== 上部固定ナビゲーションバー =====

/**
 * ナビゲーションバーのHTML生成
 */
function generateTopNav(basePath = '../') {
    return `
    <nav id="site-topnav">
        <!-- ロゴ -->
        <a class="topnav-logo" href="${basePath}index.html">🦀 かに鯖</a>

        <!-- デスクトップメニュー -->
        <div class="topnav-links">
            <a class="topnav-link" href="${basePath}index.html">🏠 ホーム</a>
            <a class="topnav-link" href="${basePath}mypage/index.html">👤 マイページ</a>

            <!-- 麻雀大会 -->
            <div class="topnav-group">
                <button class="topnav-link topnav-group-btn">🀄 麻雀大会 <span class="tn-chevron">▾</span></button>
                <div class="topnav-dropdown">
                    <a class="topnav-dd-item" href="${basePath}mahjong/index.html">📊 ランキング</a>
                    <a class="topnav-dd-item" href="${basePath}mahjong/record.html">📝 記録する</a>
                    <a class="topnav-dd-item" href="${basePath}mahjong/users/index.html">👥 ユーザー一覧</a>
                    <a class="topnav-dd-item" href="${basePath}mahjong/team/index.html">🏅 チーム管理 <span id="team-notification-badge" class="topnav-badge" style="display:none;">0</span></a>
                    <a class="topnav-dd-item" href="${basePath}mahjong/team/divide.html">🧩 チーム分け</a>
                    <a class="topnav-dd-item" href="${basePath}mahjong/team/graph.html">📈 チーム戦グラフ</a>
                </div>
            </div>

            <!-- ポーカー大会 -->
            <div class="topnav-group">
                <button class="topnav-link topnav-group-btn">🃏 ポーカー大会 <span class="tn-chevron">▾</span></button>
                <div class="topnav-dropdown">
                    <a class="topnav-dd-item" href="${basePath}poker/index.html">📊 ランキング</a>
                    <a class="topnav-dd-item" href="${basePath}poker/record.html">📝 記録する</a>
                    <a class="topnav-dd-item" href="${basePath}poker/users/index.html">👥 ユーザー一覧</a>
                    <a class="topnav-dd-item" href="${basePath}poker/team/index.html">🏅 チーム管理</a>
                </div>
            </div>

            <!-- おたのしみ -->
            <div class="topnav-group">
                <button class="topnav-link topnav-group-btn">🎉 おたのしみ <span class="tn-chevron">▾</span></button>
                <div class="topnav-dropdown">
                    <a class="topnav-dd-item" href="${basePath}ranking/index.html">💰 資産ランキング</a>
                    <a class="topnav-dd-item" href="${basePath}badge/list.html">📛 バッジ一覧</a>
                    <a class="topnav-dd-item" href="${basePath}badge/shop.html">🛒 バッジショップ</a>
                    <a class="topnav-dd-item" href="${basePath}omikuji/index.html">🎋 おみくじ</a>
                    <a class="topnav-dd-item" href="${basePath}omikuji/osaisen.html">🧧 お賽銭箱</a>
                    <a class="topnav-dd-item" href="${basePath}giftcode/index.html">🎁 ギフトコード</a>
                    <a class="topnav-dd-item" href="${basePath}exchange/index.html">🔄 交換所</a>
                    <a class="topnav-dd-item" href="${basePath}event/dungeon/index.html" data-page-path="/event/dungeon/index.html">🏰 ダンジョン</a>
                </div>
            </div>

            <!-- 管理画面（管理者のみ） -->
            <a class="topnav-link admin-only" href="${basePath}admin/index.html" style="display:none;">⚙️ 管理</a>
        </div>

        <!-- ハンバーガー（モバイル） -->
        <button class="topnav-hamburger" id="topnav-hamburger" aria-label="メニュー">
            <span></span><span></span><span></span>
        </button>
    </nav>

    <!-- モバイルドロワー -->
    <div id="topnav-drawer">
        <a class="drawer-item" href="${basePath}index.html">🏠 ホーム</a>
        <a class="drawer-item" href="${basePath}mypage/index.html">👤 マイページ</a>
        <div class="drawer-group-label">🀄 麻雀大会</div>
        <a class="drawer-item drawer-sub" href="${basePath}mahjong/index.html">📊 ランキング</a>
        <a class="drawer-item drawer-sub" href="${basePath}mahjong/record.html">📝 記録する</a>
        <a class="drawer-item drawer-sub" href="${basePath}mahjong/users/index.html">👥 ユーザー一覧</a>
        <a class="drawer-item drawer-sub" href="${basePath}mahjong/team/index.html">🏅 チーム管理</a>
        <a class="drawer-item drawer-sub" href="${basePath}mahjong/team/divide.html">🧩 チーム分け</a>
        <a class="drawer-item drawer-sub" href="${basePath}mahjong/team/graph.html">📈 グラフ</a>
        <div class="drawer-group-label">🃏 ポーカー大会</div>
        <a class="drawer-item drawer-sub" href="${basePath}poker/index.html">📊 ランキング</a>
        <a class="drawer-item drawer-sub" href="${basePath}poker/record.html">📝 記録する</a>
        <a class="drawer-item drawer-sub" href="${basePath}poker/users/index.html">👥 ユーザー一覧</a>
        <a class="drawer-item drawer-sub" href="${basePath}poker/team/index.html">🏅 チーム管理</a>
        <div class="drawer-group-label">🎉 おたのしみ</div>
        <a class="drawer-item drawer-sub" href="${basePath}ranking/index.html">💰 資産ランキング</a>
        <a class="drawer-item drawer-sub" href="${basePath}badge/list.html">📛 バッジ一覧</a>
        <a class="drawer-item drawer-sub" href="${basePath}badge/shop.html">🛒 バッジショップ</a>
        <a class="drawer-item drawer-sub" href="${basePath}omikuji/index.html">🎋 おみくじ</a>
        <a class="drawer-item drawer-sub" href="${basePath}omikuji/osaisen.html">🧧 お賽銭箱</a>
        <a class="drawer-item drawer-sub" href="${basePath}giftcode/index.html">🎁 ギフトコード</a>
        <a class="drawer-item drawer-sub" href="${basePath}exchange/index.html">🔄 交換所</a>
        <a class="drawer-item drawer-sub" href="${basePath}event/dungeon/index.html" data-page-path="/event/dungeon/index.html">🏰 ダンジョン</a>
        <a class="drawer-item admin-only" href="${basePath}admin/index.html" style="display:none;">⚙️ 管理画面</a>
    </div>
    <div id="topnav-overlay"></div>
    `;
}

/**
 * ナビCSS
 */
function getTopNavStyles() {
    return `
    /* ── ナビバー本体 ── */
    #site-topnav {
        position: fixed;
        top: 0; left: 0; right: 0;
        height: 56px;
        display: flex;
        align-items: center;
        padding: 0 20px;
        gap: 8px;
        background: linear-gradient(135deg, #0d2f5c 0%, #1a4d8c 100%);
        box-shadow: 0 2px 16px rgba(0,0,0,0.4);
        z-index: 9000;
        user-select: none;
    }

    /* ロゴ */
    .topnav-logo {
        font-weight: 900;
        font-size: 1.05rem;
        color: #f0c060;
        text-decoration: none;
        white-space: nowrap;
        margin-right: 12px;
        letter-spacing: .02em;
        flex-shrink: 0;
    }
    .topnav-logo:hover { color: #ffe080; }

    /* リンク群 */
    .topnav-links {
        display: flex;
        align-items: center;
        gap: 4px;
        flex: 1;
    }

    /* 個別リンク */
    .topnav-link {
        color: rgba(255,255,255,.85);
        text-decoration: none;
        font-weight: 600;
        font-size: .88rem;
        padding: 6px 12px;
        border-radius: 8px;
        border: none;
        background: transparent;
        cursor: pointer;
        white-space: nowrap;
        transition: background .18s, color .18s;
        display: flex;
        align-items: center;
        gap: 4px;
    }
    .topnav-link:hover,
    .topnav-group:hover .topnav-group-btn {
        background: rgba(255,255,255,.12);
        color: white;
    }

    .tn-chevron {
        font-size: .75rem;
        opacity: .7;
        transition: transform .2s;
    }
    .topnav-group:hover .tn-chevron { transform: rotate(180deg); }

    /* グループ（ドロップダウン付き） */
    .topnav-group {
        position: relative;
    }
    .topnav-dropdown {
        position: absolute;
        top: 100%;
        left: 50%;
        transform: translateX(-50%);
        background: white;
        border-radius: 12px;
        box-shadow: 0 8px 32px rgba(0,0,0,.22);
        min-width: 190px;
        padding: 14px 0 6px;  /* 上部paddingで隙間をホバー範囲内に */
        display: none;
        z-index: 9100;
    }
    .topnav-group:hover .topnav-dropdown { display: block; }

    .topnav-dd-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 18px;
        color: #333;
        text-decoration: none;
        font-size: .88rem;
        font-weight: 500;
        transition: background .15s;
        white-space: nowrap;
    }
    .topnav-dd-item:hover { background: #f0f4ff; color: #1a4d8c; }

    .topnav-badge {
        background: #dc3545;
        color: white;
        font-size: .65rem;
        padding: 1px 5px;
        border-radius: 8px;
        margin-left: auto;
    }

    /* ── ハンバーガー（モバイル） ── */
    .topnav-hamburger {
        display: none;
        flex-direction: column;
        gap: 5px;
        background: none;
        border: none;
        cursor: pointer;
        padding: 6px;
        margin-left: auto;
        flex-shrink: 0;
    }
    .topnav-hamburger span {
        display: block;
        width: 22px;
        height: 2px;
        background: white;
        border-radius: 2px;
        transition: all .25s;
    }
    .topnav-hamburger.open span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
    .topnav-hamburger.open span:nth-child(2) { opacity: 0; }
    .topnav-hamburger.open span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }

    /* ── モバイルドロワー ── */
    #topnav-drawer {
        position: fixed;
        top: 56px; right: -280px;
        width: 260px;
        height: calc(100dvh - 56px);
        background: #0d2447;
        overflow-y: auto;
        z-index: 8900;
        padding: 12px 0 24px;
        transition: right .28s cubic-bezier(.4,0,.2,1);
        box-shadow: -4px 0 24px rgba(0,0,0,.3);
    }
    #topnav-drawer.open { right: 0; }

    #topnav-overlay {
        display: none;
        position: fixed;
        inset: 56px 0 0 0;
        background: rgba(0,0,0,.45);
        z-index: 8800;
    }
    #topnav-overlay.open { display: block; }

    .drawer-group-label {
        padding: 12px 20px 4px;
        font-size: .75rem;
        font-weight: 700;
        color: rgba(255,255,255,.4);
        letter-spacing: .1em;
        border-top: 1px solid rgba(255,255,255,.08);
        margin-top: 4px;
    }
    .drawer-item {
        display: block;
        padding: 11px 22px;
        color: rgba(255,255,255,.85);
        text-decoration: none;
        font-size: .9rem;
        font-weight: 500;
        transition: background .15s;
    }
    .drawer-item:hover { background: rgba(255,255,255,.08); color: white; }
    .drawer-sub { padding-left: 36px; font-size: .85rem; color: rgba(255,255,255,.65); }
    .drawer-sub:hover { color: white; }

    /* ── body の上部スペース ── */
    body { padding-top: 56px !important; }

    /* ── レスポンシブ ── */
    @media (max-width: 820px) {
        .topnav-links { display: none; }
        .topnav-hamburger { display: flex; }
    }

    /* ── 旧ドロップダウンボタンを隠す（pages側に残っていても無効化） ── */
    .nav-dropdown:not(#site-topnav) { display: none !important; }

    /* ── 通知バッジ（古いスタイル互換） ── */
    .notification-badge {
        background: #dc3545;
        color: white;
        font-size: .65rem;
        padding: 1px 5px;
        border-radius: 8px;
        margin-left: 4px;
    }
    `;
}

/**
 * ナビゲーション初期化（DOMに挿入）
 * @param {string} basePath - ルートへの相対パス（'../' or './'）
 */
function initAccordionNav(basePath = '../') {
    // CSS注入
    if (!document.getElementById('topnav-styles')) {
        const style = document.createElement('style');
        style.id = 'topnav-styles';
        style.textContent = getTopNavStyles();
        document.head.appendChild(style);
    }

    // 既存バナーがあれば除去
    document.getElementById('site-topnav')?.remove();
    document.getElementById('topnav-drawer')?.remove();
    document.getElementById('topnav-overlay')?.remove();

    // body先頭に挿入
    const wrapper = document.createElement('div');
    wrapper.innerHTML = generateTopNav(basePath);
    while (wrapper.firstChild) document.body.insertBefore(wrapper.firstChild, document.body.firstChild);

    // ハンバーガー動作
    const ham  = document.getElementById('topnav-hamburger');
    const drawer  = document.getElementById('topnav-drawer');
    const overlay = document.getElementById('topnav-overlay');
    if (ham && drawer && overlay) {
        const toggle = (open) => {
            ham.classList.toggle('open', open);
            drawer.classList.toggle('open', open);
            overlay.classList.toggle('open', open);
        };
        ham.addEventListener('click', () => toggle(!drawer.classList.contains('open')));
        overlay.addEventListener('click', () => toggle(false));
    }

    // 管理者チェック
    applyAdminNav();

    // ページON/OFF
    applyPageSettingsToNav();

    // チーム通知バッジ
    updateNavTeamBadge();
}

async function applyAdminNav() {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;
        const discordId = user.user_metadata.provider_id;
        if (typeof ADMIN_DISCORD_IDS !== 'undefined' && ADMIN_DISCORD_IDS.includes(discordId)) {
            document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
        }
    } catch(e) { console.warn('applyAdminNav:', e); }
}

async function updateNavTeamBadge() {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;
        const impersonated = localStorage.getItem('impersonated_user');
        const effectiveId = impersonated
            ? JSON.parse(impersonated).discord_user_id
            : user.user_metadata.provider_id;

        const { data: myTeams } = await supabaseClient
            .from('teams').select('id').eq('creator_discord_id', effectiveId);
        if (!myTeams || myTeams.length === 0) return;

        const { data: pending } = await supabaseClient
            .from('team_join_requests')
            .select('id')
            .in('team_id', myTeams.map(t => t.id))
            .in('status', ['pending', 'leave_pending']);

        const count = pending?.length || 0;
        if (count > 0) {
            document.querySelectorAll('#team-notification-badge, .topnav-badge').forEach(el => {
                el.textContent = count;
                el.style.display = 'inline';
            });
        }
    } catch(e) { console.warn('updateNavTeamBadge:', e); }
}

/**
 * ページ設定に応じてメニュー項目を非表示（一般ユーザーのみ）
 */
async function applyPageSettingsToNav() {
    try {
        const normalize = (path) => {
            if (!path) return '/';
            let p = String(path).split('?')[0].split('#')[0];
            if (!p.startsWith('/')) p = '/' + p;
            p = p.replace(/\/index\.html$/, '').replace(/\/+$/, '');
            return p || '/';
        };

        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;
        const discordId = user.user_metadata.provider_id;
        if (typeof ADMIN_DISCORD_IDS !== 'undefined' && ADMIN_DISCORD_IDS.includes(discordId)) return;

        const { data } = await supabaseClient.from('page_settings').select('path, is_active');
        if (!data) return;
        const settings = {};
        data.forEach(item => { settings[normalize(item.path)] = item.is_active; });

        document.querySelectorAll('[data-page-path]').forEach(link => {
            const key = normalize(link.getAttribute('data-page-path'));
            if (key && settings[key] === false) {
                link.style.display = 'none';
            }
        });
    } catch(e) { console.warn('applyPageSettingsToNav:', e); }
}

// ===== 共通ダイアログ通知 =====
function ensureNoticeModal() {
    if (document.getElementById('notice-modal')) return;
    const styleId = 'notice-modal-style';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            #notice-modal { position:fixed; inset:0; display:none; align-items:center; justify-content:center; background:rgba(0,0,0,.45); z-index:10050; }
            #notice-modal.active { display:flex; }
            .notice-dialog { width:min(92vw,420px); background:#fff; border-radius:16px; padding:18px 20px; box-shadow:0 20px 50px rgba(0,0,0,.25); }
            .notice-title { font-weight:700; margin-bottom:8px; }
            .notice-message { color:#333; font-size:.95rem; line-height:1.5; margin-bottom:14px; }
            .notice-actions { display:flex; justify-content:flex-end; }
            .notice-actions .btn { min-width:96px; }
            .notice-dialog.success .notice-title { color:#2e7d32; }
            .notice-dialog.warning .notice-title { color:#b26a00; }
            .notice-dialog.error .notice-title { color:#b3261e; }
        `;
        document.head.appendChild(style);
    }
    const modal = document.createElement('div');
    modal.id = 'notice-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.innerHTML = `
        <div class="notice-dialog info" id="notice-dialog">
            <div class="notice-title" id="notice-title">お知らせ</div>
            <div class="notice-message" id="notice-message">-</div>
            <div class="notice-actions">
                <button class="btn btn-outline-dark" type="button" onclick="closeNotice()">OK</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
}

function showNotice(message, type = 'info') {
    ensureNoticeModal();
    const modal = document.getElementById('notice-modal');
    const dialog = document.getElementById('notice-dialog');
    const title = document.getElementById('notice-title');
    const body = document.getElementById('notice-message');
    if (!modal || !dialog || !title || !body) return;
    dialog.classList.remove('success', 'warning', 'error', 'info');
    dialog.classList.add(type);
    title.textContent = type === 'success' ? '完了' : type === 'warning' ? '注意' : type === 'error' ? 'エラー' : 'お知らせ';
    body.textContent = message;
    modal.classList.add('active');
}

function closeNotice() {
    document.getElementById('notice-modal')?.classList.remove('active');
}

window.showNotice = showNotice;
window.closeNotice = closeNotice;
window.alert = (msg) => window.showNotice(String(msg || ''), 'info');

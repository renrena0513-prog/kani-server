// ===== アコーディオンナビゲーション =====
// 共通のナビゲーションメニューを生成する

/**
 * アコーディオンナビゲーションを生成
 * @param {string} basePath - 現在のページからルートへの相対パス（例: '../' or './'）
 */
function generateAccordionNav(basePath = '../') {
    // 初期状態は常に閉じている状態にする
    // const isPC = window.innerWidth >= 768; // 以前のロジック

    const navHTML = `
        <div class="nav-dropdown dropdown">
            <button class="record-button dropdown-toggle btn" type="button" id="navDropdown" data-bs-toggle="dropdown" aria-expanded="false">
                📝 メニュー
            </button>
            <ul class="dropdown-menu nav-dropdown-menu dropdown-menu-end" aria-labelledby="navDropdown" style="min-width: 260px;">
                <li><a class="dropdown-item" href="${basePath}index.html">🏠 ホームに戻る</a></li>
                <li><a class="dropdown-item" href="${basePath}mypage/index.html">👤 マイページ</a></li>
                <li><hr class="dropdown-divider"></li>
                
                <!-- 麻雀大会グループ -->
                <li class="nav-group">
                    <div class="nav-group-header" onclick="toggleNavGroup(this, event)" data-group="mahjong">
                        <span>📊 麻雀大会</span>
                        <span class="nav-chevron">▼</span>
                    </div>
                    <ul class="nav-group-items" id="nav-group-mahjong">
                        <li><a class="dropdown-item sub-item" href="${basePath}mahjong/index.html">📊 ランキング</a></li>
                        <li><a class="dropdown-item sub-item" href="${basePath}mahjong/record.html">📝 記録する</a></li>
                        <li><a class="dropdown-item sub-item" href="${basePath}mahjong/users/index.html">👥 ユーザー一覧</a></li>
                        <li><a class="dropdown-item sub-item" href="${basePath}mahjong/team/index.html"><span id="nav-team-icon" style="margin-right: 4px; display: inline-flex; align-items: center;">🏅</span> チーム管理 <span id="team-notification-badge" class="notification-badge" style="display:none;">0</span></a></li>
                        <li><a class="dropdown-item sub-item" href="${basePath}mahjong/team/divide.html">🧩 チーム分け</a></li>
                        <li><a class="dropdown-item sub-item" href="${basePath}mahjong/team/graph.html">📈 チーム戦グラフ</a></li>
                    </ul>
                </li>
                
                <!-- お楽しみグループ -->
                <li class="nav-group">
                    <div class="nav-group-header" onclick="toggleNavGroup(this, event)" data-group="fun">
                        <span>🎉 お楽しみ</span>
                        <span class="nav-chevron">▼</span>
                    </div>
                    <ul class="nav-group-items" id="nav-group-fun">
                        <li><a class="dropdown-item sub-item" href="${basePath}omikuji/index.html">🎋 おみくじ</a></li>
                        <li><a class="dropdown-item sub-item" href="${basePath}omikuji/osaisen.html">🧧 お賽銭箱</a></li>
                        <li><a class="dropdown-item sub-item" href="${basePath}ranking/index.html">💰 資産ランキング</a></li>
                        <li><a class="dropdown-item sub-item" href="${basePath}giftcode/index.html">🎁 ギフトコード</a></li>
                        <li><a class="dropdown-item sub-item" href="${basePath}badge/list.html">📛 バッジ一覧</a></li>
                        <li><a class="dropdown-item sub-item" href="${basePath}badge/shop.html">🛒 バッジショップ</a></li>
                        <li><a class="dropdown-item sub-item" href="${basePath}exchange/index.html">🔄 交換所</a></li>
                    </ul>
                </li>

                <li class="nav-group">
                    <div class="nav-group-header" onclick="toggleNavGroup(this, event)" data-group="event">
                        <span>⌛ 期間限定イベント</span>
                        <span class="nav-chevron">▼</span>
                    </div>
                    <ul class="nav-group-items" id="nav-group-event">
                        <li><a class="dropdown-item sub-item" href="${basePath}event/dungeon/index.html" data-page-path="/event/dungeon/index.html">🏰 欲望渦巻くダンジョン</a></li>
                    </ul>
                </li>
                
                <li class="admin-only" style="display:none;"><hr class="dropdown-divider"></li>
                <li class="admin-only" style="display:none;">
                    <a class="dropdown-item" href="${basePath}admin/index.html">⚙️ 管理画面</a>
                </li>
            </ul>
        </div>
    `;

    return navHTML;
}

/**
 * ナビゲーショングループを開閉
 */
function toggleNavGroup(header, event) {
    // メニューが閉じないようにイベント伝播を止める
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }

    const groupId = header.getAttribute('data-group');
    const items = document.getElementById(`nav-group-${groupId}`);
    const chevron = header.querySelector('.nav-chevron');

    if (items.classList.contains('show')) {
        items.classList.remove('show');
        chevron.classList.remove('open');
    } else {
        items.classList.add('show');
        chevron.classList.add('open');
    }
}

/**
 * アコーディオンナビ用CSS
 */
function getAccordionNavStyles() {
    return `
        /* 固定位置のナビゲーションドロップダウン */
        .nav-dropdown {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 1000;
        }

        /* 共通のメニューボタン（金色のグラデーション） */
        .record-button {
            background: linear-gradient(135deg, #d4a574 0%, #b8892d 100%) !important;
            color: white !important;
            padding: 12px 24px !important;
            border-radius: 25px !important;
            font-weight: bold !important;
            font-size: 1.1rem !important;
            box-shadow: 0 6px 20px rgba(212, 168, 83, 0.5) !important;
            transition: all 0.3s ease !important;
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
            border: none !important;
            cursor: pointer !important;
        }

        .record-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 20px rgba(212, 168, 83, 0.6) !important;
            color: white !important;
        }

        /* ドロップダウンメニューの基本スタイル */
        .nav-dropdown-menu {
            border-radius: 12px !important;
            box-shadow: 0 8px 30px rgba(0, 0, 0, 0.2) !important;
            min-width: 260px !important;
            overflow: hidden !important;
            border: none !important;
            background: white !important;
        }

        .dropdown-item {
            padding: 12px 20px !important;
            display: flex !important;
            align-items: center !important;
            gap: 10px !important;
            color: #333 !important;
            transition: background 0.2s !important;
            font-size: 1rem !important;
        }

        .dropdown-item:hover {
            background: #f5f5f5 !important;
        }

        .nav-group {
            list-style: none;
        }
        
        .nav-group-header {
            padding: 12px 20px;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            color: #333;
            font-weight: 600;
            transition: background 0.2s;
        }
        
        .nav-group-header:hover {
            background: #f5f5f5;
        }
        
        .nav-chevron {
            transition: transform 0.3s ease;
            font-size: 0.8rem;
            color: #999;
        }
        
        .nav-chevron.open {
            transform: rotate(180deg);
        }
        
        .nav-group-items {
            list-style: none;
            padding: 0;
            margin: 0;
            overflow: hidden;
            max-height: 0;
            transition: max-height 0.3s ease;
        }
        
        .nav-group-items.show {
            max-height: 500px;
        }
        
        .dropdown-item.sub-item {
            padding-left: 40px !important;
            font-size: 0.9rem !important;
            color: #555 !important;
        }
        
        .notification-badge {
            background: #dc3545;
            color: white;
            font-size: 0.7rem;
            padding: 2px 6px;
            border-radius: 10px;
            margin-left: auto;
        }
    `;
}

/**
 * ナビゲーションを初期化（DOMに挿入）
 * @param {string} containerId - ナビゲーションを挿入する要素のID（省略時は既存の.nav-dropdownを置換）
 * @param {string} basePath - ルートへの相対パス
 */
function initAccordionNav(basePath = '../') {
    // 既存のnavを置換
    const existingNav = document.querySelector('.nav-dropdown');
    if (existingNav) {
        existingNav.outerHTML = generateAccordionNav(basePath);
    }

    // CSSを追加（まだなければ）
    if (!document.getElementById('accordion-nav-styles')) {
        const style = document.createElement('style');
        style.id = 'accordion-nav-styles';
        style.textContent = getAccordionNavStyles();
        document.head.appendChild(style);
    }

    // チームアイコン更新
    updateNavTeamIcon();

    // ページON/OFF設定でメニューを制御
    applyPageSettingsToNav();
}

/**
 * メニューのチームアイコンを更新
 */
async function updateNavTeamIcon() {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;

        // なりすまし対応
        const impersonated = localStorage.getItem('impersonated_user');
        const effectiveId = impersonated ? JSON.parse(impersonated).discord_user_id : user.user_metadata.provider_id;

        const { data: profile } = await supabaseClient
            .from('profiles')
            .select('team_id, teams!team_id(logo_badge:badges!logo_badge_id(image_url))')
            .eq('discord_user_id', effectiveId)
            .single();

        if (profile && profile.teams && profile.teams.logo_badge && profile.teams.logo_badge.image_url) {
            const iconEl = document.getElementById('nav-team-icon');
            if (iconEl) {
                iconEl.innerHTML = `<img src="${profile.teams.logo_badge.image_url}" style="width: 20px; height: 20px; object-fit: contain;">`;
            }
        }
    } catch (e) {
        console.error('Menu icon update failed:', e);
    }
}

/**
 * ページ設定に応じてメニュー項目を非表示にする（一般ユーザーのみ）
 */
async function applyPageSettingsToNav() {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) return;

        const discordId = user.user_metadata.provider_id;
        if (typeof ADMIN_DISCORD_IDS !== 'undefined' && ADMIN_DISCORD_IDS.includes(discordId)) {
            return;
        }

        const CACHE_KEY = 'page_settings_cache';
        let settings = null;

        try {
            const { data, error } = await supabaseClient
                .from('page_settings')
                .select('path, is_active');
            if (error) throw error;
            if (data) {
                settings = {};
                data.forEach(item => {
                    settings[item.path] = item.is_active;
                });
                sessionStorage.setItem(CACHE_KEY, JSON.stringify({
                    timestamp: Date.now(),
                    data: settings
                }));
            }
        } catch (e) {
            const cache = sessionStorage.getItem(CACHE_KEY);
            if (cache) {
                try {
                    settings = JSON.parse(cache).data;
                } catch (parseError) {
                    settings = null;
                }
            }
        }

        if (!settings) return;

        const guardedLinks = document.querySelectorAll('[data-page-path]');
        guardedLinks.forEach(link => {
            const pathKey = link.getAttribute('data-page-path');
            if (pathKey && settings[pathKey] === false) {
                const li = link.closest('li');
                if (li) li.style.display = 'none';
            }
        });

        const eventGroup = document.getElementById('nav-group-event');
        if (eventGroup) {
            const visibleItems = Array.from(eventGroup.querySelectorAll('li'))
                .filter(item => item.style.display !== 'none');
            if (visibleItems.length === 0) {
                const groupRoot = eventGroup.closest('.nav-group');
                if (groupRoot) groupRoot.style.display = 'none';
            }
        }
    } catch (e) {
        console.warn('applyPageSettingsToNav failed:', e);
    }
}

// ===== 共通ダイアログ通知 =====
function ensureNoticeModal() {
    if (document.getElementById('notice-modal')) return;

    const styleId = 'notice-modal-style';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
            #notice-modal {
                position: fixed;
                inset: 0;
                display: none;
                align-items: center;
                justify-content: center;
                background: rgba(0, 0, 0, 0.45);
                z-index: 10050;
            }
            #notice-modal.active { display: flex; }
            .notice-dialog {
                width: min(92vw, 420px);
                background: #fff;
                border-radius: 16px;
                padding: 18px 20px;
                box-shadow: 0 20px 50px rgba(0, 0, 0, 0.25);
                border: 1px solid #eef0f3;
            }
            .notice-title { font-weight: 700; margin-bottom: 8px; }
            .notice-message { color: #333; font-size: 0.95rem; line-height: 1.5; margin-bottom: 14px; }
            .notice-actions { display: flex; justify-content: flex-end; }
            .notice-actions .btn { min-width: 96px; }
            .notice-dialog.success .notice-title { color: #2e7d32; }
            .notice-dialog.warning .notice-title { color: #b26a00; }
            .notice-dialog.error .notice-title { color: #b3261e; }
        `;
        document.head.appendChild(style);
    }

    const modal = document.createElement('div');
    modal.id = 'notice-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'notice-title');
    modal.innerHTML = `
        <div class="notice-dialog info" id="notice-dialog">
            <div class="notice-title" id="notice-title">お知らせ</div>
            <div class="notice-message" id="notice-message">-</div>
            <div class="notice-actions">
                <button class="btn btn-outline-dark" type="button" onclick="closeNotice()">OK</button>
            </div>
        </div>
    `;
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
    const modal = document.getElementById('notice-modal');
    if (modal) modal.classList.remove('active');
}

// 既存の alert を中央ダイアログに置き換え
window.showNotice = showNotice;
window.closeNotice = closeNotice;
window.alert = (msg) => window.showNotice(String(msg || ''), 'info');

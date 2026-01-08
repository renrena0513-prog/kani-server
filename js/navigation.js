// ===== アコーディオンナビゲーション =====
// 共通のナビゲーションメニューを生成する

/**
 * アコーディオンナビゲーションを生成
 * @param {string} basePath - 現在のページからルートへの相対パス（例: '../' or './'）
 */
function generateAccordionNav(basePath = '../') {
    // PC(768px以上)ではデフォルト展開、スマホでは折りたたみ
    const isPC = window.innerWidth >= 768;

    const navHTML = `
        <div class="nav-dropdown dropdown">
            <button class="record-button dropdown-toggle" type="button" id="navDropdown" data-bs-toggle="dropdown" aria-expanded="false">
                📝 メニュー
            </button>
            <ul class="dropdown-menu nav-dropdown-menu dropdown-menu-end" aria-labelledby="navDropdown" style="min-width: 260px;">
                <li><a class="dropdown-item" href="${basePath}index.html">🏠 ホームに戻る</a></li>
                <li><a class="dropdown-item" href="${basePath}mypage/index.html">👤 マイページ</a></li>
                <li><hr class="dropdown-divider"></li>
                
                <!-- 麻雀大会グループ -->
                <li class="nav-group">
                    <div class="nav-group-header" onclick="toggleNavGroup(this)" data-group="mahjong">
                        <span>📊 麻雀大会</span>
                        <span class="nav-chevron ${isPC ? 'open' : ''}">▼</span>
                    </div>
                    <ul class="nav-group-items ${isPC ? 'show' : ''}" id="nav-group-mahjong">
                        <li><a class="dropdown-item sub-item" href="${basePath}mahjong/index.html">📊 ランキング</a></li>
                        <li><a class="dropdown-item sub-item" href="${basePath}mahjong/record.html">📝 記録する</a></li>
                        <li><a class="dropdown-item sub-item" href="${basePath}mahjong/users/index.html">👥 ユーザー一覧</a></li>
                        <li><a class="dropdown-item sub-item" href="${basePath}mahjong/team/index.html">🏅 チーム管理 <span id="team-notification-badge" class="notification-badge" style="display:none;">0</span></a></li>
                    </ul>
                </li>
                
                <!-- お楽しみグループ -->
                <li class="nav-group">
                    <div class="nav-group-header" onclick="toggleNavGroup(this)" data-group="fun">
                        <span>🎉 お楽しみ</span>
                        <span class="nav-chevron ${isPC ? 'open' : ''}">▼</span>
                    </div>
                    <ul class="nav-group-items ${isPC ? 'show' : ''}" id="nav-group-fun">
                        <li class="admin-only" style="display:none;"><a class="dropdown-item sub-item" href="${basePath}omikuji/index.html">🎋 おみくじ</a></li>
                        <li><a class="dropdown-item sub-item" href="${basePath}ranking/index.html">💰 資産ランキング</a></li>
                        <li><a class="dropdown-item sub-item" href="${basePath}badge/list.html">📛 バッジ一覧</a></li>
                        <li><a class="dropdown-item sub-item" href="${basePath}badge/shop.html">🛒 バッジショップ</a></li>
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
function toggleNavGroup(header) {
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
        .nav-group {
            list-style: none;
        }
        
        .nav-group-header {
            padding: 10px 20px;
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
            padding-left: 40px;
            font-size: 0.9rem;
            color: #555;
        }
        
        .dropdown-item.sub-item:hover {
            background: #f0f0f0;
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
}

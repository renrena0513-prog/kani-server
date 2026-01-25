// 認証ガード & ページアクセス制御
(async function () {
    const CACHE_KEY = 'page_settings_cache';
    const CACHE_TTL = 60 * 1000; // 60秒

    // 認証不要のページ設定（既存ロジック維持）
    const publicPages = ['/login']; // mahjong/index.htmlなども本来はpublicだが、アクセス制限の対象になりうるため一旦ここで判定しない
    const isLoginPage = window.location.pathname.includes('/login');

    // 1. ユーザーセッション取得
    const { data: { session } } = await supabaseClient.auth.getSession();
    const user = session?.user;

    // 2. 管理者判定
    let isAdmin = false;
    if (user) {
        // supabase-config.js の ADMIN_DISCORD_IDS を参照、または user_metadata から判定
        // ここでは supabase-config.js が読み込まれている前提
        const discordId = user.user_metadata.provider_id;
        if (typeof ADMIN_DISCORD_IDS !== 'undefined' && ADMIN_DISCORD_IDS.includes(discordId)) {
            isAdmin = true;
        }
    }

    // 3. ページアクセス制限チェック (管理者以外のみ)
    if (!isAdmin) {
        await checkPageAccess();
    }

    // 4. 通常の認証ガード (未ログインユーザーのリダイレクト)
    // ログインページなら何もしない
    if (isLoginPage) return;

    // パブリックページ判定（ここはサイトの仕様に合わせて調整）
    // 例: /mahjong/index.html はログイン不要だが、上記チェックでブロックされる可能性がある
    // ここでは「アクセス制限を通過した」上で「ログインが必要かどうか」を問う
    const isPublicPage = publicPages.some(page => window.location.pathname.includes(page)) ||
        window.location.pathname.includes('/mahjong/index.html'); // 特例: ランキングは誰でも見れる

    if (!session && !isPublicPage) {
        // 未認証の場合、現在のURLを保存してログインページにリダイレクト
        const currentPath = window.location.pathname + window.location.search;
        sessionStorage.setItem('returnUrl', currentPath);
        redirectToLogin();
    }

    // --- 関数定義 ---

    async function checkPageAccess() {
        const currentPath = window.location.pathname;
        let settings = getCachedSettings();

        // キャッシュがない、または期限切れなら取得
        if (!settings) {
            try {
                const { data, error } = await supabaseClient
                    .from('page_settings')
                    .select('path, is_active');

                if (data) {
                    settings = {};
                    data.forEach(item => {
                        settings[item.path] = item.is_active;
                    });
                    saveSettingsCache(settings);
                }
            } catch (e) {
                console.error('Page settings fetch error:', e);
                // エラー時は安全側に倒す（ブロックしない、あるいはキャッシュがあればそれを使う）
                return;
            }
        }

        // ブロック判定
        // settingsのキー（例: "/mahjong/"）が現在のパスに含まれているか確認
        if (settings) {
            for (const [pathKey, isActive] of Object.entries(settings)) {
                if (currentPath.includes(pathKey) && isActive === false) {
                    showMaintenanceScreen();
                    throw new Error('Maintenance Mode'); // 処理を中断
                }
            }
        }
    }

    function getCachedSettings() {
        const cache = sessionStorage.getItem(CACHE_KEY);
        if (!cache) return null;

        try {
            const parsed = JSON.parse(cache);
            if (Date.now() - parsed.timestamp < CACHE_TTL) {
                return parsed.data;
            }
        } catch (e) {
            return null;
        }
        return null;
    }

    function saveSettingsCache(data) {
        const cache = {
            timestamp: Date.now(),
            data: data
        };
        sessionStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    }

    function showMaintenanceScreen() {
        // 既存のコンテンツを隠す
        document.body.style.overflow = 'hidden';

        const overlay = document.createElement('div');
        overlay.id = 'maintenance-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, #2d3436 0%, #000000 100%);
            color: #fff;
            z-index: 99999;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
            font-family: sans-serif;
        `;

        overlay.innerHTML = `
            <div style="font-size: 4rem; margin-bottom: 20px;">🚧</div>
            <h1 style="font-size: 2rem; margin-bottom: 20px; font-weight: bold;">ただいまアップデート準備中です</h1>
            <p style="font-size: 1rem; color: #b2bec3; margin-bottom: 30px;">
                現在、この機能はメンテナンスのためアクセスできません。<br>
                完了までしばらくお待ちください。
            </p>
            <a href="/" onclick="window.location.href = window.location.origin; return false;" 
               style="padding: 10px 20px; background: #0984e3; color: white; text-decoration: none; border-radius: 5px; font-weight: bold; transition: opacity 0.3s;">
                ホームに戻る
            </a>
        `;

        document.body.appendChild(overlay);

        // ローディングなどを消す
        const loading = document.getElementById('loading');
        if (loading) loading.style.display = 'none';

        // ReactやVueなどのマウントを破壊しないように、単純にoverlayを被せる形式にする
        // ただし、もしセンシティブなデータが見えてはいけないので、main-contentがあれば隠す
        const adminContent = document.getElementById('admin-content');
        if (adminContent) adminContent.style.display = 'none';
    }

    function redirectToLogin() {
        const isLocal = window.location.protocol === 'file:';
        if (isLocal) {
            const path = window.location.pathname;
            const subdirs = ['/admin/', '/mahjong/', '/mypage/', '/badge/', '/omikuji/', '/poker/'];
            const isSubdir = subdirs.some(dir => path.includes(dir));
            // 深さに応じて調整が必要だが、簡易的に
            window.location.href = isSubdir ? '../login/index.html' : 'login/index.html';
        } else {
            window.location.href = '/login/index.html';
        }
    }
})();

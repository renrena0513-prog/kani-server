// 認証ガード - 全ページで認証状態をチェック
(async function () {
    // ログインページ自体は除外
    if (window.location.pathname.includes('/login')) {
        return;
    }

    try {
        const { data: { session } } = await supabaseClient.auth.getSession();

        if (!session) {
            // 未認証の場合、現在のURLを保存してログインページにリダイレクト
            const currentPath = window.location.pathname + window.location.search;
            sessionStorage.setItem('returnUrl', currentPath);
            redirectToLogin();
        }
    } catch (error) {
        console.error('Auth check error:', error);
        // エラーが発生した場合もログインページへ
        redirectToLogin();
    }
})();

function redirectToLogin() {
    const isLocal = window.location.protocol === 'file:';
    if (isLocal) {
        // ローカル環境(file://)の場合、階層に応じてログインページを探す
        // /admin/, /mahjong/, /mypage/, /badge/, /omikuji/ などのサブディレクトリにいる場合は上に戻る
        const path = window.location.pathname;
        const subdirs = ['/admin/', '/mahjong/', '/mypage/', '/badge/', '/omikuji/'];
        const isSubdir = subdirs.some(dir => path.includes(dir));
        window.location.href = isSubdir ? '../login/index.html' : 'login/index.html';
    } else {
        // 本番環境(Vercelなど)の場合は絶対パス
        window.location.href = '/login/index.html';
    }
}

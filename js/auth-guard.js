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
            window.location.href = '/login/index.html';
        }
    } catch (error) {
        console.error('Auth check error:', error);
        // エラーが発生した場合もログインページへ
        window.location.href = '/login/index.html';
    }
})();

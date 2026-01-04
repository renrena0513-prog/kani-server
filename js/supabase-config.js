// Supabase 設定
const SUPABASE_URL = 'https://hbkacwpvnyqzsdzqphmy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_938ml0_pzLebwIZ2eZckTw_bzu1eu4A';

// ===== 管理者設定 =====
const ADMIN_DISCORD_IDS = [
    '666909228300107797' // nameless
];

// Supabase クライアント初期化
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== 認証機能 =====

// Discord でログイン
async function loginWithDiscord() {
    const { data, error } = await supabaseClient.auth.signInWithOAuth({
        provider: 'discord',
        options: {
            redirectTo: window.location.origin + window.location.pathname
        }
    });
    if (error) {
        console.error('ログインエラー:', error.message);
    }
}

// ログアウト
async function logout() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
        console.error('ログアウトエラー:', error.message);
    }
    window.location.reload();
}

// 現在のユーザー情報を取得
async function getCurrentUser() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    return user;
}

// ユーザー情報を画面に表示
async function displayUserInfo() {
    const user = await getCurrentUser();
    const userInfoElement = document.getElementById('user-info');
    const loginButton = document.getElementById('login-button');
    const logoutButton = document.getElementById('logout-button');

    const adminButton = document.querySelector('.admin-button');

    if (user) {
        // ログイン済み
        const discordUser = user.user_metadata;
        const discordId = discordUser.provider_id;

        // プロフィール情報の同期（非同期で実行）
        const syncProfile = async () => {
            const avatarUrl = discordUser.avatar_url || discordUser.picture || '';
            const fullName = discordUser.full_name || discordUser.name || 'ユーザー';

            // 既存のプロフィールを確認
            const { data: existing } = await supabaseClient
                .from('profiles')
                .select('nickname')
                .eq('discord_account', fullName)
                .single();

            // ニックネームが未設定の場合のみ初期値を入れる（upsertで上書きされないように制御）
            await supabaseClient.from('profiles').upsert({
                discord_account: fullName,
                avatar_url: avatarUrl,
                updated_at: new Date().toISOString()
            });
        };


        syncProfile();

        // 管理者ボタンの表示制御
        if (adminButton) {
            if (ADMIN_DISCORD_IDS.includes(discordId)) {
                adminButton.style.display = 'block';
            } else {
                adminButton.style.display = 'none';
            }
        }

        if (userInfoElement) {
            // パスの調整：ルート(index.html)から呼ぶ場合は mypage/...、サブフォルダ(admin/等)からの場合は ../mypage/...
            const isRoot = !window.location.pathname.includes('/admin/') &&
                !window.location.pathname.includes('/mahjong/') &&
                !window.location.pathname.includes('/poker/') &&
                !window.location.pathname.includes('/mypage/');
            const mypagePath = isRoot ? 'mypage/index.html' : '../mypage/index.html';

            // Supabaseが提供するavatar_urlを直接使用
            const avatarUrl = discordUser.avatar_url || discordUser.picture || '';
            // アイコンとユーザー名をマイページリンクにする
            userInfoElement.innerHTML = `
                <a href="${mypagePath}" style="display: flex; align-items: center; text-decoration: none; color: inherit;">

                    <img src="${avatarUrl}" 
                         alt="アバター" 
                         style="width: 40px; height: 40px; border-radius: 50%; margin-right: 10px; cursor: pointer;"
                         onerror="this.style.display='none'">
                    <span>${discordUser.full_name || discordUser.name || 'ユーザー'}</span>
                </a>
            `;
            userInfoElement.style.display = 'flex';
        }
        if (loginButton) loginButton.style.display = 'none';
        // ホームではログアウトボタンを非表示
        if (logoutButton) logoutButton.style.display = 'none';

        // マイページボタンは非表示（アイコンで代替）
        const mypageLink = document.getElementById('mypage-link');
        if (mypageLink) mypageLink.style.display = 'none';
    } else {
        // 未ログイン
        if (adminButton) adminButton.style.display = 'none';
        if (userInfoElement) userInfoElement.style.display = 'none';
        if (loginButton) loginButton.style.display = 'inline-block';
        if (logoutButton) logoutButton.style.display = 'none';

        // マイページリンク非表示
        const mypageLink = document.getElementById('mypage-link');
        if (mypageLink) mypageLink.style.display = 'none';
    }
}

// ページ読み込み時にユーザー情報を確認
document.addEventListener('DOMContentLoaded', () => {
    displayUserInfo();
});

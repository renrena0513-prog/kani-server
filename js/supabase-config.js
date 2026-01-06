// Supabase 設定
const SUPABASE_URL = 'https://hbkacwpvnyqzsdzqphmy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_938ml0_pzLebwIZ2eZckTw_bzu1eu4A';

// ===== 管理者設定 =====
const ADMIN_DISCORD_IDS = [
    '666909228300107797' // nameless
];

// Supabase クライアント初期化
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Discord Webhook URL
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1458091853713772708/tXp5Ahcvzc6I0MXc4XlZLbq--tEwUSf1AT5ZVtodgDsXQBqnOKsi6I6YWhKdDXyKpWWk';

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
    // なりすまし実行中かチェック
    const impersonatedUser = localStorage.getItem('admin_impersonate_user');
    if (impersonatedUser) {
        try {
            const userData = JSON.parse(impersonatedUser);
            // Supabaseのユーザーオブジェクトに近い構造を返す（user_metadataにデータを詰め込む）
            return {
                id: 'impersonated',
                user_metadata: {
                    provider_id: userData.discord_user_id,
                    full_name: userData.name,
                    name: userData.name,
                    avatar_url: userData.avatar_url,
                    is_impersonated: true
                },
                is_impersonated: true
            };
        } catch (e) {
            console.error("なりすましデータのパースに失敗しました:", e);
            localStorage.removeItem('admin_impersonate_user');
        }
    }

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

        // なりすましバナーの表示
        const impersonatedUserJson = localStorage.getItem('admin_impersonate_user');
        if (impersonatedUserJson) {
            document.body.classList.add('user-impersonating');
            if (!document.getElementById('impersonation-banner')) {
                try {
                    const impersonatedUser = JSON.parse(impersonatedUserJson);
                    const banner = document.createElement('div');
                    banner.id = 'impersonation-banner';
                    banner.className = 'impersonation-banner bg-warning text-dark px-3 py-2 text-center shadow-sm';
                    banner.innerHTML = `
                        <div class="d-flex align-items-center justify-content-center flex-wrap">
                            <span class="me-3 fw-bold">👑 ${impersonatedUser.name || 'ユーザー'} として操作中 (管理者権限)</span>
                            <button onclick="stopImpersonation()" class="btn btn-sm btn-outline-dark fw-bold">なりすましを終了</button>
                        </div>
                    `;
                    document.body.prepend(banner);
                } catch (e) {
                    console.error("Banner display error:", e);
                }
            }
        } else {
            document.body.classList.remove('user-impersonating');
        }

        // プロフィール情報の同期（非同期で実行）
        const syncProfile = async () => {
            const avatarUrl = discordUser.avatar_url || discordUser.picture || '';
            const discordUserId = discordUser.provider_id || discordId;

            // Discordの表示名 (Global Name) を優先取得、なければ full_name
            const discordDisplayName = discordUser.custom_claims?.global_name || discordUser.full_name || discordUser.name;

            // 既存のプロフィールを確認
            const { data: existing } = await supabaseClient
                .from('profiles')
                .select('account_name')
                .eq('discord_user_id', discordUserId)
                .maybeSingle();

            const profileData = {
                discord_user_id: discordUserId,
                avatar_url: avatarUrl,
                updated_at: new Date().toISOString()
            };

            // 【初回のみ】DBにまだデータがない場合だけ、Discordの表示名をアカウント名として設定
            if (!existing) {
                profileData.account_name = discordDisplayName;
            }

            const { error } = await supabaseClient.from('profiles').upsert(profileData);
            if (error) {
                console.error('Profile sync error:', error);
            } else {
                console.log('Profile synced successfully:', discordUserId);
            }
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

// なりすましを終了
function stopImpersonation() {
    localStorage.removeItem('admin_impersonate_user');
    window.location.reload();
}

// ページ読み込み時にユーザー情報を確認
document.addEventListener('DOMContentLoaded', () => {
    displayUserInfo();
});

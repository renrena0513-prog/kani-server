// Supabase 設定
const SUPABASE_URL = 'https://hbkacwpvnyqzsdzqphmy.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_938ml0_pzLebwIZ2eZckTw_bzu1eu4A';

// ===== 管理者設定 =====
const ADMIN_DISCORD_IDS = [
    '666909228300107797' // nameless
];

// ===== Discord 通知設定 =====
const DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/1458091853713772708/tXp5Ahcvzc6I0MXc4XlZLbq--tEwUSf1AT5ZVtodgDsXQBqnOKsi6I6YWhKdDXyKpWWk';

// Supabase クライアント初期化
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== なりすまし機能 =====

// なりすまし中かどうかを確認
function isImpersonating() {
    const data = localStorage.getItem('admin_impersonate_user');
    return data !== null;
}

// なりすまし中のユーザー情報を取得
function getImpersonatedUser() {
    const data = localStorage.getItem('admin_impersonate_user');
    if (data) {
        try {
            return JSON.parse(data);
        } catch (e) {
            return null;
        }
    }
    return null;
}

// 有効なユーザーIDを取得（なりすまし中ならなりすましユーザー、そうでなければ自分）
async function getEffectiveUserId() {
    const impersonated = getImpersonatedUser();
    if (impersonated) {
        return impersonated.discord_user_id;
    }
    const user = await getCurrentUser();
    return user?.user_metadata?.provider_id || null;
}

// なりすましを終了
function stopImpersonation() {
    localStorage.removeItem('admin_impersonate_user');
    window.location.reload();
}

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
    // なりすまし中もクリア
    localStorage.removeItem('admin_impersonate_user');
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

    // なりすまし中の処理
    const impersonated = getImpersonatedUser();

    if (user) {
        // ログイン済み
        const discordUser = user.user_metadata;
        const discordId = discordUser.provider_id;

        // プロフィール情報の同期（非同期で実行）- なりすまし中は同期しない
        if (!impersonated) {
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
        }

        // 管理者関連の表示制御（なりすまし中も管理者なら表示）
        const adminElements = document.querySelectorAll('.admin-only');
        if (ADMIN_DISCORD_IDS.includes(discordId)) {
            if (adminButton) adminButton.style.display = 'block';
            adminElements.forEach(el => el.style.setProperty('display', 'block', 'important'));
        } else {
            if (adminButton) adminButton.style.display = 'none';
            adminElements.forEach(el => el.style.display = 'none');
        }

        if (userInfoElement) {
            // パスの調整：ルート(index.html)から呼ぶ場合は mypage/...、サブフォルダ(admin/等)からの場合は ../mypage/...
            const isRoot = !window.location.pathname.includes('/admin/') &&
                !window.location.pathname.includes('/mahjong/') &&
                !window.location.pathname.includes('/poker/') &&
                !window.location.pathname.includes('/mypage/');
            const mypagePath = isRoot ? 'mypage/index.html' : '../mypage/index.html';

            // なりすまし中の表示
            if (impersonated) {
                userInfoElement.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <a href="${mypagePath}?user=${impersonated.discord_user_id}" style="display: flex; align-items: center; text-decoration: none; color: inherit;">
                            <img src="${impersonated.avatar_url || ''}" 
                                 alt="アバター" 
                                 style="width: 40px; height: 40px; border-radius: 50%; margin-right: 10px; cursor: pointer; border: 3px solid #ffc107;"
                                 onerror="this.style.display='none'">
                            <span style="color: #ffc107; font-weight: bold;">🎭 ${impersonated.name || 'ユーザー'}</span>
                        </a>
                        <button onclick="stopImpersonation()" 
                                style="background: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 0.8rem;">
                            終了
                        </button>
                    </div>
                `;
            } else {
                // 通常の表示
                const avatarUrl = discordUser.avatar_url || discordUser.picture || '';
                userInfoElement.innerHTML = `
                    <a href="${mypagePath}" style="display: flex; align-items: center; text-decoration: none; color: inherit;">
                        <img src="${avatarUrl}" 
                             alt="アバター" 
                             style="width: 40px; height: 40px; border-radius: 50%; margin-right: 10px; cursor: pointer;"
                             onerror="this.style.display='none'">
                        <span>${discordUser.full_name || discordUser.name || 'ユーザー'}</span>
                    </a>
                `;
            }
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

// ===== 活動ログシステム =====

/**
 * 活動ログを記録する
 * @param {string} userId - ユーザーID
 * @param {string} actionType - アクションタイプ ('mahjong', 'transfer_send', 'transfer_receive', 'badge_transfer', 'badge_receive', 'badge_sell', 'badge_purchase', 'omikuji', 'revenue_share')
 * @param {Object} options - オプション
 * @param {number} options.amount - 金額または数量
 * @param {string} options.badgeId - バッジID（バッジ関連の場合）
 * @param {string} options.targetUserId - 相手ユーザーID（送金・譲渡の場合）
 * @param {string} options.matchId - マッチID（麻雀記録の場合）
 * @param {Object} options.details - その他詳細情報
 */
async function logActivity(userId, actionType, options = {}) {
    try {
        const logData = {
            user_id: userId,
            action_type: actionType,
            amount: options.amount || null,
            badge_id: options.badgeId || null,
            target_user_id: options.targetUserId || null,
            match_id: options.matchId || null,
            details: options.details || null
        };

        const { error } = await supabaseClient
            .from('activity_logs')
            .insert([logData]);

        if (error) {
            console.error('Activity log error [Supabase]:', error.message, 'Data:', logData);
        }

    } catch (err) {
        console.error('Failed to log activity:', err);
    }
}

/**
 * 総資産（total_assets）を加算する（収入時のみ呼び出す）
 * @param {string} userId - ユーザーID
 * @param {number} amount - 加算する金額
 */
async function addToTotalAssets(userId, amount) {
    if (amount <= 0) return;

    try {
        const { data: profile, error: fetchError } = await supabaseClient
            .from('profiles')
            .select('total_assets')
            .eq('discord_user_id', userId)
            .maybeSingle();

        if (fetchError) {
            console.error('Fetch total_assets error:', fetchError);
            return;
        }

        const currentTotal = profile?.total_assets || 0;
        const { error: updateError } = await supabaseClient
            .from('profiles')
            .update({ total_assets: currentTotal + amount })
            .eq('discord_user_id', userId);

        if (updateError) {
            console.error('Update total_assets error:', updateError);
        }
    } catch (err) {
        console.error('Failed to update total_assets:', err);
    }
}

/**
 * JSTで今日の0時を取得（日本時間の0時にリセットするための基準値）
 * @returns {Date} JSTの当日0時を指す Date オブジェクト
 */
function getJSTMidnight() {
    const now = new Date();
    // 日本時間での「YYYY-MM-DD」を取得（en-CAロケールは YYYY-MM-DD 形式を返すため利用）
    const jstDate = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' });
    // その日付の 00:00:00 JST (+09:00) のインスタンスを作成
    return new Date(`${jstDate}T00:00:00+09:00`);
}

/**
 * 今日（JST）既におみくじを実行したかどうかをチェック
 * @param {string} lastOmikujiAt - 最後のおみくじ実行時刻（ISO文字列）
 * @returns {boolean} 今日既に実行済みならtrue
 */
function hasDrawnOmikujiToday(lastOmikujiAt) {
    if (!lastOmikujiAt) return false;

    const lastDraw = new Date(lastOmikujiAt);
    const todayMidnight = getJSTMidnight();

    return lastDraw >= todayMidnight;
}

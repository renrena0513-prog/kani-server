        let isViewMode = false;
        let targetId = null;
        let allProfiles = []; // 全ユーザーのプロファイルリスト
        let rarityThresholds = []; // レアリティ境界データ

        /**
         * ページ初期化
         */
        async function initPage() {
            const urlParams = new URLSearchParams(window.location.search);
            const urlUserId = urlParams.get('user');

            // 全ユーザー情報を取得（名前解決用）
            const [profilesRes, thresholdsRes] = await Promise.all([
                supabaseClient.from('profiles').select('discord_user_id, account_name, avatar_url, coins, is_hidden'),
                supabaseClient.from('rarity_thresholds').select('*').order('threshold_value', { ascending: true })
            ]);
            if (profilesRes.data) allProfiles = profilesRes.data;
            if (thresholdsRes.data) rarityThresholds = thresholdsRes.data;

            const user = await getCurrentUser();
            const myId = user?.user_metadata?.provider_id;

            // なりすまし中のユーザー情報を取得
            const impersonated = getImpersonatedUser();
            const effectiveId = impersonated ? impersonated.discord_user_id : myId;

            // URLパラメータがある場合
            if (urlUserId) {
                targetId = urlUserId;
                // 自分でもなりすまし対象でもない場合は閲覧モード
                if (urlUserId !== myId && urlUserId !== (impersonated?.discord_user_id)) {
                    isViewMode = true;
                } else {
                    isViewMode = false;
                }
            } else {
                // URLパラメータがない場合は有効なユーザーID（なりすまし優先）
                targetId = effectiveId;
                isViewMode = false;
            }

            // 非表示ユーザーは一覧から除外（自分自身は除外しない）
            if (allProfiles.length > 0) {
                allProfiles = allProfiles.filter(p => !p.is_hidden || p.discord_user_id === targetId);
            }

            // UIの基本表示切り替え
            setupUI();

            // データの読み込み
            if (isViewMode) {
                await loadTargetUserInfo();
            } else {
                if (user) {
                    await displayMyInfo(user);
                } else {
                    showLoginPrompt();
                    return;
                }
            }

            // 麻雀統計の読み込み（共有ロジック）
            await loadMahjongStats();

            // ポーカー統計の読み込み
            await loadPokerStats();

            // バッジコレクションの読み込み
            await loadOwnedBadges();

            // 販売実績の読み込み
            await loadRevenueStats();

            // 最近の活動の読み込み
            await loadActivityLogs();
        }

        function setupUI() {
            const loginPrompt = document.getElementById('login-prompt');
            const profileContent = document.getElementById('profile-content');
            const viewArea = document.getElementById('view-area');
            const syncBtn = document.getElementById('sync-btn');
            const pageTitleLabel = document.getElementById('page-title-label');
            const pageHeader = document.querySelector('.page-header');
            const nicknameEditBtn = document.getElementById('nickname-edit-btn');

            if (profileContent) profileContent.style.display = 'block';
            if (loginPrompt) loginPrompt.style.display = 'none';

            if (isViewMode) {
                // 閲覧モード設定
                if (viewArea) viewArea.style.display = 'block';
                if (syncBtn) syncBtn.style.display = 'none';
                if (pageTitleLabel) pageTitleLabel.style.display = 'block';
                if (pageHeader) pageHeader.textContent = '👤 プレイヤープロフィール';
                if (nicknameEditBtn) nicknameEditBtn.style.display = 'none';
            } else {
                // マイページ設定
                if (viewArea) viewArea.style.display = 'none';
                if (syncBtn) syncBtn.style.display = 'inline-block';
                if (pageTitleLabel) pageTitleLabel.style.display = 'none';
                if (pageHeader) pageHeader.textContent = '👤 マイページ';
                if (nicknameEditBtn) nicknameEditBtn.style.display = 'inline-block';
                const coinTransferBtn = document.getElementById('coin-transfer-btn');
                if (coinTransferBtn) coinTransferBtn.style.display = 'inline-block';
                const possessionsBtn = document.getElementById('possessions-btn');
                if (possessionsBtn) possessionsBtn.style.display = 'inline-block';
            }
        }

        function showLoginPrompt() {
            document.getElementById('login-prompt').style.display = 'block';
            document.getElementById('profile-content').style.display = 'none';
        }

        function showNotice(message, type = 'info') {
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

        function renderExchangeTickets(tickets) {
            const container = document.getElementById('exchange-tickets-list');
            if (!container) return;

            const entries = Object.entries(tickets || {}).filter(([, count]) => (count || 0) > 0);
            if (entries.length === 0) {
                container.innerHTML = '';
                return;
            }

            container.innerHTML = entries.map(([rarity, count]) => `
                <div class="col-6 mb-2">
                    <div class="card shadow-sm border-0 ${getRarityClass(rarity)} p-2 text-center" style="border-radius: 10px;">
                        <div class="small fw-bold opacity-75">${rarity}引換券</div>
                        <div class="fw-bold">${count}枚</div>
                    </div>
                </div>
            `).join('');
        }

        /**
         * 装備中バッジにミュータントエフェクトを適用
         */
        async function applyMutantEffect(containerId, badgeId, userId) {
            if (window.MutantBadge && typeof window.MutantBadge.applyEffect === 'function') {
                await window.MutantBadge.applyEffect(containerId, badgeId, userId);
                return;
            }

            const container = document.getElementById(containerId);
            if (!container || !badgeId || !userId) return;

            try {
                const { data } = await supabaseClient
                    .from('user_badges_new')
                    .select('uuid')
                    .eq('user_id', userId)
                    .eq('badge_id', badgeId)
                    .eq('is_mutant', true)
                    .limit(1);

                const isMutant = data && data.length > 0;
                container.classList.toggle('active', isMutant);
            } catch (err) {
                console.error('Mutant effect check failed:', err);
            }
        }

        /**
         * 自分（またはなりすましユーザー）の情報を表示
         */
        async function displayMyInfo(user) {
            const discordUser = user.user_metadata;
            const impersonated = getImpersonatedUser();

            // ユーザー情報の取得（バッジ情報・コイン・チーム情報を含む）
            const { data: profile } = await supabaseClient
                .from('profiles')
                .select('account_name, avatar_url, coins, total_assets, gacha_tickets, exchange_tickets, tip, equipped_badge_id, equipped_badge_id_right, team_id, badges!equipped_badge_id(image_url, name), badges_right:badges!equipped_badge_id_right(image_url, name), teams!team_id(team_name, logo_badge:badges!logo_badge_id(image_url))')
                .eq('discord_user_id', targetId)
                .maybeSingle();

            // allProfiles にも最新情報を同期
            if (profile) {
                const pIdx = allProfiles.findIndex(p => p.discord_user_id === targetId);
                if (pIdx !== -1) {
                    allProfiles[pIdx] = { ...allProfiles[pIdx], ...profile };
                }
            }

            // アバター（なりすまし中はDBから、そうでなければDiscord）
            const avatarUrl = impersonated
                ? (profile?.avatar_url || 'https://ui-avatars.com/api/?name=?&background=1a4d8c&color=fff&size=150')
                : (discordUser.avatar_url || 'https://ui-avatars.com/api/?name=?&background=1a4d8c&color=fff&size=150');
            document.getElementById('user-avatar').src = avatarUrl;

            // 名前（なりすまし中はなりすましユーザー名を優先）
            const name = impersonated
                ? (impersonated.name || profile?.account_name || 'ユーザー')
                : (profile?.account_name || discordUser.full_name || discordUser.name || 'ユーザー');
            const coins = profile?.coins || 0;

            // 名前のみ表示（バッジは別要素）
            document.getElementById('user-name').textContent = name;

            // チーム名とアイコンを表示
            const team = profile?.teams;
            const teamName = team?.team_name || '未所属';
            let logoHtml = '🏠 ';
            if (team && team.logo_badge && team.logo_badge.image_url) {
                logoHtml = `<img src="${team.logo_badge.image_url}" alt="logo" style="width: 20px; height: 20px; object-fit: contain; margin-right: 4px;"> `;
            }

            const teamDisplayEl = document.getElementById('user-team-display');
            if (teamDisplayEl) {
                const badgeEl = teamDisplayEl.querySelector('.badge');
                if (badgeEl) {
                    badgeEl.innerHTML = `${logoHtml}<span id="user-team-name">${teamName}</span>`;
                }
            } else {
                // Fallback
                const teamNameEl = document.getElementById('user-team-name');
                if (teamNameEl) teamNameEl.textContent = teamName;
            }

            // ポーカーチームを取得して表示
            (async () => {
                const { data: pokerProfile } = await supabaseClient
                    .from('poker_profiles')
                    .select('team_id, poker_teams!team_id(team_name, icon_url)')
                    .eq('discord_user_id', targetId)
                    .maybeSingle();
                const pokerTeam = pokerProfile?.poker_teams;
                if (pokerTeam) {
                    const el = document.getElementById('user-poker-team-display');
                    if (el) {
                        const badgeEl = el.querySelector('.badge');
                        let logoHtml = '🃏 ';
                        if (pokerTeam.icon_url) {
                            logoHtml = `<img src="${pokerTeam.icon_url}" alt="poker logo" style="width:20px;height:20px;object-fit:contain;margin-right:4px;border-radius:3px;"> `;
                        }
                        badgeEl.innerHTML = `${logoHtml}<span>${pokerTeam.team_name}</span>`;
                        el.style.display = '';
                    }
                }
            })();

            // 左バッジ画像を設定
            const badgeImg = document.getElementById('user-equipped-badge');
            const badge = profile?.badges;
            if (badgeImg && badge) {
                badgeImg.src = badge.image_url;
                badgeImg.title = badge.name;
                badgeImg.style.display = 'block';
                applyMutantEffect('badge-container-left', profile.equipped_badge_id, targetId);
            } else if (badgeImg) {
                badgeImg.style.display = 'none';
                applyMutantEffect('badge-container-left', null, null);
            }

            // 右バッジ画像を設定
            const badgeImgRight = document.getElementById('user-equipped-badge-right');
            const badgeRight = profile?.badges_right;
            if (badgeImgRight && badgeRight) {
                badgeImgRight.src = badgeRight.image_url;
                badgeImgRight.title = badgeRight.name;
                badgeImgRight.style.display = 'block';
                applyMutantEffect('badge-container-right', profile.equipped_badge_id_right, targetId);
            } else if (badgeImgRight) {
                badgeImgRight.style.display = 'none';
                applyMutantEffect('badge-container-right', null, null);
            }



            // コイン表示の更新
            const coinsDisplay = document.getElementById('user-coins-display');
            const coinsValue = document.getElementById('user-coins-value');
            const totalAssetsValue = document.getElementById('total-assets-value');
            const ticketsValue = document.getElementById('user-tickets-value');
            if (coinsDisplay && coinsValue) {
                coinsValue.textContent = coins.toLocaleString();
                // 総資産は loadBadgeCollection で計算後に更新される（ここでは設定しない）
                if (totalAssetsValue) {
                    totalAssetsValue.textContent = '-';
                }
                if (ticketsValue) {
                    ticketsValue.textContent = (profile?.gacha_tickets || 0).toLocaleString();
                }
                coinsDisplay.style.display = 'block';
            }

            // チップ（tip）表示
            const chipsVal = document.getElementById('user-chips-value');
            if (chipsVal) chipsVal.textContent = (profile?.tip || 0).toLocaleString();

            // ニックネーム編集ボタンを表示
            const nicknameEditBtn = document.getElementById('nickname-edit-btn');
            if (nicknameEditBtn) {
                nicknameEditBtn.style.display = 'inline-block';
            }

            if (profile?.account_name) {
                document.getElementById('user-nickname').value = profile.account_name;
            }
        }

        // ニックネーム編集モーダルを開く
        function openNicknameModal() {
            const modalEl = document.getElementById('nicknameModal');
            const modal = new bootstrap.Modal(modalEl);
            modal.show();
        }

        /**
         * 他人の情報を取得して表示
         */
        async function loadTargetUserInfo() {
            const { data: profile, error } = await supabaseClient
                .from('profiles')
                .select('discord_user_id, account_name, avatar_url, coins, total_assets, gacha_tickets, exchange_tickets, tip, is_hidden, equipped_badge_id, equipped_badge_id_right, team_id, badges!equipped_badge_id(image_url, name), badges_right:badges!equipped_badge_id_right(image_url, name), teams!team_id(team_name, logo_badge:badges!logo_badge_id(image_url))')
                .eq('discord_user_id', targetId)
                .maybeSingle();

            if (profile?.is_hidden && isViewMode) {
                const profileContent = document.getElementById('profile-content');
                const loginPrompt = document.getElementById('login-prompt');
                if (profileContent) profileContent.style.display = 'none';
                if (loginPrompt) {
                    loginPrompt.style.display = 'block';
                    const title = loginPrompt.querySelector('h3');
                    const desc = loginPrompt.querySelector('p');
                    const btn = loginPrompt.querySelector('button');
                    if (title) title.textContent = '接続エラーです';
                    if (desc) desc.textContent = '運営に連絡してください。';
                    if (btn) btn.style.display = 'none';
                }
                return;
            }

            // allProfiles にも最新情報を同期
            if (profile) {
                const pIdx = allProfiles.findIndex(p => p.discord_user_id === targetId);
                if (pIdx !== -1) {
                    allProfiles[pIdx] = { ...allProfiles[pIdx], ...profile };
                }

                // 装着バッジが所持されているか確認（所持していなければ自動で外す）
                if (!isViewMode && (profile.equipped_badge_id || profile.equipped_badge_id_right)) {
                    const { data: ownedBadges } = await supabaseClient
                        .from('user_badges_new')
                        .select('badge_id')
                        .eq('user_id', targetId);

                    const ownedIds = (ownedBadges || []).map(b => b.badge_id);
                    let updateNeeded = {};

                    if (profile.equipped_badge_id && !ownedIds.includes(profile.equipped_badge_id)) {
                        updateNeeded.equipped_badge_id = null;
                    }
                    if (profile.equipped_badge_id_right && !ownedIds.includes(profile.equipped_badge_id_right)) {
                        updateNeeded.equipped_badge_id_right = null;
                    }

                    if (Object.keys(updateNeeded).length > 0) {
                        await supabaseClient
                            .from('profiles')
                            .update(updateNeeded)
                            .eq('discord_user_id', targetId);
                        // 更新したらプロフィールを再取得
                        return loadTargetUserInfo();
                    }
                }
            }

            if (profile) {
                document.getElementById('user-avatar').src = profile.avatar_url || 'https://ui-avatars.com/api/?name=?&background=1a4d8c&color=fff&size=150';

                // 名前を設定
                document.getElementById('user-name').textContent = profile.account_name || '名称未設定';

                // 左バッジ画像を設定
                const badgeImg = document.getElementById('user-equipped-badge');
                const badge = profile?.badges;
                if (badgeImg && badge) {
                    badgeImg.src = badge.image_url;
                    badgeImg.title = badge.name;
                    badgeImg.style.display = 'block';
                    applyMutantEffect('badge-container-left', profile.equipped_badge_id, targetId);
                } else if (badgeImg) {
                    badgeImg.style.display = 'none';
                    applyMutantEffect('badge-container-left', null, null);
                }

                // 右バッジ画像を設定
                const badgeImgRight = document.getElementById('user-equipped-badge-right');
                const badgeRight = profile?.badges_right;
                if (badgeImgRight && badgeRight) {
                    badgeImgRight.src = badgeRight.image_url;
                    badgeImgRight.title = badgeRight.name;
                    badgeImgRight.style.display = 'block';
                    applyMutantEffect('badge-container-right', profile.equipped_badge_id_right, targetId);
                } else if (badgeImgRight) {
                    badgeImgRight.style.display = 'none';
                    applyMutantEffect('badge-container-right', null, null);
                }

                // チーム名を設定
                const teamNameEl = document.getElementById('user-team-name');
                const teamDisplayEl = document.getElementById('user-team-display');
                if (teamNameEl) {
                    const team = profile?.teams;
                    const teamName = team?.team_name || '未所属';

                    let logoHtml = '🏠 ';
                    if (team && team.logo_badge && team.logo_badge.image_url) {
                        logoHtml = `<img src="${team.logo_badge.image_url}" alt="logo" style="width: 20px; height: 20px; object-fit: contain; margin-right: 4px;"> `;
                    }

                    // 親要素のbadgeの中身を書き換える
                    const badgeEl = teamDisplayEl.querySelector('.badge');
                    if (badgeEl) {
                        badgeEl.innerHTML = `${logoHtml}<span id="user-team-name">${teamName}</span>`;
                    } else {
                        teamNameEl.textContent = teamName;
                    }
                }

                // コイン表示の更新
                const coins = profile?.coins || 0;
                const coinsDisplay = document.getElementById('user-coins-display');
                const coinsValue = document.getElementById('user-coins-value');
                const totalAssetsValue = document.getElementById('total-assets-value');
                const ticketsValue = document.getElementById('user-tickets-value');
                if (coinsDisplay && coinsValue) {
                    coinsValue.textContent = coins.toLocaleString();
                    // 総資産は loadBadgeCollection で計算後に更新される
                    // 読み込み前は「-」を表示
                    if (totalAssetsValue) {
                        totalAssetsValue.textContent = '-';
                    }
                    if (ticketsValue) {
                        ticketsValue.textContent = (profile?.gacha_tickets || 0).toLocaleString();
                    }
                    coinsDisplay.style.display = 'block';
                }
            } else {
                document.getElementById('user-name').textContent = 'Unknown Player';
            }
        }

        async function useDiscordName() {
            const user = await getCurrentUser();
            if (!user) return;
            const discordUser = user.user_metadata;
            const discordDisplayName = discordUser.custom_claims?.global_name || discordUser.full_name || discordUser.name;
            document.getElementById('user-nickname').value = discordDisplayName;
        }

        async function reloginForAvatar() {
            if (isViewMode) return;
            const btn = document.getElementById('sync-btn');
            if (btn) {
                btn.disabled = true;
                btn.textContent = '再ログイン中...';
            }
            try {
                await supabaseClient.auth.signOut();
            } catch (err) {
                console.error('Sign out error:', err);
            }
            window.location.href = '../index.html';
        }

        async function saveNickname() {
            if (isViewMode) return;

            const newNickname = document.getElementById('user-nickname').value.trim();
            const msg = document.getElementById('save-msg');

            if (!newNickname) {
                msg.textContent = 'ニックネームを入力してください';
                msg.className = 'small mt-1 text-danger flex-grow-1';
                msg.style.display = 'block';
                setTimeout(() => { msg.style.display = 'none'; }, 3000);
                return;
            }

            msg.style.display = 'block';
            msg.textContent = '保存中...';
            msg.className = 'small mt-1 text-muted flex-grow-1';

            try {
                const { error } = await supabaseClient
                    .from('profiles')
                    .update({
                        account_name: newNickname,
                        updated_at: new Date().toISOString()
                    })
                    .eq('discord_user_id', targetId);

                if (error) throw error;

                msg.textContent = '保存しました！';
                msg.className = 'small mt-2 text-center text-success';

                // モーダルを閉じる
                const modalEl = document.getElementById('nicknameModal');
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) {
                    setTimeout(() => {
                        modal.hide();
                        // ユーザー情報を再読み込みしてバッジ付きの名前を更新
                        loadTargetUserInfo();
                    }, 1000);
                }
            } catch (err) {
                console.error('Error updating nickname:', err);
                msg.textContent = 'エラーが発生しました';
                msg.className = 'small mt-2 text-center text-danger';
            }
        }

        // 戻るボタン
        function goBack() {
            if (document.referrer && document.referrer.includes(location.hostname)) history.back();
            else location.href = '../index.html';
        }

        function toggleLoading(show) {
            const overlay = document.getElementById('loading-overlay');
            if (overlay) overlay.classList.toggle('active', show);
        }

        document.addEventListener('DOMContentLoaded', function () {
            initAccordionNav('../');
        });

        document.addEventListener('DOMContentLoaded', initPage);

(async function () {
    initAccordionNav('../');

    const inputEl = document.getElementById('giftcode-input');
    const submitBtn = document.getElementById('giftcode-submit');
    const historyBody = document.getElementById('gift-history-body');
    const adminSection = document.getElementById('gift-admin-section');

    const user = await getCurrentUser();
    const discordId = user?.user_metadata?.provider_id || null;
    const isAdmin = !!(discordId && typeof ADMIN_DISCORD_IDS !== 'undefined' && ADMIN_DISCORD_IDS.includes(discordId));

    if (adminSection) {
        adminSection.style.display = isAdmin ? 'block' : 'none';
    }

    if (submitBtn) {
        submitBtn.addEventListener('click', handleRedeem);
    }
    if (inputEl) {
        inputEl.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                handleRedeem();
            }
        });
    }

    if (isAdmin) {
        setupAdminUI();
    }

    await loadHistory(discordId);

    async function handleRedeem() {
        if (!inputEl) return;
        const rawInput = inputEl.value.trim();
        const normalized = normalizeGiftCode(rawInput);
        if (!normalized) {
            showResultModal('コードを入力してください', 'text-danger');
            return;
        }

        submitBtn.disabled = true;
        try {
            const { data, error } = await supabaseClient.rpc('redeem_gift_code', {
                p_code: normalized
            });

            if (error) {
                console.error(error);
                showResultModal('エラーが発生しました。少し時間をおいて再度お試しください。', 'text-danger');
                return;
            }

            if (!data?.ok) {
                const message = resolveRedeemErrorMessage(data?.error);
                showResultModal(message, 'text-danger');
                return;
            }

            const rewardText = formatGiftRewards(
                data.coin || 0, data.kiganfu || 0, data.manganfu || 0,
                data.badge_name || null, data.badge_image || null
            ) || '報酬';
            showResultModal(`${rewardText}を受け取りました`, 'text-success');
            inputEl.value = '';
            await loadHistory(discordId);
        } finally {
            submitBtn.disabled = false;
        }
    }

    function resolveRedeemErrorMessage(code) {
        if (code === 'not_found') return 'コードが違います。';
        if (code === 'already_redeemed') return 'この報酬は既に受け取り済みです';
        if (code === 'exhausted') return 'このコードは使用回数の上限に達しました';
        if (code === 'not_authenticated') return 'ログインしてください';
        if (code === 'not_eligible') return 'あなたはこのコードの対象ではありません';
        return 'エラーが発生しました。';
    }

    function showResultModal(message, className) {
        const messageEl = document.getElementById('giftResultMessage');
        if (messageEl) {
            messageEl.innerHTML = message;
            messageEl.className = `fw-bold ${className || ''}`;
        }
        const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('giftResultModal'));
        modal.show();
    }

    async function loadHistory(currentDiscordId) {
        if (!historyBody) return;
        if (!currentDiscordId) {
            historyBody.innerHTML = '<tr><td colspan="3" class="text-center history-empty">ログインしてください</td></tr>';
            return;
        }

        const { data, error } = await supabaseClient
            .from('gift_code_redemptions')
            .select('redeemed_at, coin, kiganfu, manganfu, badge_id, gift_codes(code_raw)')
            .eq('discord_user_id', currentDiscordId)
            .order('redeemed_at', { ascending: false });

        if (error) {
            console.error(error);
            historyBody.innerHTML = '<tr><td colspan="3" class="text-center history-empty">取得に失敗しました</td></tr>';
            return;
        }

        if (!data || data.length === 0) {
            historyBody.innerHTML = '<tr><td colspan="3" class="text-center history-empty">まだ受け取り履歴がありません</td></tr>';
            return;
        }

        // バッジ情報を取得
        const badgeIds = [...new Set(data.filter(r => r.badge_id).map(r => r.badge_id))];
        let badgeMap = {};
        if (badgeIds.length > 0) {
            const { data: badges } = await supabaseClient
                .from('badges')
                .select('id, name, image_url')
                .in('id', badgeIds);
            (badges || []).forEach(b => { badgeMap[b.id] = b; });
        }

        historyBody.innerHTML = data.map((row) => {
            const badge = row.badge_id ? badgeMap[row.badge_id] : null;
            const rewardText = formatGiftRewards(
                row.coin || 0, row.kiganfu || 0, row.manganfu || 0,
                badge?.name || null, badge?.image_url || null
            ) || '-';
            const redeemedAt = row.redeemed_at ? new Date(row.redeemed_at).toLocaleString('ja-JP') : '-';
            const codeRaw = row.gift_codes?.code_raw || '-';
            return `
                <tr>
                    <td>${escapeHtml(codeRaw)}</td>
                    <td>${redeemedAt}</td>
                    <td>${rewardText}</td>
                </tr>
            `;
        }).join('');
    }

    function setupAdminUI() {
        const addBtn = document.getElementById('gift-admin-add-btn');
        const listBtn = document.getElementById('gift-admin-list-btn');
        const addForm = document.getElementById('gift-add-form');
        const addMessage = document.getElementById('gift-add-message');
        const listBody = document.getElementById('gift-admin-table-body');
        const publicToggle = document.getElementById('gift-add-public');
        const userSelectWrapper = document.getElementById('gift-user-select-wrapper');
        const userSelectArea = document.getElementById('gift-user-select');
        const userSearchInput = document.getElementById('gift-user-search');
        const badgeSelect = document.getElementById('gift-add-badge');

        let allProfiles = [];
        let allBadges = [];

        // 全員に公開トグルの連動
        if (publicToggle && userSelectWrapper) {
            publicToggle.addEventListener('change', () => {
                userSelectWrapper.style.display = publicToggle.checked ? 'none' : 'block';
                if (!publicToggle.checked && allProfiles.length === 0) {
                    loadProfiles();
                }
            });
        }

        // ユーザー検索フィルター
        if (userSearchInput) {
            userSearchInput.addEventListener('input', () => {
                const query = userSearchInput.value.toLowerCase();
                const checks = userSelectArea.querySelectorAll('.form-check');
                checks.forEach(chk => {
                    const label = chk.querySelector('.form-check-label');
                    if (label) {
                        chk.style.display = label.textContent.toLowerCase().includes(query) ? 'block' : 'none';
                    }
                });
            });
        }

        async function loadProfiles() {
            if (!userSelectArea) return;
            userSelectArea.innerHTML = '<div class="text-muted small text-center">読み込み中...</div>';
            const { data, error } = await supabaseClient
                .from('profiles')
                .select('discord_user_id, account_name, avatar_url')
                .order('account_name');

            if (error || !data) {
                userSelectArea.innerHTML = '<div class="text-danger small text-center">取得失敗</div>';
                return;
            }

            allProfiles = data.filter(p => p.account_name);
            renderUserCheckboxes();
        }

        async function loadBadges() {
            if (!badgeSelect) return;
            if (allBadges.length > 0) return; // 既に読み込み済み
            const { data, error } = await supabaseClient
                .from('badges')
                .select('id, name, image_url')
                .order('name');

            if (error || !data) return;
            allBadges = data;
            renderBadgeOptions();
        }

        function renderBadgeOptions(selectedId = '') {
            if (!badgeSelect) return;
            badgeSelect.innerHTML = '<option value="">なし</option>' + allBadges.map(b => {
                const selected = b.id === selectedId ? 'selected' : '';
                return `<option value="${escapeHtml(b.id)}" ${selected}>${escapeHtml(b.name)}</option>`;
            }).join('');
        }

        function renderUserCheckboxes(selectedIds = []) {
            if (!userSelectArea) return;
            userSelectArea.innerHTML = allProfiles.map(p => {
                const checked = selectedIds.includes(p.discord_user_id) ? 'checked' : '';
                const avatarSrc = p.avatar_url || '';
                const avatarImg = avatarSrc ? `<img src="${escapeHtml(avatarSrc)}" class="user-avatar" onerror="this.style.display='none'">` : '';
                return `
                    <div class="form-check">
                        <input class="form-check-input gift-user-check" type="checkbox" value="${escapeHtml(p.discord_user_id)}" id="gu-${escapeHtml(p.discord_user_id)}" ${checked}>
                        <label class="form-check-label" for="gu-${escapeHtml(p.discord_user_id)}">${avatarImg}${escapeHtml(p.account_name)}</label>
                    </div>
                `;
            }).join('');
        }

        function getSelectedUserIds() {
            const checks = userSelectArea?.querySelectorAll('.gift-user-check:checked') || [];
            return Array.from(checks).map(c => c.value);
        }

        if (addBtn) {
            addBtn.addEventListener('click', async () => {
                if (!isAdmin) return;
                // フォームリセット
                publicToggle.checked = true;
                userSelectWrapper.style.display = 'none';
                if (userSearchInput) userSearchInput.value = '';
                allProfiles = [];
                await loadBadges();
                renderBadgeOptions('');
                const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('giftAddModal'));
                modal.show();
            });
        }

        if (listBtn) {
            listBtn.addEventListener('click', async () => {
                if (!isAdmin) return;
                await loadGiftCodes();
                const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('giftListModal'));
                modal.show();
            });
        }

        if (addForm) {
            addForm.addEventListener('submit', async (event) => {
                event.preventDefault();
                if (!isAdmin) return;

                const codeRaw = document.getElementById('gift-add-code').value.trim();
                const coin = Number(document.getElementById('gift-add-coin').value || 0);
                const kiganfu = Number(document.getElementById('gift-add-kiganfu').value || 0);
                const manganfu = Number(document.getElementById('gift-add-manganfu').value || 0);
                const badgeId = badgeSelect?.value || null;
                const isActive = document.getElementById('gift-add-active').checked;
                const remainingRaw = document.getElementById('gift-add-remaining').value.trim();
                const remainingUses = remainingRaw === '' ? null : Number(remainingRaw);
                const isPublic = publicToggle.checked;
                const allowedUserIds = isPublic ? null : getSelectedUserIds();

                addMessage.textContent = '';
                addMessage.className = 'small mt-3';

                if (!codeRaw) {
                    addMessage.textContent = 'コード名を入力してください';
                    addMessage.classList.add('text-danger');
                    return;
                }

                if (!isPublic && (!allowedUserIds || allowedUserIds.length === 0)) {
                    addMessage.textContent = '対象ユーザーを少なくとも1人選択してください';
                    addMessage.classList.add('text-danger');
                    return;
                }

                const { data, error } = await supabaseClient.rpc('admin_create_gift_code', {
                    p_code_raw: codeRaw,
                    p_coin: coin,
                    p_kiganfu: kiganfu,
                    p_manganfu: manganfu,
                    p_is_active: isActive,
                    p_remaining_uses: remainingUses,
                    p_allowed_user_ids: allowedUserIds,
                    p_badge_id: badgeId || null
                });

                if (error) {
                    console.error(error);
                    addMessage.textContent = '追加に失敗しました';
                    addMessage.classList.add('text-danger');
                    return;
                }

                if (!data?.ok) {
                    const msg = data?.error === 'duplicate' ? '同じコードが既に登録されています' : '追加に失敗しました';
                    addMessage.textContent = msg;
                    addMessage.classList.add('text-danger');
                    return;
                }

                addMessage.textContent = '追加しました';
                addMessage.classList.add('text-success');
                addForm.reset();
                document.getElementById('gift-add-active').checked = true;
                publicToggle.checked = true;
                userSelectWrapper.style.display = 'none';
                renderBadgeOptions('');
            });
        }

        if (listBody) {
            listBody.addEventListener('click', async (event) => {
                const button = event.target.closest('.gift-admin-save');
                if (!button) return;
                const row = button.closest('tr');
                const codeId = row?.dataset?.id;
                if (!codeId) return;

                const coin = Number(row.querySelector('.gift-admin-coin')?.value || 0);
                const kiganfu = Number(row.querySelector('.gift-admin-kiganfu')?.value || 0);
                const manganfu = Number(row.querySelector('.gift-admin-manganfu')?.value || 0);
                const badgeIdVal = row.querySelector('.gift-admin-badge')?.value || null;
                const isActive = row.querySelector('.gift-admin-active')?.checked ?? false;
                const remainingRaw = row.querySelector('.gift-admin-remaining')?.value?.trim();
                const remainingUses = (remainingRaw === '' || remainingRaw === undefined) ? null : Number(remainingRaw);

                // 許可ユーザーの取得（現在の状態をそのまま保持）
                const allowedUserIdsRaw = row.dataset.allowedUserIds;
                const allowedUserIds = allowedUserIdsRaw ? JSON.parse(allowedUserIdsRaw) : null;

                button.disabled = true;
                button.textContent = '保存中...';

                try {
                    const { data, error } = await supabaseClient.rpc('admin_update_gift_code', {
                        p_id: codeId,
                        p_coin: coin,
                        p_kiganfu: kiganfu,
                        p_manganfu: manganfu,
                        p_is_active: isActive,
                        p_remaining_uses: remainingUses,
                        p_allowed_user_ids: allowedUserIds,
                        p_badge_id: badgeIdVal || null
                    });

                    if (error || !data?.ok) {
                        console.error(error || data);
                        button.textContent = '失敗';
                        return;
                    }

                    button.textContent = '保存済み';
                } finally {
                    setTimeout(() => {
                        button.textContent = '保存';
                        button.disabled = false;
                    }, 1200);
                }
            });
        }

        async function loadGiftCodes() {
            if (!listBody) return;
            listBody.innerHTML = '<tr><td colspan="11" class="text-center text-muted">読み込み中...</td></tr>';

            const [codesRes, allowedRes, profilesRes, badgesRes] = await Promise.all([
                supabaseClient.from('gift_codes').select('*').order('created_at', { ascending: false }),
                supabaseClient.from('gift_code_allowed_users').select('gift_code_id, discord_user_id'),
                supabaseClient.from('profiles').select('discord_user_id, account_name'),
                supabaseClient.from('badges').select('id, name, image_url').order('name')
            ]);

            if (codesRes.error) {
                console.error(codesRes.error);
                listBody.innerHTML = '<tr><td colspan="11" class="text-center text-danger">取得に失敗しました</td></tr>';
                return;
            }

            const data = codesRes.data;
            if (!data || data.length === 0) {
                listBody.innerHTML = '<tr><td colspan="11" class="text-center text-muted">データがありません</td></tr>';
                return;
            }

            // バッジマップ
            const badgeMapLocal = {};
            (badgesRes.data || []).forEach(b => { badgeMapLocal[b.id] = b; });
            allBadges = badgesRes.data || [];

            // 許可ユーザーをコードごとにグループ化
            const allowedMap = {};
            (allowedRes.data || []).forEach(a => {
                if (!allowedMap[a.gift_code_id]) allowedMap[a.gift_code_id] = [];
                allowedMap[a.gift_code_id].push(a.discord_user_id);
            });

            // discord_user_id -> account_name マップ
            const nameMap = {};
            (profilesRes.data || []).forEach(p => {
                nameMap[p.discord_user_id] = p.account_name;
            });

            // バッジ選択肢HTML
            const badgeOptionsHtml = (selectedId) => {
                return '<option value="">なし</option>' + allBadges.map(b => {
                    const selected = b.id === selectedId ? 'selected' : '';
                    return `<option value="${escapeHtml(b.id)}" ${selected}>${escapeHtml(b.name)}</option>`;
                }).join('');
            };

            listBody.innerHTML = data.map((row) => {
                const createdAt = row.created_at ? new Date(row.created_at).toLocaleDateString('ja-JP') : '-';
                const remainingVal = row.remaining_uses !== null && row.remaining_uses !== undefined ? row.remaining_uses : '';
                const allowedIds = allowedMap[row.id] || [];
                const allowedIdsJson = escapeHtml(JSON.stringify(allowedIds));

                let allowedHtml = '<span class="badge bg-success">全員</span>';
                if (allowedIds.length > 0) {
                    const names = allowedIds.map(id => nameMap[id] || id);
                    allowedHtml = names.map(n => `<span class="badge bg-info text-dark allowed-users-badge" title="${escapeHtml(n)}">${escapeHtml(n)}</span>`).join(' ');
                }

                return `
                    <tr data-id="${row.id}" data-allowed-user-ids='${allowedIdsJson}'>
                        <td class="small">${escapeHtml(row.code_raw || '')}</td>
                        <td class="small text-muted">${escapeHtml(row.code_norm || '')}</td>
                        <td><input type="number" class="form-control form-control-sm gift-admin-coin" value="${row.coin ?? 0}" min="0"></td>
                        <td><input type="number" class="form-control form-control-sm gift-admin-kiganfu" value="${row.kiganfu ?? 0}" min="0"></td>
                        <td><input type="number" class="form-control form-control-sm gift-admin-manganfu" value="${row.manganfu ?? 0}" min="0"></td>
                        <td><select class="form-select form-select-sm gift-admin-badge">${badgeOptionsHtml(row.badge_id)}</select></td>
                        <td><input type="number" class="form-control form-control-sm gift-admin-remaining" value="${remainingVal}" min="0" placeholder="∞"></td>
                        <td class="small">${allowedHtml}</td>
                        <td>
                            <div class="form-check form-switch">
                                <input class="form-check-input gift-admin-active" type="checkbox" ${row.is_active ? 'checked' : ''}>
                            </div>
                        </td>
                        <td class="small">${createdAt}</td>
                        <td><button type="button" class="btn btn-sm btn-outline-primary gift-admin-save">保存</button></td>
                    </tr>
                `;
            }).join('');
        }
    }

    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
})();

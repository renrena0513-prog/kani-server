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

            const rewardText = formatGiftRewards(data.coin || 0, data.kiganfu || 0, data.manganfu || 0) || '報酬';
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
        return 'エラーが発生しました。';
    }

    function showResultModal(message, className) {
        const messageEl = document.getElementById('giftResultMessage');
        if (messageEl) {
            messageEl.textContent = message;
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
            .select('redeemed_at, coin, kiganfu, manganfu, gift_codes(code_raw)')
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

        historyBody.innerHTML = data.map((row) => {
            const rewardText = formatGiftRewards(row.coin || 0, row.kiganfu || 0, row.manganfu || 0) || '-';
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

        if (addBtn) {
            addBtn.addEventListener('click', () => {
                if (!isAdmin) return;
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
                const isActive = document.getElementById('gift-add-active').checked;
                const remainingRaw = document.getElementById('gift-add-remaining').value.trim();
                const remainingUses = remainingRaw === '' ? null : Number(remainingRaw);

                addMessage.textContent = '';
                addMessage.className = 'small mt-3';

                if (!codeRaw) {
                    addMessage.textContent = 'コード名を入力してください';
                    addMessage.classList.add('text-danger');
                    return;
                }

                const { data, error } = await supabaseClient.rpc('admin_create_gift_code', {
                    p_code_raw: codeRaw,
                    p_coin: coin,
                    p_kiganfu: kiganfu,
                    p_manganfu: manganfu,
                    p_is_active: isActive,
                    p_remaining_uses: remainingUses
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
                const isActive = row.querySelector('.gift-admin-active')?.checked ?? false;
                const remainingRaw = row.querySelector('.gift-admin-remaining')?.value?.trim();
                const remainingUses = (remainingRaw === '' || remainingRaw === undefined) ? null : Number(remainingRaw);

                button.disabled = true;
                button.textContent = '保存中...';

                try {
                    const { data, error } = await supabaseClient.rpc('admin_update_gift_code', {
                        p_id: codeId,
                        p_coin: coin,
                        p_kiganfu: kiganfu,
                        p_manganfu: manganfu,
                        p_is_active: isActive,
                        p_remaining_uses: remainingUses
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
            listBody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">読み込み中...</td></tr>';

            const { data, error } = await supabaseClient
                .from('gift_codes')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.error(error);
                listBody.innerHTML = '<tr><td colspan="8" class="text-center text-danger">取得に失敗しました</td></tr>';
                return;
            }

            if (!data || data.length === 0) {
                listBody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">データがありません</td></tr>';
                return;
            }

            listBody.innerHTML = data.map((row) => {
                const createdAt = row.created_at ? new Date(row.created_at).toLocaleDateString('ja-JP') : '-';
                const remainingVal = row.remaining_uses !== null && row.remaining_uses !== undefined ? row.remaining_uses : '';
                return `
                    <tr data-id="${row.id}">
                        <td class="small">${escapeHtml(row.code_raw || '')}</td>
                        <td class="small text-muted">${escapeHtml(row.code_norm || '')}</td>
                        <td><input type="number" class="form-control form-control-sm gift-admin-coin" value="${row.coin ?? 0}" min="0"></td>
                        <td><input type="number" class="form-control form-control-sm gift-admin-kiganfu" value="${row.kiganfu ?? 0}" min="0"></td>
                        <td><input type="number" class="form-control form-control-sm gift-admin-manganfu" value="${row.manganfu ?? 0}" min="0"></td>
                        <td><input type="number" class="form-control form-control-sm gift-admin-remaining" value="${remainingVal}" min="0" placeholder="∞"></td>
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

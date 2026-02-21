(async function () {
    initAccordionNav('../');

    const user = await getCurrentUser();
    const discordId = user?.user_metadata?.provider_id || null;
    const isAdmin = !!(discordId && typeof ADMIN_DISCORD_IDS !== 'undefined' && ADMIN_DISCORD_IDS.includes(discordId));

    const exchangeGrid = document.getElementById('exchange-grid');
    const adminSection = document.getElementById('exchange-admin-section');

    if (adminSection) adminSection.style.display = isAdmin ? 'block' : 'none';

    // --- データ ---
    let allBadges = [];
    let myBadgeCounts = {};
    let exchangeList = [];

    async function init() {
        await Promise.all([fetchAllBadges(), fetchMyBadges()]);
        await loadExchanges();
        if (isAdmin) setupAdmin();
    }

    async function fetchAllBadges() {
        const { data } = await supabaseClient.from('badges').select('id, name, image_url').order('name');
        allBadges = data || [];
    }

    async function fetchMyBadges() {
        if (!discordId) return;
        const { data } = await supabaseClient
            .from('user_badges_new')
            .select('badge_id')
            .eq('user_id', discordId);
        myBadgeCounts = {};
        (data || []).forEach(r => {
            myBadgeCounts[r.badge_id] = (myBadgeCounts[r.badge_id] || 0) + 1;
        });
    }

    // --- 交換リスト表示 ---
    async function loadExchanges() {
        if (!exchangeGrid) return;
        exchangeGrid.innerHTML = '<div class="text-center text-muted py-4">読み込み中...</div>';

        const { data, error } = await supabaseClient
            .from('badge_exchanges')
            .select(`
                id, is_active, created_at,
                reward:badges!reward_badge_id(id, name, image_url),
                badge_exchange_materials(id, badge_id, quantity, badge:badges!badge_id(id, name, image_url))
            `)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) {
            console.error(error);
            exchangeGrid.innerHTML = '<div class="text-center text-danger py-4">読み込みに失敗しました</div>';
            return;
        }

        exchangeList = data || [];

        if (exchangeList.length === 0) {
            exchangeGrid.innerHTML = '<div class="text-center text-muted py-4">現在交換できるレシピはありません</div>';
            return;
        }

        exchangeGrid.innerHTML = exchangeList.map(ex => {
            const reward = ex.reward;
            const materials = ex.badge_exchange_materials || [];
            const canExchange = materials.every(m => (myBadgeCounts[m.badge_id] || 0) >= m.quantity);

            const labelText = !discordId ? 'ログインしてください' : (canExchange ? '交換可能' : '交換不可');
            const labelClass = !discordId ? 'bg-secondary' : (canExchange ? 'bg-success' : 'bg-danger');

            return `
                <div class="col-12 col-md-6">
                    <div class="exchange-card">
                        <div class="exchange-card-reward">
                            <img src="${reward?.image_url || ''}" alt="${escapeHtml(reward?.name || '')}" class="exchange-reward-img">
                            <div class="fw-bold mt-2">${escapeHtml(reward?.name || '報酬バッジ')}</div>
                        </div>
                        <div class="exchange-card-arrow">⇐</div>
                        <div class="exchange-card-materials">
                            <span class="badge ${labelClass}">${labelText}</span>
                        </div>
                        <div class="exchange-card-action">
                            <button class="btn btn-exchange ${canExchange ? '' : 'btn-exchange-disabled'}"
                                onclick="window._onExchangeClick('${ex.id}', ${canExchange})"
                                ${!discordId ? 'disabled' : ''}>
                                ${!discordId ? 'ログインしてください' : '交換'}
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // --- 交換ボタン押下 ---
    window._onExchangeClick = function (exchangeId, canExchange) {
        const ex = exchangeList.find(e => e.id === exchangeId);
        if (!ex) return;

        const materials = ex.badge_exchange_materials || [];

        if (canExchange) {
            // 確認モーダル
            const materialsText = materials.map(m =>
                `<div class="d-flex align-items-center gap-2 mb-1">
                    <img src="${m.badge?.image_url || ''}" class="exchange-modal-badge-img">
                    <span>${escapeHtml(m.badge?.name || '?')} ×${m.quantity}</span>
                </div>`
            ).join('');

            document.getElementById('exchangeModalTitle').textContent = '交換しますか？';
            document.getElementById('exchangeModalBody').innerHTML = `
                <div class="mb-3">以下が消費されます：</div>
                ${materialsText}
            `;
            document.getElementById('exchangeModalCancel').style.display = '';
            const execBtn = document.getElementById('exchangeModalExec');
            execBtn.style.display = '';
            execBtn.textContent = '交換する';
            execBtn.disabled = false;
            execBtn.onclick = () => executeExchange(exchangeId);
        } else {
            // 不足モーダル
            const missingHtml = materials
                .filter(m => (myBadgeCounts[m.badge_id] || 0) < m.quantity)
                .map(m => {
                    const owned = myBadgeCounts[m.badge_id] || 0;
                    const short = m.quantity - owned;
                    return `
                        <div class="d-flex align-items-center gap-2 mb-1">
                            <img src="${m.badge?.image_url || ''}" class="exchange-modal-badge-img">
                            <span>${escapeHtml(m.badge?.name || '?')} ×${short} が未所持です</span>
                        </div>`;
                }).join('');

            document.getElementById('exchangeModalTitle').textContent = '交換できません';
            document.getElementById('exchangeModalBody').innerHTML = missingHtml;
            document.getElementById('exchangeModalCancel').style.display = 'none';
            const execBtn = document.getElementById('exchangeModalExec');
            execBtn.style.display = 'none';
        }

        const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('exchangeModal'));
        modal.show();
    };

    async function executeExchange(exchangeId) {
        const execBtn = document.getElementById('exchangeModalExec');
        execBtn.disabled = true;
        execBtn.textContent = '交換中...';

        try {
            const { data, error } = await supabaseClient.rpc('execute_badge_exchange', {
                p_exchange_id: exchangeId
            });

            if (error) {
                console.error(error);
                showExchangeResult('エラーが発生しました', 'error');
                return;
            }

            if (!data?.ok) {
                if (data?.error === 'insufficient_materials' && data?.missing) {
                    const missingHtml = data.missing.map(m =>
                        `<div class="d-flex align-items-center gap-2 mb-1">
                            <img src="${m.image_url || ''}" class="exchange-modal-badge-img">
                            <span>${escapeHtml(m.badge_name || '?')} ×${m.required - m.owned} が未所持です</span>
                        </div>`
                    ).join('');
                    document.getElementById('exchangeModalTitle').textContent = '交換できません';
                    document.getElementById('exchangeModalBody').innerHTML = missingHtml;
                    document.getElementById('exchangeModalCancel').style.display = 'none';
                    execBtn.style.display = 'none';
                    return;
                }
                const msg = data?.error === 'not_found' ? 'レシピが見つかりません' :
                    data?.error === 'not_authenticated' ? 'ログインしてください' :
                        'エラーが発生しました';
                showExchangeResult(msg, 'error');
                return;
            }

            // 成功
            const mutantText = data.is_mutant ? ' ✨ミュータント！' : '';
            document.getElementById('exchangeModalTitle').textContent = '交換しました！';
            document.getElementById('exchangeModalBody').innerHTML = `
                <div class="text-center">
                    <img src="${data.reward_image || ''}" class="exchange-result-img mb-2">
                    <div class="fw-bold">${escapeHtml(data.reward_name || '報酬バッジ')}${mutantText}</div>
                </div>
            `;
            document.getElementById('exchangeModalCancel').style.display = 'none';
            execBtn.style.display = 'none';

            // データ再取得
            await fetchMyBadges();
            await loadExchanges();
        } catch (err) {
            console.error(err);
            showExchangeResult('エラーが発生しました', 'error');
        }
    }

    function showExchangeResult(msg, type) {
        document.getElementById('exchangeModalTitle').textContent = type === 'error' ? 'エラー' : '完了';
        document.getElementById('exchangeModalBody').innerHTML = `<div class="${type === 'error' ? 'text-danger' : ''}">${escapeHtml(msg)}</div>`;
        document.getElementById('exchangeModalCancel').style.display = 'none';
        document.getElementById('exchangeModalExec').style.display = 'none';
    }

    // --- 管理者 ---
    function setupAdmin() {
        const addBtn = document.getElementById('exchange-admin-add-btn');
        const listBtn = document.getElementById('exchange-admin-list-btn');

        if (addBtn) addBtn.addEventListener('click', openAddModal);
        if (listBtn) listBtn.addEventListener('click', openListModal);

        // 素材行追加ボタン
        const addMatBtn = document.getElementById('exchange-add-material-btn');
        if (addMatBtn) addMatBtn.addEventListener('click', addMaterialRow);

        // フォーム送信
        const form = document.getElementById('exchange-add-form');
        if (form) form.addEventListener('submit', handleAddSubmit);
    }

    // --- 管理者：追加モーダル ---
    function openAddModal() {
        document.getElementById('exchange-add-message').textContent = '';
        document.getElementById('exchange-reward-search').value = '';
        document.getElementById('exchange-reward-results').innerHTML = '';
        document.getElementById('exchange-reward-selected').innerHTML = '<span class="text-muted small">未選択</span>';
        document.getElementById('exchange-reward-id').value = '';
        const materialsContainer = document.getElementById('exchange-materials-container');
        materialsContainer.innerHTML = '';
        addMaterialRow();
        const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('exchangeAddModal'));
        modal.show();
    }

    // バッジ検索
    function searchBadges(query) {
        if (!query) return [];
        const q = query.toLowerCase();
        return allBadges.filter(b => b.name && b.name.toLowerCase().includes(q)).slice(0, 20);
    }

    // 報酬バッジ検索
    document.getElementById('exchange-reward-search')?.addEventListener('input', function () {
        const results = searchBadges(this.value);
        const container = document.getElementById('exchange-reward-results');
        if (results.length === 0) {
            container.innerHTML = this.value ? '<div class="text-muted small p-2">該当なし</div>' : '';
            return;
        }
        container.innerHTML = results.map(b => `
            <div class="badge-search-item" onclick="window._selectRewardBadge('${b.id}', '${escapeHtml(b.name)}', '${b.image_url || ''}')">
                <img src="${b.image_url || ''}" class="badge-search-img">
                <span class="small">${escapeHtml(b.name)}</span>
            </div>
        `).join('');
    });

    window._selectRewardBadge = function (id, name, imageUrl) {
        document.getElementById('exchange-reward-id').value = id;
        document.getElementById('exchange-reward-selected').innerHTML = `
            <div class="d-flex align-items-center gap-2">
                <img src="${imageUrl}" class="badge-search-img">
                <span class="fw-bold">${name}</span>
            </div>
        `;
        document.getElementById('exchange-reward-results').innerHTML = '';
        document.getElementById('exchange-reward-search').value = '';
    };

    // 素材行追加
    let materialRowId = 0;
    function addMaterialRow() {
        const container = document.getElementById('exchange-materials-container');
        const rowId = materialRowId++;
        const row = document.createElement('div');
        row.className = 'exchange-material-row d-flex gap-2 align-items-start mb-2';
        row.id = `mat-row-${rowId}`;
        row.innerHTML = `
            <div class="flex-grow-1">
                <input type="text" class="form-control form-control-sm mat-search" placeholder="バッジ名で検索" data-row="${rowId}">
                <div class="badge-search-results mat-results" id="mat-results-${rowId}"></div>
                <div class="mat-selected small mt-1" id="mat-selected-${rowId}"><span class="text-muted">未選択</span></div>
                <input type="hidden" class="mat-badge-id" id="mat-id-${rowId}">
            </div>
            <div style="width: 70px;">
                <input type="number" class="form-control form-control-sm mat-qty" value="1" min="1" id="mat-qty-${rowId}">
            </div>
            <button type="button" class="btn btn-sm btn-outline-danger mat-remove" onclick="this.closest('.exchange-material-row').remove()">✕</button>
        `;
        container.appendChild(row);

        // 検索イベント
        row.querySelector('.mat-search').addEventListener('input', function () {
            const rId = this.dataset.row;
            const results = searchBadges(this.value);
            const rc = document.getElementById(`mat-results-${rId}`);
            if (results.length === 0) {
                rc.innerHTML = this.value ? '<div class="text-muted small p-1">該当なし</div>' : '';
                return;
            }
            rc.innerHTML = results.map(b => `
                <div class="badge-search-item" onclick="window._selectMaterialBadge('${rId}', '${b.id}', '${escapeHtml(b.name)}', '${b.image_url || ''}')">
                    <img src="${b.image_url || ''}" class="badge-search-img">
                    <span class="small">${escapeHtml(b.name)}</span>
                </div>
            `).join('');
        });
    }

    window._selectMaterialBadge = function (rowId, id, name, imageUrl) {
        document.getElementById(`mat-id-${rowId}`).value = id;
        document.getElementById(`mat-selected-${rowId}`).innerHTML = `
            <div class="d-flex align-items-center gap-2">
                <img src="${imageUrl}" class="badge-search-img">
                <span>${name}</span>
            </div>
        `;
        document.getElementById(`mat-results-${rowId}`).innerHTML = '';
        const searchInput = document.querySelector(`#mat-row-${rowId} .mat-search`);
        if (searchInput) searchInput.value = '';
    };

    // レシピ追加送信
    async function handleAddSubmit(e) {
        e.preventDefault();
        const msg = document.getElementById('exchange-add-message');
        msg.textContent = '';
        msg.className = 'small mt-3';

        const rewardBadgeId = document.getElementById('exchange-reward-id').value;
        if (!rewardBadgeId) {
            msg.textContent = '報酬バッジを選択してください';
            msg.classList.add('text-danger');
            return;
        }

        const materialRows = document.querySelectorAll('.exchange-material-row');
        const materials = [];
        for (const row of materialRows) {
            const badgeId = row.querySelector('.mat-badge-id')?.value;
            const qty = Number(row.querySelector('.mat-qty')?.value || 1);
            if (!badgeId) {
                msg.textContent = '素材バッジをすべて選択してください';
                msg.classList.add('text-danger');
                return;
            }
            materials.push({ badge_id: badgeId, quantity: qty });
        }

        if (materials.length === 0) {
            msg.textContent = '素材を1つ以上追加してください';
            msg.classList.add('text-danger');
            return;
        }

        const { data, error } = await supabaseClient.rpc('admin_create_badge_exchange', {
            p_reward_badge_id: rewardBadgeId,
            p_materials: materials,
            p_is_active: true
        });

        if (error) {
            console.error(error);
            msg.textContent = '追加に失敗しました';
            msg.classList.add('text-danger');
            return;
        }

        if (!data?.ok) {
            msg.textContent = data?.error === 'reward_badge_not_found' ? '報酬バッジが見つかりません' : '追加に失敗しました';
            msg.classList.add('text-danger');
            return;
        }

        msg.textContent = '追加しました！';
        msg.classList.add('text-success');
        await loadExchanges();
    }

    // --- 管理者：一覧モーダル ---
    async function openListModal() {
        const body = document.getElementById('exchange-admin-list-body');
        body.innerHTML = '<div class="text-center text-muted py-3">読み込み中...</div>';
        const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('exchangeListModal'));
        modal.show();

        const { data, error } = await supabaseClient
            .from('badge_exchanges')
            .select(`
                id, is_active, created_at,
                reward:badges!reward_badge_id(id, name, image_url),
                badge_exchange_materials(badge_id, quantity, badge:badges!badge_id(name, image_url))
            `)
            .order('created_at', { ascending: false });

        if (error) {
            body.innerHTML = '<div class="text-center text-danger">取得に失敗しました</div>';
            return;
        }

        if (!data || data.length === 0) {
            body.innerHTML = '<div class="text-center text-muted">レシピがありません</div>';
            return;
        }

        body.innerHTML = data.map(ex => {
            const materials = (ex.badge_exchange_materials || []).map(m =>
                `<span class="small">${escapeHtml(m.badge?.name || '?')} ×${m.quantity}</span>`
            ).join(', ');
            return `
                <div class="exchange-admin-item d-flex align-items-center gap-3 p-2 border-bottom">
                    <img src="${ex.reward?.image_url || ''}" style="width:40px;height:40px;object-fit:contain;">
                    <div class="flex-grow-1">
                        <div class="fw-bold small">${escapeHtml(ex.reward?.name || '?')}</div>
                        <div class="text-muted" style="font-size:0.8rem;">← ${materials}</div>
                    </div>
                    <div class="form-check form-switch">
                        <input class="form-check-input" type="checkbox" ${ex.is_active ? 'checked' : ''}
                            onchange="window._toggleExchange('${ex.id}', this.checked)">
                    </div>
                    <button class="btn btn-sm btn-outline-danger" onclick="window._deleteExchange('${ex.id}')">削除</button>
                </div>
            `;
        }).join('');
    }

    window._toggleExchange = async function (id, active) {
        const { error } = await supabaseClient.rpc('admin_toggle_badge_exchange', { p_id: id, p_is_active: active });
        if (error) console.error(error);
        await loadExchanges();
    };

    window._deleteExchange = async function (id) {
        if (!confirm('このレシピを削除しますか？')) return;
        const { error } = await supabaseClient.rpc('admin_delete_badge_exchange', { p_id: id });
        if (error) console.error(error);
        await openListModal();
        await loadExchanges();
    };

    // --- ユーティリティ ---
    function escapeHtml(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    await init();
})();

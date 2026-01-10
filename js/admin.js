// 管理画面用ロジック（大会記録管理版）
let recordModal;

document.addEventListener('DOMContentLoaded', () => {
    // モーダルの初期化
    const modalElement = document.getElementById('recordModal');
    if (modalElement) {
        recordModal = new bootstrap.Modal(modalElement);
    }

    const badgeModalElement = document.getElementById('badgeModal');
    if (badgeModalElement) {
        window.badgeModal = new bootstrap.Modal(badgeModalElement);
    }

    const coinModalElement = document.getElementById('coinModal');
    if (coinModalElement) {
        window.coinModal = new bootstrap.Modal(coinModalElement);
    }

    // 画像プレビューの連動
    const badgeImageFile = document.getElementById('badge-image-file');
    if (badgeImageFile) {
        badgeImageFile.addEventListener('change', function (e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function (e) {
                    const preview = document.getElementById('badge-image-preview');
                    preview.querySelector('img').src = e.target.result;
                    preview.style.display = 'block';
                }
                reader.readAsDataURL(file);
            }
        });
    }

    // 記録一覧の取得
    fetchRecords();

    // 編集モーダルの入力変更イベントリスナー
    const modalInputs = ['mahjong_mode', 'dist_points', 'opt_tobi', 'opt_yakitori'];
    modalInputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('change', calculateFinalScores);
    });

    document.querySelectorAll('.player-edit-card').forEach(card => {
        const inputs = ['.player-raw-points', '.player-win-count', '.player-rank'];
        inputs.forEach(sel => {
            const el = card.querySelector(sel);
            if (el) el.addEventListener('input', calculateFinalScores);
        });
    });
});

// ローディング表示の切り替え
function toggleLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.visibility = show ? 'visible' : 'hidden';
    }
}

let allRecords = []; // 取得した全データ
let filteredRecords = []; // フィルター適用後のデータ
let sortConfig = { key: 'event_datetime', direction: 'desc' };

// 現在のフィルター選択状態
let filterState = {
    accounts: [],
    tournaments: [],
    teams: [],
    modes: [],
    match_modes: []
};

// 新規記録用のモーダル
function openRecordModal() {
    document.getElementById('recordModalLabel').textContent = '大会記録 追加 (一括)';
    document.getElementById('record-form').reset();
    document.getElementById('match-id').value = '';

    // 日時を現在時刻に設定
    const now = new Date();
    // JST調整 (簡易版)
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('event_datetime').value = now.toISOString().slice(0, 16);

    // プレイヤー別項目をすべて表示（新規追加時は4人分用意）
    const cards = document.querySelectorAll('.player-edit-card');
    cards.forEach(card => {
        card.style.display = 'block';
        card.querySelector('.player-record-id').value = '';
        card.querySelector('.player-account-name').value = '';
        card.querySelector('.player-final-score').value = '';
        card.querySelector('.player-rank').value = '';
        card.querySelector('.player-win-count').value = '0';
        card.querySelector('.player-deal-in-count').value = '0';
        card.querySelector('.player-discord-id').value = '';
    });

    recordModal.show();
}

// 記録一覧の取得
async function fetchRecords() {
    try {
        const { data: records, error } = await supabaseClient
            .from('match_results')
            .select('*');

        if (error) throw error;

        allRecords = records;
        updateFilterOptions();
        applyFiltersAndSort();
    } catch (err) {
        console.error('記録取得エラー:', err.message);
        const listBody = document.getElementById('records-list-body');
        if (listBody) {
            listBody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">エラー: ${err.message}</td></tr>`;
        }
    }
}

// フィルターパネルの開閉
function toggleFilterPanel() {
    const panel = document.getElementById('filter-panel');
    if (panel) {
        const isVisible = panel.style.display === 'block';
        panel.style.display = isVisible ? 'none' : 'block';
    }
}

// フィルター選択肢の動的生成
function updateFilterOptions() {
    const accountSet = new Set();
    const tournamentSet = new Set();
    const teamSet = new Set();
    const modeSet = new Set();
    const matchModeSet = new Set();

    allRecords.forEach(r => {
        if (r.account_name) accountSet.add(r.account_name);
        if (r.tournament_type) tournamentSet.add(r.tournament_type);
        if (r.team_name) teamSet.add(r.team_name);
        if (r.mahjong_mode) modeSet.add(r.mahjong_mode);
        if (r.match_mode) matchModeSet.add(r.match_mode);
    });

    renderCheckboxes('filter-accounts', Array.from(accountSet), 'accounts');
    renderCheckboxes('filter-tournaments', Array.from(tournamentSet), 'tournaments');
    renderCheckboxes('filter-teams', Array.from(teamSet), 'teams');
    renderCheckboxes('filter-modes', Array.from(modeSet), 'modes');
    renderCheckboxes('filter-match-modes', Array.from(matchModeSet), 'match_modes');
}

function renderCheckboxes(containerId, options, category) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (options.length === 0) {
        container.innerHTML = '<span class="text-muted small">データなし</span>';
        return;
    }

    container.innerHTML = options.sort().map(opt => `
        <div class="form-check p-0">
            <input type="checkbox" id="chk-${category}-${opt}" class="btn-check" 
                   value="${opt}" onchange="handleFilterChange('${category}', this)">
            <label class="filter-checkbox-label" for="chk-${category}-${opt}">${opt}</label>
        </div>
    `).join('');
}

// フィルター変更時の処理
function handleFilterChange(category, checkbox) {
    const val = checkbox.value;
    if (checkbox.checked) {
        filterState[category].push(val);
    } else {
        filterState[category] = filterState[category].filter(v => v !== val);
    }
    applyFiltersAndSort();
}

// フィルターのリセット
function clearFilters() {
    filterState = { accounts: [], tournaments: [], teams: [], modes: [], match_modes: [] };
    document.querySelectorAll('#filter-panel input[type="checkbox"]').forEach(chk => chk.checked = false);
    applyFiltersAndSort();
}

// ソート関数
function sortRecords(key) {
    if (sortConfig.key === key) {
        sortConfig.direction = (sortConfig.direction === 'asc' ? 'desc' : 'asc');
    } else {
        sortConfig.key = key;
        sortConfig.direction = 'desc';
    }

    document.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('asc', 'desc');
    });
    const th = document.getElementById(`th-${key}`);
    if (th) th.classList.add(sortConfig.direction);

    applyFiltersAndSort();
}

// フィルターとソートを統合して適用
function applyFiltersAndSort() {
    filteredRecords = allRecords.filter(record => {
        const matchAccount = filterState.accounts.length === 0 || filterState.accounts.includes(record.account_name);
        const matchTournament = filterState.tournaments.length === 0 || filterState.tournaments.includes(record.tournament_type);
        const matchTeam = filterState.teams.length === 0 || filterState.teams.includes(record.team_name);
        const matchMode = filterState.modes.length === 0 || filterState.modes.includes(record.mahjong_mode);
        const matchMethod = filterState.match_modes.length === 0 || filterState.match_modes.includes(record.match_mode);
        return matchAccount && matchTournament && matchTeam && matchMode && matchMethod;
    });

    const { key, direction } = sortConfig;
    filteredRecords.sort((a, b) => {
        let valA = a[key];
        let valB = b[key];
        if (valA === null || valA === undefined) return 1;
        if (valB === null || valB === undefined) return -1;
        if (typeof valA === 'string') {
            valA = valA.toLowerCase();
            valB = valB.toLowerCase();
        }
        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
    });

    displayRecords(filteredRecords);
}

// 記録の表示
function displayRecords(records) {
    const listBody = document.getElementById('records-list-body');
    if (!listBody) return;

    listBody.innerHTML = '';
    if (records.length === 0) {
        listBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">登録されている記録はありません</td></tr>';
        return;
    }

    // match_id でグループ化
    const matches = {};
    records.forEach(r => {
        const mid = r.match_id || `no-id-${r.id}`;
        if (!matches[mid]) matches[mid] = [];
        matches[mid].push(r);
    });

    // 試合単位で表示
    Object.keys(matches).forEach(mid => {
        const matchRecords = matches[mid];
        // 順位でソート
        matchRecords.sort((a, b) => (a.rank || 99) - (b.rank || 99));

        const first = matchRecords[0];
        const tr = document.createElement('tr');
        const dateStr = new Date(first.event_datetime).toLocaleString('ja-JP', {
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
        });

        // プレイヤー一覧
        const accountsHtml = matchRecords.map(r => `
            <div class="mb-1">
                <span class="badge bg-light text-dark" style="min-width: 80px;">${r.account_name}</span>
            </div>
        `).join('');

        const scoresHtml = matchRecords.map(r => {
            const color = (r.final_score > 0) ? 'text-success' : (r.final_score < 0 ? 'text-danger' : '');
            return `<div class="fw-bold ${color} mb-1">${r.final_score !== null ? (r.final_score > 0 ? '+' : '') + r.final_score.toFixed(1) : '-'}</div>`;
        }).join('');

        const ranksHtml = matchRecords.map(r => `
            <div class="mb-1">${r.rank ? `<span class="badge bg-primary">${r.rank}位</span>` : '-'}</div>
        `).join('');

        tr.innerHTML = `
            <td>${dateStr}</td>
            <td>${accountsHtml}</td>
            <td>
                <div class="small fw-bold">${first.tournament_type || '-'}</div>
                <div class="small text-muted">${first.mahjong_mode || ''} / ${first.match_mode || ''}</div>
            </td>
            <td>${scoresHtml}</td>
            <td>${ranksHtml}</td>
            <td>${first.hand_count || 1}局</td>
            <td>
                <div class="d-flex flex-column gap-1">
                    <button onclick='editMatch("${mid}")' class="btn btn-sm btn-outline-primary">編集</button>
                    <button onclick='deleteMatch("${mid}")' class="btn btn-sm btn-outline-danger">削除</button>
                </div>
            </td>
        `;
        listBody.appendChild(tr);
    });
}

// 試合単位の編集（複数プレイヤー一括）
function editMatch(matchId) {
    const matchRecords = allRecords.filter(r => (r.match_id || `no-id-${r.id}`) === matchId);
    if (matchRecords.length === 0) return;

    // 順位順に並べ替え
    matchRecords.sort((a, b) => (a.rank || 99) - (b.rank || 99));

    document.getElementById('recordModalLabel').textContent = '大会記録 編集 (一括)';
    document.getElementById('match-id').value = matchId;

    // 共通項目
    const first = matchRecords[0];
    document.getElementById('event_datetime').value = first.event_datetime ? first.event_datetime.slice(0, 16) : '';
    document.getElementById('tournament_type').value = first.tournament_type || '';
    document.getElementById('mahjong_mode').value = first.mahjong_mode || '';
    document.getElementById('match_mode').value = first.match_mode || '';
    document.getElementById('hand_count').value = first.hand_count || 1;

    // プレイヤー別項目をクリア・リセット
    const cards = document.querySelectorAll('.player-edit-card');
    cards.forEach(card => card.style.display = 'none');

    matchRecords.forEach((r, i) => {
        if (i >= 4) return; // 最大4名まで
        const card = cards[i];
        card.style.display = 'block';
        card.querySelector('.player-record-id').value = r.id;
        card.querySelector('.player-account-name').value = r.account_name || '';
        card.querySelector('.player-raw-points').value = r.raw_points || 0;
        card.querySelector('.player-final-score').value = r.final_score || 0;
        card.querySelector('.player-rank').value = r.rank || '';
        card.querySelector('.player-win-count').value = r.win_count || 0;
        card.querySelector('.player-deal-in-count').value = r.deal_in_count || 0;
        card.querySelector('.player-discord-id').value = r.discord_user_id || '';
    });

    // 初期計算（プレビュー更新）
    calculateFinalScores();

    recordModal.show();
}

/**
 * 報酬計算ロジック（1 + スコアボーナス + 順位ボーナス）
 */
function calculateReward(finalScore, rank, mode) {
    if (finalScore === null || rank === null) return 0;

    // スコアボーナス: 切り上げ
    const scoreBonus = finalScore > 0 ? Math.ceil(finalScore / 10) : 0;

    // 順位ボーナス (四麻のみ)
    let rankBonus = 0;
    if (mode === '四麻') {
        const yonmaRankBonus = { 1: 5, 2: 3, 3: 1, 4: 0 };
        rankBonus = yonmaRankBonus[rank] || 0;
    }

    return 1 + scoreBonus + rankBonus;
}

/**
 * モーダルの入力値から最終スコアを算出する（リアルタイム更新用）
 */
function calculateFinalScores() {
    const cards = Array.from(document.querySelectorAll('.player-edit-card')).filter(c => c.style.display !== 'none');
    const mode = document.getElementById('mahjong_mode').value || '四麻';
    const distPoints = Number(document.getElementById('dist_points').value || 25000);
    const returnPoints = distPoints + 5000;
    const isTobiOn = document.getElementById('opt_tobi').checked;
    const isYakitoriOn = document.getElementById('opt_yakitori').checked;

    const numPlayers = cards.length;
    if (numPlayers === 0) return;

    const okaPoints = (returnPoints - distPoints) * numPlayers;

    // プレイヤーデータの収集
    const players = cards.map(card => ({
        card: card,
        raw_points: Number(card.querySelector('.player-raw-points').value || 0),
        win_count: Number(card.querySelector('.player-win-count').value || 0),
        account_name: card.querySelector('.player-account-name').value
    }));

    // スコア計算 (mahjong-record.js と同等)
    // 順位付け (素点降順)
    const sorted = [...players].sort((a, b) => b.raw_points - a.raw_points);
    let currentRank = 1;
    let poolBonus = 0;

    sorted.forEach((p, i) => {
        if (i > 0 && p.raw_points < sorted[i - 1].raw_points) {
            currentRank = i + 1;
        }
        p.calc_rank = currentRank;

        // ウマ
        let uma = 0;
        if (mode === '三麻') {
            uma = { 1: 20, 2: 0, 3: -20 }[currentRank] || 0;
        } else {
            uma = { 1: 30, 2: 10, 3: -10, 4: -30 }[currentRank] || 0;
        }

        let baseScore = (p.raw_points - returnPoints) / 1000 + uma;
        let penalty = 0;
        if (isTobiOn && p.raw_points < 0) { penalty += 10; poolBonus += 10; }
        if (isYakitoriOn && p.win_count === 0) { penalty += 10; poolBonus += 10; }

        p.final_score = baseScore - penalty;
    });

    // 1位にオカとプールを加算
    const topOnes = sorted.filter(p => p.calc_rank === 1);
    const totalBonus = (okaPoints / 1000) + poolBonus;
    topOnes.forEach(p => p.final_score += (totalBonus / topOnes.length));

    // 結果を UI に反映
    players.forEach(p => {
        const rounded = Math.round(p.final_score * 10) / 10;
        p.card.querySelector('.player-final-score').value = rounded;
        // 修正: 順位も自動計算されたものをセット
        p.card.querySelector('.player-rank').value = p.calc_rank;

        // 報酬プレビューの更新
        const reward = calculateReward(rounded, p.calc_rank, mode);
        p.card.querySelector('.player-reward-preview').textContent = `約 ${reward} coins`;
    });
}

async function saveRecordFromForm() {
    const existingMatchId = document.getElementById('match-id').value;
    const isNewMatch = !existingMatchId || existingMatchId.startsWith('no-id-');

    // 共通項目
    const event_datetime = document.getElementById('event_datetime').value;
    const common = {
        event_datetime: event_datetime,
        tournament_type: document.getElementById('tournament_type').value,
        mahjong_mode: document.getElementById('mahjong_mode').value,
        match_mode: document.getElementById('match_mode').value,
        hand_count: Number(document.getElementById('hand_count').value)
    };

    if (!event_datetime) {
        alert('日時は必須です');
        return;
    }

    // 最終計算を強制実行して最新の計算値（final_score, rank）を取得・UIに反映
    calculateFinalScores();

    // 記録者IDの取得
    let submittedBy = null;
    try {
        submittedBy = await getEffectiveUserId();
    } catch (e) { }

    // 新規マッチの場合は match_id を生成
    const matchId = isNewMatch ? crypto.randomUUID() : existingMatchId;

    const cards = document.querySelectorAll('.player-edit-card');
    const recordsToUpdate = [];
    const recordsToInsert = [];
    const coinAdjustments = {}; // discord_user_id -> diff

    cards.forEach(card => {
        if (card.style.display === 'none') return;

        const account_name = card.querySelector('.player-account-name').value;
        if (!account_name) return;

        const recordId = card.querySelector('.player-record-id').value;
        const discord_id = card.querySelector('.player-discord-id').value || null;

        const finalScore = Number(card.querySelector('.player-final-score').value);
        const rank = Number(card.querySelector('.player-rank').value);

        const data = {
            ...common,
            match_id: matchId,
            account_name: account_name,
            raw_points: Number(card.querySelector('.player-raw-points').value || 0),
            final_score: finalScore,
            rank: rank,
            win_count: Number(card.querySelector('.player-win-count').value),
            deal_in_count: Number(card.querySelector('.player-deal-in-count').value),
            discord_user_id: discord_id,
            submitted_by_discord_user_id: submittedBy
        };

        // コイン差分計算
        if (discord_id) {
            const newReward = calculateReward(finalScore, rank, common.mahjong_mode);
            let oldReward = 0;
            if (recordId) {
                const oldRecord = allRecords.find(r => String(r.id) === String(recordId));
                if (oldRecord) {
                    oldReward = calculateReward(oldRecord.final_score, oldRecord.rank, oldRecord.mahjong_mode);
                }
            }
            const diff = newReward - oldReward;
            if (diff !== 0) {
                coinAdjustments[discord_id] = (coinAdjustments[discord_id] || 0) + diff;
            }
        }

        if (recordId) {
            recordsToUpdate.push({ id: recordId, data });
        } else {
            recordsToInsert.push(data);
        }
    });

    if (recordsToUpdate.length === 0 && recordsToInsert.length === 0) {
        alert('プレイヤーデータを入力してください');
        return;
    }

    toggleLoading(true);
    try {
        // match_results 更新
        if (recordsToUpdate.length > 0) {
            await Promise.all(recordsToUpdate.map(u =>
                supabaseClient.from('match_results').update(u.data).eq('id', u.id)
            ));
        }
        if (recordsToInsert.length > 0) {
            await supabaseClient.from('match_results').insert(recordsToInsert);
        }

        // コイン反映 (差分がある場合)
        for (const uid of Object.keys(coinAdjustments)) {
            const diff = coinAdjustments[uid];
            // 現在の値を再取得して更新（安全のため）
            const { data: profile } = await supabaseClient.from('profiles').select('coins, total_assets').eq('discord_user_id', uid).single();
            if (profile) {
                await supabaseClient.from('profiles').update({
                    coins: (profile.coins || 0) + diff,
                    total_assets: (profile.total_assets || 0) + diff
                }).eq('discord_user_id', uid);
            }
        }

        recordModal.hide();
        fetchRecords();
    } catch (err) {
        alert('保存エラー: ' + err.message);
    } finally {
        toggleLoading(false);
    }
}

async function deleteMatch(matchId) {
    if (!confirm('この試合の全記録を削除しますか？付与されたコインも差し引かれます。')) return;

    const isSingleId = matchId.startsWith('no-id-');
    const filterKey = isSingleId ? 'id' : 'match_id';
    const filterValue = isSingleId ? matchId.replace('no-id-', '') : matchId;

    // 削除前のデータ取得 (コイン返還用)
    const targetRecords = allRecords.filter(r => {
        const mid = r.match_id || `no-id-${r.id}`;
        return mid === matchId;
    });

    toggleLoading(true);
    try {
        // コイン返還処理
        const coinAdjustments = {};
        targetRecords.forEach(r => {
            if (r.discord_user_id) {
                const reward = calculateReward(r.final_score, r.rank, r.mahjong_mode);
                coinAdjustments[r.discord_user_id] = (coinAdjustments[r.discord_user_id] || 0) - reward;
            }
        });

        for (const uid of Object.keys(coinAdjustments)) {
            const diff = coinAdjustments[uid];
            const { data: profile } = await supabaseClient.from('profiles').select('coins, total_assets').eq('discord_user_id', uid).single();
            if (profile) {
                await supabaseClient.from('profiles').update({
                    coins: (profile.coins || 0) + diff,
                    total_assets: (profile.total_assets || 0) + diff
                }).eq('discord_user_id', uid);
            }
        }

        const { error } = await supabaseClient.from('match_results').delete().eq(filterKey, filterValue);
        if (error) throw error;

        fetchRecords();
    } catch (err) {
        alert('削除エラー: ' + err.message);
    } finally {
        toggleLoading(false);
    }
}

// ユーザー一覧取得
async function fetchUsers() {
    const listBody = document.getElementById('users-list-body');
    if (!listBody) return;

    try {
        const { data: users, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .order('updated_at', { ascending: false });

        if (error) throw error;
        listBody.innerHTML = '';
        if (users.length === 0) {
            listBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">登録されているユーザーはいません</td></tr>';
            return;
        }

        users.forEach(user => {
            const tr = document.createElement('tr');
            const dateStr = user.updated_at ? new Date(user.updated_at).toLocaleString('ja-JP') : '-';
            const avatarHtml = user.avatar_url ? `<img src="${user.avatar_url}" width="32" height="32" class="rounded-circle shadow-sm">` : '<div class="bg-secondary rounded-circle" style="width:32px;height:32px;"></div>';

            // 装着バッジの取得（簡易的に）
            const coins = user.coins || 0;

            tr.innerHTML = `
                <td>${avatarHtml}</td>
                <td>
                    <div class="fw-bold">${user.account_name || '名称未設定'}</div>
                    <div class="small text-muted">${user.discord_account || ''}</div>
                </td>
                <td><code>${user.discord_user_id || '-'}</code></td>
                <td class="small text-muted">${dateStr}</td>
                <td>
                    <span class="badge bg-info text-dark">🪙 ${coins.toLocaleString()}</span>
                </td>
                <td>
                    <div class="d-flex gap-1">
                        <button onclick="impersonateUser('${user.discord_user_id}', '${(user.account_name || '名称未設定').replace(/'/g, "\\'")}', '${user.avatar_url || ''}')" class="btn btn-sm btn-outline-warning" title="ユーザーとして操作">
                            🎭
                        </button>
                        <button onclick="openCoinModal('${user.discord_user_id}', '${(user.account_name || '名称未設定').replace(/'/g, "\\'")}', ${coins})" class="btn btn-sm btn-outline-info" title="コイン編集">
                            🪙
                        </button>
                        <button onclick="openBadgeGrantModal('${user.discord_user_id}', '${(user.account_name || '名称未設定').replace(/'/g, "\\'")}')" class="btn btn-sm btn-outline-success" title="バッジ付与">
                            📛
                        </button>
                    </div>
                </td>
            `;
            listBody.appendChild(tr);
        });
    } catch (err) {
        console.error('ユーザー取得エラー:', err.message);
        listBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger">エラー: ${err.message}</td></tr>`;
    }
}

// 所持コイン編集
function openCoinModal(userId, name, coins) {
    document.getElementById('coin-edit-user-id').value = userId;
    document.getElementById('coin-edit-user-name').textContent = name;
    document.getElementById('coin-amount').value = coins;
    window.coinModal.show();
}

async function saveUserCoins() {
    const userId = document.getElementById('coin-edit-user-id').value;
    const newAmount = Number(document.getElementById('coin-amount').value);

    toggleLoading(true);
    try {
        // 現在のcoinsとtotal_assetsを取得
        const { data: profile, error: fetchError } = await supabaseClient
            .from('profiles')
            .select('coins, total_assets')
            .eq('discord_user_id', userId)
            .single();

        if (fetchError) throw fetchError;

        const currentCoins = profile.coins || 0;
        const currentTotalAssets = profile.total_assets || 0;
        const difference = newAmount - currentCoins;

        // 更新オブジェクトを作成
        const updateData = { coins: newAmount };

        // 増加した場合のみtotal_assetsに加算
        if (difference > 0) {
            updateData.total_assets = currentTotalAssets + difference;
        }

        const { error } = await supabaseClient
            .from('profiles')
            .update(updateData)
            .eq('discord_user_id', userId);

        if (error) throw error;
        window.coinModal.hide();
        fetchUsers();
    } catch (err) {
        alert('コイン保存エラー: ' + err.message);
    } finally {
        toggleLoading(false);
    }
}

// バッジ付与モーダル
let badgeGrantModal;
document.addEventListener('DOMContentLoaded', () => {
    const modalEl = document.getElementById('badgeGrantModal');
    if (modalEl) badgeGrantModal = new bootstrap.Modal(modalEl);
});

async function openBadgeGrantModal(userId, userName) {
    document.getElementById('badge-grant-user-id').value = userId;
    document.getElementById('badge-grant-user-name').textContent = userName;

    const listEl = document.getElementById('badge-grant-list');
    const ownedListEl = document.getElementById('badge-grant-owned-list');
    listEl.innerHTML = '<p class="text-muted text-center">読み込み中...</p>';
    ownedListEl.innerHTML = '';

    badgeGrantModal.show();

    try {
        // 全バッジ取得 (ソート順)
        const { data: allBadges, error: badgeError } = await supabaseClient
            .from('badges')
            .select('*')
            .order('sort_order', { ascending: true })
            .order('name');

        if (badgeError) throw badgeError;

        // ユーザーの所持バッジ取得
        const { data: userBadgesNew, error: userBadgeError } = await supabaseClient
            .from('user_badges_new')
            .select('badge_id, badges(name)')
            .eq('user_id', userId);

        if (userBadgeError) throw userBadgeError;

        // 所持数をカウント
        const ownedCounts = {};
        userBadgesNew.forEach(ub => {
            ownedCounts[ub.badge_id] = (ownedCounts[ub.badge_id] || 0) + 1;
        });

        // 所持バッジの表示 (剥奪用)
        const aggregatedOwned = [];
        const seen = new Set();
        userBadgesNew.forEach(ub => {
            if (!seen.has(ub.badge_id) && ub.badges) {
                aggregatedOwned.push({
                    id: ub.badge_id,
                    name: ub.badges.name,
                    count: ownedCounts[ub.badge_id]
                });
                seen.add(ub.badge_id);
            }
        });

        ownedListEl.innerHTML = aggregatedOwned.length > 0
            ? aggregatedOwned.map(b => {
                const badgeInfo = allBadges.find(allB => allB.id === b.id);
                return `
                <div class="position-relative" style="cursor: pointer;" onclick="revokeBadge('${userId}', '${b.id}', '${b.name.replace(/'/g, "\\'")}')">
                    <img src="${badgeInfo?.image_url || ''}" title="${b.name} x${b.count} (クリックで1つ剥奪)" style="width: 40px; height: 40px; border-radius: 8px; border: 2px solid var(--gold);">
                    <span class="badge bg-danger position-absolute top-0 start-100 translate-middle p-1 rounded-circle" style="font-size: 0.6rem;">${b.count}</span>
                </div>
                `;
            }).join('')
            : '<span class="text-muted small">なし</span>';

        // 付与可能バッジの表示 (複数選択用)
        listEl.innerHTML = allBadges.length > 0
            ? allBadges.map(b => `
                <div class="col-12">
                    <div class="card p-2">
                        <div class="d-flex align-items-center gap-2">
                            <input type="checkbox" class="badge-grant-checkbox" data-badge-id="${b.id}" id="grant-check-${b.id}">
                            <img src="${b.image_url}" style="width: 32px; height: 32px; border-radius: 4px;">
                            <label class="flex-grow-1 small text-truncate m-0" for="grant-check-${b.id}">${b.name}</label>
                            <input type="number" class="form-control form-control-sm badge-grant-quantity" 
                                   data-badge-id="${b.id}" value="1" min="1" style="width: 60px;">
                        </div>
                    </div>
                </div>
            `).join('')
            : '<p class="text-muted text-center">バッジがありません</p>';

    } catch (err) {
        console.error('バッジ読み込みエラー:', err);
        listEl.innerHTML = `<p class="text-danger">エラー: ${err.message}</p>`;
    }
}

async function grantMultiBadges() {
    const userId = document.getElementById('badge-grant-user-id').value;
    const userName = document.getElementById('badge-grant-user-name').textContent;
    const checkboxes = document.querySelectorAll('.badge-grant-checkbox:checked');

    if (checkboxes.length === 0) {
        alert('付与するバッジを選択してください');
        return;
    }

    const grants = [];
    checkboxes.forEach(cb => {
        const badgeId = cb.getAttribute('data-badge-id');
        const quantityInput = document.querySelector(`.badge-grant-quantity[data-badge-id="${badgeId}"]`);
        const quantity = parseInt(quantityInput.value) || 1;

        for (let i = 0; i < quantity; i++) {
            grants.push({ user_id: userId, badge_id: badgeId });
        }
    });

    if (!confirm(`${grants.length}個のバッジを付与しますか？`)) return;

    toggleLoading(true);
    try {
        const { error } = await supabaseClient
            .from('user_badges_new')
            .insert(grants);

        if (error) throw error;
        alert('バッジを付与しました');
        openBadgeGrantModal(userId, userName);
    } catch (err) {
        alert('バッジ付与エラー: ' + err.message);
    } finally {
        toggleLoading(false);
    }
}

async function grantBadge(userId, badgeId, badgeName) {
    if (!confirm(`「${badgeName}」をこのユーザーに付与しますか？`)) return;

    toggleLoading(true);
    try {
        const { error } = await supabaseClient
            .from('user_badges_new')
            .insert([{ user_id: userId, badge_id: badgeId }]);

        if (error) throw error;
        alert('バッジを付与しました');
        openBadgeGrantModal(userId, document.getElementById('badge-grant-user-name').textContent);
    } catch (err) {
        alert('バッジ付与エラー: ' + err.message);
    } finally {
        toggleLoading(false);
    }
}

async function revokeBadge(userId, badgeId, badgeName) {
    if (!confirm(`「${badgeName}」を1つ剥奪しますか？`)) return;

    toggleLoading(true);
    try {
        // ID指定で1件だけ削除 (user_id と badge_id が一致するもののうち最新の1つ)
        const { data: targetRows, error: findError } = await supabaseClient
            .from('user_badges_new')
            .select('id')
            .eq('user_id', userId)
            .eq('badge_id', badgeId)
            .order('created_at', { ascending: false })
            .limit(1);

        if (findError) throw findError;
        if (!targetRows || targetRows.length === 0) throw new Error('バッジが見つかりません');

        const { error } = await supabaseClient
            .from('user_badges_new')
            .delete()
            .eq('id', targetRows[0].id);

        if (error) throw error;
        alert('バッジを1つ剥奪しました');
        openBadgeGrantModal(userId, document.getElementById('badge-grant-user-name').textContent);
    } catch (err) {
        alert('バッジ剥奪エラー: ' + err.message);
    } finally {
        toggleLoading(false);
    }
}

// バッジ一覧取得
async function fetchBadges() {
    const list = document.getElementById('badges-list');
    if (!list) return;

    try {
        const { data: badges, error } = await supabaseClient
            .from('badges')
            .select('*')
            .order('sort_order', { ascending: true })
            .order('name', { ascending: true });

        if (error) throw error;

        list.innerHTML = '';
        if (badges.length === 0) {
            list.innerHTML = '<div class="col-12 text-center text-muted py-5">バッジが登録されていません</div>';
            return;
        }

        badges.forEach(badge => {
            const div = document.createElement('div');
            div.className = 'col-md-4 col-lg-3';
            div.innerHTML = `
                <div class="card h-100 shadow-sm border-0 bg-white">
                    <div class="card-body text-center">
                        <img src="${badge.image_url}" class="mb-3 badge-thumb shadow-sm" style="width: 64px; height: 64px; object-fit: contain;">
                        <h6 class="fw-bold mb-1">${badge.name}</h6>
                        <p class="small text-muted mb-2" style="font-size: 0.75rem;">${badge.description || '(説明なし)'}</p>
                            <div class="d-flex justify-content-between align-items-center mt-auto">
                                <span class="badge bg-warning text-dark">🪙 ${badge.price}</span>
                                <span class="badge ${badge.gacha_weight === 0 ? 'bg-danger' : 'bg-secondary'}">
                                    ${badge.gacha_weight === 0 ? '🔒 非売品' : '⚖️ ' + badge.gacha_weight}
                                </span>
                            </div>
                            <div class="mt-1 d-flex justify-content-between align-items-center">
                                <span class="small text-muted">📦 在庫: ${badge.remaining_count ?? '∞'}</span>
                                <span class="small text-muted">⭐ ${badge.rarity || 'Normal'}</span>
                            </div>
                            <div class="mt-1 text-center">
                                <span class="small text-muted">🔢 順序: ${badge.order ?? 0}</span>
                            </div>
                        <div class="mt-3 d-flex gap-1 justify-content-center">
                            <button onclick='openBadgeModal(${JSON.stringify(badge).replace(/'/g, "&apos;")})' class="btn btn-sm btn-outline-primary">編集</button>
                            <button onclick="deleteBadge('${badge.id}')" class="btn btn-sm btn-outline-danger">削除</button>
                        </div>
                    </div>
                </div>
            `;
            list.appendChild(div);
        });
    } catch (err) {
        console.error('バッジ取得エラー:', err);
    }
}

// バッジモーダル制御
async function openBadgeModal(badge = null) {
    const form = document.getElementById('badge-form');
    form.reset();
    document.getElementById('badge-image-preview').style.display = 'none';

    // ユーザーリストを読み込む
    await loadBadgeOwnerOptions(badge?.discord_user_id);

    if (badge) {
        document.getElementById('badgeModalLabel').textContent = 'バッジ編集';
        document.getElementById('badge-id').value = badge.id;
        document.getElementById('badge-name').value = badge.name;
        document.getElementById('badge-description').value = badge.description || '';
        document.getElementById('badge-weight').value = badge.gacha_weight;
        document.getElementById('badge-price').value = badge.price;
        document.getElementById('badge-stock').value = badge.remaining_count ?? 999;
        document.getElementById('badge-sort-order').value = badge.order ?? 0;
        document.getElementById('badge-image-url').value = badge.image_url;
        document.getElementById('badge-rarity').value = badge.rarity || 'Normal';
        document.getElementById('badge-requirements').value = badge.requirements || '';
        document.getElementById('badge-owner').value = badge.discord_user_id || '';

        if (badge.image_url) {
            const preview = document.getElementById('badge-image-preview');
            preview.querySelector('img').src = badge.image_url;
            preview.style.display = 'block';
        }
    } else {
        document.getElementById('badgeModalLabel').textContent = '新規バッジ登録';
        document.getElementById('badge-id').value = '';
        document.getElementById('badge-image-url').value = '';
        document.getElementById('badge-rarity').value = 'Normal';
        document.getElementById('badge-requirements').value = '';
        document.getElementById('badge-owner').value = '';
    }
    window.badgeModal.show();
}

// 権利者選択リストを読み込む
async function loadBadgeOwnerOptions(selectedId = null) {
    const listEl = document.getElementById('badge-owner-list');
    const labelEl = document.getElementById('selected-owner-label');
    const hiddenInput = document.getElementById('badge-owner');

    listEl.innerHTML = '<li><a class="dropdown-item" href="#" onclick="selectBadgeOwner(\'\', \'なし（権利者なし）\', \'\')">なし（権利者なし）</a></li>';

    try {
        const { data: profiles, error } = await supabaseClient
            .from('profiles')
            .select('discord_user_id, account_name, avatar_url')
            .order('account_name');

        if (error) throw error;

        if (profiles) {
            profiles.forEach(profile => {
                const name = profile.account_name || '名称未設定';
                const avatar = profile.avatar_url || '';
                const avatarHtml = avatar ? `<img src="${avatar}" width="24" height="24" class="rounded-circle me-2">` : '<div class="bg-secondary rounded-circle me-2" style="width:24px;height:24px;"></div>';

                const li = document.createElement('li');
                li.innerHTML = `
                    <a class="dropdown-item d-flex align-items-center" href="#" onclick="selectBadgeOwner('${profile.discord_user_id}', '${name.replace(/'/g, "\\'")}', '${avatar}')">
                        ${avatarHtml}
                        <span>${name}</span>
                    </a>
                `;
                listEl.appendChild(li);

                if (selectedId && profile.discord_user_id === selectedId) {
                    selectBadgeOwner(profile.discord_user_id, name, avatar);
                }
            });
        }

        if (!selectedId) {
            selectBadgeOwner('', 'なし（権利者なし）', '');
        }
    } catch (err) {
        console.error('ユーザーリスト読み込みエラー:', err);
    }
}

// 権利者を選択した時の処理
function selectBadgeOwner(id, name, avatarUrl) {
    const labelEl = document.getElementById('selected-owner-label');
    const hiddenInput = document.getElementById('badge-owner');

    hiddenInput.value = id;

    const avatarHtml = avatarUrl ? `<img src="${avatarUrl}" width="24" height="24" class="rounded-circle me-2">` : (id ? '<div class="bg-secondary rounded-circle me-2" style="width:24px;height:24px;"></div>' : '');
    labelEl.innerHTML = `${avatarHtml}<span>${name}</span>`;
}

async function saveBadge() {
    const id = document.getElementById('badge-id').value;
    const name = document.getElementById('badge-name').value;
    const description = document.getElementById('badge-description').value;
    const gacha_weight = Number(document.getElementById('badge-weight').value);
    const price = Number(document.getElementById('badge-price').value);
    const remaining_count = Number(document.getElementById('badge-stock').value);
    const order = Number(document.getElementById('badge-sort-order').value);
    const rarity = document.getElementById('badge-rarity').value;
    const requirements = document.getElementById('badge-requirements').value;
    let image_url = document.getElementById('badge-image-url').value;

    const imageFile = document.getElementById('badge-image-file').files[0];

    if (!name) { alert('バッジ名を入力してください'); return; }
    if (!image_url && !imageFile) { alert('画像をアップロードしてください'); return; }

    toggleLoading(true);
    try {
        // 画像アップロードがある場合
        if (imageFile) {
            const fileExt = imageFile.name.split('.').pop();
            const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabaseClient
                .storage
                .from('badges')
                .upload(filePath, imageFile, {
                    cacheControl: '31536000', // 1年間キャッシュを有効にする
                    upsert: false
                });

            if (uploadError) throw uploadError;

            // 公開URLの取得
            const { data } = supabaseClient
                .storage
                .from('badges')
                .getPublicUrl(filePath);

            image_url = data.publicUrl;
        }

        const badgeData = {
            name,
            description,
            gacha_weight,
            price,
            remaining_count,
            order,
            image_url,
            rarity,
            requirements,
            discord_user_id: document.getElementById('badge-owner').value || null
        };

        let error;
        if (id) {
            ({ error } = await supabaseClient.from('badges').update(badgeData).eq('id', id));
        } else {
            ({ error } = await supabaseClient.from('badges').insert([badgeData]));
        }

        if (error) throw error;
        window.badgeModal.hide();
        fetchBadges();
    } catch (err) {
        alert('バッジ保存エラー: ' + err.message);
    } finally {
        toggleLoading(false);
    }
}

async function deleteBadge(id) {
    if (!confirm('このバッジを削除してもよろしいですか？マスターデータを削除すると、所持しているユーザーからも消える可能性があります。')) return;
    toggleLoading(true);
    try {
        const { error } = await supabaseClient.from('badges').delete().eq('id', id);
        if (error) throw error;
        fetchBadges();
    } catch (err) {
        alert('バッジ削除エラー: ' + err.message);
    } finally {
        toggleLoading(false);
    }
}

// 画像一括アップロード
async function handleBulkBadgeUpload(event) {
    const files = Array.from(event.target.files);
    if (files.length === 0) return;

    if (!confirm(`${files.length}個の画像からバッジを作成しますか？\n（名前はファイル名から自動生成されます）`)) {
        event.target.value = '';
        return;
    }

    toggleLoading(true);
    let successCount = 0;
    let errorCount = 0;

    for (const file of files) {
        try {
            // ファイル名からバッジ名を生成（拡張子除去）
            const baseName = file.name.replace(/\.[^/.]+$/, '');

            // 画像をアップロード
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`;

            const { error: uploadError } = await supabaseClient
                .storage
                .from('badges')
                .upload(fileName, file, {
                    cacheControl: '31536000',
                    upsert: false
                });

            if (uploadError) throw uploadError;

            // 公開URLの取得
            const { data } = supabaseClient
                .storage
                .from('badges')
                .getPublicUrl(fileName);

            // バッジをDBに登録
            const { error: insertError } = await supabaseClient
                .from('badges')
                .insert([{
                    name: baseName,
                    description: '',
                    gacha_weight: 10,
                    price: 0,
                    remaining_count: 999,
                    order: 0,
                    rarity: 'Normal',
                    requirements: '',
                    image_url: data.publicUrl
                }]);

            if (insertError) throw insertError;
            successCount++;
        } catch (err) {
            console.error(`${file.name} の登録に失敗:`, err);
            errorCount++;
        }
    }

    toggleLoading(false);
    alert(`完了: ${successCount}件成功, ${errorCount}件失敗`);
    event.target.value = '';
    fetchBadges();
}

// バッジCSVエクスポート
async function exportBadgesToCSV() {
    try {
        const { data: badges, error } = await supabaseClient
            .from('badges')
            .select('*')
            .order('sort_order', { ascending: true })
            .order('name', { ascending: true });

        if (error) throw error;
        if (!badges || badges.length === 0) {
            alert('エクスポートするバッジがありません');
            return;
        }

        const headers = ['id', 'name', 'description', 'requirements', 'rarity', 'image_url', 'gacha_weight', 'price', 'remaining_count', 'sort_order', 'discord_user_id'];
        const csvRows = [headers.join(',')];

        badges.forEach(badge => {
            const values = headers.map(header => {
                const val = badge[header] ?? '';
                return `"${String(val).replace(/"/g, '""')}"`;
            });
            csvRows.push(values.join(','));
        });

        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `badges_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
    } catch (err) {
        alert('CSVエクスポートエラー: ' + err.message);
    }
}

// バッジCSVインポート
async function handleBadgeCSVImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const text = e.target.result;
            const rows = text.split(/\r?\n/).filter(row => row.trim() !== '');

            if (rows.length < 2) {
                alert('有効なデータがありません');
                return;
            }

            // ヘッダー解析
            const headers = rows[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
            const dataToProcess = [];

            // データ行解析
            for (let i = 1; i < rows.length; i++) {
                // CSVの引用符内カンマに対応した分割
                const values = rows[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
                    .map(v => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));

                const obj = {};
                headers.forEach((h, idx) => {
                    let val = values[idx];

                    // 数値型のカラム
                    if (['gacha_weight', 'price', 'remaining_count', 'sort_order'].includes(h)) {
                        val = (val !== '' && val !== undefined && val !== 'null') ? Number(val) : 0;
                    }

                    // 空文字列やnullはスキップ（不要なカラム）
                    if (h === 'created_at') return; // created_atはDBで自動生成

                    if (val !== undefined && val !== 'null' && val !== '') {
                        obj[h] = val;
                    }
                });

                // idが空または無効なUUIDなら削除（新規として扱う）
                if (!obj.id || obj.id === '' || obj.id === 'null' || obj.id.length < 30) {
                    delete obj.id;
                }

                // 必須フィールドのチェック（nameとimage_url）
                if (obj.name && obj.image_url) {
                    // デフォルト値の設定
                    if (obj.gacha_weight === null || obj.gacha_weight === undefined) obj.gacha_weight = 10;
                    if (obj.price === null || obj.price === undefined) obj.price = 0;
                    dataToProcess.push(obj);
                }
            }

            if (dataToProcess.length === 0) {
                alert('有効なバッジデータが見つかりませんでした\n（name と image_url は必須です）');
                return;
            }

            // 確認ダイアログ
            const updateCount = dataToProcess.filter(d => d.id).length;
            const insertCount = dataToProcess.length - updateCount;
            const message = `${dataToProcess.length}件のバッジをインポートしますか？\n` +
                `・新規追加: ${insertCount}件\n` +
                `・更新: ${updateCount}件`;

            if (!confirm(message)) {
                event.target.value = '';
                return;
            }

            toggleLoading(true);

            // 更新と新規挿入を分けて処理
            const toUpdate = dataToProcess.filter(d => d.id);
            const toInsert = dataToProcess.filter(d => !d.id);

            let successCount = 0;
            let errorCount = 0;

            // 更新処理
            for (const badge of toUpdate) {
                try {
                    const { error } = await supabaseClient
                        .from('badges')
                        .update({
                            name: badge.name,
                            description: badge.description || '',
                            requirements: badge.requirements || null,
                            rarity: badge.rarity || 'Normal',
                            image_url: badge.image_url,
                            gacha_weight: badge.gacha_weight,
                            price: badge.price,
                            discord_user_id: badge.discord_user_id || null
                        })
                        .eq('id', badge.id);

                    if (error) throw error;
                    successCount++;
                } catch (err) {
                    console.error(`バッジ更新エラー (${badge.name}):`, err);
                    errorCount++;
                }
            }

            // 新規挿入処理
            if (toInsert.length > 0) {
                try {
                    const { error } = await supabaseClient
                        .from('badges')
                        .insert(toInsert.map(b => ({
                            name: b.name,
                            description: b.description || '',
                            requirements: b.requirements || null,
                            rarity: b.rarity || 'Normal',
                            image_url: b.image_url,
                            gacha_weight: b.gacha_weight,
                            price: b.price,
                            discord_user_id: b.discord_user_id || null
                        })));

                    if (error) throw error;
                    successCount += toInsert.length;
                } catch (err) {
                    console.error('バッジ挿入エラー:', err);
                    errorCount += toInsert.length;
                }
            }

            toggleLoading(false);
            alert(`インポート完了\n成功: ${successCount}件, エラー: ${errorCount}件`);
            fetchBadges();

        } catch (err) {
            console.error('CSVインポートエラー:', err);
            alert('CSVインポートエラー: ' + err.message);
            toggleLoading(false);
        }
    };

    reader.readAsText(file);
    event.target.value = '';
}


// ユーザーのなりすましを開始
function impersonateUser(discordUserId, accountName, avatarUrl) {
    if (!confirm(`${accountName} として操作を開始しますか？\n（管理者メニューへのアクセスは維持されますが、他の機能はそのユーザーとして動作します）`)) return;

    const userData = {
        discord_user_id: discordUserId,
        name: accountName,
        avatar_url: avatarUrl
    };

    localStorage.setItem('admin_impersonate_user', JSON.stringify(userData));

    // そのユーザーのマイページに遷移して操作を開始
    window.location.href = `../mypage/index.html`;
}

// CSV処理
async function exportToCSV() {
    try {
        if (filteredRecords.length === 0) {
            alert('データがありません');
            return;
        }
        const headers = [
            'id', 'event_datetime', 'account_name', 'tournament_type', 'team_name',
            'mahjong_mode', 'match_mode', 'final_score', 'rank', 'matches_played',
            'win_count', 'deal_in_count', 'discord_user_id'
        ];
        const csvRows = [headers.join(',')];
        filteredRecords.forEach(row => {
            const values = headers.map(header => {
                const val = row[header] ?? '';
                return `"${String(val).replace(/"/g, '""')}"`;
            });
            csvRows.push(values.join(','));
        });
        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `match_results_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
    } catch (err) {
        alert('CSV出力エラー: ' + err.message);
    }
}

async function handleCSVImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        const text = e.target.result;
        const rows = text.split(/\r?\n/).filter(row => row.trim() !== '');
        if (rows.length < 2) return;
        const headers = rows[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const dataToInsert = [];
        for (let i = 1; i < rows.length; i++) {
            const values = rows[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.trim().replace(/^"|"$/g, '').replace(/""/g, '"'));
            const obj = {};
            headers.forEach((h, idx) => {
                let val = values[idx];
                if (['final_score', 'rank', 'matches_played', 'win_count', 'deal_in_count'].includes(h)) {
                    val = (val !== '' && val !== undefined) ? Number(val) : null;
                }
                if (val !== undefined) obj[h] = val;
            });
            if (!obj.id || obj.id === '' || obj.id === 'null') delete obj.id;
            if (obj.event_datetime && obj.account_name) dataToInsert.push(obj);
        }
        if (dataToInsert.length === 0) {
            alert('有効なデータが見つかりませんでした');
            return;
        }
        if (confirm(`${dataToInsert.length}件をインポートしますか？`)) {
            toggleLoading(true);
            try {
                const { error } = await supabaseClient.from('match_results').upsert(dataToInsert);
                if (error) throw error;
                alert('インポート完了');
                fetchRecords();
            } catch (err) {
                alert('インポートエラー: ' + err.message);
            } finally {
                toggleLoading(false);
            }
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// チーム管理申請の取得
async function fetchTeamRequests() {
    try {
        // 追放申請取得
        const { data: kickRequests } = await supabaseClient
            .from('team_admin_requests')
            .select('*')
            .eq('type', 'kick')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        // 解散申請取得
        const { data: dissolutionRequests } = await supabaseClient
            .from('team_admin_requests')
            .select('*')
            .eq('type', 'dissolution')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });

        const totalPending = (kickRequests?.length || 0) + (dissolutionRequests?.length || 0);
        const badge = document.getElementById('team-requests-badge');
        if (totalPending > 0) {
            badge.textContent = totalPending;
            badge.style.display = 'inline';
        } else {
            badge.style.display = 'none';
        }

        // 追放申請リスト表示
        const kickList = document.getElementById('kick-requests-list');
        if (!kickRequests || kickRequests.length === 0) {
            kickList.innerHTML = '<p class="text-muted">保留中の追放申請はありません</p>';
        } else {
            kickList.innerHTML = kickRequests.map(req => `
                <div class="event-list-item">
                    <div>
                        <strong>チーム:</strong> ${req.team_name || '不明'}<br>
                        <strong>対象メンバー:</strong> ${req.target_name || '不明'}<br>
                        <small class="text-muted">申請者: ${req.requester_name || '不明'}</small>
                    </div>
                    <div>
                        <button class="btn btn-success btn-sm me-2" onclick="approveKick('${req.id}')">承認</button>
                        <button class="btn btn-outline-danger btn-sm" onclick="rejectKick('${req.id}')">却下</button>
                    </div>
                </div>
            `).join('');
        }

        // 解散申請リスト表示
        const dissolveList = document.getElementById('dissolution-requests-list');
        if (!dissolutionRequests || dissolutionRequests.length === 0) {
            dissolveList.innerHTML = '<p class="text-muted">保留中の解散申請はありません</p>';
        } else {
            dissolveList.innerHTML = dissolutionRequests.map(req => `
                <div class="event-list-item">
                    <div>
                        <strong>チーム:</strong> ${req.team_name || '不明'}<br>
                        <small class="text-muted">申請者: ${req.requester_name || '不明'}</small>
                    </div>
                    <div>
                        <button class="btn btn-danger btn-sm me-2" onclick="approveDissolution('${req.id}', '${req.team_id}')">解散を承認</button>
                        <button class="btn btn-outline-secondary btn-sm" onclick="rejectDissolution('${req.id}')">却下</button>
                    </div>
                </div>
            `).join('');
        }
    } catch (err) {
        console.error('チーム申請取得エラー:', err);
    }
}

// 追放申請を承認
async function approveKick(requestId) {
    if (!confirm('この追放申請を承認しますか？')) return;
    try {
        // 申請情報取得
        const { data: request } = await supabaseClient
            .from('team_admin_requests')
            .select('*')
            .eq('id', requestId)
            .single();

        if (!request) throw new Error('申請が見つかりません');

        // メンバーをチームから外す
        await supabaseClient
            .from('profiles')
            .update({ team_id: null })
            .eq('discord_user_id', request.target_discord_id);

        // 申請を承認済みに
        await supabaseClient
            .from('team_admin_requests')
            .update({ status: 'approved' })
            .eq('id', requestId);

        alert('追放を承認しました');
        fetchTeamRequests();
    } catch (err) {
        console.error('追放承認エラー:', err);
        alert('エラーが発生しました');
    }
}

// 追放申請を却下
async function rejectKick(requestId) {
    if (!confirm('この追放申請を却下しますか？')) return;
    try {
        await supabaseClient
            .from('team_admin_requests')
            .update({ status: 'rejected' })
            .eq('id', requestId);

        alert('追放申請を却下しました');
        fetchTeamRequests();
    } catch (err) {
        console.error('却下エラー:', err);
        alert('エラーが発生しました');
    }
}

// 解散申請を承認
async function approveDissolution(requestId, teamId) {
    if (!confirm('このチームを解散しますか？この操作は取り消せません')) return;
    if (!confirm('本当に解散しますか？')) return;

    try {
        // メンバーのteam_idをnullに
        await supabaseClient
            .from('profiles')
            .update({ team_id: null })
            .eq('team_id', teamId);

        // このチームに関連する全ての申請を削除（外部キー制約のため先に削除）
        await supabaseClient
            .from('team_admin_requests')
            .delete()
            .eq('team_id', teamId);

        // チームを削除
        await supabaseClient
            .from('teams')
            .delete()
            .eq('id', teamId);

        // 申請を承認済みに
        await supabaseClient
            .from('team_admin_requests')
            .update({ status: 'approved' })
            .eq('id', requestId);

        alert('チームを解散しました');
        fetchTeamRequests();
    } catch (err) {
        console.error('解散承認エラー:', err);
        alert('エラーが発生しました');
    }
}

// 解散申請を却下
async function rejectDissolution(requestId) {
    if (!confirm('この解散申請を却下しますか？')) return;
    try {
        await supabaseClient
            .from('team_admin_requests')
            .update({ status: 'rejected' })
            .eq('id', requestId);

        alert('解散申請を却下しました');
        fetchTeamRequests();
    } catch (err) {
        console.error('却下エラー:', err);
        alert('エラーが発生しました');
    }
}

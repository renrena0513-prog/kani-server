console.log('admin_v2.js loaded - version 2026.01.11.04');
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

// 最終スコアの自動計算
function calculateFinalScores() {
    const mode = document.getElementById('mahjong_mode')?.value;
    const distPoints = parseInt(document.getElementById('dist_points')?.value) || 0;
    const tobiEnabled = document.getElementById('opt_tobi')?.checked || false;
    const yakitoriEnabled = document.getElementById('opt_yakitori')?.checked || false;

    document.querySelectorAll('.player-edit-card').forEach(card => {
        const rawPoints = parseInt(card.querySelector('.player-raw-points')?.value) || 0;
        const rank = parseInt(card.querySelector('.player-rank')?.value) || 0;
        const winCount = parseInt(card.querySelector('.player-win-count')?.value) || 0;
        const finalScoreInput = card.querySelector('.player-final-score');

        if (!finalScoreInput || !rank) return;

        // モードによる順位点設定
        let uma = [0, 0, 0, 0];
        if (mode === '三麻') {
            uma = [20, 0, -20];  // 3麻
        } else {
            uma = [20, 10, -10, -20];  // 4麻デフォルト
        }

        // 素点をスコアに変換
        let score = (rawPoints - distPoints) / 1000;

        // 順位点を加算
        if (rank >= 1 && rank <= uma.length) {
            score += uma[rank - 1];
        }

        // トビペナルティ
        if (tobiEnabled && rawPoints < 0) {
            score -= 20;
        }

        // 焼き鳥ペナルティ
        if (yakitoriEnabled && winCount === 0) {
            score -= 10;
        }

        finalScoreInput.value = score.toFixed(1);
    });
}

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
    if (!records || records.length === 0) {
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
        matchRecords.sort((a, b) => (a.rank || 99) - (b.rank || 99));

        const first = matchRecords[0];
        const tr = document.createElement('tr');
        const dateStr = new Date(first.event_datetime).toLocaleString('ja-JP', {
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
        });

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

// 試合の削除
async function deleteMatch(matchId) {
    if (!confirm('この試合の全記録を削除してもよろしいですか？')) return;
    toggleLoading(true);
    try {
        const { error } = await supabaseClient.from('match_results').delete().eq('match_id', matchId);
        if (error) throw error;
        fetchRecords();
    } catch (err) {
        alert('削除エラー: ' + err.message);
    } finally {
        toggleLoading(false);
    }
}

// 編集用データの取得
async function editMatch(matchId) {
    toggleLoading(true);
    try {
        const { data: records, error } = await supabaseClient
            .from('match_results')
            .select('*')
            .eq('match_id', matchId);

        if (error) throw error;

        document.getElementById('recordModalLabel').textContent = '大会記録 編集';
        document.getElementById('match-id').value = matchId;

        // ドロップダウンの初期化
        await populateDropdowns();

        const first = records[0];
        document.getElementById('event_datetime').value = new Date(first.event_datetime).toISOString().slice(0, 16);
        document.getElementById('tournament_type').value = first.tournament_type || '';
        document.getElementById('mahjong_mode').value = first.mahjong_mode || '四麻';
        document.getElementById('match_mode').value = first.match_mode || '東風戦';
        document.getElementById('dist_points').value = first.raw_points || 25000;
        document.getElementById('opt_tobi').checked = !!first.opt_tobi;
        document.getElementById('opt_yakitori').checked = !!first.opt_yakitori;
        document.getElementById('hand_count').value = first.hand_count || '';

        const cards = document.querySelectorAll('.player-edit-card');
        cards.forEach(card => card.style.display = 'none');

        records.forEach((r, idx) => {
            if (idx < cards.length) {
                const card = cards[idx];
                card.style.display = 'block';
                card.querySelector('.player-record-id').value = r.id;
                card.querySelector('.player-account-name').value = r.account_name || '';
                card.querySelector('.player-team-name').value = r.team_name || '';
                card.querySelector('.player-raw-points').value = r.raw_points || 0;
                card.querySelector('.player-win-count').value = r.win_count || 0;
                card.querySelector('.player-deal-in-count').value = r.deal_in_count || 0;
                card.querySelector('.player-discord-id').value = r.discord_user_id || '';

                // 旧報酬計算用に記録
                card.dataset.originalScore = r.final_score || 0;
                card.dataset.originalRank = r.rank || 1;
                card.dataset.originalDiscordId = r.discord_user_id || '';

                updateDiscordDisplay(card);
            }
        });

        // 試合方式に応じたチーム名入力欄の表示切替
        const tournamentTypeField = document.getElementById('tournament_type');
        const updateTeamVisibility = () => {
            const isPersonal = tournamentTypeField.value.includes('個人');
            document.querySelectorAll('.player-team-name').forEach(select => {
                const col = select.closest('.col-6');
                if (col) col.style.display = isPersonal ? 'none' : 'block';
                if (isPersonal) select.value = "";
            });
        };
        tournamentTypeField.addEventListener('change', updateTeamVisibility);
        updateTeamVisibility();

        // リアルタイム計算のセットアップ
        setupAutoCalculation();
        calculateLiveScore();

        recordModal.show();
    } catch (err) {
        alert('データ取得エラー: ' + err.message);
    } finally {
        toggleLoading(false);
    }
}

/**
 * ユーザーとチームのプルダウンを初期化
 */
async function populateDropdowns() {
    try {
        const [pRes, tRes] = await Promise.all([
            supabaseClient.from('profiles').select('account_name, discord_user_id').order('account_name'),
            supabaseClient.from('teams').select('team_name').order('team_name')
        ]);

        if (pRes.error) throw pRes.error;
        if (tRes.error) throw tRes.error;

        const profiles = pRes.data;
        const teams = tRes.data;

        document.querySelectorAll('.player-edit-card').forEach(card => {
            const accSelect = card.querySelector('.player-account-name');
            const teamSelect = card.querySelector('.player-team-name');

            const currentAcc = accSelect.value;
            accSelect.innerHTML = '<option value="">選択...</option>';
            profiles.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.account_name;
                opt.textContent = p.account_name;
                opt.dataset.discordId = p.discord_user_id;
                accSelect.appendChild(opt);
            });
            accSelect.value = currentAcc;

            const currentTeam = teamSelect.value;
            teamSelect.innerHTML = '<option value="">(なし)</option>';
            teams.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.team_name;
                opt.textContent = t.team_name;
                teamSelect.appendChild(opt);
            });
            teamSelect.value = currentTeam;

            accSelect.onchange = () => {
                const selected = accSelect.options[accSelect.selectedIndex];
                card.querySelector('.player-discord-id').value = selected?.dataset.discordId || "";
                updateDiscordDisplay(card);
            };
        });
    } catch (err) {
        console.error('プルダウン初期化エラー:', err);
    }
}

function updateDiscordDisplay(card) {
    const id = card.querySelector('.player-discord-id').value;
    const display = card.querySelector('.player-discord-id-display');
    if (display) display.textContent = id ? `ID: ${id}` : 'ID: -';
}

/**
 * 自動計算のリスナー登録
 */
function setupAutoCalculation() {
    const inputs = [
        '#dist_points', '#opt_tobi', '#opt_yakitori', '#mahjong_mode',
        '.player-raw-points', '.player-win-count', '.player-deal-in-count'
    ];

    inputs.forEach(selector => {
        document.querySelectorAll(selector).forEach(el => {
            el.removeEventListener('input', calculateLiveScore);
            el.addEventListener('input', calculateLiveScore);
            el.removeEventListener('change', calculateLiveScore);
            el.addEventListener('change', calculateLiveScore);
        });
    });

    // モード切替で配給点を自動変更
    const modeSelect = document.getElementById('mahjong_mode');
    const onModeChange = () => {
        const mode = modeSelect.value;
        const distInput = document.getElementById('dist_points');
        if (mode === '三麻') distInput.value = 35000;
        else distInput.value = 25000;
        calculateLiveScore();
    };
    modeSelect.removeEventListener('change', onModeChange);
    modeSelect.addEventListener('change', onModeChange);
}

/**
 * リアルタイムスコア計算
 */
function calculateLiveScore() {
    const mode = document.getElementById('mahjong_mode').value;
    const isSanma = mode === '三麻';
    const distPoints = parseInt(document.getElementById('dist_points').value || 25000);
    const returnPoints = isSanma ? 40000 : 30000;
    const numPlayers = isSanma ? 3 : 4;
    const okaTotal = (returnPoints - distPoints) * numPlayers;

    const isTobiOn = document.getElementById('opt_tobi').checked;
    const isYakitoriOn = document.getElementById('opt_yakitori').checked;

    const cards = Array.from(document.querySelectorAll('.player-edit-card')).filter(c => c.style.display !== 'none');
    const players = cards.map(card => ({
        card: card,
        raw: parseInt(card.querySelector('.player-raw-points').value || 0),
        wins: parseInt(card.querySelector('.player-win-count').value || 0),
        final: 0,
        rank: 0
    }));

    // 順位出し
    const sorted = [...players].sort((a, b) => b.raw - a.raw);
    let currentRank = 1;
    sorted.forEach((p, i) => {
        if (i > 0 && p.raw < sorted[i - 1].raw) currentRank = i + 1;
        p.rank = currentRank;
    });

    let poolBonus = 0;

    // 基本スコア + ウマ + ペナルティ
    players.forEach(p => {
        let uma = 0;
        if (isSanma) {
            uma = { 1: 20, 2: 0, 3: -20 }[p.rank] || 0;
        } else {
            uma = { 1: 30, 2: 10, 3: -10, 4: -30 }[p.rank] || 0;
        }

        let penalty = 0;
        if (isTobiOn && p.raw < 0) { penalty += 10; poolBonus += 10; }
        if (isYakitoriOn && p.wins === 0) { penalty += 10; poolBonus += 10; }

        p.final = (p.raw - returnPoints) / 1000 + uma - penalty;
    });

    // オカ加算
    const winners = players.filter(p => p.rank === 1);
    if (winners.length > 0) {
        const bonus = (okaTotal / 1000 + poolBonus) / winners.length;
        winners.forEach(p => p.final += bonus);
    }

    // 反映
    players.forEach(p => {
        const score = Math.round(p.final * 10) / 10;
        p.card.querySelector('.player-rank-display').textContent = p.rank;
        p.card.querySelector('.player-rank').value = p.rank;
        p.card.querySelector('.player-final-score-display').textContent = (score > 0 ? '+' : '') + score.toFixed(1);
        p.card.querySelector('.player-final-score').value = score;

        // 報酬（見込み）: 1C(参加賞) + スコア10につき1C(端数切り上げ) + 四麻順位ボーナス
        const scoreBonus = score > 0 ? Math.ceil(score / 10) : 0;
        let rankBonus = 0;
        if (!isSanma) {
            const yonmaRankBonus = { 1: 5, 2: 3, 3: 1, 4: 0 };
            rankBonus = yonmaRankBonus[p.rank] || 0;
        }
        const reward = 1 + scoreBonus + rankBonus;
        p.card.querySelector('.player-reward-preview').textContent = reward.toLocaleString() + ' C';
    });
}

async function saveRecord() {
    const matchId = document.getElementById('match-id').value;
    const datetime = document.getElementById('event_datetime').value;
    const tournamentType = document.getElementById('tournament_type').value;
    const mahjongMode = document.getElementById('mahjong_mode').value;
    const isSanma = mahjongMode === '三麻';
    const matchMode = document.getElementById('match_mode').value;
    const handCount = parseInt(document.getElementById('hand_count').value) || 0;

    const playerRows = Array.from(document.querySelectorAll('.player-edit-card')).filter(c => c.style.display !== 'none');
    const updatePromises = [];
    const assetSyncPromises = [];
    const editSummary = [];

    const isIndividual = tournamentType.includes('個人');

    toggleLoading(true);

    try {
        for (const card of playerRows) {
            const recordId = card.querySelector('.player-record-id').value;
            if (!recordId) continue;

            const accountName = card.querySelector('.player-account-name').value;
            const teamName = isIndividual ? null : card.querySelector('.player-team-name').value;
            const rawPoints = parseInt(card.querySelector('.player-raw-points').value || 0);
            const finalScore = parseFloat(card.querySelector('.player-final-score').value || 0);
            const rank = parseInt(card.querySelector('.player-rank').value || 1);
            const winCount = parseInt(card.querySelector('.player-win-count').value || 0);
            const dealInCount = parseInt(card.querySelector('.player-deal-in-count').value || 0);
            const discordId = card.querySelector('.player-discord-id').value;

            // 差額の計算 (1C + 10pts=1C[切上] + 順位ボーナス)
            const oldScore = parseFloat(card.dataset.originalScore || 0);
            const oldRank = parseInt(card.dataset.originalRank || rank); // 元の順位も必要
            const oldDiscordId = card.dataset.originalDiscordId;

            const calcReward = (s, r, isS) => {
                const sBonus = s > 0 ? Math.ceil(s / 10) : 0;
                let rBonus = 0;
                if (!isS) {
                    rBonus = { 1: 5, 2: 3, 3: 1, 4: 0 }[r] || 0;
                }
                return 1 + sBonus + rBonus;
            };

            const oldReward = calcReward(oldScore, oldRank, isSanma);
            const newReward = calcReward(finalScore, rank, isSanma);
            const diff = newReward - oldReward;

            // レコード更新
            updatePromises.push(
                supabaseClient.from('match_results').update({
                    event_datetime: datetime,
                    tournament_type: tournamentType,
                    mahjong_mode: mahjongMode,
                    match_mode: matchMode,
                    account_name: accountName,
                    team_name: teamName,
                    raw_points: rawPoints,
                    final_score: finalScore,
                    rank: rank,
                    win_count: winCount,
                    deal_in_count: dealInCount,
                    hand_count: handCount,
                    discord_user_id: discordId
                }).eq('id', recordId)
            );

            // 資産同期 (discord_user_id がある場合のみ)
            if (discordId) {
                assetSyncPromises.push(syncUserAssets(discordId, diff));
                if (oldDiscordId && oldDiscordId !== discordId) {
                    assetSyncPromises.push(syncUserAssets(oldDiscordId, -oldReward));
                }
            } else if (oldDiscordId) {
                assetSyncPromises.push(syncUserAssets(oldDiscordId, -oldReward));
            }

            editSummary.push(`- **${accountName}**: ${oldScore}pts → ${finalScore}pts (差額: ${diff > 0 ? '+' : ''}${diff}C)`);
        }

        const results = await Promise.all(updatePromises);
        const errors = results.filter(r => r.error).map(r => r.error);
        if (errors.length > 0) throw errors[0];

        await Promise.all(assetSyncPromises);

        alert('記録を更新し、ユーザーの資産・総資産を同期しました。');
        recordModal.hide();
        fetchRecords();

        await sendDiscordEditLog(tournamentType, mahjongMode, matchId, editSummary);
    } catch (err) {
        console.error('保存エラー:', err);
        alert('保存に失敗しました: ' + err.message);
    } finally {
        toggleLoading(false);
    }
}

/**
 * ユーザーの coins と total_assets を同時に更新
 */
async function syncUserAssets(discordId, amount) {
    if (amount === 0) return;
    try {
        const { data, error: fError } = await supabaseClient
            .from('profiles')
            .select('coins, total_assets')
            .eq('discord_user_id', discordId)
            .single();

        if (fError) {
            console.warn(`プロフィール非存在 [${discordId}], 資産同期スキップ`);
            return;
        }

        const { error: uError } = await supabaseClient
            .from('profiles')
            .update({
                coins: (data.coins || 0) + amount,
                total_assets: (data.total_assets || 0) + amount
            })
            .eq('discord_user_id', discordId);

        if (uError) throw uError;

        // 内部用活動ログを記録
        await logActivity(discordId, 'admin_edit', {
            amount: amount,
            isInternal: true,
            details: { context: 'mahjong_edit_sync' }
        });
    } catch (err) {
        console.error(`資産同期エラー [${discordId}]:`, err);
    }
}

/**
 * 編集記録を Discord に送信
 */
async function sendDiscordEditLog(tournament, mode, matchId, summary) {
    const webhookUrl = 'https://discord.com/api/webhooks/1326462842407518290/h-sH-rB0N_O3r_H10BfQ80G-g0A_C3m_Dk_E';

    const embed = {
        title: '📝 大会記録 修正通知',
        description: `**大会:** ${tournament}\n**モード:** ${mode}\n**対局ID:** \`${matchId}\``,
        color: 0x007bff,
        fields: [{ name: '修正サマリー', value: summary.join('\n') }],
        timestamp: new Date().toISOString()
    };

    try {
        if (!webhookUrl || webhookUrl.includes('placeholder')) return;
        await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ embeds: [embed] })
        });
    } catch (err) {
        console.warn('Discord通知失敗:', err);
    }
}

async function fetchUsers() {
    const listBody = document.getElementById('users-list-body');
    if (!listBody) return;

    listBody.innerHTML = '<tr><td colspan="4" class="text-center">読み込み中...</td></tr>';

    try {
        const { data: users, error } = await supabaseClient.from('profiles').select('*').order('account_name');
        if (error) throw error;

        if (!users || users.length === 0) {
            listBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">ユーザーがいません</td></tr>';
            return;
        }

        listBody.innerHTML = '';
        users.forEach(user => {
            const tr = document.createElement('tr');
            const name = user.account_name || '名前なし';
            const discordId = user.discord_user_id || '';
            const coins = user.coins || 0;
            const teamName = user.team_name || '-';
            const avatarUrl = user.avatar_url || '';

            tr.innerHTML = `
                <td>
                    <div class="d-flex align-items-center gap-2">
                        <img src="${escapeHtml(avatarUrl)}" class="rounded-circle border" style="width: 32px; height: 32px;" onerror="this.style.display='none'">
                        <div>
                            <div class="fw-bold">${escapeHtml(name)}</div>
                            <div class="small text-muted" style="font-size: 0.7rem;">${escapeHtml(discordId)}</div>
                        </div>
                    </div>
                </td>
                <td><span class="badge bg-light text-dark border">🪙 ${coins.toLocaleString()}</span></td>
                <td>${escapeHtml(teamName)}</td>
                <td>
                    <div class="d-flex gap-1 flex-wrap">
                        <button class="btn btn-sm btn-outline-warning btn-coin" data-id="${escapeHtml(discordId)}" data-name="${escapeHtml(name)}" data-coins="${coins}">コイン</button>
                        <button class="btn btn-sm btn-outline-info btn-badge" data-id="${escapeHtml(discordId)}" data-name="${escapeHtml(name)}">バッジ</button>
                        <button class="btn btn-sm btn-outline-secondary btn-impersonate" data-id="${escapeHtml(discordId)}" data-name="${escapeHtml(name)}" data-avatar="${escapeHtml(avatarUrl)}">なりすまし</button>
                    </div>
                </td>
            `;
            listBody.appendChild(tr);
        });

        // イベントリスナーを追加
        listBody.querySelectorAll('.btn-coin').forEach(btn => {
            btn.addEventListener('click', function () {
                openCoinModal(this.dataset.id, this.dataset.name, parseInt(this.dataset.coins) || 0);
            });
        });
        listBody.querySelectorAll('.btn-badge').forEach(btn => {
            btn.addEventListener('click', function () {
                openBadgeGrantModal(this.dataset.id, this.dataset.name);
            });
        });
        listBody.querySelectorAll('.btn-impersonate').forEach(btn => {
            btn.addEventListener('click', function () {
                impersonateUser(this.dataset.id, this.dataset.name, this.dataset.avatar);
            });
        });

    } catch (err) {
        console.error('ユーザー取得エラー:', err);
        listBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">エラー: ${err.message}</td></tr>`;
    }
}

// HTMLエスケープ用ヘルパー関数
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function openCoinModal(userId, userName, currentCoins) {
    document.getElementById('coin-edit-user-id').value = userId;
    document.getElementById('coin-edit-user-name').textContent = userName;
    document.getElementById('coin-amount').value = currentCoins;
    new bootstrap.Modal(document.getElementById('coinModal')).show();
}

async function saveUserCoins() {
    const userId = document.getElementById('coin-edit-user-id').value;
    const newAmount = parseInt(document.getElementById('coin-amount').value) || 0;

    toggleLoading(true);
    try {
        // 現在の値を取得
        const { data: profile, error: fetchError } = await supabaseClient
            .from('profiles')
            .select('coins, total_assets')
            .eq('discord_user_id', userId)
            .single();

        if (fetchError) throw fetchError;

        const currentCoins = profile.coins || 0;
        const currentAssets = profile.total_assets || 0;
        const difference = newAmount - currentCoins;

        // coins と total_assets を更新
        const { error } = await supabaseClient.from('profiles').update({
            coins: newAmount,
            total_assets: currentAssets + difference
        }).eq('discord_user_id', userId);
        if (error) throw error;

        // 内部用活動ログを記録
        await logActivity(userId, 'admin_edit', {
            amount: difference,
            isInternal: true,
            details: { context: 'admin_coin_adjustment', new_balance: newAmount }
        });

        alert(`コインを更新しました（差額: ${difference >= 0 ? '+' : ''}${difference}）`);
        bootstrap.Modal.getInstance(document.getElementById('coinModal'))?.hide();
        fetchUsers();
    } catch (err) {
        console.error('コイン更新エラー:', err);
        alert('エラー: ' + err.message);
    } finally {
        toggleLoading(false);
    }
}

async function openBadgeGrantModal(userId, userName) {
    document.getElementById('badge-grant-user-id').value = userId;
    document.getElementById('badge-grant-user-name').textContent = userName;
    const ownedList = document.getElementById('badge-grant-owned-list');
    const availableList = document.getElementById('badge-grant-list');

    try {
        const { data: userBadges } = await supabaseClient.from('user_badges_new').select('*, badge:badges(*)').eq('user_id', userId);
        const { data: allBadges } = await supabaseClient.from('badges').select('*').order('name');

        // 所持バッジ（画像付き・剥奪ボタン付き）
        ownedList.innerHTML = (userBadges || []).map(ub => {
            const badge = ub.badge;
            if (!badge) return '';
            return `
                <div class="d-flex align-items-center gap-2 bg-light p-2 rounded me-2 mb-2" style="min-width: 150px;">
                    <img src="${badge.image_url || ''}" alt="${escapeHtml(badge.name)}" style="width: 32px; height: 32px; object-fit: contain; border-radius: 4px;">
                    <span class="small flex-grow-1">${escapeHtml(badge.name)}</span>
                    <button class="btn btn-outline-danger btn-sm py-0 px-1" onclick="revokeBadge('${userId}', '${badge.id}', '${escapeHtml(badge.name).replace(/'/g, "\\'")}')">×</button>
                </div>
            `;
        }).join('') || '<span class="text-muted">なし</span>';

        // 付与可能なバッジ一覧（画像付き）
        availableList.innerHTML = (allBadges || []).map(b => `
            <div class="col-6 col-md-4">
                <div class="form-check d-flex align-items-center gap-2 p-2 border rounded mb-1" style="cursor: pointer;" onclick="this.querySelector('input').click()">
                    <input class="form-check-input badge-grant-checkbox" type="checkbox" value="${b.id}" id="grant-${b.id}" onclick="event.stopPropagation()">
                    <img src="${b.image_url || ''}" alt="${escapeHtml(b.name)}" style="width: 28px; height: 28px; object-fit: contain; border-radius: 4px;">
                    <label class="form-check-label small flex-grow-1 mb-0" for="grant-${b.id}" style="cursor: pointer;">${escapeHtml(b.name)}</label>
                </div>
            </div>
        `).join('');

        new bootstrap.Modal(document.getElementById('badgeGrantModal')).show();
    } catch (err) {
        console.error('バッジ付与モーダルエラー:', err);
        alert('エラー: ' + err.message);
    }
}

async function grantBadge(userId, badgeId, badgeName) {
    if (!confirm(`「${badgeName}」を付与しますか？`)) return;
    toggleLoading(true);
    try {
        await supabaseClient.from('user_badges_new').insert([{ user_id: userId, badge_id: badgeId, purchased_price: 0 }]);
        openBadgeGrantModal(userId, document.getElementById('badge-grant-user-name').textContent);
    } catch (err) { alert(err.message); }
    finally { toggleLoading(false); }
}

async function grantMultiBadges() {
    const userId = document.getElementById('badge-grant-user-id').value;
    const userName = document.getElementById('badge-grant-user-name').textContent;
    const checkboxes = document.querySelectorAll('.badge-grant-checkbox:checked');

    if (checkboxes.length === 0) {
        alert('付与するバッジを選択してください');
        return;
    }

    if (!confirm(`${checkboxes.length}個のバッジを付与しますか？`)) return;

    toggleLoading(true);
    try {
        const inserts = Array.from(checkboxes).map(cb => ({
            user_id: userId,
            badge_id: cb.value,
            purchased_price: 0
        }));

        const { error } = await supabaseClient.from('user_badges_new').insert(inserts);
        if (error) throw error;

        alert(`${checkboxes.length}個のバッジを付与しました`);
        bootstrap.Modal.getInstance(document.getElementById('badgeGrantModal'))?.hide();
    } catch (err) {
        console.error('バッジ付与エラー:', err);
        alert('エラー: ' + err.message);
    } finally {
        toggleLoading(false);
    }
}

async function revokeBadge(userId, badgeId, badgeName) {
    if (!confirm(`「${badgeName}」を1つ剥奪しますか？`)) return;
    toggleLoading(true);
    try {
        const { data: targetRows } = await supabaseClient.from('user_badges_new').select('uuid').eq('user_id', userId).eq('badge_id', badgeId).limit(1);
        if (targetRows?.length > 0) {
            await supabaseClient.from('user_badges_new').delete().eq('uuid', targetRows[0].uuid);
            openBadgeGrantModal(userId, document.getElementById('badge-grant-user-name').textContent);
        }
    } catch (err) { alert(err.message); }
    finally { toggleLoading(false); }
}

async function fetchBadges() {
    const list = document.getElementById('badges-list');
    if (!list) return;
    try {
        const { data: badges } = await supabaseClient.from('badges').select('*').order('sort_order', { ascending: true });
        list.innerHTML = badges.map(badge => `
            <div class="col-md-4 col-lg-3">
                <div class="card h-100 shadow-sm border-0 badge-card">
                    <div class="card-body text-center">
                        <img src="${badge.image_url}" class="mb-3 badge-thumb shadow-sm" style="width: 64px; height: 64px; object-fit: contain;">
                        <h6 class="fw-bold mb-1">${badge.name}</h6>
                        <div class="mt-3 d-flex gap-1 justify-content-center">
                            <button onclick='openBadgeModal(${JSON.stringify(badge).replace(/'/g, "&apos;")})' class="btn btn-sm btn-outline-primary">編集</button>
                            <button onclick="deleteBadge('${badge.id}')" class="btn btn-sm btn-outline-danger">削除</button>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');
    } catch (err) { console.error(err); }
}

async function openBadgeModal(badge = null) {
    const form = document.getElementById('badge-form');
    form.reset();
    if (badge) {
        document.getElementById('badge-id').value = badge.id;
        document.getElementById('badge-name').value = badge.name;
        document.getElementById('badge-description').value = badge.description || '';
        document.getElementById('badge-image-url').value = badge.image_url;
        document.getElementById('badge-weight').value = badge.gacha_weight || 10;
        document.getElementById('badge-price').value = badge.price || 0;
        document.getElementById('badge-fixed-rarity').value = badge.fixed_rarity_name || '';
        document.getElementById('badge-requirements').value = badge.requirements || '';
        document.getElementById('badge-stock').value = badge.remaining_count !== null ? badge.remaining_count : 999;
        document.getElementById('badge-sort-order').value = badge.sort_order || 0;
        document.getElementById('badge-sales-type').value = badge.sales_type || '';
        document.getElementById('badge-gacha-eligible').checked = badge.is_gacha_eligible || false;
        document.getElementById('badge-shop-listed').checked = badge.is_shop_listed !== false; // デフォルト true
        document.getElementById('badge-owner').value = badge.discord_user_id || '';

        // 権利者表示を更新
        if (badge.discord_user_id) {
            const ownerLabel = document.getElementById('selected-owner-label');
            // ユーザー名を取得して表示(簡略化)
            ownerLabel.textContent = badge.discord_user_id;
        }
    } else {
        document.getElementById('badge-id').value = '';
        document.getElementById('badge-weight').value = 10;
        document.getElementById('badge-price').value = 0;
        document.getElementById('badge-stock').value = 999;
        document.getElementById('badge-sort-order').value = 0;
        document.getElementById('badge-sales-type').value = '';
        document.getElementById('badge-gacha-eligible').checked = false;
        document.getElementById('badge-shop-listed').checked = true; // 新規作成時はデフォルトで true
    }
    window.badgeModal.show();
}

async function saveBadge() {
    const id = document.getElementById('badge-id').value;
    const name = document.getElementById('badge-name').value;
    const description = document.getElementById('badge-description').value;
    let image_url = document.getElementById('badge-image-url').value;
    const imageFile = document.getElementById('badge-image-file').files[0];

    toggleLoading(true);
    try {
        if (imageFile) {
            const fileName = `${Math.random().toString(36).substring(2)}.${imageFile.name.split('.').pop()}`;
            await supabaseClient.storage.from('badges').upload(fileName, imageFile);
            const { data } = supabaseClient.storage.from('badges').getPublicUrl(fileName);
            image_url = data.publicUrl;
        }

        // 全カラムを取得
        const badgeData = {
            name,
            description,
            image_url,
            gacha_weight: parseInt(document.getElementById('badge-weight').value) || 0,
            price: parseInt(document.getElementById('badge-price').value) || 0,
            requirements: document.getElementById('badge-requirements').value.trim() || null,
            remaining_count: (() => {
                const val = document.getElementById('badge-stock').value;
                return val === '' ? null : parseInt(val);
            })(),
            sort_order: parseInt(document.getElementById('badge-sort-order').value) || 0,
            discord_user_id: document.getElementById('badge-owner').value.trim() || null,
            fixed_rarity_name: document.getElementById('badge-fixed-rarity').value.trim() || null,
            sales_type: document.getElementById('badge-sales-type').value || null,
            is_gacha_eligible: document.getElementById('badge-gacha-eligible').checked,
            is_shop_listed: document.getElementById('badge-shop-listed').checked
        };


        if (id) {
            const { error } = await supabaseClient.from('badges').update(badgeData).eq('id', id);
            if (error) throw error;
        } else {
            const { error } = await supabaseClient.from('badges').insert([badgeData]);
            if (error) throw error;
        }
        window.badgeModal.hide();
        fetchBadges();
    } catch (err) {
        console.error('バッジ保存エラー:', err);
        alert(`保存に失敗しました: ${err.message}\n\n詳細: ${JSON.stringify(err, null, 2)}`);
    }
    finally { toggleLoading(false); }
}

async function deleteBadge(id) {
    if (!confirm('削除しますか？')) return;
    await supabaseClient.from('badges').delete().eq('id', id);
    fetchBadges();
}

async function handleBulkBadgeUpload(event) {
    const files = Array.from(event.target.files);
    toggleLoading(true);
    for (const file of files) {
        try {
            const fileName = `${Math.random().toString(36).substring(2)}.${file.name.split('.').pop()}`;
            await supabaseClient.storage.from('badges').upload(fileName, file);
            const { data } = supabaseClient.storage.from('badges').getPublicUrl(fileName);
            await supabaseClient.from('badges').insert([{ name: file.name.replace(/\.[^/.]+$/, ''), image_url: data.publicUrl }]);
        } catch (err) { console.error(err); }
    }
    toggleLoading(false);
    fetchBadges();
}

async function exportBadgesToCSV() {
    const { data: badges } = await supabaseClient.from('badges').select('*');
    // 全カラムを含める
    const headers = [
        'id', 'name', 'description', 'image_url', 'gacha_weight', 'price',
        'requirements', 'remaining_count', 'sort_order', 'discord_user_id',
        'fixed_rarity_name', 'sales_type', 'is_gacha_eligible', 'is_shop_listed'
    ];
    const csvRows = [headers.join(',')];
    badges.forEach(b => csvRows.push(headers.map(h => {
        const value = b[h];
        // ブール値を文字列化
        if (typeof value === 'boolean') return value ? 'true' : 'false';
        // null/undefinedを空文字列に
        if (value === null || value === undefined) return '';
        // 文字列のエスケープ
        return `"${String(value).replace(/"/g, '""')}"`;
    }).join(',')));
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvRows.join('\n')], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'badges.csv';
    link.click();
}

async function handleBadgeCSVImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const text = e.target.result;

            // RFC4180準拠のCSVパーサー
            function parseCSV(text) {
                const rows = [];
                let currentRow = [];
                let currentField = '';
                let inQuotes = false;

                for (let i = 0; i < text.length; i++) {
                    const char = text[i];
                    const nextChar = text[i + 1];

                    if (inQuotes) {
                        if (char === '"' && nextChar === '"') {
                            // エスケープされたクォート
                            currentField += '"';
                            i++;
                        } else if (char === '"') {
                            // クォート終了
                            inQuotes = false;
                        } else {
                            currentField += char;
                        }
                    } else {
                        if (char === '"') {
                            inQuotes = true;
                        } else if (char === ',') {
                            currentRow.push(currentField);
                            currentField = '';
                        } else if (char === '\n') {
                            currentRow.push(currentField);
                            if (currentRow.some(f => f.trim() !== '')) {
                                rows.push(currentRow);
                            }
                            currentRow = [];
                            currentField = '';
                        } else if (char === '\r') {
                            // \r\n の場合、\r はスキップ
                            if (nextChar !== '\n') {
                                currentRow.push(currentField);
                                if (currentRow.some(f => f.trim() !== '')) {
                                    rows.push(currentRow);
                                }
                                currentRow = [];
                                currentField = '';
                            }
                        } else {
                            currentField += char;
                        }
                    }
                }

                // 最後のフィールドと行を追加
                if (currentField || currentRow.length > 0) {
                    currentRow.push(currentField);
                    if (currentRow.some(f => f.trim() !== '')) {
                        rows.push(currentRow);
                    }
                }

                return rows;
            }

            const rows = parseCSV(text);
            if (rows.length === 0) {
                alert('CSVファイルが空です。');
                return;
            }

            const headers = rows[0];
            const items = [];

            for (let i = 1; i < rows.length; i++) {
                const values = rows[i];
                const obj = {};

                headers.forEach((h, idx) => {
                    const value = values[idx] || '';
                    // 数値型カラムの変換
                    if (['gacha_weight', 'price', 'remaining_count', 'sort_order'].includes(h)) {
                        obj[h] = value ? parseInt(value) : null;
                    }
                    // ブール型カラムの変換
                    else if (h === 'is_gacha_eligible' || h === 'is_shop_listed') {
                        obj[h] = value.toUpperCase() === 'TRUE' || value === '1';
                    }
                    // その他は文字列
                    else {
                        obj[h] = value || null;
                    }
                });

                if (obj.name) items.push(obj);
            }

            if (items.length === 0) {
                alert('インポートするデータがありません。');
                return;
            }

            await supabaseClient.from('badges').upsert(items);
            alert(`${items.length}件のバッジをインポートしました。`);
            fetchBadges();
        } catch (err) {
            console.error('CSVインポートエラー:', err);
            alert(`CSVインポートに失敗しました: ${err.message}`);
        }
    };
    reader.readAsText(file);
}

function impersonateUser(id, name, avatar) {
    if (!confirm(`${name} として操作しますか？`)) return;
    localStorage.setItem('admin_impersonate_user', JSON.stringify({ discord_user_id: id, name, avatar_url: avatar }));
    window.location.href = '../mypage/index.html';
}

async function exportToCSV() {
    const headers = ['id', 'event_datetime', 'account_name', 'final_score', 'rank'];
    const csvRows = [headers.join(',')];
    filteredRecords.forEach(r => csvRows.push(headers.map(h => `"${String(r[h] || '').replace(/"/g, '""')}"`).join(',')));
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvRows.join('\n')], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'records.csv';
    link.click();
}

async function handleCSVImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        const lines = e.target.result.split('\n');
        const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
        const data = [];
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const values = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
            const obj = {};
            headers.forEach((h, idx) => obj[h] = values[idx]);
            if (obj.event_datetime) data.push(obj);
        }
        await supabaseClient.from('match_results').upsert(data);
        fetchRecords();
    };
    reader.readAsText(file);
}

async function fetchTeamRequests() {
    const { data: kicks } = await supabaseClient.from('team_admin_requests').select('*').eq('type', 'kick').eq('status', 'pending');
    const { data: diss } = await supabaseClient.from('team_admin_requests').select('*').eq('type', 'dissolution').eq('status', 'pending');
    const badge = document.getElementById('team-requests-badge');
    const count = (kicks?.length || 0) + (diss?.length || 0);
    if (badge) { badge.textContent = count; badge.style.display = count > 0 ? 'inline' : 'none'; }
}

async function approveKick(id) {
    const { data: req } = await supabaseClient.from('team_admin_requests').select('*').eq('id', id).single();
    await supabaseClient.from('profiles').update({ team_id: null }).eq('discord_user_id', req.target_discord_id);
    await supabaseClient.from('team_admin_requests').update({ status: 'approved' }).eq('id', id);
    fetchTeamRequests();
}

async function approveDissolution(id, teamId) {
    await supabaseClient.from('profiles').update({ team_id: null }).eq('team_id', teamId);
    await supabaseClient.from('teams').delete().eq('id', teamId);
    await supabaseClient.from('team_admin_requests').update({ status: 'approved' }).eq('id', id);
    fetchTeamRequests();
}

let currentLogsPage = 1;
const LOGS_PER_PAGE = 10;
let profilesCache = {};

async function loadProfilesCache() {
    const { data } = await supabaseClient.from('profiles').select('discord_user_id, account_name, avatar_url');
    profilesCache = {};
    if (data) data.forEach(p => profilesCache[p.discord_user_id] = { name: p.account_name, avatar: p.avatar_url });
}

async function fetchActivityLogs(page = 1) {
    currentLogsPage = page;
    if (Object.keys(profilesCache).length === 0) await loadProfilesCache();
    const from = (page - 1) * LOGS_PER_PAGE;
    const to = from + LOGS_PER_PAGE - 1;
    const { data: logs, count } = await supabaseClient.from('activity_logs').select('*', { count: 'exact' }).order('created_at', { ascending: false }).range(from, to);

    const listBody = document.getElementById('logs-list-body');
    if (listBody) {
        // テーブルヘッダーにチェックボックスを追加
        const thead = listBody.closest('table')?.querySelector('thead tr');
        if (thead && !thead.querySelector('.log-select-all')) {
            const th = document.createElement('th');
            th.innerHTML = `<input type="checkbox" class="form-check-input log-select-all" onchange="toggleAllLogs(this)">`;
            thead.insertBefore(th, thead.firstChild);
        }

        // 一括操作ボタンを追加
        const container = listBody.closest('.card-body') || listBody.parentElement;
        let bulkActions = document.getElementById('bulk-log-actions');
        if (!bulkActions) {
            bulkActions = document.createElement('div');
            bulkActions.id = 'bulk-log-actions';
            bulkActions.className = 'd-flex gap-2 mb-3 align-items-center';
            bulkActions.innerHTML = `
                <span class="text-muted small" id="selected-logs-count">0件選択中</span>
                <button class="btn btn-sm btn-danger" onclick="revertSelectedLogs()" id="bulk-revert-btn" disabled>
                    🗑️ 選択を一括取消
                </button>
            `;
            const table = listBody.closest('table');
            if (table) table.parentElement.insertBefore(bulkActions, table);
        }

        listBody.innerHTML = logs.map(log => {
            const u = profilesCache[log.user_id] || { name: '不明', avatar: '' };
            const target = log.target_user_id ? (profilesCache[log.target_user_id] || { name: '不明' }) : null;

            // アクションタイプのアイコンと日本語名
            const actionMap = {
                'badge_purchase': { icon: '🛒', label: 'バッジ購入' },
                'badge_sell': { icon: '💰', label: 'バッジ売却' },
                'badge_transfer': { icon: '🎁', label: 'バッジ譲渡' },
                'badge_receive': { icon: '📥', label: 'バッジ受取' },
                'gacha_draw': { icon: '🎰', label: 'ガチャ' },
                'coin_transfer': { icon: '💸', label: 'コイン送金' },
                'coin_receive': { icon: '📩', label: 'コイン受取' },
                'omikuji': { icon: '⛩️', label: 'おみくじ' },
                'ticket_transfer': { icon: '🎟️', label: 'チケット譲渡' },
                'ticket_receive': { icon: '🎫', label: 'チケット受取' },
                'admin_coin_adjust': { icon: '🔧', label: '管理者調整' }
            };
            const action = actionMap[log.action_type] || { icon: '📋', label: log.action_type };

            // 金額の表示
            const amountColor = log.amount > 0 ? 'text-success' : (log.amount < 0 ? 'text-danger' : '');
            const amountPrefix = log.amount > 0 ? '+' : '';
            const amountDisplay = log.amount !== null ? `${amountPrefix}${log.amount.toLocaleString()}` : '-';

            // 対象者の表示
            const targetDisplay = target ? `→ ${escapeHtml(target.name)}` : '';

            return `
                <tr>
                    <td>
                        <input type="checkbox" class="form-check-input log-checkbox" value="${log.id}" onchange="updateSelectedCount()">
                    </td>
                    <td>
                        <div class="small">${new Date(log.created_at).toLocaleDateString('ja-JP')}</div>
                        <div class="small text-muted">${new Date(log.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</div>
                    </td>
                    <td>
                        <div class="d-flex align-items-center gap-2">
                            <img src="${u.avatar || ''}" class="rounded-circle" style="width: 28px; height: 28px;" onerror="this.style.display='none'">
                            <span class="fw-bold">${escapeHtml(u.name)}</span>
                        </div>
                    </td>
                    <td>
                        <span class="badge bg-light text-dark border">
                            ${action.icon} ${action.label}
                        </span>
                    </td>
                    <td class="small text-muted">${targetDisplay}</td>
                    <td class="fw-bold ${amountColor}">${amountDisplay}</td>
                    <td><button onclick="revertLog('${log.id}')" class="btn btn-sm btn-outline-danger">🔄</button></td>
                </tr>
            `;
        }).join('');
    }

    const pageInfo = document.getElementById('logs-page-info');
    if (pageInfo) pageInfo.textContent = `${page} / ${Math.ceil(count / LOGS_PER_PAGE) || 1}`;
}

function changeLogsPage(delta) {
    fetchActivityLogs(currentLogsPage + delta);
}

async function revertLog(logId) {
    if (!confirm('取り消しますか？')) return;

    console.log('=== revertLog called ===');
    console.log('logId:', logId);
    console.log('logId type:', typeof logId);

    toggleLoading(true);
    try {
        const { data, error } = await supabaseClient.rpc('revert_activity_log', { p_log_id: logId });

        console.log('RPC response - data:', data);
        console.log('RPC response - error:', error);

        if (error) {
            console.error('RPC Error details:', JSON.stringify(error, null, 2));
            throw error;
        }

        if (data?.ok) {
            alert('成功');
            fetchActivityLogs();
        } else {
            alert('エラー: ' + (data?.error || '取消に失敗しました'));
        }
    } catch (err) {
        console.error('revertLog exception:', err);
        alert('エラーが発生しました: ' + err.message);
    }
    finally { toggleLoading(false); }
}

// 全選択/全解除
function toggleAllLogs(selectAllCheckbox) {
    const checkboxes = document.querySelectorAll('.log-checkbox');
    checkboxes.forEach(cb => cb.checked = selectAllCheckbox.checked);
    updateSelectedCount();
}

// 選択件数の更新
function updateSelectedCount() {
    const checkboxes = document.querySelectorAll('.log-checkbox:checked');
    const count = checkboxes.length;
    const countEl = document.getElementById('selected-logs-count');
    const btn = document.getElementById('bulk-revert-btn');

    if (countEl) countEl.textContent = `${count}件選択中`;
    if (btn) btn.disabled = count === 0;
}

// 選択したログを一括取り消し
async function revertSelectedLogs() {
    const checkboxes = document.querySelectorAll('.log-checkbox:checked');
    const logIds = Array.from(checkboxes).map(cb => cb.value);

    if (logIds.length === 0) {
        alert('取り消すログを選択してください');
        return;
    }

    if (!confirm(`${logIds.length}件のログを取り消しますか？\nこの操作は元に戻せません。`)) return;

    toggleLoading(true);
    let successCount = 0;
    let errorCount = 0;

    for (const logId of logIds) {
        try {
            const { data, error } = await supabaseClient.rpc('revert_activity_log', { p_log_id: logId });
            if (error) throw error;
            if (data?.ok) successCount++;
            else errorCount++;
        } catch (err) {
            console.error('一括取消エラー:', logId, err);
            errorCount++;
        }
    }

    toggleLoading(false);
    alert(`完了: ${successCount}件成功、${errorCount}件失敗`);
    fetchActivityLogs();
}
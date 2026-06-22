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

    initAdminBadgeFilters();
    initLogActionButtons();
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
            .select('*')
            .order('event_datetime', { ascending: false })
            .limit(10000); // 取得上限を10,000件に増加

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
    const accountMap = {}; // ID (DiscordID or Name) -> Label
    const tournamentSet = new Set();
    const teamSet = new Set();
    const modeSet = new Set();
    const matchModeSet = new Set();

    allRecords.forEach(r => {
        const aid = r.discord_user_id || r.account_name;
        if (aid && !accountMap[aid]) {
            accountMap[aid] = r.account_name || '不明';
        }

        if (r.tournament_type) tournamentSet.add(r.tournament_type);
        if (r.team_name) teamSet.add(r.team_name);
        if (r.mahjong_mode) modeSet.add(r.mahjong_mode);
        if (r.match_mode) matchModeSet.add(r.match_mode);
    });

    const accountOptions = Object.entries(accountMap).map(([id, name]) => ({ value: id, label: name }));
    renderCheckboxes('filter-accounts', accountOptions, 'accounts');

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

    // 文字列配列の場合はオブジェクト配列に変換
    const formattedOptions = options.map(opt => typeof opt === 'string' ? { value: opt, label: opt } : opt);

    container.innerHTML = formattedOptions.sort((a, b) => a.label.localeCompare(b.label, 'ja')).map(opt => `
        <div class="form-check p-0">
            <input type="checkbox" id="chk-${category}-${opt.value}" class="btn-check" 
                   value="${opt.value}" onchange="handleFilterChange('${category}', this)">
            <label class="filter-checkbox-label" for="chk-${category}-${opt.value}">${opt.label}</label>
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
    const searchInput = document.getElementById('filter-account-search');
    if (searchInput) {
        searchInput.value = '';
        searchFilterAccounts();
    }
    applyFiltersAndSort();
}

/**
 * アカウントフィルターの検索
 */
function searchFilterAccounts() {
    const query = document.getElementById('filter-account-search').value.toLowerCase();
    const labels = document.querySelectorAll('#filter-accounts .filter-checkbox-label');
    labels.forEach(label => {
        const text = label.textContent.toLowerCase();
        const container = label.closest('.form-check');
        if (container) {
            container.style.display = text.includes(query) ? 'block' : 'none';
        }
    });
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
    // 1. 各レコードが個別にフィルター条件に合致するか判定
    const matchingRecords = allRecords.filter(record => {
        const recordId = record.discord_user_id || record.account_name;
        const matchAccount = filterState.accounts.length === 0 || filterState.accounts.includes(recordId);
        const matchTournament = filterState.tournaments.length === 0 || filterState.tournaments.includes(record.tournament_type);
        const matchTeam = filterState.teams.length === 0 || filterState.teams.includes(record.team_name);
        const matchMode = filterState.modes.length === 0 || filterState.modes.includes(record.mahjong_mode);
        const matchMethod = filterState.match_modes.length === 0 || filterState.match_modes.includes(record.match_mode);
        return matchAccount && matchTournament && matchTeam && matchMode && matchMethod;
    });

    // 2. 合致したレコードが含まれる「対局(match_id)」を特定
    const matchingMatchIds = new Set(matchingRecords.map(r => r.match_id));

    // 3. その対局に含まれる「全レコード」を抽出対象とする
    filteredRecords = allRecords.filter(r => matchingMatchIds.has(r.match_id));

    // 4. ソート設定の適用
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

    displayRecords(filteredRecords, matchingRecords.map(r => r.id));
}

// 記録の表示
function displayRecords(records, highlightingIds = []) {
    const listBody = document.getElementById('records-list-body');
    if (!listBody) return;

    listBody.innerHTML = '';
    if (!records || records.length === 0) {
        listBody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">登録されている記録はありません</td></tr>';
        return;
    }

    // match_id でグループ化 (メタデータ保持のため)
    const matches = {};
    const matchOrder = [];

    records.forEach(r => {
        const mid = r.match_id || `no-id-${r.id}`;
        if (!matches[mid]) {
            matches[mid] = [];
            matchOrder.push(mid);
        }
        matches[mid].push(r);
    });

    // 試合単位で表示
    matchOrder.forEach(mid => {
        const matchRecords = matches[mid];
        // 同卓内は順位順で固定
        matchRecords.sort((a, b) => (a.rank || 99) - (b.rank || 99));

        const first = matchRecords[0];
        const tr = document.createElement('tr');
        const dateStr = new Date(first.event_datetime).toLocaleString('ja-JP', {
            year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
        });

        const accountsHtml = matchRecords.map(r => {
            const isHighlighted = highlightingIds.includes(r.id);
            const badgeClass = isHighlighted ? 'bg-primary text-white shadow-sm' : 'bg-light text-dark';
            const borderStyle = isHighlighted ? 'border: 2px solid var(--gold);' : '';
            return `
            <div class="mb-1">
                <span class="badge ${badgeClass}" style="min-width: 80px; ${borderStyle}">${r.account_name}</span>
            </div>
            `;
        }).join('');

        const scoresHtml = matchRecords.map(r => {
            const color = (r.final_score > 0) ? 'text-success' : (r.final_score < 0 ? 'text-danger' : '');
            return `<div class="fw-bold ${color} mb-1">${r.final_score !== null ? (r.final_score > 0 ? '+' : '') + r.final_score.toFixed(1) : '-'}</div>`;
        }).join('');

        const ranksHtml = matchRecords.map(r => `
            <div class="mb-1">${r.rank ? `<span class="badge bg-primary">${r.rank}位</span>` : '-'}</div>
        `).join('');

        tr.innerHTML = `
            <td data-label="日時">${dateStr}</td>
            <td data-label="プレイヤー">${accountsHtml}</td>
            <td data-label="大会 / モード">
                <div class="small fw-bold">${first.tournament_type || '-'}</div>
                <div class="small text-muted">${first.mahjong_mode || ''} / ${first.match_mode || ''}</div>
            </td>
            <td data-label="スコア">${scoresHtml}</td>
            <td data-label="順位">${ranksHtml}</td>
            <td data-label="局数">${first.hand_count || 1}局</td>
            <td data-label="操作">
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
            supabaseClient.from('profiles').select('account_name, discord_user_id').limit(10000),
            supabaseClient.from('teams').select('team_name').limit(1000)
        ]);

        if (pRes.error) throw pRes.error;
        if (tRes.error) throw tRes.error;

        const profiles = (pRes.data || []).sort((a, b) => (a.account_name || "").localeCompare(b.account_name || "", 'ja'));
        const teams = (tRes.data || []).sort((a, b) => (a.team_name || "").localeCompare(b.team_name || "", 'ja'));

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

            // もし記録のアカウント名がリストにない場合でも表示できるようにする
            if (currentAcc && !profiles.some(p => p.account_name === currentAcc)) {
                const opt = document.createElement('option');
                opt.value = currentAcc;
                opt.textContent = `${currentAcc} (不明なユーザー)`;
                opt.disabled = true;
                accSelect.appendChild(opt);
            }
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
    let matchId = document.getElementById('match-id').value;
    const isNewMatch = !matchId;

    // 新規対局の場合はUUIDを生成
    if (isNewMatch) {
        matchId = crypto.randomUUID();
    }

    const datetime = document.getElementById('event_datetime').value;
    const tournamentType = document.getElementById('tournament_type').value;
    const mahjongMode = document.getElementById('mahjong_mode').value;
    const isSanma = mahjongMode === '三麻';
    const matchMode = document.getElementById('match_mode').value;
    const handCount = parseInt(document.getElementById('hand_count').value) || 0;

    const playerRows = Array.from(document.querySelectorAll('.player-edit-card')).filter(c => c.style.display !== 'none');
    const logs = [];
    const assetSyncPromises = [];
    const editSummary = [];

    const isIndividual = tournamentType.includes('個人');

    toggleLoading(true);

    try {
        // 操作している管理者の情報を取得
        const currentUser = await getCurrentUser();
        const adminDiscordId = currentUser?.user_metadata?.provider_id || currentUser?.id;

        if (!adminDiscordId) {
            throw new Error('セッションが切れています。再ログインしてください。');
        }

        // 1. 各プレイヤーのデータ準備と資産同期
        for (const card of playerRows) {
            const accountName = card.querySelector('.player-account-name').value;
            const teamName = isIndividual ? null : card.querySelector('.player-team-name').value;
            const rawPoints = parseInt(card.querySelector('.player-raw-points').value || 0);
            const finalScore = parseFloat(card.querySelector('.player-final-score').value || 0);
            const rank = parseInt(card.querySelector('.player-rank').value || 1);
            const winCount = parseInt(card.querySelector('.player-win-count').value || 0);
            const dealInCount = parseInt(card.querySelector('.player-deal-in-count').value || 0);
            const discordId = card.querySelector('.player-discord-id').value;

            // 報酬計算用
            const oldScore = isNewMatch ? 0 : parseFloat(card.dataset.originalScore || 0);
            const oldRank = isNewMatch ? rank : parseInt(card.dataset.originalRank || rank);
            const oldDiscordId = isNewMatch ? null : card.dataset.originalDiscordId;

            const calcReward = (s, r, isS) => {
                const sBonus = s > 0 ? Math.ceil(s / 10) : 0;
                let rBonus = 0;
                if (!isS) {
                    rBonus = { 1: 5, 2: 3, 3: 1, 4: 0 }[r] || 0;
                }
                return 1 + sBonus + rBonus;
            };

            const oldReward = isNewMatch ? 0 : calcReward(oldScore, oldRank, isSanma);
            const newReward = calcReward(finalScore, rank, isSanma);
            const diff = newReward - oldReward;

            // インサート用データ
            logs.push({
                match_id: matchId,
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
                discord_user_id: discordId,
                submitted_by_discord_user_id: adminDiscordId // 操作者のIDをセット
            });

            // 資産同期
            if (discordId) {
                assetSyncPromises.push(syncUserAssets(discordId, diff));
                if (oldDiscordId && oldDiscordId !== discordId) {
                    assetSyncPromises.push(syncUserAssets(oldDiscordId, -oldReward));
                }
            } else if (oldDiscordId) {
                assetSyncPromises.push(syncUserAssets(oldDiscordId, -oldReward));
            }

            editSummary.push(`- **${accountName}**: ${isNewMatch ? '' : oldScore + ' → '}${finalScore}pts (${rank}位, 和了${winCount}/放銃${dealInCount}, 報酬: ${newReward}C)`);
        }

        // 2. 既存レコードの削除（重複キーエラー回避のため、対局単位で再構築）
        if (!isNewMatch) {
            const { error: delError } = await supabaseClient.from('match_results').delete().eq('match_id', matchId);
            if (delError) throw delError;
        }

        // 3. バルクインサート
        const { error: insError } = await supabaseClient.from('match_results').insert(logs);
        if (insError) throw insError;

        // 4. 資産同期の実行
        await Promise.all(assetSyncPromises);

        alert(isNewMatch ? '記録を新規追加しました。' : '記録を更新し、資産を同期しました。');
        recordModal.hide();
        fetchRecords();

        // 5. Discord通知
        await sendDiscordEditLog(isNewMatch ? '✨ 大会記録 新規追加' : '📝 大会記録 修正', tournamentType, mahjongMode, matchId, editSummary);

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
async function sendDiscordEditLog(title, tournament, mode, matchId, summary) {
    const webhookUrl = DISCORD_WEBHOOK_URL;

    const embed = {
        title: title,
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

    listBody.innerHTML = '<tr><td colspan="6" class="text-center">読み込み中...</td></tr>';

    try {
        const { data: users, error } = await supabaseClient.from('profiles').select('*').order('account_name');
        if (error) throw error;

        const filteredUsers = users || [];

        if (!filteredUsers || filteredUsers.length === 0) {
            listBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">ユーザーがいません</td></tr>';
            return;
        }

        listBody.innerHTML = '';
        filteredUsers.forEach(user => {
            const tr = document.createElement('tr');
            const name = user.account_name || '名前なし';
            const discordId = user.discord_user_id || '';
            const coins = user.coins || 0;
            const teamName = user.team_name || '-';
            const avatarUrl = user.avatar_url || '';
            const updatedAt = user.updated_at ? new Date(user.updated_at).toLocaleString('ja-JP') : '-';

            tr.innerHTML = `
                <td data-label="アバター">
                    <img src="${escapeHtml(avatarUrl)}" class="rounded-circle border" style="width: 32px; height: 32px;" onerror="this.style.display='none'">
                </td>
                <td class="fw-bold" data-label="Discord名 / ニックネーム">${escapeHtml(name)}</td>
                <td data-label="Discord ID">${escapeHtml(discordId)}</td>
                <td data-label="最終更新">${escapeHtml(updatedAt)}</td>
                <td data-label="所持金"><span class="badge bg-light text-dark border">💵 ${coins.toLocaleString()}</span></td>
                <td data-label="操作">
                    <div class="d-flex gap-1 flex-wrap">
                        <button class="btn btn-sm btn-outline-warning btn-coin" data-id="${escapeHtml(discordId)}" data-name="${escapeHtml(name)}" data-coins="${coins}">コイン</button>
                        <button class="btn btn-sm btn-outline-primary btn-items" data-id="${escapeHtml(discordId)}" data-name="${escapeHtml(name)}">アイテム</button>
                        <button class="btn btn-sm btn-outline-secondary btn-impersonate" data-id="${escapeHtml(discordId)}" data-name="${escapeHtml(name)}" data-avatar="${escapeHtml(avatarUrl)}">なりすまし</button>
                        <button class="btn btn-sm ${user.is_hidden ? 'btn-success' : 'btn-outline-danger'} btn-toggle-hidden" data-id="${escapeHtml(discordId)}" data-name="${escapeHtml(name)}" data-hidden="${user.is_hidden ? '1' : '0'}">
                            ${user.is_hidden ? '表示に戻す' : '非表示'}
                        </button>
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
        listBody.querySelectorAll('.btn-items').forEach(btn => {
            btn.addEventListener('click', function () {
                openItemsModal(this.dataset.id, this.dataset.name);
            });
        });
        listBody.querySelectorAll('.btn-impersonate').forEach(btn => {
            btn.addEventListener('click', function () {
                impersonateUser(this.dataset.id, this.dataset.name, this.dataset.avatar);
            });
        });
        listBody.querySelectorAll('.btn-toggle-hidden').forEach(btn => {
            btn.addEventListener('click', function () {
                toggleUserHidden(this.dataset.id, this.dataset.name, this.dataset.hidden === '1');
            });
        });

    } catch (err) {
        console.error('ユーザー取得エラー:', err);
        listBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger">エラー: ${err.message}</td></tr>`;
    }
}

async function toggleUserHidden(userId, userName, isHidden) {
    if (!userId) return;
    const nextHidden = !isHidden;
    const actionLabel = nextHidden ? '非表示にする' : '表示に戻す';
    if (!confirm(`${userName} を${actionLabel}しますか？`)) return;
    toggleLoading(true);
    try {
        const { error } = await supabaseClient
            .from('profiles')
            .update({ is_hidden: nextHidden })
            .eq('discord_user_id', userId);
        if (error) throw error;
        fetchUsers();
    } catch (err) {
        console.error('ユーザー非表示エラー:', err);
        alert('更新に失敗しました: ' + err.message);
    } finally {
        toggleLoading(false);
    }
}

async function openItemsModal(userId, userName) {
    document.getElementById('items-edit-user-id').value = userId;
    document.getElementById('items-edit-user-name').textContent = userName;
    const listEl = document.getElementById('items-exchange-list');
    listEl.innerHTML = '<div class="text-muted small">読み込み中...</div>';

    try {
        const [{ data: profile, error: pError }, { data: thresholds, error: tError }] = await Promise.all([
            supabaseClient.from('profiles').select('gacha_tickets, mangan_tickets, exchange_tickets').eq('discord_user_id', userId).maybeSingle(),
            supabaseClient.from('rarity_thresholds').select('rarity_name, threshold_value').order('threshold_value', { ascending: true })
        ]);
        if (pError) throw pError;
        if (tError) throw tError;

        const gacha = profile?.gacha_tickets || 0;
        const mangan = profile?.mangan_tickets || 0;
        const exchanges = profile?.exchange_tickets || {};

        document.getElementById('items-gacha').value = gacha;
        document.getElementById('items-mangan').value = mangan;

        const ordered = (thresholds || []).map(t => t.rarity_name).filter(Boolean);
        const extras = Object.keys(exchanges || {}).filter(k => !ordered.includes(k)).sort((a, b) => a.localeCompare(b, 'ja'));
        const allKeys = ordered.concat(extras);

        if (allKeys.length === 0) {
            listEl.innerHTML = '<div class="text-muted small">引換券がありません</div>';
        } else {
            listEl.innerHTML = allKeys.map(r => `
                <div class="d-flex align-items-center justify-content-between">
                    <div class="small fw-bold">${escapeHtml(r)}</div>
                    <input type="number" class="form-control form-control-sm exchange-input" style="width: 90px;"
                        data-rarity="${escapeHtml(r)}" value="${(exchanges[r] || 0)}" min="0">
                </div>
            `).join('');
        }

        new bootstrap.Modal(document.getElementById('itemsModal')).show();
    } catch (err) {
        console.error('アイテム取得エラー:', err);
        alert('アイテム取得に失敗しました');
    }
}

async function saveUserItems() {
    const userId = document.getElementById('items-edit-user-id').value;
    const gacha = parseInt(document.getElementById('items-gacha').value) || 0;
    const mangan = parseInt(document.getElementById('items-mangan').value) || 0;
    const exchange = {};
    document.querySelectorAll('#items-exchange-list .exchange-input').forEach(input => {
        const rarity = input.dataset.rarity;
        const val = parseInt(input.value) || 0;
        exchange[rarity] = val;
    });

    toggleLoading(true);
    try {
        const { error } = await supabaseClient.from('profiles').update({
            gacha_tickets: gacha,
            mangan_tickets: mangan,
            exchange_tickets: exchange
        }).eq('discord_user_id', userId);
        if (error) throw error;
        bootstrap.Modal.getInstance(document.getElementById('itemsModal'))?.hide();
        fetchUsers();
    } catch (err) {
        console.error('アイテム更新エラー:', err);
        alert('アイテム更新に失敗しました');
    } finally {
        toggleLoading(false);
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

let allAdminBadges = [];
let adminBadgeFilters = {
    search: '',
    sort: 'price_asc',
    rarity: '',
    creator: '',
    type: '',
    label: '',
    tag: '',
    method: '',
    unownedOnly: false
};
let adminRarityThresholds = [];
let adminRarityOrder = [];
let adminCirculationCounts = {};
let adminOwnedBadgeIds = new Set();
let adminCreatorMap = new Map();
let adminFilteredBadges = [];
const ADMIN_TAG_NONE = '__none__';
let currentBadgesPage = 1;
const BADGES_PER_PAGE = 24;

function initAdminBadgeFilters() {
    const searchEl = document.getElementById('admin-badge-search');
    const sortEl = document.getElementById('admin-badge-sort');
    const typeEl = document.getElementById('admin-badge-type');
    const labelEl = document.getElementById('admin-badge-label');
    const tagEl = document.getElementById('admin-badge-tag');
    const methodEl = document.getElementById('admin-badge-method');
    const unownedBtn = document.getElementById('admin-badge-unowned');
    const resetBtn = document.getElementById('admin-badge-reset');

    const onChange = () => {
        applyAdminBadgeFilters();
    };

    searchEl?.addEventListener('input', onChange);
    sortEl?.addEventListener('change', onChange);
    typeEl?.addEventListener('change', onChange);
    labelEl?.addEventListener('change', onChange);
    tagEl?.addEventListener('change', onChange);
    methodEl?.addEventListener('change', onChange);
    unownedBtn?.addEventListener('click', () => {
        adminBadgeFilters.unownedOnly = !adminBadgeFilters.unownedOnly;
        updateAdminUnownedButton();
        onChange();
    });
    resetBtn?.addEventListener('click', () => {
        resetAdminBadgeFilters();
        onChange();
    });
}

function resetAdminBadgeFilters() {
    const searchEl = document.getElementById('admin-badge-search');
    const sortEl = document.getElementById('admin-badge-sort');
    const typeEl = document.getElementById('admin-badge-type');
    const labelEl = document.getElementById('admin-badge-label');
    const tagEl = document.getElementById('admin-badge-tag');
    const methodEl = document.getElementById('admin-badge-method');

    if (searchEl) searchEl.value = '';
    if (sortEl) sortEl.value = 'price_asc';
    setAdminRarityFilter('', 'すべて');
    setAdminCreatorFilter('', 'すべて', '');
    if (typeEl) typeEl.value = '';
    if (labelEl) labelEl.value = '';
    if (tagEl) tagEl.value = '';
    if (methodEl) methodEl.value = '';

    adminBadgeFilters = {
        search: '',
        sort: 'price_asc',
        rarity: '',
        creator: '',
        type: '',
        label: '',
        tag: '',
        method: '',
        unownedOnly: false
    };
    updateAdminUnownedButton();
}

function updateAdminUnownedButton() {
    const unownedBtn = document.getElementById('admin-badge-unowned');
    if (!unownedBtn) return;
    unownedBtn.classList.toggle('btn-primary', adminBadgeFilters.unownedOnly);
    unownedBtn.classList.toggle('btn-outline-secondary', !adminBadgeFilters.unownedOnly);
    unownedBtn.textContent = adminBadgeFilters.unownedOnly ? '未所持のみ表示中' : '未所持のみ表示';
}

function getAdminBadgeTags(badge) {
    if (!badge) return [];
    const tags = badge.tags;
    if (!Array.isArray(tags)) return [];
    return tags.map(t => (t || '').trim()).filter(Boolean);
}

function isValidAvatarUrl(url) {
    return typeof url === 'string' && /^https?:\/\//.test(url);
}

function getAdminRarityOrder() {
    if (adminRarityThresholds && adminRarityThresholds.length) {
        return adminRarityThresholds.map(r => r.rarity_name).concat(['-']);
    }
    return ['測定不能', '神話', '至高', '幻想', '伝説', '極上', '特上', '貴重', '希少・Ⅱ', '希少・Ⅰ', '良質', '一般', '-'];
}

function getAdminDerived(badge) {
    const circulationCount = adminCirculationCounts[badge.id] || 0;
    const result = BadgeUtils.calculateBadgeValues(badge, circulationCount, adminRarityThresholds);
    return {
        assetValue: result.marketValue,
        rarityName: result.rarityName
    };
}

function getAdminRarityForBadge(badge) {
    return getAdminDerived(badge).rarityName;
}

function matchesAdminBadgeFilters(badge, opts, excludeKey = '') {
    if (opts.search && !(badge.name || '').toLowerCase().includes(opts.search)) return false;
    if (excludeKey !== 'method' && opts.method) {
        if (opts.method === 'shop' && !badge.is_shop_listed) return false;
        if (opts.method === 'gacha' && !badge.is_gacha_eligible) return false;
        if (opts.method === 'not_for_sale') {
            if (badge.is_shop_listed || badge.is_gacha_eligible) return false;
            if (badge.sales_type === '限定品' || badge.sales_type === '換金品') return false;
        }
    }
    if (excludeKey !== 'rarity' && opts.rarity) {
        if (getAdminRarityForBadge(badge) !== opts.rarity) return false;
    }
    if (excludeKey !== 'creator' && opts.creator && badge.discord_user_id !== opts.creator) return false;
    if (excludeKey !== 'type' && opts.type && badge.sales_type !== opts.type) return false;
    if (excludeKey !== 'label' && opts.label && (badge.label || '').trim() !== opts.label) return false;
    if (excludeKey !== 'tag' && opts.tag) {
        if (opts.tag === ADMIN_TAG_NONE) {
            if (getAdminBadgeTags(badge).length > 0) return false;
        } else if (!getAdminBadgeTags(badge).includes(opts.tag)) {
            return false;
        }
    }
    if (excludeKey !== 'unownedOnly' && opts.unownedOnly && adminOwnedBadgeIds.has(badge.id)) return false;
    return true;
}

function updateAdminFilterOptions() {
    const searchVal = (document.getElementById('admin-badge-search')?.value || '').toLowerCase();
    const currentRarity = document.getElementById('admin-badge-rarity')?.value || '';
    const currentCreator = document.getElementById('admin-badge-creator')?.value || '';
    const currentType = document.getElementById('admin-badge-type')?.value || '';
    const currentLabel = document.getElementById('admin-badge-label')?.value || '';
    const currentTag = document.getElementById('admin-badge-tag')?.value || '';
    const currentMethod = document.getElementById('admin-badge-method')?.value || '';

    const baseOpts = {
        search: searchVal,
        rarity: adminBadgeFilters.rarity,
        creator: adminBadgeFilters.creator,
        type: adminBadgeFilters.type,
        label: adminBadgeFilters.label,
        tag: adminBadgeFilters.tag,
        method: adminBadgeFilters.method,
        unownedOnly: adminBadgeFilters.unownedOnly
    };

    const baseForRarity = allAdminBadges.filter(b => matchesAdminBadgeFilters(b, baseOpts, 'rarity'));
    const baseForCreator = allAdminBadges.filter(b => matchesAdminBadgeFilters(b, baseOpts, 'creator'));
    const baseForType = allAdminBadges.filter(b => matchesAdminBadgeFilters(b, baseOpts, 'type'));
    const baseForLabel = allAdminBadges.filter(b => matchesAdminBadgeFilters(b, baseOpts, 'label'));
    const baseForTag = allAdminBadges.filter(b => matchesAdminBadgeFilters(b, baseOpts, 'tag'));
    const baseForMethod = allAdminBadges.filter(b => matchesAdminBadgeFilters(b, baseOpts, 'method'));

    const rarityCounts = {};
    baseForRarity.forEach(b => {
        const r = getAdminRarityForBadge(b) || '-';
        rarityCounts[r] = (rarityCounts[r] || 0) + 1;
    });
    buildAdminRarityMenuFromCounts(rarityCounts, currentRarity);

    const creatorCounts = {};
    baseForCreator.forEach(b => {
        if (!b.discord_user_id) return;
        creatorCounts[b.discord_user_id] = (creatorCounts[b.discord_user_id] || 0) + 1;
    });
    buildAdminCreatorMenuFromCounts(creatorCounts, currentCreator);

    const typeSelect = document.getElementById('admin-badge-type');
    if (typeSelect) {
        const counts = {};
        baseForType.forEach(b => {
            if (!b.sales_type) return;
            counts[b.sales_type] = (counts[b.sales_type] || 0) + 1;
        });
        const options = Object.entries(counts)
            .filter(([, c]) => c > 0)
            .sort((a, b) => a[0].localeCompare(b[0], 'ja'))
            .map(([t, c]) => `<option value="${t}">${t} (${c})</option>`)
            .join('');
        typeSelect.innerHTML = `<option value="">すべて</option>${options}`;
        typeSelect.value = Object.prototype.hasOwnProperty.call(counts, currentType) ? currentType : '';
    }

    const labelSelect = document.getElementById('admin-badge-label');
    if (labelSelect) {
        const counts = {};
        baseForLabel.forEach(b => {
            const label = (b.label || '').trim();
            if (!label) return;
            counts[label] = (counts[label] || 0) + 1;
        });
        const options = Object.entries(counts)
            .filter(([, c]) => c > 0)
            .sort((a, b) => a[0].localeCompare(b[0], 'ja'))
            .map(([l, c]) => `<option value="${l}">${l} (${c})</option>`)
            .join('');
        labelSelect.innerHTML = `<option value="">すべて</option>${options}`;
        labelSelect.value = Object.prototype.hasOwnProperty.call(counts, currentLabel) ? currentLabel : '';
    }

    const tagSelect = document.getElementById('admin-badge-tag');
    if (tagSelect) {
        const counts = {};
        let noneCount = 0;
        baseForTag.forEach(b => {
            const tags = getAdminBadgeTags(b);
            if (tags.length === 0) {
                noneCount += 1;
            } else {
                tags.forEach(tag => {
                    counts[tag] = (counts[tag] || 0) + 1;
                });
            }
        });
        const tagOptions = Object.entries(counts)
            .filter(([, c]) => c > 0)
            .sort((a, b) => a[0].localeCompare(b[0], 'ja'))
            .map(([t, c]) => `<option value="${t}">${t} (${c})</option>`)
            .join('');
        const noneOption = noneCount > 0 ? `<option value="${ADMIN_TAG_NONE}">未設定 (${noneCount})</option>` : '';
        tagSelect.innerHTML = `<option value="">すべて</option>${noneOption}${tagOptions}`;
        if (currentTag === ADMIN_TAG_NONE && noneCount > 0) {
            tagSelect.value = ADMIN_TAG_NONE;
        } else {
            tagSelect.value = Object.prototype.hasOwnProperty.call(counts, currentTag) ? currentTag : '';
        }
    }

    const methodSelect = document.getElementById('admin-badge-method');
    if (methodSelect) {
        const counts = {
            shop: baseForMethod.filter(b => b.is_shop_listed).length,
            gacha: baseForMethod.filter(b => b.is_gacha_eligible).length,
            not_for_sale: baseForMethod.filter(b => !b.is_shop_listed && !b.is_gacha_eligible && b.sales_type !== '限定品' && b.sales_type !== '換金品').length
        };
        const options = [];
        if (counts.shop > 0) options.push(`<option value="shop">ショップ販売中 (${counts.shop})</option>`);
        if (counts.gacha > 0) options.push(`<option value="gacha">ガチャ排出 (${counts.gacha})</option>`);
        if (counts.not_for_sale > 0) options.push(`<option value="not_for_sale">非売品 (${counts.not_for_sale})</option>`);
        methodSelect.innerHTML = `<option value="">すべて</option>${options.join('')}`;
        methodSelect.value = Object.keys(counts).includes(currentMethod) ? currentMethod : '';
    }
}

function setAdminRarityFilter(value, name) {
    const input = document.getElementById('admin-badge-rarity');
    const label = document.getElementById('admin-rarity-filter-label');
    if (input) input.value = value || '';
    if (label) label.textContent = name || 'すべて';
    applyAdminBadgeFilters();
}

function setAdminCreatorFilter(id, name, avatar) {
    const input = document.getElementById('admin-badge-creator');
    const label = document.getElementById('admin-creator-filter-label');
    const img = document.getElementById('admin-creator-filter-avatar');
    if (input) input.value = id || '';
    if (label) label.textContent = name || 'すべて';
    if (img) {
        if (avatar && isValidAvatarUrl(avatar)) {
            img.src = avatar;
            img.style.display = 'block';
        } else {
            img.style.display = 'none';
        }
    }
    applyAdminBadgeFilters();
}

function buildAdminCreatorMenuFromCounts(counts, currentCreator) {
    const menu = document.getElementById('admin-creator-filter-menu');
    const btn = document.getElementById('admin-creator-filter-btn');
    if (!menu || !btn) return;
    const items = Object.entries(counts)
        .map(([id, count]) => {
            const info = adminCreatorMap.get(id) || { name: id, avatar: '' };
            return { id, name: info.name || id, avatar: info.avatar || '', count };
        })
        .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    const merged = [{ id: '', name: 'すべて', avatar: '', count: 0 }].concat(items);
    menu.innerHTML = merged.map(item => `
        <div class="creator-item" data-id="${item.id}" data-name="${item.name}" data-avatar="${item.avatar || ''}">
            ${isValidAvatarUrl(item.avatar) ? `<img src="${item.avatar}" class="creator-avatar" style="display:block;">` : '<span class="creator-avatar" style="display:inline-block;"></span>'}
            <span>${item.name}</span>
            ${item.id ? `<span class="ms-auto text-muted small">(${item.count})</span>` : ''}
        </div>
    `).join('');
    menu.querySelectorAll('.creator-item').forEach(el => {
        el.addEventListener('click', () => {
            setAdminCreatorFilter(el.dataset.id, el.dataset.name, el.dataset.avatar);
            menu.style.display = 'none';
        });
    });
    if (!btn.dataset.bound) {
        btn.addEventListener('click', () => {
            menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
        });
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target) && !btn.contains(e.target)) {
                menu.style.display = 'none';
            }
        });
        btn.dataset.bound = '1';
    }
    if (!currentCreator || !items.some(i => i.id === currentCreator)) {
        const input = document.getElementById('admin-badge-creator');
        const label = document.getElementById('admin-creator-filter-label');
        const img = document.getElementById('admin-creator-filter-avatar');
        if (input) input.value = '';
        if (label) label.textContent = 'すべて';
        if (img) img.style.display = 'none';
    }
}

function buildAdminRarityMenuFromCounts(rarityCounts, currentRarity) {
    const menu = document.getElementById('admin-rarity-filter-menu');
    const btn = document.getElementById('admin-rarity-filter-btn');
    if (!menu || !btn) return;
    const ordered = adminRarityOrder.filter(r => rarityCounts[r]);
    const extras = Object.keys(rarityCounts).filter(r => !ordered.includes(r)).sort((a, b) => a.localeCompare(b, 'ja'));
    const items = [{ name: 'すべて', value: '' }]
        .concat(ordered.concat(extras).map(r => ({ name: r, value: r, count: rarityCounts[r] })));
    menu.innerHTML = items.map(item => {
        if (item.value === '') {
            return `<div class="creator-item" data-value="" data-name="すべて"><span>すべて</span></div>`;
        }
        const cls = getRarityClass(item.name);
        const displayName = cls ? item.name : '★???';
        const badgeClass = cls ? cls : 'rarity-unknown';
        return `
            <div class="creator-item" data-value="${item.value}" data-name="${item.name}">
                <span class="badge ${badgeClass} text-white" title="${item.name}">${displayName}</span>
                <span class="ms-auto text-muted small">(${item.count})</span>
            </div>
        `;
    }).join('');
    menu.querySelectorAll('.creator-item').forEach(el => {
        el.addEventListener('click', () => {
            setAdminRarityFilter(el.dataset.value, el.dataset.name);
            menu.style.display = 'none';
        });
    });
    if (!btn.dataset.bound) {
        btn.addEventListener('click', () => {
            menu.style.display = menu.style.display === 'block' ? 'none' : 'block';
        });
        document.addEventListener('click', (e) => {
            if (!menu.contains(e.target) && !btn.contains(e.target)) {
                menu.style.display = 'none';
            }
        });
        btn.dataset.bound = '1';
    }
    if (!currentRarity || !ordered.concat(extras).includes(currentRarity)) {
        const input = document.getElementById('admin-badge-rarity');
        const label = document.getElementById('admin-rarity-filter-label');
        if (input) input.value = '';
        if (label) label.textContent = 'すべて';
    }
}

function applyAdminBadgeFilters() {
    const searchVal = (document.getElementById('admin-badge-search')?.value || '').toLowerCase();
    const sortVal = document.getElementById('admin-badge-sort')?.value || 'price_asc';
    adminBadgeFilters.search = searchVal;
    adminBadgeFilters.sort = sortVal;
    adminBadgeFilters.rarity = document.getElementById('admin-badge-rarity')?.value || '';
    adminBadgeFilters.creator = document.getElementById('admin-badge-creator')?.value || '';
    adminBadgeFilters.type = document.getElementById('admin-badge-type')?.value || '';
    adminBadgeFilters.label = document.getElementById('admin-badge-label')?.value || '';
    adminBadgeFilters.tag = document.getElementById('admin-badge-tag')?.value || '';
    adminBadgeFilters.method = document.getElementById('admin-badge-method')?.value || '';

    updateAdminFilterOptions();

    let filtered = allAdminBadges.filter(b => matchesAdminBadgeFilters(b, adminBadgeFilters));

    filtered.forEach(b => {
        const derived = getAdminDerived(b);
        b._assetValue = derived.assetValue;
    });

    const sorters = {
        price_asc: (a, b) => (a._assetValue || 0) - (b._assetValue || 0),
        price_desc: (a, b) => (b._assetValue || 0) - (a._assetValue || 0),
        circulation_asc: (a, b) => (adminCirculationCounts[a.id] || 0) - (adminCirculationCounts[b.id] || 0),
        circulation_desc: (a, b) => (adminCirculationCounts[b.id] || 0) - (adminCirculationCounts[a.id] || 0),
        id_asc: (a, b) => (a.sort_order || 0) - (b.sort_order || 0),
        id_desc: (a, b) => (b.sort_order || 0) - (a.sort_order || 0),
        name: (a, b) => (a.name || '').localeCompare(b.name || '', 'ja')
    };
    filtered.sort(sorters[sortVal] || sorters.price_asc);

    adminFilteredBadges = filtered;
    renderAdminBadges();
}

async function hydrateAdminCreators() {
    adminCreatorMap = new Map();
    const creatorIds = [...new Set(allAdminBadges.map(b => b.discord_user_id).filter(Boolean))];
    if (creatorIds.length === 0) return;
    const { data } = await supabaseClient
        .from('profiles')
        .select('discord_user_id, account_name, avatar_url, is_hidden')
        .in('discord_user_id', creatorIds);
    (data || []).filter(c => !c.is_hidden).forEach(c => {
        adminCreatorMap.set(c.discord_user_id, { name: c.account_name || c.discord_user_id, avatar: c.avatar_url || '' });
    });
    creatorIds.forEach(id => {
        if (!adminCreatorMap.has(id)) {
            adminCreatorMap.set(id, { name: id, avatar: '' });
        }
    });
}

async function fetchBadges() {
    const list = document.getElementById('badges-list');
    if (!list) return;
    try {
        const user = await getCurrentUser();
        const currentUserId = user?.user_metadata?.provider_id || null;
        const [badgesRes, thresholdsRes, circulationRes, ownedRes] = await Promise.all([
            supabaseClient.from('badges').select('*').order('sort_order', { ascending: true }),
            supabaseClient.from('rarity_thresholds').select('*').order('threshold_value', { ascending: true }),
            supabaseClient.from('user_badges_new').select('badge_id'),
            currentUserId ? supabaseClient.from('user_badges_new').select('badge_id').eq('user_id', currentUserId) : Promise.resolve({ data: [] })
        ]);

        if (badgesRes.error) throw badgesRes.error;
        if (thresholdsRes.error) throw thresholdsRes.error;

        allAdminBadges = badgesRes.data || [];
        adminRarityThresholds = thresholdsRes.data || [];
        adminRarityOrder = getAdminRarityOrder();

        const counts = {};
        (circulationRes.data || []).forEach(item => {
            counts[item.badge_id] = (counts[item.badge_id] || 0) + 1;
        });
        adminCirculationCounts = counts;

        adminOwnedBadgeIds = new Set();
        (ownedRes.data || []).forEach(item => adminOwnedBadgeIds.add(item.badge_id));
        updateAdminUnownedButton();

        await hydrateAdminCreators();
        updateAdminFilterOptions();
        renderBadgeTagButtons();
        applyAdminBadgeFilters();
        await fetchBadgeTagRequests();
    } catch (err) {
        console.error(err);
        list.innerHTML = '<div class="col-12 text-center text-danger py-5">読み込みエラーが発生しました</div>';
    }
}

function renderAdminBadges() {
    const list = document.getElementById('badges-list');
    if (!list) return;
    const filtered = adminFilteredBadges || [];

    const countEl = document.getElementById('admin-badge-count');
    if (countEl) countEl.textContent = `${filtered.length} / ${allAdminBadges.length} 件`;

    if (filtered.length === 0) {
        list.innerHTML = '<div class="col-12 text-center text-muted py-5">該当するバッジがありません</div>';
        updateBadgesPagination(0, 0);
        return;
    }

    const totalPages = Math.ceil(filtered.length / BADGES_PER_PAGE);
    if (currentBadgesPage > totalPages) currentBadgesPage = totalPages;
    if (currentBadgesPage < 1) currentBadgesPage = 1;
    const start = (currentBadgesPage - 1) * BADGES_PER_PAGE;
    const pageItems = filtered.slice(start, start + BADGES_PER_PAGE);

    list.innerHTML = pageItems.map(badge => `
        <div class="col-md-4 col-lg-3">
            <div class="card h-100 shadow-sm border-0 badge-card" style="cursor: pointer;"
                onclick="window.location.href='../badge/index.html?id=${badge.id}'">
                <div class="card-body text-center">
                    <img src="${badge.image_url}" class="mb-3 badge-thumb shadow-sm" style="width: 64px; height: 64px; object-fit: contain;">
                    <h6 class="fw-bold mb-1">${badge.name}</h6>
                    <div class="mt-3 d-flex gap-1 justify-content-center">
                        <button onclick='event.stopPropagation(); openBadgeModal(${JSON.stringify(badge).replace(/'/g, "&apos;")})' class="btn btn-sm btn-outline-primary">編集</button>
                        <button onclick='event.stopPropagation(); openBadgeGrantUserModal(${JSON.stringify(badge).replace(/'/g, "&apos;")})' class="btn btn-sm btn-outline-success">付与</button>
                        <button onclick="event.stopPropagation(); deleteBadge('${badge.id}')" class="btn btn-sm btn-outline-danger">削除</button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
    updateBadgesPagination(filtered.length, totalPages);
}

async function fetchBadgeTagRequests() {
    const container = document.getElementById('badge-tag-requests');
    if (!container) return;
    try {
        const { data: requests, error } = await supabaseClient
            .from('badge_tag_requests')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });
        if (error) throw error;

        if (!requests || requests.length === 0) {
            container.innerHTML = '<p class="text-muted mb-0">申請はありません</p>';
            return;
        }

        const requesterIds = [...new Set(requests.map(r => r.requester_id).filter(Boolean))];
        const profileMap = new Map();
        if (requesterIds.length) {
            const { data: profiles } = await supabaseClient
                .from('profiles')
                .select('discord_user_id, account_name, avatar_url')
                .in('discord_user_id', requesterIds);
            (profiles || []).forEach(p => profileMap.set(p.discord_user_id, p));
        }

        const badgeMap = new Map((allAdminBadges || []).map(b => [b.id, b]));

        container.innerHTML = requests.map(req => {
            const badge = badgeMap.get(req.badge_id);
            const requester = profileMap.get(req.requester_id);
            const requesterName = requester?.account_name || req.requester_id || '不明';
            const tags = Array.isArray(req.requested_tags) ? req.requested_tags : [];
            const tagText = tags.map(t => `#${escapeHtml(t)}`).join(' ');
            const encodedTags = tags.join('|').replace(/'/g, "\\'");
            const badgeImg = badge?.image_url || '';
            return `
                <div class="d-flex align-items-center gap-3 p-2 border rounded mb-2">
                    <img src="${escapeHtml(badgeImg)}" alt="" style="width: 40px; height: 40px; object-fit: contain; border-radius: 6px; background: #f8f9fa;">
                    <div class="flex-grow-1">
                        <div class="fw-bold">${escapeHtml(requesterName)}</div>
                        <div class="small text-muted">${tagText || '-'}</div>
                    </div>
                    <div class="d-flex gap-2">
                        <button class="btn btn-sm btn-outline-primary"
                            onclick='event.stopPropagation(); openBadgeModal(${JSON.stringify(badge || {}).replace(/'/g, "&apos;")})'>編集</button>
                        <button class="btn btn-sm btn-success"
                            onclick="approveBadgeTagRequest('${req.id}', '${req.badge_id}', '${encodedTags}')">許可</button>
                        <button class="btn btn-sm btn-outline-danger"
                            onclick="rejectBadgeTagRequest('${req.id}')">拒否</button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('タグ申請取得エラー:', err);
        container.innerHTML = '<p class="text-danger mb-0">タグ申請の取得に失敗しました</p>';
    }
}

async function approveBadgeTagRequest(requestId, badgeId, tagsPipe) {
    const tags = (tagsPipe || '').split('|').map(t => t.trim()).filter(Boolean);
    try {
        if (tags.length === 0) return;
        const { error: badgeErr } = await supabaseClient
            .from('badges')
            .update({ tags })
            .eq('id', badgeId);
        if (badgeErr) throw badgeErr;

        const { error: reqErr } = await supabaseClient
            .from('badge_tag_requests')
            .update({ status: 'approved' })
            .eq('id', requestId);
        if (reqErr) throw reqErr;

        await fetchBadges();
        await fetchBadgeTagRequests();
    } catch (err) {
        console.error('タグ申請許可エラー:', err);
        alert('許可に失敗しました');
    }
}

async function rejectBadgeTagRequest(requestId) {
    try {
        const { error } = await supabaseClient
            .from('badge_tag_requests')
            .update({ status: 'rejected' })
            .eq('id', requestId);
        if (error) throw error;
        await fetchBadgeTagRequests();
    } catch (err) {
        console.error('タグ申請拒否エラー:', err);
        alert('拒否に失敗しました');
    }
}

let currentGrantBadge = null;

async function openBadgeGrantUserModal(badge) {
    currentGrantBadge = badge;
    const listEl = document.getElementById('badge-grant-user-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="text-center text-muted py-3">読み込み中...</div>';
    new bootstrap.Modal(document.getElementById('badgeGrantUserModal')).show();

    try {
        const { data: profiles, error } = await supabaseClient
            .from('profiles')
            .select('discord_user_id, account_name, avatar_url')
            .order('account_name');
        if (error) throw error;

        listEl.innerHTML = profiles.map(p => `
            <div class="d-flex align-items-center gap-2 p-2 border rounded mb-2" style="cursor:pointer;"
                onclick="grantBadgeToUser('${p.discord_user_id}', '${escapeHtml(p.account_name || p.discord_user_id).replace(/'/g, "\\'")}')">
                <img src="${p.avatar_url || 'https://cdn.discordapp.com/embed/avatars/0.png'}" style="width: 28px; height: 28px; border-radius: 50%;">
                <div class="fw-bold">${escapeHtml(p.account_name || p.discord_user_id)}</div>
            </div>
        `).join('');
    } catch (err) {
        console.error('ユーザー一覧取得エラー:', err);
        listEl.innerHTML = '<div class="text-center text-danger py-3">読み込み失敗</div>';
    }
}

async function grantBadgeToUser(userId, userName) {
    if (!currentGrantBadge) return;
    if (!confirm(`${userName} さんに「${currentGrantBadge.name}」を付与しますか？`)) return;
    toggleLoading(true);
    try {
        const { error } = await supabaseClient.from('user_badges_new').insert([{
            user_id: userId,
            badge_id: currentGrantBadge.id,
            purchased_price: 0
        }]);
        if (error) throw error;
        alert('付与しました');
        bootstrap.Modal.getInstance(document.getElementById('badgeGrantUserModal'))?.hide();
    } catch (err) {
        console.error('バッジ付与エラー:', err);
        alert('付与に失敗しました');
    } finally {
        toggleLoading(false);
    }
}

function updateBadgesPagination(totalItems, totalPages) {
    const area = document.getElementById('badges-pagination-area');
    const info = document.getElementById('badges-page-info');
    const prevBtn = document.getElementById('prev-badges-btn');
    const nextBtn = document.getElementById('next-badges-btn');
    if (!area || !info || !prevBtn || !nextBtn) return;

    if (!totalItems || totalPages <= 1) {
        area.style.display = 'none';
        info.textContent = '1 / 1';
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        return;
    }

    area.style.display = 'flex';
    info.textContent = `${currentBadgesPage} / ${totalPages}`;
    prevBtn.disabled = currentBadgesPage <= 1;
    nextBtn.disabled = currentBadgesPage >= totalPages;
}

function changeBadgesPage(delta) {
    currentBadgesPage += delta;
    renderAdminBadges();
}

async function openBadgeModal(badge = null) {
    const form = document.getElementById('badge-form');
    form.reset();

    // 権利者セレクトボックスにユーザー一覧を生成
    await populateBadgeOwnerSelect(badge?.discord_user_id || '');

    if (badge) {
        document.getElementById('badge-id').value = badge.id;
        document.getElementById('badge-name').value = badge.name;
        document.getElementById('badge-description').value = badge.description || '';
        document.getElementById('badge-label').value = badge.label || '';
        document.getElementById('badge-image-url').value = badge.image_url;
        document.getElementById('badge-image-url').value = badge.image_url;
        document.getElementById('badge-price').value = badge.price || 0;
        document.getElementById('badge-fixed-rarity').value = badge.fixed_rarity_name || '';
        document.getElementById('badge-requirements').value = badge.requirements || '';
        document.getElementById('badge-sort-order').value = badge.sort_order || 0;
        document.getElementById('badge-sales-type').value = badge.sales_type || '';
        document.getElementById('badge-gacha-eligible').value = badge.is_gacha_eligible || '';
        document.getElementById('badge-gacha-weight').value = badge.gacha_weight ?? 1;
        document.getElementById('badge-shop-listed').checked = badge.is_shop_listed !== false; // デフォルト true
        document.getElementById('badge-owner').value = badge.discord_user_id || '';
        document.getElementById('badge-tags').value = Array.isArray(badge.tags) ? badge.tags.join('|') : '';
    } else {
        document.getElementById('badge-id').value = '';
        document.getElementById('badge-gacha-weight').value = 1;
        document.getElementById('badge-price').value = 0;
        document.getElementById('badge-sort-order').value = 0;
        document.getElementById('badge-sales-type').value = '';
        document.getElementById('badge-label').value = '';
        document.getElementById('badge-tags').value = '';
        document.getElementById('badge-gacha-eligible').value = '';
        document.getElementById('badge-shop-listed').checked = true; // 新規作成時はデフォルトで true
    }
    renderBadgeTagButtons();
    window.badgeModal.show();
}

/**
 * 権利者セレクトボックスにユーザー一覧を動的生成
 */
async function populateBadgeOwnerSelect(selectedValue = '') {
    const hiddenInput = document.getElementById('badge-owner');
    const menu = document.getElementById('badge-owner-menu');
    const btn = document.getElementById('badge-owner-btn');
    const label = document.getElementById('badge-owner-label');
    const avatar = document.getElementById('badge-owner-avatar');
    if (!hiddenInput || !menu || !btn || !label || !avatar) return;

    try {
        const { data: profiles, error } = await supabaseClient
            .from('profiles')
            .select('discord_user_id, account_name, avatar_url')
            .order('account_name');

        if (error) throw error;

        const items = [
            { id: '', name: 'なし（権利者なし）', avatar: '' },
            ...(profiles || []).map(p => ({
                id: p.discord_user_id,
                name: p.account_name || p.discord_user_id,
                avatar: p.avatar_url || ''
            }))
        ];

        menu.innerHTML = items.map(item => `
            <li>
                <button class="dropdown-item d-flex align-items-center gap-2" type="button"
                    data-value="${item.id}" data-name="${item.name}" data-avatar="${item.avatar}">
                    ${item.avatar ? `<img src="${item.avatar}" style="width: 20px; height: 20px; border-radius: 50%;" onerror="this.style.display='none'">` : '<span style="width:20px;height:20px;display:inline-block;"></span>'}
                    <span>${item.name}</span>
                </button>
            </li>
        `).join('');

        const applySelection = (id, name, avatarUrl) => {
            hiddenInput.value = id || '';
            label.textContent = name || 'なし（権利者なし）';
            if (avatarUrl) {
                avatar.src = avatarUrl;
                avatar.style.display = 'inline-block';
            } else {
                avatar.style.display = 'none';
            }
            btn.dataset.value = id || '';
        };

        const current = items.find(i => i.id === selectedValue) || items[0];
        applySelection(current.id, current.name, current.avatar);

        menu.querySelectorAll('button[data-value]').forEach(btnEl => {
            btnEl.addEventListener('click', () => {
                const id = btnEl.getAttribute('data-value') || '';
                const name = btnEl.getAttribute('data-name') || 'なし（権利者なし）';
                const avatarUrl = btnEl.getAttribute('data-avatar') || '';
                applySelection(id, name, avatarUrl);
            });
        });
    } catch (err) {
        console.error('権利者リスト取得エラー:', err);
    }
}

function parseTags(value) {
    if (!value) return [];
    const raw = String(value).trim();
    if (!raw) return [];
    const sep = raw.includes('|') ? '|' : ',';
    return raw.split(sep).map(t => t.trim()).filter(Boolean);
}

function collectAllBadgeTags() {
    const set = new Set();
    (allAdminBadges || []).forEach(b => {
        const tags = Array.isArray(b.tags) ? b.tags : [];
        tags.forEach(t => {
            const tag = (t || '').trim();
            if (tag) set.add(tag);
        });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ja'));
}

function renderBadgeTagButtons() {
    const container = document.getElementById('badge-tag-buttons');
    if (!container) return;
    const input = document.getElementById('badge-tags');
    const current = new Set(parseTags(input?.value || '').map(t => t.toLowerCase()));
    const tags = collectAllBadgeTags();
    if (tags.length === 0) {
        container.innerHTML = '<span class="text-muted small">既存タグなし</span>';
        return;
    }
    container.innerHTML = tags.map(t => {
        const active = current.has(t.toLowerCase());
        const cls = active ? 'btn-primary' : 'btn-outline-secondary';
        return `<button type="button" class="btn btn-sm ${cls}" data-tag="${t}">${t}</button>`;
    }).join('');
    container.querySelectorAll('button[data-tag]').forEach(btn => {
        btn.addEventListener('click', () => {
            const tag = btn.getAttribute('data-tag') || '';
            toggleTagInInput(tag);
            renderBadgeTagButtons();
        });
    });
}

function toggleTagInInput(tag) {
    const input = document.getElementById('badge-tags');
    if (!input || !tag) return;
    const tags = parseTags(input.value);
    const idx = tags.findIndex(t => t.toLowerCase() === tag.toLowerCase());
    if (idx >= 0) {
        tags.splice(idx, 1);
    } else {
        tags.push(tag);
    }
    input.value = tags.join('|');
}

async function saveBadge() {
    const id = document.getElementById('badge-id').value;
    const name = document.getElementById('badge-name').value;
    const description = document.getElementById('badge-description').value;
    const label = document.getElementById('badge-label').value.trim();
    const tagsInput = document.getElementById('badge-tags')?.value || '';
    let image_url = document.getElementById('badge-image-url').value;
    const imageFile = document.getElementById('badge-image-file').files[0];

    const tags = parseTags(tagsInput);

    toggleLoading(true);
    try {
        if (imageFile) {
            const fileName = `${Math.random().toString(36).substring(2)}.${imageFile.name.split('.').pop()}`;
            await supabaseClient.storage.from('badges').upload(fileName, imageFile, {
                contentType: imageFile.type || 'image/png'
            });
            const { data } = supabaseClient.storage.from('badges').getPublicUrl(fileName);
            image_url = data.publicUrl;
        }

        // 全カラムを取得
        const badgeData = {
            name,
            description,
            label: label || null,
            image_url,
            price: parseInt(document.getElementById('badge-price').value) || 0,
            requirements: document.getElementById('badge-requirements').value.trim() || null,
            sort_order: parseInt(document.getElementById('badge-sort-order').value) || 0,
            discord_user_id: document.getElementById('badge-owner').value || null,
            fixed_rarity_name: document.getElementById('badge-fixed-rarity').value.trim() || null,
            sales_type: document.getElementById('badge-sales-type').value || null,
            is_gacha_eligible: document.getElementById('badge-gacha-eligible').value || null,
            gacha_weight: parseFloat(document.getElementById('badge-gacha-weight').value) || 1,
            is_shop_listed: document.getElementById('badge-shop-listed').checked,
            tags: tags.length ? tags : null
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
            await supabaseClient.storage.from('badges').upload(fileName, file, {
                contentType: file.type || 'image/png'
            });
            const { data } = supabaseClient.storage.from('badges').getPublicUrl(fileName);
            const badgeData = {
                name: file.name.replace(/\.[^/.]+$/, ''),
                image_url: data.publicUrl,
                description: null,
                label: null,
                tags: null,
                price: null,
                requirements: null,
                remaining_count: null,
                sort_order: null,
                discord_user_id: null,
                fixed_rarity_name: null,
                sales_type: null,
                is_gacha_eligible: null,
                gacha_weight: null,
                is_shop_listed: null
            };
            const { error } = await supabaseClient.from('badges').insert([badgeData]);
            if (error) throw error;
        } catch (err) { console.error(err); }
    }
    toggleLoading(false);
    fetchBadges();
}

async function exportBadgesToCSV() {
    const { data: badges } = await supabaseClient.from('badges').select('*');
    const headers = [
        'id', 'image_url', 'discord_user_id', 'sort_order', 'label', 'tags',
        'name', 'description', 'requirements', 'price', 'is_shop_listed',
        'sales_type', 'fixed_rarity_name', 'is_gacha_eligible', 'gacha_weight',
        'remaining_count'
    ];
    const rows = Array.isArray(badges) ? badges.slice() : [];
    rows.sort((a, b) => {
        const aVal = a?.sort_order;
        const bVal = b?.sort_order;
        const aNum = aVal === null || aVal === undefined || aVal === '' ? Infinity : Number(aVal);
        const bNum = bVal === null || bVal === undefined || bVal === '' ? Infinity : Number(bVal);
        if (!Number.isNaN(aNum) && !Number.isNaN(bNum) && aNum !== bNum) return aNum - bNum;
        const aId = String(a?.id || '');
        const bId = String(b?.id || '');
        return aId.localeCompare(bId);
    });
    const csvRows = [headers.join(',')];
    rows.forEach(b => csvRows.push(headers.map(h => {
        const value = b[h];
        if (h === 'tags') {
            const tags = Array.isArray(value) ? value : [];
            return `"${tags.join('|').replace(/"/g, '""')}"`;
        }
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

            const headerMap = {
                'gacha weight': 'gacha_weight',
                'gacha_weight': 'gacha_weight',
                'gacha-weight': 'gacha_weight',
                'gachaeligible': 'is_gacha_eligible',
                'gacha_eligible': 'is_gacha_eligible',
                'gacha-eligible': 'is_gacha_eligible'
            };
            const normalizeHeader = (raw) => {
                const cleaned = String(raw || '').trim().replace(/^"|"$/g, '');
                if (!cleaned) return '';
                const key = cleaned.toLowerCase().replace(/\s+/g, ' ').trim();
                return headerMap[key] || cleaned;
            };
            const headers = rows[0].map(normalizeHeader);
            const items = [];

            for (let i = 1; i < rows.length; i++) {
                const values = rows[i];
                const obj = {};

                headers.forEach((h, idx) => {
                    if (!h) return;
                    const value = values[idx] || '';
                    // 数値型カラムの変換
                    if (['price', 'remaining_count', 'sort_order'].includes(h)) {
                        obj[h] = value ? parseInt(value) : null;
                    }
                    else if (h === 'gacha_weight') {
                        obj[h] = value ? parseFloat(value) : null;
                    }
                    // ブール型カラムの変換
                    else if (h === 'is_shop_listed') {
                        obj[h] = value.toUpperCase() === 'TRUE' || value === '1';
                    }
                    // ガチャ対象（テキスト）
                    else if (h === 'is_gacha_eligible') {
                        const raw = value.trim();
                        if (!raw) {
                            obj[h] = null;
                        } else if (['true', '1', 'yes'].includes(raw.toLowerCase())) {
                            // 旧CSV互換: true の場合は妖怪として扱う
                            obj[h] = '妖怪';
                        } else if (['false', '0', 'no'].includes(raw.toLowerCase())) {
                            obj[h] = null;
                        } else {
                            obj[h] = raw;
                        }
                    }
                    // タグ配列
                    else if (h === 'tags') {
                        const tags = parseTags(value);
                        obj[h] = tags.length ? tags : null;
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
    const kickList = document.getElementById('kick-requests-list');
    const dissList = document.getElementById('dissolution-requests-list');

    const { data: kicks } = await supabaseClient.from('team_admin_requests').select('*').eq('type', 'kick').eq('status', 'pending');
    const { data: diss } = await supabaseClient.from('team_admin_requests').select('*').eq('type', 'dissolution').eq('status', 'pending');

    // バッジカウント更新
    const badge = document.getElementById('team-requests-badge');
    const count = (kicks?.length || 0) + (diss?.length || 0);
    if (badge) { badge.textContent = count; badge.style.display = count > 0 ? 'inline' : 'none'; }

    // プロフィールとチーム情報を取得
    if (Object.keys(profilesCache).length === 0) await loadProfilesCache();
    const { data: teams } = await supabaseClient.from('teams').select('id, name');
    const teamsMap = {};
    if (teams) teams.forEach(t => teamsMap[t.id] = t.name);

    const gameLabel = (req) => req.game_type === 'poker'
        ? '<span class="badge bg-primary me-1">🃏 ポーカー</span>'
        : '<span class="badge bg-secondary me-1">🀄 麻雀</span>';

    // 追放申請リスト
    if (kickList) {
        if (!kicks || kicks.length === 0) {
            kickList.innerHTML = '<p class="text-muted">申請はありません</p>';
        } else {
            kickList.innerHTML = kicks.map(req => {
                const requester = profilesCache[req.requester_discord_id] || { name: '不明', avatar: '' };
                const target = profilesCache[req.target_discord_id] || { name: req.target_name || '不明', avatar: '' };
                return `
                    <div class="card mb-2 p-3">
                        <div class="d-flex align-items-center justify-content-between">
                            <div>
                                <div class="mb-1">${gameLabel(req)}<span class="small text-muted">申請者: ${escapeHtml(requester.name)}</span></div>
                                <div><strong>対象:</strong> ${escapeHtml(target.name)}</div>
                                <div class="small text-muted">チーム: ${escapeHtml(req.team_name || '不明')}</div>
                                ${req.reason ? `<div class="small text-muted mt-1">理由: ${escapeHtml(req.reason)}</div>` : ''}
                            </div>
                            <div class="d-flex gap-2">
                                <button class="btn btn-success btn-sm" onclick="approveKick('${req.id}')">承認</button>
                                <button class="btn btn-outline-secondary btn-sm" onclick="rejectRequest('${req.id}')">却下</button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    // 解散申請リスト
    if (dissList) {
        if (!diss || diss.length === 0) {
            dissList.innerHTML = '<p class="text-muted">申請はありません</p>';
        } else {
            dissList.innerHTML = diss.map(req => {
                const requester = profilesCache[req.requester_discord_id] || { name: '不明', avatar: '' };
                const teamName = req.team_name || teamsMap[req.team_id] || '不明なチーム';
                return `
                    <div class="card mb-2 p-3">
                        <div class="d-flex align-items-center justify-content-between">
                            <div>
                                <div class="mb-1">${gameLabel(req)}<span class="small text-muted">申請者: ${escapeHtml(requester.name)}</span></div>
                                <div><strong>チーム:</strong> ${escapeHtml(teamName)}</div>
                                ${req.reason ? `<div class="small text-muted mt-1">理由: ${escapeHtml(req.reason)}</div>` : ''}
                            </div>
                            <div class="d-flex gap-2">
                                <button class="btn btn-danger btn-sm" onclick="approveDissolution('${req.id}', '${req.team_id}', '${req.game_type || ''}')">承認（解散）</button>
                                <button class="btn btn-outline-secondary btn-sm" onclick="rejectRequest('${req.id}')">却下</button>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }
}

async function rejectRequest(id) {
    await supabaseClient.from('team_admin_requests').update({ status: 'rejected' }).eq('id', id);
    fetchTeamRequests();
}

async function approveKick(id) {
    const { data: req } = await supabaseClient.from('team_admin_requests').select('*').eq('id', id).single();
    if (req.game_type === 'poker') {
        await supabaseClient.from('poker_profiles').update({ team_id: null }).eq('discord_user_id', req.target_discord_id);
    } else {
        await supabaseClient.from('profiles').update({ team_id: null }).eq('discord_user_id', req.target_discord_id);
    }
    await supabaseClient.from('team_admin_requests').update({ status: 'approved' }).eq('id', id);
    fetchTeamRequests();
}

async function approveDissolution(id, teamId, gameType) {
    if (gameType === 'poker') {
        await supabaseClient.from('poker_profiles').update({ team_id: null }).eq('team_id', teamId);
        await supabaseClient.from('poker_teams').delete().eq('id', teamId);
    } else {
        await supabaseClient.from('profiles').update({ team_id: null }).eq('team_id', teamId);
        await supabaseClient.from('teams').delete().eq('id', teamId);
    }
    await supabaseClient.from('team_admin_requests').update({ status: 'approved' }).eq('id', id);
    fetchTeamRequests();
}

let currentLogsPage = 1;
const LOGS_PER_PAGE = 10;
let profilesCache = {};
let badgesCache = {};
let logActionTypes = [];
let selectedLogUsers = new Set();

async function loadProfilesCache() {
    const { data } = await supabaseClient.from('profiles').select('discord_user_id, account_name, avatar_url');
    profilesCache = {};
    if (data) data.forEach(p => profilesCache[p.discord_user_id] = { name: p.account_name, avatar: p.avatar_url });
}

async function loadBadgesCache() {
    const { data } = await supabaseClient.from('badges').select('id, name, image_url');
    badgesCache = {};
    if (data) data.forEach(b => badgesCache[b.id] = { name: b.name, image: b.image_url });
}

function initLogActionButtons() {
    const container = document.getElementById('log-action-buttons');
    if (!container) return;
    loadLogActionTypes()
        .then(buildLogActionButtons)
        .catch(err => console.error('ログ種別の初期化に失敗:', err));
}

function buildLogActionButtons() {
    const container = document.getElementById('log-action-buttons');
    if (!container) return;
    const current = new Set(getSelectedLogActions());
    const labels = {
        gacha_draw: '🎰 ガチャ',
        transfer_send: '💸 送金',
        transfer_receive: '📩 受取',
        badge_purchase: '🛒 バッジ購入',
        badge_sell: '💵 バッジ売却',
        badge_transfer: '🎁 バッジ譲渡',
        badge_receive: '📥 バッジ受取',
        royalty_receive: '💎 ロイヤリティ受取',
        ticket_transfer: '🎟️ チケット譲渡',
        ticket_receive: '🎫 チケット受取',
        omikuji: '⛩️ おみくじ',
        mahjong: '🀄 麻雀',
        admin_edit: '🔧 管理者調整',
        'レアリティ改定調整': '🧪 レアリティ改定調整'
    };
    const preferredOrder = [
        'gacha_draw', 'mahjong', 'omikuji',
        'transfer_send', 'transfer_receive',
        'badge_purchase', 'badge_sell', 'badge_transfer', 'badge_receive', 'royalty_receive',
        'ticket_transfer', 'ticket_receive',
        'admin_edit', 'レアリティ改定調整'
    ];
    const known = logActionTypes.filter(t => preferredOrder.includes(t));
    const unknown = logActionTypes.filter(t => !preferredOrder.includes(t)).sort((a, b) => a.localeCompare(b));
    const ordered = [...new Set([...known, ...unknown])];
    container.innerHTML = ordered.map(type => {
        const label = labels[type] || type;
        const active = current.has(type);
        return `<button type="button" class="btn btn-sm btn-outline-secondary log-filter-btn ${active ? 'active' : ''}" data-action="${type}">${label}</button>`;
    }).join('');
    container.querySelectorAll('.log-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            btn.classList.toggle('active');
            fetchActivityLogs(1);
        });
    });
}

async function loadLogActionTypes() {
    if (logActionTypes.length) return;
    logActionTypes = [
        'gacha_draw',
        'transfer_send',
        'transfer_receive',
        'badge_purchase',
        'badge_sell',
        'badge_transfer',
        'badge_receive',
        'royalty_receive',
        'ticket_transfer',
        'ticket_receive',
        'omikuji',
        'mahjong',
        'admin_edit',
        'レアリティ改定調整'
    ];
}

function handleLogUserFilterChange() {
    fetchActivityLogs(1);
}

function getSelectedLogUserIds() {
    return Array.from(selectedLogUsers);
}

function getSelectedLogActions() {
    const container = document.getElementById('log-action-buttons');
    if (!container) return [];
    return Array.from(container.querySelectorAll('.log-filter-btn.active'))
        .map(btn => btn.getAttribute('data-action'))
        .filter(Boolean);
}

function populateLogUserFilterOptions() {
    const list = document.getElementById('log-user-list');
    if (!list) return;
    const search = (document.getElementById('log-user-search')?.value || '').toLowerCase();
    const options = Object.entries(profilesCache)
        .map(([id, info]) => ({ id, name: info.name || id, avatar: info.avatar || '' }))
        .filter(o => !search || (o.name || '').toLowerCase().includes(search) || o.id.includes(search))
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'));
    list.innerHTML = options.map(o => `
        <label class="log-user-item">
            <input type="checkbox" class="form-check-input" data-id="${o.id}" ${selectedLogUsers.has(o.id) ? 'checked' : ''}>
            <img src="${escapeHtml(o.avatar)}" class="log-user-avatar" onerror="this.style.display='none'">
            <span>${escapeHtml(o.name)}</span>
        </label>
    `).join('');
}

function renderLogUserChips() {
    const wrap = document.getElementById('log-user-chips');
    if (!wrap) return;
    if (selectedLogUsers.size === 0) {
        wrap.innerHTML = '';
        return;
    }
    wrap.innerHTML = Array.from(selectedLogUsers).map(id => {
        const info = profilesCache[id] || { name: id, avatar: '' };
        return `
            <span class="log-user-chip">
                ${info.avatar ? `<img src="${escapeHtml(info.avatar)}" class="log-user-avatar" onerror="this.style.display='none'">` : ''}
                ${escapeHtml(info.name || id)}
                <button type="button" onclick="removeLogUser('${id}')">×</button>
            </span>
        `;
    }).join('');
}

function removeLogUser(id) {
    selectedLogUsers.delete(id);
    populateLogUserFilterOptions();
    renderLogUserChips();
    fetchActivityLogs(1);
}

function initLogUserFilter() {
    const btn = document.getElementById('log-user-filter-btn');
    const dropdown = document.getElementById('log-user-dropdown');
    const search = document.getElementById('log-user-search');
    const applyBtn = document.getElementById('log-user-apply');
    const clearBtn = document.getElementById('log-user-clear');
    if (!btn || !dropdown) return;
    if (btn.dataset.bound) return;

    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropdown.classList.toggle('show');
        populateLogUserFilterOptions();
    });
    dropdown.addEventListener('click', (e) => {
        e.stopPropagation();
    });
    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
            dropdown.classList.remove('show');
        }
    });
    search?.addEventListener('input', populateLogUserFilterOptions);
    clearBtn?.addEventListener('click', () => {
        selectedLogUsers.clear();
        populateLogUserFilterOptions();
        renderLogUserChips();
    });
    applyBtn?.addEventListener('click', () => {
        const list = document.getElementById('log-user-list');
        if (list) {
            selectedLogUsers.clear();
            list.querySelectorAll('input[type="checkbox"]').forEach(cb => {
                if (cb.checked) selectedLogUsers.add(cb.getAttribute('data-id'));
            });
        }
        dropdown.classList.remove('show');
        renderLogUserChips();
        fetchActivityLogs(1);
    });
    btn.dataset.bound = '1';
}

async function fetchActivityLogs(page = 1) {
    currentLogsPage = page;
    if (Object.keys(profilesCache).length === 0) await loadProfilesCache();
    if (Object.keys(badgesCache).length === 0) await loadBadgesCache();
    await loadLogActionTypes();
    buildLogActionButtons();
    initLogUserFilter();
    populateLogUserFilterOptions();
    renderLogUserChips();

    const from = (page - 1) * LOGS_PER_PAGE;
    const to = from + LOGS_PER_PAGE - 1;

    // フィルターの取得
    const actionFilter = getSelectedLogActions();
    const userFilter = getSelectedLogUserIds();

    let query = supabaseClient.from('activity_logs').select('*', { count: 'exact' });

    if (userFilter.length > 0) {
        const safeIds = userFilter.map(id => `"${String(id).replace(/"/g, '\\"')}"`).join(',');
        query = query.or(`user_id.in.(${safeIds}),target_user_id.in.(${safeIds})`);
    }

    // アクションフィルターの適用
    if (actionFilter.length > 0) {
        query = query.in('action_type', actionFilter);
    }

    const { data: logs, count } = await query.order('created_at', { ascending: false }).range(from, to);

    const listBody = document.getElementById('logs-list-body');
    if (listBody) {
        // ... (前のチェックボックス管理ロジック)
        const thead = listBody.closest('table')?.querySelector('thead tr');
        if (thead && !thead.querySelector('.log-select-all')) {
            const th = document.createElement('th');
            th.innerHTML = `<input type="checkbox" class="form-check-input log-select-all" onchange="toggleAllLogs(this)">`;
            thead.insertBefore(th, thead.firstChild);
        }

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
            let details = log.details;
            if (typeof details === 'string') {
                try { details = JSON.parse(details); } catch (e) { details = {}; }
            }

            // アクションタイプのアイコンと日本語名
            const actionMap = {
                'badge_purchase': { icon: '🛒', label: 'バッジ購入' },
                'badge_sell': { icon: '💵', label: 'バッジ売却' },
                'badge_transfer': { icon: '🎁', label: 'バッジ譲渡' },
                'badge_receive': { icon: '📥', label: 'バッジ受取' },
                'royalty_receive': { icon: '💎', label: 'ロイヤリティ受取' },
                'gacha_draw': { icon: '🎰', label: 'ガチャ' },
                'coin_transfer': { icon: '💸', label: 'コイン送金' },
                'coin_receive': { icon: '📩', label: 'コイン受取' },
                'transfer_send': { icon: '💸', label: '送金' },
                'transfer_receive': { icon: '📩', label: '受取' },
                'omikuji': { icon: '⛩️', label: 'おみくじ' },
                'ticket_transfer': { icon: '🎟️', label: 'チケット譲渡' },
                'ticket_receive': { icon: '🎫', label: 'チケット受取' },
                'admin_edit': { icon: '🔧', label: '管理者調整' },
                'レアリティ改定調整': { icon: '🧪', label: 'レアリティ改定調整' }
            };
            const action = actionMap[log.action_type] || { icon: '📋', label: log.action_type };

            // 金額の表示
            const amountColor = log.amount > 0 ? 'text-success' : (log.amount < 0 ? 'text-danger' : '');
            const amountPrefix = log.amount > 0 ? '+' : '';
            const amountDisplay = log.amount !== null ? `${amountPrefix}${log.amount.toLocaleString()}` : '-';

            // 対象者・バッジ・詳細の表示
            let targetDisplay = target ? `→ ${escapeHtml(target.name)}` : '';
            if (!targetDisplay) {
                if (details?.target_name) targetDisplay = `→ ${escapeHtml(details.target_name)}`;
                if (details?.sender_name) targetDisplay = `← ${escapeHtml(details.sender_name)}`;
            }

            // バッジ表示の追加
            if (log.badge_id && badgesCache[log.badge_id]) {
                const b = badgesCache[log.badge_id];
                targetDisplay += `
                    <div class="d-flex align-items-center gap-1 mt-1 bg-white border rounded px-1 py-0" style="width: fit-content;">
                        <img src="${b.image || ''}" style="width: 16px; height: 16px; object-fit: contain;">
                        <span style="font-size: 0.75rem;">${escapeHtml(b.name)}</span>
                    </div>
                `;
            }

            const detailParts = [];
            let extraDetailsHtml = '';
            if (details?.badge_name) detailParts.push(`バッジ: ${details.badge_name}`);
            if (details?.quantity) detailParts.push(`数量: ${details.quantity}`);
            if (details?.unit_price) detailParts.push(`単価: ${Number(details.unit_price).toLocaleString()}`);
            if (details?.method) detailParts.push(`方法: ${details.method}`);
            if (details?.buyer) detailParts.push(`購入者: ${details.buyer}`);
            if (details?.is_mutant === true) detailParts.push('変異: あり');
            if (details?.badge_uuid) detailParts.push(`UUID: ${details.badge_uuid}`);
            if (log.action_type === 'gacha_draw') {
                const badgeIds = Array.isArray(details?.result_badge_ids) ? details.result_badge_ids : [];
                if (badgeIds.length > 1) {
                    const images = badgeIds
                        .map(id => ({
                            image: badgesCache[id]?.image,
                            name: badgesCache[id]?.name
                        }))
                        .filter(b => b.image)
                        .slice(0, 10)
                        .map(b => `<span class="log-badge-thumb" data-tooltip="${escapeHtml(b.name || '')}"><img src="${b.image}" style="width: 18px; height: 18px; object-fit: contain; border-radius: 4px; background: #fff; border: 1px solid #eee;"></span>`)
                        .join('');
                    if (images) {
                        const suffix = badgeIds.length > 10 ? `<span class="text-muted" style="font-size: 0.7rem;">+${badgeIds.length - 10}</span>` : '';
                        extraDetailsHtml = `<div class="d-inline-flex align-items-center gap-1 mt-1">${images}${suffix}</div>`;
                    }
                }
            }
            if (log.action_type === 'omikuji') {
                if (details?.rank) detailParts.push(`結果: ${details.rank}`);
                if (details?.message) detailParts.push(`文言: ${details.message}`);
                if (details?.ticket_reward !== undefined) detailParts.push(`🎫: ${details.ticket_reward}枚`);
                if (details?.mangan_ticket_reward !== undefined) detailParts.push(`🧧: ${details.mangan_ticket_reward}枚`);
            }
            const detailsText = detailParts.length
                ? `<div class="small text-muted mt-1">${detailParts.map(t => escapeHtml(t)).join(' / ')}</div>${extraDetailsHtml}`
                : extraDetailsHtml;

            return `
                <tr>
                    <td data-label="選択">
                        <input type="checkbox" class="form-check-input log-checkbox" value="${log.id}" onchange="updateSelectedCount()">
                    </td>
                    <td data-label="日時">
                        <div class="small">${new Date(log.created_at).toLocaleDateString('ja-JP')}</div>
                        <div class="small text-muted">${new Date(log.created_at).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</div>
                    </td>
                    <td data-label="ユーザー">
                        <a href="../mypage/index.html?user=${log.user_id}" class="d-flex align-items-center gap-2 text-decoration-none">
                            <img src="${u.avatar || ''}" class="rounded-circle" style="width: 28px; height: 28px;" onerror="this.style.display='none'">
                            <span class="fw-bold text-primary">${escapeHtml(u.name)}</span>
                        </a>
                    </td>
                    <td data-label="アクション">
                        <span class="badge bg-light text-dark border">
                            ${action.icon} ${action.label}
                        </span>
                    </td>
                    <td data-label="内容 / 対象" class="small text-muted">${targetDisplay}${detailsText}</td>
                    <td data-label="金額" class="fw-bold ${amountColor}">${amountDisplay}</td>
                    <td data-label="操作"><button onclick="revertLog('${log.id}')" class="btn btn-sm btn-outline-danger">🔄</button></td>
                </tr>
            `;
        }).join('');
    }

    const pageInfo = document.getElementById('logs-page-info');
    if (pageInfo) pageInfo.textContent = `${page} / ${Math.ceil(count / LOGS_PER_PAGE) || 1}`;

    const prevBtn = document.getElementById('prev-logs-btn');
    const nextBtn = document.getElementById('next-logs-btn');
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= Math.ceil(count / LOGS_PER_PAGE);
}

function changeLogsPage(delta) {
    const totalPages = Math.ceil(parseInt(document.getElementById('logs-page-info')?.textContent.split('/')[1]) || 1);
    const newPage = currentLogsPage + delta;
    if (newPage >= 1 && newPage <= totalPages) {
        fetchActivityLogs(newPage);
    }
}

async function clearOmikujiDateIfNeeded(logId, userId) {
    if (userId) {
        await supabaseClient.from('profiles')
            .update({ last_omikuji_at: null, consecutive_omikuji_days: 0 })
            .eq('discord_user_id', userId);
    }
}

async function revertLog(logId) {
    if (!confirm('取り消しますか？')) return;

    toggleLoading(true);
    try {
        // ログ情報を先に取得（おみくじ判定のため）
        const { data: logData } = await supabaseClient
            .from('activity_logs').select('action_type, user_id').eq('id', logId).maybeSingle();

        const { data, error } = await supabaseClient.rpc('revert_activity_log', { p_log_id: logId });
        if (error) throw error;

        if (data?.ok) {
            if (logData?.action_type === 'omikuji') {
                await clearOmikujiDateIfNeeded(logId, logData.user_id);
            }
            alert('成功');
            fetchActivityLogs(currentLogsPage);
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

    // おみくじ判定のため対象ログを先取得
    const { data: logsData } = await supabaseClient
        .from('activity_logs').select('id, action_type, user_id').in('id', logIds);
    const logMap = {};
    (logsData || []).forEach(l => { logMap[l.id] = l; });

    for (const logId of logIds) {
        try {
            const { data, error } = await supabaseClient.rpc('revert_activity_log', { p_log_id: logId });
            if (error) throw error;
            if (data?.ok) {
                const log = logMap[logId];
                if (log?.action_type === 'omikuji') {
                    await clearOmikujiDateIfNeeded(logId, log.user_id);
                }
                successCount++;
            } else errorCount++;
        } catch (err) {
            console.error('一括取消エラー:', logId, err);
            errorCount++;
        }
    }

    toggleLoading(false);
    alert(`完了: ${successCount}件成功、${errorCount}件失敗`);
    fetchActivityLogs(currentLogsPage);
}

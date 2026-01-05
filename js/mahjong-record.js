// 麻雀スコア記録ページ用ロジック
let allProfiles = [];
let isAdmin = false;

document.addEventListener('DOMContentLoaded', async () => {
    await checkAdminStatus();
    await fetchProfiles();
    changePlayerCount(); // 初期化
});

async function checkAdminStatus() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user) {
        const discordId = user.user_metadata.provider_id;
        isAdmin = ADMIN_DISCORD_IDS.includes(discordId);
    }
}

async function fetchProfiles() {
    try {
        const { data, error } = await supabaseClient.from('profiles').select('*');
        if (!error) allProfiles = data;
    } catch (err) {
        console.error('プロフィール取得エラー:', err);
    }
}

function changePlayerCount() {
    const mode = document.getElementById('form-mode').value;
    const count = mode === '三麻' ? 3 : 4;
    setupPlayerInputs(count);
}

function changeMatchMode() {
    const mode = document.getElementById('form-mode').value;
    const count = mode === '三麻' ? 3 : 4;
    setupPlayerInputs(count);
}

function setupPlayerInputs(count) {
    const container = document.getElementById('players-container');
    container.innerHTML = '';
    const match = document.getElementById('form-match').value;

    for (let i = 1; i <= count; i++) {
        container.innerHTML += `
            <div class="player-entry" id="player-row-${i}">
                <div class="row g-2 align-items-end flex-nowrap">
                    <div class="col team-col" style="display: ${match === 'チーム戦' ? 'block' : 'none'}; flex: 0 0 17%; max-width: 17%;">
                        <label class="small text-muted">チーム名</label>
                        <input type="text" class="form-control form-control-sm player-team" placeholder="チーム名">
                    </div>
                    <div class="col" style="flex: 0 0 ${match === 'チーム戦' ? '17%' : '34%'}; max-width: ${match === 'チーム戦' ? '17%' : '34%'};">
                        <label class="small text-muted">アカウント名</label>
                        <div class="custom-dropdown-container">
                            <input type="text" class="form-control form-control-sm player-account" 
                                   placeholder="選択してください" readonly onfocus="showDropdown(${i})" style="cursor: pointer; background: white;">
                            <div class="selected-player-badge" id="selected-badge-${i}" style="display: none;">
                                <img src="" class="badge-avatar">
                                <span class="name"></span>
                                <span class="btn-clear" onclick="clearPlayer(${i})">×</span>
                            </div>
                            <div class="custom-dropdown-list" id="dropdown-list-${i}"></div>
                        </div>
                    </div>
                    <div class="col" style="flex: 0 0 22%; max-width: 22%;">
                        <label class="small text-muted">得点</label>
                        <input type="number" class="form-control form-control-sm player-score" placeholder="25000">
                    </div>
                    <div class="col" style="flex: 0 0 14%; max-width: 14%;">
                        <label class="small text-muted">和了数</label>
                        <input type="number" class="form-control form-control-sm player-win" value="0">
                    </div>
                    <div class="col" style="flex: 0 0 14%; max-width: 14%;">
                        <label class="small text-muted">放銃</label>
                        <input type="number" class="form-control form-control-sm player-deal" value="0">
                    </div>
                </div>
            </div>
        `;
    }
}

// ドロップダウン関連
function showDropdown(idx) {
    // 他の開いているドロップダウンを全て閉じ、z-indexをリセット
    document.querySelectorAll('.custom-dropdown-list').forEach(list => {
        list.style.display = 'none';
    });
    document.querySelectorAll('.player-entry').forEach(entry => {
        entry.style.zIndex = '';
        entry.style.position = '';
    });

    const list = document.getElementById(`dropdown-list-${idx}`);
    const playerEntry = document.getElementById(`player-row-${idx}`);

    // 現在のプレイヤーカードを前面に表示
    playerEntry.style.position = 'relative';
    playerEntry.style.zIndex = '1000';

    renderDropdownItems(idx, allProfiles);
    list.style.display = 'block';

    // 別クリックで閉じる
    setTimeout(() => {
        const h = (e) => {
            if (!list.contains(e.target) && !e.target.classList.contains('player-account')) {
                list.style.display = 'none';
                // z-indexをリセット
                playerEntry.style.zIndex = '';
                playerEntry.style.position = '';
                document.removeEventListener('mousedown', h);
            }
        };
        document.addEventListener('mousedown', h);
    }, 10);
}

function renderDropdownItems(idx, profiles) {
    const list = document.getElementById(`dropdown-list-${idx}`);
    if (profiles.length === 0) {
        list.innerHTML = '<div class="p-2 small text-muted">該当なし</div>';
        return;
    }
    list.innerHTML = profiles.map(p => {
        const display = p.account_name || p.discord_user_id;
        const avatarUrl = p.avatar_url || 'https://via.placeholder.com/24';
        return `
            <div class="dropdown-item-flex" onclick="selectPlayer(${idx}, '${p.discord_user_id}', '${(p.account_name || '').replace(/'/g, "\\'")}')">
                <img src="${avatarUrl}" class="dropdown-avatar" onerror="this.src='https://via.placeholder.com/24'">
                <span class="small">${display}</span>
            </div>
        `;
    }).join('');
}

function selectPlayer(idx, discordUserId, accountName) {
    const profile = allProfiles.find(p => p.discord_user_id === discordUserId);
    const input = document.querySelector(`#player-row-${idx} .player-account`);
    const badge = document.getElementById(`selected-badge-${idx}`);

    // discord_user_idとaccount_nameの両方を保存（data属性に）
    input.value = accountName || discordUserId;
    input.dataset.discordUserId = discordUserId;
    input.dataset.accountName = accountName;
    input.style.display = 'none';

    badge.querySelector('img').src = (profile && profile.avatar_url) ? profile.avatar_url : 'https://via.placeholder.com/24';
    badge.querySelector('.name').textContent = accountName || discordUserId;
    badge.style.display = 'flex';
    document.getElementById(`dropdown-list-${idx}`).style.display = 'none';
}

function clearPlayer(idx) {
    const input = document.querySelector(`#player-row-${idx} .player-account`);
    const badge = document.getElementById(`selected-badge-${idx}`);
    input.value = '';
    input.style.display = 'block';
    badge.style.display = 'none';
    input.focus();
}

// 送信処理
async function submitScores() {
    const mode = document.getElementById('form-mode').value;
    const match = document.getElementById('form-match').value;
    const hands = Number(document.getElementById('form-hands').value);

    const targetCount = mode === '三麻' ? 3 : 4;


    const entries = document.querySelectorAll('.player-entry');
    const tempData = []; // raw_points を一時的に格納
    const now = new Date().toISOString();

    // Step 1: 入力データの収集
    let filledCount = 0;
    for (const entry of entries) {
        const input = entry.querySelector('.player-account');
        const discordUserId = input.dataset.discordUserId || '';
        const accountName = input.dataset.accountName || input.value;
        const rawPoints = Number(entry.querySelector('.player-score').value);

        if (accountName && !isNaN(rawPoints)) {
            // 100点単位チェック
            if (rawPoints % 100 !== 0) {
                alert('得点は100点単位で入力してください。');
                document.getElementById('loading-overlay').style.display = 'none';
                return;
            }

            filledCount++;
            tempData.push({
                discord_user_id: discordUserId || null,
                account_name: accountName,
                raw_points: rawPoints,
                team_name: (match === 'チーム戦') ? (entry.querySelector('.player-team').value || null) : null,
                win_count: Number(entry.querySelector('.player-win').value || 0),
                deal_in_count: Number(entry.querySelector('.player-deal').value || 0)
            });
        }
    }

    // バリデーションチェック
    if (!isAdmin && filledCount < targetCount) {
        alert(`${targetCount}人分のデータ（アカウント名と得点）をすべて入力してください。`);
        return;
    }

    if (tempData.length === 0) {
        alert('データを入力してください');
        return;
    }

    if (isAdmin && filledCount < targetCount) {
        if (!confirm(`${targetCount}人分埋まっていませんが、管理者権限で強制送信しますか？`)) {
            return;
        }
    }

    // Step 2: final_score 計算（ウマオカ）
    const calculateFinalScore = (rawPoints, rank, mahjongMode) => {
        let basePoints, uma;

        if (mahjongMode === '三麻') {
            // 三麻: 35000点返し、ウマ 1位+20, 2位0, 3位-20
            basePoints = 35000;
            uma = { 1: 20, 2: 0, 3: -20 };
        } else {
            // 四麻: 25000点返し、ウマ 1位+30, 2位+10, 3位-10, 4位-30
            basePoints = 25000;
            uma = { 1: 30, 2: 10, 3: -10, 4: -30 };
        }

        return Math.round(((rawPoints - basePoints) / 1000 + uma[rank]) * 10) / 10;
    };

    // raw_pointsで降順ソート（同点は同順位）
    tempData.sort((a, b) => b.raw_points - a.raw_points);

    // rankとfinal_scoreを計算
    let currentRank = 1;
    for (let i = 0; i < tempData.length; i++) {
        if (i > 0 && tempData[i].raw_points < tempData[i - 1].raw_points) {
            currentRank = i + 1;
        }
        tempData[i].rank = currentRank;
        tempData[i].final_score = calculateFinalScore(tempData[i].raw_points, currentRank, mode);
    }

    // Step 3: match_id を生成（全プレイヤーに同じIDを割り当て）
    const matchId = crypto.randomUUID();

    // Step 4: 現在のユーザーのdiscord_user_idを取得
    const { data: { user } } = await supabaseClient.auth.getUser();
    const submittedBy = user?.user_metadata?.provider_id || null;

    // Step 5: 最終的な挿入データを構築
    const dataToInsert = tempData.map(player => ({
        match_id: matchId,
        event_datetime: now,
        discord_user_id: player.discord_user_id,
        account_name: player.account_name,
        tournament_type: '第二回麻雀大会',
        mahjong_mode: mode,
        match_mode: match,
        team_name: player.team_name,
        rank: player.rank,
        raw_points: player.raw_points,
        final_score: player.final_score,
        hand_count: hands,
        win_count: player.win_count,
        deal_in_count: player.deal_in_count,
        submitted_by_discord_user_id: submittedBy
    }));

    // Step 6: データベースに挿入
    document.getElementById('loading-overlay').style.display = 'flex';

    try {
        const { error } = await supabaseClient
            .from('match_results')
            .insert(dataToInsert);

        if (error) throw error;

        alert('スコアを送信しました！');
        window.location.href = './index.html'; // ランキングに戻る
    } catch (err) {
        alert('送信エラー: ' + err.message);
    } finally {
        document.getElementById('loading-overlay').style.display = 'none';
    }
}

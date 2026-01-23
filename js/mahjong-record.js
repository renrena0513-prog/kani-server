console.log('mahjong-record.js version: 2026-01-24-01');
// 麻雀スコア記録ページ用ロジック
let allProfiles = [];
let allTeams = [];
let isAdmin = false;
let userMutantMap = {}; // ミュータント情報を格納

document.addEventListener('DOMContentLoaded', async () => {
    await checkAdminStatus();
    await fetchProfiles();
    await fetchTeams();
    changePlayerCount(); // 初期化
    updateRuleDisplay(); // ルール表示の初期設定
});

async function checkAdminStatus() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user) {
        // 管理者チェックは実ユーザー（ログイン中の管理者）で行うべきなので、そのまま provider_id を使う。
        // ただし、なりすまし中のユーザーが管理者かどうかでUIが変わるのを防ぐため、
        // ログインユーザーが管理者なら常に isAdmin = true にする。
        const discordId = user.user_metadata.provider_id;
        isAdmin = ADMIN_DISCORD_IDS.includes(discordId);
    }
}

async function fetchProfiles() {
    try {
        // プロフィール情報を取得
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('*, badges!equipped_badge_id(id, image_url, name), badges_right:badges!equipped_badge_id_right(id, image_url, name)');
        if (!error) {
            allProfiles = data.sort((a, b) => {
                const nameA = a.account_name || "";
                const nameB = b.account_name || "";
                return nameA.localeCompare(nameB, 'ja');
            });
        }

        // ミュータント情報を取得
        const { data: mutantData } = await supabaseClient
            .from('user_badges_new')
            .select('user_id, badge_id, is_mutant')
            .eq('is_mutant', true);

        userMutantMap = {};
        (mutantData || []).forEach(m => {
            userMutantMap[`${m.user_id}_${m.badge_id}`] = true;
        });
    } catch (err) {
        console.error('プロフィール取得エラー:', err);
    }
}

async function fetchTeams() {
    try {
        const { data, error } = await supabaseClient.from('teams').select('*').order('team_name');
        if (!error) allTeams = data || [];
    } catch (err) {
        console.error('チーム取得エラー:', err);
    }
}

function changePlayerCount() {
    const mode = document.getElementById('form-mode').value;
    const count = mode === '三麻' ? 3 : 4;
    setupPlayerInputs(count);
    updateRuleDisplay();
}

function changeMatchMode() {
    const mode = document.getElementById('form-mode').value;
    const match = document.getElementById('form-match').value;
    const count = mode === '三麻' ? 3 : 4;
    const isTeamMatch = match === 'チーム戦';

    setupPlayerInputs(count);
    updateRuleDisplay();

    // ⑪チーム戦時は飛び賞・やきとりを無効化して「なし」に固定
    ['tobi', 'yakitori'].forEach(opt => {
        document.querySelectorAll(`input[name="opt-${opt}"]`).forEach(radio => {
            radio.disabled = isTeamMatch;
            if (isTeamMatch && radio.value === 'none') radio.checked = true;
        });
        // ラベルのスタイルも更新
        document.querySelectorAll(`label[for^="${opt}-"]`).forEach(label => {
            label.style.opacity = isTeamMatch ? '0.5' : '1';
            label.style.cursor = isTeamMatch ? 'not-allowed' : 'pointer';
        });
    });
}

/**
 * ルール表示（返し点、オカ、ウマ）を更新
 */
function updateRuleDisplay() {
    const mode = document.getElementById('form-mode').value;

    // 四麻 25,000 / 三麻 35,000
    const distPoints = (mode === '三麻' ? 35000 : 25000);
    const returnPoints = (mode === '三麻' ? 40000 : 30000);
    const numPlayers = (mode === '三麻' ? 3 : 4);
    const oka = (returnPoints - distPoints) * numPlayers;

    // UI表示を更新
    const dispDist = document.getElementById('disp-dist-points');
    if (dispDist) dispDist.textContent = `標準 (${distPoints.toLocaleString()}点)`;

    document.getElementById('disp-return-points').textContent = returnPoints.toLocaleString() + '点';
    document.getElementById('disp-uma').textContent = (mode === '三麻' ? '0-20' : '10-30');
    document.getElementById('disp-oka').textContent = '+' + (oka / 1000).toFixed(1);
}

function setupPlayerInputs(count) {
    const container = document.getElementById('players-container');
    container.innerHTML = '';
    const match = document.getElementById('form-match').value;
    const mode = document.getElementById('form-mode').value;
    const isTeamMatch = match === 'チーム戦';

    // チームオプションを生成
    const teamOptions = allTeams.map(t => `<option value="${t.id}">${t.team_name}</option>`).join('');

    // ③順位ラベル
    const rankLabels = ['1着', '2着', '3着', '4着'];
    // 配給点（プレースホルダー用）
    const defaultScore = (mode === '三麻' ? 35000 : 25000);

    for (let i = 1; i <= count; i++) {
        container.innerHTML += `
            <div class="player-entry" id="player-row-${i}">
                <div class="row g-2 align-items-center player-row">
                    <div class="col-auto d-flex align-items-center" style="min-width: 50px;">
                        <span class="badge bg-success fs-6 d-flex align-items-center justify-content-center" style="height: 38px; width: 40px;">${rankLabels[i - 1]}</span>
                    </div>
                    <div class="col team-col" style="display: ${isTeamMatch ? 'block' : 'none'};">
                        <label class="small text-muted">チーム名</label>
                        <select class="form-select form-select-sm player-team" onchange="filterAccountsByTeam(${i})">
                            <option value="">チームを選択</option>
                            ${teamOptions}
                        </select>
                    </div>
                    <div class="col account-col">
                        <label class="small text-muted">アカウント名</label>
                        <div class="custom-dropdown-container">
                            <input type="text" class="form-control form-control-sm player-account" 
                                   placeholder="選択してください" readonly onfocus="showDropdown(${i})" style="cursor: pointer; background: white;">
                            <div class="selected-player-badge" id="selected-badge-${i}" style="display: none;">
                                <img src="" class="badge-avatar">
                                <div class="badge-left-container mutant-badge-container mini" style="display: none;"></div>
                                <span class="name"></span>
                                <div class="badge-right-container mutant-badge-container mini" style="display: none;"></div>
                                <span class="btn-clear" onclick="clearPlayer(${i})">×</span>
                            </div>
                            <div class="custom-dropdown-list" id="dropdown-list-${i}"></div>
                        </div>
                    </div>
                    <div class="col score-col">
                        <label class="small text-muted">得点 <span class="remaining-score text-primary fw-bold" id="remaining-${i}"></span></label>
                        <input type="number" class="form-control form-control-sm player-score" 
                               placeholder="${defaultScore}" oninput="updateRemainingScores()" onfocus="autoCalculateRemainingScore(${i})">
                    </div>
                    <div class="col win-col">
                        <label class="small text-muted">和了数</label>
                        <input type="number" class="form-control form-control-sm player-win" placeholder="0" min="0">
                    </div>
                    <div class="col deal-col">
                        <label class="small text-muted">放銃数</label>
                        <input type="number" class="form-control form-control-sm player-deal" placeholder="0" min="0">
                    </div>
                </div>
            </div>
        `;
    }
}

/**
 * ⑤残り得点を自動計算
 * 自分以外の全員の得点が入力済みで、自分が未入力の場合に残りを自動入力
 */
function autoCalculateRemainingScore(idx) {
    const mode = document.getElementById('form-mode').value;
    const totalExpected = (mode === '三麻') ? 105000 : 100000;
    const count = (mode === '三麻') ? 3 : 4;

    const currentInput = document.querySelector(`#player-row-${idx} .player-score`);

    // 既に値が入力済みなら何もしない
    if (currentInput.value !== '') return;

    // 他のプレイヤーの得点を集計
    let filledCount = 0;
    let sumOthers = 0;

    for (let i = 1; i <= count; i++) {
        if (i === idx) continue;
        const scoreInput = document.querySelector(`#player-row-${i} .player-score`);
        if (scoreInput && scoreInput.value !== '') {
            filledCount++;
            sumOthers += Number(scoreInput.value);
        }
    }

    // 自分以外全員入力済みの場合、残り得点を自動設定
    if (filledCount === count - 1) {
        const remaining = totalExpected - sumOthers;
        currentInput.value = remaining;
        currentInput.select();
    }

    // 残り点数表示を更新
    updateRemainingScores();
}

/**
 * 残り点数をリアルタイム表示する関数
 */
function updateRemainingScores() {
    const mode = document.getElementById('form-mode').value;
    const totalExpected = (mode === '三麻') ? 105000 : 100000;
    const count = (mode === '三麻') ? 3 : 4;

    // 入力済み得点の合計を計算
    let totalEntered = 0;
    let emptyCount = 0;

    for (let i = 1; i <= count; i++) {
        const scoreInput = document.querySelector(`#player-row-${i} .player-score`);
        const remaining = document.getElementById(`remaining-${i}`);

        if (scoreInput && scoreInput.value !== '') {
            totalEntered += Number(scoreInput.value);
        } else {
            emptyCount++;
        }
    }

    // 残り点数を計算
    const remainingTotal = totalExpected - totalEntered;

    // 各プレイヤーの残り表示を更新
    for (let i = 1; i <= count; i++) {
        const scoreInput = document.querySelector(`#player-row-${i} .player-score`);
        const remainingSpan = document.getElementById(`remaining-${i}`);

        if (remainingSpan) {
            if (scoreInput && scoreInput.value === '' && emptyCount === 1) {
                // 残り1人だけ未入力の場合、残り点数を表示
                remainingSpan.textContent = `(残${remainingTotal.toLocaleString()})`;
                remainingSpan.style.color = remainingTotal < 0 ? '#dc3545' : '#0d6efd';
            } else if (scoreInput && scoreInput.value === '') {
                remainingSpan.textContent = '';
            } else {
                remainingSpan.textContent = '';
            }
        }
    }
}

// チーム選択時にアカウントをフィルタリング
function filterAccountsByTeam(idx) {
    const teamSelect = document.querySelector(`#player-row-${idx} .player-team`);
    const selectedTeamId = teamSelect.value;

    // 選択済みプレイヤーをクリア
    clearPlayer(idx);
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

    // チーム戦の場合、選択されたチームでフィルタリング
    const match = document.getElementById('form-match').value;
    const teamSelect = document.querySelector(`#player-row-${idx} .player-team`);
    let filteredProfiles = allProfiles;

    if (match === 'チーム戦' && teamSelect && teamSelect.value) {
        filteredProfiles = allProfiles.filter(p => p.team_id === teamSelect.value);
    }

    renderDropdownItems(idx, filteredProfiles);
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
        const badge = p.badges;
        const badgeRight = p.badges_right;

        // ⑩ミュータントバッジ対応
        let badgeHtmlLeft = '';
        if (badge) {
            const isMutant = userMutantMap[`${p.discord_user_id}_${badge.id}`];
            badgeHtmlLeft = `
                <div class="mutant-badge-container mini ${isMutant ? 'active' : ''}" style="margin-left: 5px;">
                    <img src="${badge.image_url}" title="${badge.name}" 
                         style="width: 24px; height: 24px; object-fit: contain; border-radius: 4px;">
                    <div class="mutant-badge-shine" style="display: ${isMutant ? 'block' : 'none'};"></div>
                </div>`;
        }

        let badgeHtmlRight = '';
        if (badgeRight) {
            const isMutant = userMutantMap[`${p.discord_user_id}_${badgeRight.id}`];
            badgeHtmlRight = `
                <div class="mutant-badge-container mini ${isMutant ? 'active' : ''}" style="margin-left: 5px;">
                    <img src="${badgeRight.image_url}" title="${badgeRight.name}" 
                         style="width: 24px; height: 24px; object-fit: contain; border-radius: 4px;">
                    <div class="mutant-badge-shine" style="display: ${isMutant ? 'block' : 'none'};"></div>
                </div>`;
        }

        return `
            <div class="dropdown-item-flex" onclick="selectPlayer(${idx}, '${p.discord_user_id}', '${(p.account_name || '').replace(/'/g, "\\'")}')">
                <img src="${avatarUrl}" class="dropdown-avatar" onerror="this.src='https://via.placeholder.com/24'">
                ${badgeHtmlLeft}
                <span class="small">${display}</span>
                ${badgeHtmlRight}
            </div>
        `;
    }).join('');
}

function selectPlayer(idx, discordUserId, accountName) {
    const profile = allProfiles.find(p => p.discord_user_id === discordUserId);
    const input = document.querySelector(`#player-row-${idx} .player-account`);
    const badgeContainer = document.getElementById(`selected-badge-${idx}`);

    // discord_user_idとaccount_nameの両方を保存（data属性に）
    input.value = accountName || discordUserId;
    input.dataset.discordUserId = discordUserId;
    input.dataset.accountName = accountName;
    input.style.display = 'none';

    // アバター設定
    const avatarImg = badgeContainer.querySelector('.badge-avatar');
    avatarImg.src = (profile && profile.avatar_url) ? profile.avatar_url : 'https://via.placeholder.com/24';

    // 名前設定
    badgeContainer.querySelector('.name').textContent = accountName || discordUserId;

    // ⑩左バッジ設定（ミュータント対応）
    const badgeLeftContainer = badgeContainer.querySelector('.badge-left-container');
    const badgeLeft = profile?.badges;
    if (badgeLeft && badgeLeftContainer) {
        const isMutantLeft = userMutantMap[`${discordUserId}_${badgeLeft.id}`];
        badgeLeftContainer.innerHTML = `
            <img src="${badgeLeft.image_url}" title="${badgeLeft.name}" 
                 style="width: 24px; height: 24px; object-fit: contain; border-radius: 4px;">
            <div class="mutant-badge-shine" style="display: ${isMutantLeft ? 'block' : 'none'};"></div>`;
        badgeLeftContainer.classList.toggle('active', isMutantLeft);
        badgeLeftContainer.style.display = 'inline-block';
    } else if (badgeLeftContainer) {
        badgeLeftContainer.style.display = 'none';
    }

    // 右バッジ設定（ミュータント対応）
    const badgeRightContainer = badgeContainer.querySelector('.badge-right-container');
    const badgeRight = profile?.badges_right;
    if (badgeRight && badgeRightContainer) {
        const isMutantRight = userMutantMap[`${discordUserId}_${badgeRight.id}`];
        badgeRightContainer.innerHTML = `
            <img src="${badgeRight.image_url}" title="${badgeRight.name}" 
                 style="width: 24px; height: 24px; object-fit: contain; border-radius: 4px;">
            <div class="mutant-badge-shine" style="display: ${isMutantRight ? 'block' : 'none'};"></div>`;
        badgeRightContainer.classList.toggle('active', isMutantRight);
        badgeRightContainer.style.display = 'inline-block';
    } else if (badgeRightContainer) {
        badgeRightContainer.style.display = 'none';
    }

    badgeContainer.style.display = 'flex';
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
    // 二重送信防止
    const submitBtn = document.querySelector('.btn-submit');
    if (submitBtn.disabled) return;
    submitBtn.disabled = true;
    const originalBtnText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 送信中...';

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

            // チーム名を取得（selectのvalueはIDなので、実際のチーム名を取得）
            let teamName = null;
            if (match === 'チーム戦') {
                const teamId = entry.querySelector('.player-team').value;
                if (teamId) {
                    const team = allTeams.find(t => t.id === teamId);
                    teamName = team ? team.team_name : null;
                }
            }

            tempData.push({
                discord_user_id: discordUserId || null,
                account_name: accountName,
                raw_points: rawPoints,
                team_name: teamName,
                win_count: Number(entry.querySelector('.player-win').value || 0),
                deal_in_count: Number(entry.querySelector('.player-deal').value || 0)
            });
        }
    }

    // --- エラー防止バリデーション ---
    // 1. 同一Discord IDの重複チェック
    const discordIds = tempData.filter(p => p.discord_user_id).map(p => p.discord_user_id);
    if (new Set(discordIds).size !== discordIds.length) {
        alert('同じユーザーが複数選択されています。');
        resetSubmitBtn();
        return;
    }

    // 2. 同一アカウント名の重複チェック (ゲストプレイヤー含む)
    const names = tempData.map(p => p.account_name);
    if (new Set(names).size !== names.length) {
        alert('アカウント名が重複しています。ゲストプレイヤーの名前も一意にする必要があります。');
        resetSubmitBtn();
        return;
    }

    function resetSubmitBtn() {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
        document.getElementById('loading-overlay').style.display = 'none';
    }

    // ⑧局数未入力エラー
    const handsInput = document.getElementById('form-hands');
    if (!handsInput.value || handsInput.value === '' || Number(handsInput.value) <= 0) {
        alert('局数を入力してください。');
        resetSubmitBtn();
        return;
    }

    // バリデーションチェック
    if (!isAdmin && filledCount < targetCount) {
        alert(`${targetCount}人分のデータ（アカウント名と得点）をすべて入力してください。`);
        resetSubmitBtn();
        return;
    }

    if (tempData.length === 0) {
        alert('データを入力してください');
        resetSubmitBtn();
        return;
    }

    // ⑦合計点数バリデーション（四麻100000点、三麻105000点）
    const expectedTotal = mode === '三麻' ? 105000 : 100000;
    const actualTotal = tempData.reduce((sum, p) => sum + p.raw_points, 0);
    if (!isAdmin && actualTotal !== expectedTotal) {
        alert(`合計点数が${expectedTotal.toLocaleString()}点ではありません。
現在の合計: ${actualTotal.toLocaleString()}点
差分: ${(actualTotal - expectedTotal).toLocaleString()}点`);
        resetSubmitBtn();
        return;
    }

    if (isAdmin && filledCount < targetCount) {
        if (!confirm(`${targetCount}人分埋まっていませんが、管理者権限で強制送信しますか？`)) {
            resetSubmitBtn();
            return;
        }
    }

    if (isAdmin && actualTotal !== expectedTotal) {
        if (!confirm(`合計点数が${expectedTotal.toLocaleString()}点ではありません（現在: ${actualTotal.toLocaleString()}点）。管理者権限で強制送信しますか？`)) {
            resetSubmitBtn();
            return;
        }
    }

    // Step 2: final_score 計算
    const isSanma = mode === '三麻';
    const numPlayers = tempData.length;
    // モードベースでルールを決定
    const distPoints = (isSanma ? 35000 : 25000);
    const returnPoints = (isSanma ? 40000 : 30000);
    const isTobiOn = document.querySelector('input[name="opt-tobi"]:checked').value === 'yes';
    const isYakitoriOn = document.querySelector('input[name="opt-yakitori"]:checked').value === 'yes';

    // オカ（1位へのボーナスポイント）は、三麻なら(40k-35k)*3=15k, 四麻なら(30k-25k)*4=20k
    const okaPoints = isSanma ? 15000 : 20000;

    console.log('--- スコア計算開始 ---');
    console.log('モード:', mode, '人数(実際):', numPlayers);
    console.log('決定された配給点:', distPoints, '返し点:', returnPoints, 'オカ合計:', okaPoints);
    console.log('オプション - 飛び賞:', isTobiOn, 'やきとり:', isYakitoriOn);

    // ⑥入力順で順位を決定（ソートしない）
    // tempDataは既に入力順になっているので、そのまま順位を割り当て

    // 順位と基本スコアの計算
    let poolBonus = 0;

    for (let i = 0; i < tempData.length; i++) {
        // ⑥入力順で順位を決定（1番目=1位、2番目=2位...）
        const currentRank = i + 1;
        tempData[i].rank = currentRank;

        // 基本スコア計算: (持ち点 - 返し点) / 1000 + ウマ
        let uma = 0;
        if (isSanma) {
            const umaMap = { 1: 20, 2: 0, 3: -20 };
            uma = umaMap[currentRank] || 0;
        } else {
            const umaMap = { 1: 30, 2: 10, 3: -10, 4: -30 };
            uma = umaMap[currentRank] || 0;
        }

        let baseScore = (tempData[i].raw_points - returnPoints) / 1000 + uma;
        let penalty = 0;

        // 飛び賞ペナルティ
        if (isTobiOn && tempData[i].raw_points < 0) {
            penalty += 10;
            poolBonus += 10;
        }

        // やきとりペナルティ
        if (isYakitoriOn && tempData[i].win_count === 0) {
            penalty += 10;
            poolBonus += 10;
        }

        tempData[i].final_score = baseScore - penalty;
        console.log(`プレイヤー ${i + 1}: ${tempData[i].account_name}, 点数: ${tempData[i].raw_points}, 順位: ${currentRank}, ウマ: ${uma}, ペナルティ: ${penalty}, 暫定スコア: ${tempData[i].final_score}`);
    }

    // 1位にオカとプールボーナスを加算
    const topRankPlayers = tempData.filter(p => p.rank === 1);
    const totalBonusPoints = (okaPoints / 1000) + poolBonus;
    const bonusPerWinner = totalBonusPoints / topRankPlayers.length;

    console.log('オカ(pts):', okaPoints / 1000, 'プール(pts):', poolBonus, 'ボーナス合計:', totalBonusPoints);

    topRankPlayers.forEach(p => {
        p.final_score += bonusPerWinner;
    });

    // 最終スコアリング（小数点1位で丸め）
    tempData.forEach(p => {
        p.final_score = Math.round(p.final_score * 10) / 10;
        console.log(`最終スコア - ${p.account_name}: ${p.final_score}`);
    });
    console.log('--- スコア計算終了 ---');

    // Step 3: match_id を生成（全プレイヤーに同じIDを割り当て）
    const matchId = crypto.randomUUID();

    // Step 4: 記録者のIDを取得（なりすまし対応）
    const effectiveUserId = await getEffectiveUserId();
    const submittedBy = effectiveUserId;

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

        if (error) {
            if (error.code === '23505') {
                throw new Error('同一の対局内に同じプレイヤーが既に登録されているか、データが衝突しました。同じユーザーを複数選んでいないか確認してください。');
            }
            throw error;
        }

        // 報酬付与（コイン・チケット）とログ記録
        const ticketRewardsMap = {}; // Discord通知用: { discord_user_id: count }

        for (const player of dataToInsert) {
            if (!player.discord_user_id) continue;

            // 1. チケット報酬計算
            // 三麻: 参加者10%, 記録者20%
            // 四麻: 参加者13%, 記録者26%
            // 各ユーザーで個別に判定するため、複数人に同時付与されることがある
            let ticketReward = 0;
            const isRecorder = player.discord_user_id === submittedBy;
            let ticketChance;
            if (mode === '四麻') {
                ticketChance = isRecorder ? 0.26 : 0.13;
            } else {
                ticketChance = isRecorder ? 0.20 : 0.10;
            }
            if (Math.random() < ticketChance) {
                ticketReward += 1;
            }
            if (ticketReward > 0) {
                ticketRewardsMap[player.discord_user_id] = ticketReward;
            }

            // 2. コイン報酬計算 (Discord通知ロジック準拠)
            // スコアボーナス: 切り上げ (プラスの場合のみ)
            const scoreBonus = player.final_score > 0 ? Math.ceil(player.final_score / 10) : 0;

            // 四麻順位ボーナス
            let rankBonus = 0;
            if (mode === '四麻') {
                const yonmaRankBonus = { 1: 5, 2: 3, 3: 1, 4: 0 };
                rankBonus = yonmaRankBonus[player.rank] || 0;
            }

            // 参加ボーナス: 三麻3, 四麻5
            const baseReward = (mode === '三麻') ? 3 : 5;
            // 合計報酬 (参加ボーナス + スコア + 順位)
            const coinReward = baseReward + scoreBonus + rankBonus;

            // 3. DB更新とログ記録
            try {
                // プロフィール取得
                const { data: profile } = await supabaseClient
                    .from('profiles')
                    .select('coins, total_assets, gacha_tickets')
                    .eq('discord_user_id', player.discord_user_id)
                    .single();

                const updates = {};
                let updated = false;

                // チケット更新
                if (ticketReward > 0) {
                    updates.gacha_tickets = (profile?.gacha_tickets || 0) + ticketReward;
                    updated = true;
                }

                // コイン更新
                if (coinReward > 0) {
                    updates.coins = (profile?.coins || 0) + coinReward;
                    updates.total_assets = (profile?.total_assets || 0) + coinReward;
                    updated = true;
                }

                // 更新実行
                if (updated) {
                    await supabaseClient
                        .from('profiles')
                        .update(updates)
                        .eq('discord_user_id', player.discord_user_id);
                }

                console.log(`${player.account_name} への報酬: コイン=${coinReward}, チケット=${ticketReward}`);

                // 活動ログ記録 (コインまたはチケットの変動がある場合)
                if (updated) {
                    await logActivity(player.discord_user_id, 'mahjong', {
                        amount: coinReward, // メインの変動値としてコインを設定
                        matchId: matchId,
                        details: {
                            rank: player.rank,
                            score: player.final_score,
                            team: player.team_name,
                            coin_reward: coinReward,
                            ticket_reward: ticketReward,
                            breakdown: { base: 1, score: scoreBonus, rank: rankBonus }
                        }
                    });
                }

            } catch (err) {
                console.error(`報酬付与エラー (${player.account_name}):`, err);
            }
        }

        alert('スコアを送信しました！コインが各プレイヤーに付与されました。');

        // Discord通知を送信
        if (typeof DISCORD_WEBHOOK_URL !== 'undefined' && DISCORD_WEBHOOK_URL) {
            await sendDiscordNotification(dataToInsert, isTobiOn, isYakitoriOn, ticketRewardsMap);
        }

        // ⑨送信後、チーム名とアカウント名以外をクリア（効率的な連続送信のため）
        clearFormExceptTeamAndAccount();
        resetSubmitBtn();
    } catch (err) {
        alert('送信エラー: ' + err.message);
        resetSubmitBtn();
    } finally {
        document.getElementById('loading-overlay').style.display = 'none';
    }
}

/**
 * ⑨送信後、チーム名とアカウント名以外をクリアする関数
 */
function clearFormExceptTeamAndAccount() {
    const mode = document.getElementById('form-mode').value;
    const count = mode === '三麻' ? 3 : 4;

    // 対局数をクリア
    document.getElementById('form-hands').value = '';

    // 各プレイヤーの得点・和了数・放銃数をクリア
    for (let i = 1; i <= count; i++) {
        const scoreInput = document.querySelector(`#player-row-${i} .player-score`);
        const winInput = document.querySelector(`#player-row-${i} .player-win`);
        const dealInput = document.querySelector(`#player-row-${i} .player-deal`);

        if (scoreInput) scoreInput.value = '';
        if (winInput) winInput.value = '';
        if (dealInput) dealInput.value = '';
    }
}

/**
 * Discordに試合結果を通知する
 * @param {Array} matchData 挿入された試合結果データ
 * @param {boolean} isTobiOn 飛び賞設定
 * @param {boolean} isYakitoriOn やきとり設定
 * @param {Object} ticketRewardsMap チケット獲得情報のマップ { discordUserId: count }
 */
async function sendDiscordNotification(matchData, isTobiOn, isYakitoriOn, ticketRewardsMap = {}) {
    if (!matchData || matchData.length === 0) return;

    const first = matchData[0];
    const mode = first.mahjong_mode; // "三麻" or "四麻"
    const matchType = first.match_mode; // "個人戦" or "チーム戦"

    // 順位順にソート
    const sorted = [...matchData].sort((a, b) => a.rank - b.rank);

    // 埋め込み内での表示用テキスト構築（メンションをここに入れる）
    let scoreDisplay = sorted.map(p => {
        const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : '🔹';
        const teamInfo = p.team_name ? ` (${p.team_name})` : '';
        const scoreStr = (p.final_score > 0 ? '+' : '') + p.final_score.toFixed(1);

        // ユーザーIDがある場合はメンション形式にする
        const nameDisplay = p.discord_user_id ? `<@${p.discord_user_id}>` : p.account_name;

        // 報酬コインの計算（実際の付与ロジックと一致させる）
        // スコアボーナス: 切り上げ
        const scoreBonus = p.final_score > 0 ? Math.ceil(p.final_score / 10) : 0;

        // 四麻順位ボーナス
        let rankBonus = 0;
        if (mode === '四麻') {
            const yonmaRankBonus = { 1: 5, 2: 3, 3: 1, 4: 0 };
            rankBonus = yonmaRankBonus[p.rank] || 0;
        }

        // 参加ボーナス: 三麻3, 四麻5
        const baseReward = (mode === '三麻') ? 3 : 5;
        const reward = baseReward + scoreBonus + rankBonus;
        const tickets = ticketRewardsMap[p.discord_user_id] || 0;
        const rewardText = `💰+${reward}${tickets > 0 ? ` 🎫+${tickets}` : ''}`;

        // 和了数と放銃数を表示
        const winDealLine = `🀄和了${p.win_count || 0}　🔫放銃${p.deal_in_count || 0}`;

        return `${medal} **${p.rank}位**: ${nameDisplay}${teamInfo}\n` +
            `　　 \`${p.raw_points.toLocaleString()}点\` ➡ **${scoreStr} pts**\n` +
            `　　 ${winDealLine}　(${rewardText})\n`;
    }).join('\n');

    // ルール情報の取得
    const isSanma = mode === '三麻';
    const distPoints = (isSanma ? 35000 : 25000);
    const returnPoints = (isSanma ? 40000 : 30000);
    const umaDisplay = (isSanma ? '0-20' : '10-30');

    // 記録者の表示（メンション）
    const reporterMention = first.submitted_by_discord_user_id ? `<@${first.submitted_by_discord_user_id}>` : '不明';

    const embed = {
        title: `🀄 ${matchType} (${mode})　結果`, // 「個人戦 (三麻)　結果」の形式に変更
        description: scoreDisplay + '\n━━━━━━━━━━━━━━━━',
        color: 0x2ecc71, // 鮮やかな緑色
        fields: [
            {
                name: '⚙️ ルール設定',
                value: `配給: ${distPoints.toLocaleString()} / 返し: ${returnPoints.toLocaleString()} / ウマ: ${umaDisplay}\n` +
                    `飛び賞: ${isTobiOn ? 'あり' : 'なし'} / やきとり: ${isYakitoriOn ? 'あり' : 'なし'}\n` +
                    `合計局数: ${first.hand_count}局\n` +
                    `━━━━━━━━━━━━━━━━`, // ルールと記録者の間に線を追加
                inline: false
            },
            { name: '✍️ 記録者', value: reporterMention, inline: true }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: "かに鯖麻雀大会システム" }
    };

    try {
        await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                // 通知を飛ばすために本文にプレイヤー全員のメンションを入れる（表示はEmbedが主役）
                content: matchData.filter(p => p.discord_user_id).map(p => `<@${p.discord_user_id}>`).join(' '),
                embeds: [embed]
            })
        });
        console.log('Discord通知送信成功');
    } catch (err) {
        console.error('Discord通知送信エラー:', err);
    }
}

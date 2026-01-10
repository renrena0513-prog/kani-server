// 麻雀スコア記録ページ用ロジック
let allProfiles = [];
let allTeams = [];
let isAdmin = false;

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
        const { data, error } = await supabaseClient
            .from('profiles')
            .select('*, badges!equipped_badge_id(image_url, name)');
        if (!error) allProfiles = data;
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
    const count = mode === '三麻' ? 3 : 4;
    setupPlayerInputs(count);
    updateRuleDisplay();
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

    for (let i = 1; i <= count; i++) {
        // デフォルト得点を設定
        const defaultScore = (mode === '三麻' ? 35000 : 25000);

        container.innerHTML += `
            <div class="player-entry" id="player-row-${i}">
                <div class="row g-2 align-items-end player-row">
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
                                <span class="name"></span>
                                <img src="" class="badge-icon ms-1" style="width: 20px; height: 20px; display: none;">
                                <span class="btn-clear" onclick="clearPlayer(${i})">×</span>
                            </div>
                            <div class="custom-dropdown-list" id="dropdown-list-${i}"></div>
                        </div>
                    </div>
                    <div class="col score-col">
                        <label class="small text-muted">得点</label>
                        <input type="number" class="form-control form-control-sm player-score" value="${defaultScore}" placeholder="${defaultScore}">
                    </div>
                    <div class="col win-col">
                        <label class="small text-muted">和了数</label>
                        <input type="number" class="form-control form-control-sm player-win" value="0" min="0">
                    </div>
                    <div class="col deal-col">
                        <label class="small text-muted">放銃数</label>
                        <input type="number" class="form-control form-control-sm player-deal" value="0" min="0">
                    </div>
                </div>
            </div>
        `;
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
        const badgeHtml = badge ? `
            <img src="${badge.image_url}" title="${badge.name}" 
                 style="width: 18px; height: 18px; object-fit: contain; margin-left: 5px; border-radius: 2px;">
        ` : '';

        return `
            <div class="dropdown-item-flex" onclick="selectPlayer(${idx}, '${p.discord_user_id}', '${(p.account_name || '').replace(/'/g, "\\'")}')">
                <img src="${avatarUrl}" class="dropdown-avatar" onerror="this.src='https://via.placeholder.com/24'">
                <span class="small">${display}</span>
                ${badgeHtml}
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

    // バッジ設定
    const badgeImg = badgeContainer.querySelector('.badge-icon');
    const badge = profile?.badges;
    if (badge && badgeImg) {
        badgeImg.src = badge.image_url;
        badgeImg.title = badge.name;
        badgeImg.style.display = 'inline-block';
    } else if (badgeImg) {
        badgeImg.style.display = 'none';
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

    // Step 2: final_score 計算
    const numPlayers = tempData.length;
    // 人数ベースでルールを決定 (3人=三麻, 4人=四麻)
    const distPoints = (numPlayers === 3 ? 35000 : 25000);
    const returnPoints = (numPlayers === 3 ? 40000 : 30000);
    const isTobiOn = document.querySelector('input[name="opt-tobi"]:checked').value === 'yes';
    const isYakitoriOn = document.querySelector('input[name="opt-yakitori"]:checked').value === 'yes';

    const okaPoints = (returnPoints - distPoints) * numPlayers;

    console.log('--- スコア計算開始 ---');
    console.log('モード(UI):', mode, '人数(実際):', numPlayers);
    console.log('決定された配給点:', distPoints, '返し点:', returnPoints, 'オカ合計:', okaPoints);
    console.log('オプション - 飛び賞:', isTobiOn, 'やきとり:', isYakitoriOn);

    // raw_pointsで降順ソート（同点は同順位）
    tempData.sort((a, b) => b.raw_points - a.raw_points);

    // 順位と基本スコアの計算
    let currentRank = 1;
    let poolBonus = 0;

    for (let i = 0; i < tempData.length; i++) {
        if (i > 0 && tempData[i].raw_points < tempData[i - 1].raw_points) {
            currentRank = i + 1;
        }
        tempData[i].rank = currentRank;

        // 基本スコア計算: (持ち点 - 返し点) / 1000 + ウマ
        let uma = 0;
        if (numPlayers === 3) {
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

        if (error) throw error;

        // コイン報酬の加算処理（切り上げ + 四麻ボーナス）
        for (const player of dataToInsert) {
            if (!player.discord_user_id) continue;

            // スコアボーナス: 切り上げ（floor → ceil）
            const scoreBonus = player.final_score > 0 ? Math.ceil(player.final_score / 10) : 0;

            // 四麻順位ボーナス（三麻は対象外）
            let rankBonus = 0;
            if (mode === '四麻') {
                const yonmaRankBonus = { 1: 5, 2: 3, 3: 1, 4: 0 };
                rankBonus = yonmaRankBonus[player.rank] || 0;
            }

            const reward = 1 + scoreBonus + rankBonus;

            try {
                // 現在の所持金を取得
                const { data: profile, error: fetchError } = await supabaseClient
                    .from('profiles')
                    .select('coins')
                    .eq('discord_user_id', player.discord_user_id)
                    .maybeSingle();

                if (!fetchError && profile) {
                    // 加算して更新
                    await supabaseClient
                        .from('profiles')
                        .update({ coins: (profile.coins || 0) + reward })
                        .eq('discord_user_id', player.discord_user_id);

                    // 総資産も加算
                    if (typeof addToTotalAssets === 'function') {
                        await addToTotalAssets(player.discord_user_id, reward);
                    }

                    console.log(`${player.account_name} にコイン ${reward} 枚を付与しました（スコア:${scoreBonus} + 順位:${rankBonus} + 基本:1）`);
                }
            } catch (coinErr) {
                console.error(`コイン付与エラー (${player.account_name}):`, coinErr);
            }
        }

        alert('スコアを送信しました！コインが各プレイヤーに付与されました。');

        // Discord通知を送信
        if (typeof DISCORD_WEBHOOK_URL !== 'undefined' && DISCORD_WEBHOOK_URL) {
            await sendDiscordNotification(dataToInsert, isTobiOn, isYakitoriOn);
        }

        window.location.href = './index.html'; // ランキングに戻る
    } catch (err) {
        alert('送信エラー: ' + err.message);
    } finally {
        document.getElementById('loading-overlay').style.display = 'none';
    }
}

/**
 * Discordに試合結果を通知する
 * @param {Array} matchData 挿入された試合結果データ
 * @param {boolean} isTobiOn 飛び賞設定
 * @param {boolean} isYakitoriOn やきとり設定
 */
async function sendDiscordNotification(matchData, isTobiOn, isYakitoriOn) {
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

        const reward = 1 + scoreBonus + rankBonus;

        return `${medal} **${p.rank}位**: ${nameDisplay}${teamInfo}\n` +
            `　　 \`${p.raw_points.toLocaleString()}点\` ➡ **${scoreStr} pts** (💰+${reward})\n`; // 報酬コインを表示
    }).join('\n');

    // ルール情報の取得
    const numPlayers = matchData.length;
    const distPoints = (numPlayers === 3 ? 35000 : 25000);
    const returnPoints = (numPlayers === 3 ? 40000 : 30000);
    const umaDisplay = (numPlayers === 3 ? '0-20' : '10-30');

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

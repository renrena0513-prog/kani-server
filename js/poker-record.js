// ポーカー記録ページ用ロジック
let allProfiles = [];
let allTeams = [];
let isAdmin = false;

// スコアテーブル（人数 → 順位 → スコアポイント）
const POKER_UMA = {
    4: { 1:  4, 2:  2, 3: -2, 4: -4 },
    5: { 1:  5, 2:  3, 3:  0, 4: -3, 5: -5 },
    6: { 1:  6, 2:  4, 3:  1, 4: -1, 5: -4, 6: -6 },
    7: { 1:  7, 2:  5, 3:  2, 4:  0, 5: -2, 6: -5, 7: -7 },
    8: { 1:  8, 2:  6, 3:  3, 4:  1, 5: -1, 6: -3, 7: -6, 8: -8 },
};
// コイン報酬（順位別ボーナス）
const POKER_RANK_BONUS = { 1: 50, 2: 30, 3: 10 };
const POKER_BASE_REWARD = 30;

function showNotice(message, type = 'info') {
    const modal = document.getElementById('notice-modal');
    const dialog = document.getElementById('notice-dialog');
    const title = document.getElementById('notice-title');
    const body = document.getElementById('notice-message');
    if (!modal) return;
    dialog.classList.remove('success', 'warning', 'error', 'info');
    dialog.classList.add(type);
    title.textContent = type === 'success' ? '完了' : type === 'warning' ? '注意' : type === 'error' ? 'エラー' : 'お知らせ';
    body.textContent = message;
    modal.classList.add('active');
}

function closeNotice() {
    document.getElementById('notice-modal')?.classList.remove('active');
}

document.addEventListener('DOMContentLoaded', async () => {
    await checkAdminStatus();
    await fetchProfiles();
    await fetchTeams();
    changePlayerCount();
});

async function checkAdminStatus() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (user) {
        isAdmin = ADMIN_DISCORD_IDS.includes(user.user_metadata.provider_id);
    }
}

async function fetchProfiles() {
    const { data, error } = await supabaseClient
        .from('profiles')
        .select('*, is_hidden, badges!equipped_badge_id(id, image_url, name), badges_right:badges!equipped_badge_id_right(id, image_url, name)');
    if (!error) {
        allProfiles = (data || []).filter(p => !p.is_hidden).sort((a, b) =>
            (a.account_name || '').localeCompare(b.account_name || '', 'ja'));
    }
}

async function fetchTeams() {
    const { data, error } = await supabaseClient
        .from('poker_teams')
        .select('id, team_name')
        .order('team_name');
    if (!error) allTeams = data || [];
}

function changePlayerCount() {
    const count = Number(document.getElementById('form-player-count').value) || 4;
    setupPlayerInputs(count);
}

function setupPlayerInputs(count) {
    const container = document.getElementById('players-container');
    container.innerHTML = '';

    for (let i = 1; i <= count; i++) {
        container.innerHTML += `
            <div class="player-entry" id="player-row-${i}" data-row-index="${i}">
                <div class="row g-2 align-items-center player-row">
                    <div class="col-auto d-flex align-items-center" style="min-width:50px;">
                        <span id="rank-badge-${i}" class="badge bg-secondary fs-6 d-flex align-items-center justify-content-center rank-badge" style="height:38px;width:40px;">${i}位</span>
                    </div>
                    <div class="col team-col">
                        <label class="small text-muted">チーム名</label>
                        <div class="custom-dropdown-container">
                            <input type="hidden" class="player-team" id="player-team-input-${i}" value="">
                            <div class="form-control form-control-sm d-flex align-items-center justify-content-between"
                                 style="cursor:pointer;background:white;padding:8px 12px;height:38px;" onclick="showTeamDropdown(${i})">
                                <div class="d-flex align-items-center gap-2" id="selected-team-display-${i}" style="flex-grow:1;overflow:hidden;">
                                    <span class="text-muted small">チームを選択</span>
                                </div>
                                <span class="small text-muted">▼</span>
                            </div>
                            <div class="custom-dropdown-list" id="team-dropdown-list-${i}"></div>
                        </div>
                    </div>
                    <div class="col account-col">
                        <label class="small text-muted">アカウント名</label>
                        <div class="custom-dropdown-container">
                            <input type="text" class="form-control form-control-sm player-account"
                                   placeholder="選択または入力" onfocus="showDropdown(${i})" oninput="filterDropdown(${i})">
                            <div class="selected-player-badge" id="selected-badge-${i}" style="display:none;">
                                <img src="" class="badge-avatar">
                                <span class="name"></span>
                                <span class="btn-clear" onclick="clearPlayer(${i})">×</span>
                            </div>
                            <div class="custom-dropdown-list" id="dropdown-list-${i}"></div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // 順位バッジを初期化（1位〜N位の色付け）
    for (let i = 1; i <= count; i++) {
        const badge = document.getElementById(`rank-badge-${i}`);
        if (!badge) continue;
        badge.className = 'badge fs-6 d-flex align-items-center justify-content-center rank-badge';
        if (i === 1) badge.classList.add('bg-warning', 'text-dark');
        else if (i === 2) badge.classList.add('bg-info', 'text-dark');
        else if (i === 3) badge.classList.add('bg-success');
        else badge.classList.add('bg-danger');
    }
}

function showDropdown(idx) {
    document.querySelectorAll('.custom-dropdown-list').forEach(l => l.style.display = 'none');
    document.querySelectorAll('.player-entry').forEach(e => { e.style.zIndex = ''; e.style.position = ''; });

    const list = document.getElementById(`dropdown-list-${idx}`);
    const entry = document.getElementById(`player-row-${idx}`);
    entry.style.position = 'relative';
    entry.style.zIndex = '1000';
    renderDropdownItems(idx, allProfiles);
    list.style.display = 'block';

    setTimeout(() => {
        const h = (e) => {
            if (!list.contains(e.target) && !e.target.classList.contains('player-account')) {
                list.style.display = 'none';
                entry.style.zIndex = '';
                entry.style.position = '';
                document.removeEventListener('mousedown', h);
            }
        };
        document.addEventListener('mousedown', h);
    }, 10);
}

function filterDropdown(idx) {
    const input = document.querySelector(`#player-row-${idx} .player-account`);
    const val = input.value.trim().toLowerCase();
    let candidates = allProfiles;
    if (val) {
        candidates = allProfiles.filter(p => {
            const name = (p.account_name || '').toLowerCase();
            return name.includes(val) || (p.discord_user_id || '').includes(val);
        });
    }
    renderDropdownItems(idx, candidates);
    document.getElementById(`dropdown-list-${idx}`).style.display = 'block';
}

function renderDropdownItems(idx, profiles) {
    const list = document.getElementById(`dropdown-list-${idx}`);
    if (profiles.length === 0) {
        list.innerHTML = '<div class="p-2 small text-muted">該当なし</div>';
        return;
    }
    list.innerHTML = profiles.map(p => {
        const display = p.account_name || p.discord_user_id;
        const avatar = p.avatar_url || 'https://via.placeholder.com/24';
        return `
            <div class="dropdown-item-flex" onclick="selectPlayer(${idx}, '${p.discord_user_id}', '${(p.account_name || '').replace(/'/g, "\\'")}')">
                <img src="${avatar}" class="dropdown-avatar" onerror="this.src='https://via.placeholder.com/24'">
                <span class="small">${display}</span>
            </div>`;
    }).join('');
}

function selectPlayer(idx, discordUserId, accountName) {
    const profile = allProfiles.find(p => p.discord_user_id === discordUserId);
    const input = document.querySelector(`#player-row-${idx} .player-account`);
    const badgeEl = document.getElementById(`selected-badge-${idx}`);

    input.value = accountName || discordUserId;
    input.dataset.discordUserId = discordUserId;
    input.dataset.accountName = accountName;
    input.style.display = 'none';

    const avatarImg = badgeEl.querySelector('.badge-avatar');
    avatarImg.src = profile?.avatar_url || 'https://via.placeholder.com/24';
    badgeEl.querySelector('.name').textContent = accountName || discordUserId;
    badgeEl.style.display = 'flex';

    document.getElementById(`dropdown-list-${idx}`).style.display = 'none';
}

function clearPlayer(idx) {
    const input = document.querySelector(`#player-row-${idx} .player-account`);
    const badge = document.getElementById(`selected-badge-${idx}`);
    input.value = '';
    input.dataset.discordUserId = '';
    input.dataset.accountName = '';
    input.style.display = 'block';
    badge.style.display = 'none';
    input.focus();
}

// チーム選択ドロップダウン
function showTeamDropdown(idx) {
    document.querySelectorAll('.custom-dropdown-list').forEach(l => l.style.display = 'none');
    const list = document.getElementById(`team-dropdown-list-${idx}`);
    renderTeamDropdownItems(idx);
    list.style.display = 'block';
    setTimeout(() => {
        const h = (e) => {
            if (!list.contains(e.target) && !e.target.closest('.custom-dropdown-container')) {
                list.style.display = 'none';
                document.removeEventListener('mousedown', h);
            }
        };
        document.addEventListener('mousedown', h);
    }, 10);
}

function renderTeamDropdownItems(idx) {
    const list = document.getElementById(`team-dropdown-list-${idx}`);
    let html = `<div class="dropdown-item-flex" onclick="clearTeam(${idx})"><span class="small text-muted">選択解除</span></div>`;
    html += allTeams.map(t =>
        `<div class="dropdown-item-flex" onclick="selectTeam(${idx}, '${t.id}', '${t.team_name.replace(/'/g, "\\'")}')">
            <span style="margin-right:8px;">🏅</span><span class="small">${t.team_name}</span></div>`
    ).join('');
    list.innerHTML = html;
}

function selectTeam(idx, teamId, teamName) {
    document.getElementById(`player-team-input-${idx}`).value = teamId;
    const display = document.getElementById(`selected-team-display-${idx}`);
    display.innerHTML = `🏅 <span style="font-weight:bold;">${teamName}</span>`;
    document.getElementById(`team-dropdown-list-${idx}`).style.display = 'none';
}

function clearTeam(idx) {
    document.getElementById(`player-team-input-${idx}`).value = '';
    document.getElementById(`selected-team-display-${idx}`).innerHTML = '<span class="text-muted small">チームを選択</span>';
    document.getElementById(`team-dropdown-list-${idx}`).style.display = 'none';
}

function toggleRuleSettings() {
    const content = document.getElementById('rule-settings-content');
    const icon = document.getElementById('rule-toggle-icon');
    if (!content) return;
    const isOpen = content.style.display !== 'none';
    content.style.display = isOpen ? 'none' : 'block';
    if (icon) icon.textContent = isOpen ? '▼' : '▲';
}

// 送信処理
async function submitScores() {
    const submitBtn = document.querySelector('.btn-submit');
    if (submitBtn.disabled) return;
    submitBtn.disabled = true;
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> 送信中...';

    const resetBtn = () => {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalText;
        document.getElementById('loading-overlay').style.display = 'none';
    };

    const tournament = '第二回ポーカー大会';
    const match = 'チーム戦';
    const playerCount = Number(document.getElementById('form-player-count').value) || 4;

    const entries = document.querySelectorAll('.player-entry');
    const tempData = [];

    for (const entry of entries) {
        const input = entry.querySelector('.player-account');
        const discordUserId = input.dataset.discordUserId || '';
        const accountName = input.dataset.accountName || input.value.trim();
        const rankIdx = entry.dataset.rowIndex;

        if (!accountName) continue;

        const teamId = entry.querySelector('.player-team')?.value;
        let teamName = null;
        if (teamId) {
            const team = allTeams.find(t => t.id === teamId);
            teamName = team?.team_name || null;
        }

        tempData.push({
            discord_user_id: discordUserId || null,
            account_name: accountName,
            rank: Number(rankIdx),
            rebuy_count: 0,
            team_name: teamName
        });
    }

    // バリデーション
    if (tempData.length < 2) {
        showNotice('2人以上のプレイヤーを入力してください。', 'warning');
        resetBtn();
        return;
    }

    if (!isAdmin && tempData.length !== playerCount) {
        showNotice(`${playerCount}人分のアカウント名をすべて入力してください。`, 'warning');
        resetBtn();
        return;
    }

    const discordIds = tempData.filter(p => p.discord_user_id).map(p => p.discord_user_id);
    if (new Set(discordIds).size !== discordIds.length) {
        showNotice('同じユーザーが複数選択されています。', 'warning');
        resetBtn();
        return;
    }

    const names = tempData.map(p => p.account_name);
    if (new Set(names).size !== names.length) {
        showNotice('アカウント名が重複しています。', 'warning');
        resetBtn();
        return;
    }

    if (tempData.some(p => !p.team_name)) {
        showNotice('全員のチームを選択してください。', 'warning');
        resetBtn();
        return;
    }

    // スコア計算
    const actualPlayerCount = tempData.length;
    const umaTable = POKER_UMA[actualPlayerCount] || {};
    tempData.forEach(p => {
        p.final_score = umaTable[p.rank] ?? 0;
        p.player_count = actualPlayerCount;
    });

    // 挿入データ構築
    const matchId = crypto.randomUUID();
    const now = new Date().toISOString();
    const submittedBy = await getEffectiveUserId();

    const dataToInsert = tempData.map(p => ({
        match_id: matchId,
        event_datetime: now,
        discord_user_id: p.discord_user_id,
        account_name: p.account_name,
        tournament_type: tournament,
        match_mode: match,
        team_name: p.team_name,
        player_count: p.player_count,
        rank: p.rank,
        final_score: p.final_score,
        rebuy_count: p.rebuy_count,
        submitted_by_discord_user_id: submittedBy
    }));

    document.getElementById('loading-overlay').style.display = 'flex';

    try {
        const { error } = await supabaseClient.from('poker_results').insert(dataToInsert);
        if (error) throw error;

        // 報酬付与
        for (const player of dataToInsert) {
            if (!player.discord_user_id) continue;

            const isRecorder = player.discord_user_id === submittedBy;
            const ticketChance = isRecorder ? 0.50 : 0.30;
            let ticketReward = Math.random() < ticketChance ? 1 : 0;
            if (player.rank === 1 && Math.random() < 0.80) ticketReward++;

            const rankBonus = POKER_RANK_BONUS[player.rank] || 0;
            const coinReward = POKER_BASE_REWARD + rankBonus;

            try {
                const { data: profile } = await supabaseClient
                    .from('profiles')
                    .select('coins, total_assets, gacha_tickets')
                    .eq('discord_user_id', player.discord_user_id)
                    .single();

                const updates = {};
                if (coinReward > 0) {
                    updates.coins = (profile?.coins || 0) + coinReward;
                    updates.total_assets = (profile?.total_assets || 0) + coinReward;
                }
                if (ticketReward > 0) {
                    updates.gacha_tickets = (profile?.gacha_tickets || 0) + ticketReward;
                }

                if (Object.keys(updates).length > 0) {
                    await supabaseClient.from('profiles').update(updates).eq('discord_user_id', player.discord_user_id);
                }

                await logActivity(player.discord_user_id, 'poker', {
                    amount: coinReward,
                    matchId: matchId,
                    details: {
                        rank: player.rank,
                        score: player.final_score,
                        team: player.team_name,
                        coin_reward: coinReward,
                        ticket_reward: ticketReward,
                        breakdown: { base: POKER_BASE_REWARD, rank: rankBonus }
                    }
                });
            } catch (err) {
                console.error(`報酬付与エラー (${player.account_name}):`, err);
            }
        }

        await sendDiscordNotification(dataToInsert);
        showNotice('スコアを送信しました！コインが各プレイヤーに付与されました。', 'success');
        clearFormAfterSubmit();
        resetBtn();
    } catch (err) {
        showNotice('送信エラー: ' + err.message, 'error');
        resetBtn();
    } finally {
        document.getElementById('loading-overlay').style.display = 'none';
    }
}

function clearFormAfterSubmit() {
    const count = Number(document.getElementById('form-player-count').value) || 4;
    for (let i = 1; i <= count; i++) {
        const rebuy = document.querySelector(`#player-row-${i} .player-rebuy`);
        if (rebuy) rebuy.value = '0';
        clearPlayer(i);
    }
}

async function sendDiscordNotification(matchData) {
    if (!matchData || matchData.length === 0) return;
    const first = matchData[0];
    const matchType = first.match_mode;

    const sorted = [...matchData].sort((a, b) => a.rank - b.rank);
    const scoreDisplay = sorted.map(p => {
        const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : '🔹';
        const nameDisplay = p.discord_user_id ? `<@${p.discord_user_id}>` : p.account_name;
        const teamInfo = p.team_name ? ` (${p.team_name})` : '';
        const scoreStr = (p.final_score > 0 ? '+' : '') + p.final_score.toFixed(1);
        const rankBonus = POKER_RANK_BONUS[p.rank] || 0;
        const reward = POKER_BASE_REWARD + rankBonus;
        return `${medal} **${p.rank}位**: ${nameDisplay}${teamInfo}\n` +
               `　　 **${scoreStr} pts**　(💰+${reward})`;
    }).join('\n');

    const reporterMention = first.submitted_by_discord_user_id ? `<@${first.submitted_by_discord_user_id}>` : '不明';

    const embed = {
        title: `🃏 ${matchType} 結果`,
        description: scoreDisplay + '\n━━━━━━━━━━━━━━━━',
        color: 0x1a4d8c,
        fields: [
            { name: '✍️ 記録者', value: reporterMention, inline: true }
        ],
        timestamp: new Date().toISOString(),
        footer: { text: 'かに鯖ポーカー大会システム' }
    };

    try {
        await supabaseClient.functions.invoke('notify-discord', {
            body: {
                content: matchData.filter(p => p.discord_user_id).map(p => `<@${p.discord_user_id}>`).join(' '),
                embeds: [embed]
            }
        });
    } catch (err) {
        console.error('Discord通知エラー:', err);
    }
}

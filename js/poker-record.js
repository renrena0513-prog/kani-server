// ポーカー記録ページ用ロジック
let allProfiles = [];
let allTeams = [];
let pokerMemberMap = {}; // discord_user_id -> team_id (poker_profilesから)
let isAdmin = false;

// スコアテーブル（人数 → 順位 → スコアポイント、整数）
const POKER_UMA = {
    4: { 1:  4, 2:  2, 3: -2, 4: -4 },
    5: { 1:  5, 2:  3, 3:  0, 4: -3, 5: -5 },
    6: { 1:  6, 2:  4, 3:  1, 4: -1, 5: -4, 6: -6 },
    7: { 1:  7, 2:  5, 3:  2, 4:  0, 5: -2, 6: -5, 7: -7 },
    8: { 1:  8, 2:  6, 3:  3, 4:  1, 5: -1, 6: -3, 7: -6, 8: -8 },
};
// チップ付与テーブル（人数 → 順位 → チップ数）
const POKER_CHIP_TABLE = {
    4: { 1: 100, 2:  60, 3:  30, 4:  10 },
    5: { 1: 130, 2:  80, 3:  50, 4:  20, 5:  10 },
    6: { 1: 160, 2: 100, 3:  70, 4:  30, 5:  20, 6:  10 },
    7: { 1: 190, 2: 120, 3:  90, 4:  40, 5:  30, 6:  20, 7:  10 },
    8: { 1: 220, 2: 140, 3: 110, 4:  50, 5:  40, 6:  30, 7:  20, 8:  10 },
};

// コイン報酬テーブル（人数 → 順位 → 固定コイン数）
const POKER_COIN_TABLE = {
    4: { 1: 1800, 2: 1400, 3:  600, 4:  200 },
    5: { 1: 2200, 2: 1800, 3: 1200, 4:  600, 5:  200 },
    6: { 1: 2600, 2: 2200, 3: 1600, 4: 1200, 5:  600, 6:  200 },
    7: { 1: 3000, 2: 2600, 3: 2000, 4: 1600, 5: 1200, 6:  600, 7:  200 },
    8: { 1: 3400, 2: 3000, 3: 2400, 4: 2000, 5: 1600, 6: 1200, 7:  600, 8:  200 },
};

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
    await Promise.all([fetchProfiles(), fetchTeams(), fetchPokerProfiles()]);
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
        .select('id, team_name, icon_url')
        .order('team_name');
    if (!error) allTeams = data || [];
}

async function fetchPokerProfiles() {
    const { data } = await supabaseClient
        .from('poker_profiles')
        .select('discord_user_id, team_id');
    pokerMemberMap = {};
    (data || []).forEach(p => { pokerMemberMap[p.discord_user_id] = p.team_id || null; });
}

function changePlayerCount() {
    const count = Number(document.getElementById('form-player-count').value) || 4;
    setupPlayerInputs(count);
}

function capturePlayerStates() {
    const states = [];
    document.querySelectorAll('.player-entry').forEach(row => {
        const input = row.querySelector('.player-account');
        const badge = row.querySelector('.selected-player-badge');
        const teamInput = row.querySelector('[id^="player-team-input-"]');
        const teamDisplay = row.querySelector('[id^="selected-team-display-"]');
        states.push({
            discordUserId: input?.dataset.discordUserId || '',
            accountName: input?.dataset.accountName || '',
            avatarSrc: badge?.querySelector('.badge-avatar')?.src || '',
            displayName: badge?.querySelector('.name')?.textContent || '',
            badgeVisible: badge?.style.display !== 'none',
            teamId: teamInput?.value || '',
            teamHtml: teamDisplay?.innerHTML || ''
        });
    });
    return states;
}

function restorePlayerState(i, state) {
    if (!state || !state.discordUserId) return;
    const input = document.querySelector(`#player-row-${i} .player-account`);
    const badge = document.getElementById(`selected-badge-${i}`);
    const teamInput = document.getElementById(`player-team-input-${i}`);
    const teamDisplay = document.getElementById(`selected-team-display-${i}`);
    if (input) {
        input.dataset.discordUserId = state.discordUserId;
        input.dataset.accountName = state.accountName;
        input.style.display = 'none';
    }
    if (badge) {
        badge.querySelector('.badge-avatar').src = state.avatarSrc;
        badge.querySelector('.name').textContent = state.displayName;
        badge.style.display = 'flex';
    }
    if (teamInput) teamInput.value = state.teamId;
    if (teamDisplay && state.teamHtml) teamDisplay.innerHTML = state.teamHtml;
}

function setupPlayerInputs(count) {
    const container = document.getElementById('players-container');
    const prevStates = capturePlayerStates();
    container.innerHTML = '';

    for (let i = 1; i <= count; i++) {
        container.innerHTML += `
            <div class="player-entry" id="player-row-${i}" data-row-index="${i}">
                <div class="row g-2 align-items-center player-row">
                    <div class="col-auto d-flex align-items-center gap-1" style="min-width:60px;">
                        <span class="drag-handle" title="ドラッグで順位変更">⠿</span>
                        <span id="rank-badge-${i}" class="badge bg-secondary fs-6 d-flex align-items-center justify-content-center rank-badge" style="height:38px;width:40px;">${i}位</span>
                    </div>
                    <div class="col team-col">
                        <label class="small text-muted">チーム名</label>
                        <div class="custom-dropdown-container">
                            <input type="hidden" class="player-team" id="player-team-input-${i}" value="">
                            <div class="form-control form-control-sm d-flex align-items-center justify-content-between"
                                 style="cursor:pointer;padding:8px 12px;height:38px;" onclick="showTeamDropdown(${i})">
                                <div class="d-flex align-items-center gap-2" id="selected-team-display-${i}" style="flex-grow:1;overflow:hidden;">
                                    <span style="color:rgba(255,255,255,0.45);font-size:.875rem;">チームを選択</span>
                                </div>
                                <span style="color:rgba(255,255,255,0.5);font-size:.875rem;">▼</span>
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

    // 以前の入力を復元
    prevStates.forEach((state, i) => restorePlayerState(i + 1, state));

    // 順位バッジを初期化（1位〜N位の色付け）
    refreshRankBadges();

    // ドラッグ＆ドロップ初期化
    initDragSort();
}

/** 順位バッジの色を現在の行順に合わせて更新 */
function refreshRankBadges() {
    const container = document.getElementById('players-container');
    if (!container) return;
    const rows = container.querySelectorAll('.player-entry');
    rows.forEach((row, i) => {
        const rank = i + 1;
        row.dataset.rowIndex = rank;
        const badge = row.querySelector('.rank-badge');
        if (!badge) return;
        badge.textContent = `${rank}位`;
        badge.className = 'badge fs-6 d-flex align-items-center justify-content-center rank-badge';
        if (rank === 1) badge.classList.add('bg-warning', 'text-dark');
        else if (rank === 2) badge.classList.add('bg-info', 'text-dark');
        else if (rank === 3) badge.classList.add('bg-success');
        else badge.classList.add('bg-danger');
    });
}

/** ドラッグ＆ドロップ + タッチによる行並び替え */
function initDragSort() {
    const container = document.getElementById('players-container');
    if (!container) return;

    // ── デスクトップ: HTML5 drag ──
    let dragSrc = null;

    container.querySelectorAll('.player-entry').forEach(row => {
        // ハンドル要素からのみドラッグ開始を許可
        const handle = row.querySelector('.drag-handle');
        if (handle) {
            handle.addEventListener('mousedown', () => { row.setAttribute('draggable', 'true'); });
            document.addEventListener('mouseup', () => { row.setAttribute('draggable', 'false'); }, { once: false });
        }

        row.addEventListener('dragstart', e => {
            if (!row.getAttribute('draggable') || row.getAttribute('draggable') === 'false') {
                e.preventDefault(); return;
            }
            dragSrc = row;
            row.style.opacity = '0.4';
            e.dataTransfer.effectAllowed = 'move';
        });
        row.addEventListener('dragend', () => {
            if (dragSrc) dragSrc.style.opacity = '';
            dragSrc = null;
            container.querySelectorAll('.player-entry').forEach(r => r.classList.remove('drag-over'));
            refreshRankBadges();
        });
        row.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
        row.addEventListener('dragenter', e => { e.preventDefault(); if (row !== dragSrc) row.classList.add('drag-over'); });
        row.addEventListener('dragleave', e => { if (!row.contains(e.relatedTarget)) row.classList.remove('drag-over'); });
        row.addEventListener('drop', e => {
            e.stopPropagation();
            if (dragSrc && dragSrc !== row) {
                const rows = [...container.querySelectorAll('.player-entry')];
                const srcIdx = rows.indexOf(dragSrc);
                const dstIdx = rows.indexOf(row);
                container.insertBefore(dragSrc, srcIdx < dstIdx ? row.nextSibling : row);
            }
            row.classList.remove('drag-over');
        });
    });

    // ── モバイル: Touch ──
    let touchSrc = null;
    let touchClone = null;
    let touchOffX = 0, touchOffY = 0;
    let autoScrollTimer = null;

    function stopAutoScroll() {
        if (autoScrollTimer) { clearInterval(autoScrollTimer); autoScrollTimer = null; }
    }
    function startAutoScroll(dir) {
        stopAutoScroll();
        autoScrollTimer = setInterval(() => window.scrollBy(0, dir * 10), 16);
    }

    container.querySelectorAll('.player-entry').forEach(row => {
        row.addEventListener('touchstart', e => {
            // ハンドルを触ったときだけ発動
            if (!e.target.closest('.drag-handle')) return;

            touchSrc = row;
            const touch = e.touches[0];
            const rect = row.getBoundingClientRect();
            touchOffX = touch.clientX - rect.left;
            touchOffY = touch.clientY - rect.top;

            // クローン（幽霊）を作成
            touchClone = row.cloneNode(true);
            touchClone.style.cssText = `
                position:fixed; z-index:9999; pointer-events:none; opacity:0.85;
                width:${rect.width}px; left:${rect.left}px; top:${rect.top}px;
                border-radius:10px; background:white;
                box-shadow:0 8px 24px rgba(0,0,0,0.25);
            `;
            document.body.appendChild(touchClone);
            row.style.opacity = '0.3';
        }, { passive: true });

        row.addEventListener('touchmove', e => {
            if (!touchSrc || !touchClone) return;
            e.preventDefault();
            const touch = e.touches[0];
            touchClone.style.left = (touch.clientX - touchOffX) + 'px';
            touchClone.style.top  = (touch.clientY - touchOffY) + 'px';

            // 画面端で自動スクロール
            const ZONE = 100;
            const vy = touch.clientY;
            const speed = dist => Math.round((ZONE - dist) / ZONE * 30 + 12);
            if (vy < ZONE) startAutoScroll(-speed(vy));
            else if (vy > window.innerHeight - ZONE) startAutoScroll(speed(window.innerHeight - vy));
            else stopAutoScroll();

            // どの行の上にいるか判定してハイライト
            container.querySelectorAll('.player-entry').forEach(r => r.classList.remove('drag-over'));
            const target = rowAtPoint(container, touch.clientX, touch.clientY);
            if (target && target !== touchSrc) target.classList.add('drag-over');
        }, { passive: false });

        row.addEventListener('touchend', e => {
            stopAutoScroll();
            if (!touchSrc || !touchClone) return;
            const touch = e.changedTouches[0];
            touchClone.remove();
            touchClone = null;
            touchSrc.style.opacity = '';

            const target = rowAtPoint(container, touch.clientX, touch.clientY);
            if (target && target !== touchSrc) {
                const rows = [...container.querySelectorAll('.player-entry')];
                const srcIdx = rows.indexOf(touchSrc);
                const dstIdx = rows.indexOf(target);
                container.insertBefore(touchSrc, srcIdx < dstIdx ? target.nextSibling : target);
            }
            container.querySelectorAll('.player-entry').forEach(r => r.classList.remove('drag-over'));
            touchSrc = null;
            refreshRankBadges();
        });
    });
}

/** 座標からcontainer内のplayer-entry行を返す */
function rowAtPoint(container, x, y) {
    for (const row of container.querySelectorAll('.player-entry')) {
        const r = row.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return row;
    }
    return null;
}

function getSelectedDiscordIds(excludeIdx) {
    const ids = new Set();
    document.querySelectorAll('.player-account').forEach((input, i) => {
        const rowIdx = input.closest('.player-entry')?.id?.replace('player-row-', '');
        if (rowIdx !== String(excludeIdx) && input.dataset.discordUserId) {
            ids.add(input.dataset.discordUserId);
        }
    });
    return ids;
}

function getFilteredProfiles(idx) {
    const teamId = document.getElementById(`player-team-input-${idx}`)?.value || '';
    const selectedIds = getSelectedDiscordIds(idx);
    let candidates;
    if (teamId) {
        candidates = allProfiles.filter(p => pokerMemberMap[p.discord_user_id] === teamId);
    } else {
        candidates = allProfiles.filter(p => pokerMemberMap[p.discord_user_id]);
    }
    return candidates.filter(p => !selectedIds.has(p.discord_user_id));
}

function showDropdown(idx) {
    document.querySelectorAll('.custom-dropdown-list').forEach(l => l.style.display = 'none');
    document.querySelectorAll('.player-entry').forEach(e => { e.style.zIndex = ''; e.style.position = ''; });

    const list = document.getElementById(`dropdown-list-${idx}`);
    const entry = document.getElementById(`player-row-${idx}`);
    entry.style.position = 'relative';
    entry.style.zIndex = '1000';
    renderDropdownItems(idx, getFilteredProfiles(idx));
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
    let candidates = getFilteredProfiles(idx);
    if (val) {
        candidates = candidates.filter(p => {
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

    // 所属チームを自動セット（チームが未選択の場合のみ）
    const currentTeamId = document.getElementById(`player-team-input-${idx}`)?.value;
    if (!currentTeamId) {
        const teamId = pokerMemberMap[discordUserId];
        if (teamId) {
            const team = allTeams.find(t => t.id === teamId);
            if (team) applyTeam(idx, team.id, team.team_name);
        }
    }
}

function clearPlayer(idx, clearTeamToo = true) {
    const input = document.querySelector(`#player-row-${idx} .player-account`);
    const badge = document.getElementById(`selected-badge-${idx}`);
    input.value = '';
    input.dataset.discordUserId = '';
    input.dataset.accountName = '';
    input.style.display = 'block';
    badge.style.display = 'none';
    if (clearTeamToo) {
        const teamInput = document.getElementById(`player-team-input-${idx}`);
        const teamDisplay = document.getElementById(`selected-team-display-${idx}`);
        if (teamInput) teamInput.value = '';
        if (teamDisplay) teamDisplay.innerHTML = '<span class="text-muted small">チームを選択</span>';
    }
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
    let html = `<div class="dropdown-item-flex" onclick="clearTeam(${idx})"><span style="color:rgba(255,255,255,0.5);font-size:.875rem;">選択解除</span></div>`;
    html += allTeams.map(t => {
        const iconHtml = t.icon_url
            ? `<img src="${t.icon_url}" style="width:20px;height:20px;object-fit:contain;border-radius:4px;margin-right:8px;">`
            : `<span style="margin-right:8px;">🏅</span>`;
        return `<div class="dropdown-item-flex" onclick="selectTeam(${idx}, '${t.id}', '${t.team_name.replace(/'/g, "\\'")}')">
            ${iconHtml}<span style="font-size:.875rem;">${t.team_name}</span></div>`;
    }).join('');
    list.innerHTML = html;
}

function applyTeam(idx, teamId, teamName) {
    document.getElementById(`player-team-input-${idx}`).value = teamId;
    const display = document.getElementById(`selected-team-display-${idx}`);
    const team = allTeams.find(t => t.id === teamId);
    const iconHtml = team?.icon_url
        ? `<img src="${team.icon_url}" style="width:20px;height:20px;object-fit:contain;border-radius:4px;margin-right:6px;">`
        : `🏅 `;
    display.innerHTML = `${iconHtml}<span style="font-weight:bold;color:#fff;">${teamName}</span>`;
}

function selectTeam(idx, teamId, teamName) {
    applyTeam(idx, teamId, teamName);
    document.getElementById(`team-dropdown-list-${idx}`).style.display = 'none';
    // チーム変更時はプレイヤーのみクリア（チーム表示は維持）
    clearPlayer(idx, false);
}

function clearTeam(idx) {
    document.getElementById(`player-team-input-${idx}`).value = '';
    document.getElementById(`selected-team-display-${idx}`).innerHTML = '<span style="color:rgba(255,255,255,0.45);font-size:.875rem;">チームを選択</span>';
    document.getElementById(`team-dropdown-list-${idx}`).style.display = 'none';
    clearPlayer(idx);
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

    // 人数不足チェック
    if (tempData.length !== playerCount) {
        if (!isAdmin) {
            showNotice(`${playerCount}人分のアカウント名をすべて入力してください。`, 'warning');
            resetBtn();
            return;
        }
        if (!confirm(`${playerCount}人分埋まっていませんが（現在${tempData.length}人）、管理者権限で強制送信しますか？`)) {
            resetBtn();
            return;
        }
    }

    // チーム未選択チェック
    if (tempData.some(p => !p.team_name)) {
        if (!isAdmin) {
            showNotice('全員のチームを選択してください。', 'warning');
            resetBtn();
            return;
        }
        if (!confirm('チームが未選択のプレイヤーがいます。管理者権限で強制送信しますか？')) {
            resetBtn();
            return;
        }
    }

    // スコア計算（フォーム選択の参加人数でUMAテーブルを引く、整数）
    const umaTable = POKER_UMA[playerCount] || {};
    tempData.forEach(p => {
        p.final_score = umaTable[p.rank] ?? 0; // 整数
        p.player_count = playerCount;
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

    // デイリーボーナスチェック（挿入前に各プレイヤーの本日初参加を確認）
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const playerIds = dataToInsert.map(p => p.discord_user_id).filter(Boolean);
    const firstTimeTodaySet = new Set();
    for (const pid of playerIds) {
        const { count } = await supabaseClient
            .from('poker_results')
            .select('id', { count: 'exact', head: true })
            .eq('discord_user_id', pid)
            .gte('event_datetime', todayStart.toISOString());
        if (count === 0) firstTimeTodaySet.add(pid);
    }

    document.getElementById('loading-overlay').style.display = 'flex';

    try {
        const { error } = await supabaseClient.from('poker_results').insert(dataToInsert);
        if (error) throw error;

        // 報酬付与
        const coinTable = POKER_COIN_TABLE[playerCount] || {};
        const chipTable = POKER_CHIP_TABLE[playerCount] || {};
        for (const player of dataToInsert) {
            if (!player.discord_user_id) continue;

            const isRecorder = player.discord_user_id === submittedBy;
            const ticketChance = isRecorder ? 0.50 : 0.30;
            let ticketReward = Math.random() < ticketChance ? 1 : 0;
            if (player.rank === 1 && Math.random() < 0.80) ticketReward++;

            const coinReward = coinTable[player.rank] || 0;
            const chipReward = chipTable[player.rank] || 0;

            try {
                const { data: profile } = await supabaseClient
                    .from('profiles')
                    .select('coins, total_assets, gacha_tickets, tip')
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
                if (chipReward > 0) {
                    updates.tip = (profile?.tip || 0) + chipReward;
                }

                if (Object.keys(updates).length > 0) {
                    const { error: updateErr } = await supabaseClient.from('profiles').update(updates).eq('discord_user_id', player.discord_user_id);
                    if (updateErr) console.error(`プロフィール更新エラー (${player.account_name}):`, updateErr);
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
                        chip_reward: chipReward,
                    }
                });
                console.log(`${player.account_name} 報酬: コイン=${coinReward}, チケット=${ticketReward}, チップ=${chipReward}`);
            } catch (err) {
                console.error(`報酬付与エラー (${player.account_name}):`, err);
            }
        }

        // デイリーボーナス付与（各プレイヤーの本日初参加なら+10,000コイン）
        const bonusReceivers = [];
        for (const player of dataToInsert) {
            if (!player.discord_user_id) continue;
            if (!firstTimeTodaySet.has(player.discord_user_id)) continue;
            try {
                const { data: prof } = await supabaseClient
                    .from('profiles').select('coins, total_assets')
                    .eq('discord_user_id', player.discord_user_id).single();
                await supabaseClient.from('profiles').update({
                    coins: (prof?.coins || 0) + 10000,
                    total_assets: (prof?.total_assets || 0) + 10000
                }).eq('discord_user_id', player.discord_user_id);
                await logActivity(player.discord_user_id, 'poker', {
                    amount: 10000,
                    matchId: matchId,
                    details: { note: '初参加デイリーボーナス' }
                });
                bonusReceivers.push(player.account_name);
            } catch (err) {
                console.error(`デイリーボーナスエラー (${player.account_name}):`, err);
            }
        }

        await sendDiscordNotification(dataToInsert, playerCount, bonusReceivers);
        const bonusMsg = bonusReceivers.length > 0 ? `　🎁 初参加ボーナス +10,000コイン: ${bonusReceivers.join('、')}` : '';
        showNotice('スコアを送信しました！コインが各プレイヤーに付与されました。' + bonusMsg, 'success');
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
    // 送信後もフォームの選択状態を保持する（何もしない）
}

async function sendDiscordNotification(matchData, playerCount, bonusReceivers = []) {
    if (!matchData || matchData.length === 0) return;
    if (typeof DISCORD_WEBHOOK_URL === 'undefined' || !DISCORD_WEBHOOK_URL) return;

    const first = matchData[0];
    const matchType = first.match_mode;
    const coinTable = POKER_COIN_TABLE[playerCount] || {};
    const sorted = [...matchData].sort((a, b) => a.rank - b.rank);

    const MEDALS = ['🥇', '🥈', '🥉'];
    const rankFields = sorted.map(p => {
        const medal = MEDALS[p.rank - 1] || `**${p.rank}位**`;
        const nameDisplay = p.discord_user_id ? `<@${p.discord_user_id}>` : `**${p.account_name}**`;
        const teamInfo = p.team_name ? `\n🏅 ${p.team_name}` : '';
        const scoreStr = (p.final_score > 0 ? '+' : '') + p.final_score;
        const reward = (coinTable[p.rank] || 0).toLocaleString();
        return {
            name: `${medal}　${p.rank}位`,
            value: `${nameDisplay}${teamInfo}\n> **${scoreStr} pts** ・ 💰 +${reward}`,
            inline: false
        };
    });

    const reporterMention = first.submitted_by_discord_user_id
        ? `<@${first.submitted_by_discord_user_id}>`
        : '不明';

    const fields = [...rankFields];
    if (bonusReceivers.length > 0) {
        fields.push({
            name: '🎁 本日初参加ボーナス +10,000コイン',
            value: bonusReceivers.join('、'),
            inline: false
        });
    }
    fields.push({ name: '✍️ 記録者', value: reporterMention, inline: false });

    const embed = {
        title: `🃏 ${matchType}　${playerCount}人トーナメント　結果`,
        color: 0x1a4d8c,
        fields,
        timestamp: new Date().toISOString(),
        footer: { text: 'かに鯖ポーカー大会システム' }
    };

    try {
        const res = await fetch(DISCORD_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                content: matchData.filter(p => p.discord_user_id).map(p => `<@${p.discord_user_id}>`).join(' '),
                embeds: [embed]
            })
        });
        if (!res.ok) {
            const body = await res.text();
            console.error('Discord通知失敗:', res.status, body);
        } else {
            console.log('Discord通知送信成功');
        }
    } catch (err) {
        console.error('Discord通知エラー:', err);
    }
}

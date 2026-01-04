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
    const match = document.getElementById('form-match').value;
    const teamCols = document.querySelectorAll('.team-col');
    teamCols.forEach(col => {
        col.style.display = (match === 'チーム戦') ? 'block' : 'none';
    });
}

function setupPlayerInputs(count) {
    const container = document.getElementById('players-container');
    container.innerHTML = '';
    const match = document.getElementById('form-match').value;

    for (let i = 1; i <= count; i++) {
        container.innerHTML += `
            <div class="player-entry" id="player-row-${i}">
                <div class="row g-2 align-items-end">
                    <div class="col-md-3 team-col" style="display: ${match === 'チーム戦' ? 'block' : 'none'}">
                        <label class="small text-muted">チーム名</label>
                        <input type="text" class="form-control form-control-sm player-team" placeholder="チーム名">
                    </div>
                    <div class="${match === 'チーム戦' ? 'col-md-3' : 'col-md-4'}">
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
                    <div class="col-md-2">
                        <label class="small text-muted">得点</label>
                        <input type="number" step="0.1" class="form-control form-control-sm player-score" placeholder="0.0">
                    </div>
                    <div class="col-md-2">
                        <label class="small text-muted">和了数</label>
                        <input type="number" class="form-control form-control-sm player-win" value="0">
                    </div>
                    <div class="col-md-2">
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
    // 他の開いているドロップダウンを全て閉じる
    document.querySelectorAll('.custom-dropdown-list').forEach(list => {
        list.style.display = 'none';
    });

    const list = document.getElementById(`dropdown-list-${idx}`);
    renderDropdownItems(idx, allProfiles);
    list.style.display = 'block';

    // 別クリックで閉じる
    setTimeout(() => {
        const h = (e) => {
            if (!list.contains(e.target) && !e.target.classList.contains('player-account')) {
                list.style.display = 'none';
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
        const display = p.nickname || p.discord_account;
        return `
            <div class="dropdown-item-flex" onclick="selectPlayer(${idx}, '${p.discord_account}')">
                <img src="${p.avatar_url}" class="dropdown-avatar" onerror="this.src='https://via.placeholder.com/24'">
                <span class="small">${display}</span>
            </div>
        `;
    }).join('');
}

function selectPlayer(idx, account) {
    const profile = allProfiles.find(p => p.discord_account === account);
    const input = document.querySelector(`#player-row-${idx} .player-account`);
    const badge = document.getElementById(`selected-badge-${idx}`);
    input.value = account;
    input.style.display = 'none';
    badge.querySelector('img').src = (profile && profile.avatar_url) ? profile.avatar_url : 'https://via.placeholder.com/24';
    badge.querySelector('.name').textContent = (profile && profile.nickname) ? profile.nickname : account;
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
    const dataToInsert = [];
    const now = new Date().toISOString();

    let filledCount = 0;
    for (const entry of entries) {
        const account = entry.querySelector('.player-account').value;
        const score = entry.querySelector('.player-score').value;

        if (account && score !== '') {
            filledCount++;
            dataToInsert.push({
                event_datetime: now,
                discord_account: account,
                tournament_type: '第二回麻雀大会',
                mahjong_mode: mode,
                match_mode: match,
                team_name: (match === 'チーム戦') ? (entry.querySelector('.player-team').value || null) : null,
                score: Number(score),
                hand_count: hands,
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

    if (dataToInsert.length === 0) {
        alert('データを入力してください');
        return;
    }

    if (isAdmin && filledCount < targetCount) {
        if (!confirm(`${targetCount}人分埋まっていませんが、管理者権限で強制送信しますか？`)) {
            return;
        }
    }

    document.getElementById('loading-overlay').style.display = 'flex';

    try {
        const { error } = await supabaseClient
            .from('tournament_records')
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

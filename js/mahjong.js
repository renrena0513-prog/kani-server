// 麻雀ページ用ロジック
let allRecords = [];
let allProfiles = []; // プロフィール情報（アイコン付き）

document.addEventListener('DOMContentLoaded', () => {
    fetchData();
    changePlayerCount(); // プルダウンの状態に合わせて初期化
});

function changePlayerCount() {
    const mode = document.getElementById('form-mode').value;
    const count = mode === '三麻' ? 3 : 4;
    setupPlayerInputs(count);
}


async function fetchData() {
    try {
        // 記録取得（全シーズン）
        const { data, error } = await supabaseClient
            .from('match_results')
            .select('*');
        if (error) throw error;
        allRecords = data;

        // 全プロフィール取得（アイコン用）
        const { data: profiles, error: pError } = await supabaseClient
            .from('profiles')
            .select('*');
        if (!pError && profiles.length > 0) {
            allProfiles = profiles;
        } else {
            // 背景：profilesが空（まだ誰もログインして同期してない）場合
            // match_results から過去の名前を拾って仮のリストを作る
            const names = Array.from(new Set(allRecords.map(r => r.account_name)));
            allProfiles = names.map(n => ({ account_name: n, avatar_url: '' }));
        }


        showRanking('all'); // 初期表示は総合個人ランキング
    } catch (err) {
        console.error('データ取得エラー:', err);
    }
}

// シーズン切り替え
function toggleSeason(season) {
    currentSeason = season;

    // ボタンのスタイル更新
    const seasonButtons = document.querySelectorAll('.btn-group .btn');
    seasonButtons.forEach(btn => {
        if (season === 'current' && btn.textContent === '今シーズン') {
            btn.classList.replace('btn-outline-primary', 'btn-primary');
        } else if (season === 'all' && btn.textContent === '全シーズン') {
            btn.classList.replace('btn-outline-primary', 'btn-primary');
        } else {
            btn.classList.replace('btn-primary', 'btn-outline-primary');
        }
    });

    // 現在表示中のランキングタイプを保持して再表示
    const activeBtn = document.querySelector('.ranking-nav .btn-success');
    let currentType = 'all';
    if (activeBtn) {
        const text = activeBtn.textContent;
        if (text === 'チーム') currentType = 'team';
        else if (text === '総合') currentType = 'all';
        else if (text === '三麻') currentType = 'sanma';
        else if (text === '四麻') currentType = 'yonma';
    }
    showRanking(currentType);
}

// ランキング切り替え
function showRanking(type) {
    const title = document.getElementById('ranking-title');
    const nameHeader = document.getElementById('name-header');
    const buttons = document.querySelectorAll('.ranking-nav .btn');

    // ボタンのスタイル更新
    buttons.forEach(btn => btn.classList.replace('btn-success', 'btn-outline-success'));

    // シーズンフィルタリング
    let seasonFiltered = allRecords;
    if (currentSeason === 'current') {
        seasonFiltered = allRecords.filter(r => r.tournament_type === '第二回麻雀大会');
    }
    // currentSeason === 'all' の場合は全データを使用

    let filtered = [];
    let groupKey = 'account_name';

    if (type === 'team') {
        title.textContent = 'チームランキング';
        nameHeader.textContent = 'チーム名';
        // 個人戦以外のデータを抽出し、チーム名があるものを対象にする
        filtered = seasonFiltered.filter(r => r.match_mode !== '個人戦' && r.team_name);
        groupKey = 'team_name';
        buttons[0].classList.replace('btn-outline-success', 'btn-success');
    } else if (type === 'all') {
        title.textContent = '総合個人ランキング';
        nameHeader.textContent = 'アカウント';
        filtered = seasonFiltered; // 全集計
        buttons[1].classList.replace('btn-outline-success', 'btn-success');
    } else if (type === 'yonma') {
        title.textContent = '個人ランキング (四麻)';
        nameHeader.textContent = 'アカウント';
        filtered = seasonFiltered.filter(r => r.mahjong_mode === '四麻');
        buttons[2].classList.replace('btn-outline-success', 'btn-success');
    } else if (type === 'sanma') {
        title.textContent = '個人ランキング (三麻)';
        nameHeader.textContent = 'アカウント';
        filtered = seasonFiltered.filter(r => r.mahjong_mode === '三麻');
        buttons[3].classList.replace('btn-outline-success', 'btn-success');
    }

    renderRanking(filtered, groupKey);
}

function renderRanking(records, groupKey) {
    // ランキング集計
    const summary = {};
    records.forEach(r => {
        // discord_user_idでグループ化（ニックネーム変更に対応）
        // 第一回のデータはdiscord_user_idがnullの可能性があるため、nicknameまたはaccount_nameをフォールバック
        let key = r.discord_user_id;
        if (!key || key === 'null') {
            // 過去データの場合、nicknameまたはaccount_nameを使用
            key = r.nickname || r.account_name || 'Unknown';
        }

        if (!key) return;

        if (!summary[key]) {
            summary[key] = {
                discord_user_id: r.discord_user_id || null,
                nickname: r.nickname || r.account_name || key, // 過去データ用
                score: 0,
                count: 0,
                win: 0,
                deal: 0
            };
        }
        summary[key].score += Number(r.final_score || r.score_total || 0); // 過去データはscore_totalかも
        summary[key].count += 1;
        summary[key].win += (r.win_count || 0);
        summary[key].deal += (r.deal_in_count || 0);
    });

    const sorted = Object.values(summary).sort((a, b) => b.score - a.score);

    const body = document.getElementById('ranking-body');
    body.innerHTML = sorted.map((s, idx) => {
        // プロフィールから最新のaccount_nameとavatar_urlを取得
        let profile = null;
        let displayName = 'Unknown';
        let avatarUrl = 'https://via.placeholder.com/32';

        if (s.discord_user_id) {
            // 新データ: discord_user_idからプロフィールを検索
            profile = allProfiles.find(p => p.discord_user_id === s.discord_user_id);
            displayName = profile?.account_name || s.nickname || s.discord_user_id;
            avatarUrl = profile?.avatar_url || 'https://via.placeholder.com/32';
        } else {
            // 過去データ: nicknameを使用
            displayName = s.nickname || 'Unknown';
            // nicknameからプロフィールを検索（もしあれば）
            profile = allProfiles.find(p => p.account_name === displayName);
            avatarUrl = profile?.avatar_url || 'https://via.placeholder.com/32';
        }

        const linkUrl = s.discord_user_id ? `../player/index.html?id=${s.discord_user_id}` : '#';
        const linkClass = s.discord_user_id ? '' : 'pe-none'; // discord_user_idがない場合はリンク無効

        return `
            <tr>
                <td>${idx + 1}</td>
                <td class="text-start ps-4">
                    <a href="${linkUrl}" 
                       class="text-decoration-none text-dark d-flex align-items-center gap-2 ${linkClass}">
                        <img src="${avatarUrl}" 
                             alt="${displayName}" 
                             class="rounded-circle" 
                             style="width: 32px; height: 32px; object-fit: cover;"
                             onerror="this.src='https://via.placeholder.com/32'">
                        <span class="hover-underline">${displayName}</span>
                    </a>
                </td>
                <td class="fw-bold ${s.score > 0 ? 'text-success' : (s.score < 0 ? 'text-danger' : '')}">
                    ${(s.score > 0 ? '+' : '') + s.score.toFixed(1)}
                </td>
                <td>${s.count}</td>
                <td><small class="text-success">${s.win}和</small> / <small class="text-danger">${s.deal}放</small></td>
            </tr>
        `;
    }).join('');

    if (sorted.length === 0) {
        body.innerHTML = '<tr><td colspan="5" class="text-muted py-4">該当するデータがありません</td></tr>';
    }
}



// フォーム生成や送信、ドロップダウン制御などのロジックは js/mahjong-record.js に移行されました。


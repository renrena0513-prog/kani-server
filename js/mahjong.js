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
        // 記録取得
        const { data, error } = await supabaseClient
            .from('tournament_records')
            .select('*')
            .eq('tournament_type', '第二回麻雀大会');
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
            // tournament_records から過去の名前を拾って仮のリストを作る
            const names = Array.from(new Set(allRecords.map(r => r.discord_account)));
            allProfiles = names.map(n => ({ discord_account: n, avatar_url: '' }));
        }


        switchRanking('all');
    } catch (err) {
        console.error('データ取得エラー:', err);
    }
}

// ランキング切り替え
function switchRanking(type) {
    const title = document.getElementById('ranking-title');
    const nameHeader = document.getElementById('name-header');
    const buttons = document.querySelectorAll('.ranking-nav .btn');

    // ボタンのスタイル更新
    buttons.forEach(btn => btn.classList.replace('btn-success', 'btn-outline-success'));

    let filtered = [];
    let groupKey = 'discord_account';

    if (type === 'team') {
        title.textContent = 'チームランキング';
        nameHeader.textContent = 'チーム名';
        // 個人戦以外のデータを抽出し、チーム名があるものを対象にする
        filtered = allRecords.filter(r => r.match_mode !== '個人戦' && r.team_name);
        groupKey = 'team_name';
        buttons[0].classList.replace('btn-outline-success', 'btn-success');
    } else if (type === 'all') {
        title.textContent = '総合個人ランキング';
        nameHeader.textContent = 'アカウント';
        filtered = allRecords; // 全集計
        buttons[1].classList.replace('btn-outline-success', 'btn-success');
    } else if (type === 'ma4') {
        title.textContent = '個人ランキング (四麻)';
        nameHeader.textContent = 'アカウント';
        filtered = allRecords.filter(r => r.mahjong_mode === '四麻');
        buttons[2].classList.replace('btn-outline-success', 'btn-success');
    } else if (type === 'ma3') {
        title.textContent = '個人ランキング (三麻)';
        nameHeader.textContent = 'アカウント';
        filtered = allRecords.filter(r => r.mahjong_mode === '三麻');
        buttons[3].classList.replace('btn-outline-success', 'btn-success');
    }

    renderRanking(filtered, groupKey);
}

function renderRanking(records, groupKey) {
    const summary = {};

    records.forEach(r => {
        const key = r[groupKey];
        if (!key) return;
        if (!summary[key]) {
            summary[key] = { name: key, score: 0, count: 0, win: 0, deal: 0 };
        }
        summary[key].score += Number(r.score || 0);
        summary[key].count += 1;
        summary[key].win += (r.win_count || 0);
        summary[key].deal += (r.deal_in_count || 0);
    });

    const sorted = Object.values(summary).sort((a, b) => b.score - a.score);

    const body = document.getElementById('ranking-body');
    body.innerHTML = sorted.map((s, idx) => {
        // ニックネーム解決
        let displayName = s.name;
        if (groupKey === 'discord_account') {
            const profile = allProfiles.find(p => p.discord_account === s.name);
            if (profile && profile.nickname) {
                displayName = profile.nickname;
            }
        }


        return `
            <tr>
                <td>${idx + 1}</td>
                <td class="text-start ps-4">${displayName}</td>
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


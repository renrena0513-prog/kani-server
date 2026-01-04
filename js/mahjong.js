// 麻雀ページ用ロジック
let allRecords = [];
let allAccounts = [];

document.addEventListener('DOMContentLoaded', () => {
    fetchData();
    setupPlayerInputs(4); // デフォルト4人
});

async function fetchData() {
    try {
        const { data, error } = await supabaseClient
            .from('tournament_records')
            .select('*')
            .eq('tournament_type', '第二回麻雀大会');

        if (error) throw error;
        allRecords = data;

        // 全アカウントリストの抽出（プルダウン用）
        const { data: accounts, error: accError } = await supabaseClient
            .from('tournament_records')
            .select('discord_account');
        if (!accError) {
            allAccounts = Array.from(new Set(accounts.map(a => a.discord_account))).sort();
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
    body.innerHTML = sorted.map((s, idx) => `
        <tr>
            <td>${idx + 1}</td>
            <td class="text-start ps-4">${s.name}</td>
            <td class="fw-bold ${s.score > 0 ? 'text-success' : (s.score < 0 ? 'text-danger' : '')}">
                ${(s.score > 0 ? '+' : '') + s.score.toFixed(1)}
            </td>
            <td>${s.count}</td>
            <td><small class="text-success">${s.win}和</small> / <small class="text-danger">${s.deal}放</small></td>
        </tr>
    `).join('');

    if (sorted.length === 0) {
        body.innerHTML = '<tr><td colspan="5" class="text-muted py-4">該当するデータがありません</td></tr>';
    }
}

// フォーム生成
function setupPlayerInputs(count) {
    const container = document.getElementById('players-container');
    container.innerHTML = '';

    // アカウントの選択肢
    const optionsHtml = allAccounts.map(acc => `<option value="${acc}">${acc}</option>`).join('');

    for (let i = 1; i <= count; i++) {
        container.innerHTML += `
            <div class="player-entry">
                <div class="row g-2">
                    <div class="col-md-2">
                        <label class="small text-muted">チーム名</label>
                        <input type="text" class="form-control form-control-sm player-team" placeholder="チーム名">
                    </div>
                    <div class="col-md-3">
                        <label class="small text-muted">アカウント名</label>
                        <input list="accounts-list" class="form-control form-control-sm player-account" placeholder="選択または入力">
                        <datalist id="accounts-list">${optionsHtml}</datalist>
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
                        <label class="small text-muted">放銃数</label>
                        <input type="number" class="form-control form-control-sm player-deal" value="0">
                    </div>
                </div>
            </div>
        `;
    }
}

// 送信処理
async function submitScores() {
    const mode = document.getElementById('form-mode').value;
    const match = document.getElementById('form-match').value;
    const hands = Number(document.getElementById('form-hands').value);

    const entries = document.querySelectorAll('.player-entry');
    const dataToInsert = [];
    const now = new Date().toISOString();

    for (const entry of entries) {
        const account = entry.querySelector('.player-account').value;
        const score = entry.querySelector('.player-score').value;

        if (!account) continue; // アカウント名がない行はスキップ

        dataToInsert.push({
            event_datetime: now,
            discord_account: account,
            tournament_type: '第二回麻雀大会',
            mahjong_mode: mode,
            match_mode: match,
            team_name: entry.querySelector('.player-team').value || null,
            score: score !== '' ? Number(score) : 0,
            hand_count: hands,
            win_count: Number(entry.querySelector('.player-win').value || 0),
            deal_in_count: Number(entry.querySelector('.player-deal').value || 0)
        });
    }

    if (dataToInsert.length === 0) {
        alert('データを入力してください');
        return;
    }

    document.getElementById('loading-overlay').style.display = 'flex';

    try {
        const { error } = await supabaseClient
            .from('tournament_records')
            .insert(dataToInsert);

        if (error) throw error;

        alert('スコアを送信しました！');
        document.getElementById('score-form').reset();
        setupPlayerInputs(entries.length);
        fetchData(); // ランキング更新
    } catch (err) {
        alert('送信エラー: ' + err.message);
    } finally {
        document.getElementById('loading-overlay').style.display = 'none';
    }
}

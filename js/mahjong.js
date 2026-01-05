// 麻雀ページ用ロジック
let allRecords = [];
let allProfiles = []; // プロフィール情報（アイコン付き）
let currentSeason = 'current'; // 'current' or 'all'

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
        // 第二回麻雀大会のデータを取得（match_resultsテーブル）
        const { data: currentData, error: currentError } = await supabaseClient
            .from('match_results')
            .select('*');
        if (currentError) throw currentError;

        // 第一回麻雀大会のデータを取得（tournament_player_stats_snapshotテーブル）
        const { data: legacyData, error: legacyError } = await supabaseClient
            .from('tournament_player_stats_snapshot')
            .select('*');

        if (legacyError) {
            console.warn('過去データの取得に失敗:', legacyError);
        }

        // 両方のデータを結合
        allRecords = [...(currentData || []), ...(legacyData || [])];

        console.log('📊 取得したレコード数:', allRecords.length);
        console.log('第二回（match_results）:', currentData?.length || 0);
        console.log('第一回（tournament_player_stats_snapshot）:', legacyData?.length || 0);

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

    // タイトルの更新
    const seasonTitle = document.getElementById('season-title');
    const pageMainTitle = document.getElementById('page-main-title');
    if (season === 'current') {
        seasonTitle.textContent = '🀄 第二回麻雀大会';
        pageMainTitle.textContent = '🀄 麻雀ランキング';
    } else {
        seasonTitle.textContent = '🀄 全シーズン記録';
        pageMainTitle.textContent = '🀄 歴代ランキング';
    }

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
        else if (text === '和了率') currentType = 'win';
        else if (text === '放銃率') currentType = 'deal';
        else if (text === 'トップ率') currentType = 'top';
        else if (text === 'ラス回避') currentType = 'avoid';
        else if (text === '平均順位') currentType = 'avg_rank';
        else if (text === '最大スコア') currentType = 'max_score';
        else if (text === '平均スコア') currentType = 'avg_score';
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
    } else if (type === 'sanma') {
        title.textContent = '個人ランキング (三麻)';
        nameHeader.textContent = 'アカウント';
        filtered = seasonFiltered.filter(r => r.mahjong_mode === '三麻');
        buttons[2].classList.replace('btn-outline-success', 'btn-success');
    } else if (type === 'yonma') {
        title.textContent = '個人ランキング (四麻)';
        nameHeader.textContent = 'アカウント';
        filtered = seasonFiltered.filter(r => r.mahjong_mode === '四麻');
        buttons[3].classList.replace('btn-outline-success', 'btn-success');
    } else if (type === 'win') {
        title.textContent = '和了率ランキング (平均和了)';
        nameHeader.textContent = 'アカウント';
        filtered = seasonFiltered;
        buttons[4].classList.replace('btn-outline-success', 'btn-success');
    } else if (type === 'deal') {
        title.textContent = '放銃率ランキング (平均放銃)';
        nameHeader.textContent = 'アカウント';
        filtered = seasonFiltered;
        buttons[5].classList.replace('btn-outline-success', 'btn-success');
    } else if (type === 'top') {
        title.textContent = 'トップ率ランキング (1位率)';
        nameHeader.textContent = 'アカウント';
        filtered = seasonFiltered;
        buttons[6].classList.replace('btn-outline-success', 'btn-success');
    } else if (type === 'avoid') {
        title.textContent = 'ラス回避率ランキング';
        nameHeader.textContent = 'アカウント';
        filtered = seasonFiltered;
        buttons[7].classList.replace('btn-outline-success', 'btn-success');
    } else if (type === 'avg_rank') {
        title.textContent = '平均順位ランキング';
        nameHeader.textContent = 'アカウント';
        filtered = seasonFiltered;
        buttons[8].classList.replace('btn-outline-success', 'btn-success');
    } else if (type === 'max_score') {
        title.textContent = '最大スコアランキング (最高得点)';
        nameHeader.textContent = 'アカウント';
        filtered = seasonFiltered;
        buttons[9].classList.replace('btn-outline-success', 'btn-success');
    } else if (type === 'avg_score') {
        title.textContent = '平均スコアランキング';
        nameHeader.textContent = 'アカウント';
        filtered = seasonFiltered;
        buttons[10].classList.replace('btn-outline-success', 'btn-success');
    }

    console.log(`🎯 ランキングタイプ: ${type}, シーズン: ${currentSeason}`);
    console.log(`フィルター後のレコード数: ${filtered.length}`);
    if (filtered.length > 0) {
        console.log('サンプルレコード:', filtered[0]);
    }

    renderRanking(filtered, groupKey, type);
}

function renderRanking(records, groupKey, type = 'all') {
    // ランキング集計
    const summary = {};
    records.forEach(r => {
        // グループ化のキーを決定
        let key;
        if (groupKey === 'team_name') {
            key = r.team_name;
        } else {
            key = r.discord_user_id;
            if (!key || key === 'null') {
                // 過去データの場合、nicknameまたはaccount_nameを使用
                key = r.nickname || r.account_name || 'Unknown';
            }
        }

        if (!key) return;

        if (!summary[key]) {
            summary[key] = {
                key: key,
                discord_user_id: groupKey === 'team_name' ? null : (r.discord_user_id || null),
                nickname: r.nickname || r.account_name || key,
                display: key,
                score: 0,
                count: 0,
                win: 0,
                deal: 0,
                r1: 0, r2: 0, r3: 0, r4: 0,
                max_score: -Infinity,
                isTeam: (groupKey === 'team_name')
            };
        }

        // 過去データ（第一回）は既に集計済み、新データは試合ごとに合算
        if (r.tournament_type === '第一回麻雀大会') {
            summary[key].score += Number(r.score_total || 0);
            summary[key].count += Number(r.matches_played || 0);
            summary[key].r1 += Number(r.rank1_count || 0);
            summary[key].r2 += Number(r.rank2_count || 0);
            summary[key].r3 += Number(r.rank3_count || 0);
            summary[key].r4 += Number(r.rank4_count || 0);
            summary[key].max_score = Math.max(summary[key].max_score, Number(r.score_max || 0));
        } else {
            summary[key].score += Number(r.final_score || 0);
            summary[key].count += 1;
            // 新データ: rankカラムからカウント
            const rk = Number(r.rank);
            if (rk === 1) summary[key].r1++;
            else if (rk === 2) summary[key].r2++;
            else if (rk === 3) summary[key].r3++;
            else if (rk === 4) summary[key].r4++;
            summary[key].max_score = Math.max(summary[key].max_score, Number(r.final_score || 0));
        }

        summary[key].win += (r.win_count || 0);
        summary[key].deal += (r.deal_in_count || 0);
    });

    // 平均値・各種率の計算
    Object.values(summary).forEach(s => {
        s.avg_win = s.count > 0 ? (s.win / s.count) : 0;
        s.avg_deal = s.count > 0 ? (s.deal / s.count) : 0;

        s.top_rate = s.count > 0 ? (s.r1 / s.count) * 100 : 0;

        // ラス回避率
        // 四麻なら4位率、三麻なら3位率を算出
        // ただしデータが混ざっている場合は「全試合中の最大順位」をラスとみなすか
        // ここでは三麻/四麻がフィルタリングされている可能性も考慮
        // シンプルに「4位回数 / 試合数」または「3位回数 / 試合数」で計算
        // 混在している場合は4位を優先
        let lastCount = s.r4;
        if (s.r4 === 0 && s.r3 > 0) lastCount = s.r3; // 三麻のみの場合の考慮
        s.avoid_rate = s.count > 0 ? (1 - (lastCount / s.count)) * 100 : 0;

        s.avg_rank = s.count > 0 ? (1 * s.r1 + 2 * s.r2 + 3 * s.r3 + 4 * s.r4) / s.count : 0;
        s.avg_score = s.count > 0 ? s.score / s.count : 0;
        if (s.max_score === -Infinity) s.max_score = 0;
    });

    // ソート
    const sorted = Object.values(summary).sort((a, b) => {
        if (type === 'win') return b.avg_win - a.avg_win; // 和了率は高い順
        if (type === 'deal') return a.avg_deal - b.avg_deal; // 放銃率は低い順
        if (type === 'top') return b.top_rate - a.top_rate; // トップ率は高い順
        if (type === 'avoid') return b.avoid_rate - a.avoid_rate; // ラス回避は高い順
        if (type === 'avg_rank') return (a.avg_rank || 4) - (b.avg_rank || 4); // 平均順位は低い（1に近い）順
        if (type === 'max_score') return b.max_score - a.max_score; // 最大スコアは高い順
        if (type === 'avg_score') return b.avg_score - a.avg_score; // 平均スコアは高い順
        return b.score - a.score; // その他はスコア順
    });

    const body = document.getElementById('ranking-body');
    body.innerHTML = sorted.map((s, idx) => {
        let displayName = s.display;
        let avatarUrl = null;
        let canLink = false;

        if (!s.isTeam) {
            // 個人ランキングの場合のみプロフィール/アイコン処理
            let profile = null;
            if (s.discord_user_id) {
                profile = allProfiles.find(p => p.discord_user_id === s.discord_user_id);
                displayName = profile?.account_name || s.nickname || s.discord_user_id;
                avatarUrl = profile?.avatar_url;
                canLink = true;
            } else {
                displayName = s.nickname || 'Unknown';
                profile = allProfiles.find(p => p.account_name === displayName);
                avatarUrl = profile?.avatar_url;
            }
        }

        const linkUrl = canLink ? `../player/index.html?id=${s.discord_user_id}` : '#';
        const linkClass = canLink ? '' : 'pe-none text-dark';

        const avatarHtml = avatarUrl ?
            `<img src="${avatarUrl}" 
                  alt="${displayName}" 
                  class="rounded-circle" 
                  style="width: 32px; height: 32px; object-fit: cover;"
                  onerror="this.style.display='none'">` : '';

        // 特殊表示用のバッジ
        let statsBadge = '';
        if (type === 'win') {
            statsBadge = `<div class="small text-success fw-bold">和了 ${s.avg_win.toFixed(2)} / 試合</div>`;
        } else if (type === 'deal') {
            statsBadge = `<div class="small text-danger fw-bold">放銃 ${s.avg_deal.toFixed(2)} / 試合</div>`;
        } else if (type === 'top') {
            statsBadge = `<div class="small text-primary fw-bold">トップ率 ${s.top_rate.toFixed(1)}%</div>`;
        } else if (type === 'avoid') {
            statsBadge = `<div class="small text-info fw-bold">ラス回避 ${s.avoid_rate.toFixed(1)}%</div>`;
        } else if (type === 'avg_rank') {
            statsBadge = `<div class="small text-secondary fw-bold">平均順位 ${s.avg_rank.toFixed(2)}</div>`;
        } else if (type === 'max_score') {
            statsBadge = `<div class="small text-warning fw-bold">最大スコア ${(s.max_score > 0 ? '+' : '') + s.max_score.toFixed(1)}</div>`;
        } else if (type === 'avg_score') {
            statsBadge = `<div class="small text-muted fw-bold">平均スコア ${(s.avg_score > 0 ? '+' : '') + s.avg_score.toFixed(1)}</div>`;
        }

        return `
            <tr>
                <td>${idx + 1}</td>
                <td class="text-start ps-4">
                    <a href="${linkUrl}" 
                       class="text-decoration-none d-flex align-items-center gap-2 ${linkClass}">
                        ${avatarHtml}
                        <div>
                            <span class="${canLink ? 'hover-underline' : ''}">${displayName}</span>
                            ${statsBadge}
                        </div>
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


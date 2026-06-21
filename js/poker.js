// ポーカーランキングページ
let allPokerRecords = [];
let allProfiles = [];
let teamIconMap = {}; // team_name -> icon_url
let currentTournament = 'all';
let currentMainFilter = 'individual';
let currentSubFilter = 'all';

document.addEventListener('DOMContentLoaded', () => {
    fetchData();
});

async function fetchData() {
    try {
        let allData = [];
        let page = 0;
        const pageSize = 1000;
        while (true) {
            const { data, error } = await supabaseClient
                .from('poker_results')
                .select('*')
                .range(page * pageSize, (page + 1) * pageSize - 1);
            if (error) throw error;
            if (!data || data.length === 0) break;
            allData = allData.concat(data);
            if (data.length < pageSize) break;
            page++;
        }
        allPokerRecords = allData;

        const { data: profiles } = await supabaseClient
            .from('profiles')
            .select('*, is_hidden, badges!equipped_badge_id(image_url, name), badges_right:badges!equipped_badge_id_right(image_url, name)');
        allProfiles = (profiles || []).filter(p => !p.is_hidden);

        const { data: teamsData } = await supabaseClient
            .from('poker_teams').select('team_name, icon_url');
        teamIconMap = {};
        (teamsData || []).forEach(t => { if (t.icon_url) teamIconMap[t.team_name] = t.icon_url; });

        renderTournamentButtons();
        renderMainFilters();

        const params = new URLSearchParams(window.location.search);
        if (params.get('tournament')) currentTournament = params.get('tournament');
        if (params.get('main')) currentMainFilter = params.get('main');
        if (params.get('sub')) currentSubFilter = params.get('sub');

        renderTournamentButtons();
        renderMainFilters();
        showRanking();

        const hash = window.location.hash;
        if (hash.startsWith('#rank-player-')) {
            setTimeout(() => {
                const target = document.querySelector(hash);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    target.classList.add('highlight-row');
                    setTimeout(() => target.classList.remove('highlight-row'), 3000);
                }
            }, 500);
        }
    } catch (err) {
        console.error('データ取得エラー:', err);
    }
}

function renderTournamentButtons() {
    const container = document.getElementById('tournament-filter-container');
    if (!container) return;

    const types = [...new Set(allPokerRecords.map(r => r.tournament_type))].filter(Boolean);
    const tournaments = types.length ? types : ['第一回ポーカー大会'];

    let html = '<div class="btn-group" role="group">';
    tournaments.forEach(t => {
        const isActive = currentTournament === t;
        html += `<button type="button" class="btn ${isActive ? 'btn-primary' : 'btn-outline-primary'}" onclick="setTournament('${t}')">${t.replace('ポーカー大会', '')}</button>`;
    });
    html += `<button type="button" class="btn ${currentTournament === 'all' ? 'btn-primary' : 'btn-outline-primary'}" onclick="setTournament('all')">全シーズン</button>`;
    html += '</div>';
    container.innerHTML = html;
}

function renderMainFilters() {
    const container = document.getElementById('main-filter-container');
    if (!container) return;
    const filters = [
        { id: 'individual', label: '個人戦' },
        { id: 'team', label: 'チーム戦' }
    ];
    container.innerHTML = filters.map(f => {
        const isActive = currentMainFilter === f.id;
        return `<button class="btn ${isActive ? 'btn-primary' : 'btn-outline-primary'}" onclick="updateMainFilter('${f.id}')">${f.label}</button>`;
    }).join('');
}

function setTournament(type) {
    currentTournament = type;
    const seasonTitle = document.getElementById('season-title');
    const pageTitle = document.getElementById('page-main-title');
    if (type === 'all') {
        if (seasonTitle) seasonTitle.textContent = '🃏 全シーズン記録';
        if (pageTitle) pageTitle.textContent = '🃏 歴代ランキング';
    } else {
        if (seasonTitle) seasonTitle.textContent = `🃏 ${type}`;
        if (pageTitle) pageTitle.textContent = '🃏 ポーカーランキング';
    }
    renderTournamentButtons();
    renderMainFilters();
    showRanking();
}

function updateMainFilter(type) {
    currentMainFilter = type;
    renderMainFilters();
    showRanking();
}

function updateSubFilter(type) {
    currentSubFilter = type;
    showRanking();
}

const SUB_FILTER_LIST = ['all', 'avg_score', 'max_score', 'match_count', 'win_rate', 'avoid_rate', 'avg_rank'];
const SUB_FILTER_LABELS = {
    all: '合計スコア',
    avg_score: '平均スコア',
    max_score: '最大スコア',
    match_count: '試合数',
    win_rate: '1位率',
    avoid_rate: 'ラス回避',
    avg_rank: '平均順位'
};

function showRanking() {
    const type = currentSubFilter;
    const rankingTitle = document.getElementById('ranking-title');
    const nameHeader = document.getElementById('name-header');
    const statHeader = document.getElementById('stat-header');

    const subButtons = document.querySelectorAll('#sub-filter-nav .sub-filter-btn');
    subButtons.forEach((btn, i) => {
        btn.classList.toggle('active', SUB_FILTER_LIST[i] === type);
    });

    let seasonFiltered = allPokerRecords;
    if (currentTournament !== 'all') {
        seasonFiltered = allPokerRecords.filter(r => r.tournament_type === currentTournament);
    }

    let filtered = seasonFiltered;
    let groupKey = 'discord_user_id';

    if (currentMainFilter === 'team') {
        if (rankingTitle) rankingTitle.textContent = 'チーム戦ランキング';
        if (nameHeader) nameHeader.textContent = 'チーム名';
        filtered = seasonFiltered.filter(r => r.match_mode === 'チーム戦' && r.team_name);
        groupKey = 'team_name';
    } else {
        if (rankingTitle) rankingTitle.textContent = '個人戦ランキング';
        if (nameHeader) nameHeader.textContent = '名前';
        filtered = seasonFiltered.filter(r => r.match_mode !== 'チーム戦');
    }

    if (statHeader) statHeader.textContent = SUB_FILTER_LABELS[type] || '合計スコア';

    const headerRow = document.querySelector('.ranking-table thead tr');
    if (headerRow) {
        headerRow.innerHTML = `
            <th style="width: 80px;">順位</th>
            <th id="name-header">${currentMainFilter === 'team' ? 'チーム名' : '名前'}</th>
            <th id="stat-header" style="width: 180px;">${SUB_FILTER_LABELS[type]}</th>
            ${type === 'max_score' ? '' : '<th style="width: 120px;">24時間比</th>'}
            <th style="width: 120px;">${type === 'match_count' ? '試合数' : '試合数'}</th>
        `;
    }

    const needMinGames = ['avg_score', 'win_rate', 'avoid_rate', 'avg_rank', 'max_score'].includes(type);
    const rankOutSection = document.getElementById('rank-out-section');
    if (rankOutSection) rankOutSection.style.display = needMinGames ? 'block' : 'none';

    renderRanking(filtered, groupKey, type);
}

function renderRanking(records, groupKey, type) {
    const summary = {};
    const summaryOld = {};
    const nowTs = Date.now();

    const isRecent = (r) => {
        if (!r.event_datetime) return false;
        const ts = new Date(r.event_datetime).getTime();
        return !isNaN(ts) && (nowTs - ts) < 86400000;
    };

    const ensureSummary = (target, key, r) => {
        if (!target[key]) {
            target[key] = {
                key,
                discord_user_id: groupKey === 'team_name' ? null : (r.discord_user_id || null),
                nickname: groupKey === 'team_name' ? key : (r.account_name || key),
                score: 0, count: 0, max_score: -Infinity,
                r1: 0, rLast: 0,
                rankSum: 0,
                isTeam: groupKey === 'team_name'
            };
        }
        return target[key];
    };

    const addRecord = (target, r) => {
        let key = groupKey === 'team_name' ? r.team_name : r.discord_user_id;
        if (!key || key === 'null') {
            const matchedProfile = allProfiles.find(p => p.account_name === r.account_name);
            key = matchedProfile?.discord_user_id || r.account_name || 'Unknown';
        }
        if (!key) return;

        const s = ensureSummary(target, key, r);
        s.score += Number(r.final_score || 0);
        s.count += 1;
        s.max_score = Math.max(s.max_score, Number(r.final_score || 0));
        const rk = Number(r.rank);
        const pc = Number(r.player_count || 4);
        if (rk === 1) s.r1++;
        if (rk === pc) s.rLast++;
        s.rankSum += rk;
    };

    const finalize = (target) => {
        Object.values(target).forEach(s => {
            s.avg_score = s.count > 0 ? s.score / s.count : 0;
            s.win_rate = s.count > 0 ? (s.r1 / s.count) * 100 : 0;
            s.avoid_rate = s.count > 0 ? (1 - s.rLast / s.count) * 100 : 0;
            s.avg_rank = s.count > 0 ? s.rankSum / s.count : 0;
            if (s.max_score === -Infinity) s.max_score = 0;
        });
    };

    records.forEach(r => {
        addRecord(summary, r);
        if (!isRecent(r)) addRecord(summaryOld, r);
    });
    finalize(summary);
    finalize(summaryOld);

    const getVal = (s, kind) => {
        if (!s) return 0;
        if (kind === 'win_rate') return s.win_rate;
        if (kind === 'avoid_rate') return s.avoid_rate;
        if (kind === 'avg_rank') return s.avg_rank;
        if (kind === 'max_score') return s.max_score;
        if (kind === 'avg_score') return s.avg_score;
        if (kind === 'match_count') return s.count;
        return s.score;
    };

    const formatDelta = (val, kind) => {
        if (kind === 'avg_rank') {
            const r = Number(val.toFixed(2));
            if (r === 0) return { text: '―', cls: 'delta-zero', color: '#6c757d' };
            return { text: `${val > 0 ? '+' : ''}${r.toFixed(2)}`, cls: val > 0 ? 'delta-neg' : 'delta-pos', color: val > 0 ? '#dc3545' : '#0d6efd' };
        }
        if (kind === 'win_rate' || kind === 'avoid_rate') {
            const r = Number(val.toFixed(1));
            if (r === 0) return { text: '―', cls: 'delta-zero', color: '#6c757d' };
            return { text: `${val > 0 ? '+' : ''}${r.toFixed(1)}%`, cls: val > 0 ? 'delta-pos' : 'delta-neg', color: val > 0 ? '#0d6efd' : '#dc3545' };
        }
        if (kind === 'avg_score' || kind === 'max_score') {
            const r = Number(val.toFixed(1));
            if (r === 0) return { text: '―', cls: 'delta-zero', color: '#6c757d' };
            return { text: `${val > 0 ? '+' : ''}${r.toFixed(1)}`, cls: val > 0 ? 'delta-pos' : 'delta-neg', color: val > 0 ? '#0d6efd' : '#dc3545' };
        }
        const rounded = Math.round(val);
        if (rounded === 0) return { text: '―', cls: 'delta-zero', color: '#6c757d' };
        return { text: `${val > 0 ? '+' : ''}${rounded}`, cls: val > 0 ? 'delta-pos' : 'delta-neg', color: val > 0 ? '#0d6efd' : '#dc3545' };
    };

    const needMinGames = ['avg_score', 'win_rate', 'avoid_rate', 'avg_rank', 'max_score'].includes(type);
    const minGames = currentTournament === 'all' ? 20 : 5;

    const sorted = Object.values(summary).sort((a, b) => {
        if (type === 'win_rate') return b.win_rate - a.win_rate;
        if (type === 'avoid_rate') return b.avoid_rate - a.avoid_rate;
        if (type === 'avg_rank') return (a.avg_rank || 9) - (b.avg_rank || 9);
        if (type === 'max_score') return b.max_score - a.max_score;
        if (type === 'avg_score') return b.avg_score - a.avg_score;
        if (type === 'match_count') return b.count - a.count;
        return b.score - a.score;
    });

    const rankedPlayers = needMinGames ? sorted.filter(s => s.count >= minGames) : sorted;
    const rankOutPlayers = needMinGames ? sorted.filter(s => s.count < minGames) : [];

    const rankOutLabel = document.querySelector('#rank-out-section .ms-2');
    if (rankOutLabel) rankOutLabel.textContent = `記録対象外 (${minGames}試合未満)`;

    const top3 = rankedPlayers.slice(0, 3);
    const others = rankedPlayers.slice(3);

    const podiumContainer = document.getElementById('ranking-podium');
    const mainBody = document.getElementById('ranking-body');
    const outBody = document.getElementById('rank-out-body');

    if (podiumContainer) podiumContainer.innerHTML = renderPodium(top3, type, summary, summaryOld, formatDelta, getVal);
    if (mainBody) mainBody.innerHTML = renderRows(others, type, summary, summaryOld, formatDelta, getVal, 3);
    if (outBody) outBody.innerHTML = renderRows(rankOutPlayers, type, summary, summaryOld, formatDelta, getVal, -1);

    if (rankedPlayers.length === 0 && podiumContainer) {
        podiumContainer.innerHTML = '';
        if (mainBody) mainBody.innerHTML = '<tr><td colspan="4" class="text-muted py-4">該当するデータがありません</td></tr>';
    }
}

function getProfileForSummary(s) {
    if (s.isTeam) return null;
    let profile = null;
    if (s.discord_user_id) profile = allProfiles.find(p => p.discord_user_id === s.discord_user_id);
    if (!profile) profile = allProfiles.find(p => p.account_name === s.nickname);
    return profile;
}

function formatStatValue(s, type) {
    if (type === 'win_rate') return `${s.win_rate.toFixed(1)}%`;
    if (type === 'avoid_rate') return `${s.avoid_rate.toFixed(1)}%`;
    if (type === 'avg_rank') return `${s.avg_rank.toFixed(2)}`;
    if (type === 'max_score') return `${s.max_score > 0 ? '+' : ''}${s.max_score.toFixed(1)}`;
    if (type === 'avg_score') return `${s.avg_score > 0 ? '+' : ''}${s.avg_score.toFixed(1)}`;
    if (type === 'match_count') return `${s.count}`;
    return `${s.score > 0 ? '+' : ''}${s.score.toFixed(1)}`;
}

function renderPodium(top3, type, summary, summaryOld, formatDelta, getVal) {
    return top3.map((s, i) => {
        const rank = i + 1;
        const rankClass = rank === 1 ? 'podium-first' : (rank === 2 ? 'podium-second' : 'podium-third');
        const crown = rank === 1 ? '<div class="podium-crown">👑</div>' : '';
        const profile = getProfileForSummary(s);
        const displayName = profile?.account_name || s.nickname || 'Unknown';
        const avatarUrl = s.isTeam ? (teamIconMap[s.key] || '') : (profile?.avatar_url || '');
        const canLink = !s.isTeam && (profile?.discord_user_id || s.discord_user_id);
        const linkDiscordId = s.discord_user_id || profile?.discord_user_id;
        const linkUrl = canLink ? `../mypage/index.html?user=${linkDiscordId}` : '#';
        const linkClass = canLink ? '' : 'pe-none text-dark';
        const statValue = formatStatValue(s, type);
        const statLabel = SUB_FILTER_LABELS[type] || '合計スコア';
        const deltaValue = getVal(s, type) - getVal(summaryOld[s.key], type);
        const delta = formatDelta(deltaValue, type);
        const anchorId = s.isTeam ? `rank-team-${encodeURIComponent(s.key)}` : `rank-player-${s.discord_user_id || 'unknown'}`;
        const teamIconStyle = 'width:64px;height:64px;object-fit:contain;border-radius:8px;';

        return `
            <div class="col-12" id="${anchorId}">
                <div class="podium-card ${rankClass}">
                    <div class="podium-card-left">
                        <div class="podium-rank-box">
                            ${crown}
                            <div class="podium-rank">${rank}</div>
                        </div>
                        <a href="${linkUrl}" class="text-decoration-none podium-player-info ${linkClass}">
                            <div class="podium-avatar-wrapper">
                                <div style="width:64px;height:64px;" class="flex-shrink-0 d-flex align-items-center justify-content-center">
                                    ${s.isTeam
                                        ? (avatarUrl ? `<img src="${avatarUrl}" alt="${displayName}" style="${teamIconStyle}">` : `<span style="font-size:2rem;">🏅</span>`)
                                        : (avatarUrl ? `<img src="${avatarUrl}" alt="${displayName}" class="podium-avatar">` : `<img src="https://cdn.discordapp.com/embed/avatars/0.png" class="podium-avatar">`)}
                                </div>
                            </div>
                            <div class="podium-identity-row">
                                <div class="podium-name ${canLink ? 'hover-underline' : ''}">${displayName}</div>
                            </div>
                        </a>
                    </div>
                    <div class="podium-card-right">
                        <div class="podium-stat-grid">
                            <div class="podium-stat-item">
                                <div class="podium-stat-label">${statLabel}</div>
                                <div class="podium-stat-value">${statValue}</div>
                            </div>
                            ${type === 'max_score' ? '' : `
                            <div class="podium-stat-item">
                                <div class="podium-stat-label">24時間比</div>
                                <div class="podium-stat-value ${delta.cls}" style="color:${delta.color};">${delta.text}</div>
                            </div>`}
                            <div class="podium-stat-item">
                                <div class="podium-stat-label">試合数</div>
                                <div class="podium-stat-value podium-match-count">${s.count}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>`;
    }).join('');
}

function renderRows(list, type, summary, summaryOld, formatDelta, getVal, offset) {
    return list.map((s, idx) => {
        const rankValue = offset === -1 ? '-' : (idx + 1 + offset);
        const profile = getProfileForSummary(s);
        const displayName = profile?.account_name || s.nickname || 'Unknown';
        const avatarUrl = s.isTeam ? (teamIconMap[s.key] || '') : (profile?.avatar_url || '');
        const canLink = !s.isTeam && (profile?.discord_user_id || s.discord_user_id);
        const linkDiscordId = s.discord_user_id || profile?.discord_user_id;
        const linkUrl = canLink ? `../mypage/index.html?user=${linkDiscordId}` : '#';
        const linkClass = canLink ? '' : 'pe-none text-dark';
        const statValue = formatStatValue(s, type);
        const deltaValue = getVal(s, type) - getVal(summaryOld[s.key], type);
        const delta = formatDelta(deltaValue, type);
        const anchorId = s.isTeam ? `rank-team-${encodeURIComponent(s.key)}` : `rank-player-${s.discord_user_id || 'unknown'}`;

        return `
            <tr id="${anchorId}">
                <td>${rankValue}</td>
                <td class="ps-4 text-start">
                    <a href="${linkUrl}" class="text-decoration-none d-flex align-items-center justify-content-start gap-2 ${linkClass}">
                        <div style="width:32px;height:32px;" class="flex-shrink-0 d-flex align-items-center justify-content-center">
                            ${s.isTeam
                                ? (avatarUrl ? `<img src="${avatarUrl}" alt="${displayName}" style="width:32px;height:32px;object-fit:contain;border-radius:6px;">` : `<span style="font-size:1.4rem;">🏅</span>`)
                                : (avatarUrl ? `<img src="${avatarUrl}" alt="${displayName}" class="rounded-circle" style="width:32px;height:32px;object-fit:cover;">` : '')}
                        </div>
                        <span class="${canLink ? 'hover-underline' : ''} fw-bold">${displayName}</span>
                    </a>
                </td>
                <td class="fw-bold text-dark" style="font-size:1.1rem;">${statValue}</td>
                ${type === 'max_score' ? '' : `<td><span class="${delta.cls}" style="color:${delta.color};">${delta.text}</span></td>`}
                <td>${s.count}</td>
            </tr>`;
    }).join('');
}

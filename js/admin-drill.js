// ほりほりドリル 管理者機能

// ============================================================
// 設定 (start_x)
// ============================================================

async function loadDrillSettings() {
  try {
    const { data } = await supabaseClient
      .from('drill_page_settings')
      .select('setting_value')
      .eq('setting_key', 'start_x')
      .maybeSingle();
    if (data?.setting_value != null) {
      const el = document.getElementById('setting-start-x');
      if (el) el.value = data.setting_value;
    }
  } catch {}
}

async function saveStartX() {
  const el = document.getElementById('setting-start-x');
  const msg = document.getElementById('setting-save-msg');
  if (!el) return;
  const v = parseInt(el.value, 10);
  if (isNaN(v) || v < 0 || v > 255) { if (msg) msg.textContent = '❌ 0〜255 の値を入力してください'; return; }
  try {
    const { error } = await supabaseClient
      .from('drill_page_settings')
      .upsert({ setting_key: 'start_x', setting_value: String(v) });
    if (error) throw error;
    if (msg) { msg.textContent = '✅ 保存しました'; setTimeout(() => msg.textContent = '', 3000); }
  } catch (e) {
    if (msg) msg.textContent = `❌ ${e.message}`;
  }
}

// ============================================================
// ユーティリティ
// ============================================================

function gameDateAdmin() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 3600000);
  if (jst.getUTCHours() < 5) jst.setUTCDate(jst.getUTCDate() - 1);
  return jst.toISOString().slice(0, 10);
}

async function forceMapRegen() {
  if (!confirm('現在のマップデータ（掘削・位置・ドロップ・戦闘）をすべて削除し、新しいシードで再生成します。\n全プレイヤーに影響します。続行しますか？')) return;
  const msg = document.getElementById('map-regen-msg');
  if (msg) msg.textContent = '⏳ 処理中...';
  try {
    const date = gameDateAdmin();
    const seed = Math.floor(Math.random() * 2147483647);
    const steps = [
      supabaseClient.from('drill_maps').upsert({ map_date: date, seed }),
      supabaseClient.from('drill_dug_cells').delete().eq('map_date', date),
      supabaseClient.from('drill_dig_locks').delete().eq('map_date', date),
      supabaseClient.from('drill_player_positions').delete().eq('map_date', date),
      supabaseClient.from('drill_dropped_items').delete().eq('map_date', date),
      supabaseClient.from('drill_combat_sessions').delete().eq('map_date', date),
    ];
    const results = await Promise.all(steps);
    const err = results.find(r => r.error);
    if (err) throw err.error;
    if (msg) { msg.textContent = `✅ 再生成完了（シード: ${seed}）`; setTimeout(() => msg.textContent = '', 5000); }
  } catch (e) {
    if (msg) msg.textContent = `❌ エラー: ${e.message}`;
  }
}

function escDrill(str) {
  return String(str ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
}

const DRILL_LABEL = {
  beginner:    '初心者ドリル',
  apprentice:  '見習いのドリル',
  stone_drill: '石ドリル',
  copper_drill:'銅ドリル',
  journeyman:  '一人前のドリル',
  iron_drill:  '鉄ドリル',
  mass_drill:  '量産型ドリル',
  veteran:     '熟練のドリル',
  silver_drill:'銀のドリル',
  allpurpose:  '万能ドリル',
};

const PERMIT_LABEL = {
  permit_100: '100m許可証',
  permit_200: '200m許可証',
};

// ============================================================
// プレイヤー統計テーブル
// ============================================================

async function fetchDrillStats() {
  const tbody = document.getElementById('drill-stats-body');
  tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4">
    <div class="spinner-border spinner-border-sm me-2" role="status"></div>読み込み中...
  </td></tr>`;

  try {
    const { data, error } = await supabaseClient.rpc('get_drill_user_stats');
    if (error) throw error;

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">プレイヤーデータなし</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(r => {
      const pos = r.map_date
        ? `${r.pos_x}, ${r.pos_y}m<br><small class="text-muted">${r.map_date}</small>`
        : '<span class="text-muted">—</span>';

      const drillName = DRILL_LABEL[r.equipped_drill] || (r.equipped_drill ?? '初心者ドリル');
      const dur = r.drill_durability === null ? '∞' : (r.drill_durability ?? '—');

      const permits = Array.isArray(r.permits) && r.permits.length
        ? r.permits.map(p => `<span class="badge bg-secondary me-1">${PERMIT_LABEL[p] ?? p}</span>`).join('')
        : '<span class="text-muted">—</span>';

      const goldBadge = r.drill_gold > 0
        ? `<strong class="text-warning">${r.drill_gold.toLocaleString()}G</strong>`
        : `<span class="text-muted">0G</span>`;

      const invVal = Number(r.inventory_value ?? 0);
      const invBadge = invVal > 0
        ? `<span class="text-success">${invVal.toLocaleString()}G相当</span>`
        : '<span class="text-muted">—</span>';

      const safeName = escDrill(r.account_name || '—');
      const safeId   = escDrill(r.user_id);

      return `<tr>
        <td><strong>${safeName}</strong></td>
        <td>${goldBadge}</td>
        <td class="small">${pos}</td>
        <td class="text-center">${Number(r.backpack_count ?? 0)}個</td>
        <td>${invBadge}</td>
        <td class="small">${escDrill(drillName)}<br><small class="text-muted">耐久: ${dur}</small></td>
        <td class="small">${permits}</td>
        <td>
          <button class="btn-refresh" style="padding:4px 12px;font-size:.75rem;"
            onclick="showInventory('${safeId}','${safeName}')">📦 詳細</button>
        </td>
      </tr>`;
    }).join('');

  } catch (err) {
    console.error('drill stats error:', err);
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-danger py-4">
      エラー: ${escDrill(err.message)}<br>
      <small class="text-muted">SQL関数 get_drill_user_stats() が未実行の可能性があります</small>
    </td></tr>`;
  }
}

// ============================================================
// ゲームパラメータ設定
// ============================================================

const DEFAULT_GAME_CONFIG = {
  mats: {
    dirt:     { name: '土',   hp: 3   },
    stone:    { name: '石',   hp: 10  },
    copper:   { name: '銅',   hp: 20  },
    iron:     { name: '鉄',   hp: 50  },
    silver:   { name: '銀',   hp: 200 },
    gold:     { name: '金',   hp: 50  },
    treasure: { name: '宝箱', hp: 30  },
  },
  drills: {
    beginner:     { name: '初心者ドリル',   power: 1,   dur: null,  cost: null,  recipe: null },
    apprentice:   { name: '見習いのドリル', power: 3,   dur: 300,   cost: 100,   recipe: null },
    stone_drill:  { name: '石ドリル',       power: 5,   dur: 1000,  cost: null,  recipe: { stone: 50 } },
    copper_drill: { name: '銅ドリル',       power: 10,  dur: 2000,  cost: null,  recipe: { copper: 50 } },
    journeyman:   { name: '一人前のドリル', power: 10,  dur: 3000,  cost: 2000,  recipe: null },
    iron_drill:   { name: '鉄ドリル',       power: 25,  dur: 4000,  cost: null,  recipe: { iron: 50 } },
    mass_drill:   { name: '量産型ドリル',   power: 25,  dur: 3000,  cost: null,  recipe: { stone: 20, copper: 20, iron: 20 } },
    veteran:      { name: '熟練のドリル',   power: 50,  dur: 10000, cost: 10000, recipe: null },
    silver_drill: { name: '銀のドリル',     power: 50,  dur: 20000, cost: null,  recipe: { silver: 30 } },
    allpurpose:   { name: '万能ドリル',     power: 100, dur: 50000, cost: null,  recipe: { copper: 20, iron: 20, silver: 20 } },
  },
  // 10Mごとの出現率（%）。30スロット: 0-9m, 10-19m, ..., 290-299m
  layerWeights: (() => {
    const base = [
      [['dirt', 65],  ['stone', 28],  ['copper', 7]],
      [['dirt', 15],  ['stone', 35],  ['copper', 29], ['iron', 20.5], ['silver', 0.5]],
      [['dirt', 5],   ['stone', 20],  ['copper', 15], ['iron', 35],   ['silver', 20], ['gold', 5]],
    ];
    return Array.from({length: 30}, (_, i) => base[Math.min(2, Math.floor(i / 10))].map(e => [...e]));
  })(),
  shop: [
    { id: 'apprentice',   name: '見習いのドリル', cost: 100   },
    { id: 'journeyman',   name: '一人前のドリル', cost: 2000  },
    { id: 'veteran',      name: '熟練のドリル',   cost: 10000 },
  ],
  sellPrices: { dirt: 1, stone: 3, copper: 15, iron: 50, silver: 200, gold: 500 },
  permits: {
    permit_100: { name: '100m入坑許可証', recipe: { stone: 1000, copper: 300 } },
    permit_200: { name: '200m入坑許可証', recipe: { iron: 1000,  silver: 300 } },
  },
  baseHp: 1000,
  events: [
    // 第1層 0-99m
    [
      { type: 'nothing', weight: 80 },
      { type: 'gold',    weight: 10, min: 5,   max: 20  },
      { type: 'damage',  weight: 5,  min: 10,  max: 30  },
      { type: 'pitfall', weight: 3  },
    ],
    // 第2層 100-199m
    [
      { type: 'nothing', weight: 70 },
      { type: 'gold',    weight: 10, min: 20,  max: 80  },
      { type: 'damage',  weight: 8,  min: 20,  max: 60  },
      { type: 'pitfall', weight: 8  },
    ],
    // 第3層 200-299m
    [
      { type: 'nothing', weight: 60 },
      { type: 'gold',    weight: 10, min: 50,  max: 200 },
      { type: 'damage',  weight: 12, min: 50,  max: 100 },
      { type: 'pitfall', weight: 12 },
    ],
  ],
  encounter: Array.from({length: 30}, (_, i) => ({ chance: [2, 4, 6][Math.min(2, Math.floor(i / 10))] })),
  curse: [
    { min: 1, max: 10 }, // 第1層
    { min: 3, max: 20 }, // 第2層
    { min: 8, max: 40 }, // 第3層
  ],
  monsters: {
    test_slime: {
      name: 'テストスライム',
      icon: '💚',
      imageUrl: null,
      maxHp: 200,
      layerWeights: Array.from({length: 30}, (_, i) => i < 10 ? 100 : 0),
      actions: [
        { name: 'たいあたり',          damage: 30, weight: 1 },
        { name: 'ぷるぷるふるえている', damage: 0,  weight: 1 },
        { name: 'からみつく',          damage: 50, weight: 1 },
      ],
    },
  },
  cards: {
    attack: {
      name: '攻撃',
      desc: '50ダメージ',
      icon: '⚔️',
      imageUrl: null,
      damage: 50,
    },
  },
  treasureTypes: {
    wood: {
      name: '木の宝箱',
      imageUrl: null,
      loot: [
        { type: 'gold', min: 50, max: 200, weight: 40 },
        { type: 'item', itemId: 'stone',  qty: 30, weight: 30 },
        { type: 'item', itemId: 'copper', qty: 10, weight: 20 },
        { type: 'item', itemId: 'iron',   qty: 5,  weight: 10 },
      ],
    },
  },
  treasureSlots: Array.from({length: 30}, () => ({ wood: 1 })),
};

let gameConfig = null;

const MAT_IDS        = ['dirt','stone','copper','iron','silver','gold','treasure'];
const MAT_NAMES      = { dirt:'土', stone:'石', copper:'銅', iron:'鉄', silver:'銀', gold:'金', treasure:'宝箱' };
const DRILL_IDS      = ['beginner','apprentice','stone_drill','copper_drill','journeyman',
                        'iron_drill','mass_drill','veteran','silver_drill','allpurpose'];
const RECIPE_MAT_IDS = ['dirt','stone','copper','iron','silver','gold'];

function cfgNum(id, val, opts = '') {
  return `<input class="cfg-input" type="number" id="${id}" value="${escDrill(String(val ?? ''))}" ${opts}>`;
}

// レシピ行を追加（ドリル・許可証共通）
function addRecipeDom(recipeId) {
  const container = document.getElementById('recipe-rows-' + recipeId);
  if (!container) return;
  container.querySelectorAll('.recipe-placeholder').forEach(el => el.remove());
  const matOpts = RECIPE_MAT_IDS.map(id =>
    `<option value="${id}">${MAT_NAMES[id]}</option>`
  ).join('');
  const row = document.createElement('div');
  row.className = 'recipe-row';
  row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:6px;';
  row.innerHTML = `
    <select class="cfg-input rmat-${recipeId}" style="flex:1;">${matOpts}</select>
    <span style="opacity:.45;font-size:.8rem;">×</span>
    <input class="cfg-input rqty-${recipeId}" type="number" value="1" min="1" style="width:70px;">
    <button class="inv-del-btn" onclick="this.parentElement.remove()">✕</button>`;
  container.appendChild(row);
}

function showCfgTab(name, btn) {
  document.querySelectorAll('.cfg-section').forEach(el => el.style.display = 'none');
  document.getElementById('cfg-tab-' + name).style.display = '';
  document.querySelectorAll('.cfg-tab-btn').forEach(el => el.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

async function loadGameConfigAdmin() {
  try {
    const { data } = await supabaseClient
      .from('drill_page_settings')
      .select('setting_value')
      .eq('setting_key', 'game_config')
      .maybeSingle();
    gameConfig = data?.setting_value
      ? JSON.parse(data.setting_value)
      : JSON.parse(JSON.stringify(DEFAULT_GAME_CONFIG));
  } catch {
    gameConfig = JSON.parse(JSON.stringify(DEFAULT_GAME_CONFIG));
  }
  if (!gameConfig.monsters)       gameConfig.monsters       = JSON.parse(JSON.stringify(DEFAULT_GAME_CONFIG.monsters));
  if (!gameConfig.cards)         gameConfig.cards          = JSON.parse(JSON.stringify(DEFAULT_GAME_CONFIG.cards));
  if (!gameConfig.treasureTypes) gameConfig.treasureTypes  = JSON.parse(JSON.stringify(DEFAULT_GAME_CONFIG.treasureTypes));
  if (!gameConfig.treasureSlots || gameConfig.treasureSlots.length < 30)
    gameConfig.treasureSlots = JSON.parse(JSON.stringify(DEFAULT_GAME_CONFIG.treasureSlots));
  if (!gameConfig.encounter) gameConfig.encounter = JSON.parse(JSON.stringify(DEFAULT_GAME_CONFIG.encounter));
  // encounter 旧3スロット → 30スロットにマイグレーション
  if (gameConfig.encounter.length < 30) {
    const old = gameConfig.encounter;
    gameConfig.encounter = Array.from({length: 30}, (_, i) => ({ ...old[Math.min(old.length - 1, Math.floor(i / 10))] }));
  }
  // monster layerWeights 旧3スロット → 30スロットにマイグレーション
  if (gameConfig.monsters) {
    for (const mon of Object.values(gameConfig.monsters)) {
      if (mon.layerWeights && mon.layerWeights.length < 30) {
        const old = mon.layerWeights;
        mon.layerWeights = Array.from({length: 30}, (_, i) => old[Math.min(old.length - 1, Math.floor(i / 10))] ?? 0);
      }
    }
  }
  // 旧3層形式 → 30スロット形式にマイグレーション
  if (!gameConfig.layerWeights || gameConfig.layerWeights.length < 30) {
    const old = gameConfig.layerWeights ?? DEFAULT_GAME_CONFIG.layerWeights;
    gameConfig.layerWeights = Array.from({length: 30}, (_, i) => {
      const src = old[Math.min(old.length - 1, Math.floor(i / 10))];
      return src ? src.map(e => [...e]) : [['dirt', 100]];
    });
  }
  // 旧設定に残っている combat エントリを除去
  if (gameConfig.events) {
    gameConfig.events = gameConfig.events.map(layer =>
      Array.isArray(layer) ? layer.filter(e => e.type !== 'combat') : layer
    );
  }
  renderConfigEditor();
}

function renderConfigEditor() {
  renderMatsTab();
  renderDrillsTab();
  renderLayersTab();
  renderShopTab();
  renderSellTab();
  renderPermitsTab();
  renderEventsTab();
  renderMonstersTab();
  renderCardsTab();
  renderTreasureTab();
  // 最初のタブをアクティブに
  const firstBtn = document.querySelector('.cfg-tab-btn');
  if (firstBtn) showCfgTab('mats', firstBtn);
}

function renderMatsTab() {
  const cfg = gameConfig.mats ?? {};
  const rows = MAT_IDS.map(id => {
    const def = DEFAULT_GAME_CONFIG.mats[id];
    const hp  = cfg[id]?.hp ?? def.hp;
    return `<tr>
      <td>${MAT_NAMES[id]}</td>
      <td>${cfgNum('cfg-mat-hp-' + id, hp, 'min="1" style="width:90px;"')}</td>
    </tr>`;
  }).join('');
  document.getElementById('cfg-tab-mats').innerHTML = `
    <table class="drill-table" style="max-width:360px;">
      <tr><th>ブロック</th><th>HP（破壊に必要な累積ダメージ）</th></tr>
      ${rows}
    </table>`;
}

function renderDrillsTab() {
  const cfg = gameConfig.drills ?? {};

  const matOptsFor = (selected) => RECIPE_MAT_IDS.map(id =>
    `<option value="${id}" ${id === selected ? 'selected' : ''}>${MAT_NAMES[id]}</option>`
  ).join('');

  const statsRows = DRILL_IDS.map(id => {
    const def = DEFAULT_GAME_CONFIG.drills[id];
    const d   = { ...def, ...(cfg[id] ?? {}) };
    return `<tr>
      <td style="white-space:nowrap;">${escDrill(def.name)}</td>
      <td>${cfgNum('cfg-drill-power-'+id, d.power,      'min="1" style="width:64px;"')}</td>
      <td>${cfgNum('cfg-drill-dur-'  +id, d.dur ?? '',  'min="0" placeholder="∞" style="width:80px;"')}</td>
      <td>${cfgNum('cfg-drill-cost-' +id, d.cost ?? '', 'min="0" placeholder="—" style="width:80px;"')}</td>
    </tr>`;
  }).join('');

  const recipeBlocks = DRILL_IDS.map(id => {
    const def     = DEFAULT_GAME_CONFIG.drills[id];
    const d       = { ...def, ...(cfg[id] ?? {}) };
    const entries = Object.entries(d.recipe || {});

    const rows = entries.length > 0
      ? entries.map(([mat, qty]) => `
          <div class="recipe-row" style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
            <select class="cfg-input rmat-${id}" style="flex:1;">${matOptsFor(mat)}</select>
            <span style="opacity:.45;font-size:.8rem;">×</span>
            <input class="cfg-input rqty-${id}" type="number" value="${qty}" min="1" style="width:70px;">
            <button class="inv-del-btn" onclick="this.parentElement.remove()">✕</button>
          </div>`).join('')
      : `<div class="recipe-placeholder inv-empty" style="margin-bottom:6px;">なし（クラフト不可）</div>`;

    return `<div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:12px;">
      <div style="font-size:.82rem;font-weight:700;margin-bottom:8px;color:rgba(255,255,255,.8);">${escDrill(def.name)}</div>
      <div id="recipe-rows-${id}">${rows}</div>
      <button class="inv-save-btn" style="padding:2px 10px;font-size:.75rem;" onclick="addRecipeDom('${id}')">＋ 素材追加</button>
    </div>`;
  }).join('');

  document.getElementById('cfg-tab-drills').innerHTML = `
    <div class="info-box" style="margin-bottom:12px;">
      耐久・購入Gは空欄=なし（∞ / ショップ非売品）
    </div>
    <div style="overflow-x:auto;">
    <table class="drill-table" style="margin-bottom:20px;">
      <tr><th>ドリル</th><th>威力</th><th>最大耐久</th><th>購入G</th></tr>
      ${statsRows}
    </table></div>
    <div style="font-weight:700;font-size:.85rem;color:rgba(255,255,255,.65);margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,.12);">
      🔨 クラフトレシピ
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">
      ${recipeBlocks}
    </div>`;
}

const LYR_MATS = ['dirt', 'stone', 'copper', 'iron', 'silver', 'gold'];

function renderLayersTab() {
  const cfg = gameConfig.layerWeights ?? DEFAULT_GAME_CONFIG.layerWeights;
  const layerHeaders = [
    { s: 0,  label: '第1層 (0〜99m)'   },
    { s: 10, label: '第2層 (100〜199m)' },
    { s: 20, label: '第3層 (200〜299m)' },
  ];

  const getVal = (slotIdx, mat) => {
    const row = cfg[slotIdx] ?? [];
    return (row.find(([m]) => m === mat)?.[1] ?? 0);
  };

  let rows = '';
  for (let s = 0; s < 30; s++) {
    const header = layerHeaders.find(h => h.s === s);
    if (header) {
      rows += `<tr style="background:rgba(255,255,255,.07);">
        <td colspan="8" style="padding:5px 8px;font-size:.78rem;font-weight:700;opacity:.8;">${header.label}</td>
      </tr>`;
    }
    const total = LYR_MATS.reduce((sum, mat) => sum + getVal(s, mat), 0);
    const col   = Math.abs(total - 100) < 0.5 ? '#6bde9b' : '#ff6b6b';
    const inputs = LYR_MATS.map(mat =>
      `<td style="padding:2px 3px;">
        <input class="cfg-input" type="number" id="cfg-lyr-${s}-${mat}"
          value="${getVal(s, mat)}" min="0" max="100" step="0.5"
          style="width:50px;font-size:.75rem;" oninput="updateLayerTotal(${s})">
      </td>`
    ).join('');
    rows += `<tr>
      <td style="white-space:nowrap;font-size:.75rem;padding:2px 8px;">${s*10}〜${s*10+9}m</td>
      ${inputs}
      <td id="lt-${s}" style="font-size:.75rem;font-weight:700;color:${col};padding:2px 6px;white-space:nowrap;">${total.toFixed(1)}%</td>
    </tr>`;
  }

  document.getElementById('cfg-tab-layers').innerHTML = `
    <div class="info-box" style="margin-bottom:10px;">
      各10mの素材出現率（%）。合計が <strong>100</strong> になるように設定してください。
    </div>
    <div style="overflow-x:auto;">
      <table class="drill-table" style="font-size:.8rem;min-width:520px;">
        <thead>
          <tr>
            <th style="min-width:80px;">深度</th>
            <th>土</th><th>石</th><th>銅</th><th>鉄</th><th>銀</th><th>金</th>
            <th>合計</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function updateLayerTotal(s) {
  const total = LYR_MATS.reduce((sum, mat) => {
    return sum + (parseFloat(document.getElementById(`cfg-lyr-${s}-${mat}`)?.value) || 0);
  }, 0);
  const el = document.getElementById(`lt-${s}`);
  if (el) {
    el.textContent = `${total.toFixed(1)}%`;
    el.style.color = Math.abs(total - 100) < 0.5 ? '#6bde9b' : '#ff6b6b';
  }
}

function renderShopTab() {
  const cfg  = gameConfig.shop ?? DEFAULT_GAME_CONFIG.shop;
  const rows = cfg.map((item, i) => `<tr>
    <td>${escDrill(item.name)}</td>
    <td>${cfgNum('cfg-shop-cost-' + i, item.cost, 'min="1" style="width:100px;"')}</td>
  </tr>`).join('');
  document.getElementById('cfg-tab-shop').innerHTML = `
    <table class="drill-table" style="max-width:400px;">
      <tr><th>アイテム</th><th>価格（G）</th></tr>
      ${rows}
    </table>`;
}

function renderSellTab() {
  const cfg  = gameConfig.sellPrices ?? {};
  const mats = ['dirt','stone','copper','iron','silver','gold'];
  const rows = mats.map(id => `<tr>
    <td>${MAT_NAMES[id]}</td>
    <td>${cfgNum('cfg-sell-' + id, cfg[id] ?? DEFAULT_GAME_CONFIG.sellPrices[id], 'min="0" style="width:100px;"')}</td>
  </tr>`).join('');
  document.getElementById('cfg-tab-sell').innerHTML = `
    <table class="drill-table" style="max-width:360px;">
      <tr><th>素材</th><th>売却価格（G）</th></tr>
      ${rows}
    </table>`;
}

function renderPermitsTab() {
  const cfg = gameConfig.permits ?? {};

  const matOptsFor = (selected) => RECIPE_MAT_IDS.map(id =>
    `<option value="${id}" ${id === selected ? 'selected' : ''}>${MAT_NAMES[id]}</option>`
  ).join('');

  const blocks = Object.entries(DEFAULT_GAME_CONFIG.permits).map(([id, def]) => {
    const p       = { ...def, ...(cfg[id] ?? {}) };
    const entries = Object.entries(p.recipe || {});

    const rows = entries.length > 0
      ? entries.map(([mat, qty]) => `
          <div class="recipe-row" style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">
            <select class="cfg-input rmat-${id}" style="flex:1;">${matOptsFor(mat)}</select>
            <span style="opacity:.45;font-size:.8rem;">×</span>
            <input class="cfg-input rqty-${id}" type="number" value="${qty}" min="1" style="width:70px;">
            <button class="inv-del-btn" onclick="this.parentElement.remove()">✕</button>
          </div>`).join('')
      : `<div class="recipe-placeholder inv-empty" style="margin-bottom:6px;">なし</div>`;

    return `<div style="margin-bottom:20px;">
      <div style="font-size:.9rem;font-weight:700;margin-bottom:10px;">${escDrill(def.name)}</div>
      <div id="recipe-rows-${id}">${rows}</div>
      <button class="inv-save-btn" style="padding:2px 10px;font-size:.75rem;" onclick="addRecipeDom('${id}')">＋ 素材追加</button>
    </div>`;
  }).join('');

  document.getElementById('cfg-tab-permits').innerHTML = `<div style="margin-top:4px;">${blocks}</div>`;
}

function buildEncounterTable(encounter, monsters) {
  const monIds = Object.keys(monsters);
  const layerHeaders = [
    { s: 0,  label: '第1層 (0〜99m)'   },
    { s: 10, label: '第2層 (100〜199m)' },
    { s: 20, label: '第3層 (200〜299m)' },
  ];
  const monHeaders = monIds.map(id =>
    `<th style="font-size:.72rem;max-width:60px;word-break:break-all;">${escDrill(monsters[id]?.name || id)}</th>`
  ).join('');

  let rows = '';
  for (let s = 0; s < 30; s++) {
    const hdr = layerHeaders.find(h => h.s === s);
    if (hdr) rows += `<tr style="background:rgba(255,255,255,.07);">
      <td colspan="${3 + monIds.length}" style="padding:5px 8px;font-size:.78rem;font-weight:700;opacity:.8;">${hdr.label}</td>
    </tr>`;

    const enc = encounter[s] ?? { chance: 0 };
    const monTotal = monIds.reduce((sum, id) => sum + ((monsters[id]?.layerWeights ?? [])[s] ?? 0), 0);
    const monCol = monTotal === 0 || Math.abs(monTotal - 100) < 0.5 ? '#6bde9b' : '#ff6b6b';

    const monCells = monIds.map(id => {
      const val = (monsters[id]?.layerWeights ?? [])[s] ?? 0;
      return `<td style="padding:2px 3px;">
        <input class="cfg-input" type="number" id="cfg-mon-lw-${id}-${s}"
          value="${val}" min="0" max="100" step="1" style="width:52px;font-size:.75rem;"
          oninput="updateEncTotal(${s})">
      </td>`;
    }).join('');

    rows += `<tr>
      <td style="white-space:nowrap;font-size:.75rem;padding:2px 8px;">${s*10}〜${s*10+9}m</td>
      <td style="padding:2px 3px;">
        <input class="cfg-input" type="number" id="cfg-enc-${s}-chance"
          value="${enc.chance ?? 0}" min="0" max="100" step="0.1" style="width:52px;font-size:.75rem;">
      </td>
      ${monCells}
      <td id="enc-total-${s}" style="font-size:.75rem;font-weight:700;color:${monCol};padding:2px 6px;white-space:nowrap;">
        ${monTotal === 0 ? '–' : monTotal.toFixed(0) + '%'}
      </td>
    </tr>`;
  }

  return `
    <div class="info-box" style="margin-bottom:8px;font-size:.78rem;">
      遭遇率：1マス移動ごとの確率(%)。モンスター重み：合計が <strong>100</strong> になるよう設定（0=出現しない）。
    </div>
    <div style="overflow-x:auto;margin-bottom:24px;">
      <table class="drill-table" style="font-size:.8rem;min-width:300px;">
        <thead>
          <tr>
            <th style="min-width:80px;">深度</th>
            <th style="min-width:60px;">遭遇率%</th>
            ${monHeaders}
            <th>モンスター合計</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function updateEncTotal(s) {
  const monsters = gameConfig.monsters ?? {};
  const total = Object.keys(monsters).reduce((sum, id) =>
    sum + (parseFloat(document.getElementById(`cfg-mon-lw-${id}-${s}`)?.value) || 0), 0);
  const el = document.getElementById(`enc-total-${s}`);
  if (el) {
    el.textContent = total === 0 ? '–' : `${total.toFixed(0)}%`;
    el.style.color = total === 0 || Math.abs(total - 100) < 0.5 ? '#6bde9b' : '#ff6b6b';
  }
}

function renderEventsTab() {
  const events    = gameConfig.events    ?? DEFAULT_GAME_CONFIG.events;
  const encounter = gameConfig.encounter ?? DEFAULT_GAME_CONFIG.encounter;
  const curse     = gameConfig.curse     ?? DEFAULT_GAME_CONFIG.curse;
  const baseHp    = gameConfig.baseHp    ?? DEFAULT_GAME_CONFIG.baseHp;

  const EV_LABEL = {
    nothing: 'なし',
    gold:    'お金ドロップ',
    damage:  'ダメージ',
    pitfall: '落とし穴',
  };
  const LAYER_NAME = ['第1層 (0〜99m)', '第2層 (100〜199m)', '第3層 (200〜299m)'];

  let html = `
    <div class="info-box" style="margin-bottom:14px;">
      重みは合計100推奨（内部で正規化されるので合計が違っても動作します）。<br>
      上移動時の許可証チェックなし・落とし穴は常に30m下へ転移。
    </div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
      <label style="font-size:.85rem;">❤️ 基礎HP</label>
      ${cfgNum('cfg-basehp', baseHp, 'min="1" style="width:90px;"')}
    </div>

    <div style="font-size:.88rem;font-weight:700;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,.1);">
      ⚔️ 移動エンカウント・モンスター出現（10Mごと）
    </div>
    ${buildEncounterTable(encounter, gameConfig.monsters ?? {})}


    <div style="font-size:.88rem;font-weight:700;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,.1);">
      🧱 ブロック破壊イベント
    </div>`;

  events.forEach((layer, li) => {
    const c     = curse[li] ?? { min: 0, max: 0 };
    const total = layer.reduce((s, e) => s + (e.weight || 0), 0);
    const col   = Math.abs(total - 100) < 0.5 ? '#6bde9b' : '#ff6b6b';

    html += `
    <div style="margin-bottom:24px;">
      <div style="font-size:.88rem;font-weight:700;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,.1);">
        ${LAYER_NAME[li] ?? `第${li+1}層`}
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;font-size:.82rem;flex-wrap:wrap;">
        <span>👻 呪いダメージ（上移動1マスごと）</span>
        ${cfgNum(`cfg-curse-${li}-min`, c.min, `min="0" style="width:68px;" placeholder="min" oninput="updateCurseAvg(${li})"`)}
        <span style="opacity:.45;">〜</span>
        ${cfgNum(`cfg-curse-${li}-max`, c.max, `min="0" style="width:68px;" placeholder="max" oninput="updateCurseAvg(${li})"`)}
      </div>
      <div style="font-size:.78rem;margin-bottom:10px;display:flex;gap:14px;flex-wrap:wrap;">
        <span style="color:rgba(255,255,255,.5);">平均:
          <span id="curse-avg-${li}" style="color:#6bde9b;font-weight:700;">${((c.min + c.max) / 2).toFixed(1)}</span> HP
        </span>
        ${li > 0 ? `<span style="color:rgba(180,100,255,.7);">許可証なし(×10):
          <span id="curse-avg10-${li}" style="color:#c87fff;font-weight:700;">${((c.min + c.max) / 2 * 10).toFixed(1)}</span> HP
        </span>` : ''}
      </div>
      <table class="drill-table">
        <tr><th>イベント</th><th>重み</th><th>追加パラメータ（min〜max）</th></tr>`;

    for (const ev of layer) {
      let extra = '';
      if (ev.type === 'gold' || ev.type === 'damage') {
        const label = ev.type === 'gold' ? 'G' : 'HP';
        extra = `
          ${cfgNum(`cfg-ev-${li}-${ev.type}-min`, ev.min ?? 0, `min="0" style="width:68px;" placeholder="min"`)}
          <span style="opacity:.45;font-size:.78rem;">〜</span>
          ${cfgNum(`cfg-ev-${li}-${ev.type}-max`, ev.max ?? 0, `min="0" style="width:68px;" placeholder="max"`)}
          <span style="opacity:.55;font-size:.78rem;">${label}</span>`;
      }
      html += `<tr>
        <td style="white-space:nowrap;">${EV_LABEL[ev.type] ?? ev.type}</td>
        <td>
          ${cfgNum(`cfg-ev-${li}-${ev.type}-weight`, ev.weight, `min="0" step="0.1" style="width:68px;"
            oninput="updateEvTotal(${li})"`)}</td>
        <td style="font-size:.82rem;">${extra}</td>
      </tr>`;
    }

    html += `
        <tr>
          <td colspan="3" style="text-align:right;font-size:.76rem;opacity:.65;padding-top:4px;">
            合計: <span id="ev-total-${li}" style="color:${col};">${total}</span>
          </td>
        </tr>
      </table>
    </div>`;
  });

  document.getElementById('cfg-tab-events').innerHTML = html;
}

function updateCurseAvg(li) {
  const minEl = document.getElementById(`cfg-curse-${li}-min`);
  const maxEl = document.getElementById(`cfg-curse-${li}-max`);
  if (!minEl || !maxEl) return;
  const avg = ((parseFloat(minEl.value) || 0) + (parseFloat(maxEl.value) || 0)) / 2;
  const avgEl   = document.getElementById(`curse-avg-${li}`);
  const avg10El = document.getElementById(`curse-avg10-${li}`);
  if (avgEl)   avgEl.textContent   = avg.toFixed(1);
  if (avg10El) avg10El.textContent = (avg * 10).toFixed(1);
}

function updateEvTotal(li) {
  const evs = (gameConfig.events ?? DEFAULT_GAME_CONFIG.events)[li] || [];
  let total = 0;
  evs.forEach(ev => {
    const w = document.getElementById(`cfg-ev-${li}-${ev.type}-weight`);
    total += parseFloat(w?.value || 0);
  });
  const el = document.getElementById(`ev-total-${li}`);
  if (el) { el.textContent = total.toFixed(1); el.style.color = Math.abs(total - 100) < 0.5 ? '#6bde9b' : '#ff6b6b'; }
}

function collectConfig() {
  const gc = gameConfig;

  // MATS
  MAT_IDS.forEach(id => {
    const el = document.getElementById('cfg-mat-hp-' + id);
    if (el && gc.mats?.[id]) gc.mats[id].hp = parseInt(el.value) || 1;
  });

  // DRILLS
  DRILL_IDS.forEach(id => {
    const pw  = document.getElementById('cfg-drill-power-' + id);
    const dur = document.getElementById('cfg-drill-dur-'   + id);
    const cst = document.getElementById('cfg-drill-cost-'  + id);
    if (!gc.drills) gc.drills = {};
    if (!gc.drills[id]) gc.drills[id] = { ...DEFAULT_GAME_CONFIG.drills[id] };
    if (pw)  gc.drills[id].power = parseInt(pw.value) || 1;
    if (dur) gc.drills[id].dur   = dur.value.trim() === '' ? null : (parseInt(dur.value) || null);
    if (cst) gc.drills[id].cost  = cst.value.trim() === '' ? null : (parseInt(cst.value) || null);
    if (document.getElementById('recipe-rows-' + id)) {
      const recipe = {};
      document.querySelectorAll(`.rmat-${id}`).forEach((matEl, i) => {
        const mat = matEl.value;
        const qty = parseInt(document.querySelectorAll(`.rqty-${id}`)[i]?.value || '0');
        if (mat && qty > 0) recipe[mat] = qty;
      });
      gc.drills[id].recipe = Object.keys(recipe).length > 0 ? recipe : null;
    }
  });

  // LAYER WEIGHTS (30スロット、パーセント形式)
  if (!gc.layerWeights || gc.layerWeights.length < 30)
    gc.layerWeights = JSON.parse(JSON.stringify(DEFAULT_GAME_CONFIG.layerWeights));
  for (let s = 0; s < 30; s++) {
    const row = [];
    for (const mat of LYR_MATS) {
      const val = parseFloat(document.getElementById(`cfg-lyr-${s}-${mat}`)?.value) || 0;
      if (val > 0) row.push([mat, val]);
    }
    gc.layerWeights[s] = row;
  }

  // SHOP
  (gc.shop ?? []).forEach((item, i) => {
    const el = document.getElementById('cfg-shop-cost-' + i);
    if (el) item.cost = parseInt(el.value) || item.cost;
  });

  // SELL PRICES
  if (!gc.sellPrices) gc.sellPrices = {};
  ['dirt','stone','copper','iron','silver','gold'].forEach(id => {
    const el = document.getElementById('cfg-sell-' + id);
    if (el) gc.sellPrices[id] = parseInt(el.value) || 0;
  });

  // PERMITS
  Object.keys(DEFAULT_GAME_CONFIG.permits).forEach(id => {
    if (!gc.permits) gc.permits = {};
    if (!gc.permits[id]) gc.permits[id] = { ...DEFAULT_GAME_CONFIG.permits[id] };
    if (document.getElementById('recipe-rows-' + id)) {
      const recipe = {};
      document.querySelectorAll(`.rmat-${id}`).forEach((matEl, i) => {
        const mat = matEl.value;
        const qty = parseInt(document.querySelectorAll(`.rqty-${id}`)[i]?.value || '0');
        if (mat && qty > 0) recipe[mat] = qty;
      });
      gc.permits[id].recipe = Object.keys(recipe).length > 0 ? recipe : null;
    }
  });

  // BASE HP
  const bhEl = document.getElementById('cfg-basehp');
  if (bhEl) gc.baseHp = parseInt(bhEl.value) || 1000;

  // EVENTS
  const defEvs = DEFAULT_GAME_CONFIG.events;
  if (!gc.events) gc.events = JSON.parse(JSON.stringify(defEvs));
  gc.events.forEach((layer, li) => {
    layer.forEach(ev => {
      const wEl = document.getElementById(`cfg-ev-${li}-${ev.type}-weight`);
      if (wEl) ev.weight = parseFloat(wEl.value) || 0;
      if (ev.type === 'gold' || ev.type === 'damage') {
        const minEl = document.getElementById(`cfg-ev-${li}-${ev.type}-min`);
        const maxEl = document.getElementById(`cfg-ev-${li}-${ev.type}-max`);
        if (minEl) ev.min = parseInt(minEl.value) || 0;
        if (maxEl) ev.max = parseInt(maxEl.value) || 0;
      }
    });
  });

  // ENCOUNTER (30スロット)
  if (!gc.encounter || gc.encounter.length < 30)
    gc.encounter = JSON.parse(JSON.stringify(DEFAULT_GAME_CONFIG.encounter));
  for (let s = 0; s < 30; s++) {
    const el = document.getElementById(`cfg-enc-${s}-chance`);
    if (el) gc.encounter[s] = { chance: parseFloat(el.value) || 0 };
  }

  // CURSE
  if (!gc.curse) gc.curse = JSON.parse(JSON.stringify(DEFAULT_GAME_CONFIG.curse));
  gc.curse.forEach((c, li) => {
    const minEl = document.getElementById(`cfg-curse-${li}-min`);
    const maxEl = document.getElementById(`cfg-curse-${li}-max`);
    if (minEl) c.min = parseInt(minEl.value) || 0;
    if (maxEl) c.max = parseInt(maxEl.value) || 0;
  });

  // MONSTERS / CARDS / TREASURE
  collectMonstersConfig();
  collectCardsConfig();
  collectTreasureConfig();
}

async function saveGameConfig() {
  const msg = document.getElementById('config-save-msg');
  collectConfig();
  try {
    const { error } = await supabaseClient
      .from('drill_page_settings')
      .upsert({ setting_key: 'game_config', setting_value: JSON.stringify(gameConfig) });
    if (error) throw error;
    if (msg) { msg.textContent = '✅ 保存しました（ゲームリロードで反映）'; setTimeout(() => msg.textContent = '', 4000); }
  } catch (e) {
    if (msg) msg.textContent = '❌ ' + e.message;
  }
}

async function resetGameConfig() {
  if (!confirm('すべてのパラメータをデフォルト値に戻しますか？\n（保存ボタンを押すまでDBは変わりません）')) return;
  gameConfig = JSON.parse(JSON.stringify(DEFAULT_GAME_CONFIG));
  renderConfigEditor();
  const msg = document.getElementById('config-save-msg');
  if (msg) msg.textContent = '↩️ デフォルト値を表示中（保存するまでDBは未更新）';
}

// ============================================================
// プレイヤー所持品モーダル（閲覧＋編集）
// ============================================================

const ITEM_NAME_MAP = {
  dirt: '土', stone: '石', copper: '銅', iron: '鉄',
  silver: '銀', gold: '金', return_stone: '帰還石',
};
const ALL_ITEM_IDS  = ['dirt','stone','copper','iron','silver','gold','return_stone'];
const STORAGE_ITEMS = ['dirt','stone','copper','iron','silver','gold']; // 倉庫に入るもの

let invModalUserId = null;
let invModalName   = null;

async function showInventory(userId, name) {
  invModalUserId = userId;
  invModalName   = name;
  const modal = document.getElementById('inv-modal');
  const body  = document.getElementById('inv-modal-body');
  body.innerHTML = '<div style="text-align:center;padding:24px;opacity:.5;">読み込み中...</div>';
  modal.style.display = 'flex';
  await reloadInvModal();
}

async function reloadInvModal() {
  const body = document.getElementById('inv-modal-body');
  try {
    const { data, error } = await supabaseClient.rpc('admin_get_player_items', {
      p_user_id: invModalUserId,
    });
    if (error) throw error;
    renderInvModal(data || {});
  } catch (e) {
    body.innerHTML = `<div style="color:#ff6b6b;padding:12px;">エラー: ${escDrill(e.message)}</div>`;
  }
}

function renderInvModal(d) {
  const body = document.getElementById('inv-modal-body');
  const bp   = (d.backpack  || []).filter(r => r.quantity > 0);
  const inv  = (d.inventory || []).filter(r => r.quantity > 0);
  const drl  = d.drills  || [];
  const gold = d.gold ?? 0;

  const numInput = (id, val, opts = '') =>
    `<input class="cfg-input" type="number" id="${id}" value="${val}" ${opts} style="width:80px;">`;

  const saveBtn = (onclick) =>
    `<button class="inv-save-btn" onclick="${onclick}">✓</button>`;

  const delBtn = (onclick) =>
    `<button class="inv-del-btn" onclick="${onclick}">✕</button>`;

  const drillOpts = DRILL_IDS.map(id =>
    `<option value="${id}">${escDrill(DRILL_LABEL[id] || id)}</option>`).join('');
  const itemOpts = ALL_ITEM_IDS.map(id =>
    `<option value="${id}">${escDrill(ITEM_NAME_MAP[id] || id)}</option>`).join('');
  const storageOpts = STORAGE_ITEMS.map(id =>
    `<option value="${id}">${escDrill(ITEM_NAME_MAP[id] || id)}</option>`).join('');

  const addRow = (selId, selOpts, qtyId, onclick) => `
    <div style="display:flex;gap:6px;align-items:center;margin-top:8px;flex-wrap:wrap;padding-top:8px;border-top:1px solid rgba(255,255,255,.08);">
      <select class="cfg-input" id="${selId}" style="flex:1;min-width:100px;">${selOpts}</select>
      ${numInput(qtyId, 1, 'min="1"')}
      <button class="inv-save-btn" onclick="${onclick}">＋ 追加</button>
    </div>`;

  let html = `
    <div style="font-size:1rem;font-weight:700;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.15);">
      ✏️ ${escDrill(invModalName)} の所持品編集
    </div>

    <!-- 所持金 -->
    <div style="margin-bottom:18px;">
      <div class="inv-section-title">💰 所持金</div>
      <div style="display:flex;gap:6px;align-items:center;margin-top:6px;">
        ${numInput('inv-gold', gold, 'min="0" style="width:110px;"')}
        ${saveBtn("invSave('gold','gold',document.getElementById('inv-gold').value)")}
      </div>
    </div>

    <!-- ドリル -->
    <div style="margin-bottom:18px;">
      <div class="inv-section-title">⛏️ ドリル</div>
      ${drl.length === 0 ? '<div class="inv-empty">なし</div>' : `
      <table class="drill-table" style="width:100%;margin-top:6px;">
        <tr><th>ドリル</th><th>耐久（-1=∞）</th><th></th><th></th></tr>
        ${drl.map(r => {
          const iid = 'inv-d-' + r.drill_id;
          return `<tr>
            <td style="font-size:.82rem;">${escDrill(DRILL_LABEL[r.drill_id] || r.drill_id)}
              ${r.equipped ? '<span style="color:#6bde9b;font-size:.7rem;margin-left:4px;">装備</span>' : ''}
            </td>
            <td>${numInput(iid, r.durability ?? -1, '')}</td>
            <td>${saveBtn(`invSave('drill','${r.drill_id}',document.getElementById('${iid}').value)`)}</td>
            <td>${delBtn(`invDelDrill('${r.drill_id}')`)}</td>
          </tr>`;
        }).join('')}
      </table>`}
      <div style="display:flex;gap:6px;align-items:center;margin-top:8px;flex-wrap:wrap;padding-top:8px;border-top:1px solid rgba(255,255,255,.08);">
        <select class="cfg-input" id="inv-give-id" style="flex:1;min-width:100px;">${drillOpts}</select>
        ${numInput('inv-give-dur', -1, 'placeholder="-1=∞"')}
        <button class="inv-save-btn" onclick="invGiveDrill()">⛏️ 与える</button>
      </div>
    </div>

    <!-- リュック -->
    <div style="margin-bottom:18px;">
      <div class="inv-section-title">🎒 リュック</div>
      ${bp.length === 0 ? '<div class="inv-empty">空</div>' : `
      <table class="drill-table" style="width:100%;margin-top:6px;">
        <tr><th>アイテム</th><th>数量（0=削除）</th><th></th></tr>
        ${bp.map(r => {
          const iid = 'inv-bp-' + r.item_id;
          return `<tr>
            <td style="font-size:.82rem;">${escDrill(ITEM_NAME_MAP[r.item_id] || r.item_id)}</td>
            <td>${numInput(iid, r.quantity, 'min="0"')}</td>
            <td>${saveBtn(`invSave('backpack','${r.item_id}',document.getElementById('${iid}').value)`)}</td>
          </tr>`;
        }).join('')}
      </table>`}
      ${addRow('inv-add-bp-id', itemOpts, 'inv-add-bp-qty', "invAddItem('backpack')")}
    </div>

    <!-- 倉庫 -->
    <div style="margin-bottom:4px;">
      <div class="inv-section-title">📦 倉庫</div>
      ${inv.length === 0 ? '<div class="inv-empty">空</div>' : `
      <table class="drill-table" style="width:100%;margin-top:6px;">
        <tr><th>アイテム</th><th>数量（0=削除）</th><th></th></tr>
        ${inv.map(r => {
          const iid = 'inv-inv-' + r.item_id;
          return `<tr>
            <td style="font-size:.82rem;">${escDrill(ITEM_NAME_MAP[r.item_id] || r.item_id)}</td>
            <td>${numInput(iid, r.quantity, 'min="0"')}</td>
            <td>${saveBtn(`invSave('inventory','${r.item_id}',document.getElementById('${iid}').value)`)}</td>
          </tr>`;
        }).join('')}
      </table>`}
      ${addRow('inv-add-inv-id', storageOpts, 'inv-add-inv-qty', "invAddItem('inventory')")}
    </div>
  `;
  body.innerHTML = html;
}

async function invSave(type, itemId, valueStr) {
  const value = parseInt(valueStr);
  if (isNaN(value)) return;
  const { error } = await supabaseClient.rpc('admin_set_player_item', {
    p_user_id: invModalUserId, p_type: type, p_item_id: itemId, p_quantity: value,
  });
  if (error) { alert('エラー: ' + error.message); return; }
  await reloadInvModal();
}

async function invGiveDrill() {
  const drillId = document.getElementById('inv-give-id')?.value;
  const dur     = parseInt(document.getElementById('inv-give-dur')?.value ?? '-1');
  if (!drillId) return;
  await invSave('give_drill', drillId, isNaN(dur) ? -1 : dur);
}

async function invDelDrill(drillId) {
  if (!confirm(`${DRILL_LABEL[drillId] || drillId} を削除しますか？`)) return;
  await invSave('delete_drill', drillId, 0);
}

async function invAddItem(type) {
  const selId  = type === 'backpack' ? 'inv-add-bp-id'  : 'inv-add-inv-id';
  const qtyId  = type === 'backpack' ? 'inv-add-bp-qty' : 'inv-add-inv-qty';
  const itemId = document.getElementById(selId)?.value;
  const qty    = parseInt(document.getElementById(qtyId)?.value || '0');
  if (!itemId || qty <= 0) return;
  await invSave(type, itemId, qty);
}

function closeInvModal() {
  document.getElementById('inv-modal').style.display = 'none';
}

// ============================================================
// モンスター設定タブ
// ============================================================

function renderMonstersTab() {
  const monsters = gameConfig.monsters ?? {};
  let html = `<div class="info-box" style="margin-bottom:14px;">
    各モンスターの名前・体力・行動・出現率を設定します。出現率の重みは0=出現しない。
  </div>`;

  for (const [id, mon] of Object.entries(monsters)) {
    const acts = mon.actions ?? [];

    const imgPreview = mon.imageUrl
      ? `<img src="${escDrill(mon.imageUrl)}" style="width:48px;height:48px;object-fit:contain;border-radius:6px;background:rgba(255,255,255,.08);">`
      : `<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.08);border-radius:6px;font-size:2rem;">${escDrill(mon.icon || '👾')}</div>`;

    const actionRows = acts.map((act, ai) => `<tr>
      <td><input class="cfg-input mon-act-name-${id}" type="text" value="${escDrill(act.name)}" style="width:100%;min-width:110px;"></td>
      <td><input class="cfg-input mon-act-dmg-${id}"  type="number" value="${act.damage}" min="0" style="width:68px;"></td>
      <td><input class="cfg-input mon-act-wt-${id}"   type="number" value="${act.weight}" min="0" step="0.1" style="width:58px;"></td>
      <td><button class="inv-del-btn" onclick="delMonsterAction('${id}',${ai})">✕</button></td>
    </tr>`).join('');

    html += `
    <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:16px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
          ${imgPreview}
          <div>
            <div style="font-size:.72rem;opacity:.45;margin-bottom:3px;">ID: ${escDrill(id)}</div>
            <input class="cfg-input mon-name-${id}" type="text" value="${escDrill(mon.name)}" placeholder="名前" style="width:160px;">
          </div>
        </div>
        <button class="inv-del-btn" onclick="deleteMonster('${id}')">🗑️ 削除</button>
      </div>

      <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:14px;align-items:flex-end;">
        <label style="font-size:.82rem;">HP<br>
          <input class="cfg-input mon-hp-${id}" type="number" value="${mon.maxHp}" min="1" style="width:90px;">
        </label>
        <label style="font-size:.82rem;">アイコン絵文字<br>
          <input class="cfg-input mon-icon-${id}" type="text" value="${escDrill(mon.icon ?? '')}" placeholder="👾" style="width:70px;">
        </label>
        <div style="font-size:.82rem;">画像<br>
          <label class="inv-save-btn" style="cursor:pointer;display:inline-block;padding:3px 10px;">
            📁 選択<input type="file" accept="image/*" style="display:none;" onchange="uploadMonsterImage('${id}',this)">
          </label>
          ${mon.imageUrl ? `<button class="inv-del-btn" onclick="clearMonsterImage('${id}')">✕</button>` : ''}
        </div>
      </div>

      <div style="font-size:.82rem;font-weight:700;margin-bottom:8px;opacity:.7;">行動パターン</div>
      <table class="drill-table" style="margin-bottom:8px;">
        <tr><th>行動名</th><th>ダメージ</th><th>重み</th><th></th></tr>
        ${actionRows || '<tr><td colspan="4" style="opacity:.4;font-size:.8rem;padding:6px;">なし</td></tr>'}
      </table>
      <button class="inv-save-btn" style="padding:2px 10px;font-size:.75rem;" onclick="addMonsterAction('${id}')">＋ 行動追加</button>
    </div>`;
  }

  html += `<button class="btn-refresh" onclick="addMonster()">＋ モンスター追加</button>`;
  document.getElementById('cfg-tab-monsters').innerHTML = html;
}

function collectMonstersConfig() {
  const monsters = gameConfig.monsters ?? {};
  for (const [id, mon] of Object.entries(monsters)) {
    const nameEl = document.querySelector(`.mon-name-${id}`);
    const hpEl   = document.querySelector(`.mon-hp-${id}`);
    const iconEl = document.querySelector(`.mon-icon-${id}`);
    if (nameEl) mon.name  = nameEl.value;
    if (hpEl)   mon.maxHp = parseInt(hpEl.value) || 100;
    if (iconEl) mon.icon  = iconEl.value;

    // layerWeights はエンカウントタブの統合テーブルから収集
    const newLw = [];
    for (let s = 0; s < 30; s++) {
      const el = document.getElementById(`cfg-mon-lw-${id}-${s}`);
      newLw.push(el ? (parseFloat(el.value) || 0) : (mon.layerWeights?.[s] ?? 0));
    }
    mon.layerWeights = newLw;

    const nameEls = document.querySelectorAll(`.mon-act-name-${id}`);
    const dmgEls  = document.querySelectorAll(`.mon-act-dmg-${id}`);
    const wtEls   = document.querySelectorAll(`.mon-act-wt-${id}`);
    mon.actions = Array.from(nameEls).map((el, i) => ({
      name:   el.value,
      damage: parseInt(dmgEls[i]?.value) || 0,
      weight: parseFloat(wtEls[i]?.value) || 1,
    }));
  }
  gameConfig.monsters = monsters;
}

function addMonster() {
  collectMonstersConfig();
  const id = 'monster_' + Date.now();
  if (!gameConfig.monsters) gameConfig.monsters = {};
  gameConfig.monsters[id] = {
    name: '新モンスター', icon: '👾', imageUrl: null,
    maxHp: 100, layerWeights: Array.from({length: 30}, () => 0),
    actions: [{ name: '攻撃', damage: 10, weight: 1 }],
  };
  renderMonstersTab();
}

function deleteMonster(id) {
  collectMonstersConfig();
  if (!confirm(`「${gameConfig.monsters?.[id]?.name || id}」を削除しますか？`)) return;
  delete gameConfig.monsters[id];
  renderMonstersTab();
}

function addMonsterAction(id) {
  collectMonstersConfig();
  if (!gameConfig.monsters?.[id]) return;
  gameConfig.monsters[id].actions.push({ name: '行動名', damage: 0, weight: 1 });
  renderMonstersTab();
}

function delMonsterAction(id, idx) {
  collectMonstersConfig();
  if (!gameConfig.monsters?.[id]) return;
  gameConfig.monsters[id].actions.splice(idx, 1);
  renderMonstersTab();
}

async function uploadMonsterImage(id, input) {
  const file = input.files?.[0];
  if (!file) return;
  try {
    collectMonstersConfig();
    const url = await uploadDrillImage('monsters/' + id, file);
    if (gameConfig.monsters?.[id]) gameConfig.monsters[id].imageUrl = url;
    renderMonstersTab();
  } catch (e) {
    alert('アップロードエラー: ' + e.message);
  }
}

function clearMonsterImage(id) {
  if (gameConfig.monsters?.[id]) gameConfig.monsters[id].imageUrl = null;
  renderMonstersTab();
}

// ============================================================
// カード設定タブ
// ============================================================

function renderCardsTab() {
  const cards = gameConfig.cards ?? {};
  let html = `<div class="info-box" style="margin-bottom:14px;">
    プレイヤーのデッキに入るカードの設定です。
  </div>`;

  for (const [id, card] of Object.entries(cards)) {
    const imgPreview = card.imageUrl
      ? `<img src="${escDrill(card.imageUrl)}" style="width:48px;height:48px;object-fit:contain;border-radius:6px;background:rgba(255,255,255,.08);">`
      : `<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.08);border-radius:6px;font-size:2rem;">${escDrill(card.icon || '❓')}</div>`;

    html += `
    <div style="background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:16px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
        <div style="display:flex;align-items:center;gap:10px;">
          ${imgPreview}
          <div>
            <div style="font-size:.72rem;opacity:.45;margin-bottom:3px;">ID: ${escDrill(id)}</div>
            <input class="cfg-input card-name-${id}" type="text" value="${escDrill(card.name)}" placeholder="カード名" style="width:160px;">
          </div>
        </div>
        <button class="inv-del-btn" onclick="deleteCard('${id}')">🗑️ 削除</button>
      </div>

      <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;">
        <label style="font-size:.82rem;">説明<br>
          <input class="cfg-input card-desc-${id}" type="text" value="${escDrill(card.desc ?? '')}" placeholder="説明文" style="width:200px;">
        </label>
        <label style="font-size:.82rem;">ダメージ<br>
          <input class="cfg-input card-dmg-${id}" type="number" value="${card.damage ?? 0}" min="0" style="width:80px;">
        </label>
        <label style="font-size:.82rem;">アイコン絵文字<br>
          <input class="cfg-input card-icon-${id}" type="text" value="${escDrill(card.icon ?? '')}" placeholder="⚔️" style="width:70px;">
        </label>
        <div style="font-size:.82rem;">画像<br>
          <label class="inv-save-btn" style="cursor:pointer;display:inline-block;padding:3px 10px;">
            📁 選択<input type="file" accept="image/*" style="display:none;" onchange="uploadCardImage('${id}',this)">
          </label>
          ${card.imageUrl ? `<button class="inv-del-btn" onclick="clearCardImage('${id}')">✕</button>` : ''}
        </div>
      </div>
    </div>`;
  }

  html += `<button class="btn-refresh" onclick="addCard()">＋ カード追加</button>`;
  document.getElementById('cfg-tab-cards').innerHTML = html;
}

function collectCardsConfig() {
  const cards = gameConfig.cards ?? {};
  for (const [id, card] of Object.entries(cards)) {
    const nameEl = document.querySelector(`.card-name-${id}`);
    const descEl = document.querySelector(`.card-desc-${id}`);
    const dmgEl  = document.querySelector(`.card-dmg-${id}`);
    const iconEl = document.querySelector(`.card-icon-${id}`);
    if (nameEl) card.name   = nameEl.value;
    if (descEl) card.desc   = descEl.value;
    if (dmgEl)  card.damage = parseInt(dmgEl.value) || 0;
    if (iconEl) card.icon   = iconEl.value;
  }
  gameConfig.cards = cards;
}

function addCard() {
  collectCardsConfig();
  const id = 'card_' + Date.now();
  if (!gameConfig.cards) gameConfig.cards = {};
  gameConfig.cards[id] = { name: '新カード', desc: '', icon: '❓', imageUrl: null, damage: 0 };
  renderCardsTab();
}

function deleteCard(id) {
  collectCardsConfig();
  if (!confirm(`「${gameConfig.cards?.[id]?.name || id}」を削除しますか？`)) return;
  delete gameConfig.cards[id];
  renderCardsTab();
}

async function uploadCardImage(id, input) {
  const file = input.files?.[0];
  if (!file) return;
  try {
    collectCardsConfig();
    const url = await uploadDrillImage('cards/' + id, file);
    if (gameConfig.cards?.[id]) gameConfig.cards[id].imageUrl = url;
    renderCardsTab();
  } catch (e) {
    alert('アップロードエラー: ' + e.message);
  }
}

function clearCardImage(id) {
  if (gameConfig.cards?.[id]) gameConfig.cards[id].imageUrl = null;
  renderCardsTab();
}

// ============================================================
// 宝箱設定タブ
// ============================================================

function renderTreasureTab() {
  const el = document.getElementById('cfg-tab-treasure');
  if (!el) return;
  const types = gameConfig.treasureTypes ?? {};
  const slots = gameConfig.treasureSlots ?? Array.from({length: 30}, () => ({}));
  const typeIds = Object.keys(types);

  const ITEM_OPT_IDS = ['dirt','stone','copper','iron','silver','gold'];

  // Section 1: chest type definitions
  let html = `<div class="info-box" style="margin-bottom:14px;">
    宝箱の種類と中身のルーテーブルを設定します。中身はランダムで1つ選ばれます（重みで確率を調整）。
  </div>`;

  for (const [id, def] of Object.entries(types)) {
    const loot = def.loot ?? [];
    const lootRows = loot.map((l, li) => {
      const isGold = l.type === 'gold';
      const itemOpts = ITEM_OPT_IDS.map(m =>
        `<option value="${m}"${m === l.itemId ? ' selected' : ''}>${m}</option>`
      ).join('');
      const content = isGold
        ? `最小&nbsp;<input type="number" id="cfg-chest-loot-min-${id}-${li}" value="${l.min??0}" style="width:50px;">&nbsp;最大&nbsp;<input type="number" id="cfg-chest-loot-max-${id}-${li}" value="${l.max??100}" style="width:50px;">`
        : `<select id="cfg-chest-loot-item-${id}-${li}">${itemOpts}</select>&nbsp;×<input type="number" id="cfg-chest-loot-qty-${id}-${li}" value="${l.qty??1}" min="1" style="width:45px;">`;
      return `<tr>
        <td style="padding:2px 4px;">
          <select id="cfg-chest-loot-type-${id}-${li}" onchange="onChestLootTypeChange('${id}',${li})">
            <option value="gold"${isGold?' selected':''}>お金</option>
            <option value="item"${!isGold?' selected':''}>アイテム</option>
          </select>
        </td>
        <td style="padding:2px 4px;">${content}</td>
        <td style="padding:2px 4px;"><input type="number" id="cfg-chest-loot-weight-${id}-${li}" value="${l.weight??1}" min="0" style="width:50px;"></td>
        <td style="padding:2px 4px;"><button class="btn-refresh" onclick="delChestLoot('${id}',${li})">✕</button></td>
      </tr>`;
    }).join('');

    const imgPreview = def.imageUrl
      ? `<img src="${escDrill(def.imageUrl)}" style="width:32px;height:32px;object-fit:contain;vertical-align:middle;cursor:pointer;border-radius:4px;" onclick="clearChestImage('${id}')" title="クリックで削除">`
      : `<span style="opacity:.4;font-size:.75rem;">画像なし</span>`;

    html += `<div style="border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:12px;margin-bottom:12px;">
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap;">
        <input type="text" id="cfg-chest-name-${id}" value="${escDrill(def.name??id)}" style="width:130px;">
        <label style="cursor:pointer;font-size:.8rem;padding:4px 8px;background:rgba(255,255,255,.1);border-radius:4px;">
          📷 画像
          <input type="file" accept="image/*" style="display:none;" onchange="uploadChestImage('${id}',this)">
        </label>
        ${imgPreview}
        <button class="btn-refresh" style="margin-left:auto;background:rgba(255,100,100,.2);" onclick="deleteChestType('${id}')">🗑️ 削除</button>
      </div>
      <table style="font-size:.8rem;border-collapse:collapse;width:100%;">
        <thead><tr style="opacity:.6;">
          <th style="text-align:left;padding:2px 4px;">種類</th>
          <th style="text-align:left;padding:2px 4px;">内容</th>
          <th style="text-align:left;padding:2px 4px;">重み</th>
          <th></th>
        </tr></thead>
        <tbody>${lootRows || '<tr><td colspan="4" style="opacity:.4;padding:4px;">エントリなし</td></tr>'}</tbody>
      </table>
      <button class="btn-refresh" style="margin-top:8px;" onclick="addChestLoot('${id}')">+ 追加</button>
    </div>`;
  }

  html += `<button class="btn-refresh" onclick="addChestType()">+ 宝箱を追加</button>`;

  // Section 2: placement table
  html += `<div style="margin-top:24px;">
    <div style="font-weight:600;margin-bottom:6px;">宝箱の配置（10Mごと）</div>
    <div class="info-box" style="margin-bottom:10px;">各深度スロットに生成する宝箱の個数を設定します。</div>`;

  if (typeIds.length === 0) {
    html += `<p style="opacity:.5;font-size:.85rem;">先に宝箱の種類を追加してください。</p>`;
  } else {
    html += `<table style="font-size:.78rem;border-collapse:collapse;">
      <thead><tr>
        <th style="padding:3px 10px;text-align:left;">深度</th>
        ${typeIds.map(id => `<th style="padding:3px 10px;">${escDrill(types[id]?.name??id)}</th>`).join('')}
      </tr></thead>
      <tbody>`;
    for (let s = 0; s < 30; s++) {
      const rowSlot = slots[s] ?? {};
      html += `<tr style="${s%2===0?'background:rgba(255,255,255,.03)':''}">
        <td style="padding:2px 10px;">${s*10}~${s*10+9}m</td>
        ${typeIds.map(id => `<td style="padding:2px 6px;text-align:center;">
          <input type="number" id="cfg-slot-${s}-${id}" value="${rowSlot[id]??0}" min="0" style="width:42px;">
        </td>`).join('')}
      </tr>`;
    }
    html += `</tbody></table>`;
  }

  html += `</div>`;
  el.innerHTML = html;
}

function collectTreasureConfig() {
  const gc = gameConfig;
  if (!gc.treasureTypes) gc.treasureTypes = {};

  for (const [id, def] of Object.entries(gc.treasureTypes)) {
    const nameEl = document.getElementById(`cfg-chest-name-${id}`);
    if (nameEl) def.name = nameEl.value || def.name;

    (def.loot ?? []).forEach((l, li) => {
      const typeEl   = document.getElementById(`cfg-chest-loot-type-${id}-${li}`);
      const weightEl = document.getElementById(`cfg-chest-loot-weight-${id}-${li}`);
      if (typeEl)   l.type   = typeEl.value;
      if (weightEl) l.weight = parseFloat(weightEl.value) || 1;
      if (l.type === 'gold') {
        const minEl = document.getElementById(`cfg-chest-loot-min-${id}-${li}`);
        const maxEl = document.getElementById(`cfg-chest-loot-max-${id}-${li}`);
        if (minEl) l.min = parseInt(minEl.value) || 0;
        if (maxEl) l.max = parseInt(maxEl.value) || 0;
      } else {
        const itemEl = document.getElementById(`cfg-chest-loot-item-${id}-${li}`);
        const qtyEl  = document.getElementById(`cfg-chest-loot-qty-${id}-${li}`);
        if (itemEl) l.itemId = itemEl.value;
        if (qtyEl)  l.qty    = parseInt(qtyEl.value) || 1;
      }
    });
  }

  if (!gc.treasureSlots || gc.treasureSlots.length < 30)
    gc.treasureSlots = Array.from({length: 30}, () => ({}));

  const typeIds = Object.keys(gc.treasureTypes);
  for (let s = 0; s < 30; s++) {
    const slot = {};
    for (const id of typeIds) {
      const el = document.getElementById(`cfg-slot-${s}-${id}`);
      if (el) slot[id] = parseInt(el.value) || 0;
    }
    gc.treasureSlots[s] = slot;
  }
}

function addChestType() {
  collectTreasureConfig();
  const id = 'chest_' + Date.now();
  if (!gameConfig.treasureTypes) gameConfig.treasureTypes = {};
  gameConfig.treasureTypes[id] = {
    name: '新しい宝箱',
    imageUrl: null,
    loot: [{ type: 'gold', min: 10, max: 100, weight: 50 }],
  };
  renderTreasureTab();
}

function deleteChestType(id) {
  collectTreasureConfig();
  if (!confirm(`「${gameConfig.treasureTypes?.[id]?.name || id}」を削除しますか？`)) return;
  delete gameConfig.treasureTypes[id];
  if (gameConfig.treasureSlots) gameConfig.treasureSlots.forEach(slot => delete slot[id]);
  renderTreasureTab();
}

function addChestLoot(id) {
  collectTreasureConfig();
  const def = gameConfig.treasureTypes?.[id];
  if (!def) return;
  if (!def.loot) def.loot = [];
  def.loot.push({ type: 'gold', min: 10, max: 100, weight: 10 });
  renderTreasureTab();
}

function delChestLoot(id, li) {
  collectTreasureConfig();
  const def = gameConfig.treasureTypes?.[id];
  if (!def?.loot) return;
  def.loot.splice(li, 1);
  renderTreasureTab();
}

function onChestLootTypeChange(id, li) {
  collectTreasureConfig();
  const l = gameConfig.treasureTypes?.[id]?.loot?.[li];
  if (!l) return;
  const selEl = document.getElementById(`cfg-chest-loot-type-${id}-${li}`);
  if (selEl) l.type = selEl.value;
  if (l.type === 'item' && !l.itemId) { l.itemId = 'stone'; l.qty = 1; delete l.min; delete l.max; }
  if (l.type === 'gold' && l.min == null) { l.min = 10; l.max = 100; delete l.itemId; delete l.qty; }
  renderTreasureTab();
}

async function uploadChestImage(id, input) {
  const file = input.files?.[0];
  if (!file) return;
  try {
    collectTreasureConfig();
    const url = await uploadDrillImage('chests/' + id, file);
    if (gameConfig.treasureTypes?.[id]) gameConfig.treasureTypes[id].imageUrl = url;
    renderTreasureTab();
  } catch (e) {
    alert('アップロードエラー: ' + e.message);
  }
}

function clearChestImage(id) {
  if (gameConfig.treasureTypes?.[id]) gameConfig.treasureTypes[id].imageUrl = null;
  renderTreasureTab();
}

// ============================================================
// 画像アップロード（Supabase Storage: drill-images バケット）
// ============================================================

async function uploadDrillImage(path, file) {
  const ext  = file.name.split('.').pop();
  const name = path + '_' + Date.now() + '.' + ext;
  const { data, error } = await supabaseClient.storage
    .from('drill-images')
    .upload(name, file, { upsert: true });
  if (error) throw error;
  const { data: { publicUrl } } = supabaseClient.storage
    .from('drill-images')
    .getPublicUrl(data.path);
  return publicUrl;
}

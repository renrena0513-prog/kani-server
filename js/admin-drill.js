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
    const { error } = await supabaseClient.rpc('admin_force_map_regen', { target_date: date });
    if (error) throw error;
    if (msg) { msg.textContent = '✅ 再生成完了'; setTimeout(() => msg.textContent = '', 5000); }
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
  sellPrices: { dirt: 1, stone: 3, copper: 15, iron: 50, silver: 200, gold: 500 },
  permits: {
    permit_100: { name: '100m入坑許可証', yMin: 100 },
    permit_200: { name: '200m入坑許可証', yMin: 200 },
  },
  baseHp: 1000,
  combatStats: {
    attack: 50, defense: 50, critRate: 10, critDmg: 1.5, maxAp: 100, apRegen: 10, digPower: 0,
  },
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
      defense: 0,
      layerWeights: Array.from({length: 30}, (_, i) => i < 10 ? 100 : 0),
      actions: [
        { name: 'たいあたり',          damage: 30, weight: 1 },
        { name: 'ぷるぷるふるえている', damage: 0,  weight: 1 },
        { name: 'からみつく',          damage: 50, weight: 1 },
      ],
      memoryDropRate: 0,
      normalDrops: [],
      fixedDrops: [],
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
    fist_d: {
      name: '拳で', desc: '基本攻撃', icon: '👊', imageUrl: null,
      rarity: null, material: null, weapon_type: null, target: 'enemy_single',
      ap_cost: 10, base_attack: 0, mult_min: 0.9, mult_max: 1.0,
      crit_rate_bonus: 0, crit_dmg_bonus: 0, hit_count: 1, heal: 0, special_id: null,
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
  items: {
    return_stone: { name: '帰還石',     weight: 10, cost: null, effectText: '地上に帰還する',    imageUrl: null },
    potion:       { name: 'ポーション', weight: 10, cost: 100,  effectText: '体力を100回復する', imageUrl: null },
  },
  alchemy: {
    weaponWeights: {
      dirt:   { sword:16, dagger:16, axe:16, hammer:16, boomerang:8, spear:10, staff:8,  scythe:10 },
      stone:  { sword:20, dagger:12, axe:20, hammer:20, boomerang:4, spear:10, staff:4,  scythe:10 },
      copper: { sword:16, dagger:16, axe:16, hammer:16, boomerang:8, spear:10, staff:8,  scythe:10 },
      iron:   { sword:24, dagger:8,  axe:16, hammer:24, boomerang:4, spear:10, staff:4,  scythe:10 },
      silver: { sword:16, dagger:16, axe:12, hammer:12, boomerang:8, spear:10, staff:16, scythe:10 },
      gold:   { sword:12, dagger:12, axe:12, hammer:12, boomerang:12,spear:10, staff:20, scythe:10 },
    },
    rarityWeights: { d:50, c:30, b:15, a:4, s:1 },
  },
  memoryRankWeights: { d:50, c:30, b:15, a:4, s:1 }, // メモリドロップ時のランク抽選比率（全モンスター共通）
  memories: {},
};

// ドロップ選択肢（お金 + 素材 + アイテム）の共通値
const DROP_ITEM_IDS   = ['money', 'dirt','stone','copper','iron','silver','gold'];
const DROP_ITEM_NAMES = { money:'お金', dirt:'土', stone:'石', copper:'銅', iron:'鉄', silver:'銀', gold:'金' };

// メモリで強化できるステータス
const MEMORY_STATS = [
  ['hp',        '体力'],
  ['maxAp',     '最大AP'],
  ['apRegen',   'AP自然回復'],
  ['attack',    '力'],
  ['defense',   '防御力'],
  ['critRate',  'クリ率'],
  ['critDmg',   'クリダメ'],
  ['digPower',  '発掘力'],
  ['maxWeight', '最大重量'],
];

// ショップ初期状態（未設定時のデフォルト。drill/game.js の SHOP_ENTRIES 初期値と一致させること）
const DEFAULT_SHOP_ENTRIES = [
  { type: 'drill', refId: 'apprentice', cost: 100 },
  { type: 'drill', refId: 'journeyman', cost: 2000 },
  { type: 'drill', refId: 'veteran',    cost: 10000 },
];

let gameConfig = null;

const MAT_IDS        = ['dirt','stone','copper','iron','silver','gold','treasure'];
const MAT_NAMES      = { dirt:'土', stone:'石', copper:'銅', iron:'鉄', silver:'銀', gold:'金', treasure:'宝箱' };
const DRILL_IDS      = ['beginner','apprentice','stone_drill','copper_drill','journeyman',
                        'iron_drill','mass_drill','veteran','silver_drill','allpurpose'];
const RECIPE_MAT_IDS = ['dirt','stone','copper','iron','silver','gold'];

function cfgNum(id, val, opts = '') {
  return `<input class="cfg-input" type="number" id="${id}" value="${escDrill(String(val ?? ''))}" ${opts}>`;
}

function cfgText(id, val, opts = '') {
  return `<input class="cfg-input" type="text" id="${id}" value="${escDrill(String(val ?? ''))}" ${opts}>`;
}

// レシピ行を追加（ドリルのクラフトレシピ用）
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
  if (!gameConfig.combatStats)    gameConfig.combatStats    = JSON.parse(JSON.stringify(DEFAULT_GAME_CONFIG.combatStats));
  for (const [k, v] of Object.entries(DEFAULT_GAME_CONFIG.combatStats)) {
    if (gameConfig.combatStats[k] == null) gameConfig.combatStats[k] = v;
  }
  if (!gameConfig.monsters)       gameConfig.monsters       = JSON.parse(JSON.stringify(DEFAULT_GAME_CONFIG.monsters));
  for (const mon of Object.values(gameConfig.monsters)) {
    if (mon.defense == null) mon.defense = 0;
  }
  if (!gameConfig.cards)         gameConfig.cards          = JSON.parse(JSON.stringify(DEFAULT_GAME_CONFIG.cards));
  // drill_attack カードは廃止（ショップでのカード販売機能も廃止）。旧データに残っていれば除去
  delete gameConfig.cards.drill_attack;
  // 初期装備の「拳」カードは今まで設定に含まれておらず編集できなかったため補完
  if (!gameConfig.cards.fist_d) gameConfig.cards.fist_d = JSON.parse(JSON.stringify(DEFAULT_GAME_CONFIG.cards.fist_d));
  if (!gameConfig.items)         gameConfig.items          = JSON.parse(JSON.stringify(DEFAULT_GAME_CONFIG.items));
  if (!gameConfig.shopEntries)   gameConfig.shopEntries    = JSON.parse(JSON.stringify(DEFAULT_SHOP_ENTRIES));
  // カード販売は廃止。旧データに 'card' タイプのエントリが残っていれば除去
  gameConfig.shopEntries = gameConfig.shopEntries.filter(e => e && e.type === 'drill');
  if (!gameConfig.treasureTypes) gameConfig.treasureTypes  = JSON.parse(JSON.stringify(DEFAULT_GAME_CONFIG.treasureTypes));
  if (!gameConfig.treasureSlots || gameConfig.treasureSlots.length < 30)
    gameConfig.treasureSlots = JSON.parse(JSON.stringify(DEFAULT_GAME_CONFIG.treasureSlots));
  if (!gameConfig.encounter) gameConfig.encounter = JSON.parse(JSON.stringify(DEFAULT_GAME_CONFIG.encounter));
  if (!gameConfig.alchemy)   gameConfig.alchemy   = JSON.parse(JSON.stringify(DEFAULT_GAME_CONFIG.alchemy));
  if (!gameConfig.memories)  gameConfig.memories  = JSON.parse(JSON.stringify(DEFAULT_GAME_CONFIG.memories));
  if (!gameConfig.memoryRankWeights) gameConfig.memoryRankWeights = JSON.parse(JSON.stringify(DEFAULT_GAME_CONFIG.memoryRankWeights));
  // 旧形式（単一ステータスのみ強化）のメモリを、全ステータス同時強化の新形式へマイグレーション
  for (const def of Object.values(gameConfig.memories)) {
    if (!def.bonuses) {
      def.bonuses = Object.fromEntries(MEMORY_STATS.map(([statKey]) => [statKey, 0]));
      if (def.stat && def.amount != null) def.bonuses[def.stat] = def.amount;
    }
    delete def.stat;
    delete def.amount;
  }
  // モンスターに新しいドロップ設定項目がなければ補完
  if (gameConfig.monsters) {
    for (const mon of Object.values(gameConfig.monsters)) {
      if (mon.memoryDropRate == null) mon.memoryDropRate = 0;
      if (!Array.isArray(mon.normalDrops)) mon.normalDrops = [];
      if (!Array.isArray(mon.fixedDrops))  mon.fixedDrops  = [];
    }
  }
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
  // drill_cards DB をカードの正データとしてマージ（imageUrl/descのみgameConfig.cards側の値を維持）
  try {
    const { data: dbCards } = await supabaseClient.from('drill_cards').select('*');
    if (dbCards) {
      if (!gameConfig.cards) gameConfig.cards = {};
      for (const r of dbCards) {
        const id = r.id === 'fist' ? 'fist_d' : r.id;
        const ex = gameConfig.cards[id] ?? {};
        gameConfig.cards[id] = {
          ...ex,
          no:              r.no,
          name:            r.name,
          rarity:          r.rarity,
          material:        r.material,
          weapon_type:     r.weapon_type,
          icon:            r.icon,
          ap_cost:         r.ap_cost,
          base_attack:     r.base_attack,
          mult_min:        r.mult_min,
          mult_max:        r.mult_max,
          crit_rate_bonus: r.crit_rate_bonus,
          crit_dmg_bonus:  r.crit_dmg_bonus,
          hit_count:       r.hit_count,
          target:          r.target,
          heal_power:      r.heal_power,
          special_id:      r.special_id,
        };
      }
    }
  } catch { /* DBマージ失敗は無視 */ }
  renderConfigEditor();
}

function renderConfigEditor() {
  renderMatsTab();
  renderDrillsTab();
  renderCraftTab();
  renderLayersTab();
  renderShopTab();
  renderSellTab();
  renderPermitsTab();
  renderEventsTab();
  renderMonstersTab();
  renderCardsTab();
  renderItemsTab();
  renderTreasureTab();
  renderAlchemyTab();
  renderMemoriesTab();
  // 最初のタブをアクティブに
  const firstBtn = document.querySelector('.cfg-tab-btn');
  if (firstBtn) showCfgTab('blocks', firstBtn);
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

  document.getElementById('cfg-tab-drills').innerHTML = `
    <div class="info-box" style="margin-bottom:12px;">
      耐久・購入Gは空欄=なし（∞ / ショップ非売品）。クラフトのレシピは「クラフトレシピ」タブで設定します。
    </div>
    <div style="overflow-x:auto;">
    <table class="drill-table">
      <tr><th>ドリル</th><th>威力</th><th>最大耐久</th><th>購入G</th></tr>
      ${statsRows}
    </table></div>`;
}

function renderCraftTab() {
  const cfg = gameConfig.drills ?? {};

  const matOptsFor = (selected) => RECIPE_MAT_IDS.map(id =>
    `<option value="${id}" ${id === selected ? 'selected' : ''}>${MAT_NAMES[id]}</option>`
  ).join('');

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

  document.getElementById('cfg-tab-craft').innerHTML = `
    <div class="info-box" style="margin-bottom:14px;">
      🔨 ドリルのクラフトに必要な素材レシピです（空=クラフト不可）。
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
  const el = document.getElementById('cfg-tab-shop');
  if (!el) return;
  if (!gameConfig.shopEntries) gameConfig.shopEntries = JSON.parse(JSON.stringify(DEFAULT_SHOP_ENTRIES));

  const drills = gameConfig.drills ?? DEFAULT_GAME_CONFIG.drills;
  const items  = gameConfig.items  ?? {};
  const entryMap = new Map(gameConfig.shopEntries.map(e => [`${e.type}:${e.refId}`, e.cost]));

  const drillRows = Object.entries(drills)
    .filter(([id]) => id !== 'beginner')
    .map(([id, def]) => {
      const key = `drill:${id}`;
      const checked = entryMap.has(key);
      const cost = entryMap.get(key) ?? (def.cost > 0 ? def.cost : 100);
      return `<tr>
        <td><label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
          <input type="checkbox" class="shop-chk" data-type="drill" data-id="${id}" ${checked ? 'checked' : ''}>
          ${escDrill(def.name ?? id)}
        </label></td>
        <td>${cfgNum(`cfg-shopcost-drill-${id}`, cost, 'min="1" style="width:100px;"')}</td>
      </tr>`;
    }).join('');

  const itemIds = Object.keys(items);
  const itemRows = itemIds.map(id => {
    const def = items[id] ?? {};
    const checked = (def.cost ?? 0) > 0;
    const cost = def.cost > 0 ? def.cost : 100;
    return `<tr>
      <td><label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
        <input type="checkbox" class="shop-item-chk" data-id="${id}" ${checked ? 'checked' : ''}>
        ${escDrill(def.name ?? id)}
      </label></td>
      <td>${cfgNum(`cfg-shopcost-item-${id}`, cost, 'min="1" style="width:100px;"')}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="info-box" style="margin-bottom:16px;">
      チェックを入れたものがショップに並びます（未チェックのものは非表示）。価格（G）もここで設定できます。
    </div>
    <div style="margin-bottom:24px;">
      <div style="font-size:.9rem;font-weight:700;margin-bottom:8px;">⛏️ ドリル</div>
      <table class="drill-table" style="max-width:420px;">
        <tr><th>販売する</th><th>価格（G）</th></tr>
        ${drillRows || '<tr><td colspan="2" class="text-muted">ドリルが未設定です</td></tr>'}
      </table>
    </div>
    <div>
      <div style="font-size:.9rem;font-weight:700;margin-bottom:8px;">💊 アイテム</div>
      <table class="drill-table" style="max-width:420px;">
        <tr><th>販売する</th><th>価格（G）</th></tr>
        ${itemRows || '<tr><td colspan="2" class="text-muted">「アイテム」タブでアイテムを追加してください</td></tr>'}
      </table>
    </div>`;
}

function collectShopConfig() {
  const entries = [];
  document.querySelectorAll('#cfg-tab-shop .shop-chk').forEach(chk => {
    if (!chk.checked) return;
    const type = chk.dataset.type;
    const id   = chk.dataset.id;
    const costEl = document.getElementById(`cfg-shopcost-${type}-${id}`);
    const cost = parseInt(costEl?.value, 10) || 1;
    entries.push({ type, refId: id, cost });
  });
  gameConfig.shopEntries = entries;

  // アイテムの販売価格は items[id].cost に直接反映（0 = 非売品）
  if (!gameConfig.items) gameConfig.items = {};
  document.querySelectorAll('#cfg-tab-shop .shop-item-chk').forEach(chk => {
    const id = chk.dataset.id;
    if (!gameConfig.items[id]) return;
    const costEl = document.getElementById(`cfg-shopcost-item-${id}`);
    gameConfig.items[id].cost = chk.checked ? (parseInt(costEl?.value, 10) || 1) : 0;
  });
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

  const rows = Object.entries(DEFAULT_GAME_CONFIG.permits).map(([id, def]) => {
    const p = { ...def, ...(cfg[id] ?? {}) };
    return `<tr>
      <td>${cfgText('cfg-permit-name-' + id, p.name ?? def.name, 'style="width:200px;"')}</td>
      <td>${p.yMin}m以深での採掘に必要</td>
    </tr>`;
  }).join('');

  document.getElementById('cfg-tab-permits').innerHTML = `
    <div class="info-box" style="margin-bottom:14px;">
      永続アイテム（プレイヤーの「アイテム」画面の「🔑 永続」タブに所持状況が表示されます）。<br>
      ショップ購入・クラフトはできません。入手方法は未実装です（将来、宝箱やモンスターのドロップとして追加予定）。
    </div>
    <table class="drill-table" style="max-width:420px;">
      <tr><th>許可証</th><th>必要な深度</th></tr>
      ${rows}
    </table>`;
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

  document.getElementById('cfg-tab-events-inner').innerHTML = html;
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
    const nameEl = document.getElementById('cfg-permit-name-' + id);
    if (nameEl) gc.permits[id].name = nameEl.value || gc.permits[id].name;
  });

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

  // MONSTERS / CARDS / ITEMS / TREASURE / SHOP
  collectCombatStatsConfig();
  collectMonstersConfig();
  collectCardsConfig();
  collectItemsConfig();
  collectTreasureConfig();
  collectAlchemyConfig();
  collectShopConfig();
  collectMemoriesConfig();
}

async function saveGameConfig() {
  const msg = document.getElementById('config-save-msg');
  collectConfig();
  try {
    const { error } = await supabaseClient
      .from('drill_page_settings')
      .upsert({ setting_key: 'game_config', setting_value: JSON.stringify(gameConfig) });
    if (error) throw error;

    // drill_cards テーブルにも stats を同期
    const cardEntries = Object.entries(gameConfig.cards ?? {});
    if (cardEntries.length > 0) {
      const drillRows = cardEntries.map(([id, c], i) => ({
        id,
        no:              c.no ?? (i + 1),
        name:            c.name ?? id,
        rarity:          (c.rarity ?? 'd').toLowerCase(),
        material:        c.material ?? null,
        weapon_type:     c.weapon_type || '剣',
        icon:            c.icon ?? null,
        ap_cost:         c.ap_cost ?? 1,
        base_attack:     c.base_attack ?? 0,
        mult_min:        c.mult_min ?? 1.0,
        mult_max:        c.mult_max ?? 1.0,
        crit_rate_bonus: c.crit_rate_bonus ?? 0,
        crit_dmg_bonus:  c.crit_dmg_bonus ?? 0,
        hit_count:       c.hit_count ?? 1,
        target:          c.target ?? 'enemy_single',
        heal_power:      c.heal_power ?? c.heal ?? 0,
        special_id:      c.special_id ?? null,
      }));
      const { error: dbErr } = await supabaseClient.from('drill_cards').upsert(drillRows, { onConflict: 'id' });
      if (dbErr) throw dbErr;
    }

    if (msg) { msg.textContent = '✅ 保存しました（ゲームリロードで反映）'; setTimeout(() => msg.textContent = '', 4000); }
  } catch (e) {
    if (msg) msg.textContent = '❌ ' + e.message;
  }
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
  const baseHp = gameConfig.baseHp ?? DEFAULT_GAME_CONFIG.baseHp;
  const cs = { ...DEFAULT_GAME_CONFIG.combatStats, ...(gameConfig.combatStats ?? {}) };

  let html = `
    <div class="cfg-subhead">❤️ プレイヤー基礎ステータス</div>
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:24px;align-items:flex-end;">
      <label style="font-size:.82rem;">HP<br>${cfgNum('cfg-basehp', baseHp, 'min="1" style="width:90px;"')}</label>
      <label style="font-size:.82rem;">AP<br>${cfgNum('cfg-cs-maxAp', cs.maxAp, 'min="0" style="width:80px;"')}</label>
      <label style="font-size:.82rem;">AP自然回復<br>${cfgNum('cfg-cs-apRegen', cs.apRegen, 'min="0" style="width:80px;"')}</label>
      <label style="font-size:.82rem;">力<br>${cfgNum('cfg-cs-attack', cs.attack, 'min="0" style="width:80px;"')}</label>
      <label style="font-size:.82rem;">防御力<br>${cfgNum('cfg-cs-defense', cs.defense, 'min="0" style="width:80px;"')}</label>
      <label style="font-size:.82rem;">クリティカル率(%)<br>${cfgNum('cfg-cs-critRate', cs.critRate, 'min="0" max="100" step="0.1" style="width:80px;"')}</label>
      <label style="font-size:.82rem;">クリティカルダメージ(倍率)<br>${cfgNum('cfg-cs-critDmg', cs.critDmg, 'min="0" step="0.01" style="width:80px;"')}</label>
      <label style="font-size:.82rem;">発掘力<br>${cfgNum('cfg-cs-digPower', cs.digPower, 'min="0" style="width:80px;"')}</label>
    </div>
    <div class="cfg-subhead">👾 モンスター</div>
    <div class="info-box" style="margin-bottom:14px;">
      各モンスターの名前・体力・防御力・行動・出現率を設定します。出現率の重みは0=出現しない。
    </div>`;

  for (const [id, mon] of Object.entries(monsters)) {
    const acts = mon.actions ?? [];
    const normalDrops = mon.normalDrops ?? [];
    const fixedDrops  = mon.fixedDrops  ?? [];

    const imgPreview = mon.imageUrl
      ? `<img src="${escDrill(mon.imageUrl)}" style="width:48px;height:48px;object-fit:contain;border-radius:6px;background:rgba(255,255,255,.08);">`
      : `<div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.08);border-radius:6px;font-size:2rem;">${escDrill(mon.icon || '👾')}</div>`;

    const actionRows = acts.map((act, ai) => `<tr>
      <td><input class="cfg-input mon-act-name-${id}" type="text" value="${escDrill(act.name)}" style="width:100%;min-width:110px;"></td>
      <td><input class="cfg-input mon-act-dmg-${id}"  type="number" value="${act.damage}" min="0" style="width:68px;"></td>
      <td><input class="cfg-input mon-act-wt-${id}"   type="number" value="${act.weight}" min="0" step="0.1" style="width:58px;"></td>
      <td><button class="inv-del-btn" onclick="delMonsterAction('${id}',${ai})">✕</button></td>
    </tr>`).join('');

    const dropItemOptions = (selected) => DROP_ITEM_IDS.map(v =>
      `<option value="${v}"${selected===v?' selected':''}>${DROP_ITEM_NAMES[v]}</option>`).join('');

    const normalDropRows = normalDrops.map((d, di) => `<tr>
      <td><select class="cfg-input mon-ndrop-item-${id}" style="width:100%;min-width:90px;">${dropItemOptions(d.itemId)}</select></td>
      <td><input class="cfg-input mon-ndrop-qty-${id}"    type="number" value="${d.qty ?? 1}" min="1" style="width:64px;"></td>
      <td><input class="cfg-input mon-ndrop-wt-${id}"     type="number" value="${d.weight ?? 1}" min="0" style="width:64px;"></td>
      <td><button class="inv-del-btn" onclick="delMonsterNormalDrop('${id}',${di})">✕</button></td>
    </tr>`).join('');

    const fixedDropRows = fixedDrops.map((d, di) => `<tr>
      <td><select class="cfg-input mon-fdrop-item-${id}" style="width:100%;min-width:90px;">${dropItemOptions(d.itemId)}</select></td>
      <td><input class="cfg-input mon-fdrop-qty-${id}"    type="number" value="${d.qty ?? 1}" min="1" style="width:64px;"></td>
      <td><button class="inv-del-btn" onclick="delMonsterFixedDrop('${id}',${di})">✕</button></td>
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
        <label style="font-size:.82rem;">防御力<br>
          <input class="cfg-input mon-def-${id}" type="number" value="${mon.defense ?? 0}" min="0" style="width:80px;">
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

      <div style="font-size:.82rem;font-weight:700;margin:16px 0 8px;opacity:.7;">🧠 メモリドロップ率(%)</div>
      <input class="cfg-input mon-memrate-${id}" type="number" value="${mon.memoryDropRate ?? 0}" min="0" max="100" style="width:80px;">
      <div style="font-size:.72rem;opacity:.5;margin-top:4px;">このモンスター専用のメモリをメモリタブで作成し「ドロップ元モンスター」にこのモンスターを選ぶと、討伐時にランク（D〜S。比率はメモリタブの共通設定）を自動抽選してドロップします。</div>

      <div style="font-size:.82rem;font-weight:700;margin:16px 0 8px;opacity:.7;">📦 ノーマルドロップ（重み付き抽選で1つ）</div>
      <table class="drill-table" style="margin-bottom:8px;">
        <tr><th>アイテム</th><th>個数</th><th>重み</th><th></th></tr>
        ${normalDropRows || '<tr><td colspan="4" style="opacity:.4;font-size:.8rem;padding:6px;">なし</td></tr>'}
      </table>
      <button class="inv-save-btn" style="padding:2px 10px;font-size:.75rem;" onclick="addMonsterNormalDrop('${id}')">＋ ドロップ追加</button>

      <div style="font-size:.82rem;font-weight:700;margin:16px 0 8px;opacity:.7;">🎁 固定ドロップ（毎回100%）</div>
      <table class="drill-table" style="margin-bottom:8px;">
        <tr><th>アイテム</th><th>個数</th><th></th></tr>
        ${fixedDropRows || '<tr><td colspan="3" style="opacity:.4;font-size:.8rem;padding:6px;">なし</td></tr>'}
      </table>
      <button class="inv-save-btn" style="padding:2px 10px;font-size:.75rem;" onclick="addMonsterFixedDrop('${id}')">＋ ドロップ追加</button>
    </div>`;
  }

  html += `<button class="btn-refresh" onclick="addMonster()">＋ モンスター追加</button>`;
  document.getElementById('cfg-tab-monsters').innerHTML = html;
}

function collectCombatStatsConfig() {
  const gc = gameConfig;
  const bhEl = document.getElementById('cfg-basehp');
  if (bhEl) gc.baseHp = parseInt(bhEl.value) || 1000;

  if (!gc.combatStats) gc.combatStats = { ...DEFAULT_GAME_CONFIG.combatStats };
  const cs = gc.combatStats;
  const maxApEl    = document.getElementById('cfg-cs-maxAp');
  const apRegenEl  = document.getElementById('cfg-cs-apRegen');
  const attackEl   = document.getElementById('cfg-cs-attack');
  const defenseEl  = document.getElementById('cfg-cs-defense');
  const critRateEl = document.getElementById('cfg-cs-critRate');
  const critDmgEl  = document.getElementById('cfg-cs-critDmg');
  const digPowerEl = document.getElementById('cfg-cs-digPower');
  if (maxApEl)    cs.maxAp    = parseInt(maxApEl.value) || 0;
  if (apRegenEl)  cs.apRegen  = parseInt(apRegenEl.value) || 0;
  if (attackEl)   cs.attack   = parseInt(attackEl.value) || 0;
  if (defenseEl)  cs.defense  = parseInt(defenseEl.value) || 0;
  if (critRateEl) cs.critRate = parseFloat(critRateEl.value) || 0;
  if (critDmgEl)  cs.critDmg  = parseFloat(critDmgEl.value) || 0;
  if (digPowerEl) cs.digPower = parseInt(digPowerEl.value) || 0;
}

function collectMonstersConfig() {
  const monsters = gameConfig.monsters ?? {};
  for (const [id, mon] of Object.entries(monsters)) {
    const nameEl = document.querySelector(`.mon-name-${id}`);
    const hpEl   = document.querySelector(`.mon-hp-${id}`);
    const defEl  = document.querySelector(`.mon-def-${id}`);
    const iconEl = document.querySelector(`.mon-icon-${id}`);
    if (nameEl) mon.name    = nameEl.value;
    if (hpEl)   mon.maxHp   = parseInt(hpEl.value) || 100;
    if (defEl)  mon.defense = parseInt(defEl.value) || 0;
    if (iconEl) mon.icon    = iconEl.value;

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

    const memRateEl = document.querySelector(`.mon-memrate-${id}`);
    if (memRateEl) mon.memoryDropRate = Math.max(0, Math.min(100, parseInt(memRateEl.value) || 0));

    const ndItemEls = document.querySelectorAll(`.mon-ndrop-item-${id}`);
    const ndQtyEls  = document.querySelectorAll(`.mon-ndrop-qty-${id}`);
    const ndWtEls   = document.querySelectorAll(`.mon-ndrop-wt-${id}`);
    mon.normalDrops = Array.from(ndItemEls).map((el, i) => ({
      itemId: el.value,
      qty:    parseInt(ndQtyEls[i]?.value) || 1,
      weight: parseFloat(ndWtEls[i]?.value) || 0,
    }));

    const fdItemEls = document.querySelectorAll(`.mon-fdrop-item-${id}`);
    const fdQtyEls  = document.querySelectorAll(`.mon-fdrop-qty-${id}`);
    mon.fixedDrops = Array.from(fdItemEls).map((el, i) => ({
      itemId: el.value,
      qty:    parseInt(fdQtyEls[i]?.value) || 1,
    }));
  }
  gameConfig.monsters = monsters;
}

function addMonster() {
  collectCombatStatsConfig();
  collectMonstersConfig();
  const id = 'monster_' + Date.now();
  if (!gameConfig.monsters) gameConfig.monsters = {};
  gameConfig.monsters[id] = {
    name: '新モンスター', icon: '👾', imageUrl: null,
    maxHp: 100, defense: 0, layerWeights: Array.from({length: 30}, () => 0),
    actions: [{ name: '攻撃', damage: 10, weight: 1 }],
    memoryDropRate: 0, normalDrops: [], fixedDrops: [],
  };
  renderMonstersTab();
}

function addMonsterNormalDrop(id) {
  collectCombatStatsConfig();
  collectMonstersConfig();
  if (!gameConfig.monsters?.[id]) return;
  if (!gameConfig.monsters[id].normalDrops) gameConfig.monsters[id].normalDrops = [];
  gameConfig.monsters[id].normalDrops.push({ itemId: 'money', qty: 1, weight: 1 });
  renderMonstersTab();
}

function delMonsterNormalDrop(id, idx) {
  collectCombatStatsConfig();
  collectMonstersConfig();
  if (!gameConfig.monsters?.[id]) return;
  gameConfig.monsters[id].normalDrops.splice(idx, 1);
  renderMonstersTab();
}

function addMonsterFixedDrop(id) {
  collectCombatStatsConfig();
  collectMonstersConfig();
  if (!gameConfig.monsters?.[id]) return;
  if (!gameConfig.monsters[id].fixedDrops) gameConfig.monsters[id].fixedDrops = [];
  gameConfig.monsters[id].fixedDrops.push({ itemId: 'money', qty: 1 });
  renderMonstersTab();
}

function delMonsterFixedDrop(id, idx) {
  collectCombatStatsConfig();
  collectMonstersConfig();
  if (!gameConfig.monsters?.[id]) return;
  gameConfig.monsters[id].fixedDrops.splice(idx, 1);
  renderMonstersTab();
}

function deleteMonster(id) {
  collectCombatStatsConfig();
  collectMonstersConfig();
  if (!confirm(`「${gameConfig.monsters?.[id]?.name || id}」を削除しますか？`)) return;
  delete gameConfig.monsters[id];
  renderMonstersTab();
}

function addMonsterAction(id) {
  collectCombatStatsConfig();
  collectMonstersConfig();
  if (!gameConfig.monsters?.[id]) return;
  gameConfig.monsters[id].actions.push({ name: '行動名', damage: 0, weight: 1 });
  renderMonstersTab();
}

function delMonsterAction(id, idx) {
  collectCombatStatsConfig();
  collectMonstersConfig();
  if (!gameConfig.monsters?.[id]) return;
  gameConfig.monsters[id].actions.splice(idx, 1);
  renderMonstersTab();
}

async function uploadMonsterImage(id, input) {
  const file = input.files?.[0];
  if (!file) return;
  try {
    collectCombatStatsConfig();
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

// CSVはdrill_cardsテーブルの列に合わせる（heal → heal_power、no/material追加）
const CARD_CSV_COLS = ['no','id','name','rarity','material','weapon_type','icon','ap_cost','base_attack','mult_min','mult_max','crit_rate_bonus','crit_dmg_bonus','hit_count','target','heal_power','special_id','imageUrl','desc'];
const CARD_MATERIALS    = ['土','石','銅','鉄','銀','金'];
const CARD_WEAPON_TYPES = ['剣','短剣','斧','ハンマー','ブーメラン','槍','杖','鎌'];
const CARD_TARGETS = [
  ['enemy_single', '敵単体'],
  ['enemy_all',    '敵全体'],
  ['enemy_random', '敵ランダム'],
  ['self',         '自分のみ'],
  ['ally_single',  '味方単体（自分含む）'],
  ['ally_all',     '味方全体'],
  ['ally_random',  '味方ランダム'],
  ['all',          '全体'],
  ['all_random',   '全体ランダム'],
];

let cardsFilter = { rank: '', weaponType: '', material: '', search: '' };
let cardsPage = 1;
const CARDS_PAGE_SIZE = 20;
let cardsTestMonsterId = '';
let cardsTestStats = null; // null の間はgameConfig.combatStats（初期ステータス）を使う
const CARD_DEF_COEF = 200; // drill/game.jsのDEF_COEFと合わせる

// 選択中モンスター相手にこのカードを使った場合の平均/期待ダメージ・回復量・AP効率を計算する
// （drill/game.js の computeCardDamage と同じ計算式を、乱数を使わず期待値ベースで算出）
function computeCardTestStats(card, monsterDefense) {
  const stats = cardsTestStats ?? gameConfig.combatStats ?? {};
  const baseAttack  = Number(stats.attack)   || 0;
  const baseCritRate = Number(stats.critRate) || 0;
  const baseCritDmg  = Number(stats.critDmg)  || 1.5;
  const apCost = Number(card.ap_cost) || 0;

  // drill/game.js の isAllyTarget 判定と一致させる（ally_randomは実際はダメージ扱いのため含めない）
  const isHeal = ['self', 'ally_single', 'ally_all'].includes(card.target);
  if (isHeal) {
    const heal = Number(card.heal_power ?? card.heal) || 0;
    return { isHeal: true, heal, apEff: apCost > 0 ? heal / apCost : null };
  }

  const def = Number(monsterDefense) || 0;
  const hitCount = Math.max(1, Number(card.hit_count) || 1);
  const min = Number(card.mult_min ?? 1);
  const max = Number(card.mult_max ?? min);
  const totalAtk = baseAttack + (Number(card.base_attack) || 0);
  const critRate = Math.min(1, Math.max(0, (baseCritRate + (Number(card.crit_rate_bonus) || 0)) / 100));
  const critDmg  = baseCritDmg + (Number(card.crit_dmg_bonus) || 0);
  const defFactor = CARD_DEF_COEF / (CARD_DEF_COEF + def);

  const avgHitDmg = Math.max(1, totalAtk * ((min + max) / 2) * defFactor);
  const avgDmg = avgHitDmg * hitCount;
  const expHitDmg = avgHitDmg * (1 + critRate * (critDmg - 1));
  const expDmg = expHitDmg * hitCount;

  return { isHeal: false, avgDmg, expDmg, apEff: apCost > 0 ? expDmg / apCost : null };
}

function changeCardsTestMonster() {
  collectCardsConfig();
  cardsTestMonsterId = document.getElementById('cards-test-monster')?.value ?? '';
  renderCardsTab();
}

function changeCardsTestStats() {
  collectCardsConfig();
  const base = gameConfig.combatStats ?? {};
  const num = (v, fb) => { const n = parseFloat(v); return Number.isFinite(n) ? n : fb; };
  cardsTestStats = {
    attack:   num(document.getElementById('cards-test-attack')?.value,   base.attack ?? 0),
    critRate: num(document.getElementById('cards-test-critrate')?.value, base.critRate ?? 0),
    critDmg:  num(document.getElementById('cards-test-critdmg')?.value,  base.critDmg ?? 1.5),
  };
  renderCardsTab();
}

function resetCardsTestStats() {
  collectCardsConfig();
  cardsTestStats = null;
  renderCardsTab();
}

function applyCardsFilter() {
  collectCardsConfig();
  cardsFilter.rank       = document.getElementById('cards-filter-rank')?.value ?? '';
  cardsFilter.weaponType = document.getElementById('cards-filter-wtype')?.value ?? '';
  cardsFilter.material   = document.getElementById('cards-filter-material')?.value ?? '';
  cardsFilter.search     = document.getElementById('cards-filter-search')?.value ?? '';
  cardsPage = 1;
  renderCardsTab();
}

function changeCardsPage(delta, totalPages) {
  collectCardsConfig();
  cardsPage = Math.min(Math.max(1, cardsPage + delta), totalPages);
  renderCardsTab();
}

function renderCardsTab() {
  const cards = gameConfig.cards ?? {};
  let html = `
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;align-items:center;">
    <button class="btn-refresh" onclick="exportCardsCsv()" style="background:rgba(80,180,120,.6);">⬇️ CSVエクスポート</button>
    <label class="inv-save-btn" style="cursor:pointer;padding:6px 14px;background:rgba(80,140,220,.5);">
      ⬆️ CSVインポート<input type="file" accept=".csv,text/csv" style="display:none;" onchange="importCardsCsv(this)">
    </label>
    <span style="font-size:.75rem;opacity:.5;">※ インポートするとDBに即時反映されます（画像URL・説明文を変えた場合は「保存」も押してください）</span>
  </div>
  <div class="info-box" style="margin-bottom:14px;">
    プレイヤーのデッキに入るカードの設定です。CSVで一括編集も可能です。
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center;">
    <input id="cards-filter-search" class="cfg-input" type="text" placeholder="🔍 IDまたはカード名で検索"
      value="${escDrill(cardsFilter.search)}" oninput="applyCardsFilter()" style="flex:1 1 180px;">
    <select id="cards-filter-rank" class="cfg-input" onchange="applyCardsFilter()">
      <option value="">ランク: すべて</option>
      ${['d','c','b','a','s'].map(v => `<option value="${v}"${cardsFilter.rank===v?' selected':''}>${v.toUpperCase()}</option>`).join('')}
    </select>
    <select id="cards-filter-wtype" class="cfg-input" onchange="applyCardsFilter()">
      <option value="">武器種: すべて</option>
      ${CARD_WEAPON_TYPES.map(v => `<option value="${v}"${cardsFilter.weaponType===v?' selected':''}>${v}</option>`).join('')}
    </select>
    <select id="cards-filter-material" class="cfg-input" onchange="applyCardsFilter()">
      <option value="">素材: すべて</option>
      ${CARD_MATERIALS.map(v => `<option value="${v}"${cardsFilter.material===v?' selected':''}>${v}</option>`).join('')}
    </select>
  </div>
  <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:14px;padding:10px 14px;background:rgba(255,200,80,.06);border:1px solid rgba(255,200,80,.25);border-radius:8px;">
    <span style="font-size:.82rem;font-weight:700;">🎯 ダメージテスト対象モンスター</span>
    <select id="cards-test-monster" class="cfg-input" onchange="changeCardsTestMonster()">
      <option value="">未選択</option>
      ${Object.entries(gameConfig.monsters ?? {}).map(([mid, m]) =>
        `<option value="${mid}"${cardsTestMonsterId===mid?' selected':''}>${escDrill(m.name || mid)}（防御力${m.defense ?? 0}）</option>`
      ).join('')}
    </select>
    <span style="font-size:.75rem;opacity:.6;margin-left:6px;">プレイヤーステータス（初期値=初期ステータス）</span>
    <label style="display:inline-flex;align-items:center;gap:4px;font-size:.78rem;">
      力<input id="cards-test-attack" class="cfg-input" type="number" style="width:64px;"
        value="${cardsTestStats?.attack ?? gameConfig.combatStats?.attack ?? 0}" onchange="changeCardsTestStats()">
    </label>
    <label style="display:inline-flex;align-items:center;gap:4px;font-size:.78rem;">
      クリ率<input id="cards-test-critrate" class="cfg-input" type="number" style="width:64px;"
        value="${cardsTestStats?.critRate ?? gameConfig.combatStats?.critRate ?? 0}" onchange="changeCardsTestStats()">
    </label>
    <label style="display:inline-flex;align-items:center;gap:4px;font-size:.78rem;">
      クリダメ<input id="cards-test-critdmg" class="cfg-input" type="number" step="0.01" style="width:64px;"
        value="${cardsTestStats?.critDmg ?? gameConfig.combatStats?.critDmg ?? 1.5}" onchange="changeCardsTestStats()">
    </label>
    <button class="btn-refresh" style="font-size:.75rem;padding:4px 10px;" onclick="resetCardsTestStats()">↺ 初期値に戻す</button>
    <span style="font-size:.72rem;opacity:.5;">選択すると各カードに平均/期待ダメージ・AP効率が表示されます</span>
  </div>`;

  const sortedCards = Object.entries(cards).sort((a, b) => (a[1].no ?? Infinity) - (b[1].no ?? Infinity));
  const filteredCards = sortedCards.filter(([id, card]) => {
    if (cardsFilter.rank && (card.rarity ?? '').toLowerCase() !== cardsFilter.rank) return false;
    if (cardsFilter.weaponType && card.weapon_type !== cardsFilter.weaponType) return false;
    if (cardsFilter.material && card.material !== cardsFilter.material) return false;
    if (cardsFilter.search) {
      const q = cardsFilter.search.toLowerCase();
      if (!id.toLowerCase().includes(q) && !(card.name ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredCards.length / CARDS_PAGE_SIZE));
  cardsPage = Math.min(Math.max(1, cardsPage), totalPages);
  const pageStart = (cardsPage - 1) * CARDS_PAGE_SIZE;
  const pageCards = filteredCards.slice(pageStart, pageStart + CARDS_PAGE_SIZE);

  const pagerHtml = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
      <span style="font-size:.78rem;opacity:.6;">
        ${filteredCards.length}件中 ${filteredCards.length === 0 ? 0 : pageStart + 1}–${Math.min(pageStart + CARDS_PAGE_SIZE, filteredCards.length)}件を表示
      </span>
      <div style="display:flex;gap:6px;align-items:center;">
        <button class="btn-refresh" ${cardsPage <= 1 ? 'disabled style="opacity:.4;cursor:default;"' : ''} onclick="changeCardsPage(-1,${totalPages})">‹ 前へ</button>
        <span style="font-size:.82rem;">${cardsPage} / ${totalPages}</span>
        <button class="btn-refresh" ${cardsPage >= totalPages ? 'disabled style="opacity:.4;cursor:default;"' : ''} onclick="changeCardsPage(1,${totalPages})">次へ ›</button>
      </div>
    </div>`;
  html += pagerHtml;

  const selectedMonster = gameConfig.monsters?.[cardsTestMonsterId] ?? null;
  const th = label => `<th style="position:sticky;top:0;background:#132a54;padding:6px 6px;text-align:left;font-size:.7rem;opacity:.7;white-space:nowrap;border-bottom:1px solid rgba(255,255,255,.15);">${label}</th>`;
  const td = (inner, extra = '') => `<td style="padding:3px 5px;white-space:nowrap;border-bottom:1px solid rgba(255,255,255,.06);${extra}">${inner}</td>`;
  const reCalc = `collectCardsConfig();renderCardsTab();`;

  html += `
  <div style="overflow-x:auto;border:1px solid rgba(255,255,255,.1);border-radius:8px;">
  <table style="border-collapse:collapse;font-size:.75rem;">
    <thead><tr>
      ${th('画像')}${th('ID')}${th('名前')}${th('No')}${th('説明')}${th('ランク')}${th('素材')}${th('武器種')}${th('対象')}
      ${th('AP')}${th('追加攻撃力')}${th('倍率下限')}${th('倍率上限')}${th('クリ率補正')}${th('クリダメ補正')}${th('ヒット数')}${th('回復力')}${th('特殊処理ID')}${th('')}
      ${cardsTestMonsterId ? th('平均dmg/回復') + th('期待dmg(クリ)') + th('AP効率') : ''}
      ${th('')}
    </tr></thead>
    <tbody>`;

  for (const [id, card] of pageCards) {
    const imgPreview = card.imageUrl
      ? `<img src="${escDrill(card.imageUrl)}" style="width:28px;height:28px;object-fit:contain;border-radius:4px;background:rgba(255,255,255,.08);">`
      : `<div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.08);border-radius:4px;font-size:1rem;">⚔️</div>`;

    let testCells = '';
    if (cardsTestMonsterId) {
      const t = computeCardTestStats(card, selectedMonster?.defense);
      testCells = t.isHeal
        ? td(`💚${Math.round(t.heal)}`) + td('—') + td(t.apEff != null ? t.apEff.toFixed(2) : '—')
        : td(Math.round(t.avgDmg)) + td(Math.round(t.expDmg)) + td(t.apEff != null ? t.apEff.toFixed(2) : '—');
    }

    html += `<tr>
      ${td(imgPreview)}
      ${td(`<span style="opacity:.45;font-size:.68rem;">${escDrill(id)}</span>`)}
      ${td(`<input class="cfg-input card-name-${id}" type="text" value="${escDrill(card.name ?? '')}" placeholder="カード名" style="width:110px;">`)}
      ${td(`<input class="cfg-input card-no-${id}" type="number" value="${card.no ?? ''}" placeholder="—" min="1" style="width:56px;" onchange="${reCalc}">`)}
      ${td(`<input class="cfg-input card-desc-${id}" type="text" value="${escDrill(card.desc ?? '')}" placeholder="説明文" style="width:140px;text-overflow:ellipsis;">`)}
      ${td(`<select class="cfg-input card-rarity-${id}" style="width:60px;">${['','d','c','b','a','s'].map(v => `<option value="${v}"${(card.rarity??'')=== v?' selected':''}>${v===''?'なし':v.toUpperCase()}</option>`).join('')}</select>`)}
      ${td(`<select class="cfg-input card-material-${id}" style="width:68px;"><option value=""${!card.material?' selected':''}>未設定</option>${CARD_MATERIALS.map(v => `<option value="${v}"${card.material===v?' selected':''}>${v}</option>`).join('')}</select>`)}
      ${td(`<select class="cfg-input card-wtype-${id}" style="width:88px;"><option value=""${!card.weapon_type?' selected':''}>未設定</option>${CARD_WEAPON_TYPES.map(v => `<option value="${v}"${card.weapon_type===v?' selected':''}>${v}</option>`).join('')}</select>`)}
      ${td(`<select class="cfg-input card-target-${id}" style="width:130px;" onchange="${reCalc}">${CARD_TARGETS.map(([v, label]) => `<option value="${v}"${(card.target??'enemy_single')===v?' selected':''}>${label}</option>`).join('')}</select>`)}
      ${td(`<input class="cfg-input card-apcost-${id}" type="number" value="${card.ap_cost ?? ''}" placeholder="0" min="0" style="width:58px;" onchange="${reCalc}">`)}
      ${td(`<input class="cfg-input card-batk-${id}" type="number" value="${card.base_attack ?? ''}" placeholder="0" style="width:74px;" onchange="${reCalc}">`)}
      ${td(`<input class="cfg-input card-mmin-${id}" type="number" value="${card.mult_min ?? ''}" placeholder="1.0" step="0.01" style="width:66px;" onchange="${reCalc}">`)}
      ${td(`<input class="cfg-input card-mmax-${id}" type="number" value="${card.mult_max ?? ''}" placeholder="1.0" step="0.01" style="width:66px;" onchange="${reCalc}">`)}
      ${td(`<input class="cfg-input card-crate-${id}" type="number" value="${card.crit_rate_bonus ?? ''}" placeholder="0" style="width:62px;" onchange="${reCalc}">`)}
      ${td(`<input class="cfg-input card-cdmg-${id}" type="number" value="${card.crit_dmg_bonus ?? ''}" placeholder="0" step="0.01" style="width:62px;" onchange="${reCalc}">`)}
      ${td(`<input class="cfg-input card-hits-${id}" type="number" value="${card.hit_count ?? ''}" placeholder="1" min="1" style="width:54px;" onchange="${reCalc}">`)}
      ${td(`<input class="cfg-input card-heal-${id}" type="number" value="${card.heal_power ?? ''}" placeholder="0" min="0" style="width:70px;" onchange="${reCalc}">`)}
      ${td(`<input class="cfg-input card-specialid-${id}" type="text" value="${escDrill(card.special_id ?? '')}" placeholder="なし" style="width:100px;text-overflow:ellipsis;">`)}
      ${td(`<label class="inv-save-btn" style="cursor:pointer;display:inline-block;padding:2px 8px;">📁<input type="file" accept="image/*" style="display:none;" onchange="uploadCardImage('${id}',this)"></label>${card.imageUrl ? `<button class="inv-del-btn" onclick="clearCardImage('${id}')">✕</button>` : ''}`)}
      ${testCells}
      ${td(`<button class="inv-del-btn" onclick="deleteCard('${id}')">🗑️</button>`)}
    </tr>`;
  }

  html += `</tbody></table></div>`;

  html += pagerHtml;
  html += `<button class="btn-refresh" onclick="addCard()">＋ カード追加</button>`;
  document.getElementById('cfg-tab-cards').innerHTML = html;
}

function collectCardsConfig() {
  const cards = gameConfig.cards ?? {};
  const parseNum = (v, fallback = null) => (v === '' || v == null) ? fallback : (parseFloat(v) || fallback);
  const parseInt2 = (v, fallback = null) => (v === '' || v == null) ? fallback : (parseInt(v) || fallback);
  for (const [id, card] of Object.entries(cards)) {
    // フィルター・ページングで現在表示されていないカードは触らない（値の消失を防ぐ）
    if (!document.querySelector(`.card-name-${id}`)) continue;
    const g = cls => document.querySelector(`.${cls}-${id}`)?.value ?? '';
    card.no              = parseInt2(g('card-no'), card.no);
    card.name            = g('card-name')      || card.name;
    card.desc            = g('card-desc');
    card.rarity          = g('card-rarity')    || null;
    card.material        = g('card-material')  || null;
    card.weapon_type     = g('card-wtype')     || null;
    card.target          = g('card-target')    || 'enemy_single';
    card.ap_cost         = parseNum(g('card-apcost'));
    card.base_attack     = parseNum(g('card-batk'));
    card.mult_min        = parseNum(g('card-mmin'));
    card.mult_max        = parseNum(g('card-mmax'));
    card.crit_rate_bonus = parseNum(g('card-crate'));
    card.crit_dmg_bonus  = parseNum(g('card-cdmg'));
    card.hit_count       = parseInt2(g('card-hits'));
    card.heal_power      = parseNum(g('card-heal'));
    card.special_id      = g('card-specialid') || null;
  }
  gameConfig.cards = cards;
}

function addCard() {
  collectCardsConfig();
  const id = 'card_' + Date.now();
  if (!gameConfig.cards) gameConfig.cards = {};
  const nextNo = Math.max(0, ...Object.values(gameConfig.cards).map(c => c.no ?? 0)) + 1;
  gameConfig.cards[id] = { name: '新カード', desc: '', imageUrl: null, no: nextNo, material: null, weapon_type: 'sword', target: 'enemy_single', ap_cost: 10, base_attack: 0, mult_min: 1.0, mult_max: 1.0, crit_rate_bonus: 0, crit_dmg_bonus: 0, hit_count: 1, heal_power: 0 };
  // 新しいカードは一覧の最後に追加されるため、フィルターを解除して最終ページへ移動する
  cardsFilter = { rank: '', weaponType: '', material: '', search: '' };
  cardsPage = Infinity;
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

// ── CSV エクスポート（drill_cardsテーブルから読む）──
async function exportCardsCsv() {
  const { data, error } = await supabaseClient.from('drill_cards').select('*').order('no');
  if (error) { alert('DB読み込みエラー: ' + error.message); return; }
  const overrides = gameConfig.cards ?? {};
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [CARD_CSV_COLS.map(esc)];
  for (const r of (data || [])) {
    const ov = overrides[r.id] ?? {};
    rows.push([
      r.no, r.id, r.name, r.rarity, r.material ?? '', r.weapon_type, r.icon ?? '',
      r.ap_cost, r.base_attack, r.mult_min, r.mult_max,
      r.crit_rate_bonus, r.crit_dmg_bonus, r.hit_count,
      r.target, r.heal_power, r.special_id ?? '',
      ov.imageUrl ?? '', ov.desc ?? '',
    ].map(esc));
  }
  const csv = '﻿' + rows.map(r => r.join(',')).join('\r\n');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })),
    download: 'cards_' + new Date().toISOString().slice(0, 10) + '.csv',
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── CSV インポート（drill_cardsテーブルに直接書く）──
async function importCardsCsv(input) {
  const file = input.files?.[0];
  if (!file) return;
  input.value = '';
  let text;
  try { text = await file.text(); } catch (e) { alert('ファイル読み込みエラー: ' + e.message); return; }
  try {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) { alert('データが見つかりません'); return; }

    const header = parseCsvRow(lines[0]);
    const idIdx  = header.indexOf('id');
    if (idIdx < 0) { alert('id列が必要です'); return; }

    const toNum = v => (v === '' || v == null) ? null : parseFloat(v);
    const toInt = v => (v === '' || v == null) ? null : parseInt(v, 10);
    const dbRows = [];
    if (!gameConfig.cards) gameConfig.cards = {};
    let count = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvRow(lines[i]);
      // 'fist' は旧IDの残骸。現行の拳カードIDである 'fist_d' に正規化する
      const rawId = cols[idIdx]?.trim();
      const id = rawId === 'fist' ? 'fist_d' : rawId;
      if (!id) continue;
      const get = col => { const j = header.indexOf(col); return j >= 0 ? (cols[j] ?? '') : null; };

      const noVal = toInt(get('no'));
      if (noVal == null) continue; // no は必須

      // drill_cards テーブルに書く列
      dbRows.push({
        id,
        no:              noVal,
        name:            get('name') || id,
        rarity:          (get('rarity') || 'd').toLowerCase(),
        material:        get('material') || null,
        weapon_type:     get('weapon_type') || '剣',
        icon:            get('icon') || null,
        ap_cost:         toInt(get('ap_cost')) ?? 1,
        base_attack:     toInt(get('base_attack')) ?? 0,
        mult_min:        toNum(get('mult_min')) ?? 1.0,
        mult_max:        toNum(get('mult_max')) ?? 1.0,
        crit_rate_bonus: toNum(get('crit_rate_bonus')) ?? 0,
        crit_dmg_bonus:  toNum(get('crit_dmg_bonus')) ?? 0,
        hit_count:       toInt(get('hit_count')) ?? 1,
        target:          get('target') || 'enemy_single',
        heal_power:      toInt(get('heal_power')) ?? 0,
        special_id:      get('special_id') || null,
      });

      // imageUrl / desc だけ gameConfig.cards に残す
      const imageUrl = get('imageUrl');
      const desc     = get('desc');
      const ex = gameConfig.cards[id] ?? {};
      gameConfig.cards[id] = {
        ...ex,
        imageUrl: (imageUrl || null) ?? ex.imageUrl ?? null,
        desc:     desc ?? ex.desc ?? '',
      };
      count++;
    }

    if (dbRows.length > 0) {
      // no列にはUNIQUE制約があるため、並び替え/入れ替えでid基準upsertが衝突しないよう
      // 一旦マイナスの仮noに退避してから本来のnoで上書きする（2段階upsert）
      const tempRows = dbRows.map((r, i) => ({ ...r, no: -(i + 1) }));
      const { error: tmpErr } = await supabaseClient.from('drill_cards').upsert(tempRows, { onConflict: 'id' });
      if (tmpErr) { alert('DB保存エラー: ' + tmpErr.message); return; }
      const { error } = await supabaseClient.from('drill_cards').upsert(dbRows, { onConflict: 'id' });
      if (error) { alert('DB保存エラー: ' + error.message); return; }
    }

    renderCardsTab();
    alert(`✅ インポート完了（drill_cards DB 更新済み）\n${count}件\n\n画像URLと説明文を変更した場合は「保存」ボタンも押してください`);
  } catch (err) {
    alert('CSVのパースに失敗しました: ' + err.message);
  }
}

function parseCsvRow(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ && line[i+1] === '"' ? (cur += '"', i++) : (inQ = !inQ); }
    else if (c === ',' && !inQ) { result.push(cur); cur = ''; }
    else cur += c;
  }
  result.push(cur);
  return result;
}

// ============================================================
// アイテム設定タブ
// ============================================================

function renderItemsTab() {
  const el = document.getElementById('cfg-tab-items-inner');
  if (!el) return;
  const items = gameConfig.items ?? {};

  let html = `<div class="info-box" style="margin-bottom:14px;">
    アイテムの定義を設定します。値段が0のアイテムはショップに表示されません。
  </div>`;

  for (const [id, def] of Object.entries(items)) {
    const imgPreview = def.imageUrl
      ? `<img src="${escDrill(def.imageUrl)}" style="width:32px;height:32px;object-fit:contain;vertical-align:middle;cursor:pointer;border-radius:4px;" onclick="clearItemImage('${id}')" title="クリックで削除">`
      : `<span style="opacity:.4;font-size:.75rem;">画像なし</span>`;

    html += `<div style="border:1px solid rgba(255,255,255,.15);border-radius:8px;padding:12px;margin-bottom:12px;">
      <div style="display:flex;gap:10px;align-items:center;margin-bottom:10px;flex-wrap:wrap;">
        <input type="text" id="cfg-item-name-${id}" value="${escDrill(def.name ?? id)}" style="width:120px;" placeholder="名前">
        <label style="cursor:pointer;font-size:.8rem;padding:4px 8px;background:rgba(255,255,255,.1);border-radius:4px;">
          📷 画像
          <input type="file" accept="image/*" style="display:none;" onchange="uploadItemImage('${id}',this)">
        </label>
        ${imgPreview}
        <button class="btn-refresh" style="margin-left:auto;background:rgba(255,100,100,.2);" onclick="deleteItem('${id}')">🗑️ 削除</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;font-size:.8rem;">
        <label>効果テキスト
          <input type="text" id="cfg-item-effect-${id}" value="${escDrill(def.effectText ?? '')}" style="width:100%;margin-top:2px;" placeholder="説明文">
        </label>
        <label>重量
          <input type="number" id="cfg-item-weight-${id}" value="${def.weight ?? 1}" min="0" style="width:100%;margin-top:2px;">
        </label>
        <label>値段（0=非売品）
          <input type="number" id="cfg-item-cost-${id}" value="${def.cost ?? 0}" min="0" style="width:100%;margin-top:2px;">
        </label>
      </div>
    </div>`;
  }

  html += `<button class="btn-refresh" onclick="addItem()">＋ アイテムを追加</button>`;
  el.innerHTML = html;
}

function collectItemsConfig() {
  const gc = gameConfig;
  if (!gc.items) gc.items = {};
  for (const [id, def] of Object.entries(gc.items)) {
    const nameEl   = document.getElementById(`cfg-item-name-${id}`);
    const effectEl = document.getElementById(`cfg-item-effect-${id}`);
    const weightEl = document.getElementById(`cfg-item-weight-${id}`);
    const costEl   = document.getElementById(`cfg-item-cost-${id}`);
    if (nameEl)   def.name       = nameEl.value   || def.name;
    if (effectEl) def.effectText = effectEl.value;
    if (weightEl) def.weight     = parseInt(weightEl.value) || 1;
    if (costEl)   def.cost       = parseInt(costEl.value)   || 0;
  }
}

function addItem() {
  collectItemsConfig();
  collectShopConfig();
  const id = 'item_' + Date.now();
  if (!gameConfig.items) gameConfig.items = {};
  gameConfig.items[id] = { name: '新アイテム', weight: 10, cost: 0, effectText: '', imageUrl: null };
  renderItemsTab();
  renderShopTab();
}

function deleteItem(id) {
  collectItemsConfig();
  if (!confirm(`「${gameConfig.items?.[id]?.name || id}」を削除しますか？`)) return;
  collectShopConfig();
  delete gameConfig.items[id];
  renderItemsTab();
  renderShopTab();
}

async function uploadItemImage(id, input) {
  const file = input.files?.[0];
  if (!file) return;
  try {
    collectItemsConfig();
    const url = await uploadDrillImage('items/' + id, file);
    if (gameConfig.items?.[id]) gameConfig.items[id].imageUrl = url;
    renderItemsTab();
  } catch (e) {
    alert('アップロードエラー: ' + e.message);
  }
}

function clearItemImage(id) {
  if (gameConfig.items?.[id]) gameConfig.items[id].imageUrl = null;
  renderItemsTab();
}

// ============================================================
// メモリ設定タブ
// ============================================================

let memoriesFilter = { group: '', rank: '', search: '' };
let memoriesPage = 1;
const MEMORIES_PAGE_SIZE = 20;
const MEMORY_RANK_ORDER = { d: 0, c: 1, b: 2, a: 3, s: 4 };

function applyMemoriesFilter() {
  collectMemoriesConfig();
  memoriesFilter.group  = document.getElementById('mem-filter-group')?.value ?? '';
  memoriesFilter.rank   = document.getElementById('mem-filter-rank')?.value ?? '';
  memoriesFilter.search = document.getElementById('mem-filter-search')?.value ?? '';
  memoriesPage = 1;
  renderMemoriesTab();
}

function changeMemoriesPage(delta, totalPages) {
  collectMemoriesConfig();
  memoriesPage = Math.min(Math.max(1, memoriesPage + delta), totalPages);
  renderMemoriesTab();
}

function renderMemoriesTab() {
  const el = document.getElementById('cfg-tab-memories');
  if (!el) return;
  const memories = gameConfig.memories ?? {};
  const rw = gameConfig.memoryRankWeights ?? DEFAULT_GAME_CONFIG.memoryRankWeights;

  const rankRows = ALCHEMY_RARITY_IDS.map(r => `
    <label style="display:flex;flex-direction:column;align-items:center;gap:4px;font-size:.8rem;">
      <span style="font-weight:700;letter-spacing:.05em;">${r.toUpperCase()}</span>
      <input class="cfg-input mem-rank-${r}" type="number" min="0" value="${rw[r] ?? 0}"
        style="width:64px;text-align:center;" oninput="_memAdminUpdateTotal()">
    </label>`).join('');

  const monsterList = Object.entries(gameConfig.monsters ?? {}); // [id, mon][]
  const monsterName = mid => gameConfig.monsters?.[mid]?.name ?? mid;
  let html = `
  <datalist id="mem-special-list">
    <option value="WTYPE_DMG_剣_10">
    <option value="DROP_MULT_dirt_2">
  </datalist>
  <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;align-items:center;">
    <button class="btn-refresh" onclick="exportMemoriesCsv()" style="background:rgba(80,180,120,.6);">⬇️ CSVエクスポート</button>
    <label class="inv-save-btn" style="cursor:pointer;padding:6px 14px;background:rgba(80,140,220,.5);">
      ⬆️ CSVインポート<input type="file" accept=".csv,text/csv" style="display:none;" onchange="importMemoriesCsv(this)">
    </label>
    <span style="font-size:.75rem;opacity:.5;">※ インポートするとDBに即時反映されます（画像は個別アップロードしてください）</span>
  </div>
  <div class="info-box" style="margin-bottom:14px;">
    メモリはモンスター討伐時にドロップし、編成画面から最大3種類まで装備できます（同じ種類は1つまで）。
    プレイヤーのステータスを恒久的に強化します。1体のモンスターにつき、そのモンスター専用のメモリが対応します。<br>
    D〜Sの5ランク分をそれぞれ作成し、各行の「ドロップ元モンスター」に同じモンスターを選んでください。討伐時、ランク（D〜S）は下の共通比率で自動抽選されます。
    ドロップ率(%)はモンスタータブで個別に設定します。<br>
    「特殊処理ID」は装備中に発動する特殊効果です。現在対応している書式:<br>
    ・<code>WTYPE_DMG_&lt;武器種&gt;_&lt;加算値&gt;</code> … 例 <code>WTYPE_DMG_剣_10</code>＝剣カードのダメージ+10<br>
    ・<code>DROP_MULT_&lt;素材ID&gt;_&lt;倍率&gt;</code> … 例 <code>DROP_MULT_dirt_2</code>＝土のドロップ数が2倍<br>
    新しい特殊効果を追加する場合は、この書式パターンをdrill/game.jsの<code>_applyMemorySpecial()</code>に追加してください。
  </div>
  <div style="margin-bottom:20px;">
    <div style="font-size:.95rem;font-weight:700;margin-bottom:10px;">メモリのランク抽選比率（全モンスター共通）</div>
    <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;">
      ${rankRows}
      <div id="mem-rank-total" style="font-size:.8rem;opacity:.6;align-self:center;"></div>
    </div>
  </div>
  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center;">
    <input id="mem-filter-search" class="cfg-input" type="text" placeholder="🔍 IDまたは名前で検索"
      value="${escDrill(memoriesFilter.search)}" oninput="applyMemoriesFilter()" style="flex:1 1 180px;">
    <select id="mem-filter-group" class="cfg-input" onchange="applyMemoriesFilter()">
      <option value="">モンスター: すべて</option>
      ${monsterList.map(([mid, mon]) => `<option value="${mid}"${memoriesFilter.group===mid?' selected':''}>${escDrill(mon.name || mid)}</option>`).join('')}
    </select>
    <select id="mem-filter-rank" class="cfg-input" onchange="applyMemoriesFilter()">
      <option value="">ランク: すべて</option>
      ${ALCHEMY_RARITY_IDS.map(v => `<option value="${v}"${memoriesFilter.rank===v?' selected':''}>${v.toUpperCase()}</option>`).join('')}
    </select>
  </div>`;

  const sortedMemories = Object.entries(memories).sort((a, b) => {
    const ga = monsterName(a[1].group ?? ''), gb = monsterName(b[1].group ?? '');
    if (ga !== gb) return ga.localeCompare(gb);
    const ra = MEMORY_RANK_ORDER[a[1].rarity] ?? 99, rb = MEMORY_RANK_ORDER[b[1].rarity] ?? 99;
    if (ra !== rb) return ra - rb;
    return (a[1].name ?? '').localeCompare(b[1].name ?? '');
  });
  const filteredMemories = sortedMemories.filter(([id, def]) => {
    if (memoriesFilter.group && def.group !== memoriesFilter.group) return false;
    if (memoriesFilter.rank && (def.rarity ?? '').toLowerCase() !== memoriesFilter.rank) return false;
    if (memoriesFilter.search) {
      const q = memoriesFilter.search.toLowerCase();
      if (!id.toLowerCase().includes(q) && !(def.name ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredMemories.length / MEMORIES_PAGE_SIZE));
  memoriesPage = Math.min(Math.max(1, memoriesPage), totalPages);
  const pageStart = (memoriesPage - 1) * MEMORIES_PAGE_SIZE;
  const pageMemories = filteredMemories.slice(pageStart, pageStart + MEMORIES_PAGE_SIZE);

  const pagerHtml = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap;">
      <span style="font-size:.78rem;opacity:.6;">
        ${filteredMemories.length}件中 ${filteredMemories.length === 0 ? 0 : pageStart + 1}–${Math.min(pageStart + MEMORIES_PAGE_SIZE, filteredMemories.length)}件を表示
      </span>
      <div style="display:flex;gap:6px;align-items:center;">
        <button class="btn-refresh" ${memoriesPage <= 1 ? 'disabled style="opacity:.4;cursor:default;"' : ''} onclick="changeMemoriesPage(-1,${totalPages})">‹ 前へ</button>
        <span style="font-size:.82rem;">${memoriesPage} / ${totalPages}</span>
        <button class="btn-refresh" ${memoriesPage >= totalPages ? 'disabled style="opacity:.4;cursor:default;"' : ''} onclick="changeMemoriesPage(1,${totalPages})">次へ ›</button>
      </div>
    </div>`;
  html += pagerHtml;

  const th = label => `<th style="position:sticky;top:0;background:#132a54;padding:6px 6px;text-align:left;font-size:.7rem;opacity:.7;white-space:nowrap;border-bottom:1px solid rgba(255,255,255,.15);">${label}</th>`;
  const td = inner => `<td style="padding:3px 5px;white-space:nowrap;border-bottom:1px solid rgba(255,255,255,.06);">${inner}</td>`;

  html += `
  <div style="overflow-x:auto;border:1px solid rgba(255,255,255,.1);border-radius:8px;">
  <table style="border-collapse:collapse;font-size:.75rem;">
    <thead><tr>
      ${th('画像')}${th('ID')}${th('名前')}${th('アイコン')}${th('ドロップ元モンスター')}${th('ランク')}${th('説明')}${th('特殊処理ID')}
      ${MEMORY_STATS.map(([, label]) => th(label)).join('')}
      ${th('')}
    </tr></thead>
    <tbody>`;

  for (const [id, def] of pageMemories) {
    const imgPreview = def.imageUrl
      ? `<img src="${escDrill(def.imageUrl)}" style="width:28px;height:28px;object-fit:contain;border-radius:4px;cursor:pointer;" onclick="clearMemoryImage('${id}')" title="クリックで削除">`
      : `<div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.08);border-radius:4px;font-size:1rem;">${escDrill(def.icon || '🧠')}</div>`;

    html += `<tr>
      ${td(imgPreview)}
      ${td(`<span style="opacity:.45;font-size:.68rem;">${escDrill(id)}</span>`)}
      ${td(`<input type="text" class="cfg-input" id="cfg-mem-name-${id}" value="${escDrill(def.name ?? id)}" style="width:110px;" placeholder="名前">`)}
      ${td(`<input type="text" class="cfg-input" id="cfg-mem-icon-${id}" value="${escDrill(def.icon ?? '')}" style="width:44px;" placeholder="🧠">`)}
      ${td(`<select class="cfg-input" id="cfg-mem-group-${id}" style="width:130px;" onchange="collectMemoriesConfig();renderMemoriesTab();"><option value=""${!def.group?' selected':''}>未設定</option>${monsterList.map(([mid, mon]) => `<option value="${mid}"${def.group===mid?' selected':''}>${escDrill(mon.name || mid)}</option>`).join('')}</select>`)}
      ${td(`<select class="cfg-input" id="cfg-mem-rarity-${id}" style="width:62px;" onchange="collectMemoriesConfig();renderMemoriesTab();">${['','d','c','b','a','s'].map(v => `<option value="${v}"${(def.rarity??'')===v?' selected':''}>${v===''?'なし':v.toUpperCase()}</option>`).join('')}</select>`)}
      ${td(`<input type="text" class="cfg-input" id="cfg-mem-desc-${id}" value="${escDrill(def.desc ?? '')}" style="width:130px;text-overflow:ellipsis;" placeholder="説明文">`)}
      ${td(`<input type="text" class="cfg-input" id="cfg-mem-specialid-${id}" value="${escDrill(def.special_id ?? '')}" style="width:150px;text-overflow:ellipsis;" placeholder="なし" list="mem-special-list">`)}
      ${MEMORY_STATS.map(([statKey]) => td(`<input type="number" class="cfg-input mem-bonus-${id}" data-stat="${statKey}" value="${(def.bonuses ?? {})[statKey] ?? 0}" style="width:72px;">`)).join('')}
      ${td(`<label class="inv-save-btn" style="cursor:pointer;display:inline-block;padding:2px 8px;">📁<input type="file" accept="image/*" style="display:none;" onchange="uploadMemoryImage('${id}',this)"></label> <button class="inv-del-btn" onclick="deleteMemory('${id}')">🗑️</button>`)}
    </tr>`;
  }

  html += `</tbody></table></div>`;
  html += pagerHtml;
  html += `<button class="btn-refresh" style="margin-top:10px;" onclick="addMemory()">＋ メモリを追加</button>`;
  el.innerHTML = html;
  _memAdminUpdateTotal();
}

function _memAdminUpdateTotal() {
  const el = document.getElementById('mem-rank-total');
  if (!el) return;
  const total = ALCHEMY_RARITY_IDS.reduce((s, r) => {
    return s + (parseInt(document.querySelector(`.mem-rank-${r}`)?.value) || 0);
  }, 0);
  el.textContent = `合計: ${total}`;
  el.style.color = total === 100 ? '#6bde9b' : '#f44336';
}

function collectMemoriesConfig() {
  const rw = {};
  for (const r of ALCHEMY_RARITY_IDS) {
    rw[r] = parseInt(document.querySelector(`.mem-rank-${r}`)?.value) || 0;
  }
  gameConfig.memoryRankWeights = rw;

  const memories = gameConfig.memories ?? {};
  for (const [id, def] of Object.entries(memories)) {
    const nameEl      = document.getElementById(`cfg-mem-name-${id}`);
    const iconEl      = document.getElementById(`cfg-mem-icon-${id}`);
    const descEl      = document.getElementById(`cfg-mem-desc-${id}`);
    const groupEl     = document.getElementById(`cfg-mem-group-${id}`);
    const rarityEl    = document.getElementById(`cfg-mem-rarity-${id}`);
    const specialIdEl = document.getElementById(`cfg-mem-specialid-${id}`);
    if (!nameEl) continue; // 未表示（描画前）の場合はスキップ
    def.name       = nameEl.value || def.name;
    def.icon       = iconEl.value || '🧠';
    def.desc       = descEl.value;
    def.group      = groupEl.value.trim() || null;
    def.rarity     = rarityEl.value || null;
    def.special_id = specialIdEl.value.trim() || null;
    delete def.weight;

    const bonuses = {};
    document.querySelectorAll(`.mem-bonus-${id}`).forEach(el => {
      bonuses[el.dataset.stat] = parseFloat(el.value) || 0;
    });
    def.bonuses = bonuses;
    delete def.stat;
    delete def.amount;
  }
  gameConfig.memories = memories;
}

function addMemory() {
  collectMemoriesConfig();
  const id = 'memory_' + Date.now();
  if (!gameConfig.memories) gameConfig.memories = {};
  gameConfig.memories[id] = {
    name: '新しいメモリ', desc: '', icon: '🧠', imageUrl: null, group: null, rarity: 'd', special_id: null,
    bonuses: Object.fromEntries(MEMORY_STATS.map(([statKey]) => [statKey, 0])),
  };
  renderMemoriesTab();
}

function deleteMemory(id) {
  collectMemoriesConfig();
  if (!confirm(`「${gameConfig.memories?.[id]?.name || id}」を削除しますか？`)) return;
  delete gameConfig.memories[id];
  renderMemoriesTab();
}

async function uploadMemoryImage(id, input) {
  const file = input.files?.[0];
  if (!file) return;
  try {
    collectMemoriesConfig();
    const url = await uploadDrillImage('memories/' + id, file);
    if (gameConfig.memories?.[id]) gameConfig.memories[id].imageUrl = url;
    renderMemoriesTab();
  } catch (e) {
    alert('アップロードエラー: ' + e.message);
  }
}

function clearMemoryImage(id) {
  if (gameConfig.memories?.[id]) gameConfig.memories[id].imageUrl = null;
  renderMemoriesTab();
}

// CSVはgameConfig.memoriesの列に合わせる（bonusesはステータスごとに列を分ける）
const MEMORY_CSV_COLS = ['id','name','desc','icon','group','rarity','special_id','imageUrl', ...MEMORY_STATS.map(([k]) => k)];

// ── CSV エクスポート（gameConfig.memoriesから読む）──
function exportMemoriesCsv() {
  collectMemoriesConfig();
  const memories = gameConfig.memories ?? {};
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [MEMORY_CSV_COLS.map(esc)];
  for (const [id, def] of Object.entries(memories)) {
    const bonuses = def.bonuses ?? {};
    rows.push([
      id, def.name ?? id, def.desc ?? '', def.icon ?? '', def.group ?? '', def.rarity ?? '', def.special_id ?? '', def.imageUrl ?? '',
      ...MEMORY_STATS.map(([k]) => bonuses[k] ?? 0),
    ].map(esc));
  }
  const csv = '﻿' + rows.map(r => r.join(',')).join('\r\n');
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })),
    download: 'memories_' + new Date().toISOString().slice(0, 10) + '.csv',
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── CSV インポート（gameConfig.memoriesを更新し、DBへ即時反映）──
async function importMemoriesCsv(input) {
  const file = input.files?.[0];
  if (!file) return;
  input.value = '';
  let text;
  try { text = await file.text(); } catch (e) { alert('ファイル読み込みエラー: ' + e.message); return; }
  try {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) { alert('データが見つかりません'); return; }

    const header = parseCsvRow(lines[0]);
    const idIdx  = header.indexOf('id');
    if (idIdx < 0) { alert('id列が必要です'); return; }

    collectMemoriesConfig(); // 未保存の画面編集を先に取り込んでおく
    if (!gameConfig.memories) gameConfig.memories = {};
    let count = 0;

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvRow(lines[i]);
      const id = cols[idIdx]?.trim();
      if (!id) continue;
      const get = col => { const j = header.indexOf(col); return j >= 0 ? (cols[j] ?? '') : null; };

      const ex = gameConfig.memories[id] ?? {};
      const bonuses = {};
      MEMORY_STATS.forEach(([k]) => { bonuses[k] = parseFloat(get(k)) || 0; });

      gameConfig.memories[id] = {
        ...ex,
        name:       get('name') || id,
        desc:       get('desc') ?? '',
        icon:       get('icon') || '🧠',
        group:      get('group') || null,
        rarity:     (get('rarity') || '').toLowerCase() || null,
        special_id: get('special_id') || null,
        imageUrl:   get('imageUrl') || ex.imageUrl || null,
        bonuses,
      };
      delete gameConfig.memories[id].weight;
      count++;
    }

    const { error } = await supabaseClient.from('drill_page_settings')
      .upsert({ setting_key: 'game_config', setting_value: JSON.stringify(gameConfig) });
    if (error) { alert('DB保存エラー: ' + error.message); return; }

    renderMemoriesTab();
    alert(`✅ インポート完了（DB更新済み）\n${count}件`);
  } catch (err) {
    alert('CSVのパースに失敗しました: ' + err.message);
  }
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
// 錬金窯設定
// ============================================================

const ALCHEMY_ADMIN_MAT_IDS  = ['dirt','stone','copper','iron','silver','gold'];
const ALCHEMY_ADMIN_MAT_NAMES = { dirt:'土', stone:'石', copper:'銅', iron:'鉄', silver:'銀', gold:'金' };
const ALCHEMY_WEAPON_IDS   = ['sword','dagger','axe','hammer','boomerang','spear','staff','scythe'];
const ALCHEMY_WEAPON_LABELS = { sword:'剣', dagger:'短剣', axe:'斧', hammer:'ハンマー', boomerang:'ブーメラン', spear:'槍', staff:'杖', scythe:'鎌' };
const ALCHEMY_RARITY_IDS   = ['d','c','b','a','s'];

function renderAlchemyTab() {
  const alch = gameConfig.alchemy ?? DEFAULT_GAME_CONFIG.alchemy;
  const rw   = alch.rarityWeights ?? { d:50, c:30, b:15, a:4, s:1 };
  const ww   = alch.weaponWeights ?? DEFAULT_GAME_CONFIG.alchemy.weaponWeights;

  // レアリティ排出率
  const rarityRows = ALCHEMY_RARITY_IDS.map(r => `
    <label style="display:flex;flex-direction:column;align-items:center;gap:4px;font-size:.8rem;">
      <span style="font-weight:700;letter-spacing:.05em;">${r.toUpperCase()}</span>
      <input class="cfg-input alch-rarity-${r}" type="number" min="0" value="${rw[r] ?? 0}"
        style="width:64px;text-align:center;" oninput="_alchAdminUpdateTotal()">
    </label>`).join('');

  // 素材ごとの武器種重み
  const matSections = ALCHEMY_ADMIN_MAT_IDS.map(matId => {
    const weights = ww[matId] ?? {};
    const matTotal = ALCHEMY_WEAPON_IDS.reduce((s, wId) => s + (parseInt(weights[wId]) || 0), 0);
    const weaponInputs = ALCHEMY_WEAPON_IDS.map(wId => `
      <label style="display:flex;flex-direction:column;align-items:center;gap:4px;font-size:.8rem;min-width:68px;">
        <span>${ALCHEMY_WEAPON_LABELS[wId]}</span>
        <input class="cfg-input alch-w-${matId}-${wId}" type="number" min="0" value="${weights[wId] ?? 0}"
          style="width:60px;text-align:center;" oninput="_alchMatUpdateTotal('${matId}')">
      </label>`).join('');
    return `
      <div style="margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <div style="font-size:.88rem;font-weight:700;color:rgba(255,255,255,.7);">
            ${ALCHEMY_ADMIN_MAT_NAMES[matId]}（${matId}）
          </div>
          <div id="alch-mat-total-${matId}" style="font-size:.76rem;opacity:.6;">合計: ${matTotal}</div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">${weaponInputs}</div>
      </div>`;
  }).join('');

  document.getElementById('cfg-tab-alchemy').innerHTML = `
    <div class="info-box" style="margin-bottom:16px;">
      重み0、または対応カードが未定義の武器種は排出されません。<br>
      カードIDは <code style="font-size:.82rem;">{武器種}_{素材}_{レアリティ}</code> 形式で
      カードタブに登録してください。<br>
      例: <code style="font-size:.82rem;">sword_iron_s</code>（鉄の剣 S）<br>
      ※ 土（dirt）素材のみ、カードIDは <code style="font-size:.82rem;">dirt</code> ではなく
      <code style="font-size:.82rem;">clay</code> と表記してください（例: <code style="font-size:.82rem;">sword_clay_d</code>）。
    </div>

    <div style="margin-bottom:24px;">
      <div style="font-size:.95rem;font-weight:700;margin-bottom:12px;border-bottom:1px solid rgba(255,255,255,.12);padding-bottom:8px;">
        レアリティ排出率
      </div>
      <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-end;">
        ${rarityRows}
        <div id="alch-rarity-total" style="font-size:.8rem;opacity:.6;align-self:center;"></div>
      </div>
    </div>

    <div>
      <div style="font-size:.95rem;font-weight:700;margin-bottom:12px;border-bottom:1px solid rgba(255,255,255,.12);padding-bottom:8px;">
        素材ごとの武器種重み
      </div>
      ${matSections}
    </div>`;

  _alchAdminUpdateTotal();
}

function _alchAdminUpdateTotal() {
  const el = document.getElementById('alch-rarity-total');
  if (!el) return;
  const total = ALCHEMY_RARITY_IDS.reduce((s, r) => {
    return s + (parseInt(document.querySelector(`.alch-rarity-${r}`)?.value) || 0);
  }, 0);
  el.textContent = `合計: ${total}`;
  el.style.color = total === 100 ? '#6bde9b' : '#f44336';
}

function _alchMatUpdateTotal(matId) {
  const el = document.getElementById(`alch-mat-total-${matId}`);
  if (!el) return;
  const total = ALCHEMY_WEAPON_IDS.reduce((s, wId) => {
    return s + (parseInt(document.querySelector(`.alch-w-${matId}-${wId}`)?.value) || 0);
  }, 0);
  el.textContent = `合計: ${total}`;
}

function collectAlchemyConfig() {
  if (!gameConfig.alchemy) gameConfig.alchemy = JSON.parse(JSON.stringify(DEFAULT_GAME_CONFIG.alchemy));

  // レアリティ
  const rw = {};
  for (const r of ALCHEMY_RARITY_IDS) {
    rw[r] = parseInt(document.querySelector(`.alch-rarity-${r}`)?.value) || 0;
  }
  gameConfig.alchemy.rarityWeights = rw;

  // 武器種重み
  const ww = {};
  for (const matId of ALCHEMY_ADMIN_MAT_IDS) {
    ww[matId] = {};
    for (const wId of ALCHEMY_WEAPON_IDS) {
      ww[matId][wId] = parseInt(document.querySelector(`.alch-w-${matId}-${wId}`)?.value) || 0;
    }
  }
  gameConfig.alchemy.weaponWeights = ww;
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

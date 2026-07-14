// ほりほりドリル - ゲームロジック

// ============================================================
// 定数
// ============================================================

const MAP_W = 256;
const MAP_H = 300;
const VP_W = 9;   // ビューポート幅
const VP_H = 15;  // ビューポート高さ
let START_X = 128; // 管理画面から変更可
const START_Y = 0;
const MINE_TICK_MS = 500;
const LOCK_TTL_MS = 4000;

const MATS = {
  dirt:    { name: '土',   hp: 3,   color: '#5c3d11', cls: 'mc-dirt' },
  stone:   { name: '石',   hp: 10,  color: '#4a4a5a', cls: 'mc-stone' },
  copper:  { name: '銅',   hp: 20,  color: '#7a4520', cls: 'mc-copper' },
  iron:    { name: '鉄',   hp: 50,  color: '#5a606a', cls: 'mc-iron' },
  silver:  { name: '銀',   hp: 200, color: '#7a8090', cls: 'mc-silver' },
  gold:    { name: '金',   hp: 50,  color: '#7a6010', cls: 'mc-gold' },
  treasure:{ name: '宝箱', hp: 30,  color: '#6a5000', cls: 'mc-treasure' },
};

const ITEM_NAMES = {
  dirt: '土', stone: '石', copper: '銅', iron: '鉄',
  silver: '銀', gold: '金', return_stone: '帰還石',
  drill_apprentice: '見習いのドリル', drill_stone: '石ドリル',
  drill_copper: '銅ドリル', drill_iron: '鉄ドリル', drill_silver: '銀のドリル',
};

// 層ごとの掘削済みマス背景定義
const LAYER_BG = [
  { color: '#15100a', image: `./img/bg_layer1.png` }, // 第1層 0-99m
  { color: '#1a0808' },                                // 第2層 100-199m
  { color: '#0a0818' },                                // 第3層 200-299m
];

// 10Mごとの素材重み（30スロット: 0-9m, 10-19m, ..., 290-299m）
const _LW_BASE = [
  [['dirt',0.65],['stone',0.93],['copper',1.00]],
  [['dirt',0.15],['stone',0.50],['copper',0.79],['iron',0.995],['silver',1.00]],
  [['dirt',0.05],['stone',0.25],['copper',0.40],['iron',0.75],['silver',0.95],['gold',1.00]],
];
let LAYER_W = Array.from({length: 30}, (_, i) =>
  _LW_BASE[Math.min(2, Math.floor(i / 10))].map(e => [...e])
);

// 宝箱種類設定
let TREASURE_TYPES = {
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
};
// 宝箱配置設定: 10Mごと30スロット。{ typeId: count, ... }
let TREASURE_SLOTS = Array.from({length: 30}, () => ({ wood: 1 }));

const DRILLS = {
  beginner:    { name:'初心者ドリル',    power:1,   dur:null,  cost:null, recipe:null },
  apprentice:  { name:'見習いのドリル',  power:3,   dur:300,   cost:100,  recipe:null },
  stone_drill: { name:'石ドリル',        power:5,   dur:1000,  cost:null, recipe:{stone:50} },
  copper_drill:{ name:'銅ドリル',        power:10,  dur:2000,  cost:null, recipe:{copper:50} },
  journeyman:  { name:'一人前のドリル',  power:10,  dur:3000,  cost:2000, recipe:null },
  iron_drill:  { name:'鉄ドリル',        power:25,  dur:4000,  cost:null, recipe:{iron:50} },
  mass_drill:  { name:'量産型ドリル',    power:25,  dur:3000,  cost:null, recipe:{stone:20,copper:20,iron:20} },
  veteran:     { name:'熟練のドリル',    power:50,  dur:10000, cost:10000,recipe:null },
  silver_drill:{ name:'銀のドリル',      power:50,  dur:20000, cost:null, recipe:{silver:30} },
  allpurpose:  { name:'万能ドリル',      power:100, dur:50000, cost:null, recipe:{copper:20,iron:20,silver:20} },
};

const SHOP_ITEMS = [
  { id:'apprentice',   name:'見習いのドリル',   cost:100,   type:'drill', drillId:'apprentice' },
  { id:'journeyman',   name:'一人前のドリル',   cost:2000,  type:'drill', drillId:'journeyman' },
  { id:'veteran',      name:'熟練のドリル',     cost:10000, type:'drill', drillId:'veteran' },
  { id:'drill_attack', name:'ドリルアタック',   cost:100,   type:'card',  cardId:'drill_attack' },
  // 剣カード（価格は管理画面ショップ設定で調整可）
  { id:'sword_clay_d',   name:'粘土の剣',  cost:200,    type:'card', cardId:'sword_clay_d' },
  { id:'sword_clay_c',   name:'粘土の剣',  cost:400,    type:'card', cardId:'sword_clay_c' },
  { id:'sword_clay_b',   name:'粘土の剣',  cost:800,    type:'card', cardId:'sword_clay_b' },
  { id:'sword_clay_a',   name:'粘土の剣',  cost:1600,   type:'card', cardId:'sword_clay_a' },
  { id:'sword_clay_s',   name:'粘土の剣',  cost:3000,   type:'card', cardId:'sword_clay_s' },
  { id:'sword_stone_d',  name:'石の剣',    cost:1000,   type:'card', cardId:'sword_stone_d' },
  { id:'sword_stone_c',  name:'石の剣',    cost:1500,   type:'card', cardId:'sword_stone_c' },
  { id:'sword_stone_b',  name:'石の剣',    cost:2500,   type:'card', cardId:'sword_stone_b' },
  { id:'sword_stone_a',  name:'石の剣',    cost:5000,   type:'card', cardId:'sword_stone_a' },
  { id:'sword_stone_s',  name:'石の剣',    cost:10000,  type:'card', cardId:'sword_stone_s' },
  { id:'sword_copper_d', name:'銅の剣',    cost:3000,   type:'card', cardId:'sword_copper_d' },
  { id:'sword_copper_c', name:'銅の剣',    cost:5000,   type:'card', cardId:'sword_copper_c' },
  { id:'sword_copper_b', name:'銅の剣',    cost:8000,   type:'card', cardId:'sword_copper_b' },
  { id:'sword_copper_a', name:'銅の剣',    cost:15000,  type:'card', cardId:'sword_copper_a' },
  { id:'sword_copper_s', name:'銅の剣',    cost:30000,  type:'card', cardId:'sword_copper_s' },
  { id:'sword_iron_d',   name:'鉄の剣',    cost:20000,  type:'card', cardId:'sword_iron_d' },
  { id:'sword_iron_c',   name:'鉄の剣',    cost:30000,  type:'card', cardId:'sword_iron_c' },
  { id:'sword_iron_b',   name:'鉄の剣',    cost:50000,  type:'card', cardId:'sword_iron_b' },
  { id:'sword_iron_a',   name:'鉄の剣',    cost:100000, type:'card', cardId:'sword_iron_a' },
  { id:'sword_iron_s',   name:'鉄の剣',    cost:200000, type:'card', cardId:'sword_iron_s' },
];

const PERMITS = {
  permit_100: { name:'100m入坑許可証', yMin:100, recipe:{stone:1000,copper:300} },
  permit_200: { name:'200m入坑許可証', yMin:200, recipe:{iron:1000,silver:300} },
};

const SELL_PRICES = {
  dirt: 1, stone: 3, copper: 15, iron: 50, silver: 200, gold: 500,
};

// アイテム定義（admin設定で上書き可能）
let ITEMS = {
  return_stone: { name: '帰還石',     weight: 10, cost: null, effectText: '地上に帰還する',    imageUrl: null },
  potion:       { name: 'ポーション', weight: 10, cost: 100,  effectText: '体力を100回復する', imageUrl: null, healHp: 100 },
};
const MATERIAL_IDS = new Set(['dirt','stone','copper','iron','silver','gold']);
function isMaterial(id) { return MATERIAL_IDS.has(id); }
function getItemName(id) { return ITEMS[id]?.name || ITEM_NAMES[id] || id; }

// アイテム重量（デフォルト1）
const ITEM_WEIGHTS = {};
function itemWeight(id) {
  if (ITEMS[id]?.weight != null) return ITEMS[id].weight;
  return ITEM_WEIGHTS[id] ?? 1;
}

// 体力
let BASE_HP = 1000;

// ブロック破壊イベント（各層の確率テーブル）
// type: nothing / gold / damage / pitfall
let EVENTS = [
  // 第1層 0-99m
  [
    { type:'nothing', weight:80 },
    { type:'gold',    weight:10, min:5,   max:20  },
    { type:'damage',  weight:5,  min:10,  max:30  },
    { type:'pitfall', weight:3  },
  ],
  // 第2層 100-199m
  [
    { type:'nothing', weight:70 },
    { type:'gold',    weight:10, min:20,  max:80  },
    { type:'damage',  weight:8,  min:20,  max:60  },
    { type:'pitfall', weight:8  },
  ],
  // 第3層 200-299m
  [
    { type:'nothing', weight:60 },
    { type:'gold',    weight:10, min:50,  max:200 },
    { type:'damage',  weight:12, min:50,  max:100 },
    { type:'pitfall', weight:12 },
  ],
];

// 移動エンカウント確率（10Mごと30スロット、1マス移動ごとの %）
let ENCOUNTER = Array.from({length: 30}, (_, i) => ({
  chance: [2, 4, 6][Math.min(2, Math.floor(i / 10))]
}));

// 呪いダメージ（上移動1マスごと、各層）
let CURSE = [
  { min:1,  max:10 }, // 第1層
  { min:3,  max:20 }, // 第2層
  { min:8,  max:40 }, // 第3層
];

// カード定義（拡張用）
let CARDS = {
  fist_d:       { id:'fist_d',       name:'拳で',          desc:'基本攻撃',     icon:'👊', imageUrl:null, ap_cost:10, base_attack:0, mult_min:0.9, mult_max:1.0 },
  drill_attack: { id:'drill_attack', name:'ドリルアタック', desc:'100ダメージ',  icon:'⛏️', imageUrl:null, damage:100 },
};

// カードバトル：キャラ基礎ステータス（管理画面 combatStats で上書き可）
const DEF_COEF = 200; // 防御係数
let COMBAT_STATS = {
  attack: 50, defense: 50, critRate: 10, critDmg: 1.5, maxAp: 100, apRegen: 10,
};

const TARGET_LABELS = {
  SINGLE:       '単体（敵）',
  ALL:          '全体（敵）',
  RANDOM_ENEMY: 'ランダム（敵）',
  RANDOM_ANY:   'ランダム（敵味方）',
  ALLY_SINGLE:  '味方単体',
  ALLY_ALL:     '味方全体',
  SELF:         '自分',
};

// カードのリッチ攻撃力を計算（1枚使用時の合計ダメージ）
// リッチフィールド(base_attack/mult_min...)が無いカードは従来どおり固定damage
// { total, crits } を返す。リッチフィールドなしのカードは固定damage
function computeCardDamage(cardDef, enemyDefense = null) {
  if (!cardDef) return { total: 0, crits: 0 };
  const hasRich = cardDef.base_attack != null || cardDef.mult_max != null;
  if (!hasRich) return { total: cardDef.damage || 0, crits: 0 };

  const def = enemyDefense != null ? enemyDefense : (C?.monster?.defense ?? 0);
  const hits = Math.max(1, Number(cardDef.hit_count) || 1);
  const min = Number(cardDef.mult_min ?? 1);
  const max = Number(cardDef.mult_max ?? min);
  const totalAtk = COMBAT_STATS.attack + (Number(cardDef.base_attack) || 0);
  const critRate = (COMBAT_STATS.critRate + (Number(cardDef.crit_rate_bonus) || 0)) / 100;
  const critDmg  = COMBAT_STATS.critDmg + (Number(cardDef.crit_dmg_bonus) || 0);

  let total = 0, crits = 0;
  for (let h = 0; h < hits; h++) {
    const mult = min + Math.random() * (max - min);
    let dmg = Math.max(1, totalAtk * mult * (DEF_COEF / (DEF_COEF + def)));
    if (Math.random() < critRate) { dmg *= critDmg; crits++; }
    total += Math.floor(dmg);
  }
  return { total, crits };
}

// モンスター定義
let MONSTERS = {
  test_slime: {
    name:'テストスライム', icon:'💚', imageUrl:null, maxHp:200,
    layerWeights: Array.from({length: 30}, (_, i) => i < 10 ? 100 : 0),
    actions: [
      { name:'たいあたり',          damage:30, weight:1 },
      { name:'ぷるぷるふるえている', damage:0,  weight:1 },
      { name:'からみつく',          damage:50, weight:1 },
    ],
  },
};

// ============================================================
// ゲーム状態
// ============================================================

const G = {
  userId: null,
  discordId: null,
  avatarUrl: null,
  mapDate: null,
  seed: 0,
  px: START_X,
  py: START_Y,
  surfaceMode: true,     // true=地上ホーム表示, false=マップ表示
  backpack: {},
  inventory: {},
  drillGold: 0,
  equippedDrillRowId: null,
  equippedDrillId: 'beginner',
  drillDur: null,
  permits: new Set(),
  dugCells: new Set(),   // 'x,y'
  digLocks: new Map(),   // 'x,y' -> {by, exp}
  treasureMap: new Map(), // 'x,y' -> typeId
  otherPlayers: new Map(), // userId -> {x,y}
  isAdmin: false,
  drills: [],            // 所持ドリル一覧
  playerDeckSlots: ['fist_d','fist_d','fist_d','fist_d','fist_d','fist_d','fist_d','fist_d','fist_d','fist_d'],
  ownedCards: { fist_d: 10 },
  mineTarget: null,      // {x,y}
  mineTimer: null,
  mineHP: {},            // 'x,y' -> remaining hp
  logs: [],
  hp: 1000,             // 現在HP
  maxHp: 1000,          // 最大HP
  droppedItems: new Map(), // 'x,y' -> [{id, items:[{item_id,quantity}]}]
  maxBpWeight: 100,
};

let _drillChannel = null; // Realtimeチャンネル参照（Broadcastに使用）
let _moveSaveTimer = null; // 移動後のDB保存デバウンス用
let _hpDirty = false;      // 呪いダメージでHP変化した際のフラグ
let _renderRafId = null;   // RAF描画バッチ用
let _moveActive = false;   // 移動処理の多重実行防止
let _lastMoveTime = 0;     // 最後に移動した時刻（Realtimeエコー無視判定用）

// 戦闘状態
const C = {
  active: false, monster: null, monsterHp: 0,
  hand: [], deck: [], discard: [], logs: [], nextAction: null,
  ap: 0,
  enemies: [],    // 将来の複数敵対応（現在は monster のみ）
  targetIdx: 0,   // 選択中の敵インデックス
  // マルチプレイヤー
  sessionId: null, cx: null, cy: null,
  participants: [], currentRound: 1, myActedRound: 0,
};
let _combatChannel = null; // 戦闘Realtimeチャンネル

let _draggedCardIdx = null;
let _touchCardIdx   = null;
let _touchGhost     = null;
let _touchStartPos  = { x: 0, y: 0 };
let _touchLpTimer   = null;
let _cbMouseLpTimer = null;
let _cbMouseDown    = false;
let _pendingMaterial = null; // { mat, x, y } — リュック満杯時に保留中の素材

// ============================================================
// 乱数（mulberry32）
// ============================================================

function mkRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function cellRng(seed, x, y) {
  const s = (seed ^ (x * 73856093) ^ (y * 19349663)) >>> 0;
  return mkRng(s);
}

function pickW(rng, table) {
  const r = rng();
  for (const [mat, cum] of table) if (r < cum) return mat;
  return table[table.length - 1][0];
}

// ============================================================
// マップ生成
// ============================================================

function cellMat(x, y) {
  if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return null;
  if (G.treasureMap.has(`${x},${y}`)) return 'treasure';
  if (y === 0) return null; // 地上行はマスなし
  const slot = Math.min(LAYER_W.length - 1, Math.floor(y / 10));
  return pickW(cellRng(G.seed, x, y), LAYER_W[slot]);
}

function genTreasures(seed) {
  const map = new Map();
  TREASURE_SLOTS.forEach((slot, s) => {
    const yStart = s * 10 + 1;
    const yEnd   = s * 10 + 9;
    for (const [typeId, count] of Object.entries(slot)) {
      if (!count || count <= 0) continue;
      const rng = mkRng((seed ^ ((s * 7919 + typeId.length * 997) & 0xFFFFFFFF)) >>> 0);
      for (let i = 0; i < count; i++) {
        let att = 0;
        while (att++ < 5000) {
          const x = Math.floor(rng() * MAP_W);
          const y = yStart + Math.floor(rng() * (yEnd - yStart + 1));
          const k = `${x},${y}`;
          if (!map.has(k)) { map.set(k, typeId); break; }
        }
      }
    }
  });
  G.treasureMap = map;
}

// ============================================================
// 視界判定（霧）
// ============================================================

function isVisible(wx, wy) {
  if (wy === 0) return true;
  if (G.dugCells.has(`${wx},${wy}`)) return true;
  // 掘削済みまたは地上に隣接しているマスのみ表示
  const adj = [[0,-1],[0,1],[-1,0],[1,0]];
  for (const [dx, dy] of adj) {
    const nx = wx + dx, ny = wy + dy;
    if (ny === 0) return true;
    if (G.dugCells.has(`${nx},${ny}`)) return true;
  }
  return false;
}

// ============================================================
// 日付・シード
// ============================================================

function gameDate() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 3600000);
  if (jst.getUTCHours() < 5) jst.setUTCDate(jst.getUTCDate() - 1);
  return jst.toISOString().slice(0, 10);
}

async function loadStartX() {
  try {
    const { data } = await supabaseClient
      .from('drill_page_settings')
      .select('setting_value')
      .eq('setting_key', 'start_x')
      .maybeSingle();
    if (data?.setting_value != null) {
      const v = parseInt(data.setting_value, 10);
      if (!isNaN(v) && v >= 0 && v < MAP_W) START_X = v;
    }
  } catch {}
}

async function loadGameConfig() {
  try {
    const { data } = await supabaseClient
      .from('drill_page_settings')
      .select('setting_value')
      .eq('setting_key', 'game_config')
      .maybeSingle();
    if (!data?.setting_value) return;
    const cfg = JSON.parse(data.setting_value);

    if (cfg.mats) {
      for (const [id, v] of Object.entries(cfg.mats)) {
        if (MATS[id] && v.hp != null) MATS[id].hp = v.hp;
      }
    }
    if (cfg.drills) {
      for (const [id, v] of Object.entries(cfg.drills)) {
        if (DRILLS[id]) {
          if (v.power != null)  DRILLS[id].power  = v.power;
          if ('dur'    in v)    DRILLS[id].dur     = v.dur;
          if ('cost'   in v)    DRILLS[id].cost    = v.cost;
          if ('recipe' in v)    DRILLS[id].recipe  = v.recipe;
        }
      }
    }
    // layerWeights は %形式で保存 → 累積確率に変換
    // 旧3層形式（length<=3）との互換性あり
    if (cfg.layerWeights) {
      const lw = cfg.layerWeights;
      const applySlot = (layer, slot) => {
        if (slot >= LAYER_W.length) return;
        let cum = 0;
        LAYER_W[slot] = layer.map(([mat, pct]) => {
          cum += (pct || 0) / 100;
          return [mat, Math.round(cum * 100000) / 100000];
        });
      };
      if (lw.length <= 3) {
        lw.forEach((layer, li) => {
          for (let s = li * 10; s < (li + 1) * 10; s++) applySlot(layer, s);
        });
      } else {
        lw.forEach((layer, i) => applySlot(layer, i));
      }
    }
    if (cfg.shop) {
      cfg.shop.forEach(s => {
        const item = SHOP_ITEMS.find(x => x.id === s.id);
        if (item && s.cost != null) item.cost = s.cost;
      });
    }
    if (cfg.sellPrices) Object.assign(SELL_PRICES, cfg.sellPrices);
    if (cfg.permits) {
      for (const [id, v] of Object.entries(cfg.permits)) {
        if (PERMITS[id] && v.recipe) PERMITS[id].recipe = v.recipe;
      }
    }
    if (cfg.events && Array.isArray(cfg.events)) {
      cfg.events.forEach((layer, i) => { if (Array.isArray(layer)) EVENTS[i] = layer; });
    }
    if (cfg.encounter && Array.isArray(cfg.encounter)) {
      const enc = cfg.encounter;
      if (enc.length <= 3) {
        enc.forEach((e, li) => {
          for (let s = li * 10; s < (li + 1) * 10 && s < ENCOUNTER.length; s++)
            if (e?.chance != null) ENCOUNTER[s] = { ...e };
        });
      } else {
        enc.forEach((e, i) => { if (i < ENCOUNTER.length && e?.chance != null) ENCOUNTER[i] = e; });
      }
    }
    if (cfg.curse && Array.isArray(cfg.curse)) {
      cfg.curse.forEach((c, i) => { if (c) CURSE[i] = c; });
    }
    if (cfg.baseHp != null) BASE_HP = cfg.baseHp;
    if (cfg.monsters) {
      for (const [id, v] of Object.entries(cfg.monsters)) {
        MONSTERS[id] = {
          name: v.name ?? MONSTERS[id]?.name ?? id,
          icon: v.icon ?? MONSTERS[id]?.icon ?? '👾',
          imageUrl: v.imageUrl ?? null,
          maxHp: v.maxHp ?? MONSTERS[id]?.maxHp ?? 100,
          layerWeights: (() => {
            const lw = v.layerWeights ?? MONSTERS[id]?.layerWeights;
            if (!lw) return Array.from({length: 30}, () => 0);
            if (lw.length <= 3) return Array.from({length: 30}, (_, i) => lw[Math.min(lw.length - 1, Math.floor(i / 10))] ?? 0);
            return lw;
          })(),
          actions: (v.actions ?? MONSTERS[id]?.actions ?? []).map(a => ({
            name: a.name ?? '', damage: a.damage ?? 0, weight: a.weight ?? 1,
          })),
        };
      }
    }
    if (cfg.cards) {
      for (const [id, v] of Object.entries(cfg.cards)) {
        CARDS[id] = {
          id,
          name:            v.name       ?? CARDS[id]?.name       ?? id,
          desc:            v.desc       ?? CARDS[id]?.desc       ?? '',
          icon:            v.icon       ?? CARDS[id]?.icon       ?? '⚔️',
          imageUrl:        v.imageUrl   ?? null,
          damage:          v.damage     ?? CARDS[id]?.damage     ?? 0,
          rarity:          v.rarity          ?? CARDS[id]?.rarity          ?? null,
          ap_cost:         v.ap_cost         ?? CARDS[id]?.ap_cost         ?? null,
          base_attack:     v.base_attack     ?? CARDS[id]?.base_attack     ?? null,
          mult_min:        v.mult_min        ?? CARDS[id]?.mult_min        ?? null,
          mult_max:        v.mult_max        ?? CARDS[id]?.mult_max        ?? null,
          crit_rate_bonus: v.crit_rate_bonus ?? CARDS[id]?.crit_rate_bonus ?? null,
          crit_dmg_bonus:  v.crit_dmg_bonus  ?? CARDS[id]?.crit_dmg_bonus  ?? null,
          hit_count:       v.hit_count       ?? CARDS[id]?.hit_count       ?? null,
          target:          v.target          ?? CARDS[id]?.target          ?? 'SINGLE',
          heal:            v.heal            ?? CARDS[id]?.heal            ?? null,
          special_id:      v.special_id      ?? CARDS[id]?.special_id      ?? null,
        };
      }
    }
    if (cfg.combatStats) {
      Object.assign(COMBAT_STATS, cfg.combatStats);
    }
    if (cfg.items) {
      for (const [id, v] of Object.entries(cfg.items)) {
        ITEMS[id] = {
          name:       v.name       ?? ITEMS[id]?.name       ?? id,
          weight:     v.weight     ?? ITEMS[id]?.weight     ?? 1,
          cost:       v.cost       ?? ITEMS[id]?.cost       ?? null,
          effectText: v.effectText ?? ITEMS[id]?.effectText ?? '',
          imageUrl:   v.imageUrl   ?? null,
          healHp:     v.healHp     ?? ITEMS[id]?.healHp     ?? null,
        };
      }
    }
    if (cfg.treasureTypes) {
      TREASURE_TYPES = {};
      for (const [id, v] of Object.entries(cfg.treasureTypes)) {
        TREASURE_TYPES[id] = {
          name: v.name ?? '宝箱',
          imageUrl: v.imageUrl ?? null,
          loot: Array.isArray(v.loot) ? v.loot : [],
        };
      }
    }
    if (cfg.treasureSlots && Array.isArray(cfg.treasureSlots) && cfg.treasureSlots.length > 0) {
      if (cfg.treasureSlots.length >= 30) {
        TREASURE_SLOTS = cfg.treasureSlots;
      } else {
        TREASURE_SLOTS = Array.from({length: 30}, (_, i) =>
          cfg.treasureSlots[Math.min(cfg.treasureSlots.length - 1, Math.floor(i / 10))] ?? {}
        );
      }
    }
  } catch {}
}

async function ensureSeed() {
  G.mapDate = gameDate();
  const { data } = await supabaseClient
    .from('drill_maps').select('seed').eq('map_date', G.mapDate).maybeSingle();
  if (data) { G.seed = data.seed; return; }

  const seed = Math.floor(Math.random() * 2147483647);
  const { error } = await supabaseClient
    .from('drill_maps').insert({ map_date: G.mapDate, seed });
  if (error) {
    const { data: d2 } = await supabaseClient
      .from('drill_maps').select('seed').eq('map_date', G.mapDate).single();
    G.seed = d2.seed;
  } else {
    G.seed = seed;
  }
}

// ============================================================
// DB 読み込み
// ============================================================

async function loadAll() {
  const uid = G.userId;
  const date = G.mapDate;

  const [dugRes, lockRes, posRes, bpRes, invRes, drillRes, permRes, profRes, othRes, dropRes, deckRes] =
    await Promise.all([
      supabaseClient.from('drill_dug_cells').select('x,y').eq('map_date', date),
      supabaseClient.from('drill_dig_locks').select('x,y,locked_by,expires_at')
        .eq('map_date', date).gt('expires_at', new Date().toISOString()),
      supabaseClient.from('drill_player_positions').select('x,y,map_date').eq('user_id', uid).maybeSingle(),
      supabaseClient.from('drill_backpack').select('item_id,quantity').eq('user_id', uid),
      supabaseClient.from('drill_inventory').select('item_id,quantity').eq('user_id', uid),
      supabaseClient.from('drill_player_drills').select('*').eq('user_id', uid),
      supabaseClient.from('drill_player_permits').select('permit_id').eq('user_id', uid),
      supabaseClient.from('profiles').select('drill_gold,drill_hp').eq('discord_user_id', G.discordId).maybeSingle(),
      supabaseClient.from('drill_player_positions').select('user_id,x,y,avatar_url').eq('map_date', date).neq('user_id', uid),
      supabaseClient.from('drill_dropped_items').select('id,pos_x,pos_y,items,dropper_name,cause_of_death,dropped_at,locked_by,locked_until').eq('map_date', date),
      supabaseClient.from('drill_player_deck').select('slots,owned_cards').eq('user_id', uid).maybeSingle(),
    ]);

  G.dugCells = new Set((dugRes.data || []).map(r => `${r.x},${r.y}`));

  G.digLocks = new Map();
  (lockRes.data || []).forEach(r => G.digLocks.set(`${r.x},${r.y}`, { by: r.locked_by, exp: r.expires_at }));

  // 位置
  if (posRes.data && posRes.data.map_date === date) {
    G.px = posRes.data.x;
    G.py = posRes.data.y;
  } else {
    G.px = START_X; G.py = START_Y;
    await savePos();
  }
  G.surfaceMode = (G.py === START_Y);

  // リュック
  G.backpack = {};
  (bpRes.data || []).forEach(r => { if (r.quantity > 0) G.backpack[r.item_id] = r.quantity; });

  // 倉庫
  G.inventory = {};
  (invRes.data || []).forEach(r => { if (r.quantity > 0) G.inventory[r.item_id] = r.quantity; });

  // ドリル
  const drills = drillRes.data || [];
  let equipped = drills.find(d => d.equipped);
  if (!equipped && drills.length > 0) equipped = drills[0];
  if (!equipped) {
    // 初心者ドリルを付与
    const { data: nd } = await supabaseClient.from('drill_player_drills')
      .insert({ user_id: uid, drill_id: 'beginner', durability: null, equipped: true })
      .select().single();
    equipped = nd;
    if (nd) drills.push(nd);
  }
  if (equipped) {
    G.equippedDrillRowId = equipped.id;
    G.equippedDrillId = equipped.drill_id;
    G.drillDur = equipped.durability;
  }
  G.drills = drills;

  // 許可証
  G.permits = new Set((permRes.data || []).map(r => r.permit_id));

  // デッキ・所持カード
  if (deckRes.data) {
    G.playerDeckSlots = (deckRes.data.slots ?? G.playerDeckSlots)
      .map(s => s === 'attack' ? 'fist_d' : s);
    G.ownedCards = deckRes.data.owned_cards ?? G.ownedCards;
    if (G.ownedCards.attack) {
      G.ownedCards.fist_d = (G.ownedCards.fist_d || 0) + G.ownedCards.attack;
      delete G.ownedCards.attack;
    }
  } else {
    // 初回：デフォルトデッキをDBに保存
    await supabaseClient.from('drill_player_deck').upsert({ user_id: uid, slots: G.playerDeckSlots, owned_cards: G.ownedCards });
  }

  // ゴールド・HP
  G.drillGold = profRes.data?.drill_gold || 0;
  G.hp = profRes.data?.drill_hp ?? G.maxHp;

  // 他プレイヤー
  G.otherPlayers = new Map();
  (othRes.data || []).forEach(r => G.otherPlayers.set(r.user_id, { x: r.x, y: r.y, avatarUrl: r.avatar_url || null }));

  // 落下アイテム（今日のマップのみ）
  G.droppedItems = new Map();
  (dropRes.data || []).forEach(r => {
    const key = `${r.pos_x},${r.pos_y}`;
    if (!G.droppedItems.has(key)) G.droppedItems.set(key, []);
    G.droppedItems.get(key).push({
      id: r.id, items: r.items || [],
      dropper_name: r.dropper_name || '???',
      cause_of_death: r.cause_of_death || null,
      dropped_at: r.dropped_at,
      locked_by: r.locked_by || null,
      locked_until: r.locked_until || null,
    });
  });

  // アクティブ戦闘セッションを読み込む
  await loadActiveCombatSessions();
}

// ============================================================
// DB 書き込み
// ============================================================

async function savePos() {
  await supabaseClient.from('drill_player_positions').upsert({
    user_id: G.userId, map_date: G.mapDate, x: G.px, y: G.py,
    avatar_url: G.avatarUrl,
    updated_at: new Date().toISOString(),
  });
  // Broadcastで全端末に即時配信
  _drillChannel?.send({
    type: 'broadcast', event: 'pos',
    payload: { uid: G.userId, x: G.px, y: G.py, date: G.mapDate, av: G.avatarUrl },
  }).catch(() => {});
}

async function saveHp() {
  await supabaseClient.from('profiles').update({ drill_hp: G.hp }).eq('discord_user_id', G.discordId);
}

function bpWeight() {
  let w = 0;
  for (const [id, qty] of Object.entries(G.backpack)) w += itemWeight(id) * (qty || 0);
  return w;
}

async function saveBpItem(itemId, qty) {
  if (qty <= 0) {
    await supabaseClient.from('drill_backpack')
      .delete().eq('user_id', G.userId).eq('item_id', itemId);
  } else {
    await supabaseClient.from('drill_backpack')
      .upsert({ user_id: G.userId, item_id: itemId, quantity: qty });
  }
}

async function upsertInv(itemId, delta) {
  const cur = G.inventory[itemId] || 0;
  const next = Math.max(0, cur + delta);
  G.inventory[itemId] = next;
  if (next === 0) {
    await supabaseClient.from('drill_inventory')
      .delete().eq('user_id', G.userId).eq('item_id', itemId);
  } else {
    await supabaseClient.from('drill_inventory')
      .upsert({ user_id: G.userId, item_id: itemId, quantity: next });
  }
}

async function acquireLock(x, y) {
  const exp = new Date(Date.now() + LOCK_TTL_MS).toISOString();
  await supabaseClient.from('drill_dig_locks').upsert({
    map_date: G.mapDate, x, y, locked_by: G.userId, expires_at: exp,
  });
  G.digLocks.set(`${x},${y}`, { by: G.userId, exp });
}

async function releaseLock(x, y) {
  await supabaseClient.from('drill_dig_locks')
    .delete().eq('map_date', G.mapDate).eq('x', x).eq('y', y).eq('locked_by', G.userId);
  G.digLocks.delete(`${x},${y}`);
}

// ============================================================
// 移動
// ============================================================

async function move(dx, dy) {
  if (_moveActive || G.mineTarget) return;
  _moveActive = true;
  const nx = G.px + dx, ny = G.py + dy;
  if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) { _moveActive = false; return; }

  const isDug = G.dugCells.has(`${nx},${ny}`) || ny === 0;

  // モンスターセルへの移動 → 参加プロンプト
  const combatHere = G.activeCombats?.get(`${nx},${ny}`);
  if (combatHere && combatHere.id !== C.sessionId) {
    await showJoinCombatPrompt(combatHere, nx, ny);
    _moveActive = false;
    return;
  }

  if (!isDug) {
    if (Math.abs(dx) + Math.abs(dy) === 1) {
      if (cellMat(nx, ny) === 'treasure') {
        await collectTreasure(nx, ny);
      } else {
        startMine(nx, ny);
      }
    }
    _moveActive = false;
    return;
  }

  // ── 即座に位置更新・描画（DB保存を待たない）──
  _lastMoveTime = Date.now();
  G.px = nx; G.py = ny;
  if (ny === START_Y) {
    G.surfaceMode = true;
    if (G.hp < G.maxHp) { G.hp = G.maxHp; _hpDirty = true; }
    // 地上到達：素材を自動倉庫預け
    const matsToStore = Object.entries(G.backpack).filter(([id, v]) => v > 0 && isMaterial(id));
    for (const [item, qty] of matsToStore) {
      await upsertInv(item, qty);
      G.backpack[item] = 0;
      await saveBpItem(item, 0);
    }
    if (matsToStore.length > 0) log(`📦 素材 ${matsToStore.length}種を倉庫に自動預け`);
  }

  // 呪い：ローカルにHP即適用（死亡のみ await）
  // 許可証なしで該当層にいる場合はダメージ10倍
  if (dy < 0 && ny > START_Y) {
    const li = Math.min(CURSE.length - 1, Math.floor(ny / 100));
    const c  = CURSE[li];
    const noPermit = (ny >= 100 && ny < 200 && !G.permits.has('permit_100'))
                  || (ny >= 200 && !G.permits.has('permit_200'));
    const base = Math.floor(Math.random() * (c.max - c.min + 1)) + c.min;
    const dmg  = noPermit ? base * 10 : base;
    showCurseOverlay(noPermit ? 'strong' : 'weak');
    G.hp = Math.max(0, G.hp - dmg);
    _hpDirty = true;
    if (G.hp <= 0) {
      clearTimeout(_moveSaveTimer);
      _hpDirty = false;
      _moveActive = false;
      await handleDeath('呪い');
      return;
    }
  }

  scheduleRender();

  // 落下アイテム確認（移動をブロックしない、モーダル表示中はスキップ）
  if (!G.surfaceMode && !_lockedDropId) collectDroppedItems(nx, ny).catch(() => {});

  // エンカウントチェック（地下の掘り済みマスのみ・戦闘中は除外）
  if (!C.active && !G.surfaceMode && ny > START_Y) {
    const li  = Math.min(ENCOUNTER.length - 1, Math.floor(ny / 10));
    const enc = ENCOUNTER[li];
    if (enc && Math.random() * 100 < enc.chance) {
      log('⚔️ 敵と遭遇！');
      const monsterId = pickCombatMonster(li);
      if (monsterId) await startCombat(monsterId, nx, ny);
    }
  }

  _moveActive = false;

  // ── DB保存はデバウンス：連打中は最後の位置だけ書き込む ──
  clearTimeout(_moveSaveTimer);
  _moveSaveTimer = setTimeout(async () => {
    if (_hpDirty) { _hpDirty = false; saveHp().catch(() => {}); }
    await savePos();
  }, 200);
}

// ============================================================
// 採掘
// ============================================================

function startMine(x, y) {
  const key = `${x},${y}`;
  if (G.dugCells.has(key)) return;
  if (G.digLocks.has(key) && G.digLocks.get(key).by !== G.userId) {
    log('⚠️ 他のプレイヤーが掘削中です'); return;
  }

  stopMine(false);

  const mat = cellMat(x, y);
  if (!mat) return;

  G.mineTarget = { x, y };
  G.mineHP[key] = MATS[mat].hp;
  acquireLock(x, y);
  G.mineTimer = setInterval(mineTick, MINE_TICK_MS);
  log(`⛏️ ${MATS[mat].name}を掘削中...`);
  render();
}

async function mineTick() {
  if (!G.mineTarget) return;
  const { x, y } = G.mineTarget;
  const key = `${x},${y}`;
  const mat = cellMat(x, y);
  if (!mat) { stopMine(); return; }

  const drill = DRILLS[G.equippedDrillId] || DRILLS.beginner;
  const prevHP = G.mineHP[key] ?? MATS[mat].hp;
  const dmg = Math.min(drill.power, prevHP);  // 実際に与えたダメージ
  G.mineHP[key] = prevHP - dmg;

  // ロック延長
  acquireLock(x, y);

  // ドリル耐久消費（実ダメージ分のみ）
  if (G.drillDur !== null) {
    G.drillDur -= dmg;
    if (G.drillDur <= 0) {
      await breakDrill();
      stopMine();
      return;
    }
    await supabaseClient.from('drill_player_drills')
      .update({ durability: Math.max(0, G.drillDur) }).eq('id', G.equippedDrillRowId);
  }

  if (G.mineHP[key] <= 0) {
    G.mineHP[key] = 0;  // 100%表示してから破壊
    renderMap();
    await finishMine(x, y, mat);
  } else {
    renderMap();
  }
}

async function finishMine(x, y, mat) {
  if (!G.mineTarget) return;
  clearInterval(G.mineTimer);
  G.mineTimer = null;
  const key = `${x},${y}`;
  delete G.mineHP[key];
  G.mineTarget = null;

  const { error: dugErr } = await supabaseClient.from('drill_dug_cells')
    .insert({ map_date: G.mapDate, x, y, dug_by: G.userId });
  G.dugCells.add(key);
  await releaseLock(x, y);

  if (dugErr) {
    // 別端末が先に採掘済み → アイテム付与しない
    log('⚠️ 別端末と採掘が競合しました（アイテムなし）');
    render();
    return;
  }

  if (mat === 'treasure') {
    await openTreasure(x, y);
  } else {
    if (bpWeight() + itemWeight(mat) > G.maxBpWeight) {
      _pendingMaterial = { mat, x, y };
      showBagFullModal();
      render();
      return;
    }
    G.backpack[mat] = (G.backpack[mat] || 0) + 1;
    await saveBpItem(mat, G.backpack[mat]);
    log(`✅ ${MATS[mat].name}を採掘`);
  }
  render();

  // ブロック破壊イベント（宝箱は除外）
  if (mat !== 'treasure') await triggerBlockEvent(x, y);
}

function stopMine(release = true) {
  if (G.mineTimer) { clearInterval(G.mineTimer); G.mineTimer = null; }
  if (G.mineTarget && release) releaseLock(G.mineTarget.x, G.mineTarget.y);
  if (G.mineTarget) { delete G.mineHP[`${G.mineTarget.x},${G.mineTarget.y}`]; }
  G.mineTarget = null;
}

async function breakDrill() {
  await supabaseClient.from('drill_player_drills').delete().eq('id', G.equippedDrillRowId);
  G.drills = G.drills.filter(d => d.id !== G.equippedDrillRowId);
  G.equippedDrillRowId = null;
  G.equippedDrillId = 'beginner';
  G.drillDur = null;
  log('⚠️ ドリルが壊れました！初心者ドリルに切り替え');
}

// ============================================================
// イベントシステム
// ============================================================

function pickEvent(layerIdx) {
  const evs = EVENTS[Math.min(layerIdx, EVENTS.length - 1)];
  const total = evs.reduce((s, e) => s + e.weight, 0);
  let r = Math.random() * total;
  for (const ev of evs) { r -= ev.weight; if (r <= 0) return ev; }
  return evs[evs.length - 1];
}

async function triggerBlockEvent(x, y) {
  const li  = Math.min(EVENTS.length - 1, Math.floor(y / 100));
  const ev  = pickEvent(li);
  if (ev.type === 'nothing') return;

  if (ev.type === 'gold') {
    const amount = Math.floor(Math.random() * (ev.max - ev.min + 1)) + ev.min;
    G.drillGold += amount;
    await supabaseClient.from('profiles').update({ drill_gold: G.drillGold }).eq('discord_user_id', G.discordId);
    log(`✨ イベント: お金発見！ +${amount}G`);
    renderSide(); renderMap();
    showEventModal('💰', `<span style="color:#f0c060;font-size:1.5rem;font-weight:700;">+${amount}G</span><br><span style="opacity:.75;">お金を発見！</span>`);

  } else if (ev.type === 'damage') {
    const dmg = Math.floor(Math.random() * (ev.max - ev.min + 1)) + ev.min;
    G.hp = Math.max(0, G.hp - dmg);
    await saveHp();
    log(`💥 イベント: ダメージ！ -${dmg}HP（残り ${G.hp}）`);
    renderSide();
    if (G.hp <= 0) {
      await handleDeath('ダメージイベント');
    } else {
      showEventModal('💥', `<span style="color:#ff5555;font-size:1.4rem;font-weight:700;">-${dmg}HP</span><br><span style="opacity:.75;">ダメージを受けた！</span><br><span style="font-size:.8rem;opacity:.55;">残りHP: ${G.hp} / ${G.maxHp}</span>`);
    }

  } else if (ev.type === 'pitfall') {
    log('🕳️ イベント: 落とし穴！');
    showEventModal('🕳️', '<span style="font-size:1rem;font-weight:700;">落とし穴！</span><br><span style="opacity:.7;font-size:.9rem;">30m落下します...</span>', () => teleportPitfall());

  }
}

async function teleportPitfall() {
  const FALL = 30;
  const newY = Math.min(MAP_H - 1, G.py + FALL);
  const newX = Math.floor(Math.random() * MAP_W);
  const key  = `${newX},${newY}`;

  // 転移先にブロックがあれば無音で消去（ドロップなし、イベントなし）
  if (!G.dugCells.has(key) && cellMat(newX, newY)) {
    const { error } = await supabaseClient.from('drill_dug_cells')
      .insert({ map_date: G.mapDate, x: newX, y: newY, dug_by: G.userId });
    if (!error) G.dugCells.add(key);
  }

  G.px = newX; G.py = newY;
  await savePos();
  log(`🕳️ ${FALL}m落下！ → (${newX}, ${newY}m)`);
  render();
}

async function handleDeath(cause = '不明') {
  stopMine();
  closeModal();
  G.hp = 0;
  renderSide();

  // 素材のみその場に落とす（アイテムはbackpackに残す）
  const bpMats = Object.entries(G.backpack).filter(([id, v]) => v > 0 && isMaterial(id));
  if (bpMats.length > 0) {
    const items = bpMats.map(([item_id, quantity]) => ({ item_id, quantity }));
    const { data: drop } = await supabaseClient.from('drill_dropped_items').insert({
      map_date: G.mapDate, pos_x: G.px, pos_y: G.py,
      dropper_user_id: G.userId,
      dropper_name: G.displayName || '名無し',
      cause_of_death: cause,
      items,
    }).select().single();
    if (drop) {
      const dkey = `${G.px},${G.py}`;
      if (!G.droppedItems.has(dkey)) G.droppedItems.set(dkey, []);
      G.droppedItems.get(dkey).push({
        id: drop.id, items,
        dropper_name: G.displayName || '名無し',
        cause_of_death: cause,
        dropped_at: drop.dropped_at,
      });
    }
    for (const [id] of bpMats) {
      G.backpack[id] = 0;
      await saveBpItem(id, 0);
    }
  }

  const lostMsg = bpMats.length > 0
    ? `${bpMats.length}種の素材をその場に落とした`
    : '何も落とさなかった';
  log(`💀 HP が尽きた！死因: ${cause}。${lostMsg}`);

  // 死亡画面を表示してユーザーが閉じるまで待機
  await new Promise(resolve => {
    document.getElementById('modal-inner').innerHTML = `
      <div style="text-align:center;padding:10px 0 20px;">
        <div style="font-size:3.5rem;margin-bottom:14px;">💀</div>
        <div style="font-size:1.15rem;font-weight:700;color:#ff5555;margin-bottom:14px;">力尽きた...</div>
        <div style="font-size:.85rem;opacity:.7;margin-bottom:4px;">死因: ${escHtml(cause)}</div>
        <div style="font-size:.85rem;opacity:.7;">${lostMsg}</div>
      </div>
      <button class="btn-modal-close" id="death-ok-btn">地上へ戻る ↩️</button>`;
    document.getElementById('modal-overlay').style.display = 'flex';
    document.getElementById('death-ok-btn').addEventListener('click', resolve, { once: true });
  });
  closeModal();

  // HP全回復して地上へ
  G.hp = G.maxHp;
  await saveHp();
  G.px = START_X; G.py = START_Y;
  G.surfaceMode = true;
  await savePos();
  render();
}

async function collectDroppedItems(x, y) {
  const key   = `${x},${y}`;
  const drops = G.droppedItems.get(key);
  if (!drops || drops.length === 0) return;
  const drop = drops[0];
  if (isDropLocked(drop)) {
    log('🔒 他のプレイヤーが確認中です...');
    return;
  }
  const got = await acquireDropLock(drop.id);
  if (!got) {
    log('🔒 他のプレイヤーが確認中です...');
    return;
  }
  showDropModal(x, y, drop);
}

// ============================================================
// 宝箱
// ============================================================

// 宝箱を即時開封（採掘なし）
async function collectTreasure(x, y) {
  const key = `${x},${y}`;

  if (G.dugCells.has(key)) {
    // 開封済み — 残りアイテムがあれば再表示
    const drops = G.droppedItems.get(key);
    const td = drops?.find(d => d.cause_of_death === 'treasure' && !isDropLocked(d));
    if (td) {
      const got = await acquireDropLock(td.id);
      if (got) showDropModal(x, y, td);
    }
    return;
  }

  if (G.digLocks.has(key) && G.digLocks.get(key).by !== G.userId) {
    log('⚠️ 他のプレイヤーが開封中です');
    return;
  }

  const { error } = await supabaseClient.from('drill_dug_cells')
    .insert({ map_date: G.mapDate, x, y, dug_by: G.userId });
  G.dugCells.add(key);
  if (error) { scheduleRender(); return; }

  await openTreasure(x, y);
  scheduleRender();
}

async function openTreasure(x, y) {
  const key     = `${x},${y}`;
  const typeId  = G.treasureMap.get(key);
  const typeDef = TREASURE_TYPES[typeId];
  if (!typeDef) { log('⚠️ 宝箱の設定が見つかりません'); return; }

  const chestIcon = typeDef.imageUrl
    ? `<img src="${escHtml(typeDef.imageUrl)}" style="width:56px;height:56px;object-fit:contain;">`
    : '📦';

  const loot = typeDef.loot ?? [];
  if (loot.length === 0) {
    showEventModal(chestIcon, `<strong>${escHtml(typeDef.name)}</strong><br><span style="opacity:.7;">中身が空だった…</span>`);
    return;
  }

  const rng = cellRng(G.seed + 99, x, y);
  const r   = rng();
  const total = loot.reduce((s, l) => s + (l.weight ?? 1), 0);
  let pick = r * total;
  let chosen = loot[loot.length - 1];
  for (const l of loot) { pick -= (l.weight ?? 1); if (pick <= 0) { chosen = l; break; } }

  if (chosen.type === 'gold') {
    const amount = Math.floor(Math.random() * ((chosen.max ?? 100) - (chosen.min ?? 0) + 1)) + (chosen.min ?? 0);
    G.drillGold += amount;
    await supabaseClient.from('profiles').update({ drill_gold: G.drillGold }).eq('discord_user_id', G.discordId);
    log(`🎁 ${typeDef.name} → 💰 ${amount}G`);
    showEventModal(chestIcon, `<span style="opacity:.7;font-size:.85rem;">${escHtml(typeDef.name)}</span><br><span style="color:#f0c060;font-size:1.6rem;font-weight:700;">💰 ${amount}G</span>`);
    return;
  }

  if (chosen.type === 'item') {
    const items = [{ item_id: chosen.itemId, quantity: chosen.qty ?? 1 }];
    const { data: drop } = await supabaseClient.from('drill_dropped_items').insert({
      map_date: G.mapDate, pos_x: x, pos_y: y,
      items,
      dropper_user_id: G.userId,
      dropper_name: typeDef.name,
      cause_of_death: 'treasure',
      dropped_at: new Date().toISOString(),
    }).select().single();

    if (drop) {
      if (!G.droppedItems.has(key)) G.droppedItems.set(key, []);
      const entry = { id: drop.id, items, dropper_name: typeDef.name, cause_of_death: 'treasure', dropped_at: drop.dropped_at };
      G.droppedItems.get(key).push(entry);
      const got = await acquireDropLock(drop.id);
      if (got) showDropModal(x, y, entry);
    }
  }
}

// ============================================================
// 帰還
// ============================================================

async function returnSurface(useStone = false) {
  if (useStone) {
    if ((G.backpack['return_stone'] || 0) <= 0 && (G.inventory['return_stone'] || 0) <= 0) {
      log('⚠️ 帰還石がありません'); return;
    }
    // リュックから優先消費
    if ((G.backpack['return_stone'] || 0) > 0) {
      G.backpack['return_stone']--;
      await saveBpItem('return_stone', G.backpack['return_stone']);
    } else {
      await upsertInv('return_stone', -1);
    }
  }

  stopMine();
  closeModal();

  // 素材のみ倉庫へ転送（アイテムはbackpackのまま）
  const matsToStore = Object.entries(G.backpack).filter(([id, v]) => v > 0 && isMaterial(id));
  for (const [item, qty] of matsToStore) {
    await upsertInv(item, qty);
    G.backpack[item] = 0;
    await saveBpItem(item, 0);
  }

  G.px = START_X; G.py = START_Y;
  G.surfaceMode = true;
  await savePos();

  // 地上帰還でHP全回復
  G.hp = G.maxHp;
  await saveHp();

  log(`↩️ 帰還完了！${matsToStore.length > 0 ? `${matsToStore.length}種類の素材を確定` : '手ぶら'}（HP全回復）`);
  render();
}

// ============================================================
// ショップ
// ============================================================

function showShop(tab = 'drill') {
  if (G.py !== 0) { log('⚠️ ショップは地上のみ'); return; }

  const tabs = ['drill','item','card','sell'];
  const tabLabels = { drill:'⛏️ ドリル', item:'💊 アイテム', card:'🃏 カード', sell:'💰 売却' };

  const tabBar = tabs.map(t => `
    <button onclick="showShop('${t}')"
      style="flex:1;padding:6px 0;border:none;border-bottom:2px solid ${t===tab?'rgba(255,200,80,.9)':'transparent'};
             background:none;color:${t===tab?'rgba(255,200,80,.9)':'rgba(255,255,255,.55)'};
             font-size:.75rem;cursor:pointer;">${tabLabels[t]}</button>`).join('');

  let body = '';

  if (tab === 'drill') {
    for (const item of SHOP_ITEMS.filter(i => i.type === 'drill')) {
      const def = DRILLS[item.drillId] ?? {};
      const canBuy = G.drillGold >= item.cost;
      const stats = `<span style="color:rgba(255,200,80,.8);">発掘力 ${def.power ?? '?'}</span> ／ 耐久 ${def.dur ?? '∞'}`;
      body += `<div class="modal-row">
        <div><div class="modal-row-label">${item.name}</div>
        <div class="modal-row-sub">${item.cost}G　${stats}</div></div>
        <button class="btn-modal-action" onclick="buyShopDrill('${item.id}')" ${canBuy?'':'disabled'}>購入</button>
      </div>`;
    }

  } else if (tab === 'item') {
    const shopItems = Object.entries(ITEMS).filter(([, def]) => def.cost > 0);
    if (shopItems.length) {
      for (const [id, def] of shopItems) {
        const canBuy = G.drillGold >= def.cost;
        body += `<div class="modal-row">
          <div><div class="modal-row-label">${escHtml(def.name)}</div>
          <div class="modal-row-sub">${def.cost}G${def.effectText ? ' ／ ' + escHtml(def.effectText) : ''}</div></div>
          <button class="btn-modal-action" onclick="buyGameItem('${id}')" ${canBuy?'':'disabled'}>購入</button>
        </div>`;
      }
    } else {
      body = `<div style="opacity:.45;font-size:.82rem;padding:12px 0;">販売中のアイテムはありません</div>`;
    }

  } else if (tab === 'card') {
    const cardItems = SHOP_ITEMS.filter(i => i.type === 'card');
    if (cardItems.length) {
      for (const item of cardItems) {
        const def = CARDS[item.cardId] ?? {};
        const canBuy = G.drillGold >= item.cost;
        const ownedCount = G.ownedCards[item.cardId] || 0;
        const rank = rankFromId(item.cardId);
        const rankDot = rank
          ? `<span class="rank-badge rank-badge-${rank}" style="position:static;display:inline-flex;vertical-align:middle;margin-right:4px;">${rank.toUpperCase()}</span>`
          : '';
        body += `<div class="modal-row">
          <div><div class="modal-row-label">${rankDot}${escHtml(item.name)}</div>
          <div class="modal-row-sub">${item.cost}G　${def.icon ?? ''} ${def.desc ?? ''}${ownedCount > 0 ? `　<span style="opacity:.55;">所持: ${ownedCount}枚</span>` : ''}</div></div>
          <button class="btn-modal-action" onclick="buyShopDrill('${item.id}')" ${canBuy?'':'disabled'}>購入</button>
        </div>`;
      }
    } else {
      body = `<div style="opacity:.45;font-size:.82rem;padding:12px 0;">販売中のカードはありません</div>`;
    }

  } else if (tab === 'sell') {
    const sellable = Object.entries(G.inventory)
      .filter(([k, v]) => v > 0 && SELL_PRICES[k])
      .sort((a, b) => (SELL_PRICES[b[0]] || 0) - (SELL_PRICES[a[0]] || 0));
    if (sellable.length === 0) {
      body = `<div style="font-size:.85rem;opacity:.5;padding:10px 0;">売却できる素材がありません<br><span style="font-size:.75rem;">（帰還して素材を確定してください）</span></div>`;
    } else {
      body = `<div style="font-size:.72rem;opacity:.5;margin-bottom:10px;">売却する個数を選んでください（初期値: 0個）</div>`;
      for (const [item, qty] of sellable) {
        const price = SELL_PRICES[item];
        body += `<div class="modal-row" style="flex-wrap:nowrap;gap:6px;align-items:center;">
          <div style="flex:1;min-width:0;">
            <div class="modal-row-label">${MATS[item]?.name || item}</div>
            <div class="modal-row-sub">所持 ${qty}個 ／ 1個 ${price}G</div>
          </div>
          <div style="display:flex;align-items:center;gap:5px;flex-shrink:0;">
            <input id="sell-qty-${item}" type="number" min="0" max="${qty}" value="0"
              style="width:58px;padding:4px 6px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.25);border-radius:6px;color:#fff;font-size:.82rem;text-align:center;"
              oninput="updateSellTotal()">
            <button class="btn-modal-action" style="font-size:.7rem;padding:4px 9px;white-space:nowrap;" onclick="setSellMax('${item}',${qty})">MAX</button>
          </div>
        </div>`;
      }
      body += `
        <div style="margin-top:14px;padding:10px 12px;background:rgba(255,255,255,.06);border-radius:8px;display:flex;justify-content:space-between;align-items:center;">
          <span style="font-size:.82rem;opacity:.7;">売却合計</span>
          <span id="sell-total-disp" style="font-size:1.05rem;font-weight:700;color:#d4a853;">0G</span>
        </div>
        <button class="btn-modal-action" id="sell-go-btn" style="width:100%;margin-top:10px;opacity:.35;cursor:default;" disabled onclick="showSellConfirm()">💰 売却する</button>`;
    }
  }

  const html = `<div class="modal-title">🛒 ショップ</div>
    <div style="font-size:.82rem;margin-bottom:10px;">所持金: 💰 ${G.drillGold}G</div>
    <div style="display:flex;border-bottom:1px solid rgba(255,255,255,.15);margin-bottom:10px;">${tabBar}</div>
    <div style="min-height:220px;">${body}</div>
    <button class="btn-modal-close" onclick="closeModal()">閉じる</button>`;
  openModal(html);
}

async function buyShopDrill(shopId) {
  const item = SHOP_ITEMS.find(i => i.id === shopId);
  if (!item || G.drillGold < item.cost) { log('⚠️ 所持金不足'); return; }

  if (item.type === 'card') {
    G.drillGold -= item.cost;
    await supabaseClient.from('profiles').update({ drill_gold: G.drillGold }).eq('discord_user_id', G.discordId);
    G.ownedCards[item.cardId] = (G.ownedCards[item.cardId] || 0) + 1;
    await supabaseClient.from('drill_player_deck').upsert({ user_id: G.userId, owned_cards: G.ownedCards });
    log(`✅ ${item.name}を購入（${G.ownedCards[item.cardId]}枚目）`);
    const cardIcon = (CARDS[item.cardId] ?? {}).icon ?? '🃏';
    showEventModal(cardIcon, `<strong>${escHtml(item.name)}</strong>を購入しました！<br><span style="color:#f0c060;font-size:.85rem;">-${item.cost} G</span>`, () => showShop('card'));
    return;
  }

  G.drillGold -= item.cost;
  await supabaseClient.from('profiles').update({ drill_gold: G.drillGold }).eq('discord_user_id', G.discordId);

  if (item.type === 'drill') {
    const { data: nd } = await supabaseClient.from('drill_player_drills').insert({
      user_id: G.userId, drill_id: item.drillId,
      durability: DRILLS[item.drillId].dur, equipped: false,
    }).select().single();
    if (nd) G.drills.push(nd);
    log(`✅ ${item.name}を購入`);
    showEventModal('⛏️', `<strong>${escHtml(item.name)}</strong>を購入しました！<br><span style="color:#f0c060;font-size:.85rem;">-${item.cost} G</span>`, () => showShop('drill'));
  } else {
    await upsertInv(item.itemId, 1);
    log(`✅ ${item.name}を購入`);
    showShop('item');
  }
}

// 後方互換：旧 buyItem 呼び出しが残っていた場合の対応
async function buyItem(shopId) {
  return buyShopDrill(shopId);
}

async function buyGameItem(id) {
  const def = ITEMS[id];
  if (!def || !def.cost) return;
  if (G.drillGold < def.cost) { log('⚠️ 所持金不足'); return; }
  if (bpWeight() + itemWeight(id) > G.maxBpWeight) { log('⚠️ リュックが満杯！'); return; }
  G.drillGold -= def.cost;
  await supabaseClient.from('profiles').update({ drill_gold: G.drillGold }).eq('discord_user_id', G.discordId);
  G.backpack[id] = (G.backpack[id] || 0) + 1;
  await saveBpItem(id, G.backpack[id]);
  const img = def.imageUrl ? `<img src="${escHtml(def.imageUrl)}" style="width:40px;height:40px;object-fit:contain;display:block;margin:0 auto 8px;">` : '🛍️';
  showEventModal(img, `<strong>${escHtml(def.name)}</strong>を購入しました！<br><span style="color:#f0c060;font-size:.85rem;">-${def.cost} G</span>`, () => showShop());
}

// ============================================================
// アイテム使用
// ============================================================

async function useItem(id) {
  const def = ITEMS[id];
  if (!def) return;
  const qty = G.backpack[id] || 0;
  if (qty <= 0) { log(`⚠️ ${def.name}がリュックにありません`); showBag('items'); return; }

  if (id === 'return_stone') {
    await returnSurface(true);
    return;
  }

  if (def.healHp) {
    if (G.hp >= G.maxHp) { log('⚠️ HPは既に満タンです'); return; }
    const healed = Math.min(def.healHp, G.maxHp - G.hp);
    G.hp += healed;
    await saveHp();
    G.backpack[id]--;
    await saveBpItem(id, G.backpack[id]);
    log(`💊 ${def.name}使用: HP +${healed} (${G.hp}/${G.maxHp})`);
    showEventModal('💊', `<span style="color:#6bde9b;font-size:1.4rem;font-weight:700;">HP +${healed}</span><br><span style="opacity:.75;">回復した！</span>`);
    renderSide();
    return;
  }

  log(`🎒 ${def.name}を使用`);
}

function showWithdrawDialog(id, maxQty) {
  const def = ITEMS[id] ?? {};
  const canFit = Math.floor((G.maxBpWeight - bpWeight()) / itemWeight(id));
  const limit = Math.min(maxQty, canFit);
  const img = def.imageUrl ? `<img src="${escHtml(def.imageUrl)}" style="width:32px;height:32px;object-fit:contain;vertical-align:middle;margin-right:6px;">` : '';
  const html = `<div class="modal-title">📤 取り出す</div>
    <div style="margin-bottom:10px;display:flex;align-items:center;">${img}<strong>${escHtml(def.name || id)}</strong></div>
    <div style="margin-bottom:12px;font-size:.82rem;opacity:.7;">倉庫: ×${maxQty}　持てる最大: ×${limit > 0 ? limit : 0}</div>
    ${limit > 0 ? `
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
      <label style="font-size:.85rem;">個数</label>
      <input id="withdraw-qty" type="number" min="1" max="${limit}" value="1"
        style="width:80px;padding:4px 8px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);border-radius:6px;color:#fff;font-size:.9rem;">
      <span style="font-size:.82rem;opacity:.6;">/ ${maxQty}</span>
    </div>
    <div style="display:flex;gap:8px;">
      <button class="btn-modal-action" style="flex:1;" onclick="confirmWithdraw('${id}',${maxQty})">取り出す</button>
      <button class="btn-modal-close" style="flex:1;" onclick="showWarehouse('items')">戻る</button>
    </div>` : `
    <div style="color:#ff8888;font-size:.85rem;margin-bottom:16px;">⚠️ リュックに空きがありません</div>
    <button class="btn-modal-close" style="width:100%;" onclick="showWarehouse('items')">戻る</button>`}`;
  openModal(html);
}

async function confirmWithdraw(id, maxQty) {
  const input = document.getElementById('withdraw-qty');
  const qty = Math.max(1, Math.min(parseInt(input?.value || '1'), maxQty));
  await withdrawItem(id, qty);
}

async function depositItem(id) {
  if (G.py > 0) { log('⚠️ 倉庫は地上でのみ利用できます'); return; }
  const def = ITEMS[id] ?? {};
  const qty = G.backpack[id] || 0;
  if (qty <= 0) return;
  await upsertInv(id, qty);
  G.backpack[id] = 0;
  await saveBpItem(id, 0);
  log(`📦 ${def.name || id} ×${qty} を倉庫に預けた`);
  showBag('items');
}

async function withdrawItem(id, qty) {
  const def = ITEMS[id] ?? {};
  const available = G.inventory[id] || 0;
  const actual = Math.min(qty, available);
  if (actual <= 0) return;
  const canFit = Math.floor((G.maxBpWeight - bpWeight()) / itemWeight(id));
  const take = Math.min(actual, canFit);
  if (take <= 0) { log('⚠️ リュックが満杯です'); return; }
  await upsertInv(id, -take);
  G.backpack[id] = (G.backpack[id] || 0) + take;
  await saveBpItem(id, G.backpack[id]);
  log(`📤 ${def.name || id} ×${take} を倉庫から取り出した`);
  showWarehouse('items');
}

// ============================================================
// クラフト
// ============================================================

function showCraft() {
  if (G.py !== 0) { log('⚠️ クラフトは地上のみ'); return; }

  let html = `<div class="modal-title">🔨 クラフト</div>`;

  // 許可証
  for (const [pid, p] of Object.entries(PERMITS)) {
    if (G.permits.has(pid)) continue;
    const can = Object.entries(p.recipe).every(([m, q]) => (G.inventory[m] || 0) >= q);
    const recipe = Object.entries(p.recipe).map(([m, q]) => `${MATS[m]?.name||m}×${q}`).join(', ');
    html += `<div class="modal-row">
      <div><div class="modal-row-label">${p.name}</div>
      <div class="modal-row-sub">${recipe}</div></div>
      <button class="btn-modal-action" onclick="confirmCraft('permit','${pid}')" ${can?'':'disabled'}>作成</button>
    </div>`;
  }

  // ドリル
  for (const [did, d] of Object.entries(DRILLS)) {
    if (!d.recipe) continue;
    const can = Object.entries(d.recipe).every(([m, q]) => (G.inventory[m] || 0) >= q);
    const recipe = Object.entries(d.recipe).map(([m, q]) => `${MATS[m]?.name||m}×${q}`).join(', ');
    const statsStr = `<span style="color:rgba(255,200,80,.8);">発掘力 ${d.power ?? '?'}</span> ／ 耐久 ${d.dur ?? '∞'}`;
    html += `<div class="modal-row">
      <div><div class="modal-row-label">${d.name}</div>
      <div class="modal-row-sub">${statsStr}</div>
      <div class="modal-row-sub">${recipe}</div></div>
      <button class="btn-modal-action" onclick="confirmCraft('drill','${did}')" ${can?'':'disabled'}>作成</button>
    </div>`;
  }

  // 帰還石（帰還石をクラフトしたい場合は後追加）
  html += `<button class="btn-modal-close" onclick="closeModal()">閉じる</button>`;
  openModal(html);
}

function confirmCraft(type, id) {
  let name, recipe;
  if (type === 'permit') {
    const p = PERMITS[id];
    name = p.name;
    recipe = Object.entries(p.recipe).map(([m, q]) => `${MATS[m]?.name||m}×${q}`).join(', ');
  } else {
    const d = DRILLS[id];
    name = d.name;
    recipe = Object.entries(d.recipe).map(([m, q]) => `${MATS[m]?.name||m}×${q}`).join(', ');
  }
  const html = `<div class="modal-title">🔨 クラフト確認</div>
    <div style="margin-bottom:8px;"><strong>${escHtml(name)}</strong>を作成しますか？</div>
    <div style="font-size:.82rem;opacity:.7;margin-bottom:16px;">消費素材: ${escHtml(recipe)}</div>
    <div style="display:flex;gap:8px;">
      <button class="btn-modal-action" style="flex:1;" onclick="doCraft('${type}','${id}')">作成する</button>
      <button class="btn-modal-close" style="flex:1;" onclick="showCraft()">戻る</button>
    </div>`;
  openModal(html);
}

async function doCraft(type, id) {
  if (type === 'permit') {
    const p = PERMITS[id];
    if (!p || G.permits.has(id)) return;
    for (const [m, q] of Object.entries(p.recipe)) {
      if ((G.inventory[m] || 0) < q) { log('⚠️ 素材不足'); return; }
    }
    for (const [m, q] of Object.entries(p.recipe)) await upsertInv(m, -q);
    await supabaseClient.from('drill_player_permits').insert({ user_id: G.userId, permit_id: id });
    G.permits.add(id);
    log(`✅ ${p.name}を取得`);

  } else if (type === 'drill') {
    const d = DRILLS[id];
    if (!d?.recipe) return;
    for (const [m, q] of Object.entries(d.recipe)) {
      if ((G.inventory[m] || 0) < q) { log('⚠️ 素材不足'); return; }
    }
    for (const [m, q] of Object.entries(d.recipe)) await upsertInv(m, -q);
    const { data: nd } = await supabaseClient.from('drill_player_drills').insert({
      user_id: G.userId, drill_id: id, durability: d.dur, equipped: false,
    }).select().single();
    if (nd) G.drills.push(nd);
    log(`✅ ${d.name}を作成`);
  }
  showCraft();
}

// ============================================================
// カード合成
// ============================================================

// D→C→B→A→S の順にランクアップ
const SYNTH_RANK_NEXT = { d: 'c', c: 'b', b: 'a', a: 's' };

function cardDisplayName(cardId) {
  if (CARDS[cardId]?.name) return CARDS[cardId].name;
  const si = SHOP_ITEMS.find(s => s.cardId === cardId);
  return si ? si.name : cardId;
}

function showSynthesize() {
  if (G.py !== 0) { log('⚠️ カード合成は地上のみ'); return; }

  const synthList = [];
  // カードは G.ownedCards（drill_player_deck）に保存されている
  for (const [itemId, qty] of Object.entries(G.ownedCards)) {
    if (qty < 4) continue;
    // 末尾が _d / _c / _b / _a のカードIDにマッチ
    const m = itemId.match(/^(.+)_([dacb])$/);
    if (!m) continue;
    const [, base, rank] = m;
    const nextRank = SYNTH_RANK_NEXT[rank];
    if (!nextRank) continue;
    const toId = `${base}_${nextRank}`;
    // CARDS または SHOP_ITEMS に存在するか確認（どちらかにあればOK）
    if (!CARDS[toId] && !SHOP_ITEMS.find(s => s.cardId === toId)) continue;
    synthList.push({ fromId: itemId, qty, toId, times: Math.floor(qty / 4) });
  }

  let html = `<div class="modal-title">⚗️ カード合成</div>
    <div style="font-size:.78rem;opacity:.6;margin-bottom:14px;">同じカード4枚 → 1ランク上のカード1枚</div>`;

  if (synthList.length === 0) {
    html += `<div style="font-size:.85rem;opacity:.5;padding:12px 0;">合成できるカードがありません<br>
      <span style="font-size:.75rem;">同じカードを4枚集めると合成できます</span></div>`;
  } else {
    for (const s of synthList) {
      const fromName = cardDisplayName(s.fromId);
      const toName   = cardDisplayName(s.toId);
      html += `<div class="modal-row">
        <div>
          <div class="modal-row-label">${escHtml(fromName)} ×4 → ${escHtml(toName)}</div>
          <div class="modal-row-sub">所持 ${s.qty}枚 / ${s.times}回合成可能</div>
        </div>
        <button class="btn-modal-action" onclick="doSynthesize('${s.fromId}','${s.toId}')">合成</button>
      </div>`;
    }
  }

  html += `<button class="btn-modal-close" onclick="closeModal()">閉じる</button>`;
  openModal(html);
}

async function doSynthesize(fromId, toId) {
  const qty = G.ownedCards[fromId] || 0;
  if (qty < 4) { log('⚠️ カードが4枚必要です'); showSynthesize(); return; }

  G.ownedCards[fromId] = qty - 4;
  if (G.ownedCards[fromId] <= 0) delete G.ownedCards[fromId];
  G.ownedCards[toId] = (G.ownedCards[toId] || 0) + 1;
  await supabaseClient.from('drill_player_deck')
    .upsert({ user_id: G.userId, owned_cards: G.ownedCards });

  log(`⚗️ ${cardDisplayName(fromId)} ×4 → ${cardDisplayName(toId)} に合成！`);
  showSynthesize();
}

// ============================================================
// リュックモーダル
// ============================================================

function showInventory(tab = 'bag_mats') {
  const isBag = tab.startsWith('bag_');
  const innerTab = tab.slice(tab.indexOf('_') + 1);
  const underground = G.py > 0;

  const topTabBtn = (s, label) => {
    const active = isBag ? s === 'bag' : s === 'wh';
    return `<button onclick="showInventory('${s}_mats')"
      style="flex:1;padding:6px 0;border:none;border-bottom:2px solid ${active?'rgba(255,200,80,.9)':'transparent'};
             background:none;color:${active?'rgba(255,200,80,.9)':'rgba(255,255,255,.55)'};
             font-size:.82rem;cursor:pointer;">${label}</button>`;
  };

  const topTabBar = `<div style="display:flex;border-bottom:1px solid rgba(255,255,255,.15);margin-bottom:12px;">
    ${topTabBtn('bag','🎒 リュック')}
    ${topTabBtn('wh','🏪 倉庫')}
  </div>`;

  const subBtn = (prefix, t, label) =>
    `<button onclick="showInventory('${prefix}_${t}')"
      style="flex:1;padding:5px 0;border:none;border-radius:8px;font-size:.78rem;cursor:pointer;
             background:${innerTab===t?'#d4a853':'rgba(255,255,255,.1)'};color:#fff;">${label}</button>`;

  let content = '';
  let footer = '';

  if (isBag) {
    const w = bpWeight();
    const wPct = Math.min(100, Math.round((w / G.maxBpWeight) * 100));
    const wColor = wPct >= 100 ? '#ff5555' : wPct > 70 ? '#ffc107' : '#6bde9b';
    const weightBar = `<div style="margin-bottom:10px;">
      <div style="display:flex;justify-content:space-between;font-size:.78rem;margin-bottom:4px;">
        <span style="opacity:.7;">容量</span>
        <span style="color:${wColor};font-weight:700;">${w} / ${G.maxBpWeight}</span>
      </div>
      <div style="height:6px;background:rgba(255,255,255,.15);border-radius:3px;overflow:hidden;">
        <div style="width:${wPct}%;height:100%;background:${wColor};border-radius:3px;"></div>
      </div>
    </div>`;
    const subTabBar = `<div style="display:flex;gap:6px;margin-bottom:10px;">
      ${subBtn('bag','mats','📦 素材')}
      ${subBtn('bag','items','💊 アイテム')}
    </div>`;
    let body = '';
    if (innerTab === 'mats') {
      const mats = Object.entries(G.backpack).filter(([id, v]) => v > 0 && isMaterial(id));
      body = mats.length === 0
        ? `<div style="font-size:.85rem;color:rgba(255,255,255,.5);padding:10px 0;">素材なし</div>`
        : mats.map(([item, qty]) => {
            const dropBtn = underground ? `<button class="btn-modal-action" style="background:rgba(200,60,60,.7);font-size:.72rem;padding:4px 10px;" onclick="showDiscardItem('${item}',${qty})">落とす</button>` : '';
            return `<div class="modal-row">
              <span class="modal-row-label">${getItemName(item)}</span>
              <div style="display:flex;align-items:center;gap:6px;"><span>×${qty}</span>${dropBtn}</div>
            </div>`;
          }).join('');
    } else {
      const gameItems = Object.entries(G.backpack).filter(([id, v]) => v > 0 && !isMaterial(id));
      body = gameItems.length === 0
        ? `<div style="font-size:.85rem;color:rgba(255,255,255,.5);padding:10px 0;">アイテムなし</div>`
        : gameItems.map(([id, qty]) => {
            const def = ITEMS[id] ?? {};
            const img = def.imageUrl ? `<img src="${escHtml(def.imageUrl)}" style="width:24px;height:24px;object-fit:contain;vertical-align:middle;margin-right:4px;">` : '';
            const useBtn = underground ? `<button class="btn-modal-action" style="font-size:.72rem;padding:4px 10px;" onclick="useItem('${id}')">使用</button>` : '';
            const depositBtn = !underground ? `<button class="btn-modal-action" style="font-size:.72rem;padding:4px 10px;background:rgba(80,180,120,.7);" onclick="depositItem('${id}')">倉庫へ</button>` : '';
            const dropBtn = underground ? `<button class="btn-modal-action" style="font-size:.72rem;padding:4px 10px;background:rgba(200,60,60,.7);" onclick="showDiscardItem('${id}',${qty},'items')">落とす</button>` : '';
            return `<div class="modal-row">
              <div>
                <div class="modal-row-label">${img}${escHtml(def.name || id)}</div>
                ${def.effectText ? `<div class="modal-row-sub">${escHtml(def.effectText)}</div>` : ''}
              </div>
              <div style="display:flex;align-items:center;gap:6px;">
                <span>×${qty}</span>${useBtn}${depositBtn}${dropBtn}
              </div>
            </div>`;
          }).join('');
    }
    if (!underground) {
      footer = `<button class="btn-modal-action" style="width:100%;margin-top:10px;" onclick="returnSurface(false)">📦 素材を倉庫に確定</button>`;
    } else if ((G.backpack['return_stone'] || 0) > 0) {
      footer = `<button class="btn-modal-action" style="width:100%;margin-top:10px;" onclick="useItem('return_stone')">🪨 帰還石で帰還</button>`;
    }
    content = weightBar + subTabBar + `<div style="min-height:160px;">${body}</div>`;

  } else {
    const mats = Object.entries(G.inventory)
      .filter(([id, v]) => v > 0 && isMaterial(id))
      .sort((a, b) => {
        const order = ['gold','silver','iron','copper','stone','dirt'];
        return (order.indexOf(a[0]) === -1 ? 99 : order.indexOf(a[0])) -
               (order.indexOf(b[0]) === -1 ? 99 : order.indexOf(b[0]));
      });
    const subTabBar = `<div style="display:flex;gap:6px;margin-bottom:10px;">
      ${subBtn('wh','mats','📦 素材')}
      ${subBtn('wh','items','💊 アイテム')}
    </div>`;
    let body = '';
    if (innerTab === 'items') {
      const invItems = Object.entries(G.inventory).filter(([id, v]) => v > 0 && !isMaterial(id));
      body = invItems.length === 0
        ? `<div style="font-size:.85rem;opacity:.5;padding:14px 0;text-align:center;">アイテムがありません</div>`
        : invItems.map(([id, qty]) => {
            const def = ITEMS[id] ?? {};
            const img = def.imageUrl ? `<img src="${escHtml(def.imageUrl)}" style="width:24px;height:24px;object-fit:contain;vertical-align:middle;margin-right:4px;">` : '';
            return `<div class="modal-row">
              <div>
                <div class="modal-row-label">${img}${escHtml(def.name || id)}</div>
                ${def.effectText ? `<div class="modal-row-sub">${escHtml(def.effectText)}</div>` : ''}
              </div>
              <div style="display:flex;align-items:center;gap:6px;">
                <span>×${qty}</span>
                <button class="btn-modal-action" style="font-size:.72rem;padding:4px 10px;" onclick="showWithdrawDialog('${id}',${qty})">取り出す</button>
              </div>
            </div>`;
          }).join('');
    } else {
      body = mats.length === 0
        ? `<div style="font-size:.85rem;opacity:.5;padding:14px 0;text-align:center;">素材がありません</div>`
        : mats.map(([item, qty]) => {
            const price = SELL_PRICES[item];
            const valStr = price ? `<span style="font-size:.72rem;color:rgba(255,200,80,.8);">💰${price}G/個</span>` : '';
            return `<div class="modal-row">
              <div><div class="modal-row-label">${MATS[item]?.name || item}</div>${valStr}</div>
              <div style="font-size:.95rem;font-weight:700;">×${qty}</div>
            </div>`;
          }).join('');
    }
    content = subTabBar + `<div style="min-height:160px;">${body}</div>`;
  }

  const html = `<div class="modal-title">📦 アイテム</div>
    ${topTabBar}
    ${content}
    ${footer}
    <button class="btn-modal-close" onclick="closeModal()">閉じる</button>`;
  openModal(html);
}

function showBag(tab = 'mats') { showInventory('bag_' + tab); }

function showBagFullModal() {
  if (!_pendingMaterial) return;
  const { mat } = _pendingMaterial;
  const matName = escHtml(MATS[mat]?.name || mat);
  const bpEntries = Object.entries(G.backpack).filter(([, v]) => v > 0);

  const itemsHtml = bpEntries.map(([id, qty]) => {
    const name = escHtml(getItemName(id));
    const w = itemWeight(id);
    return `<div class="modal-row">
      <div>
        <div class="modal-row-label">${name}</div>
        <div class="modal-row-sub">×${qty}　重量${w}/個</div>
      </div>
      <button class="btn-modal-action" style="background:rgba(200,60,60,.7);font-size:.72rem;padding:4px 10px;flex-shrink:0;"
        onclick="discardForPendingMat('${id}')">1個落とす</button>
    </div>`;
  }).join('');

  openModal(`
    <div class="modal-title">⚠️ リュックが満杯</div>
    <div style="font-size:.84rem;margin-bottom:12px;line-height:1.6;">
      <strong>${matName}</strong>を採掘しましたが、リュックに空きがありません。<br>
      アイテムを1個落として受け取りますか？
    </div>
    ${itemsHtml || '<div style="opacity:.5;font-size:.82rem;">リュックに何もありません</div>'}
    <button class="btn-modal-close" style="width:100%;margin-top:10px;background:rgba(100,100,100,.4);"
      onclick="dropPendingMaterial()">落とさず閉じる（素材を足元にドロップ）</button>
  `);
}

async function discardForPendingMat(id) {
  if (!_pendingMaterial) { closeModal(); return; }
  const { mat, x, y } = _pendingMaterial;

  const newQty = Math.max(0, (G.backpack[id] || 0) - 1);
  G.backpack[id] = newQty;
  await saveBpItem(id, newQty);
  await dropAtCurrentPos([{ item_id: id, quantity: 1 }]);
  log(`📦 ${getItemName(id)} ×1 を落とした`);

  if (bpWeight() + itemWeight(mat) <= G.maxBpWeight) {
    _pendingMaterial = null;
    G.backpack[mat] = (G.backpack[mat] || 0) + 1;
    await saveBpItem(mat, G.backpack[mat]);
    log(`✅ ${MATS[mat].name}を採掘`);
    closeModal();
    render();
    await triggerBlockEvent(x, y);
  } else {
    showBagFullModal();
  }
}

async function dropPendingMaterial() {
  if (!_pendingMaterial) { closeModal(); return; }
  const { mat } = _pendingMaterial;
  _pendingMaterial = null;
  await dropAtCurrentPos([{ item_id: mat, quantity: 1 }]);
  log(`📦 ${MATS[mat]?.name || mat} ×1 を足元に落とした`);
  closeModal();
  renderMap();
}

// 足元にアイテムをドロップする共通ヘルパー
async function dropAtCurrentPos(itemsToAdd) {
  const dkey = `${G.px},${G.py}`;
  const existing = (G.droppedItems.get(dkey) || []).find(d => !isDropLocked(d) && d.cause_of_death !== 'treasure');
  if (existing) {
    const merged = [...existing.items];
    for (const { item_id, quantity } of itemsToAdd) {
      const idx = merged.findIndex(i => i.item_id === item_id);
      if (idx >= 0) merged[idx] = { item_id, quantity: merged[idx].quantity + quantity };
      else merged.push({ item_id, quantity });
    }
    await supabaseClient.from('drill_dropped_items').update({ items: merged }).eq('id', existing.id);
    existing.items = merged;
  } else {
    const { data: drop } = await supabaseClient.from('drill_dropped_items').insert({
      map_date: G.mapDate, pos_x: G.px, pos_y: G.py,
      dropper_user_id: G.userId,
      dropper_name: G.displayName || '名無し',
      cause_of_death: '投棄',
      items: itemsToAdd,
    }).select().single();
    if (drop) {
      if (!G.droppedItems.has(dkey)) G.droppedItems.set(dkey, []);
      G.droppedItems.get(dkey).push({
        id: drop.id, items: itemsToAdd,
        dropper_name: G.displayName || '名無し',
        cause_of_death: '投棄',
        dropped_at: drop.dropped_at,
        locked_by: null, locked_until: null,
      });
    }
  }
}

function showDiscardItem(itemId, maxQty, backTab = 'mats') {
  const name = escHtml(getItemName(itemId));
  openModal(`
    <div class="modal-title">📦 ${name}を落とす</div>
    <div style="font-size:.83rem;opacity:.65;margin-bottom:14px;line-height:1.6;">現在の場所に落とします。<br>他のプレイヤーが拾えます。</div>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px;">
      <span style="flex:1;font-size:.9rem;">${name}</span>
      <input id="discard-qty" type="number" min="1" max="${maxQty}" value="1"
        style="width:72px;padding:5px 8px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.25);border-radius:6px;color:#fff;font-size:.9rem;text-align:center;">
      <span style="opacity:.5;font-size:.82rem;">/ ${maxQty}</span>
    </div>
    <button class="btn-modal-action" style="width:100%;background:rgba(210,50,50,.75);" onclick="doDiscardItem('${escHtml(itemId)}',${maxQty},'${backTab}')">📦 落とす</button>
    <button class="btn-modal-close" onclick="showBag('${backTab}')">← 戻る</button>
  `);
}

async function doDiscardItem(itemId, maxQty, backTab = 'mats') {
  const input = document.getElementById('discard-qty');
  const qty = input ? Math.min(maxQty, Math.max(1, parseInt(input.value, 10) || 1)) : 1;
  const actual = Math.min(qty, G.backpack[itemId] || 0);
  if (actual <= 0) { showBag(backTab); return; }

  G.backpack[itemId] = (G.backpack[itemId] || 0) - actual;
  await saveBpItem(itemId, G.backpack[itemId]);
  await dropAtCurrentPos([{ item_id: itemId, quantity: actual }]);

  log(`📦 ${getItemName(itemId)} ×${actual} を落とした`);
  renderSide(); renderMap();
  showBag(backTab);
}

async function dropDrillAtCurrentPos(items) {
  const { data: drop } = await supabaseClient.from('drill_dropped_items').insert({
    map_date: G.mapDate, pos_x: G.px, pos_y: G.py,
    dropper_user_id: G.userId,
    dropper_name: G.displayName || '名無し',
    cause_of_death: '投棄',
    items,
  }).select().single();
  if (drop) {
    const dkey = `${G.px},${G.py}`;
    if (!G.droppedItems.has(dkey)) G.droppedItems.set(dkey, []);
    G.droppedItems.get(dkey).push({
      id: drop.id, items,
      dropper_name: G.displayName || '名無し',
      cause_of_death: '投棄',
      dropped_at: drop.dropped_at,
      locked_by: null, locked_until: null,
    });
  }
}

async function dropDrillFromWarehouse(rowId) {
  const d = G.drills.find(x => x.id === rowId);
  if (!d) return;
  if (d.drill_id === 'beginner') { log('⚠️ 初心者ドリルは落とせません'); return; }
  if (d.id === G.equippedDrillRowId) { log('⚠️ 装備中のドリルは落とせません'); return; }
  await supabaseClient.from('drill_player_drills').delete().eq('id', rowId);
  G.drills = G.drills.filter(x => x.id !== rowId);
  const dur = d.durability ?? DRILLS[d.drill_id]?.dur;
  await dropDrillAtCurrentPos([{ item_id: d.drill_id, quantity: 1, durability: dur }]);
  log(`📦 ${DRILLS[d.drill_id]?.name || d.drill_id} を落とした`);
  renderSide(); renderMap();
  showWarehouse('drills');
}

// ============================================================
// ドリル管理
// ============================================================

function showDrills() {
  let html = `<div class="modal-title">⛏️ ドリル管理</div>`;

  if (G.drills.length === 0) {
    html += `<div style="font-size:.85rem;opacity:.5;padding:8px 0;">ドリルがありません</div>`;
  } else {
    for (const d of G.drills) {
      const info = DRILLS[d.drill_id] || {};
      const isEquipped = d.id === G.equippedDrillRowId;
      const durStr = d.durability === null ? '∞' : d.durability;
      html += `<div class="modal-row">
        <div>
          <div class="modal-row-label">${info.name || d.drill_id}${isEquipped ? ' ✅' : ''}</div>
          <div class="modal-row-sub">威力: ${info.power ?? '-'} / 耐久: ${durStr}</div>
        </div>
        ${isEquipped
          ? `<span style="font-size:.75rem;opacity:.5;">装備中</span>`
          : `<div style="display:flex;gap:6px;">
               <button class="btn-modal-action" onclick="equipDrill('${d.id}').then(showDrills)">装備</button>
               ${G.py > 0 && d.drill_id !== 'beginner' ? `<button class="btn-modal-action" style="background:rgba(200,60,60,.7);" onclick="dropDrillFromWarehouse('${d.id}')">落とす</button>` : ''}
             </div>`}
      </div>`;
    }
  }
  html += `<button class="btn-modal-close" onclick="closeModal()">閉じる</button>`;
  openModal(html);
}

function showDrillDetail(rowId) {
  const d = G.drills.find(x => x.id === rowId);
  if (!d) return;
  const def = DRILLS[d.drill_id] || {};
  const isEquipped = d.id === G.equippedDrillRowId;
  const durMax = def.dur ?? null;
  const durVal = d.durability ?? durMax;
  const durPct = durMax ? Math.max(0, Math.round((durVal / durMax) * 100)) : null;
  const durColor = durPct === null ? '#aaa' : durPct > 50 ? '#4caf50' : durPct > 20 ? '#ff9800' : '#f44336';
  const durDisp = durVal === null ? '∞' : `${durVal} / ${durMax}`;
  const durBar = durMax
    ? `<div style="margin-top:6px;height:8px;background:rgba(255,255,255,.15);border-radius:4px;overflow:hidden;">
         <div style="height:100%;width:${durPct}%;background:${durColor};border-radius:4px;transition:width .3s;"></div>
       </div>`
    : '';
  const html = `<div class="modal-title">⛏️ ${escHtml(def.name || d.drill_id)}</div>
    <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="opacity:.7;font-size:.85rem;">発掘力</span>
        <span style="font-size:1.1rem;font-weight:700;color:#f0c060;">${def.power ?? '?'}</span>
      </div>
      <div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="opacity:.7;font-size:.85rem;">耐久値</span>
          <span style="font-size:1rem;font-weight:700;color:${durColor};">${durDisp}</span>
        </div>
        ${durBar}
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <span style="opacity:.7;font-size:.85rem;">状態</span>
        <span style="font-size:.85rem;">${isEquipped ? '<span style="color:#d4a853;">装備中</span>' : '未装備'}</span>
      </div>
    </div>
    <div style="display:flex;gap:8px;">
      ${isEquipped ? '' : `<button class="btn-modal-action" style="flex:1;" onclick="equipDrill('${rowId}').then(()=>showWarehouse('drills'))">装備する</button>`}
      <button class="btn-modal-close" style="flex:1;" onclick="showWarehouse('drills')">戻る</button>
    </div>`;
  openModal(html);
}

async function equipDrill(rowId) {
  const d = G.drills.find(x => x.id === rowId);
  if (!d) return;

  await supabaseClient.from('drill_player_drills')
    .update({ equipped: false }).eq('user_id', G.userId);
  await supabaseClient.from('drill_player_drills')
    .update({ equipped: true }).eq('id', rowId);

  G.drills.forEach(x => { x.equipped = (x.id === rowId); });
  G.equippedDrillRowId = rowId;
  G.equippedDrillId = d.drill_id;
  G.drillDur = d.durability;

  log(`⛏️ ${DRILLS[d.drill_id]?.name || d.drill_id} を装備`);
  renderSide();
}

// ============================================================
// アイテムモーダル（モバイル統合UI）
// ============================================================

function showItems() {
  let html = `<div class="modal-title">⚙️ 装備</div>`;

  // ── ドリル ──
  html += `<div class="items-section-label">⛏️ ドリル</div>`;
  if (G.drills.length === 0) {
    html += `<div style="font-size:.85rem;opacity:.5;padding:6px 0;">ドリルがありません</div>`;
  } else {
    for (const d of G.drills) {
      const info = DRILLS[d.drill_id] || {};
      const isEq  = d.id === G.equippedDrillRowId;
      const dur   = d.durability === null ? '∞' : d.durability;
      html += `<div class="modal-row">
        <div>
          <div class="modal-row-label">${info.name || d.drill_id}${isEq ? ' ✅' : ''}</div>
          <div class="modal-row-sub">威力: ${info.power ?? '-'} ／ 耐久: ${dur}</div>
        </div>
        ${isEq
          ? `<span style="font-size:.75rem;opacity:.5;">装備中</span>`
          : `<div style="display:flex;gap:6px;">
               <button class="btn-modal-action" onclick="equipDrill('${d.id}').then(showItems)">装備</button>
               ${G.py > 0 && d.drill_id !== 'beginner' ? `<button class="btn-modal-action" style="background:rgba(200,60,60,.7);" onclick="dropDrillFromWarehouse('${d.id}')">落とす</button>` : ''}
             </div>`}
      </div>`;
    }
  }

  html += `<button class="btn-modal-close" onclick="closeModal()">閉じる</button>`;
  openModal(html);
}

// ============================================================
// ログモーダル（モバイル用）
// ============================================================

function showLogModal() {
  const rows = G.logs.length === 0
    ? `<div style="font-size:.82rem;opacity:.45;">ログはまだありません</div>`
    : G.logs.map(l => `<div class="log-modal-row">${l}</div>`).join('');

  openModal(`
    <div class="modal-title">📜 ログ</div>
    <div style="max-height:62vh;overflow-y:auto;">${rows}</div>
    <button class="btn-modal-close" onclick="closeModal()">閉じる</button>
  `);
}

// ============================================================
// 素材売却
// ============================================================

function showSell() { showShop('sell'); }

function setSellMax(itemId, maxQty) {
  const input = document.getElementById(`sell-qty-${itemId}`);
  if (input) { input.value = maxQty; updateSellTotal(); }
}

function updateSellTotal() {
  let total = 0;
  document.querySelectorAll('[id^="sell-qty-"]').forEach(input => {
    const itemId = input.id.slice(9); // 'sell-qty-'.length = 9
    const qty = Math.min(G.inventory[itemId] || 0, Math.max(0, parseInt(input.value, 10) || 0));
    total += qty * (SELL_PRICES[itemId] || 0);
  });
  const disp = document.getElementById('sell-total-disp');
  if (disp) disp.textContent = `${total.toLocaleString()}G`;
  const btn = document.getElementById('sell-go-btn');
  if (btn) {
    btn.disabled = total <= 0;
    btn.style.opacity = total > 0 ? '1' : '.35';
    btn.style.cursor = total > 0 ? 'pointer' : 'default';
  }
}

function showSellConfirm() {
  const toSell = [];
  let total = 0;
  document.querySelectorAll('[id^="sell-qty-"]').forEach(input => {
    const itemId = input.id.slice(9);
    const maxQty = G.inventory[itemId] || 0;
    const qty = Math.min(maxQty, Math.max(0, parseInt(input.value, 10) || 0));
    if (qty > 0) {
      toSell.push({ item: itemId, qty, price: SELL_PRICES[itemId] || 0 });
      total += qty * (SELL_PRICES[itemId] || 0);
    }
  });
  if (toSell.length === 0 || total <= 0) return;
  _pendingSell = toSell;

  const rows = toSell.map(({ item, qty, price }) =>
    `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.06);">
      <span style="font-size:.85rem;">${MATS[item]?.name || item} ×${qty}</span>
      <span style="font-size:.85rem;color:#d4a853;">${(price * qty).toLocaleString()}G</span>
    </div>`
  ).join('');

  openModal(`
    <div class="modal-title">💰 売却確認</div>
    <div style="max-height:36vh;overflow-y:auto;margin-bottom:12px;">${rows}</div>
    <div style="padding:12px 14px;background:rgba(212,168,83,.12);border:1px solid rgba(212,168,83,.4);border-radius:10px;margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
        <span style="font-size:.85rem;opacity:.8;">受取金額</span>
        <span style="font-size:1.25rem;font-weight:700;color:#d4a853;">💰 ${total.toLocaleString()}G</span>
      </div>
      <div style="font-size:.75rem;color:rgba(255,160,60,.9);">⚠️ この操作は取り消せません</div>
    </div>
    <button class="btn-modal-action" style="width:100%;margin-bottom:8px;font-size:.95rem;padding:11px;" onclick="doSellAll()">✅ 確認して売却</button>
    <button class="btn-modal-close" onclick="showSell()">← キャンセルして戻る</button>
  `);
}

async function doSellAll() {
  const toSell = _pendingSell;
  _pendingSell = null;
  if (!toSell || toSell.length === 0) return;
  closeModal();

  let totalEarned = 0;
  for (const { item, qty } of toSell) {
    const price = SELL_PRICES[item];
    if (!price) continue;
    const actual = Math.min(qty, G.inventory[item] || 0);
    if (actual <= 0) continue;
    await upsertInv(item, -actual);
    totalEarned += price * actual;
    log(`💰 ${MATS[item]?.name || item} ×${actual} → ${(price * actual).toLocaleString()}G`);
  }
  if (totalEarned > 0) {
    G.drillGold += totalEarned;
    await supabaseClient.from('profiles').update({ drill_gold: G.drillGold }).eq('discord_user_id', G.discordId);
    log(`💰 合計 ${totalEarned.toLocaleString()}G 受け取り（所持金: ${G.drillGold.toLocaleString()}G）`);
  }
  renderSide();
  showSell();
}

// ============================================================
// 倉庫
// ============================================================

function showWarehouse(tab = 'mats') { showInventory('wh_' + tab); }

// ============================================================
// イベント・落下アイテムUI
// ============================================================

function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
}

// カードID末尾のランク文字を返す (sword_stone_d → 'd', attack → null)
function rankFromId(cardId) {
  return cardId?.match(/_([dcbas])$/)?.[1] ?? null;
}

// ランクバッジ HTML（position:absolute で左上に表示）
function rankBadgeHtml(rank) {
  if (!rank) return '';
  return `<div class="rank-badge rank-badge-${rank}">${rank.toUpperCase()}</div>`;
}

function showEventModal(icon, body, afterClose) {
  const inner = document.getElementById('modal-inner');
  if (!inner) return;
  inner.innerHTML = `
    <div style="text-align:center;padding:20px 0 18px;">
      <div style="font-size:3.5rem;margin-bottom:14px;">${icon}</div>
      <div style="font-size:.95rem;line-height:1.75;">${body}</div>
    </div>
    <button class="btn-modal-close" id="ev-ok-btn" disabled style="opacity:.35;cursor:default;">OK</button>`;
  const overlay = document.getElementById('modal-overlay');
  overlay.style.display = 'flex';
  overlay.dataset.eventModal = '1';
  // 誤タップ防止：一定時間後にのみOKを有効化
  setTimeout(() => {
    const btn = document.getElementById('ev-ok-btn');
    if (!btn) return;
    btn.disabled = false;
    btn.style.opacity = '';
    btn.style.cursor = '';
    btn.addEventListener('click', () => {
      overlay.dataset.eventModal = '';
      closeModal();
      if (afterClose) afterClose();
    }, { once: true });
  }, 800);
}

let _currentDrop = null;
let _pendingSell = null;
let _lockedDropId = null;

function isDropLocked(drop) {
  if (!drop.locked_by || drop.locked_by === G.userId) return false;
  return drop.locked_until && new Date(drop.locked_until) > new Date();
}

async function acquireDropLock(dropId) {
  const { data } = await supabaseClient.rpc('try_lock_drop', {
    p_drop_id: dropId, p_user_id: G.userId,
  });
  if (data) _lockedDropId = dropId;
  return !!data;
}

async function releaseDropLock() {
  if (!_lockedDropId) return;
  const id = _lockedDropId;
  _lockedDropId = null;
  await supabaseClient.rpc('release_drop_lock', { p_drop_id: id, p_user_id: G.userId });
}

function showDropModal(x, y, drop) {
  _currentDrop = { x, y, drop };
  const at = drop.dropped_at ? new Date(drop.dropped_at) : null;
  const dateStr = at
    ? `${at.getMonth()+1}月${at.getDate()}日 ${String(at.getHours()).padStart(2,'0')}:${String(at.getMinutes()).padStart(2,'0')}`
    : '';

  const itemRows = (drop.items || []).map((item, i) => {
    const name = ITEM_NAMES[item.item_id] || item.item_id;
    return `<div class="modal-row" style="align-items:center;gap:8px;">
      <div style="flex:1;">
        <div class="modal-row-label">${escHtml(name)}</div>
        <div class="modal-row-sub">${item.quantity}個</div>
      </div>
      <input type="number" id="dc-qty-${i}" min="0" max="${item.quantity}" value="${item.quantity}"
        style="width:72px;padding:4px 6px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);
               border-radius:6px;color:#fff;font-size:.85rem;text-align:right;">
    </div>`;
  }).join('');

  const isTreasure = drop.cause_of_death === 'treasure';
  const isDiscard  = drop.cause_of_death === '投棄';
  const modalTitle = isTreasure
    ? `🎁 ${escHtml(drop.dropper_name || '宝箱')}の中身`
    : isDiscard
      ? `📦 ${escHtml(drop.dropper_name || '???')}が落としたアイテム`
      : `📦 ${escHtml(drop.dropper_name || '???')}のリュックサック`;
  const subInfo = isTreasure
    ? ''
    : isDiscard
      ? `<div style="font-size:.75rem;opacity:.6;margin-bottom:14px;">${escHtml(dateStr)}</div>`
      : `<div style="font-size:.75rem;opacity:.6;margin-bottom:14px;">死亡 ${escHtml(dateStr)}&ensp;死因 ${escHtml(drop.cause_of_death || '不明')}</div>`;

  openModal(`
    <div class="modal-title">${modalTitle}</div>
    ${subInfo}
    <div style="font-size:.78rem;font-weight:600;opacity:.55;margin-bottom:8px;">持ち物</div>
    <div style="max-height:38vh;overflow-y:auto;">${itemRows}</div>
    <div style="display:flex;gap:8px;margin-top:14px;">
      <button class="btn-modal-action" style="flex:1;" onclick="takeSelected()">選択した分をとる</button>
      <button class="btn-modal-action" style="flex:1;" onclick="takeAll()">全部取る</button>
    </div>
    <button class="btn-modal-close" style="margin-top:8px;" onclick="closeModal()">閉じる</button>
  `);
}

async function takeSelected() {
  if (!_currentDrop) return;
  const { x, y, drop } = _currentDrop;
  const toCollect = (drop.items || [])
    .map((item, i) => ({
      item_id: item.item_id,
      quantity: Math.min(Math.max(0, parseInt(document.getElementById(`dc-qty-${i}`)?.value || '0')), item.quantity),
    }))
    .filter(i => i.quantity > 0);
  if (toCollect.length === 0) { closeModal(); _currentDrop = null; return; }
  await doDropCollect(x, y, drop, toCollect);
}

async function takeAll() {
  if (!_currentDrop) return;
  const { x, y, drop } = _currentDrop;
  await doDropCollect(x, y, drop, (drop.items || []).map(i => ({ ...i })));
}

async function doDropCollect(x, y, drop, toCollect) {
  // ロック解放：変数クリア後にDB側もRPCで解放（削除前に解放）
  const dropIdToUnlock = _lockedDropId;
  _lockedDropId = null;
  if (dropIdToUnlock) {
    await supabaseClient.rpc('release_drop_lock', { p_drop_id: dropIdToUnlock, p_user_id: G.userId });
  }
  closeModal();
  _currentDrop = null;

  // ドリルと通常アイテムを分離（ドリルは容量制限なしでdrill_player_drillsへ）
  const drillItems = toCollect.filter(i => DRILLS[i.item_id]);
  const regularItems = toCollect.filter(i => !DRILLS[i.item_id]);

  // 容量チェック：通常アイテムのみ
  let cap = G.maxBpWeight - bpWeight();
  const fitted = [];
  for (const item of regularItems) {
    const w = itemWeight(item.item_id);
    const canTake = w > 0 ? Math.min(item.quantity, Math.floor(cap / w)) : item.quantity;
    if (canTake > 0) { fitted.push({ ...item, quantity: canTake }); cap -= w * canTake; }
  }
  if (fitted.length === 0 && drillItems.length === 0) { log('⚠️ リュックが満杯で回収できません'); renderSide(); return; }
  const skipped = regularItems.reduce((s, i) => s + i.quantity, 0) - fitted.reduce((s, i) => s + i.quantity, 0);
  if (skipped > 0) log(`⚠️ 容量不足で ${skipped} 個は回収できませんでした`);

  for (const { item_id, quantity } of fitted) {
    G.backpack[item_id] = (G.backpack[item_id] || 0) + quantity;
    await saveBpItem(item_id, G.backpack[item_id]);
  }

  // ドリル回収：drill_player_drillsに追加（耐久値を保持）
  for (const { item_id, quantity, durability } of drillItems) {
    const def = DRILLS[item_id] || {};
    for (let i = 0; i < quantity; i++) {
      const { data: nd } = await supabaseClient.from('drill_player_drills').insert({
        user_id: G.userId, drill_id: item_id,
        durability: durability ?? def.dur,
        equipped: false,
      }).select().single();
      if (nd) G.drills.push(nd);
    }
  }

  const allFitted = [...fitted, ...drillItems];
  const takenMap = {};
  allFitted.forEach(i => { takenMap[i.item_id] = (takenMap[i.item_id] || 0) + i.quantity; });
  const remaining = (drop.items || [])
    .map(i => {
      const leftQty = i.quantity - (takenMap[i.item_id] || 0);
      if (leftQty <= 0) return null;
      return i.durability !== undefined ? { item_id: i.item_id, quantity: leftQty, durability: i.durability } : { item_id: i.item_id, quantity: leftQty };
    })
    .filter(Boolean);

  const key = `${x},${y}`;
  if (remaining.length === 0) {
    await supabaseClient.from('drill_dropped_items').delete().eq('id', drop.id);
    const list = G.droppedItems.get(key);
    if (list) {
      const idx = list.findIndex(d => d.id === drop.id);
      if (idx >= 0) list.splice(idx, 1);
      if (list.length === 0) G.droppedItems.delete(key);
    }
  } else {
    await supabaseClient.from('drill_dropped_items').update({ items: remaining }).eq('id', drop.id);
    const list = G.droppedItems.get(key);
    if (list) { const d = list.find(d => d.id === drop.id); if (d) d.items = remaining; }
  }

  const names = allFitted.map(i => `${DRILLS[i.item_id]?.name || ITEM_NAMES[i.item_id] || i.item_id}×${i.quantity}`).join(', ');
  log(`📦 落とし物を回収！ ${names}`);
  renderSide(); renderMap();

  const nextDrops = G.droppedItems.get(key);
  if (nextDrops && nextDrops.length > 0) showDropModal(x, y, nextDrops[0]);
}

// ============================================================
// 戦闘システム
// ============================================================

function buildPlayerDeck() {
  return [...G.playerDeckSlots].filter(id => CARDS[id]);
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function drawCombatCards(n = 3) {
  const toDraw = Math.max(0, n - C.hand.length); // 手札がすでにある分は引かない
  for (let i = 0; i < toDraw; i++) {
    if (C.deck.length === 0) {
      if (C.discard.length === 0) break;
      C.deck = shuffleArray(C.discard);
      C.discard = [];
    }
    C.hand.push(C.deck.pop());
  }
}

function getMonsterNextAction() {
  const acts = C.monster?.actions;
  if (!acts || acts.length === 0) return null;
  const total = acts.reduce((s, a) => s + (a.weight ?? 1), 0);
  let r = Math.random() * total;
  for (const act of acts) { r -= (act.weight ?? 1); if (r <= 0) return act; }
  return acts[acts.length - 1];
}

function pickCombatMonster(layerIdx) {
  const eligible = Object.entries(MONSTERS)
    .map(([id, m]) => ({ id, w: m.layerWeights?.[layerIdx] ?? 0 }))
    .filter(x => x.w > 0);
  if (eligible.length === 0) return Object.keys(MONSTERS)[0] ?? null;
  const total = eligible.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const { id, w } of eligible) { r -= w; if (r <= 0) return id; }
  return eligible[eligible.length - 1].id;
}

function combatAddLog(msg) {
  C.logs.unshift(msg);
  if (C.logs.length > 20) C.logs.pop();
}

// ── ダメージフロート演出 ──
(function injectDmgStyle() {
  if (document.getElementById('dmg-float-style')) return;
  const s = document.createElement('style');
  s.id = 'dmg-float-style';
  s.textContent = `
    @keyframes dmgFloat {
      0%   { opacity:1; transform:translate(-50%,-50%) scale(1.4); }
      15%  { transform:translate(-50%,-120%) scale(1.1); }
      65%  { opacity:1; transform:translate(-50%,-220%) scale(0.9); }
      100% { opacity:0; transform:translate(-50%,-300%) scale(0.8); }
    }
    @keyframes dmgFloatCrit {
      0%   { opacity:1; transform:translate(-50%,-50%) scale(1.8) rotate(-4deg); }
      12%  { transform:translate(-50%,-140%) scale(1.3) rotate(2deg); }
      65%  { opacity:1; transform:translate(-50%,-260%) scale(1.0) rotate(0deg); }
      100% { opacity:0; transform:translate(-50%,-340%) scale(0.85); }
    }`;
  document.head.appendChild(s);
})();

function spawnDamageNumber(amount, isCrit = false) {
  const area = document.getElementById('enemy-area');
  if (!area || amount <= 0) return;

  const rect = area.getBoundingClientRect();
  const x = rect.left + rect.width  * (0.35 + Math.random() * 0.3);
  const y = rect.top  + rect.height * (0.25 + Math.random() * 0.2);

  const el = document.createElement('div');
  el.style.cssText = `
    position:fixed;
    left:${x}px; top:${y}px;
    font-size:${isCrit ? '2.6' : '2rem'};
    font-weight:900;
    color:${isCrit ? '#ff4466' : '#ffe050'};
    text-shadow:0 2px 10px rgba(0,0,0,.95),0 0 22px ${isCrit ? 'rgba(255,60,80,.7)' : 'rgba(255,210,0,.6)'};
    pointer-events:none;
    z-index:30000;
    animation:${isCrit ? 'dmgFloatCrit' : 'dmgFloat'} 1.5s ease-out forwards;
    white-space:nowrap;
    user-select:none;
  `;
  el.textContent = isCrit ? `${amount}!!` : `-${amount}`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1600);
}

const COMBAT_STORAGE_KEY = 'drill_combat_v1';

function saveCombatState() {
  if (!C.active) return;
  try {
    localStorage.setItem(COMBAT_STORAGE_KEY, JSON.stringify({
      monster:      C.monster,
      monsterHp:    C.monsterHp,
      hand:         C.hand,
      deck:         C.deck,
      discard:      C.discard,
      logs:         C.logs,
      nextAction:   C.nextAction,
      ap:           C.ap,
      roundDamage:  C.roundDamage,
      sessionId:    C.sessionId,
      cx:           C.cx,
      cy:           C.cy,
      currentRound: C.currentRound,
      myActedRound: C.myActedRound,
    }));
  } catch {}
}

function clearCombatState() {
  localStorage.removeItem(COMBAT_STORAGE_KEY);
}

function restoreCombatState() {
  try {
    const raw = localStorage.getItem(COMBAT_STORAGE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    if (!s?.monster) { clearCombatState(); return; }
    C.active       = true;
    C.monster      = s.monster;
    C.monsterHp    = s.monsterHp ?? s.monster.maxHp;
    C.hand         = s.hand    ?? [];
    C.deck         = s.deck    ?? [];
    C.discard      = s.discard ?? [];
    C.logs         = s.logs    ?? [];
    C.nextAction   = s.nextAction ?? null;
    C.sessionId    = s.sessionId  ?? null;
    C.cx           = s.cx ?? null;
    C.cy           = s.cy ?? null;
    C.currentRound = s.currentRound ?? 1;
    C.myActedRound = s.myActedRound ?? 0;
    C.ap           = s.ap ?? COMBAT_STATS.maxAp;
    C.roundDamage  = s.roundDamage ?? 0;
    C.participants = [];
    if (C.hand.length === 0) drawCombatCards(3);
    C.logs.unshift('🔄 戦闘を再開しました');
    if (C.sessionId) {
      setupCombatRealtime(C.sessionId);
      refreshCombatParticipants(C.sessionId);
      supabaseClient.from('drill_combat_sessions').select('*')
        .eq('id', C.sessionId).single()
        .then(({ data }) => { if (data) syncCombatFromDb(data); });
    }
    showCombatModal();
  } catch { clearCombatState(); }
}

async function startCombat(monsterId, cx, cy) {
  const def = MONSTERS[monsterId];
  if (!def) return;

  C.active       = true;
  C.monster      = { ...def };
  C.monsterHp    = def.maxHp;
  C.deck         = shuffleArray(buildPlayerDeck());
  C.hand         = [];
  C.discard      = [];
  C.logs         = [`⚔️ ${def.name}が現れた！`];
  C.nextAction   = getMonsterNextAction();
  C.sessionId    = null;
  C.cx           = cx ?? G.px;
  C.cy           = cy ?? G.py;
  C.currentRound = 1;
  C.myActedRound = 0;
  C.participants = [];
  // APは戦闘間で持続（全回復しない）
  const _savedAp = parseInt(localStorage.getItem('drill_persisted_ap') ?? '', 10);
  C.ap           = !isNaN(_savedAp) ? Math.min(COMBAT_STATS.maxAp, _savedAp) : COMBAT_STATS.maxAp;
  C.roundDamage  = 0;
  C.targetIdx    = 0;
  C.enemies      = [];

  drawCombatCards(3);

  // DBにセッション作成・参加
  try {
    const nextAct = getMonsterNextAction();
    const { data: sessData, error: sessErr } = await supabaseClient
      .from('drill_combat_sessions')
      .insert({
        map_date: G.mapDate, cx: C.cx, cy: C.cy,
        monster_def: def, monster_hp: def.maxHp, status: 'active',
        next_action: nextAct,
      })
      .select('id').single();
    if (!sessErr && sessData) {
      C.sessionId = sessData.id;
      await supabaseClient.rpc('drill_join_combat', {
        p_session_id:   C.sessionId,
        p_user_id:      G.userId,
        p_display_name: G.displayName || '名無し',
        p_avatar_url:   G.avatarUrl,
        p_hp: G.hp, p_max_hp: G.maxHp,
        p_hand: C.hand, p_deck: C.deck, p_discard: C.discard,
      });
      setupCombatRealtime(C.sessionId);
      if (!G.activeCombats) G.activeCombats = new Map();
      G.activeCombats.set(`${C.cx},${C.cy}`,
        { id: C.sessionId, monster_def: def, monster_hp: def.maxHp });
      renderMap();
    }
  } catch {}

  showCombatModal();
}

// カードを1枚使う（ラウンドは終了しない）
async function playCard(cardIdx) {
  if (!C.active || cardIdx < 0 || cardIdx >= C.hand.length) return;
  if (C.sessionId && C.myActedRound >= C.currentRound) return;

  const cardId  = C.hand[cardIdx];
  const cardDef = CARDS[cardId];
  if (!cardDef) return;

  const apCost = cardDef.ap_cost ?? 0;
  if (apCost > 0 && C.ap < apCost) {
    combatAddLog(`⚡ AP 不足！（必要: ${apCost} / 現在: ${C.ap}）`);
    showCombatModal();
    return;
  }
  C.ap = Math.max(0, C.ap - apCost);

  // このカードだけ捨て札へ
  C.hand.splice(cardIdx, 1);
  C.discard.push(cardId);

  const { total: damage, crits } = computeCardDamage(cardDef);
  if (damage > 0) {
    const critLabel = crits > 0 ? ' 💥CRIT!' : '';
    combatAddLog(`⚔️ ${cardDef.name}！ ${damage} ダメージ${critLabel}`);
  }
  spawnDamageNumber(damage, crits > 0);

  if (C.sessionId) {
    // マルチ: 蓄積してターン終了時にサーバーへ送信
    C.roundDamage += damage;
  } else {
    // ソロ: HPに即時反映 → 0以下で即勝利
    C.monsterHp = Math.max(0, C.monsterHp - damage);
    if (C.monsterHp <= 0) {
      combatAddLog(`✨ ${C.monster.name}を倒した！`);
      showCombatModal();
      await endCombat(true);
      return;
    }
  }
  showCombatModal();
}

// ターン終了：残り手札を捨て→モンスター攻撃→次ターン
async function endTurn() {
  if (!C.active) return;
  if (C.sessionId && C.myActedRound >= C.currentRound) return;

  // 残り手札を全て捨て札へ
  C.discard.push(...C.hand);
  C.hand = [];

  const totalDamage = C.roundDamage;
  C.roundDamage = 0;

  if (totalDamage > 0) combatAddLog(`📊 ターン合計: ${totalDamage} ダメージ`);

  // ── マルチプレイヤー ──
  if (C.sessionId) {
    C.myActedRound = C.currentRound;
    showCombatModal();

    const { data, error } = await supabaseClient.rpc('drill_submit_action', {
      p_session_id: C.sessionId, p_user_id: G.userId,
      p_damage:     totalDamage,
      p_new_hand:   [], p_new_deck: C.deck, p_new_discard: C.discard,
    });

    if (error || !data?.ok) {
      combatAddLog('❌ エラーが発生しました');
      showCombatModal();
      return;
    }

    if (data.result === 'monster_dead') {
      C.monsterHp = 0;
      combatAddLog(`✨ ${C.monster.name}を倒した！`);
      G.activeCombats?.delete(`${C.cx},${C.cy}`);
      showCombatModal();
      await endCombat(true);
      return;
    }

    if (data.result === 'round_end' || data.result === 'party_dead') {
      C.monsterHp    = data.monster_hp;
      C.currentRound = C.currentRound + 1;
      C.myActedRound = C.currentRound - 1;
      C.nextAction   = data.next_action ?? getMonsterNextAction();
      const act = data.monster_action;
      if (act) {
        combatAddLog(`👾 ${C.monster.name}: ${act.name}`);
        const dmg = data.monster_damage || 0;
        if (dmg > 0) {
          G.hp = Math.max(0, G.hp - dmg);
          combatAddLog(`💥 ${dmg} ダメージを受けた！（残り HP: ${G.hp}）`);
          await saveHp();
          renderSide();
        }
      }
      if (data.result === 'party_dead' || G.hp <= 0) {
        G.activeCombats?.delete(`${C.cx},${C.cy}`);
        showCombatModal();
        await endCombat(false);
        return;
      }
      C.ap = Math.min(COMBAT_STATS.maxAp, C.ap + COMBAT_STATS.apRegen);
      drawCombatCards(3);
      showCombatModal();
      return;
    }
    // 'waiting': 他プレイヤーを待つ
    return;
  }

  // ── ソロ（ダメージは playCard で即時適用済み） ──
  const action = C.nextAction;
  if (action) {
    combatAddLog(`👾 ${C.monster.name}: ${action.name}`);
    if (action.damage > 0) {
      G.hp = Math.max(0, G.hp - action.damage);
      combatAddLog(`💥 ${action.damage} ダメージを受けた！（残り HP: ${G.hp}）`);
      await saveHp();
      renderSide();
    }
  }
  if (G.hp <= 0) {
    showCombatModal();
    await endCombat(false);
    return;
  }
  C.ap = Math.min(COMBAT_STATS.maxAp, C.ap + COMBAT_STATS.apRegen);
  drawCombatCards(3);
  C.nextAction = getMonsterNextAction();
  showCombatModal();
}

async function endCombat(win) {
  C.active = false;
  // 戦闘終了時のAPを保存（次の戦闘に引き継ぐ）
  localStorage.setItem('drill_persisted_ap', String(C.ap));
  clearCombatState();
  const monName = C.monster?.name || '???';
  if (_combatChannel) { supabaseClient.removeChannel(_combatChannel); _combatChannel = null; }
  if (C.sessionId) {
    G.activeCombats?.delete(`${C.cx},${C.cy}`);
    renderMap();
  }

  if (win) {
    await new Promise(resolve => {
      document.getElementById('modal-inner').innerHTML = `
        <div style="text-align:center;padding:24px 0 18px;">
          <div style="font-size:3rem;margin-bottom:12px;">🎉</div>
          <div style="font-size:1.1rem;font-weight:700;color:#6bde9b;">${escHtml(monName)}を倒した！</div>
        </div>
        <button class="btn-modal-close" id="combat-end-btn">閉じる</button>`;
      document.getElementById('combat-end-btn').addEventListener('click', resolve, { once: true });
    });
    document.getElementById('modal-overlay').dataset.combatModal = '';
    document.getElementById('modal-inner').classList.remove('combat-modal');
    document.getElementById('combat-log-overlay')?.remove();
    closeModal();
    log(`⚔️ ${monName}を倒した！`);
  } else {
    document.getElementById('modal-overlay').dataset.combatModal = '';
    document.getElementById('modal-inner').classList.remove('combat-modal');
    document.getElementById('combat-log-overlay')?.remove();
    closeModal();
    await handleDeath(`${monName}との戦闘`);
  }
}

// スロット番号 → エンティティ番号（中央始まり配置）
// 1体: [-, 0, -]  2体: [0, 1, -]  3体: [0, 1, 2]
function entityAtSlot(slotIdx, total) {
  if (total === 1) return slotIdx === 1 ? 0 : -1;
  if (total === 2) return slotIdx <= 1 ? slotIdx : -1;
  return slotIdx;
}

function showCombatModal() {
  saveCombatState();
  const mon = C.monster;
  if (!mon) return;

  const apPct   = COMBAT_STATS.maxAp > 0 ? Math.round((C.ap / COMBAT_STATS.maxAp) * 100) : 100;
  const apColor = apPct > 50 ? '#60b4ff' : apPct > 20 ? '#ffc107' : '#ff5555';

  // ── 敵スロット（中央始まり配置） ──
  const enemies = C.enemies?.length ? C.enemies : [mon];
  const tgt = C.targetIdx ?? 0;
  const enemySlotsHtml = Array.from({length: 3}, (_, slotIdx) => {
    const eIdx = entityAtSlot(slotIdx, enemies.length);
    if (eIdx < 0) return `<div class="cb-enemy-card cb-slot-empty"></div>`;
    const enemy  = enemies[eIdx];
    const curHp  = eIdx === 0 ? C.monsterHp : (enemy.currentHp ?? enemy.maxHp);
    const hpPct  = Math.max(0, Math.round(curHp / enemy.maxHp * 100));
    const hpCol  = hpPct > 50 ? '#6bde9b' : hpPct > 20 ? '#ffc107' : '#ff5555';
    // マルチ: まだサーバー未反映の分を予測表示
    const projDmg = (!C.sessionId || eIdx === tgt) ? 0
      : Math.min(C.roundDamage, curHp);
    const dispHp  = C.sessionId ? Math.max(0, curHp - projDmg) : curHp;
    const dispPct = Math.max(0, Math.round(dispHp / enemy.maxHp * 100));
    const imgHtml = enemy.imageUrl
      ? `<img src="${enemy.imageUrl}" style="width:58px;height:58px;object-fit:contain;image-rendering:pixelated;border-radius:8px;" onerror="this.style.display='none';this.nextElementSibling.style.display='block'"><div style="display:none;font-size:2.8rem;line-height:1;">${enemy.icon || '👾'}</div>`
      : `<div style="font-size:2.8rem;line-height:1;">${enemy.icon || '👾'}</div>`;
    const nextActHtml = (eIdx === 0 && C.nextAction)
      ? `<div style="font-size:.58rem;color:rgba(255,130,70,.9);margin-top:3px;line-height:1.3;">${escHtml(C.nextAction.name)}${C.nextAction.damage > 0 ? `<span style="color:#ff8866;"> -${C.nextAction.damage}</span>` : ''}</div>`
      : '';
    return `<div class="cb-enemy-card${eIdx === tgt ? ' cb-selected' : ''}"
        ondragover="event.preventDefault();this.classList.add('cb-drag-over')"
        ondragleave="this.classList.remove('cb-drag-over')"
        ondrop="this.classList.remove('cb-drag-over');combatDrop(event)"
        onclick="combatSelectEnemy(${eIdx})">
      ${imgHtml}
      <div style="font-size:.68rem;font-weight:700;margin-top:4px;line-height:1.2;word-break:break-all;">${escHtml(enemy.name)}</div>
      <div style="font-size:.6rem;color:${hpCol};margin-top:1px;">${dispHp}/${enemy.maxHp}</div>
      <div style="width:100%;height:4px;background:rgba(255,255,255,.15);border-radius:2px;overflow:hidden;margin-top:2px;">
        <div style="width:${dispPct}%;height:100%;background:${hpCol};border-radius:2px;transition:width .4s;"></div>
      </div>
      ${nextActHtml}
    </div>`;
  }).join('');

  // ── 味方スロット（中央始まり配置） ──
  const otherParticipants = C.participants.filter(p => p.user_id !== G.userId);
  const allParticipants = [
    { user_id: G.userId, display_name: G.displayName || 'あなた',
      avatar_url: G.avatarUrl, hp: G.hp, max_hp: G.maxHp, acted_round: C.myActedRound },
    ...otherParticipants,
  ];
  const allySlotsHtml = Array.from({length: 3}, (_, slotIdx) => {
    const pIdx = entityAtSlot(slotIdx, allParticipants.length);
    if (pIdx < 0) return `<div class="cb-ally-card cb-slot-empty"></div>`;
    const p = allParticipants[pIdx];
    const hpPct = Math.max(0, Math.round(p.hp / p.max_hp * 100));
    const hpCol = hpPct > 50 ? '#6bde9b' : hpPct > 20 ? '#ffc107' : '#ff5555';
    const acted = C.sessionId && p.acted_round >= C.currentRound;
    const isSelf = p.user_id === G.userId;
    const avHtml = p.avatar_url
      ? `<img src="${p.avatar_url}" style="width:42px;height:42px;border-radius:50%;object-fit:cover;border:2px solid ${acted ? '#ffc107' : 'rgba(107,222,155,.5)'};">`
      : `<div style="font-size:1.9rem;line-height:1;">⛏️</div>`;
    const apHtml = isSelf ? `
      <div style="width:100%;height:3px;background:rgba(255,255,255,.12);border-radius:2px;overflow:hidden;margin-top:3px;">
        <div style="width:${apPct}%;height:100%;background:${apColor};border-radius:2px;transition:width .3s;"></div>
      </div>
      <div style="font-size:.58rem;color:${apColor};margin-top:1px;">⚡${C.ap}/${COMBAT_STATS.maxAp}</div>` : '';
    return `<div class="cb-ally-card${acted ? ' cb-acted' : ''}">
      ${avHtml}
      <div style="font-size:.65rem;font-weight:700;margin-top:3px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
        ${escHtml(p.display_name)}${acted ? ' <span style="color:#ffc107;font-size:.6rem;">✓</span>' : ''}
      </div>
      <div style="font-size:.6rem;color:${hpCol};">${p.hp}/${p.max_hp}</div>
      <div style="width:100%;height:4px;background:rgba(255,255,255,.15);border-radius:2px;overflow:hidden;margin-top:2px;">
        <div style="width:${hpPct}%;height:100%;background:${hpCol};border-radius:2px;transition:width .3s;"></div>
      </div>
      ${apHtml}
    </div>`;
  }).join('');

  // ── カード列（ドラッグのみ、タップ不可） ──
  const isWaiting = C.sessionId && C.myActedRound >= C.currentRound;
  const cardHtml = C.hand.map((cardId, i) => {
    const def    = CARDS[cardId] || {};
    const apCost = def.ap_cost ?? 0;
    const canUse = C.ap >= apCost;
    const rank   = rankFromId(cardId);
    const cardImgHtml = def.imageUrl
      ? `<img class="combat-card-img" src="${def.imageUrl}" onerror="this.outerHTML='<div class=\\"combat-card-icon\\">${escHtml(def.icon || '⚔️')}</div>'">`
      : `<div class="combat-card-icon">${def.icon || '⚔️'}</div>`;
    const apColor = canUse ? '#60b4ff' : '#ff6666';
    return `<div class="combat-card${canUse ? '' : ' combat-card-disabled'}${rank ? ` rank-${rank}` : ''}"
        style="${canUse ? '' : 'opacity:.42;cursor:not-allowed;'}"
        draggable="${canUse}"
        ondragstart="${canUse ? `combatDragStart(event,${i})` : 'event.preventDefault()'}"
        ondragend="combatDragEnd(event)"
        onmousedown="combatMouseDown(event,${i})"
        onmousemove="combatMouseMove()"
        onmouseup="combatMouseUp()"
        ontouchstart="combatTouchStart(event,${i})"
        ontouchmove="combatTouchMove(event)"
        ontouchend="combatTouchEnd(event)">
      ${rankBadgeHtml(rank)}
      <div class="combat-card-ap" style="color:${apColor};">${apCost}</div>
      <div class="combat-card-img-area">${cardImgHtml}</div>
      <div class="combat-card-name-bar">${escHtml(def.name || cardId)}</div>
    </div>`;
  }).join('');

  const ov = document.getElementById('modal-overlay');
  ov.style.display = 'flex';
  ov.dataset.combatModal = '1';
  const inner = document.getElementById('modal-inner');
  inner.classList.add('combat-modal');

  inner.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
      <div style="font-size:.7rem;color:rgba(255,255,255,.4);">Round ${C.currentRound}</div>
      <button onclick="showCombatLog()" style="padding:3px 10px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);border-radius:8px;color:rgba(255,255,255,.7);cursor:pointer;font-size:.7rem;">📜 ログ</button>
    </div>

    <div id="enemy-area" class="cb-row">${enemySlotsHtml}</div>

    <div class="cb-vs">⚔️ ─── VS ─── ⚔️</div>

    <div class="cb-row">${allySlotsHtml}</div>

    ${isWaiting ? `
      <div style="text-align:center;padding:16px;font-size:.82rem;color:rgba(255,193,7,.65);">
        ⏳ 他プレイヤーの行動を待っています...
      </div>` : `
      <div style="margin:6px 0 4px;font-size:.66rem;color:rgba(255,255,255,.32);">
        カードを敵にドラッグして使用
      </div>
      <div class="cb-cards-row">${cardHtml}</div>
      <div style="display:flex;gap:8px;align-items:center;margin-top:8px;">
        <div style="flex:1;"></div>
        <button onclick="endTurn()" style="flex:1;background:linear-gradient(135deg,#c0392b,#7b241c);border:none;padding:11px 14px;border-radius:10px;color:#fff;font-size:.88rem;font-weight:700;cursor:pointer;letter-spacing:.04em;">ターン終了 →</button>
      </div>`}
  `;
}

function showCombatLog() {
  const existing = document.getElementById('combat-log-overlay');
  if (existing) existing.remove();
  const logHtml = C.logs.length
    ? C.logs.slice().reverse().map(l =>
        `<div style="font-size:.82rem;padding:4px 0;color:rgba(255,255,255,.8);border-bottom:1px solid rgba(255,255,255,.07);line-height:1.5;">${escHtml(l)}</div>`
      ).join('')
    : '<div style="opacity:.4;font-size:.82rem;padding:8px 0;">ログなし</div>';
  const overlay = document.createElement('div');
  overlay.id = 'combat-log-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.82);z-index:20000;display:flex;align-items:center;justify-content:center;padding:20px;';
  overlay.innerHTML = `
    <div style="background:#0d2447;border:1px solid rgba(255,255,255,.15);border-radius:16px;padding:20px;width:min(92vw,420px);max-height:80vh;display:flex;flex-direction:column;color:#fff;">
      <div style="font-weight:700;font-size:1rem;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,.15);">📜 戦闘ログ</div>
      <div style="flex:1;overflow-y:auto;">${logHtml}</div>
      <button onclick="document.getElementById('combat-log-overlay').remove()" style="margin-top:14px;padding:8px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.18);border-radius:8px;color:#fff;cursor:pointer;font-size:.85rem;width:100%;">✕ 閉じる</button>
    </div>`;
  document.body.appendChild(overlay);
}

// ============================================================
// マルチプレイヤー戦闘: Realtime・参加管理
// ============================================================

function setupCombatRealtime(sessionId) {
  if (_combatChannel) { supabaseClient.removeChannel(_combatChannel); _combatChannel = null; }
  _combatChannel = supabaseClient.channel('combat_' + sessionId)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public',
        table: 'drill_combat_sessions', filter: `id=eq.${sessionId}` },
      async payload => { if (C.active && C.sessionId === sessionId) await syncCombatFromDb(payload.new); })
    .on('postgres_changes', { event: 'INSERT', schema: 'public',
        table: 'drill_combat_participants', filter: `session_id=eq.${sessionId}` },
      async () => { if (C.active) await refreshCombatParticipants(sessionId); })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public',
        table: 'drill_combat_participants', filter: `session_id=eq.${sessionId}` },
      async payload => {
        if (!C.active) return;
        if (payload.new.user_id === G.userId) {
          // 自分のHP同期（モンスター全体攻撃後）
          const newHp = payload.new.hp;
          if (newHp !== G.hp) {
            G.hp = newHp;
            renderSide();
            if (G.hp <= 0 && C.active) { await endCombat(false); return; }
          }
        }
        await refreshCombatParticipants(sessionId);
      })
    .subscribe();
}

async function syncCombatFromDb(row) {
  if (!C.active) return;
  C.monsterHp = row.monster_hp;
  if (row.round_num !== C.currentRound) {
    C.currentRound = row.round_num;
    C.roundDamage  = 0; // 新ラウンドに入ったのでリセット
  }
  if (row.next_action) C.nextAction = row.next_action;
  if (row.logs?.length) C.logs = row.logs;
  if (row.status === 'ended') {
    G.activeCombats?.delete(`${C.cx},${C.cy}`);
    renderMap();
    if (C.monsterHp <= 0) { await endCombat(true); }
    else                   { await endCombat(false); }
    return;
  }
  if (C.myActedRound < C.currentRound && C.hand.length === 0) drawCombatCards(3);
  showCombatModal();
}

async function refreshCombatParticipants(sessionId) {
  const { data } = await supabaseClient
    .from('drill_combat_participants')
    .select('user_id, display_name, avatar_url, hp, max_hp, acted_round')
    .eq('session_id', sessionId);
  if (data) { C.participants = data; if (C.active) showCombatModal(); }
}

async function loadActiveCombatSessions() {
  if (!G.mapDate) return;
  G.activeCombats = new Map();
  const { data } = await supabaseClient
    .from('drill_combat_sessions')
    .select('id, cx, cy, monster_def, monster_hp')
    .eq('map_date', G.mapDate)
    .eq('status', 'active');
  (data || []).forEach(s => G.activeCombats.set(`${s.cx},${s.cy}`, s));
}

function setupGlobalCombatRealtime() {
  supabaseClient.channel('global_combat_' + G.mapDate)
    .on('postgres_changes', { event: 'INSERT', schema: 'public',
        table: 'drill_combat_sessions', filter: `map_date=eq.${G.mapDate}` },
      payload => {
        const s = payload.new;
        G.activeCombats?.set(`${s.cx},${s.cy}`, s);
        renderMap();
      })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public',
        table: 'drill_combat_sessions', filter: `map_date=eq.${G.mapDate}` },
      payload => {
        const s = payload.new;
        if (s.status === 'ended') G.activeCombats?.delete(`${s.cx},${s.cy}`);
        else G.activeCombats?.set(`${s.cx},${s.cy}`, s);
        renderMap();
      })
    .subscribe();
}

async function showJoinCombatPrompt(session, cx, cy) {
  const monDef = session.monster_def ?? {};
  const { data: parts } = await supabaseClient
    .from('drill_combat_participants')
    .select('user_id, display_name, avatar_url, hp, max_hp')
    .eq('session_id', session.id);
  const partCount = parts?.length ?? 0;
  const isFull = partCount >= 3;

  const partListHtml = (parts || []).map(p => `
    <div style="display:flex;align-items:center;gap:6px;font-size:.8rem;margin-bottom:4px;">
      ${p.avatar_url ? `<img src="${p.avatar_url}" style="width:22px;height:22px;border-radius:50%;">` : '👤'}
      <span>${escHtml(p.display_name)}</span>
      <span style="color:#6bde9b;font-size:.72rem;opacity:.8;">HP ${p.hp}/${p.max_hp}</span>
    </div>`).join('');

  return new Promise(resolve => {
    const ov = document.getElementById('modal-overlay');
    ov.style.display = 'flex';
    ov.dataset.combatModal = '1';
    document.getElementById('modal-inner').innerHTML = `
      <div style="text-align:center;margin-bottom:14px;">
        ${monDef.imageUrl
          ? `<img src="${monDef.imageUrl}" style="width:80px;height:80px;object-fit:contain;border-radius:8px;">`
          : `<div style="font-size:3.5rem;line-height:1;">${monDef.icon || '👾'}</div>`}
        <div style="font-weight:700;font-size:1rem;margin-top:8px;">${escHtml(monDef.name || '???')}</div>
        <div style="font-size:.78rem;color:#ff8866;margin-top:4px;">HP ${session.monster_hp} / ${monDef.maxHp ?? '?'}</div>
      </div>
      <div style="margin-bottom:14px;">
        <div style="font-size:.75rem;opacity:.55;margin-bottom:6px;">参加中 (${partCount}/3)</div>
        ${partListHtml}
      </div>
      ${isFull
        ? `<div style="text-align:center;font-size:.85rem;color:rgba(255,255,255,.45);padding:8px 0;">満員です</div>
           <button class="btn-modal-close" onclick="document.getElementById('modal-overlay').style.display='none';document.getElementById('modal-overlay').dataset.combatModal=''" style="width:100%;margin-top:8px;">閉じる</button>`
        : `<div style="display:flex;gap:10px;margin-top:4px;">
             <button id="join-combat-yes" class="btn-modal-close" style="flex:1;background:rgba(212,168,83,.5);">⚔️ 参加する</button>
             <button id="join-combat-no"  class="btn-modal-close" style="flex:1;">見送る</button>
           </div>`}
    `;
    document.getElementById('join-combat-no')?.addEventListener('click', () => {
      document.getElementById('modal-overlay').style.display = 'none';
      document.getElementById('modal-overlay').dataset.combatModal = '';
      resolve(false);
    }, { once: true });
    document.getElementById('join-combat-yes')?.addEventListener('click', async () => {
      document.getElementById('modal-overlay').style.display = 'none';
      document.getElementById('modal-overlay').dataset.combatModal = '';
      resolve(true);
      await joinExistingCombat(session, cx, cy);
    }, { once: true });
  });
}

async function joinExistingCombat(session, cx, cy) {
  const { data: fullSession } = await supabaseClient
    .from('drill_combat_sessions').select('*').eq('id', session.id).single();
  if (!fullSession || fullSession.status !== 'active') {
    log('⚔️ その戦闘はすでに終了しています'); return;
  }
  const monDef = fullSession.monster_def;
  const deck = shuffleArray(buildPlayerDeck());
  const hand = [];
  for (let i = 0; i < 3 && deck.length > 0; i++) hand.push(deck.pop());

  const { data, error } = await supabaseClient.rpc('drill_join_combat', {
    p_session_id:   fullSession.id,
    p_user_id:      G.userId,
    p_display_name: G.displayName || '名無し',
    p_avatar_url:   G.avatarUrl,
    p_hp: G.hp, p_max_hp: G.maxHp,
    p_hand: hand, p_deck: deck, p_discard: [],
  });
  if (error || !data?.ok) {
    log('⚔️ 参加できませんでした: ' + (data?.error || error?.message)); return;
  }
  log('⚔️ 戦闘に参加しました！');
  C.active       = true;
  C.sessionId    = fullSession.id;
  C.cx           = cx;
  C.cy           = cy;
  C.monster      = { ...monDef };
  C.monsterHp    = fullSession.monster_hp;
  C.deck         = deck;
  C.hand         = hand;
  C.discard      = [];
  C.logs         = (fullSession.logs || []).slice();
  C.currentRound = data.round_num;
  C.myActedRound = data.round_num - 1;
  C.nextAction   = data.next_action ?? getMonsterNextAction();
  C.participants = [];
  setupCombatRealtime(fullSession.id);
  await refreshCombatParticipants(fullSession.id);
  showCombatModal();
}

// ドラッグ＆ドロップ（デスクトップ）
function combatDragStart(e, idx) {
  _draggedCardIdx = idx;
  e.dataTransfer.effectAllowed = 'move';
}

function combatDragEnd(e) {
  _draggedCardIdx = null;
  document.querySelectorAll('.cb-drag-over').forEach(el => el.classList.remove('cb-drag-over'));
}

function combatDrop(e) {
  e.preventDefault();
  document.querySelectorAll('.cb-drag-over').forEach(el => el.classList.remove('cb-drag-over'));
  if (_draggedCardIdx !== null) {
    const idx = _draggedCardIdx;
    _draggedCardIdx = null;
    playCard(idx);
  }
}

function combatSelectEnemy(idx) {
  const enemies = C.enemies?.length ? C.enemies : [C.monster];
  if (idx < enemies.length && enemies[idx]) {
    C.targetIdx = idx;
    showCombatModal();
  }
}

// ── デスクトップ長押し ──
function combatMouseDown(e, idx) {
  if (e.button !== 0) return;
  _cbMouseDown = true;
  clearTimeout(_cbMouseLpTimer);
  _cbMouseLpTimer = setTimeout(() => {
    _cbMouseLpTimer = null;
    _cbMouseDown = false;
    const cardId = C.hand?.[idx];
    if (cardId) showCardDetail(cardId, CARDS[cardId] || {});
  }, 500);
}
function combatMouseMove() {
  if (_cbMouseDown) {
    clearTimeout(_cbMouseLpTimer);
    _cbMouseLpTimer = null;
    _cbMouseDown = false;
  }
}
function combatMouseUp() {
  clearTimeout(_cbMouseLpTimer);
  _cbMouseLpTimer = null;
  _cbMouseDown = false;
}

// ── タッチドラッグ（モバイル） + 長押し ──
function combatTouchStart(e, idx) {
  _touchCardIdx = idx;
  _touchGhost = null;
  const t0 = e.touches[0];
  _touchStartPos = { x: t0.clientX, y: t0.clientY };
  clearTimeout(_touchLpTimer);
  _touchLpTimer = setTimeout(() => {
    if (_touchCardIdx !== idx) return;
    _touchCardIdx = null;
    const cardId = C.hand?.[idx];
    if (cardId) showCardDetail(cardId, CARDS[cardId] || {});
  }, 500);
}

function combatTouchMove(e) {
  const t = e.touches[0];
  if (_touchGhost) {
    e.preventDefault();
    _touchGhost.style.left = (t.clientX - _touchGhost.offsetWidth  / 2) + 'px';
    _touchGhost.style.top  = (t.clientY - _touchGhost.offsetHeight / 2) + 'px';
    const zone = document.getElementById('enemy-area');
    if (zone) {
      const zr = zone.getBoundingClientRect();
      zone.classList.toggle('enemy-area--active',
        t.clientX >= zr.left && t.clientX <= zr.right &&
        t.clientY >= zr.top  && t.clientY <= zr.bottom);
    }
    return;
  }
  if (_touchCardIdx === null) return;
  const dx = t.clientX - _touchStartPos.x;
  const dy = t.clientY - _touchStartPos.y;
  if (Math.hypot(dx, dy) > 10) {
    clearTimeout(_touchLpTimer);
    _touchLpTimer = null;
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    _touchGhost = card.cloneNode(true);
    Object.assign(_touchGhost.style, {
      position: 'fixed', zIndex: '99999', opacity: '.85', pointerEvents: 'none',
      width: rect.width + 'px', height: rect.height + 'px',
      left: (t.clientX - rect.width  / 2) + 'px',
      top:  (t.clientY - rect.height / 2) + 'px',
      transform: 'scale(1.1)', transition: 'none',
    });
    document.body.appendChild(_touchGhost);
    e.preventDefault();
  }
}

function combatTouchEnd(e) {
  clearTimeout(_touchLpTimer);
  _touchLpTimer = null;
  if (_touchGhost) { _touchGhost.remove(); _touchGhost = null; }
  document.getElementById('enemy-area')?.classList.remove('enemy-area--active');
  if (_touchCardIdx === null) return;
  const idx = _touchCardIdx;
  _touchCardIdx = null;
  const zone = document.getElementById('enemy-area');
  if (!zone) return;
  const t = e.changedTouches[0];
  const zr = zone.getBoundingClientRect();
  if (t.clientX >= zr.left && t.clientX <= zr.right &&
      t.clientY >= zr.top  && t.clientY <= zr.bottom) {
    playCard(idx);
  }
}

// ============================================================
// カード詳細ポップアップ
// ============================================================

const _RANK_BG = {
  d: '#60637a', c: '#2a9e5c', b: '#1870d4',
  a: 'linear-gradient(135deg,#8820e8,#cc30b8)',
  s: 'linear-gradient(135deg,#ff4000,#ffcc00)',
};

function showCardDetail(cardId, def) {
  hideCardDetail();
  const rank = rankFromId(cardId);
  const imgHtml = def.imageUrl
    ? `<img src="${escHtml(def.imageUrl)}" style="width:100%;height:100%;object-fit:contain;">`
    : `<div class="cd-icon">${escHtml(def.icon || '⚔️')}</div>`;
  const row = (label, val) =>
    `<div class="cd-stat-label">${label}</div><div class="cd-stat-val">${val}</div>`;
  const bd = document.createElement('div');
  bd.id = 'card-detail-backdrop';
  bd.addEventListener('click', hideCardDetail);
  const pop = document.createElement('div');
  pop.id = 'card-detail-popup';
  pop.innerHTML = `
    <div class="cd-img">${imgHtml}</div>
    <div class="cd-header">
      ${rank ? `<div class="cd-rank-badge" style="background:${_RANK_BG[rank]};">${rank.toUpperCase()}</div>` : ''}
      <div class="cd-name">${escHtml(def.name || cardId)}</div>
    </div>
    ${def.desc ? `<div class="cd-desc">${escHtml(def.desc)}</div>` : ''}
    <div class="cd-stats">
      ${row('APコスト', def.ap_cost ?? 0)}
      ${def.base_attack != null ? row('カード攻撃力', `+${def.base_attack}`) : ''}
      ${def.mult_min != null || def.mult_max != null
        ? row('倍率', `${def.mult_min ?? '?'} ～ ${def.mult_max ?? '?'}`) : ''}
      ${def.crit_rate_bonus != null ? row('クリ率補正', `+${def.crit_rate_bonus}%`) : ''}
      ${def.crit_dmg_bonus  != null ? row('クリダメ補正', `+${def.crit_dmg_bonus}`) : ''}
      ${row('攻撃回数', def.hit_count ?? 1)}
      ${row('対象', TARGET_LABELS[def.target ?? 'SINGLE'] ?? (def.target || '単体（敵）'))}
      ${def.heal != null ? row('回復力', def.heal) : ''}
    </div>
    <button class="cd-close" onclick="hideCardDetail()">閉じる</button>`;
  document.body.appendChild(bd);
  document.body.appendChild(pop);
}

function hideCardDetail() {
  document.getElementById('card-detail-backdrop')?.remove();
  document.getElementById('card-detail-popup')?.remove();
}

// ============================================================
// モーダルユーティリティ
// ============================================================

function openModal(html) {
  document.getElementById('modal-inner').innerHTML = html;
  document.getElementById('modal-overlay').style.display = 'flex';
}

function closeModal() {
  releaseDropLock(); // ドロップロック解放（保持中のみ）
  document.getElementById('modal-overlay').style.display = 'none';
}

// ============================================================
// Realtime
// ============================================================

function setupRealtime() {
  // filter なしで全変更を受信し、クライアント側で map_date を判定（filter 付きは不安定なため）
  _drillChannel = supabaseClient.channel('drill_rt', {
    config: { broadcast: { self: false } },
  })
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'drill_dug_cells',
    }, ({ new: r }) => {
      if (!r || r.map_date !== G.mapDate) return;
      G.dugCells.add(`${r.x},${r.y}`);
      G.digLocks.delete(`${r.x},${r.y}`);
      scheduleRender();
    })
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'drill_dig_locks',
    }, ({ new: r, old: o, eventType }) => {
      if (eventType === 'DELETE') {
        const key = o ? `${o.x},${o.y}` : null;
        if (key && G.digLocks.get(key)?.by !== G.userId) G.digLocks.delete(key);
      } else if (r && r.map_date === G.mapDate) {
        if (r.locked_by !== G.userId)
          G.digLocks.set(`${r.x},${r.y}`, { by: r.locked_by, exp: r.expires_at });
      }
      scheduleRender();
    })
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'drill_dropped_items',
    }, ({ new: r }) => {
      if (!r || r.map_date !== G.mapDate || r.dropper_user_id === G.userId) return;
      const key = `${r.pos_x},${r.pos_y}`;
      if (!G.droppedItems.has(key)) G.droppedItems.set(key, []);
      G.droppedItems.get(key).push({
        id: r.id, items: r.items || [],
        dropper_name: r.dropper_name || '???',
        cause_of_death: r.cause_of_death || null,
        dropped_at: r.dropped_at,
        locked_by: r.locked_by || null,
        locked_until: r.locked_until || null,
      });
      scheduleRender();
    })
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'drill_dropped_items',
    }, ({ new: r }) => {
      if (!r) return;
      const key = `${r.pos_x},${r.pos_y}`;
      const list = G.droppedItems.get(key);
      if (list) {
        const d = list.find(x => x.id === r.id);
        if (d) {
          d.items = r.items || [];
          d.locked_by = r.locked_by || null;
          d.locked_until = r.locked_until || null;
        }
      }
      if (_currentDrop?.drop?.id === r.id) {
        _currentDrop.drop.items = r.items || [];
      }
      scheduleRender();
    })
    .on('postgres_changes', {
      event: 'DELETE', schema: 'public', table: 'drill_dropped_items',
    }, ({ old: r }) => {
      if (!r) return;
      // REPLICA IDENTITY FULL があれば pos_x/pos_y が取れる。なければ全スキャン
      const key = (r.pos_x != null && r.pos_y != null) ? `${r.pos_x},${r.pos_y}` : null;
      if (key) {
        const list = G.droppedItems.get(key);
        if (list) {
          const idx = list.findIndex(d => d.id === r.id);
          if (idx >= 0) list.splice(idx, 1);
          if (list.length === 0) G.droppedItems.delete(key);
        }
      } else {
        for (const [k, list] of G.droppedItems) {
          const idx = list.findIndex(d => d.id === r.id);
          if (idx >= 0) {
            list.splice(idx, 1);
            if (list.length === 0) G.droppedItems.delete(k);
            break;
          }
        }
      }
      if (_currentDrop?.drop?.id === r.id) { closeModal(); _currentDrop = null; }
      scheduleRender();
    })
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'drill_player_positions',
    }, ({ new: r }) => {
      if (!r || r.map_date !== G.mapDate) return;
      if (r.user_id !== G.userId) {
        G.otherPlayers.set(r.user_id, { x: r.x, y: r.y, avatarUrl: r.avatar_url || null });
        scheduleRender();
      } else if ((r.x !== G.px || r.y !== G.py) && Date.now() - _lastMoveTime > 2000) {
        // 2秒以内に動いていれば自分の位置エコーを無視（連打時のスナップバック防止）
        _applyRemotePos(r.x, r.y);
      }
    })
    .on('broadcast', { event: 'pos' }, ({ payload: p }) => {
      if (!p || p.date !== G.mapDate) return;
      if (p.uid !== G.userId) {
        G.otherPlayers.set(p.uid, { x: p.x, y: p.y, avatarUrl: p.av || G.otherPlayers.get(p.uid)?.avatarUrl || null });
        scheduleRender();
      } else if ((p.x !== G.px || p.y !== G.py) && Date.now() - _lastMoveTime > 2000) {
        _applyRemotePos(p.x, p.y);
      }
    })
    .subscribe((status, err) => {
      if (err) console.warn('[DrillRT]', status, err);
    });

  // ページ停止を即時検知して追い出す
  supabaseClient.channel('page_access_rt')
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'page_settings',
    }, ({ new: r }) => {
      if (!r) return;
      const path = (r.path || '').replace(/\/$/, '');
      if (path === '/drill' && r.is_active === false && !G.isAdmin) {
        window.location.href = '/';
      }
    })
    .subscribe();

  setupGlobalCombatRealtime();
}

// 別端末の位置を適用し、全状態をバックグラウンドで再ロード
function _applyRemotePos(x, y) {
  stopMine();
  G.px = x; G.py = y;
  G.surfaceMode = (y === START_Y);
  render();
  loadAll().then(render).catch(console.error);
}

// ============================================================
// 描画
// ============================================================

function scheduleRender() {
  if (_renderRafId !== null) return;
  _renderRafId = requestAnimationFrame(() => { _renderRafId = null; render(); });
}

function render() {
  renderView();
  renderSurfaceHome();
  renderMap();
  renderSide();
}

function showCurseOverlay(intensity = 'strong') {
  const existing = document.getElementById('curse-overlay');
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.id = 'curse-overlay';
  el.dataset.intensity = intensity;
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove(), { once: true });
}

function renderView() {
  const sh = document.getElementById('surface-home');
  const gw = document.getElementById('game-wrap');
  if (sh) sh.style.display = G.surfaceMode ? 'flex' : 'none';
  if (gw) gw.style.display = G.surfaceMode ? 'none' : '';
}

function renderSurfaceHome() {
  const el = document.getElementById('surface-home');
  if (!el || !G.surfaceMode) return;

  const drill = DRILLS[G.equippedDrillId] || DRILLS.beginner;
  const durStr = G.drillDur === null ? '∞' : G.drillDur;
  const bpKeys = Object.keys(G.backpack).filter(k => G.backpack[k] > 0);
  const surfBw = bpWeight();
  const surfBwPct = Math.min(100, Math.round((surfBw / G.maxBpWeight) * 100));
  const surfBwColor = surfBwPct >= 90 ? '#f44336' : surfBwPct >= 60 ? '#ff9800' : '#4caf50';

  el.innerHTML = `
    <div class="sh-card">
      <div class="sh-title">⛏️ ほりほりドリル</div>
      <div class="sh-stats">
        <span>💰 ${G.drillGold}G</span>
        <span>📍 地上 (0m)</span>
      </div>
      <div class="sh-drill-info">装備: ${drill.name} ／ 耐久: ${durStr}</div>
      <div style="margin-top:8px;">
        <div style="display:flex;justify-content:space-between;font-size:.72rem;opacity:.6;margin-bottom:3px;">
          <span>🎒 リュック</span><span style="color:${surfBwColor};">${surfBw} / ${G.maxBpWeight}</span>
        </div>
        <div style="height:6px;background:rgba(255,255,255,.12);border-radius:3px;overflow:hidden;">
          <div style="height:100%;width:${surfBwPct}%;background:${surfBwColor};border-radius:3px;transition:width .3s;"></div>
        </div>
      </div>
    </div>
    <div class="sh-menu">
      <button class="sh-btn" onclick="showShop()">🛒&ensp;ショップ</button>
      <button class="sh-btn" onclick="showCraft()">🔨&ensp;クラフト</button>
      <button class="sh-btn" onclick="showSynthesize()">⚗️&ensp;カード合成</button>
      <button class="sh-btn" onclick="showInventory()">📦&ensp;アイテム${bpKeys.length > 0 ? `<span class="sh-badge">${bpKeys.length}</span>` : ''}</button>
      <a class="sh-btn" href="../market/index.html" style="text-decoration:none;text-align:center;">🏪&ensp;マーケット</a>
      <a class="sh-btn" href="formation.html" style="text-decoration:none;text-align:center;">⚔️&ensp;編成</a>
    </div>
    <div class="sh-dive-wrap">
      <button class="sh-dive-btn" onclick="startDive()">⛏️&ensp;地下に潜る</button>
      ${G.isAdmin ? `<a href="admin.html" style="display:block;margin-top:10px;text-align:center;font-size:.75rem;color:rgba(255,255,255,.4);text-decoration:none;">⚙️ 管理画面</a>` : ''}
    </div>
  `;
}

function startDive() {
  showDiveModal();
}

function showDiveModal() {
  const x = G.px;
  openModal(`
    <div class="modal-title">⛏️ 潜る場所を選ぶ</div>
    <div style="text-align:center;font-size:2.4rem;font-weight:700;color:#d4a853;margin:14px 0 4px;letter-spacing:.04em;" id="dive-x-disp">${x}</div>
    <div style="font-size:.72rem;opacity:.45;text-align:center;margin-bottom:14px;">X 座標</div>
    <input type="range" min="0" max="255" value="${x}" id="dive-x-slider"
      style="width:100%;accent-color:#d4a853;height:6px;margin-bottom:6px;cursor:pointer;"
      oninput="document.getElementById('dive-x-disp').textContent=this.value">
    <div style="display:flex;justify-content:space-between;font-size:.7rem;opacity:.4;margin-bottom:20px;">
      <span>0</span><span>128</span><span>255</span>
    </div>
    <button class="btn-modal-action" style="width:100%;font-size:1rem;padding:12px;" onclick="confirmDive()">⛏️ ここから潜る</button>
    <button class="btn-modal-close" onclick="closeModal()">キャンセル</button>
  `);
}

async function confirmDive() {
  const slider = document.getElementById('dive-x-slider');
  if (!slider) return;
  const x = Math.min(MAP_W - 1, Math.max(0, parseInt(slider.value, 10)));
  closeModal();
  G.px = x;
  await savePos();
  G.surfaceMode = false;
  render();
  move(0, 1);
}

function renderMap() {
  const grid = document.getElementById('map-grid');
  if (!grid) return;

  const halfW = (VP_W - 1) >> 1;
  const halfH = (VP_H - 1) >> 1;
  // O(1)ルックアップ用マップを事前構築（セルごとのO(n)線形探索を回避）
  const otherByPos = new Map();
  for (const p of G.otherPlayers.values()) otherByPos.set(`${p.x},${p.y}`, p);

  const cells = [];

  for (let vy = 0; vy < VP_H; vy++) {
    for (let vx = 0; vx < VP_W; vx++) {
      const wx = G.px - halfW + vx;
      const wy = G.py - halfH + vy;
      cells.push(buildCell(wx, wy, vx, vy, otherByPos));
    }
  }

  grid.innerHTML = cells.join('');

  document.getElementById('coord-disp').textContent = `📍 ${G.px}, ${G.py}`;
  const lyr = Math.floor(G.py / 100) + 1;
  document.getElementById('layer-disp').textContent = `第${lyr}層 (${G.py}m)`;
  document.getElementById('gold-disp').textContent = `💰 ${G.drillGold}G`;
}

function buildCell(wx, wy, vx = 0, vy = 0, otherByPos = null) {
  // 地図外（横・下）は void
  if (wx < 0 || wx >= MAP_W || wy >= MAP_H) {
    return `<div class="mc mc-void"></div>`;
  }

  // 地上より上（空エリア）または地表行のみ skyStyle を計算（深地下では不要）
  let skyStyle = '';
  if (wy <= 0) {
    const halfH_c = (VP_H - 1) >> 1;
    const vySurf  = halfH_c - G.py;
    const skyN    = Math.max(1, vySurf + 1);
    const bgX     = `${vx / (VP_W - 1) * 100}%`;
    const bgY     = skyN > 1 ? `${vy / (skyN - 1) * 100}%` : '100%';
    skyStyle = `background:#1a3a1a url('./img/surface.png') ${bgX} ${bgY} / ${VP_W * 100}% ${skyN * 100}% no-repeat;image-rendering:pixelated;`;
  }

  if (wy < 0) {
    return `<div class="mc" style="${skyStyle}"></div>`;
  }

  // 霧：視界外は暗闇
  if (!isVisible(wx, wy)) {
    return `<div class="mc mc-fog"></div>`;
  }

  // 層ごとの背景（地下のみ）。画像ありの場合は地上と同様にVP全体で一枚展開
  let layerBg = '';
  if (wy > 0) {
    const lyr = LAYER_BG[Math.min(LAYER_BG.length - 1, Math.floor(wy / 100))];
    if (lyr.image) {
      const bgX = VP_W > 1 ? `${vx / (VP_W - 1) * 100}%` : '0%';
      const bgY = VP_H > 1 ? `${vy / (VP_H - 1) * 100}%` : '0%';
      layerBg = `background:${lyr.color} url('${lyr.image}') ${bgX} ${bgY} / ${VP_W * 100}% ${VP_H * 100}% no-repeat;image-rendering:pixelated`;
    } else {
      layerBg = `background:${lyr.color}`;
    }
  }

  const isPlayer = wx === G.px && wy === G.py;
  if (isPlayer) {
    const icon = G.avatarUrl
      ? `<img class="player-icon" src="${G.avatarUrl}" alt="" />`
      : `<div class="player-icon">⛏️</div>`;
    return `<div class="mc mc-player" style="${layerBg}">${icon}</div>`;
  }

  const key = `${wx},${wy}`;
  const otherAt = otherByPos ? otherByPos.get(key) : [...G.otherPlayers.values()].find(p => p.x === wx && p.y === wy);
  const isOther = !!otherAt;
  const isDug = G.dugCells.has(key) || wy === 0;
  const isLocked = G.digLocks.has(key) && G.digLocks.get(key).by !== G.userId;
  const isMining = G.mineTarget?.x === wx && G.mineTarget?.y === wy;

  if (isDug) {
    // 宝箱が開封済みでも残りアイテムがあれば宝箱として描画
    const hasTreasureDrop = wy > 0 && G.treasureMap?.has(key) &&
      G.droppedItems?.get(key)?.some(d => d.cause_of_death === 'treasure');
    if (hasTreasureDrop) {
      const typeId  = G.treasureMap.get(key);
      const typeDef = TREASURE_TYPES[typeId] ?? {};
      const chestName = typeDef.name ?? '宝箱';
      const imgEl = typeDef.imageUrl ? `<img class="cell-chest-icon" src="${typeDef.imageUrl}" alt="">` : '';
      return `<div class="mc mc-treasure" style="${layerBg}" title="${escHtml(chestName)}（残りあり）">${imgEl}</div>`;
    }

    const base = wy === 0 ? 'mc-surf' : 'mc-dug';
    let inner = '';
    // モンスターオーバーレイ
    const combatAtCell = G.activeCombats?.get(key);
    if (combatAtCell) {
      const mDef = combatAtCell.monster_def ?? {};
      inner += mDef.imageUrl
        ? `<img class="cell-monster-icon" src="${mDef.imageUrl}" alt="${escHtml(mDef.name||'')}" title="${escHtml(mDef.name||'モンスター')}">`
        : `<div class="cell-monster-icon" title="${escHtml(mDef.name||'モンスター')}">${mDef.icon || '👾'}</div>`;
    }
    if (isOther) {
      inner += otherAt.avatarUrl
        ? `<img class="player-icon other-icon" src="${otherAt.avatarUrl}" alt="" />`
        : `<div class="player-icon other-icon">🧑</div>`;
    }
    if (G.droppedItems?.has(`${wx},${wy}`)) {
      inner += `<div class="player-icon other-icon" style="font-size:.85rem;" title="落とし物あり">📦</div>`;
    }
    // 地表行は sky style、地下は層別背景色
    const cellStyle = wy === 0 ? ` style="${skyStyle}"` : ` style="${layerBg}"`;
    return `<div class="mc ${base}"${cellStyle}>${inner}</div>`;
  }

  const mat = cellMat(wx, wy);
  if (!mat) return `<div class="mc mc-void"></div>`;

  const m = MATS[mat];
  let extra = '';
  if (isMining) {
    const prog = Math.round(((m.hp - (G.mineHP[key] ?? m.hp)) / m.hp) * 100);
    extra = `<div class="mine-bar" style="width:${prog}%"></div>`;
  }
  const lockCls = isLocked ? ' mc-lock' : '';
  const mineCls = isMining ? ' mc-mining' : '';
  const lockIcon = isLocked && !isMining ? '🔒' : '';

  if (mat === 'treasure') {
    const typeId  = G.treasureMap.get(key);
    const typeDef = TREASURE_TYPES[typeId] ?? {};
    const chestName = typeDef.name ?? '宝箱';
    const imgEl = typeDef.imageUrl
      ? `<img class="cell-chest-icon" src="${typeDef.imageUrl}" alt="">`
      : '';
    return `<div class="mc mc-treasure${lockCls}${mineCls}" title="${escHtml(chestName)}">${lockIcon}${extra}${imgEl}</div>`;
  }

  return `<div class="mc ${m.cls}${lockCls}${mineCls}" title="${m.name}">${lockIcon}${extra}</div>`;
}

function renderSide() {
  // ドリル情報
  const drill = DRILLS[G.equippedDrillId] || DRILLS.beginner;
  const durStr = G.drillDur === null ? '∞' : G.drillDur;
  setHTML('drill-info', `
    <div>${drill.name}</div>
    <div>威力: ${drill.power}</div>
    <div>耐久: ${durStr}</div>
  `);

  // HP表示
  const hpPct   = Math.max(0, Math.round((G.hp / G.maxHp) * 100));
  const hpColor = hpPct > 50 ? '#6bde9b' : hpPct > 20 ? '#ffc107' : '#ff5555';
  const hpBar   = `<div class="mob-dur-wrap" style="min-width:90px;">
    <span style="font-size:.72rem;opacity:.7;">❤️ HP</span>
    <div class="mob-dur-bar"><div class="mob-dur-fill" style="width:${hpPct}%;background:${hpColor};"></div></div>
    <span style="color:${hpColor};font-size:.78rem;">${G.hp}</span>
  </div>`;

  // モバイル用ドリルバー
  let durHtml;
  if (G.drillDur === null) {
    durHtml = `<span style="opacity:.6;">耐久 ∞</span>`;
  } else {
    const pct = Math.max(0, Math.round((G.drillDur / (drill.dur || 1)) * 100));
    const color = pct > 50 ? '#6bde9b' : pct > 20 ? '#ffc107' : '#ff5555';
    durHtml = `
      <span>耐久</span>
      <div class="mob-dur-bar"><div class="mob-dur-fill" style="width:${pct}%;background:${color};"></div></div>
      <span style="color:${color};">${G.drillDur}</span>
    `;
  }
  const mbw = bpWeight();
  const mbwPct = Math.min(100, Math.round((mbw / G.maxBpWeight) * 100));
  const mbwColor = mbwPct >= 100 ? '#ff5555' : mbwPct > 70 ? '#ffc107' : '#6bde9b';
  const bpBar = `<div class="mob-dur-wrap" style="min-width:70px;">
    <span style="font-size:.68rem;opacity:.6;">🎒</span>
    <div class="mob-dur-bar"><div class="mob-dur-fill" style="width:${mbwPct}%;background:${mbwColor};"></div></div>
    <span style="color:${mbwColor};font-size:.72rem;">${mbw}</span>
  </div>`;
  setHTML('mob-drill-bar', `
    <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">⛏️ ${drill.name}</span>
    <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
      <span style="opacity:.75;white-space:nowrap;">威力 ${drill.power}</span>
      <div class="mob-dur-wrap" style="margin-left:0;">${durHtml}</div>
      ${hpBar}
      ${bpBar}
    </div>
  `);

  // ステータス
  const lyr = Math.floor(G.py / 100) + 1;
  setHTML('status-info', `
    <div>📍 ${G.px}, ${G.py}</div>
    <div>第${lyr}層</div>
    <div>💰 ${G.drillGold}G</div>
    <div style="margin-top:4px;">
      <div style="font-size:.75rem;opacity:.65;margin-bottom:2px;">❤️ HP ${G.hp} / ${G.maxHp}</div>
      <div style="height:6px;background:rgba(255,255,255,.15);border-radius:3px;overflow:hidden;">
        <div style="width:${hpPct}%;height:100%;background:${hpColor};transition:width .3s;"></div>
      </div>
    </div>
    ${G.mineTarget ? '<div style="margin-top:4px;">⛏️ 掘削中...</div>' : ''}
  `);

  // リュック
  const bpItems = Object.entries(G.backpack).filter(([, v]) => v > 0);
  const bw = bpWeight();
  const bwPct = Math.min(100, Math.round((bw / G.maxBpWeight) * 100));
  const bwColor = bwPct >= 100 ? '#ff5555' : bwPct > 70 ? '#ffc107' : '#6bde9b';
  setHTML('backpack-disp', `
    <div style="margin-bottom:5px;">
      <div style="display:flex;justify-content:space-between;font-size:.7rem;margin-bottom:2px;">
        <span style="opacity:.55;">容量</span>
        <span style="color:${bwColor};">${bw}/${G.maxBpWeight}</span>
      </div>
      <div style="height:4px;background:rgba(255,255,255,.15);border-radius:2px;overflow:hidden;">
        <div style="width:${bwPct}%;height:100%;background:${bwColor};border-radius:2px;"></div>
      </div>
    </div>
    ${bpItems.length === 0 ? '<div style="opacity:.5;font-size:.78rem;">空</div>' : bpItems.map(([k, v]) => `<div>${ITEM_NAMES[k]||k}: ${v}</div>`).join('')}
  `);
}

function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

// ============================================================
// ログ
// ============================================================

function log(msg) {
  const entry = `<div>${msg}</div>`;
  G.logs.unshift(msg);
  if (G.logs.length > 60) G.logs.pop();

  const logDisp = document.getElementById('log-disp');
  if (logDisp) logDisp.innerHTML = G.logs.slice(0, 30).map(l => `<div>${l}</div>`).join('');

  const logMob = document.getElementById('log-mobile-inner');
  if (logMob) logMob.innerHTML = G.logs.slice(0, 4).map(l => `<div>${l}</div>`).join('');
}

// ============================================================
// 入力
// ============================================================

function handleClick(wx, wy) {
  const dx = wx - G.px, dy = wy - G.py;
  if (dx === 0 && dy === 0) return;
  if (Math.abs(dx) >= Math.abs(dy)) move(dx > 0 ? 1 : -1, 0);
  else move(0, dy > 0 ? 1 : -1);
}

function setupInput() {
  // モバイルアクションボタン（地下専用: アイテム・リュック・ログ）
  document.getElementById('btn-items')?.addEventListener('click', showItems);
  document.getElementById('btn-bag')?.addEventListener('click', () => showInventory('bag_mats'));
  document.getElementById('btn-log')?.addEventListener('click', showLogModal);

  // PC 左パネルボタン
  document.getElementById('btn-drills-pc')?.addEventListener('click', showDrills);
  document.getElementById('btn-bag-pc')?.addEventListener('click', () => showInventory('bag_mats'));
  document.getElementById('btn-return-pc')?.addEventListener('click', () => showInventory('bag_mats'));

  // キーボード（リピートは無視して1押し1歩）
  document.addEventListener('keydown', e => {
    if (e.repeat) return;
    if (document.getElementById('modal-overlay').style.display !== 'none') {
      const ov = document.getElementById('modal-overlay');
      if (e.key === 'Escape' && !ov.dataset.eventModal && !ov.dataset.combatModal) closeModal();
      return;
    }
    switch (e.key) {
      case 'ArrowUp': case 'w': case 'W': e.preventDefault(); move(0, -1); break;
      case 'ArrowDown': case 's': case 'S': e.preventDefault(); move(0, 1); break;
      case 'ArrowLeft': case 'a': case 'A': e.preventDefault(); move(-1, 0); break;
      case 'ArrowRight': case 'd': case 'D': e.preventDefault(); move(1, 0); break;
      case 'Escape': stopMine(); break;
    }
  });

  // PC マウスクリック（viewport全体で拾い、クリック先へ1歩進む）
  const vp = document.getElementById('map-viewport');
  vp?.addEventListener('click', e => {
    if (G.surfaceMode) return;
    if (G.mineTarget) { stopMine(); render(); return; }
    const rect = vp.getBoundingClientRect();
    const vx = Math.floor((e.clientX - rect.left) / (rect.width  / VP_W));
    const vy = Math.floor((e.clientY - rect.top)  / (rect.height / VP_H));
    handleClick(G.px - ((VP_W - 1) >> 1) + vx, G.py - ((VP_H - 1) >> 1) + vy);
  });

  // タブ復帰・アプリ再表示時に最新状態を強制取得（別端末操作への追従）
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && G.userId) {
      loadAll().then(render).catch(console.error);
    }
  });

  // タッチ方向入力（マップを×字で4分割: 中心からの相対位置で上下左右判定）
  vp?.addEventListener('touchstart', e => {
    e.preventDefault();
    const rect = vp.getBoundingClientRect();
    const relX = e.touches[0].clientX - rect.left - rect.width / 2;
    const relY = e.touches[0].clientY - rect.top - rect.height / 2;
    if (G.mineTarget) { stopMine(); render(); return; }
    if (Math.abs(relX) > Math.abs(relY)) move(relX > 0 ? 1 : -1, 0);
    else move(0, relY > 0 ? 1 : -1);
  }, { passive: false });

  // オーバーレイ外クリックで閉じる（イベント・戦闘モーダル中は無視）
  document.getElementById('modal-overlay')?.addEventListener('click', e => {
    const ov = document.getElementById('modal-overlay');
    if (e.target === ov && !ov.dataset.eventModal && !ov.dataset.combatModal) closeModal();
  });
}

// ============================================================
// 定期メンテナンス
// ============================================================

function periodicCleanup() {
  const now = Date.now();
  for (const [key, lock] of G.digLocks) {
    if (lock.by !== G.userId && new Date(lock.exp).getTime() < now) {
      G.digLocks.delete(key);
    }
  }
}

async function handleMapReset() {
  const oldX = G.px, oldY = G.py;
  stopMine();
  closeModal();
  clearCombatState();
  C.active = false;
  log('🌅 マップがリセットされました。新しいマップへ移行中...');

  await ensureSeed();
  genTreasures(G.seed);

  if (oldY > 0) {
    // 旧位置のブロックを新マップで消去（競合失敗は無視）
    await supabaseClient.from('drill_dug_cells')
      .insert({ map_date: G.mapDate, x: oldX, y: oldY, dug_by: G.userId });
    // 位置を新マップ日付で先に保存（loadAll が正しく拾えるよう）
    await supabaseClient.from('drill_player_positions').upsert({
      user_id: G.userId, map_date: G.mapDate, x: oldX, y: oldY,
      avatar_url: G.avatarUrl, updated_at: new Date().toISOString(),
    });
  }

  await loadAll();
  log('✅ 新しいマップへ移行しました');
  render();
}

// HP・ゴールド・リュックを10秒ごとにDBから再取得（Realtime取りこぼし補完）
async function periodicStateSync() {
  if (gameDate() !== G.mapDate) { await handleMapReset(); return; }
  if (G.surfaceMode) return;
  try {
    const [profRes, bpRes] = await Promise.all([
      supabaseClient.from('profiles').select('drill_gold,drill_hp').eq('discord_user_id', G.discordId).single(),
      supabaseClient.from('drill_backpack').select('item_id,quantity').eq('user_id', G.userId),
    ]);
    let changed = false;
    if (profRes.data) {
      const p = profRes.data;
      if (p.drill_gold != null && p.drill_gold !== G.drillGold) { G.drillGold = p.drill_gold; changed = true; }
      if (p.drill_hp   != null && p.drill_hp   !== G.hp)        { G.hp        = p.drill_hp;   changed = true; }
    }
    if (bpRes.data) {
      const bp = {};
      for (const r of bpRes.data) if ((r.quantity ?? 0) > 0) bp[r.item_id] = r.quantity;
      const bpStr = JSON.stringify(bp);
      if (bpStr !== JSON.stringify(G.backpack)) { G.backpack = bp; changed = true; }
    }
    if (changed) renderSide();
  } catch (e) { /* ignore */ }
}

// ============================================================
// 初期化
// ============================================================

async function initDrillGame() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) { window.location.href = '../login/index.html'; return; }
  G.userId = user.id;
  G.discordId = user.user_metadata?.provider_id || null;
  G.avatarUrl = user.user_metadata?.avatar_url || null;
  G.displayName = user.user_metadata?.name || user.user_metadata?.full_name || '名無し';

  if (typeof ADMIN_DISCORD_IDS !== 'undefined' && ADMIN_DISCORD_IDS.includes(G.discordId)) {
    G.isAdmin = true;
  }

  await loadGameConfig();
  G.maxHp = BASE_HP;  // loadGameConfig後にBASE_HPが確定するので here
  G.hp = G.maxHp;
  await loadStartX();
  await ensureSeed();
  genTreasures(G.seed);
  await loadAll();
  setupInput();
  setupRealtime();
  render();
  restoreCombatState();
  log('⛏️ ほりほりドリルへようこそ！');
  setInterval(periodicCleanup, 15000);
  setInterval(periodicStateSync, 10000);
}

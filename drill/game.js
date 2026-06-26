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

// 層ごとの素材重み [素材, 累積確率]
const LAYER_W = [
  // 第1層 0-99m
  [['dirt',0.65],['stone',0.93],['copper',1.00]],
  // 第2層 100-199m
  [['dirt',0.15],['stone',0.50],['copper',0.79],['iron',0.995],['silver',1.00]],
  // 第3層 200-299m
  [['dirt',0.05],['stone',0.25],['copper',0.40],['iron',0.75],['silver',0.95],['gold',1.00]],
];

// 宝箱生成設定
const TREASURE_CFG = [
  { yStart:0,   yEnd:99,  normal:10, rare:1 },
  { yStart:100, yEnd:199, normal:15, rare:1 },
  { yStart:200, yEnd:299, normal:20, rare:2 },
];

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
  { id:'apprentice', name:'見習いのドリル', cost:100,   type:'drill', drillId:'apprentice' },
  { id:'journeyman', name:'一人前のドリル', cost:2000,  type:'drill', drillId:'journeyman' },
  { id:'veteran',    name:'熟練のドリル',   cost:10000, type:'drill', drillId:'veteran' },
  { id:'return_stone', name:'帰還石',        cost:50,    type:'item',  itemId:'return_stone' },
];

const PERMITS = {
  permit_100: { name:'100m入坑許可証', yMin:100, recipe:{stone:1000,copper:300} },
  permit_200: { name:'200m入坑許可証', yMin:200, recipe:{iron:1000,silver:300} },
};

const SELL_PRICES = {
  dirt: 1, stone: 3, copper: 15, iron: 50, silver: 200, gold: 500,
};

// 体力
let BASE_HP = 1000;

// ブロック破壊イベント（各層の確率テーブル）
// type: nothing / gold / damage / pitfall / combat
let EVENTS = [
  // 第1層 0-99m
  [
    { type:'nothing', weight:80 },
    { type:'gold',    weight:10, min:5,   max:20  },
    { type:'damage',  weight:5,  min:10,  max:30  },
    { type:'pitfall', weight:3  },
    { type:'combat',  weight:2  },
  ],
  // 第2層 100-199m
  [
    { type:'nothing', weight:70 },
    { type:'gold',    weight:10, min:20,  max:80  },
    { type:'damage',  weight:8,  min:20,  max:60  },
    { type:'pitfall', weight:8  },
    { type:'combat',  weight:4  },
  ],
  // 第3層 200-299m
  [
    { type:'nothing', weight:60 },
    { type:'gold',    weight:10, min:50,  max:200 },
    { type:'damage',  weight:12, min:50,  max:100 },
    { type:'pitfall', weight:12 },
    { type:'combat',  weight:6  },
  ],
];

// 呪いダメージ（上移動1マスごと、各層）
let CURSE = [
  { min:1,  max:10 }, // 第1層
  { min:3,  max:20 }, // 第2層
  { min:8,  max:40 }, // 第3層
];

// ============================================================
// ゲーム状態
// ============================================================

const G = {
  userId: null,
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
  treasures: new Set(),  // 'x,y'
  treasureRare: new Set(),
  otherPlayers: new Map(), // userId -> {x,y}
  isAdmin: false,
  drills: [],            // 所持ドリル一覧
  mineTarget: null,      // {x,y}
  mineTimer: null,
  mineHP: {},            // 'x,y' -> remaining hp
  logs: [],
  hp: 1000,             // 現在HP
  maxHp: 1000,          // 最大HP
  droppedItems: new Map(), // 'x,y' -> [{id, items:[{item_id,quantity}]}]
};

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
  if (G.treasures.has(`${x},${y}`)) return 'treasure';
  if (y === 0) return null; // 地上行はマスなし
  const layer = Math.min(2, Math.floor(y / 100));
  return pickW(cellRng(G.seed, x, y), LAYER_W[layer]);
}

function genTreasures(seed) {
  const set = new Set();
  const rare = new Set();
  for (const cfg of TREASURE_CFG) {
    const rng = mkRng((seed ^ (cfg.yStart * 999983)) >>> 0);
    for (let i = 0; i < cfg.normal + cfg.rare; i++) {
      let att = 0;
      while (att++ < 5000) {
        const x = Math.floor(rng() * MAP_W);
        const y = cfg.yStart + 1 + Math.floor(rng() * (cfg.yEnd - cfg.yStart));
        const k = `${x},${y}`;
        if (!set.has(k)) {
          set.add(k);
          if (i >= cfg.normal) rare.add(k);
          break;
        }
      }
    }
  }
  G.treasures = set;
  G.treasureRare = rare;
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
    if (cfg.layerWeights) {
      cfg.layerWeights.forEach((layer, i) => {
        if (i >= LAYER_W.length) return;
        let cum = 0;
        LAYER_W[i] = layer.map(([mat, pct]) => {
          cum += (pct || 0) / 100;
          return [mat, Math.round(cum * 100000) / 100000];
        });
      });
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
    if (cfg.curse && Array.isArray(cfg.curse)) {
      cfg.curse.forEach((c, i) => { if (c) CURSE[i] = c; });
    }
    if (cfg.baseHp != null) BASE_HP = cfg.baseHp;
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

  const [dugRes, lockRes, posRes, bpRes, invRes, drillRes, permRes, profRes, othRes, dropRes] =
    await Promise.all([
      supabaseClient.from('drill_dug_cells').select('x,y').eq('map_date', date),
      supabaseClient.from('drill_dig_locks').select('x,y,locked_by,expires_at')
        .eq('map_date', date).gt('expires_at', new Date().toISOString()),
      supabaseClient.from('drill_player_positions').select('x,y,map_date').eq('user_id', uid).maybeSingle(),
      supabaseClient.from('drill_backpack').select('item_id,quantity').eq('user_id', uid),
      supabaseClient.from('drill_inventory').select('item_id,quantity').eq('user_id', uid),
      supabaseClient.from('drill_player_drills').select('*').eq('user_id', uid),
      supabaseClient.from('drill_player_permits').select('permit_id').eq('user_id', uid),
      supabaseClient.from('profiles').select('drill_gold,drill_hp').eq('id', uid).maybeSingle(),
      supabaseClient.from('drill_player_positions').select('user_id,x,y,avatar_url').eq('map_date', date).neq('user_id', uid),
      supabaseClient.from('drill_dropped_items').select('id,pos_x,pos_y,items').eq('map_date', date),
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
    G.droppedItems.get(key).push({ id: r.id, items: r.items || [] });
  });
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
}

async function saveHp() {
  await supabaseClient.from('profiles').update({ drill_hp: G.hp }).eq('id', G.userId);
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
  if (G.mineTarget) return;
  const nx = G.px + dx, ny = G.py + dy;
  if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) return;

  const key = `${nx},${ny}`;
  const isDug = G.dugCells.has(key) || ny === 0;

  if (!isDug) {
    // 隣接マス（上下左右すべて）採掘開始
    if (Math.abs(dx) + Math.abs(dy) === 1) startMine(nx, ny);
    return;
  }

  // 許可証チェック
  if (ny >= 100 && ny < 200 && !G.permits.has('permit_100')) {
    log('⚠️ 100m入坑許可証が必要です'); return;
  }
  if (ny >= 200 && !G.permits.has('permit_200')) {
    log('⚠️ 200m入坑許可証が必要です'); return;
  }

  G.px = nx; G.py = ny;
  if (ny === START_Y) G.surfaceMode = true;

  // 呪い：地下で上移動するたびにダメージ
  if (dy < 0 && ny > START_Y) {
    const li = Math.min(CURSE.length - 1, Math.floor(ny / 100));
    const c  = CURSE[li];
    const dmg = Math.floor(Math.random() * (c.max - c.min + 1)) + c.min;
    G.hp = Math.max(0, G.hp - dmg);
    await saveHp();
    log(`👻 呪い (第${li+1}層): -${dmg}HP（残り ${G.hp}）`);
    if (G.hp <= 0) { await handleDeath(); return; }
    renderSide();
  }

  // 落下アイテム回収
  if (!G.surfaceMode) await collectDroppedItems(nx, ny);

  await savePos();
  render();
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
  G.mineHP[key] = (G.mineHP[key] ?? MATS[mat].hp) - drill.power;

  // ロック延長
  acquireLock(x, y);

  // ドリル耐久消費（1ティックで power 分消費）
  if (G.drillDur !== null) {
    G.drillDur -= drill.power;
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
    await supabaseClient.from('profiles').update({ drill_gold: G.drillGold }).eq('id', G.userId);
    log(`✨ イベント: お金発見！ +${amount}G`);
    renderSide();
    renderMap();

  } else if (ev.type === 'damage') {
    const dmg = Math.floor(Math.random() * (ev.max - ev.min + 1)) + ev.min;
    G.hp = Math.max(0, G.hp - dmg);
    await saveHp();
    log(`💥 イベント: ダメージ！ -${dmg}HP（残り ${G.hp}）`);
    renderSide();
    if (G.hp <= 0) await handleDeath();

  } else if (ev.type === 'pitfall') {
    log('🕳️ イベント: 落とし穴！');
    await teleportPitfall();

  } else if (ev.type === 'combat') {
    log('⚔️ イベント: 敵と遭遇！（戦闘システムは近日実装予定）');
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

async function handleDeath() {
  stopMine();
  closeModal();
  G.hp = 0;
  renderSide();

  // リュックをその場に落とす
  const bpItems = Object.entries(G.backpack).filter(([, v]) => v > 0);
  if (bpItems.length > 0) {
    const items = bpItems.map(([item_id, quantity]) => ({ item_id, quantity }));
    const { data: drop } = await supabaseClient.from('drill_dropped_items').insert({
      map_date: G.mapDate, pos_x: G.px, pos_y: G.py,
      dropper_user_id: G.userId, items,
    }).select().single();
    if (drop) {
      const dkey = `${G.px},${G.py}`;
      if (!G.droppedItems.has(dkey)) G.droppedItems.set(dkey, []);
      G.droppedItems.get(dkey).push({ id: drop.id, items });
    }
    G.backpack = {};
    await supabaseClient.from('drill_backpack').delete().eq('user_id', G.userId);
  }

  const lostMsg = bpItems.length > 0
    ? `リュック内 ${bpItems.length}種のアイテムをその場に落とした！`
    : '手ぶらで地上へ戻った';
  log(`💀 HP が尽きた！${lostMsg}`);

  // HP全回復して地上へ
  G.hp = G.maxHp;
  await saveHp();
  G.px = START_X; G.py = START_Y;
  G.surfaceMode = true;
  await savePos();
  render();
}

async function collectDroppedItems(x, y) {
  const key  = `${x},${y}`;
  const drops = G.droppedItems.get(key);
  if (!drops || drops.length === 0) return;

  for (const drop of drops) {
    for (const { item_id, quantity } of drop.items) {
      G.backpack[item_id] = (G.backpack[item_id] || 0) + quantity;
      await saveBpItem(item_id, G.backpack[item_id]);
    }
    await supabaseClient.from('drill_dropped_items').delete().eq('id', drop.id);
    const names = drop.items.map(i => `${ITEM_NAMES[i.item_id]||i.item_id}×${i.quantity}`).join(', ');
    log(`📦 落とし物を回収！ ${names}`);
  }
  G.droppedItems.delete(key);
  renderSide();
}

// ============================================================
// 宝箱
// ============================================================

async function openTreasure(x, y) {
  const key = `${x},${y}`;
  const isRare = G.treasureRare.has(key);
  const layer = Math.min(2, Math.floor(y / 100));
  const rng = cellRng(G.seed + 99, x, y);
  const r = rng();

  const LOOT = [
    // layer 0
    [
      [[0.45,'stone',50],[0.73,'copper',20],[0.88,'return_stone',1],[0.95,'drill_apprentice',1],[1.00,'return_stone',3]],
      [[0.5,'drill_stone',1],[1.0,'return_stone',5]],
    ],
    // layer 1
    [
      [[0.32,'copper',50],[0.70,'iron',30],[0.85,'return_stone',1],[0.95,'drill_copper',1],[1.00,'return_stone',3]],
      [[0.5,'drill_iron',1],[1.0,'return_stone',5]],
    ],
    // layer 2
    [
      [[0.32,'iron',60],[0.57,'silver',40],[0.80,'gold',20],[0.92,'drill_silver',1],[1.00,'return_stone',5]],
      [[0.5,'drill_silver',1],[1.0,'return_stone',10]],
    ],
  ];

  const table = LOOT[layer][isRare ? 1 : 0];
  let loot = table[table.length - 1];
  for (const [cum, item, qty] of table) { if (r < cum) { loot = [cum, item, qty]; break; } }
  const [, item, qty] = loot;

  G.backpack[item] = (G.backpack[item] || 0) + qty;
  await saveBpItem(item, G.backpack[item]);
  log(`🎁 ${isRare ? 'レア' : ''}宝箱 → ${ITEM_NAMES[item] || item} ×${qty}`);
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

  // リュックを倉庫へ転送
  const items = Object.entries(G.backpack).filter(([, v]) => v > 0);
  for (const [item, qty] of items) {
    await upsertInv(item, qty);
  }
  G.backpack = {};
  await supabaseClient.from('drill_backpack').delete().eq('user_id', G.userId);

  G.px = START_X; G.py = START_Y;
  G.surfaceMode = true;
  await savePos();
  log(`↩️ 帰還完了！${items.length > 0 ? `${items.length}種類の素材を確定` : '手ぶら'}`);
  render();
}

// ============================================================
// ショップ
// ============================================================

function showShop() {
  if (G.py !== 0) { log('⚠️ ショップは地上のみ'); return; }

  let html = `<div class="modal-title">🛒 ショップ</div>
    <div style="font-size:.82rem;margin-bottom:10px;">所持金: 💰 ${G.drillGold}G</div>`;

  for (const item of SHOP_ITEMS) {
    const canBuy = G.drillGold >= item.cost;
    html += `<div class="modal-row">
      <div><div class="modal-row-label">${item.name}</div>
      <div class="modal-row-sub">${item.cost}G</div></div>
      <button class="btn-modal-action" onclick="buyItem('${item.id}')" ${canBuy?'':'disabled'}>購入</button>
    </div>`;
  }
  html += `<button class="btn-modal-close" onclick="closeModal()">閉じる</button>`;
  openModal(html);
}

async function buyItem(shopId) {
  const item = SHOP_ITEMS.find(i => i.id === shopId);
  if (!item || G.drillGold < item.cost) { log('⚠️ 所持金不足'); return; }

  G.drillGold -= item.cost;
  await supabaseClient.from('profiles').update({ drill_gold: G.drillGold }).eq('id', G.userId);

  if (item.type === 'drill') {
    const { data: nd } = await supabaseClient.from('drill_player_drills').insert({
      user_id: G.userId, drill_id: item.drillId,
      durability: DRILLS[item.drillId].dur, equipped: false,
    }).select().single();
    if (nd) G.drills.push(nd);
    log(`✅ ${item.name}を購入`);
  } else {
    await upsertInv(item.itemId, 1);
    log(`✅ ${item.name}を購入`);
  }
  showShop();
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
      <button class="btn-modal-action" onclick="doCraft('permit','${pid}')" ${can?'':'disabled'}>作成</button>
    </div>`;
  }

  // ドリル
  for (const [did, d] of Object.entries(DRILLS)) {
    if (!d.recipe) continue;
    const can = Object.entries(d.recipe).every(([m, q]) => (G.inventory[m] || 0) >= q);
    const recipe = Object.entries(d.recipe).map(([m, q]) => `${MATS[m]?.name||m}×${q}`).join(', ');
    html += `<div class="modal-row">
      <div><div class="modal-row-label">${d.name}</div>
      <div class="modal-row-sub">${recipe}</div></div>
      <button class="btn-modal-action" onclick="doCraft('drill','${did}')" ${can?'':'disabled'}>作成</button>
    </div>`;
  }

  // 帰還石（帰還石をクラフトしたい場合は後追加）
  html += `<button class="btn-modal-close" onclick="closeModal()">閉じる</button>`;
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
// リュックモーダル
// ============================================================

function showBag() {
  const items = Object.entries(G.backpack).filter(([, v]) => v > 0);
  let html = `<div class="modal-title">🎒 リュック</div>`;

  if (items.length === 0) {
    html += `<div style="font-size:.85rem;color:rgba(255,255,255,.5);">空です</div>`;
  } else {
    for (const [item, qty] of items) {
      html += `<div class="modal-row">
        <span class="modal-row-label">${ITEM_NAMES[item]||item}</span>
        <span>×${qty}</span>
      </div>`;
    }
  }

  if (G.py === 0) {
    html += `<button class="btn-modal-action" style="width:100%;margin-top:10px;" onclick="returnSurface(false)">📦 倉庫に確定</button>`;
  } else {
    html += `<button class="btn-modal-action" style="width:100%;margin-top:10px;" onclick="returnSurface(true)">🪨 帰還石で即帰還</button>`;
  }
  html += `<button class="btn-modal-close" onclick="closeModal()">閉じる</button>`;
  openModal(html);
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
          : `<button class="btn-modal-action" onclick="equipDrill('${d.id}')">装備</button>`}
      </div>`;
    }
  }
  html += `<button class="btn-modal-close" onclick="closeModal()">閉じる</button>`;
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
  showDrills();
}

// ============================================================
// 素材売却
// ============================================================

function showSell() {
  if (G.py !== 0) { log('⚠️ 売却は地上のみ'); return; }

  const sellable = Object.entries(G.inventory)
    .filter(([k, v]) => v > 0 && SELL_PRICES[k])
    .sort((a, b) => (SELL_PRICES[b[0]] || 0) - (SELL_PRICES[a[0]] || 0));

  let html = `<div class="modal-title">💰 素材売却</div>
    <div style="font-size:.82rem;margin-bottom:10px;">所持金: 💰 ${G.drillGold}G</div>`;

  if (sellable.length === 0) {
    html += `<div style="font-size:.85rem;opacity:.5;padding:10px 0;">売却できる素材がありません<br><span style="font-size:.75rem;">（帰還して素材を確定してください）</span></div>`;
  } else {
    for (const [item, qty] of sellable) {
      const price = SELL_PRICES[item];
      html += `<div class="modal-row">
        <div>
          <div class="modal-row-label">${MATS[item]?.name || item} ×${qty}</div>
          <div class="modal-row-sub">1個 ${price}G → 合計 ${price * qty}G</div>
        </div>
        <button class="btn-modal-action" onclick="doSell('${item}',${qty})">全売却</button>
      </div>`;
    }
  }
  html += `<button class="btn-modal-close" onclick="closeModal()">閉じる</button>`;
  openModal(html);
}

async function doSell(itemId, qty) {
  const price = SELL_PRICES[itemId];
  if (!price) return;
  const actual = Math.min(qty, G.inventory[itemId] || 0);
  if (actual <= 0) return;

  const earned = price * actual;
  await upsertInv(itemId, -actual);
  G.drillGold += earned;
  await supabaseClient.from('profiles').update({ drill_gold: G.drillGold }).eq('id', G.userId);

  log(`💰 ${MATS[itemId]?.name || itemId} ×${actual} → ${earned}G`);
  renderSide();
  showSell();
}

// ============================================================
// モーダルユーティリティ
// ============================================================

function openModal(html) {
  document.getElementById('modal-inner').innerHTML = html;
  document.getElementById('modal-overlay').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modal-overlay').style.display = 'none';
}

// ============================================================
// Realtime
// ============================================================

function setupRealtime() {
  supabaseClient.channel('drill_rt')
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'drill_dug_cells',
      filter: `map_date=eq.${G.mapDate}`,
    }, ({ new: r }) => {
      G.dugCells.add(`${r.x},${r.y}`);
      G.digLocks.delete(`${r.x},${r.y}`);
      renderMap();
    })
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'drill_dig_locks',
      filter: `map_date=eq.${G.mapDate}`,
    }, ({ new: r }) => {
      if (r.locked_by !== G.userId)
        G.digLocks.set(`${r.x},${r.y}`, { by: r.locked_by, exp: r.expires_at });
      renderMap();
    })
    .on('postgres_changes', {
      event: 'DELETE', schema: 'public', table: 'drill_dig_locks',
    }, ({ old: r }) => {
      if (G.digLocks.get(`${r.x},${r.y}`)?.by !== G.userId)
        G.digLocks.delete(`${r.x},${r.y}`);
      renderMap();
    })
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'drill_dropped_items',
      filter: `map_date=eq.${G.mapDate}`,
    }, ({ new: r }) => {
      if (!r || r.dropper_user_id === G.userId) return;
      const key = `${r.pos_x},${r.pos_y}`;
      if (!G.droppedItems.has(key)) G.droppedItems.set(key, []);
      G.droppedItems.get(key).push({ id: r.id, items: r.items || [] });
      renderMap();
    })
    .on('postgres_changes', {
      event: 'DELETE', schema: 'public', table: 'drill_dropped_items',
    }, ({ old: r }) => {
      if (!r) return;
      const key = `${r.pos_x},${r.pos_y}`;
      const list = G.droppedItems.get(key);
      if (list) {
        const idx = list.findIndex(d => d.id === r.id);
        if (idx >= 0) list.splice(idx, 1);
        if (list.length === 0) G.droppedItems.delete(key);
      }
      renderMap();
    })
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'drill_player_positions',
    }, ({ new: r }) => {
      if (!r) return;
      if (r.user_id !== G.userId) {
        if (r.map_date === G.mapDate)
          G.otherPlayers.set(r.user_id, { x: r.x, y: r.y, avatarUrl: r.avatar_url || null });
      } else if (r.map_date === G.mapDate && (r.x !== G.px || r.y !== G.py)) {
        // 別端末が同アカウントで操作 → 強制同期
        stopMine();
        G.px = r.x; G.py = r.y;
        G.surfaceMode = (r.y === START_Y);
        render();
        return;
      }
      renderMap();
    })
    .subscribe();
}

// ============================================================
// 描画
// ============================================================

function render() {
  renderView();
  renderSurfaceHome();
  renderMap();
  renderSide();
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
  const bpAlert = bpKeys.length > 0
    ? `<div class="sh-bp-alert">⚠️ リュックに未確定アイテムあり（${bpKeys.length}種）— リュックから倉庫に確定できます</div>`
    : '';

  el.innerHTML = `
    <div class="sh-card">
      <div class="sh-title">⛏️ ほりほりドリル</div>
      <div class="sh-stats">
        <span>💰 ${G.drillGold}G</span>
        <span>📍 地上 (0m)</span>
      </div>
      <div class="sh-drill-info">装備: ${drill.name} ／ 耐久: ${durStr}</div>
      ${bpAlert}
    </div>
    <div class="sh-menu">
      <button class="sh-btn" onclick="showShop()">🛒&ensp;ショップ</button>
      <button class="sh-btn" onclick="showSell()">💰&ensp;素材売却</button>
      <button class="sh-btn" onclick="showCraft()">🔨&ensp;クラフト</button>
      <button class="sh-btn" onclick="showDrills()">⛏️&ensp;ドリル管理</button>
      <button class="sh-btn" onclick="showBag()">🎒&ensp;リュック${bpKeys.length > 0 ? `<span class="sh-badge">${bpKeys.length}</span>` : ''}</button>
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
  const cells = [];

  for (let vy = 0; vy < VP_H; vy++) {
    for (let vx = 0; vx < VP_W; vx++) {
      const wx = G.px - halfW + vx;
      const wy = G.py - halfH + vy;
      cells.push(buildCell(wx, wy));
    }
  }

  grid.innerHTML = cells.join('');

  document.getElementById('coord-disp').textContent = `📍 ${G.px}, ${G.py}`;
  const lyr = Math.floor(G.py / 100) + 1;
  document.getElementById('layer-disp').textContent = `第${lyr}層 (${G.py}m)`;
  document.getElementById('gold-disp').textContent = `💰 ${G.drillGold}G`;
}

function buildCell(wx, wy) {
  if (wx < 0 || wx >= MAP_W || wy < 0 || wy >= MAP_H) {
    return `<div class="mc mc-void"></div>`;
  }

  // 霧：視界外は暗闇
  if (!isVisible(wx, wy)) {
    return `<div class="mc mc-fog"></div>`;
  }

  const isPlayer = wx === G.px && wy === G.py;
  if (isPlayer) {
    const icon = G.avatarUrl
      ? `<img class="player-icon" src="${G.avatarUrl}" alt="" />`
      : `<div class="player-icon">⛏️</div>`;
    return `<div class="mc mc-player">${icon}</div>`;
  }

  const otherAt = [...G.otherPlayers.values()].find(p => p.x === wx && p.y === wy);
  const isOther = !!otherAt;
  const key = `${wx},${wy}`;
  const isDug = G.dugCells.has(key) || wy === 0;
  const isLocked = G.digLocks.has(key) && G.digLocks.get(key).by !== G.userId;
  const isMining = G.mineTarget?.x === wx && G.mineTarget?.y === wy;

  if (isDug) {
    const base = wy === 0 ? 'mc-surf' : 'mc-dug';
    let inner = '';
    if (isOther) {
      inner += otherAt.avatarUrl
        ? `<img class="player-icon other-icon" src="${otherAt.avatarUrl}" alt="" />`
        : `<div class="player-icon other-icon">🧑</div>`;
    }
    if (G.droppedItems?.has(`${wx},${wy}`)) {
      inner += `<div class="player-icon other-icon" style="font-size:.85rem;" title="落とし物あり">📦</div>`;
    }
    return `<div class="mc ${base}">${inner}</div>`;
  }

  // 許可証バリア（境界行を強調表示）
  if (wy === 100 && !G.permits.has('permit_100')) {
    return `<div class="mc mc-barrier" title="100m立入禁止 — 許可証が必要">🚧</div>`;
  }
  if (wy === 200 && !G.permits.has('permit_200')) {
    return `<div class="mc mc-barrier" title="200m立入禁止 — 許可証が必要">🚧</div>`;
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
  setHTML('mob-drill-bar', `
    <span>⛏️ ${drill.name}</span>
    <span style="opacity:.7;">威力 ${drill.power}</span>
    <div class="mob-dur-wrap">${durHtml}</div>
    ${hpBar}
    <span style="color:#ffcc44;visibility:${G.mineTarget ? 'visible' : 'hidden'};">⛏️掘削中</span>
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
  setHTML('backpack-disp', bpItems.length === 0
    ? '<div style="opacity:.5;">空</div>'
    : bpItems.map(([k, v]) => `<div>${ITEM_NAMES[k]||k}: ${v}</div>`).join(''));
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
  // モバイルアクションボタン（地下専用: ドリル・リュック・帰還）
  document.getElementById('btn-drills')?.addEventListener('click', showDrills);
  document.getElementById('btn-bag')?.addEventListener('click', showBag);
  document.getElementById('btn-return')?.addEventListener('click', showBag);

  // PC 左パネルボタン
  document.getElementById('btn-drills-pc')?.addEventListener('click', showDrills);
  document.getElementById('btn-bag-pc')?.addEventListener('click', showBag);
  document.getElementById('btn-return-pc')?.addEventListener('click', showBag);

  // キーボード（リピートは無視して1押し1歩）
  document.addEventListener('keydown', e => {
    if (e.repeat) return;
    if (document.getElementById('modal-overlay').style.display !== 'none') {
      if (e.key === 'Escape') closeModal();
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
    const rect = vp.getBoundingClientRect();
    const vx = Math.floor((e.clientX - rect.left) / (rect.width  / VP_W));
    const vy = Math.floor((e.clientY - rect.top)  / (rect.height / VP_H));
    handleClick(G.px - ((VP_W - 1) >> 1) + vx, G.py - ((VP_H - 1) >> 1) + vy);
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

  // オーバーレイ外クリックで閉じる
  document.getElementById('modal-overlay')?.addEventListener('click', e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
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

// ============================================================
// 初期化
// ============================================================

async function initDrillGame() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) { window.location.href = '../login/index.html'; return; }
  G.userId = user.id;
  G.avatarUrl = user.user_metadata?.avatar_url || null;

  const discordId = user.user_metadata?.provider_id;
  if (typeof ADMIN_DISCORD_IDS !== 'undefined' && ADMIN_DISCORD_IDS.includes(discordId)) {
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
  log('⛏️ ほりほりドリルへようこそ！');
  setInterval(periodicCleanup, 15000);
}

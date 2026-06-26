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
  // 各層の出現率（%）。合計100になるように設定
  layerWeights: [
    [['dirt', 65],  ['stone', 28],  ['copper', 7]],
    [['dirt', 15],  ['stone', 35],  ['copper', 29], ['iron', 20.5], ['silver', 0.5]],
    [['dirt', 5],   ['stone', 20],  ['copper', 15], ['iron', 35],   ['silver', 20], ['gold', 5]],
  ],
  shop: [
    { id: 'apprentice',   name: '見習いのドリル', cost: 100   },
    { id: 'journeyman',   name: '一人前のドリル', cost: 2000  },
    { id: 'veteran',      name: '熟練のドリル',   cost: 10000 },
    { id: 'return_stone', name: '帰還石',          cost: 50    },
  ],
  sellPrices: { dirt: 1, stone: 3, copper: 15, iron: 50, silver: 200, gold: 500 },
  permits: {
    permit_100: { name: '100m入坑許可証', recipe: { stone: 1000, copper: 300 } },
    permit_200: { name: '200m入坑許可証', recipe: { iron: 1000,  silver: 300 } },
  },
};

let gameConfig = null;

const MAT_IDS   = ['dirt','stone','copper','iron','silver','gold','treasure'];
const MAT_NAMES = { dirt:'土', stone:'石', copper:'銅', iron:'鉄', silver:'銀', gold:'金', treasure:'宝箱' };
const DRILL_IDS = ['beginner','apprentice','stone_drill','copper_drill','journeyman',
                   'iron_drill','mass_drill','veteran','silver_drill','allpurpose'];

function cfgNum(id, val, opts = '') {
  return `<input class="cfg-input" type="number" id="${id}" value="${escDrill(String(val ?? ''))}" ${opts}>`;
}
function cfgTxt(id, val, opts = '') {
  return `<input class="cfg-input" type="text" id="${id}" value="${escDrill(String(val ?? ''))}" ${opts}>`;
}
function recipeToStr(r) {
  return r ? Object.entries(r).map(([k, v]) => `${k}:${v}`).join(',') : '';
}
function parseRecipe(str) {
  if (!str?.trim()) return null;
  const obj = {};
  str.split(',').forEach(part => {
    const [mat, qty] = part.trim().split(':');
    if (mat && qty) obj[mat.trim()] = parseInt(qty) || 0;
  });
  return Object.keys(obj).length ? obj : null;
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
  renderConfigEditor();
}

function renderConfigEditor() {
  renderMatsTab();
  renderDrillsTab();
  renderLayersTab();
  renderShopTab();
  renderSellTab();
  renderPermitsTab();
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
  const rows = DRILL_IDS.map(id => {
    const def = DEFAULT_GAME_CONFIG.drills[id];
    const d   = { ...def, ...(cfg[id] ?? {}) };
    return `<tr>
      <td style="white-space:nowrap;">${escDrill(def.name)}</td>
      <td>${cfgNum('cfg-drill-power-'  + id, d.power,        'min="1" style="width:64px;"')}</td>
      <td>${cfgNum('cfg-drill-dur-'    + id, d.dur   ?? '',   'min="0" placeholder="∞" style="width:80px;"')}</td>
      <td>${cfgNum('cfg-drill-cost-'   + id, d.cost  ?? '',   'min="0" placeholder="—" style="width:80px;"')}</td>
      <td>${cfgTxt('cfg-drill-recipe-' + id, recipeToStr(d.recipe), 'placeholder="stone:50" style="width:180px;"')}</td>
    </tr>`;
  }).join('');
  document.getElementById('cfg-tab-drills').innerHTML = `
    <div class="info-box" style="margin-bottom:10px;">
      レシピ形式: <code>素材:数量,素材:数量</code> 例: <code>stone:50</code> / <code>stone:20,copper:20,iron:20</code><br>
      耐久・購入Gは空欄=なし（∞ / ショップ非売品）
    </div>
    <div style="overflow-x:auto;">
    <table class="drill-table">
      <tr><th>ドリル</th><th>威力</th><th>最大耐久</th><th>購入G</th><th>クラフトレシピ</th></tr>
      ${rows}
    </table></div>`;
}

function renderLayersTab() {
  const cfg = gameConfig.layerWeights ?? DEFAULT_GAME_CONFIG.layerWeights;
  const layerLabel = ['第1層 (0〜99m)', '第2層 (100〜199m)', '第3層 (200〜299m)'];
  let html = `<div class="info-box" style="margin-bottom:14px;">
    各層での素材出現率（%）。合計が <strong>100</strong> になるように設定してください。
  </div>`;
  cfg.forEach((layer, li) => {
    const total = layer.reduce((s, [, p]) => s + parseFloat(p || 0), 0);
    const col   = Math.abs(total - 100) < 0.05 ? '#6bde9b' : '#ff6b6b';
    html += `<div style="margin-bottom:20px;">
      <div style="font-size:.85rem;font-weight:700;margin-bottom:8px;">
        ${layerLabel[li] ?? ('第' + (li+1) + '層')}
        <span id="lt-${li}" style="color:${col};font-size:.78rem;margin-left:10px;">合計 ${total.toFixed(1)}%</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;">`;
    layer.forEach(([mat, pct], mi) => {
      html += `<label style="display:flex;align-items:center;gap:4px;font-size:.83rem;">
        ${MAT_NAMES[mat] || mat}
        <input class="cfg-input lyr-pct" type="number" id="cfg-lyr-${li}-${mi}"
          data-li="${li}" value="${pct}" min="0" max="100" step="0.1" style="width:68px;"
          oninput="updateLayerTotal(${li})">%
      </label>`;
    });
    html += `</div></div>`;
  });
  document.getElementById('cfg-tab-layers').innerHTML = html;
}

function updateLayerTotal(li) {
  const inputs = document.querySelectorAll(`.lyr-pct[data-li="${li}"]`);
  let total = 0;
  inputs.forEach(el => total += parseFloat(el.value || 0));
  const el = document.getElementById('lt-' + li);
  if (el) {
    el.textContent = `合計 ${total.toFixed(1)}%`;
    el.style.color = Math.abs(total - 100) < 0.05 ? '#6bde9b' : '#ff6b6b';
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
  const cfg  = gameConfig.permits ?? {};
  const rows = Object.entries(DEFAULT_GAME_CONFIG.permits).map(([id, def]) => {
    const p = { ...def, ...(cfg[id] ?? {}) };
    return `<tr>
      <td style="white-space:nowrap;">${escDrill(def.name)}</td>
      <td>${cfgTxt('cfg-permit-' + id, recipeToStr(p.recipe), 'placeholder="stone:1000,copper:300" style="width:220px;"')}</td>
    </tr>`;
  }).join('');
  document.getElementById('cfg-tab-permits').innerHTML = `
    <div class="info-box" style="margin-bottom:10px;">レシピ形式: <code>素材:数量,素材:数量</code></div>
    <table class="drill-table" style="max-width:600px;">
      <tr><th>許可証</th><th>クラフトレシピ</th></tr>
      ${rows}
    </table>`;
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
    const pw  = document.getElementById('cfg-drill-power-'  + id);
    const dur = document.getElementById('cfg-drill-dur-'    + id);
    const cst = document.getElementById('cfg-drill-cost-'   + id);
    const rec = document.getElementById('cfg-drill-recipe-' + id);
    if (!gc.drills) gc.drills = {};
    if (!gc.drills[id]) gc.drills[id] = { ...DEFAULT_GAME_CONFIG.drills[id] };
    if (pw)  gc.drills[id].power  = parseInt(pw.value) || 1;
    if (dur) gc.drills[id].dur    = dur.value.trim() === '' ? null : (parseInt(dur.value) || null);
    if (cst) gc.drills[id].cost   = cst.value.trim() === '' ? null : (parseInt(cst.value) || null);
    if (rec) gc.drills[id].recipe = parseRecipe(rec.value);
  });

  // LAYER WEIGHTS (percentage format)
  if (!gc.layerWeights) gc.layerWeights = JSON.parse(JSON.stringify(DEFAULT_GAME_CONFIG.layerWeights));
  gc.layerWeights.forEach((layer, li) => {
    layer.forEach(([mat], mi) => {
      const el = document.getElementById(`cfg-lyr-${li}-${mi}`);
      if (el) layer[mi] = [mat, parseFloat(el.value) || 0];
    });
  });

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
    const el = document.getElementById('cfg-permit-' + id);
    if (el) {
      if (!gc.permits) gc.permits = {};
      if (!gc.permits[id]) gc.permits[id] = { ...DEFAULT_GAME_CONFIG.permits[id] };
      gc.permits[id].recipe = parseRecipe(el.value);
    }
  });
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

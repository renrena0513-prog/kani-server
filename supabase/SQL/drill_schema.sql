-- ほりほりドリル DB スキーマ
-- Supabase SQL Editor で実行してください

-- 日ごとのマップシード
CREATE TABLE IF NOT EXISTS drill_maps (
  map_date DATE PRIMARY KEY,
  seed BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 掘られたマス（掘削完了済み）
CREATE TABLE IF NOT EXISTS drill_dug_cells (
  map_date DATE NOT NULL,
  x SMALLINT NOT NULL,
  y SMALLINT NOT NULL,
  dug_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  dug_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (map_date, x, y)
);

-- 掘削中ロック（他プレイヤーが掘っているマス）
CREATE TABLE IF NOT EXISTS drill_dig_locks (
  map_date DATE NOT NULL,
  x SMALLINT NOT NULL,
  y SMALLINT NOT NULL,
  locked_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (map_date, x, y)
);

-- プレイヤー位置
CREATE TABLE IF NOT EXISTS drill_player_positions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  map_date DATE NOT NULL,
  x SMALLINT DEFAULT 128,
  y SMALLINT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- リュック（地下にいる間の一時保管）
CREATE TABLE IF NOT EXISTS drill_backpack (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, item_id)
);

-- 倉庫インベントリ（帰還後に確定した素材）
CREATE TABLE IF NOT EXISTS drill_inventory (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, item_id)
);

-- 所持ドリル
CREATE TABLE IF NOT EXISTS drill_player_drills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  drill_id TEXT NOT NULL,
  durability INTEGER,  -- NULL = 耐久無限（初心者ドリル）
  equipped BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 入坑許可証
CREATE TABLE IF NOT EXISTS drill_player_permits (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  permit_id TEXT NOT NULL,
  obtained_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, permit_id)
);

-- プロフィールにゲーム内ゴールドを追加
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS drill_gold INTEGER NOT NULL DEFAULT 0;

-- RLS 有効化
ALTER TABLE drill_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE drill_dug_cells ENABLE ROW LEVEL SECURITY;
ALTER TABLE drill_dig_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE drill_player_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE drill_backpack ENABLE ROW LEVEL SECURITY;
ALTER TABLE drill_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE drill_player_drills ENABLE ROW LEVEL SECURITY;
ALTER TABLE drill_player_permits ENABLE ROW LEVEL SECURITY;

-- drill_maps: 全員読み取り可、認証済みユーザーが挿入可
CREATE POLICY "drill_maps_select" ON drill_maps FOR SELECT TO authenticated USING (true);
CREATE POLICY "drill_maps_insert" ON drill_maps FOR INSERT TO authenticated WITH CHECK (true);

-- drill_dug_cells: 全員読み取り可、自分が掘ったマスを挿入可
CREATE POLICY "dug_cells_select" ON drill_dug_cells FOR SELECT TO authenticated USING (true);
CREATE POLICY "dug_cells_insert" ON drill_dug_cells FOR INSERT TO authenticated WITH CHECK (auth.uid() = dug_by);

-- drill_dig_locks: 全員読み取り可、自分のロックを管理
CREATE POLICY "dig_locks_select" ON drill_dig_locks FOR SELECT TO authenticated USING (true);
CREATE POLICY "dig_locks_insert" ON drill_dig_locks FOR INSERT TO authenticated WITH CHECK (auth.uid() = locked_by);
CREATE POLICY "dig_locks_update" ON drill_dig_locks FOR UPDATE TO authenticated USING (auth.uid() = locked_by);
CREATE POLICY "dig_locks_delete" ON drill_dig_locks FOR DELETE TO authenticated USING (auth.uid() = locked_by);

-- drill_player_positions: 全員読み取り可、自分の位置を管理
CREATE POLICY "positions_select" ON drill_player_positions FOR SELECT TO authenticated USING (true);
CREATE POLICY "positions_insert" ON drill_player_positions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "positions_update" ON drill_player_positions FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- drill_backpack: 自分のリュックのみ
CREATE POLICY "backpack_all" ON drill_backpack FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- drill_inventory: 自分の倉庫のみ
CREATE POLICY "inventory_all" ON drill_inventory FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- drill_player_drills: 自分のドリルのみ
CREATE POLICY "drills_all" ON drill_player_drills FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- drill_player_permits: 自分の許可証のみ
CREATE POLICY "permits_all" ON drill_player_permits FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Realtime 有効化
ALTER PUBLICATION supabase_realtime ADD TABLE drill_dug_cells;
ALTER PUBLICATION supabase_realtime ADD TABLE drill_dig_locks;
ALTER PUBLICATION supabase_realtime ADD TABLE drill_player_positions;

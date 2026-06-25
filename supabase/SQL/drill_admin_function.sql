-- ほりほりドリル 管理者用統計関数
-- SECURITY DEFINER で RLS をバイパス（管理者のみ呼び出し）
-- Supabase SQL Editor で実行してください

CREATE OR REPLACE FUNCTION get_drill_user_stats()
RETURNS TABLE (
  user_id       UUID,
  account_name  TEXT,
  drill_gold    INTEGER,
  pos_x         SMALLINT,
  pos_y         SMALLINT,
  map_date      DATE,
  equipped_drill TEXT,
  drill_durability INTEGER,
  backpack_count BIGINT,
  inventory_value BIGINT,
  permits       TEXT[]
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT
    p.id,
    p.account_name,
    p.drill_gold,
    pos.x,
    pos.y,
    pos.map_date,
    dd.drill_id,
    dd.durability,
    COALESCE((
      SELECT SUM(quantity)
      FROM drill_backpack bp
      WHERE bp.user_id = p.id
    ), 0),
    COALESCE((
      SELECT SUM(
        quantity * CASE item_id
          WHEN 'dirt'    THEN 1
          WHEN 'stone'   THEN 3
          WHEN 'copper'  THEN 15
          WHEN 'iron'    THEN 50
          WHEN 'silver'  THEN 200
          WHEN 'gold'    THEN 500
          ELSE 0
        END
      )
      FROM drill_inventory di
      WHERE di.user_id = p.id
    ), 0),
    (
      SELECT ARRAY_AGG(permit_id)
      FROM drill_player_permits pp
      WHERE pp.user_id = p.id
    )
  FROM profiles p
  LEFT JOIN drill_player_positions pos ON pos.user_id = p.id
  LEFT JOIN drill_player_drills    dd  ON dd.user_id  = p.id AND dd.equipped = TRUE
  WHERE p.drill_gold > 0
     OR pos.user_id IS NOT NULL
  ORDER BY p.drill_gold DESC NULLS LAST;
$$;

-- 認証済みユーザーに実行権を付与（管理者かどうかはアプリ側で確認）
GRANT EXECUTE ON FUNCTION get_drill_user_stats() TO authenticated;

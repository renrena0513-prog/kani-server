-- 落とし物の原子的回収RPC
-- 二重取得バグ対策：行ロック(FOR UPDATE)を取り、DB上の現在数量から
-- 実際に取れた分だけを差し引いて更新・削除し、取れた分を返す。
-- クライアントは戻り値の taken だけをリュックに加算すること。
--
-- 戻り値: { "taken": [...], "remaining": [...], "deleted": bool }
--   taken     … 実際に回収できたアイテム（durability等の追加フィールドは維持）
--   remaining … 回収後にその場に残ったアイテム
--   deleted   … 行が削除された（全回収された）かどうか

CREATE OR REPLACE FUNCTION public.collect_drop_items(p_drop_id uuid, p_user_id uuid, p_items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_row       drill_dropped_items%ROWTYPE;
  v_item      jsonb;
  v_cur       jsonb;
  v_taken     jsonb := '[]'::jsonb;
  v_remaining jsonb := '[]'::jsonb;
  v_req_map   jsonb := '{}'::jsonb;
  v_id        text;
  v_have      int;
  v_req       int;
  v_take      int;
BEGIN
  SELECT * INTO v_row FROM drill_dropped_items WHERE id = p_drop_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('taken', '[]'::jsonb, 'remaining', '[]'::jsonb, 'deleted', true);
  END IF;

  -- 他プレイヤーが有効なロックを保持している場合は回収不可
  IF v_row.locked_by IS NOT NULL
     AND v_row.locked_by <> p_user_id
     AND v_row.locked_until IS NOT NULL
     AND v_row.locked_until > NOW() THEN
    RETURN jsonb_build_object('taken', '[]'::jsonb, 'remaining', v_row.items, 'deleted', false);
  END IF;

  -- リクエスト数量を item_id ごとに集計
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) LOOP
    v_id := v_item->>'item_id';
    IF v_id IS NULL THEN CONTINUE; END IF;
    v_req_map := jsonb_set(v_req_map, ARRAY[v_id],
      to_jsonb(COALESCE((v_req_map->>v_id)::int, 0) + GREATEST(COALESCE((v_item->>'quantity')::int, 0), 0)));
  END LOOP;

  -- DB上の現在値から実際に取れる分だけを差し引く
  -- （同一item_idが複数エントリある場合（耐久値違いのドリル等）は先頭から順に消費）
  FOR v_cur IN SELECT * FROM jsonb_array_elements(COALESCE(v_row.items, '[]'::jsonb)) LOOP
    v_id   := v_cur->>'item_id';
    v_have := COALESCE((v_cur->>'quantity')::int, 0);
    v_req  := COALESCE((v_req_map->>v_id)::int, 0);
    v_take := LEAST(v_have, v_req);
    IF v_take > 0 THEN
      v_taken   := v_taken || jsonb_build_array(v_cur || jsonb_build_object('quantity', v_take));
      v_req_map := jsonb_set(v_req_map, ARRAY[v_id], to_jsonb(v_req - v_take));
    END IF;
    IF v_have - v_take > 0 THEN
      v_remaining := v_remaining || jsonb_build_array(v_cur || jsonb_build_object('quantity', v_have - v_take));
    END IF;
  END LOOP;

  IF jsonb_array_length(v_remaining) = 0 THEN
    DELETE FROM drill_dropped_items WHERE id = p_drop_id;
    RETURN jsonb_build_object('taken', v_taken, 'remaining', v_remaining, 'deleted', true);
  ELSE
    UPDATE drill_dropped_items
    SET items = v_remaining, locked_by = NULL, locked_until = NULL
    WHERE id = p_drop_id;
    RETURN jsonb_build_object('taken', v_taken, 'remaining', v_remaining, 'deleted', false);
  END IF;
END;
$function$;

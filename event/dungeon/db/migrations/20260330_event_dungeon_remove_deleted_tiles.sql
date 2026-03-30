-- Remove deleted event dungeon specifications and obsolete thief-only item remnants.

DELETE
  FROM public.evd_floor_tile_weight_profiles
 WHERE tile_type IN ('盗賊', '落とし穴', '転送罠');

UPDATE public.evd_game_runs
   SET inventory_state = jsonb_set(
        jsonb_set(
            coalesce(inventory_state, '{}'::jsonb) - 'pending_thief',
            array['items'],
            coalesce(inventory_state -> 'items', '{}'::jsonb) - 'thief_ward_charm' - 'escape_talisman' - 'merchant_whistle' - 'special_merchant_whistle' - 'golden_bag',
            true
        ),
        array['carried_items'],
        coalesce(inventory_state -> 'carried_items', '{}'::jsonb) - 'thief_ward_charm' - 'escape_talisman' - 'merchant_whistle' - 'special_merchant_whistle' - 'golden_bag',
        true
   )
 WHERE inventory_state ? 'pending_thief'
    OR coalesce(inventory_state -> 'items', '{}'::jsonb) ? 'thief_ward_charm'
    OR coalesce(inventory_state -> 'items', '{}'::jsonb) ? 'escape_talisman'
    OR coalesce(inventory_state -> 'items', '{}'::jsonb) ? 'merchant_whistle'
    OR coalesce(inventory_state -> 'items', '{}'::jsonb) ? 'special_merchant_whistle'
    OR coalesce(inventory_state -> 'items', '{}'::jsonb) ? 'golden_bag'
    OR coalesce(inventory_state -> 'carried_items', '{}'::jsonb) ? 'thief_ward_charm'
    OR coalesce(inventory_state -> 'carried_items', '{}'::jsonb) ? 'escape_talisman'
    OR coalesce(inventory_state -> 'carried_items', '{}'::jsonb) ? 'merchant_whistle'
    OR coalesce(inventory_state -> 'carried_items', '{}'::jsonb) ? 'special_merchant_whistle'
    OR coalesce(inventory_state -> 'carried_items', '{}'::jsonb) ? 'golden_bag';

UPDATE public.evd_run_floors f
   SET grid = sanitized.grid
  FROM (
    SELECT
        rf.id,
        (
            SELECT jsonb_agg(row_cells ORDER BY row_idx)
              FROM (
                SELECT
                    row_idx,
                    jsonb_agg(
                        CASE
                            WHEN cell ->> 'type' IN ('盗賊', '落とし穴', '転送罠') THEN
                                jsonb_set(
                                    jsonb_set(cell, array['type'], to_jsonb('空白'::text), true),
                                    array['hint'],
                                    'null'::jsonb,
                                    true
                                )
                            ELSE cell
                        END
                        ORDER BY cell_idx
                    ) AS row_cells
                  FROM jsonb_array_elements(rf.grid) WITH ORDINALITY AS row_data(row_json, row_idx)
                  CROSS JOIN LATERAL jsonb_array_elements(row_data.row_json) WITH ORDINALITY AS cell_data(cell, cell_idx)
                 GROUP BY row_idx
              ) rows
        ) AS grid
      FROM public.evd_run_floors rf
     WHERE rf.grid::text LIKE '%盗賊%'
        OR rf.grid::text LIKE '%落とし穴%'
        OR rf.grid::text LIKE '%転送罠%'
  ) sanitized
 WHERE f.id = sanitized.id;

DELETE
  FROM public.evd_player_item_stocks
 WHERE item_code IN ('thief_ward_charm', 'escape_talisman', 'merchant_whistle', 'special_merchant_whistle', 'golden_bag');

DELETE
  FROM public.evd_item_catalog
 WHERE code IN ('thief_ward_charm', 'escape_talisman', 'merchant_whistle', 'special_merchant_whistle', 'golden_bag');

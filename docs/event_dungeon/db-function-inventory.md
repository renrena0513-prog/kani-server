# Event Dungeon DB Function Inventory

## Legacy Source Files

| Source | Role | Decision |
| --- | --- | --- |
| `event/dungeon/db/functions/all_functions.sql` | 全関数 bundle | 廃止候補。reference 扱い |
| `event/dungeon/db/archive/evd_latest_bundle_update.sql` | パッチ bundle | archive |
| `event/dungeon/db/archive/evd_add_new_items_and_normal_limited_shop.sql` | パッチ bundle | archive |

## Function Inventory

| Function | Kind | App Caller | DB Caller | Main Tables | Decision |
| --- | --- | --- | --- | --- | --- |
| `evd_set_stock_item_set` | RPC | `game.js` | - | `evd_player_item_stocks`, `evd_item_catalog` | 残す |
| `evd_buy_stock_item` | RPC | `game.js` | - | `profiles`, `evd_player_item_stocks`, `evd_item_catalog` | 残す |
| `evd_start_run` | RPC | `game.js` | - | `profiles`, `evd_game_runs`, `evd_run_floors`, `evd_player_item_stocks`, `evd_game_balance_profiles`, `evd_item_catalog` | 分割済みで残す |
| `evd_move` | RPC | `game.js` | - | `evd_game_runs`, `evd_run_floors` | 分割済みで残す |
| `evd_use_item` | RPC | `game.js` | - | `evd_game_runs`, `evd_floor_bonus_profiles` | 残す |
| `evd_resolve_stairs` | RPC | `game.js` | - | `evd_game_runs`, `evd_run_floors`, `evd_floor_bonus_profiles`, `evd_item_catalog` | 残す |
| `evd_claim_altar_reward` | RPC | `game.js` | - | `evd_game_runs`, `evd_item_catalog` | 残す |
| `evd_shop_purchase` | RPC | `game.js` | - | `evd_game_runs`, `evd_item_catalog` | 残す |
| `evd_finish_run` | RPC | indirect | `evd_claim_altar_reward`, `evd_move`, `evd_resolve_stairs`, `evd_use_item` | `evd_game_runs`, `profiles`, `evd_player_item_stocks`, `evd_item_catalog` | 分割済みで残す |
| `evd_current_user_id` | internal | - | 多数 | auth.jwt | 残す |
| `evd_add_log` | internal | - | 多数 | `evd_run_events` | 残す |
| `evd_build_snapshot` | internal | - | 多数 | `evd_game_runs`, `evd_run_floors`, `evd_run_events`, `evd_floor_bonus_profiles` | 残す |
| `evd_add_item` | internal | - | `evd_resolve_move_tile`, `evd_shop_purchase`, `evd_start_run` | run inventory JSON | 残す |
| `evd_add_bucket_item` | internal | - | `evd_claim_altar_reward`, `evd_resolve_move_tile`, `evd_shop_purchase`, `evd_start_run` | run inventory JSON | 残す |
| `evd_remove_item` | internal | - | `evd_finish_run`, `evd_use_item` | run inventory JSON | 残す |
| `evd_remove_bucket_item` | internal | - | `evd_finish_run`, `evd_use_item` | run inventory JSON | 残す |
| `evd_get_cell` | internal | - | `evd_move`, `evd_resolve_stairs` | floor grid JSON | 残す |
| `evd_set_cell` | internal | - | `evd_generate_floor`, `evd_move` | floor grid JSON | 残す |
| `evd_pick_weighted` | internal | - | `evd_generate_floor` | weighted JSON | 残す |
| `evd_generate_floor` | internal | - | `evd_resolve_floor_shift`, `evd_start_run` | `evd_floor_tile_weight_profiles` | 削除仕様反映済み |
| `evd_generate_shop_offers` | internal | - | `evd_resolve_move_tile` | `evd_game_runs`, `evd_item_catalog`, `evd_player_item_stocks`, `evd_floor_bonus_profiles` | 残す |
| `evd_get_floor_value` | internal | - | `evd_resolve_move_tile` | `evd_floor_value_profiles` | `盗賊` 値参照を削除 |
| `evd_resolve_floor_shift` | internal | - | `evd_resolve_stairs`, `evd_use_item` | `evd_game_runs`, `evd_run_floors`, `evd_player_item_stocks`, `evd_item_catalog` | 残す |
| `evd_compute_coin_pickup_bonus` | internal | - | `evd_resolve_move_tile` | `evd_item_catalog` | 残す |
| `evd_draw_pickup_item` | internal | - | `evd_resolve_move_tile` | `evd_item_catalog` | 残す |
| `evd_try_consume_revival_charm` | internal | - | `evd_finalize_move`, `evd_finish_run` | `evd_game_runs`, `evd_item_catalog` | 残す |

## Removed Function

- `evd_resolve_thief`
  - 理由: `盗賊` マス仕様を完全削除したため

## Summary

- App 直呼び出し RPC: 8 + `evd_finish_run`(indirect)
- internal helper: 26
- retired helper: 3
- deleted RPC: 1 (`evd_resolve_thief`)

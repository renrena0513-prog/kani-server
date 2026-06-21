# Event Dungeon Function Structure

## Canonical Source

- `functions/internal`
  - RPC から呼ばれる共通 helper
- `functions/rpc`
  - アプリから直接呼ぶ公開 RPC
- `items/item_catalog`
  - item 定義の正本
- `items/effects`
  - effect handler の正本
- `items/dispatch`
  - phase dispatcher / validation の正本

## Operational Rule

- 正本は `functions/internal`、`functions/rpc`、`items` です
- `all_functions.sql` や patch bundle は今後編集禁止です
- 本番反映は `scripts/build_event_dungeon_bundle.ps1` から生成した migration bundle を使います
- 正本以外に差分が必要な場合は archive か docs に理由を残します

## Retired Helpers

- `evd_get_range_value`
- `evd_random_int`
- `evd_random_numeric`

これらは migration の drop 対象で、recreate bundle には含めません。

## Build Order

1. `internal/evd_current_user_id.sql`
2. `internal/evd_add_item.sql`
3. `internal/evd_add_bucket_item.sql`
4. `internal/evd_remove_item.sql`
5. `internal/evd_remove_bucket_item.sql`
6. `internal/evd_get_cell.sql`
7. `internal/evd_set_cell.sql`
8. `internal/evd_add_log.sql`
9. `internal/evd_build_snapshot.sql`
10. `internal/evd_pick_weighted.sql`
11. `items/effects/evd_item_effect_substitute_apply.sql`
12. `items/effects/evd_item_effect_insurance_apply.sql`
13. `items/effects/evd_item_effect_golden_contract_apply.sql`
14. `items/effects/evd_item_effect_vault_box_apply.sql`
15. `items/effects/evd_item_effect_escape_rope_use.sql`
16. `items/effects/evd_item_effect_bomb_radar_use.sql`
17. `items/effects/evd_item_effect_heal_hp_use.sql`
18. `items/effects/evd_item_effect_reveal_stairs_use.sql`
19. `items/effects/evd_item_effect_reveal_hazards_use.sql`
20. `items/effects/evd_item_effect_reveal_bombs_use.sql`
21. `items/effects/evd_item_effect_holy_grail_use.sql`
22. `items/effects/evd_item_effect_increase_max_hp_use.sql`
23. `items/effects/evd_item_effect_abyss_ticket_use.sql`
24. `items/effects/evd_item_effect_golden_contract_settle_escape.sql`
25. `items/effects/evd_item_effect_return_multiplier_bonus_on_escape_settle_escape.sql`
26. `items/effects/evd_item_effect_vault_box_settle_death.sql`
27. `items/effects/evd_item_effect_insurance_settle_death.sql`
28. `items/effects/evd_item_effect_relic_shop_discount_plus_5pct_collect.sql`
29. `items/effects/evd_item_effect_relic_carry_limit_plus_1_collect.sql`
30. `items/effects/evd_item_effect_relic_return_multiplier_plus_0_05_collect.sql`
31. `items/effects/evd_item_effect_relic_bomb_radar_always_collect.sql`
32. `items/effects/evd_item_effect_relic_max_life_plus_1_collect.sql`
33. `items/effects/evd_item_effect_relic_death_coin_keep_plus_2pct_collect.sql`
34. `items/effects/evd_item_effect_relic_keep_unused_manual_on_death_collect.sql`
35. `items/dispatch/evd_dispatch_apply_granted_item.sql`
36. `items/dispatch/evd_collect_passive_modifiers.sql`
37. `items/dispatch/evd_dispatch_use_item.sql`
38. `items/dispatch/evd_dispatch_finish_run_escape_settlement.sql`
39. `items/dispatch/evd_dispatch_finish_run_death_settlement.sql`
40. `items/dispatch/evd_validate_item_effect_registry.sql`
41. `internal/evd_generate_floor.sql`
42. `internal/evd_get_floor_value.sql`
43. `internal/evd_compute_coin_pickup_bonus.sql`
44. `internal/evd_draw_pickup_item.sql`
45. `internal/evd_generate_shop_offers.sql`
46. `internal/evd_resolve_floor_shift.sql`
47. `internal/evd_try_consume_revival_charm.sql`
48. `internal/evd_start_run_load_context.sql`
49. `internal/evd_start_run_build_inventory.sql`
50. `internal/evd_start_run_create_initial_floor.sql`
51. `internal/evd_start_run_log.sql`
52. `internal/evd_resolve_move_tile.sql`
53. `internal/evd_finalize_move.sql`
54. `internal/evd_finish_run_calculate.sql`
55. `internal/evd_finish_run_restore_items.sql`
56. `internal/evd_finish_run_finalize.sql`
57. `rpc/evd_set_stock_item_set.sql`
58. `rpc/evd_buy_stock_item.sql`
59. `rpc/evd_start_run.sql`
60. `rpc/evd_finish_run.sql`
61. `rpc/evd_move.sql`
62. `rpc/evd_use_item.sql`
63. `rpc/evd_resolve_stairs.sql`
64. `rpc/evd_claim_altar_reward.sql`
65. `rpc/evd_shop_purchase.sql`
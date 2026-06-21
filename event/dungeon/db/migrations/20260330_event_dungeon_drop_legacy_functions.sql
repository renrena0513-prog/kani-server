-- Drop existing event dungeon functions before recreate.
-- This file is safe to re-run and drops both canonical runtime functions and retired helpers.

-- Public RPC
DROP FUNCTION IF EXISTS public.evd_set_stock_item_set(text, boolean);
DROP FUNCTION IF EXISTS public.evd_buy_stock_item(text);
DROP FUNCTION IF EXISTS public.evd_start_run(text[]);
DROP FUNCTION IF EXISTS public.evd_finish_run(uuid, text, text, text);
DROP FUNCTION IF EXISTS public.evd_move(uuid, text);
DROP FUNCTION IF EXISTS public.evd_use_item(uuid, text);
DROP FUNCTION IF EXISTS public.evd_resolve_stairs(uuid, text);
DROP FUNCTION IF EXISTS public.evd_claim_altar_reward(uuid, text);
DROP FUNCTION IF EXISTS public.evd_shop_purchase(uuid, text);

-- Core helpers
-- evd_current_user_id() is referenced by RLS policies and must be replaced in-place by recreate SQL.
-- Do not drop it here unless the dependent policies are dropped and recreated in the same deployment.

DROP FUNCTION IF EXISTS public.evd_add_item(jsonb, text, integer);
DROP FUNCTION IF EXISTS public.evd_add_bucket_item(jsonb, text, text, integer);
DROP FUNCTION IF EXISTS public.evd_remove_item(jsonb, text, integer);
DROP FUNCTION IF EXISTS public.evd_remove_bucket_item(jsonb, text, text, integer);
DROP FUNCTION IF EXISTS public.evd_get_cell(jsonb, integer, integer);
DROP FUNCTION IF EXISTS public.evd_set_cell(jsonb, integer, integer, jsonb);
DROP FUNCTION IF EXISTS public.evd_add_log(uuid, text, text, integer, text, text, jsonb);
DROP FUNCTION IF EXISTS public.evd_build_snapshot(uuid, text);
DROP FUNCTION IF EXISTS public.evd_pick_weighted(jsonb);
DROP FUNCTION IF EXISTS public.evd_generate_floor(uuid, integer, integer);
DROP FUNCTION IF EXISTS public.evd_get_floor_value(uuid, integer, text, boolean);
DROP FUNCTION IF EXISTS public.evd_compute_coin_pickup_bonus(jsonb);
DROP FUNCTION IF EXISTS public.evd_draw_pickup_item();
DROP FUNCTION IF EXISTS public.evd_generate_shop_offers(uuid, text);
DROP FUNCTION IF EXISTS public.evd_resolve_floor_shift(uuid, text, integer, text);
DROP FUNCTION IF EXISTS public.evd_try_consume_revival_charm(uuid, text, text, integer);
DROP FUNCTION IF EXISTS public.evd_start_run_load_context(text, text[]);
DROP FUNCTION IF EXISTS public.evd_start_run_build_inventory(text, text, text[], jsonb);
DROP FUNCTION IF EXISTS public.evd_start_run_create_initial_floor(uuid, text, text, uuid, integer);
DROP FUNCTION IF EXISTS public.evd_start_run_log(uuid, text, text, jsonb, numeric, boolean, jsonb, text[]);
DROP FUNCTION IF EXISTS public.evd_resolve_move_tile(uuid, text);
DROP FUNCTION IF EXISTS public.evd_finalize_move(uuid, text, text, integer, text, text, text, text);
DROP FUNCTION IF EXISTS public.evd_finish_run_calculate(uuid, text, text);
DROP FUNCTION IF EXISTS public.evd_finish_run_restore_items(text, text, text, jsonb, jsonb, jsonb, boolean, integer);
DROP FUNCTION IF EXISTS public.evd_finish_run_finalize(uuid, text, text, integer, text, text, integer, jsonb);

-- Item runtime helpers
DROP FUNCTION IF EXISTS public.evd_item_effect_substitute_apply(jsonb, text);
DROP FUNCTION IF EXISTS public.evd_item_effect_insurance_apply(jsonb, text);
DROP FUNCTION IF EXISTS public.evd_item_effect_golden_contract_apply(jsonb, text);
DROP FUNCTION IF EXISTS public.evd_item_effect_vault_box_apply(jsonb, text);
DROP FUNCTION IF EXISTS public.evd_item_effect_escape_rope_use(uuid, text, text, integer);
DROP FUNCTION IF EXISTS public.evd_item_effect_bomb_radar_use(text);
DROP FUNCTION IF EXISTS public.evd_item_effect_heal_hp_use(uuid, text, text, integer, jsonb);
DROP FUNCTION IF EXISTS public.evd_item_effect_reveal_stairs_use(uuid, text, text, integer);
DROP FUNCTION IF EXISTS public.evd_item_effect_reveal_hazards_use(uuid, text, text, integer);
DROP FUNCTION IF EXISTS public.evd_item_effect_reveal_bombs_use(uuid, text, text, integer);
DROP FUNCTION IF EXISTS public.evd_item_effect_holy_grail_use(uuid, text, text, integer);
DROP FUNCTION IF EXISTS public.evd_item_effect_increase_max_hp_use(uuid, text, text, integer, jsonb);
DROP FUNCTION IF EXISTS public.evd_item_effect_abyss_ticket_use(uuid, text, text, integer, integer, uuid);
DROP FUNCTION IF EXISTS public.evd_item_effect_golden_contract_settle_escape(jsonb, integer, integer, numeric);
DROP FUNCTION IF EXISTS public.evd_item_effect_return_multiplier_bonus_on_escape_settle_escape(jsonb, integer, integer, numeric);
DROP FUNCTION IF EXISTS public.evd_item_effect_vault_box_settle_death(jsonb);
DROP FUNCTION IF EXISTS public.evd_item_effect_insurance_settle_death(jsonb);
DROP FUNCTION IF EXISTS public.evd_item_effect_relic_shop_discount_plus_5pct_collect(jsonb, integer);
DROP FUNCTION IF EXISTS public.evd_item_effect_relic_carry_limit_plus_1_collect(jsonb, integer);
DROP FUNCTION IF EXISTS public.evd_item_effect_relic_return_multiplier_plus_0_05_collect(jsonb, integer);
DROP FUNCTION IF EXISTS public.evd_item_effect_relic_bomb_radar_always_collect(jsonb, integer);
DROP FUNCTION IF EXISTS public.evd_item_effect_relic_max_life_plus_1_collect(jsonb, integer);
DROP FUNCTION IF EXISTS public.evd_item_effect_relic_death_coin_keep_plus_2pct_collect(jsonb, integer);
DROP FUNCTION IF EXISTS public.evd_item_effect_relic_keep_unused_manual_on_death_collect(jsonb, integer);
DROP FUNCTION IF EXISTS public.evd_dispatch_apply_granted_item(jsonb, text);
DROP FUNCTION IF EXISTS public.evd_collect_passive_modifiers(text);
DROP FUNCTION IF EXISTS public.evd_dispatch_use_item(uuid, text, text, integer, integer, uuid, text);
DROP FUNCTION IF EXISTS public.evd_dispatch_finish_run_escape_settlement(jsonb, integer, integer, numeric);
DROP FUNCTION IF EXISTS public.evd_dispatch_finish_run_death_settlement(text, jsonb, integer, integer);
DROP FUNCTION IF EXISTS public.evd_validate_item_effect_registry();

-- Retired legacy helpers and removed RPCs
DROP FUNCTION IF EXISTS public.evd_resolve_thief(uuid, text);
DROP FUNCTION IF EXISTS public.evd_get_range_value(jsonb, integer, text, boolean);
DROP FUNCTION IF EXISTS public.evd_random_int(integer, integer);
DROP FUNCTION IF EXISTS public.evd_random_numeric(numeric, numeric);
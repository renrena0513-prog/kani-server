-- Event Dungeon post-deploy verification SQL

select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  pg_get_function_result(p.oid) as returns,
  l.lanname as language_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
join pg_language l on l.oid = p.prolang
where n.nspname = 'public'
  and p.proname like 'evd_%'
order by p.proname, args;

select count(*) as evd_function_count
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname like 'evd_%';

select proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'evd_get_range_value',
    'evd_random_int',
    'evd_random_numeric',
    'evd_resolve_thief'
  );

select code, effect_data ->> 'effect' as effect_name
from public.evd_item_catalog
where code in (
  'escape_rope',
  'bomb_radar',
  'stairs_search',
  'calamity_map',
  'full_scan_map',
  'holy_grail',
  'life_vessel',
  'abyss_ticket'
)
order by code;

select count(*) as legacy_tile_weight_rows
from public.evd_floor_tile_weight_profiles
where tile_type in ('盗賊', '落とし穴', '転送罠');

select count(*) as legacy_item_rows
from public.evd_item_catalog
where code in ('thief_ward_charm', 'escape_talisman', 'merchant_whistle', 'special_merchant_whistle', 'golden_bag');

select count(*) as legacy_stock_rows
from public.evd_player_item_stocks
where item_code in ('thief_ward_charm', 'escape_talisman', 'merchant_whistle', 'special_merchant_whistle', 'golden_bag');

select count(*) as pending_thief_rows
from public.evd_game_runs
where inventory_state ? 'pending_thief';

select *
from public.evd_validate_item_effect_registry();

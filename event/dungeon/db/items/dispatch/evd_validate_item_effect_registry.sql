create or replace function public.evd_validate_item_effect_registry()
returns table (
    issue_type text,
    item_code text,
    effect_name text,
    detail text
)
language sql
as $$
    with active_items as (
        select
            code,
            effect_data ->> 'effect' as effect_name,
            item_kind
          from public.evd_item_catalog
         where is_active = true
    ),
    granted_item_effects as (
        select unnest(array['substitute','insurance','golden_contract','vault_box']) as effect_name
    ),
    passive_modifier_effects as (
        select unnest(array[
            'relic_shop_discount_plus_5pct',
            'relic_carry_limit_plus_1',
            'relic_return_multiplier_plus_0_05',
            'relic_bomb_radar_always',
            'relic_max_life_plus_1',
            'relic_death_coin_keep_plus_2pct',
            'relic_keep_unused_manual_on_death'
        ]) as effect_name
    ),
    automatic_runtime_effects as (
        select unnest(array[
            'revive_on_death',
            'heal_hp_on_floor_advance',
            'add_coin_on_coin_pickup'
        ]) as effect_name
    ),
    use_item_effects as (
        select unnest(array[
            'escape_run',
            'bomb_radar',
            'reveal_stairs',
            'reveal_hazards',
            'reveal_bombs',
            'heal_hp',
            'increase_max_hp',
            'increase_max_hp_full_restore',
            'advance_floor_with_bonus'
        ]) as effect_name
    ),
    settlement_escape_effects as (
        select unnest(array['golden_contract','return_multiplier_bonus_on_escape']) as effect_name
    ),
    settlement_death_effects as (
        select unnest(array['vault_box','insurance','relic_death_coin_keep_plus_2pct','relic_keep_unused_manual_on_death']) as effect_name
    )
    select
        'missing_use_item_handler' as issue_type,
        ai.code as item_code,
        ai.effect_name,
        'manual item is active but not registered in use-item dispatcher' as detail
      from active_items ai
     where ai.item_kind = '手動'
       and not exists (select 1 from use_item_effects uie where uie.effect_name = ai.effect_name)
    union all
    select
        'missing_settlement_escape_handler' as issue_type,
        ai.code as item_code,
        ai.effect_name,
        'escape settlement effect is active but not registered in finish-run escape dispatcher' as detail
      from active_items ai
     where ai.effect_name in ('golden_contract','return_multiplier_bonus_on_escape')
       and not exists (select 1 from settlement_escape_effects see where see.effect_name = ai.effect_name)
    union all
    select
        'missing_settlement_death_handler' as issue_type,
        ai.code as item_code,
        ai.effect_name,
        'death settlement effect is active but not registered in finish-run death dispatcher' as detail
      from active_items ai
     where ai.effect_name in ('vault_box','insurance','relic_death_coin_keep_plus_2pct','relic_keep_unused_manual_on_death')
       and not exists (select 1 from settlement_death_effects sde where sde.effect_name = ai.effect_name)
    union all
    select
        'unimplemented_effect' as issue_type,
        ai.code as item_code,
        ai.effect_name,
        'effect is active in catalog but no known phase registry includes it' as detail
      from active_items ai
     where coalesce(ai.effect_name, '') <> ''
       and not exists (select 1 from granted_item_effects gie where gie.effect_name = ai.effect_name)
       and not exists (select 1 from passive_modifier_effects pme where pme.effect_name = ai.effect_name)
       and not exists (select 1 from automatic_runtime_effects aref where aref.effect_name = ai.effect_name)
       and not exists (select 1 from use_item_effects uie where uie.effect_name = ai.effect_name)
       and not exists (select 1 from settlement_escape_effects see where see.effect_name = ai.effect_name)
       and not exists (select 1 from settlement_death_effects sde where sde.effect_name = ai.effect_name)
    union all
    select
        'duplicate_active_item_code' as issue_type,
        c.code as item_code,
        null::text as effect_name,
        'multiple active catalog rows share the same code' as detail
      from public.evd_item_catalog c
     where c.is_active = true
     group by c.code
    having count(*) > 1;
$$;

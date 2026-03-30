create or replace function public.evd_generate_shop_offers(p_run_id uuid, p_shop_type text)
returns jsonb
language sql
as $$
    with run_context as (
        select current_floor, generation_profile_id
          from public.evd_game_runs
         where id = p_run_id
           and user_id = public.evd_current_user_id()
           and status = '進行中'
    ),
    floor_pricing as (
        select coalesce(fbp.shop_price_multiplier, 1.00::numeric) as multiplier
          from run_context rc
          left join public.evd_floor_bonus_profiles fbp
            on fbp.profile_id = rc.generation_profile_id
           and fbp.floor_no = rc.current_floor
    ),
    passive_modifiers as (
        select public.evd_collect_passive_modifiers(public.evd_current_user_id()) as modifiers
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'code', code,
        'name', name,
        'description', description,
        'price', price,
        'rarity', rarity
    )), '[]'::jsonb)
    from (
        select
            code,
            name,
            description,
            floor(
                base_price
                * coalesce((select multiplier from floor_pricing), 1.00::numeric)
                * greatest(0::numeric, 1 - coalesce(((select modifiers from passive_modifiers) ->> 'shop_discount_rate')::numeric, 0))
            )::integer as price,
            rarity
          from public.evd_item_catalog
         where is_active = true
           and (
                (p_shop_type = 'ショップ' and shop_pool in ('通常', '両方', '通常限定'))
             or (p_shop_type = '限定ショップ' and shop_pool in ('限定', '両方'))
           )
         order by
            case
                when coalesce(weight, 0) > 0 then -ln(greatest(random(), 1e-9)) / weight
                else 1e9 + random()
            end
         limit 3
    ) q;
$$;

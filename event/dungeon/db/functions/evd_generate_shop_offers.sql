create or replace function public.evd_generate_shop_offers(p_shop_type text)
returns jsonb
language sql
as $$
    with merchant_discount as (
        select least(coalesce(sum(st.quantity), 0), 4) * 0.05 as rate
          from public.evd_player_item_stocks st
          join public.evd_item_catalog c
            on c.code = st.item_code
         where st.user_id = public.evd_current_user_id()
           and st.quantity > 0
           and c.is_active = true
           and c.effect_data ->> 'effect' = 'relic_shop_discount_plus_5pct'
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
            floor(base_price * greatest(0::numeric, 1 - coalesce((select rate from merchant_discount), 0)))::integer as price,
            rarity
          from public.evd_item_catalog
         where is_active = true
           and (
                (p_shop_type = 'ショップ' and shop_pool in ('通常', '両方'))
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

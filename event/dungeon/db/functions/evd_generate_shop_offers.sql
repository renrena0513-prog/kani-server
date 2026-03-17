create or replace function public.evd_generate_shop_offers(p_shop_type text)
returns jsonb
language sql
as $$
    select coalesce(jsonb_agg(jsonb_build_object(
        'code', code,
        'name', name,
        'description', description,
        'price', base_price
    )), '[]'::jsonb)
    from (
        select code, name, description, base_price
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

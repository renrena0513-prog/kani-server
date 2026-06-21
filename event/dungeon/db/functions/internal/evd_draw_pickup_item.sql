create or replace function public.evd_draw_pickup_item()
returns jsonb
language plpgsql
as $$
declare
    v_item record;
begin
    with weighted_pool as (
        select
            code,
            name,
            effect_data ->> 'effect' as effect,
            weight,
            sum(weight) over () as total_weight,
            sum(weight) over (order by sort_order, code) as cumulative_weight
         from public.evd_item_catalog
         where is_active = true
           and weight > 0
    ),
    draw as (
        select random() * coalesce(max(total_weight), 0) as roll
          from weighted_pool
    )
    select wp.code, wp.name, wp.effect
      into v_item
      from weighted_pool wp
      cross join draw d
     where wp.cumulative_weight >= d.roll
     order by wp.cumulative_weight
     limit 1;

    return jsonb_build_object(
        'item_code', v_item.code,
        'item_name', v_item.name,
        'item_effect', v_item.effect
    );
end;
$$;

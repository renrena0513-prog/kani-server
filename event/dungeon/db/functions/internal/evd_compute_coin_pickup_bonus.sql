create or replace function public.evd_compute_coin_pickup_bonus(p_inventory jsonb)
returns integer
language plpgsql
as $$
declare
    v_bonus integer := 0;
begin
    select coalesce(sum(src.quantity * coalesce((c.effect_data ->> 'amount')::integer, 0)), 0)
      into v_bonus
      from (
            select
                code,
                greatest(max(items_qty), max(carried_qty)) as quantity
              from (
                    select
                        e.key as code,
                        coalesce((e.value ->> 'quantity')::integer, 0) as items_qty,
                        0 as carried_qty
                      from jsonb_each(coalesce(p_inventory -> 'items', '{}'::jsonb)) e
                    union all
                    select
                        e.key as code,
                        0 as items_qty,
                        coalesce((e.value ->> 'quantity')::integer, 0) as carried_qty
                      from jsonb_each(coalesce(p_inventory -> 'carried_items', '{}'::jsonb)) e
                ) qty
             group by code
           ) src
      join public.evd_item_catalog c on c.code = src.code
     where src.quantity > 0
       and c.effect_data ->> 'effect' = 'add_coin_on_coin_pickup';

    return coalesce(v_bonus, 0);
end;
$$;

create or replace function public.evd_remove_item(p_inventory jsonb, p_item_code text, p_amount integer default 1)
returns jsonb
language plpgsql
as $$
declare
    v_qty integer;
begin
    v_qty := greatest(coalesce((p_inventory -> 'items' -> p_item_code ->> 'quantity')::integer, 0) - p_amount, 0);
    if v_qty = 0 then
        return jsonb_set(p_inventory, array['items', p_item_code], '{"quantity":0}'::jsonb, true);
    end if;

    return jsonb_set(
        p_inventory,
        array['items', p_item_code],
        jsonb_build_object('quantity', v_qty),
        true
    );
end;
$$;

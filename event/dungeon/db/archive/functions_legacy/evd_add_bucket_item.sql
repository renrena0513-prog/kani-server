create or replace function public.evd_add_bucket_item(p_inventory jsonb, p_bucket text, p_item_code text, p_amount integer default 1)
returns jsonb
language plpgsql
as $$
declare
    v_qty integer;
begin
    v_qty := coalesce((p_inventory -> p_bucket -> p_item_code ->> 'quantity')::integer, 0) + p_amount;
    return jsonb_set(
        p_inventory,
        array[p_bucket, p_item_code],
        jsonb_build_object('quantity', v_qty),
        true
    );
end;
$$;

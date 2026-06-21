create or replace function public.evd_item_effect_vault_box_apply(
    p_inventory jsonb,
    p_item_code text
)
returns jsonb
language plpgsql
as $$
begin
    return public.evd_add_bucket_item(p_inventory, 'carried_items', p_item_code, 1);
end;
$$;

create or replace function public.evd_item_effect_golden_contract_apply(
    p_inventory jsonb,
    p_item_code text
)
returns jsonb
language plpgsql
as $$
begin
    return public.evd_add_item(p_inventory, p_item_code, 1);
end;
$$;

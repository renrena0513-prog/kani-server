create or replace function public.evd_dispatch_apply_granted_item(
    p_inventory jsonb,
    p_item_code text
)
returns jsonb
language plpgsql
as $$
declare
    v_effect text;
begin
    select effect_data ->> 'effect'
      into v_effect
      from public.evd_item_catalog
     where code = p_item_code;

    case v_effect
        when 'substitute' then
            return public.evd_item_effect_substitute_apply(p_inventory, p_item_code);
        when 'insurance' then
            return public.evd_item_effect_insurance_apply(p_inventory, p_item_code);
        when 'golden_contract' then
            return public.evd_item_effect_golden_contract_apply(p_inventory, p_item_code);
        when 'vault_box' then
            return public.evd_item_effect_vault_box_apply(p_inventory, p_item_code);
        else
            return public.evd_add_item(p_inventory, p_item_code, 1);
    end case;
end;
$$;

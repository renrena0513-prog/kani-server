create or replace function public.evd_item_effect_vault_box_settle_death(
    p_inventory_state jsonb
)
returns jsonb
language plpgsql
as $$
declare
    v_carried_items jsonb := coalesce(p_inventory_state -> 'carried_items', '{}'::jsonb);
begin
    return jsonb_build_object(
        'eligible', coalesce((v_carried_items -> 'vault_box' ->> 'quantity')::integer, 0) > 0,
        'base_rate', 0.80,
        'inventory_state', p_inventory_state
    );
end;
$$;
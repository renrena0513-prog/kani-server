create or replace function public.evd_item_effect_golden_contract_settle_escape(
    p_inventory_state jsonb,
    p_run_coins integer,
    p_secured_coins integer,
    p_final_return_multiplier numeric
)
returns jsonb
language plpgsql
as $$
declare
    v_items jsonb := coalesce(p_inventory_state -> 'items', '{}'::jsonb);
    v_flags jsonb := coalesce(p_inventory_state -> 'flags', '{}'::jsonb);
    v_qty integer := greatest(
        coalesce((v_items -> 'golden_contract' ->> 'quantity')::integer, 0),
        case when coalesce((v_flags ->> 'golden_contract_active')::boolean, false) then 1 else 0 end
    );
    v_inventory jsonb := p_inventory_state;
begin
    if v_qty <= 0 then
        return jsonb_build_object(
            'eligible', false,
            'payout', null,
            'inventory_state', p_inventory_state
        );
    end if;

    if coalesce((v_items -> 'golden_contract' ->> 'quantity')::integer, 0) > 0 then
        v_inventory := public.evd_remove_item(v_inventory, 'golden_contract', 1);
    end if;

    return jsonb_build_object(
        'eligible', true,
        'payout', floor((p_run_coins + p_secured_coins) * (p_final_return_multiplier + 1.0))::integer,
        'inventory_state', v_inventory,
        'consumed_effect', 'golden_contract'
    );
end;
$$;
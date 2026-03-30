create or replace function public.evd_dispatch_finish_run_escape_settlement(
    p_inventory_state jsonb,
    p_run_coins integer,
    p_secured_coins integer,
    p_final_return_multiplier numeric
)
returns jsonb
language plpgsql
as $$
declare
    v_base_result jsonb;
    v_golden_result jsonb;
    v_blessing_result jsonb;
    v_base_payout integer;
    v_golden_payout integer;
    v_blessing_payout integer;
begin
    v_base_payout := floor((p_run_coins + p_secured_coins) * p_final_return_multiplier)::integer;
    v_base_result := jsonb_build_object(
        'payout', v_base_payout,
        'inventory_state', p_inventory_state,
        'selected_effect', null
    );

    v_golden_result := public.evd_item_effect_golden_contract_settle_escape(
        p_inventory_state,
        p_run_coins,
        p_secured_coins,
        p_final_return_multiplier
    );
    v_blessing_result := public.evd_item_effect_return_multiplier_bonus_on_escape_settle_escape(
        p_inventory_state,
        p_run_coins,
        p_secured_coins,
        p_final_return_multiplier
    );

    v_golden_payout := coalesce((v_golden_result ->> 'payout')::integer, -1);
    v_blessing_payout := coalesce((v_blessing_result ->> 'payout')::integer, -1);

    if coalesce((v_golden_result ->> 'eligible')::boolean, false)
       and v_golden_payout >= greatest(v_base_payout, v_blessing_payout) then
        return jsonb_build_object(
            'payout', v_golden_payout,
            'inventory_state', v_golden_result -> 'inventory_state',
            'selected_effect', v_golden_result ->> 'consumed_effect'
        );
    end if;

    if coalesce((v_blessing_result ->> 'eligible')::boolean, false)
       and v_blessing_payout > v_base_payout then
        return jsonb_build_object(
            'payout', v_blessing_payout,
            'inventory_state', v_blessing_result -> 'inventory_state',
            'selected_effect', v_blessing_result ->> 'consumed_effect'
        );
    end if;

    return v_base_result;
end;
$$;
create or replace function public.evd_dispatch_finish_run_death_settlement(
    p_user_id text,
    p_inventory_state jsonb,
    p_run_coins integer,
    p_secured_coins integer
)
returns jsonb
language plpgsql
as $$
declare
    v_modifiers jsonb := public.evd_collect_passive_modifiers(p_user_id);
    v_vault_result jsonb;
    v_insurance_result jsonb;
    v_inventory_state jsonb := p_inventory_state;
    v_base_rate numeric(8, 4) := 0.0;
    v_wallet_bonus numeric(8, 4) := coalesce((v_modifiers ->> 'death_coin_keep_bonus')::numeric, 0.0);
    v_has_coffin boolean := coalesce((v_modifiers ->> 'keep_unused_manual_on_death')::boolean, false);
    v_death_return_rate numeric(8, 4);
    v_payout integer;
begin
    v_vault_result := public.evd_item_effect_vault_box_settle_death(p_inventory_state);
    v_insurance_result := public.evd_item_effect_insurance_settle_death(p_inventory_state);

    if coalesce((v_vault_result ->> 'eligible')::boolean, false) then
        v_base_rate := coalesce((v_vault_result ->> 'base_rate')::numeric, 0.80);
        v_inventory_state := coalesce(v_vault_result -> 'inventory_state', p_inventory_state);
    elsif coalesce((v_insurance_result ->> 'eligible')::boolean, false) then
        v_base_rate := coalesce((v_insurance_result ->> 'base_rate')::numeric, 0.50);
        v_inventory_state := coalesce(v_insurance_result -> 'inventory_state', p_inventory_state);
    end if;

    v_death_return_rate := least(1.0, coalesce(v_base_rate, 0.0) + coalesce(v_wallet_bonus, 0.0));
    v_payout := p_secured_coins + floor(p_run_coins * v_death_return_rate)::integer;

    return jsonb_build_object(
        'payout', greatest(v_payout, 0),
        'inventory_state', v_inventory_state,
        'has_coffin', v_has_coffin,
        'death_return_rate', v_death_return_rate
    );
end;
$$;
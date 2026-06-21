create or replace function public.evd_item_effect_return_multiplier_bonus_on_escape_settle_escape(
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
    v_qty integer := coalesce((v_items -> 'return_blessing' ->> 'quantity')::integer, 0);
    v_amount numeric(10, 4) := 1.0;
    v_multiplier numeric(10, 4) := 1.0;
    v_inventory jsonb := p_inventory_state;
begin
    if v_qty <= 0 then
        return jsonb_build_object(
            'eligible', false,
            'payout', null,
            'inventory_state', p_inventory_state
        );
    end if;

    select coalesce((effect_data ->> 'amount')::numeric, 1.0)
      into v_amount
      from public.evd_item_catalog
     where code = 'return_blessing';

    v_multiplier := power(greatest(v_amount, 1.0), v_qty);
    v_inventory := public.evd_remove_item(v_inventory, 'return_blessing', v_qty);

    return jsonb_build_object(
        'eligible', true,
        'payout', floor((p_run_coins + p_secured_coins) * p_final_return_multiplier * v_multiplier)::integer,
        'inventory_state', v_inventory,
        'consumed_effect', 'return_multiplier_bonus_on_escape'
    );
end;
$$;
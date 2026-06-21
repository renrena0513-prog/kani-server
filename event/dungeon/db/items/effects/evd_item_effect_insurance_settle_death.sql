create or replace function public.evd_item_effect_insurance_settle_death(
    p_inventory_state jsonb
)
returns jsonb
language plpgsql
as $$
declare
    v_flags jsonb := coalesce(p_inventory_state -> 'flags', '{}'::jsonb);
    v_inventory jsonb := p_inventory_state;
    v_active boolean := coalesce((v_flags ->> 'insurance_active')::boolean, false);
begin
    if not v_active then
        return jsonb_build_object(
            'eligible', false,
            'base_rate', null,
            'inventory_state', p_inventory_state
        );
    end if;

    v_flags := jsonb_set(v_flags, array['insurance_active'], 'false'::jsonb, true);
    v_inventory := jsonb_set(v_inventory, array['flags'], v_flags, true);

    return jsonb_build_object(
        'eligible', true,
        'base_rate', 0.50,
        'inventory_state', v_inventory
    );
end;
$$;
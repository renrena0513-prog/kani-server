create or replace function public.evd_item_effect_relic_return_multiplier_plus_0_05_collect(
    p_modifiers jsonb,
    p_quantity integer
)
returns jsonb
language plpgsql
as $$
declare
    v_current numeric := coalesce((p_modifiers ->> 'return_multiplier_bonus')::numeric, 0);
begin
    return jsonb_set(
        p_modifiers,
        array['return_multiplier_bonus'],
        to_jsonb(v_current + (least(greatest(p_quantity, 0), 4) * 0.05)),
        true
    );
end;
$$;

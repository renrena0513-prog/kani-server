create or replace function public.evd_item_effect_relic_death_coin_keep_plus_2pct_collect(
    p_modifiers jsonb,
    p_quantity integer
)
returns jsonb
language plpgsql
as $$
declare
    v_bonus numeric(8, 4);
begin
    v_bonus := least(greatest(coalesce(p_quantity, 0), 0), 5) * 0.02;

    return jsonb_set(
        p_modifiers,
        array['death_coin_keep_bonus'],
        to_jsonb(v_bonus),
        true
    );
end;
$$;
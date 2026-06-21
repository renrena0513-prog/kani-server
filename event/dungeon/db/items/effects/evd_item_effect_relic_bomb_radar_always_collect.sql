create or replace function public.evd_item_effect_relic_bomb_radar_always_collect(
    p_modifiers jsonb,
    p_quantity integer
)
returns jsonb
language plpgsql
as $$
begin
    if greatest(p_quantity, 0) <= 0 then
        return p_modifiers;
    end if;

    return jsonb_set(
        p_modifiers,
        array['always_bomb_radar'],
        'true'::jsonb,
        true
    );
end;
$$;

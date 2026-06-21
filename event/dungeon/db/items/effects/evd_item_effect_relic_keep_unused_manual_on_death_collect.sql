create or replace function public.evd_item_effect_relic_keep_unused_manual_on_death_collect(
    p_modifiers jsonb,
    p_quantity integer
)
returns jsonb
language plpgsql
as $$
begin
    if coalesce(p_quantity, 0) <= 0 then
        return p_modifiers;
    end if;

    return jsonb_set(
        p_modifiers,
        array['keep_unused_manual_on_death'],
        'true'::jsonb,
        true
    );
end;
$$;
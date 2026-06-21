create or replace function public.evd_item_effect_relic_shop_discount_plus_5pct_collect(
    p_modifiers jsonb,
    p_quantity integer
)
returns jsonb
language plpgsql
as $$
declare
    v_current numeric := coalesce((p_modifiers ->> 'shop_discount_rate')::numeric, 0);
begin
    return jsonb_set(
        p_modifiers,
        array['shop_discount_rate'],
        to_jsonb(least(0.20::numeric, v_current + (greatest(p_quantity, 0) * 0.05))),
        true
    );
end;
$$;

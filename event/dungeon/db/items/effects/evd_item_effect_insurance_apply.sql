create or replace function public.evd_item_effect_insurance_apply(
    p_inventory jsonb,
    p_item_code text
)
returns jsonb
language plpgsql
as $$
begin
    return public.evd_add_bucket_item(
        jsonb_set(p_inventory, array['flags', 'insurance_active'], 'true'::jsonb, true),
        'carried_items',
        p_item_code,
        1
    );
end;
$$;

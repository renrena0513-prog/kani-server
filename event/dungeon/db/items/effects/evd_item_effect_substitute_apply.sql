create or replace function public.evd_item_effect_substitute_apply(
    p_inventory jsonb,
    p_item_code text
)
returns jsonb
language plpgsql
as $$
begin
    return jsonb_set(
        public.evd_add_bucket_item(p_inventory, 'carried_items', p_item_code, 1),
        array['flags', 'substitute_ready'],
        'true'::jsonb,
        true
    );
end;
$$;

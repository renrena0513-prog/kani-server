create or replace function public.evd_start_run_build_inventory(
    p_user_id text,
    p_account_name text,
    p_carry_items text[] default '{}',
    p_passive_modifiers jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
as $$
declare
    v_inventory jsonb := jsonb_build_object(
        'items', '{}'::jsonb,
        'flags', jsonb_build_object(
            'insurance_active', false,
            'golden_contract_active', false,
            'stairs_known', false,
            'hazards_known', false,
            'bombs_known', false
        ),
        'carried_items', '{}'::jsonb,
        'pending_resolution', null,
        'pending_shop', null
    );
    v_item text;
begin
    update public.evd_player_item_stocks
       set is_set = case
            when item_code = any(coalesce(p_carry_items, '{}'::text[])) then true
            else false
       end,
           account_name = p_account_name,
           updated_at = now()
     where user_id = p_user_id;

    foreach v_item in array p_carry_items loop
        update public.evd_player_item_stocks
           set quantity = quantity - 1,
               account_name = p_account_name,
               updated_at = now()
         where user_id = p_user_id
           and item_code = v_item
           and quantity > 0;

        if not found then
            raise exception '持ち込み在庫が不足しています: %', v_item;
        end if;

        v_inventory := public.evd_dispatch_apply_granted_item(v_inventory, v_item);
    end loop;

    if coalesce((p_passive_modifiers ->> 'max_life_bonus')::integer, 0) > 0 then
        v_inventory := jsonb_set(v_inventory, array['flags', 'relic_giant_cup_active'], 'true'::jsonb, true);
    end if;

    return v_inventory;
end;
$$;

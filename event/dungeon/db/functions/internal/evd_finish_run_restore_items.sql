create or replace function public.evd_finish_run_restore_items(
    p_user_id text,
    p_account_name text,
    p_status text,
    p_items jsonb,
    p_carried_items jsonb,
    p_flags jsonb,
    p_has_coffin boolean,
    p_substitute_negates_remaining integer
)
returns jsonb
language plpgsql
as $$
declare
    v_return_item record;
    v_carried_items jsonb := coalesce(p_carried_items, '{}'::jsonb);
begin
    if p_status = '死亡' then
        if coalesce((v_carried_items -> 'substitute_doll' ->> 'quantity')::integer, 0) > 0
           and p_substitute_negates_remaining < 3 then
            v_carried_items := public.evd_remove_bucket_item(jsonb_build_object('carried_items', v_carried_items), 'carried_items', 'substitute_doll', 1) -> 'carried_items';
        end if;

        if coalesce((v_carried_items -> 'insurance_token' ->> 'quantity')::integer, 0) > 0
           and not coalesce((p_flags ->> 'insurance_active')::boolean, false) then
            v_carried_items := public.evd_remove_bucket_item(jsonb_build_object('carried_items', v_carried_items), 'carried_items', 'insurance_token', 1) -> 'carried_items';
        end if;
    end if;

    if p_status = '帰還' then
        for v_return_item in
            select e.key as item_code, coalesce((e.value ->> 'quantity')::integer, 0) as quantity
              from jsonb_each(coalesce(p_items, '{}'::jsonb)) e
              join public.evd_item_catalog c on c.code = e.key
             where coalesce((e.value ->> 'quantity')::integer, 0) > 0
               and (
                    c.item_kind in ('手動', '死亡時', '永続')
                    or c.effect_data ->> 'effect' in ('golden_contract', 'return_multiplier_bonus_on_escape')
               )
        loop
            insert into public.evd_player_item_stocks (user_id, account_name, name, item_code, quantity, is_set, updated_at)
            values (p_user_id, p_account_name, (select c.name from public.evd_item_catalog c where c.code = v_return_item.item_code), v_return_item.item_code, v_return_item.quantity, false, now())
            on conflict (user_id, item_code) do update
            set quantity = public.evd_player_item_stocks.quantity + excluded.quantity,
                account_name = excluded.account_name,
                name = excluded.name,
                updated_at = now();
        end loop;

        for v_return_item in
            select e.key as item_code, coalesce((e.value ->> 'quantity')::integer, 0) as quantity
              from jsonb_each(v_carried_items) e
              join public.evd_item_catalog c on c.code = e.key
             where coalesce((e.value ->> 'quantity')::integer, 0) > 0
               and c.item_kind in ('死亡時', '永続')
        loop
            insert into public.evd_player_item_stocks (user_id, account_name, name, item_code, quantity, is_set, updated_at)
            values (p_user_id, p_account_name, (select c.name from public.evd_item_catalog c where c.code = v_return_item.item_code), v_return_item.item_code, v_return_item.quantity, false, now())
            on conflict (user_id, item_code) do update
            set quantity = public.evd_player_item_stocks.quantity + excluded.quantity,
                account_name = excluded.account_name,
                name = excluded.name,
                updated_at = now();
        end loop;
    else
        if p_has_coffin then
            for v_return_item in
                select e.key as item_code, coalesce((e.value ->> 'quantity')::integer, 0) as quantity
                  from jsonb_each(coalesce(p_items, '{}'::jsonb)) e
                  join public.evd_item_catalog c on c.code = e.key
                 where coalesce((e.value ->> 'quantity')::integer, 0) > 0
                   and c.item_kind = '手動'
            loop
                insert into public.evd_player_item_stocks (user_id, account_name, name, item_code, quantity, is_set, updated_at)
                values (p_user_id, p_account_name, (select c.name from public.evd_item_catalog c where c.code = v_return_item.item_code), v_return_item.item_code, v_return_item.quantity, false, now())
                on conflict (user_id, item_code) do update
                set quantity = public.evd_player_item_stocks.quantity + excluded.quantity,
                    account_name = excluded.account_name,
                    name = excluded.name,
                    updated_at = now();
            end loop;
        end if;

        for v_return_item in
            select e.key as item_code, coalesce((e.value ->> 'quantity')::integer, 0) as quantity
              from jsonb_each(coalesce(p_items, '{}'::jsonb)) e
              join public.evd_item_catalog c on c.code = e.key
             where coalesce((e.value ->> 'quantity')::integer, 0) > 0
               and c.item_kind = '永続'
        loop
            insert into public.evd_player_item_stocks (user_id, account_name, name, item_code, quantity, is_set, updated_at)
            values (p_user_id, p_account_name, (select c.name from public.evd_item_catalog c where c.code = v_return_item.item_code), v_return_item.item_code, v_return_item.quantity, false, now())
            on conflict (user_id, item_code) do update
            set quantity = public.evd_player_item_stocks.quantity + excluded.quantity,
                account_name = excluded.account_name,
                name = excluded.name,
                updated_at = now();
        end loop;

        for v_return_item in
            select e.key as item_code, coalesce((e.value ->> 'quantity')::integer, 0) as quantity
              from jsonb_each(v_carried_items) e
              join public.evd_item_catalog c on c.code = e.key
             where coalesce((e.value ->> 'quantity')::integer, 0) > 0
               and c.item_kind = '永続'
        loop
            insert into public.evd_player_item_stocks (user_id, account_name, name, item_code, quantity, is_set, updated_at)
            values (p_user_id, p_account_name, (select c.name from public.evd_item_catalog c where c.code = v_return_item.item_code), v_return_item.item_code, v_return_item.quantity, false, now())
            on conflict (user_id, item_code) do update
            set quantity = public.evd_player_item_stocks.quantity + excluded.quantity,
                account_name = excluded.account_name,
                name = excluded.name,
                updated_at = now();
        end loop;
    end if;

    return v_carried_items;
end;
$$;

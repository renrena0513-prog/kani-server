create or replace function public.evd_finish_run(
    p_run_id uuid,
    p_user_id text,
    p_status text,
    p_reason text
)
returns jsonb
language plpgsql
as $$
declare
    v_run public.evd_game_runs%rowtype;
    v_payout integer;
    v_flags jsonb;
    v_carried_items jsonb;
    v_items jsonb;
    v_return_item record;
    v_wallet_bonus numeric(8, 2) := 0.0;
    v_base_death_rate numeric(8, 2) := 0.0;
    v_death_return_rate numeric(8, 2) := 0.0;
    v_has_coffin boolean := false;
    v_revive_hp integer := 1;
begin
    select * into v_run from public.evd_game_runs where id = p_run_id and user_id = p_user_id for update;
    if not found then
        raise exception 'ランが見つかりません';
    end if;

    if p_status = '死亡'
       and greatest(
            coalesce((v_run.inventory_state -> 'items' -> 'revival_charm' ->> 'quantity')::integer, 0),
            coalesce((v_run.inventory_state -> 'carried_items' -> 'revival_charm' ->> 'quantity')::integer, 0)
       ) > 0 then
        select coalesce((effect_data ->> 'revive_hp')::integer, 1)
          into v_revive_hp
          from public.evd_item_catalog
         where code = 'revival_charm';

        update public.evd_game_runs
           set life = greatest(v_revive_hp, 1),
               inventory_state = public.evd_remove_bucket_item(
                    public.evd_remove_item(inventory_state, 'revival_charm', 1),
                    'carried_items',
                    'revival_charm',
                    1
               ),
               updated_at = now(),
               last_active_at = now(),
               version = version + 1
         where id = p_run_id;

        perform public.evd_add_log(
            p_run_id,
            p_user_id,
            v_run.account_name,
            v_run.current_floor,
            '自動発動',
            format('復活の護符が砕け、ライフ %s で復活した。', greatest(v_revive_hp, 1)),
            jsonb_build_object('effect', 'revive_on_death', 'item_code', 'revival_charm')
        );

        return public.evd_build_snapshot(p_run_id, p_user_id);
    end if;

    v_flags := coalesce(v_run.inventory_state -> 'flags', '{}'::jsonb);
    v_items := coalesce(v_run.inventory_state -> 'items', '{}'::jsonb);
    if p_status = '帰還' then
        v_payout := floor(
            (v_run.run_coins + v_run.secured_coins)
            * v_run.final_return_multiplier
            * case when coalesce((v_flags ->> 'golden_contract_active')::boolean, false) then 2 else 1 end
        )::integer;
    else
        select least(coalesce(sum(st.quantity), 0), 5) * 0.02
          into v_wallet_bonus
          from public.evd_player_item_stocks st
          join public.evd_item_catalog c
            on c.code = st.item_code
         where st.user_id = p_user_id
           and st.quantity > 0
           and c.is_active = true
           and c.effect_data ->> 'effect' = 'relic_death_coin_keep_plus_2pct';

        select exists (
            select 1
              from public.evd_player_item_stocks st
              join public.evd_item_catalog c on c.code = st.item_code
             where st.user_id = p_user_id
               and st.quantity > 0
               and c.is_active = true
               and c.effect_data ->> 'effect' = 'relic_keep_unused_manual_on_death'
        )
          into v_has_coffin;

        if coalesce((v_run.inventory_state -> 'carried_items' -> 'vault_box' ->> 'quantity')::integer, 0) > 0 then
            v_base_death_rate := 0.80;
        elsif coalesce((v_flags ->> 'insurance_active')::boolean, false) then
            v_base_death_rate := 0.50;
            v_flags := jsonb_set(v_flags, array['insurance_active'], 'false'::jsonb, true);
            v_run.inventory_state := jsonb_set(v_run.inventory_state, array['flags'], v_flags, true);
        end if;

        v_death_return_rate := least(1.0, coalesce(v_base_death_rate, 0) + coalesce(v_wallet_bonus, 0));
        v_payout := v_run.secured_coins + floor(v_run.run_coins * v_death_return_rate)::integer;
    end if;

    v_carried_items := coalesce(v_run.inventory_state -> 'carried_items', '{}'::jsonb);

    if p_status = '死亡' then
        if coalesce((v_run.inventory_state -> 'carried_items' -> 'substitute_doll' ->> 'quantity')::integer, 0) > 0
           and v_run.substitute_negates_remaining < 3 then
            v_carried_items := public.evd_remove_bucket_item(jsonb_build_object('carried_items', v_carried_items), 'carried_items', 'substitute_doll', 1) -> 'carried_items';
        end if;

        if coalesce((v_run.inventory_state -> 'carried_items' -> 'insurance_token' ->> 'quantity')::integer, 0) > 0
           and not coalesce((v_flags ->> 'insurance_active')::boolean, false) then
            v_carried_items := public.evd_remove_bucket_item(jsonb_build_object('carried_items', v_carried_items), 'carried_items', 'insurance_token', 1) -> 'carried_items';
        end if;

        v_run.inventory_state := jsonb_set(v_run.inventory_state, array['carried_items'], v_carried_items, true);
    end if;

    if p_status = '帰還' then
        for v_return_item in
            select
                e.key as item_code,
                coalesce((e.value ->> 'quantity')::integer, 0) as quantity
              from jsonb_each(v_items) e
              join public.evd_item_catalog c on c.code = e.key
             where coalesce((e.value ->> 'quantity')::integer, 0) > 0
               and c.item_kind in ('手動', '死亡時', '永続')
        loop
            insert into public.evd_player_item_stocks (user_id, account_name, name, item_code, quantity, is_set, updated_at)
            values (
                p_user_id,
                v_run.account_name,
                (select c.name from public.evd_item_catalog c where c.code = v_return_item.item_code),
                v_return_item.item_code,
                v_return_item.quantity,
                false,
                now()
            )
            on conflict (user_id, item_code) do update
            set quantity = public.evd_player_item_stocks.quantity + excluded.quantity,
                account_name = excluded.account_name,
                name = excluded.name,
                updated_at = now();
        end loop;

        for v_return_item in
            select
                e.key as item_code,
                coalesce((e.value ->> 'quantity')::integer, 0) as quantity
              from jsonb_each(v_carried_items) e
              join public.evd_item_catalog c on c.code = e.key
             where coalesce((e.value ->> 'quantity')::integer, 0) > 0
               and c.item_kind in ('死亡時', '永続')
        loop
            insert into public.evd_player_item_stocks (user_id, account_name, name, item_code, quantity, is_set, updated_at)
            values (
                p_user_id,
                v_run.account_name,
                (select c.name from public.evd_item_catalog c where c.code = v_return_item.item_code),
                v_return_item.item_code,
                v_return_item.quantity,
                false,
                now()
            )
            on conflict (user_id, item_code) do update
            set quantity = public.evd_player_item_stocks.quantity + excluded.quantity,
                account_name = excluded.account_name,
                name = excluded.name,
                updated_at = now();
        end loop;
    else
        if v_has_coffin then
            for v_return_item in
                select
                    e.key as item_code,
                    coalesce((e.value ->> 'quantity')::integer, 0) as quantity
                  from jsonb_each(v_items) e
                  join public.evd_item_catalog c on c.code = e.key
                 where coalesce((e.value ->> 'quantity')::integer, 0) > 0
                   and c.item_kind = '手動'
            loop
                insert into public.evd_player_item_stocks (user_id, account_name, name, item_code, quantity, is_set, updated_at)
                values (
                    p_user_id,
                    v_run.account_name,
                    (select c.name from public.evd_item_catalog c where c.code = v_return_item.item_code),
                    v_return_item.item_code,
                    v_return_item.quantity,
                    false,
                    now()
                )
                on conflict (user_id, item_code) do update
                set quantity = public.evd_player_item_stocks.quantity + excluded.quantity,
                    account_name = excluded.account_name,
                    name = excluded.name,
                    updated_at = now();
            end loop;
        end if;

        for v_return_item in
            select
                e.key as item_code,
                coalesce((e.value ->> 'quantity')::integer, 0) as quantity
              from jsonb_each(v_items) e
              join public.evd_item_catalog c on c.code = e.key
             where coalesce((e.value ->> 'quantity')::integer, 0) > 0
               and c.item_kind = '永続'
        loop
            insert into public.evd_player_item_stocks (user_id, account_name, name, item_code, quantity, is_set, updated_at)
            values (
                p_user_id,
                v_run.account_name,
                (select c.name from public.evd_item_catalog c where c.code = v_return_item.item_code),
                v_return_item.item_code,
                v_return_item.quantity,
                false,
                now()
            )
            on conflict (user_id, item_code) do update
            set quantity = public.evd_player_item_stocks.quantity + excluded.quantity,
                account_name = excluded.account_name,
                name = excluded.name,
                updated_at = now();
        end loop;

        for v_return_item in
            select
                e.key as item_code,
                coalesce((e.value ->> 'quantity')::integer, 0) as quantity
              from jsonb_each(v_carried_items) e
              join public.evd_item_catalog c on c.code = e.key
             where coalesce((e.value ->> 'quantity')::integer, 0) > 0
               and c.item_kind = '永続'
        loop
            insert into public.evd_player_item_stocks (user_id, account_name, name, item_code, quantity, is_set, updated_at)
            values (
                p_user_id,
                v_run.account_name,
                (select c.name from public.evd_item_catalog c where c.code = v_return_item.item_code),
                v_return_item.item_code,
                v_return_item.quantity,
                false,
                now()
            )
            on conflict (user_id, item_code) do update
            set quantity = public.evd_player_item_stocks.quantity + excluded.quantity,
                account_name = excluded.account_name,
                name = excluded.name,
                updated_at = now();
        end loop;
    end if;

    update public.evd_game_runs
       set status = p_status,
           death_reason = p_reason,
           result_payout = greatest(v_payout, 0),
           inventory_state = v_run.inventory_state,
           ended_at = now(),
           updated_at = now(),
           last_active_at = now(),
           version = version + 1
     where id = p_run_id;

    update public.profiles
       set coins = coalesce(coins, 0) + greatest(v_payout, 0),
           total_assets = coalesce(total_assets, 0) + greatest(v_payout, 0)
     where discord_user_id = p_user_id;

    perform public.evd_add_log(
        p_run_id,
        p_user_id,
        v_run.account_name,
        v_run.current_floor,
        case when p_status = '帰還' then '帰還' else '死亡' end,
        case when p_status = '帰還'
             then format('無事に帰還して %s コイン持ち帰った。', v_payout)
             else format('%s。%s コインを持ち帰った。', p_reason, v_payout)
        end,
        jsonb_build_object('payout', v_payout)
    );

    return public.evd_build_snapshot(p_run_id, p_user_id);
end;
$$;

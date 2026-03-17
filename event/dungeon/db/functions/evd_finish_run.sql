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
    v_return_item record;
begin
    select * into v_run from public.evd_game_runs where id = p_run_id and user_id = p_user_id for update;
    if not found then
        raise exception 'ランが見つかりません';
    end if;

    v_flags := coalesce(v_run.inventory_state -> 'flags', '{}'::jsonb);
    if p_status = '帰還' then
        v_payout := floor(
            (v_run.run_coins + v_run.secured_coins)
            * v_run.final_return_multiplier
            * case when coalesce((v_flags ->> 'golden_contract_active')::boolean, false) then 2 else 1 end
        )::integer;
    elsif coalesce((v_flags ->> 'insurance_active')::boolean, false) then
        v_payout := v_run.secured_coins + floor(v_run.run_coins / 2.0)::integer;
        v_flags := jsonb_set(v_flags, array['insurance_active'], 'false'::jsonb, true);
        v_run.inventory_state := jsonb_set(v_run.inventory_state, array['flags'], v_flags, true);
    else
        v_payout := v_run.secured_coins;
    end if;

    if p_status = '死亡' then
        v_carried_items := coalesce(v_run.inventory_state -> 'carried_items', '{}'::jsonb);

        if coalesce((v_run.inventory_state -> 'carried_items' -> 'substitute_doll' ->> 'quantity')::integer, 0) > 0
           and v_run.substitute_negates_remaining < 3 then
            v_carried_items := public.evd_remove_bucket_item(jsonb_build_object('carried_items', v_carried_items), 'carried_items', 'substitute_doll', 1) -> 'carried_items';
        end if;

        if coalesce((v_run.inventory_state -> 'carried_items' -> 'insurance_token' ->> 'quantity')::integer, 0) > 0
           and not coalesce((v_flags ->> 'insurance_active')::boolean, false) then
            v_carried_items := public.evd_remove_bucket_item(jsonb_build_object('carried_items', v_carried_items), 'carried_items', 'insurance_token', 1) -> 'carried_items';
        end if;

        for v_return_item in
            select key as item_code, coalesce((value ->> 'quantity')::integer, 0) as quantity
              from jsonb_each(v_carried_items)
             where coalesce((value ->> 'quantity')::integer, 0) > 0
        loop
            insert into public.evd_player_item_stocks (user_id, account_name, item_code, quantity, updated_at)
            values (p_user_id, v_run.account_name, v_return_item.item_code, v_return_item.quantity, now())
            on conflict (user_id, item_code) do update
            set quantity = public.evd_player_item_stocks.quantity + excluded.quantity,
                account_name = excluded.account_name,
                updated_at = now();
        end loop;

        v_run.inventory_state := jsonb_set(v_run.inventory_state, array['carried_items'], v_carried_items, true);
        v_run.gacha_tickets_gained := 0;
        v_run.mangan_tickets_gained := 0;
    end if;

    update public.evd_game_runs
       set status = p_status,
           death_reason = p_reason,
           result_payout = greatest(v_payout, 0),
           inventory_state = v_run.inventory_state,
           gacha_tickets_gained = v_run.gacha_tickets_gained,
           mangan_tickets_gained = v_run.mangan_tickets_gained,
           ended_at = now(),
           updated_at = now(),
           last_active_at = now(),
           version = version + 1
     where id = p_run_id;

    update public.profiles
       set coins = coalesce(coins, 0) + greatest(v_payout, 0),
           total_assets = coalesce(total_assets, 0) + greatest(v_payout, 0),
           gacha_tickets = coalesce(gacha_tickets, 0) + case when p_status = '帰還' then coalesce(v_run.gacha_tickets_gained, 0) else 0 end,
           mangan_tickets = coalesce(mangan_tickets, 0) + case when p_status = '帰還' then coalesce(v_run.mangan_tickets_gained, 0) else 0 end
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

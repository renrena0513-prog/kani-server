create or replace function public.evd_claim_altar_reward(p_run_id uuid, p_item_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id text := public.evd_current_user_id();
    v_run public.evd_game_runs%rowtype;
    v_pending jsonb;
    v_offer jsonb;
    v_item record;
begin
    if v_user_id = '' then
        raise exception 'ログインが必要です';
    end if;

    perform pg_advisory_xact_lock(hashtext('evd:' || v_user_id));

    select * into v_run
      from public.evd_game_runs
     where id = p_run_id
       and user_id = v_user_id
       and status = '進行中'
     for update;
    if not found then
        raise exception '進行中のランが見つかりません';
    end if;

    v_pending := coalesce(v_run.inventory_state -> 'pending_altar_reward', 'null'::jsonb);
    if v_pending = 'null'::jsonb then
        raise exception '受け取れる祭壇報酬がありません';
    end if;

    select value
      into v_offer
      from jsonb_array_elements(coalesce(v_pending -> 'offers', '[]'::jsonb)) value
     where value ->> 'code' = p_item_code
     limit 1;

    if v_offer is null then
        raise exception '提示されたレリックから選択してください';
    end if;

    select code, name
      into v_item
      from public.evd_item_catalog
     where code = p_item_code
       and is_active = true
       and shop_pool = 'レリック';

    if not found then
        raise exception '受け取れないレリックです';
    end if;

    insert into public.evd_player_item_stocks (user_id, account_name, name, item_code, quantity, is_set, updated_at)
    values (v_user_id, v_run.account_name, v_item.name, p_item_code, 1, false, now())
    on conflict (user_id, item_code) do update
    set quantity = public.evd_player_item_stocks.quantity + 1,
        account_name = excluded.account_name,
        name = excluded.name,
        updated_at = now();

    update public.evd_game_runs
       set inventory_state = inventory_state - 'pending_altar_reward'
     where id = p_run_id;

    perform public.evd_add_log(
        p_run_id,
        v_user_id,
        v_run.account_name,
        v_run.current_floor,
        '祭壇報酬',
        format('深部の祭壇から %s を授かった。', v_item.name),
        jsonb_build_object('item_code', p_item_code, 'item_name', v_item.name)
    );

    return public.evd_finish_run(p_run_id, v_user_id, '帰還', '深部の祭壇から帰還');
end;
$$;

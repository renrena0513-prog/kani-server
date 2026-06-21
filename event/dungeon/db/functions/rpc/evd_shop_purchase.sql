create or replace function public.evd_shop_purchase(p_run_id uuid, p_item_code text)
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
    v_price integer;
begin
    perform pg_advisory_xact_lock(hashtext('evd:' || v_user_id));

    select * into v_run from public.evd_game_runs where id = p_run_id and user_id = v_user_id and status = '進行中' for update;
    if not found then
        raise exception '進行中のランが見つかりません';
    end if;

    v_pending := v_run.inventory_state -> 'pending_shop';
    if v_pending is null or v_pending = 'null'::jsonb then
        raise exception '利用できるショップがありません';
    end if;

    if p_item_code is null then
        update public.evd_game_runs
           set inventory_state = jsonb_set(inventory_state, array['pending_shop'], 'null'::jsonb, true),
               updated_at = now(),
               last_active_at = now(),
               version = version + 1
         where id = p_run_id;
        perform public.evd_add_log(p_run_id, v_user_id, v_run.account_name, v_run.current_floor, 'ショップ購入', '何も買わず立ち去った。');
        return public.evd_build_snapshot(p_run_id, v_user_id);
    end if;

    select item
      into v_offer
      from jsonb_array_elements(v_pending -> 'offers') as item
     where item ->> 'code' = p_item_code
     limit 1;

    if v_offer is null then
        raise exception 'その商品はありません';
    end if;

    v_price := (v_offer ->> 'price')::integer;
    if v_run.run_coins < v_price then
        raise exception 'コインが足りません';
    end if;

    update public.evd_game_runs
       set run_coins = run_coins - v_price,
           inventory_state = jsonb_set(inventory_state, array['pending_shop'], 'null'::jsonb, true),
           updated_at = now(),
           last_active_at = now(),
           version = version + 1
     where id = p_run_id;

    update public.evd_game_runs
       set inventory_state = public.evd_dispatch_apply_granted_item(inventory_state, p_item_code)
     where id = p_run_id;

    perform public.evd_add_log(
        p_run_id,
        v_user_id,
        v_run.account_name,
        v_run.current_floor,
        case when coalesce(v_pending ->> 'shop_type', 'ショップ') = '限定ショップ' then '限定ショップ購入' else 'ショップ購入' end,
        format('%s を %s コインで購入した。', v_offer ->> 'name', v_price),
        jsonb_build_object('item_code', p_item_code, 'price', v_price)
    );

    return public.evd_build_snapshot(p_run_id, v_user_id);
end;
$$;

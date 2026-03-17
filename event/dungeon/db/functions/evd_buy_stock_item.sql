create or replace function public.evd_buy_stock_item(p_item_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id text := public.evd_current_user_id();
    v_profile record;
    v_item record;
    v_stock integer := 0;
    v_stocks jsonb;
begin
    if v_user_id = '' then
        raise exception 'ログインが必要です';
    end if;

    perform pg_advisory_xact_lock(hashtext('evd:' || v_user_id));

    select coins, total_assets, gacha_tickets, mangan_tickets, account_name
      into v_profile
      from public.profiles
     where discord_user_id = v_user_id
     for update;

    if not found then
        raise exception 'プロフィールが見つかりません';
    end if;

    select code, name, description, base_price, max_stack, shop_pool, is_active
      into v_item
      from public.evd_item_catalog
     where code = p_item_code;

    if not found or not v_item.is_active or v_item.shop_pool not in ('通常', '両方', 'レリック') then
        raise exception '購入できないアイテムです';
    end if;

    select quantity
      into v_stock
      from public.evd_player_item_stocks
     where user_id = v_user_id
       and item_code = p_item_code;

    v_stock := coalesce(v_stock, 0);
    if v_stock >= v_item.max_stack then
        raise exception 'これ以上は持てません';
    end if;

    if coalesce(v_profile.coins, 0) < v_item.base_price then
        raise exception 'コインが足りません';
    end if;

    update public.profiles
       set coins = coins - v_item.base_price
     where discord_user_id = v_user_id;

    insert into public.evd_player_item_stocks (user_id, account_name, name, item_code, quantity, is_set, updated_at)
    values (v_user_id, v_profile.account_name, v_item.name, p_item_code, 1, false, now())
    on conflict (user_id, item_code) do update
    set quantity = public.evd_player_item_stocks.quantity + 1,
        account_name = excluded.account_name,
        name = excluded.name,
        updated_at = now();

    select coins, total_assets, gacha_tickets, mangan_tickets, account_name
      into v_profile
      from public.profiles
     where discord_user_id = v_user_id;

    select coalesce(jsonb_agg(to_jsonb(s) order by sort_order), '[]'::jsonb)
      into v_stocks
      from (
        select
            st.item_code,
            st.is_set,
            st.quantity,
            st.updated_at,
            jsonb_build_object(
                'name', c.name,
                'description', c.description,
                'item_kind', c.item_kind,
                'base_price', c.base_price,
                'carry_in_allowed', c.carry_in_allowed,
                'shop_pool', c.shop_pool,
                'sort_order', c.sort_order
            ) as evd_item_catalog,
            c.sort_order
        from public.evd_player_item_stocks st
        join public.evd_item_catalog c on c.code = st.item_code
        where st.user_id = v_user_id
          and st.quantity > 0
      ) s;

    return jsonb_build_object(
        'message', format('%s を購入して在庫に追加した。', v_item.name),
        'profile', to_jsonb(v_profile),
        'stocks', v_stocks
    );
end;
$$;

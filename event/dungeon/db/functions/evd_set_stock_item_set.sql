create or replace function public.evd_set_stock_item_set(p_item_code text, p_is_set boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id text := public.evd_current_user_id();
    v_profile record;
    v_item record;
    v_stocks jsonb;
begin
    if v_user_id = '' then
        raise exception 'ログインが必要です';
    end if;

    perform pg_advisory_xact_lock(hashtext('evd:' || v_user_id));

    select account_name
      into v_profile
      from public.profiles
     where discord_user_id = v_user_id;

    if not found then
        raise exception 'プロフィールが見つかりません';
    end if;

    select code, name, carry_in_allowed, is_active
      into v_item
      from public.evd_item_catalog
     where code = p_item_code;

    if not found or not v_item.is_active then
        raise exception '対象アイテムが見つかりません';
    end if;

    if not coalesce(v_item.carry_in_allowed, false) then
        raise exception '持ち込み設定できないアイテムです';
    end if;

    update public.evd_player_item_stocks
       set is_set = p_is_set,
           account_name = v_profile.account_name,
           updated_at = now()
     where user_id = v_user_id
       and item_code = p_item_code
       and quantity > 0;

    if not found then
        raise exception '在庫がありません';
    end if;

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
                'sort_order', c.sort_order,
                'rarity', c.rarity
            ) as evd_item_catalog,
            c.sort_order
        from public.evd_player_item_stocks st
        join public.evd_item_catalog c on c.code = st.item_code
        where st.user_id = v_user_id
          and st.quantity > 0
      ) s;

    return jsonb_build_object(
        'stocks', v_stocks
    );
end;
$$;

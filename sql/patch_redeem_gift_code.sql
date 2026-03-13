create or replace function public.redeem_gift_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
DECLARE
    v_user_id text;
    v_norm text;
    v_code public.gift_codes%rowtype;
    v_account_name text;
    v_badge_name text;
    v_badge_image text;
BEGIN
    v_user_id := auth.jwt() -> 'user_metadata' ->> 'provider_id';
    if v_user_id is null or v_user_id = '' then
        return jsonb_build_object('ok', false, 'error', 'not_authenticated');
    end if;

    select account_name into v_account_name
    from public.profiles
    where discord_user_id = v_user_id
    limit 1;

    v_norm := public.normalize_gift_code(p_code);

    select * into v_code
    from public.gift_codes
    where code_norm = v_norm
      and is_active = true
    limit 1;

    if not found then
        return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;

    if exists (select 1 from public.gift_code_allowed_users where gift_code_id = v_code.id) then
        if not exists (
            select 1 from public.gift_code_allowed_users
            where gift_code_id = v_code.id and discord_user_id = v_user_id
        ) then
            return jsonb_build_object('ok', false, 'error', 'not_eligible');
        end if;
    end if;

    if v_code.remaining_uses is not null and v_code.remaining_uses <= 0 then
        return jsonb_build_object('ok', false, 'error', 'exhausted');
    end if;

    begin
        insert into public.gift_code_redemptions
            (gift_code_id, discord_user_id, account_name, coin, kiganfu, manganfu, badge_id)
        values
            (v_code.id, v_user_id, v_account_name, v_code.coin, v_code.kiganfu, v_code.manganfu, v_code.badge_id);
    exception when unique_violation then
        return jsonb_build_object('ok', false, 'error', 'already_redeemed');
    end;

    if v_code.remaining_uses is not null then
        update public.gift_codes
        set remaining_uses = remaining_uses - 1
        where id = v_code.id;
    end if;

    update public.profiles
    set
        coins = coins + v_code.coin,
        total_assets = total_assets + v_code.coin,
        gacha_tickets = coalesce(gacha_tickets, 0) + v_code.kiganfu,
        mangan_tickets = coalesce(mangan_tickets, 0) + v_code.manganfu
    where discord_user_id = v_user_id;

    if v_code.badge_id is not null then
        insert into public.user_badges_new (user_id, badge_id, purchased_price)
        values (v_user_id, v_code.badge_id, 0);

        select name, image_url into v_badge_name, v_badge_image
        from public.badges
        where id = v_code.badge_id;
    end if;

    return jsonb_build_object(
        'ok', true,
        'coin', v_code.coin,
        'kiganfu', v_code.kiganfu,
        'manganfu', v_code.manganfu,
        'badge_id', v_code.badge_id,
        'badge_name', v_badge_name,
        'badge_image', v_badge_image
    );
END;
$$;

grant execute on function public.redeem_gift_code(text) to authenticated;

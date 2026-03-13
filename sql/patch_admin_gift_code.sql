create or replace function public.admin_create_gift_code(
    p_code_raw text,
    p_coin integer,
    p_kiganfu integer,
    p_manganfu integer,
    p_is_active boolean,
    p_remaining_uses integer default null,
    p_allowed_user_ids text[] default null,
    p_badge_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
DECLARE
    v_norm text;
    v_id uuid;
    v_uid text;
BEGIN
    if not public.is_admin() then
        return jsonb_build_object('ok', false, 'error', 'not_admin');
    end if;

    v_norm := public.normalize_gift_code(p_code_raw);

    begin
        insert into public.gift_codes
            (code_raw, code_norm, coin, kiganfu, manganfu, badge_id, is_active, remaining_uses)
        values
            (p_code_raw, v_norm, coalesce(p_coin, 0), coalesce(p_kiganfu, 0), coalesce(p_manganfu, 0), p_badge_id, coalesce(p_is_active, true), p_remaining_uses)
        returning id into v_id;
    exception when unique_violation then
        return jsonb_build_object('ok', false, 'error', 'duplicate');
    end;

    if p_allowed_user_ids is not null and array_length(p_allowed_user_ids, 1) > 0 then
        foreach v_uid in array p_allowed_user_ids loop
            insert into public.gift_code_allowed_users (gift_code_id, discord_user_id)
            values (v_id, v_uid);
        end loop;
    end if;

    return jsonb_build_object('ok', true, 'id', v_id, 'code_norm', v_norm);
END;
$$;

create or replace function public.admin_update_gift_code(
    p_id uuid,
    p_coin integer,
    p_kiganfu integer,
    p_manganfu integer,
    p_is_active boolean,
    p_remaining_uses integer default null,
    p_allowed_user_ids text[] default null,
    p_badge_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
DECLARE
    v_updated integer;
    v_uid text;
BEGIN
    if not public.is_admin() then
        return jsonb_build_object('ok', false, 'error', 'not_admin');
    end if;

    update public.gift_codes
    set
        coin = coalesce(p_coin, 0),
        kiganfu = coalesce(p_kiganfu, 0),
        manganfu = coalesce(p_manganfu, 0),
        badge_id = p_badge_id,
        is_active = coalesce(p_is_active, true),
        remaining_uses = p_remaining_uses
    where id = p_id;

    get diagnostics v_updated = row_count;
    if v_updated = 0 then
        return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;

    delete from public.gift_code_allowed_users where gift_code_id = p_id;
    if p_allowed_user_ids is not null and array_length(p_allowed_user_ids, 1) > 0 then
        foreach v_uid in array p_allowed_user_ids loop
            insert into public.gift_code_allowed_users (gift_code_id, discord_user_id)
            values (p_id, v_uid);
        end loop;
    end if;

    return jsonb_build_object('ok', true);
END;
$$;

grant execute on function public.admin_create_gift_code(text, integer, integer, integer, boolean, integer, text[], uuid) to authenticated;
grant execute on function public.admin_update_gift_code(uuid, integer, integer, integer, boolean, integer, text[], uuid) to authenticated;

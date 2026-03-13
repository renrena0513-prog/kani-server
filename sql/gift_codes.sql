-- ギフトコード機能
create extension if not exists pgcrypto;

create table if not exists public.gift_codes (
    id uuid primary key default gen_random_uuid(),
    code_raw text not null,
    code_norm text not null unique,
    coin integer not null default 0,
    kiganfu integer not null default 0,
    manganfu integer not null default 0,
    badge_id uuid references public.badges(id) on delete set null,
    remaining_uses integer,          -- NULL=無制限, 0=使用不可
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

create table if not exists public.gift_code_allowed_users (
    id uuid primary key default gen_random_uuid(),
    gift_code_id uuid not null references public.gift_codes(id) on delete cascade,
    discord_user_id text not null,
    unique (gift_code_id, discord_user_id)
);

create table if not exists public.gift_code_redemptions (
    id uuid primary key default gen_random_uuid(),
    gift_code_id uuid not null references public.gift_codes(id) on delete cascade,
    discord_user_id text not null,
    account_name text,
    redeemed_at timestamptz not null default now(),
    coin integer not null default 0,
    kiganfu integer not null default 0,
    manganfu integer not null default 0,
    badge_id uuid,
    unique (gift_code_id, discord_user_id)
);

create or replace function public.normalize_gift_code(p_input text)
returns text
language plpgsql
immutable
as $$
DECLARE
    v text := coalesce(p_input, '');
BEGIN
    v := regexp_replace(v, '\s+', '', 'g');
    v := lower(v);
    v := translate(
        v,
        'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロヮワヰヱヲンヴヵヶ',
        'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろゎわゐゑをんゔゕゖ'
    );
    return v;
END;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
    select (auth.jwt() -> 'user_metadata' ->> 'provider_id') = any(
        array['666909228300107797', '1184908452959621233']
    );
$$;

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

    -- profilesからaccount_nameを取得
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

    -- ユーザー制限チェック
    if exists (select 1 from public.gift_code_allowed_users where gift_code_id = v_code.id) then
        if not exists (
            select 1 from public.gift_code_allowed_users
            where gift_code_id = v_code.id and discord_user_id = v_user_id
        ) then
            return jsonb_build_object('ok', false, 'error', 'not_eligible');
        end if;
    end if;

    -- 残回数チェック（NULLなら無制限、0なら使用不可）
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

    -- 残回数をデクリメント（NULLの場合はそのまま）
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

    -- バッジ付与
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

    -- 許可ユーザーの登録
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

    -- 許可ユーザーの更新（全削除→再登録）
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

alter table public.gift_codes enable row level security;
alter table public.gift_code_redemptions enable row level security;
alter table public.gift_code_allowed_users enable row level security;

create policy "gift_codes_select_all"
    on public.gift_codes for select
    using (true);

create policy "gift_codes_admin_insert"
    on public.gift_codes for insert
    with check (public.is_admin());

create policy "gift_codes_admin_update"
    on public.gift_codes for update
    using (public.is_admin())
    with check (public.is_admin());

create policy "gift_code_redemptions_select_own"
    on public.gift_code_redemptions for select
    using (discord_user_id = (auth.jwt() -> 'user_metadata' ->> 'provider_id'));

create policy "gift_code_redemptions_insert_own"
    on public.gift_code_redemptions for insert
    with check (discord_user_id = (auth.jwt() -> 'user_metadata' ->> 'provider_id'));

create policy "gift_code_allowed_users_select"
    on public.gift_code_allowed_users for select
    using (true);

create policy "gift_code_allowed_users_admin_insert"
    on public.gift_code_allowed_users for insert
    with check (public.is_admin());

create policy "gift_code_allowed_users_admin_delete"
    on public.gift_code_allowed_users for delete
    using (public.is_admin());

grant select on public.gift_codes to anon, authenticated;
grant select on public.gift_code_redemptions to authenticated;
grant select on public.gift_code_allowed_users to authenticated;

grant execute on function public.normalize_gift_code(text) to authenticated;
grant execute on function public.redeem_gift_code(text) to authenticated;
grant execute on function public.admin_create_gift_code(text, integer, integer, integer, boolean, integer, text[], uuid) to authenticated;
grant execute on function public.admin_update_gift_code(uuid, integer, integer, integer, boolean, integer, text[], uuid) to authenticated;

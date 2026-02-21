-- バッジ交換所機能

-- 交換レシピ
create table if not exists public.badge_exchanges (
    id uuid primary key default gen_random_uuid(),
    reward_badge_id uuid not null references public.badges(id) on delete cascade,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
);

-- 交換に必要な素材バッジ（1レシピに複数行）
create table if not exists public.badge_exchange_materials (
    id uuid primary key default gen_random_uuid(),
    exchange_id uuid not null references public.badge_exchanges(id) on delete cascade,
    badge_id uuid references public.badges(id) on delete cascade,
    material_type text not null default 'badge',
    quantity integer not null default 1
);

-- 既存データ移行用（既に存在する場合のみ）
alter table public.badge_exchange_materials
    add column if not exists material_type text not null default 'badge';

alter table public.badge_exchange_materials
    alter column badge_id drop not null;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'badge_exchange_materials_type_check'
    ) then
        alter table public.badge_exchange_materials
            add constraint badge_exchange_materials_type_check
            check (
                (material_type = 'badge' and badge_id is not null) or
                (material_type in ('coins', 'gacha_tickets', 'mangan_tickets') and badge_id is null)
            );
    end if;
end $$;

-- 交換履歴
create table if not exists public.badge_exchange_logs (
    id uuid primary key default gen_random_uuid(),
    exchange_id uuid not null references public.badge_exchanges(id) on delete cascade,
    discord_user_id text not null,
    exchanged_at timestamptz not null default now()
);

-- ===== ファンクション =====

-- 交換実行
create or replace function public.execute_badge_exchange(p_exchange_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
DECLARE
    v_user_id text;
    v_exchange public.badge_exchanges%rowtype;
    v_mat record;
    v_owned_count integer;
    v_missing jsonb := '[]'::jsonb;
    v_has_missing boolean := false;
    v_delete_uuids uuid[];
    v_row record;
    v_reward_uuid uuid;
    v_is_mutant boolean;
    v_reward_name text;
    v_reward_image text;
    v_coins integer;
    v_gacha integer;
    v_mangan integer;
BEGIN
    -- 認証チェック
    v_user_id := auth.jwt() -> 'user_metadata' ->> 'provider_id';
    if v_user_id is null or v_user_id = '' then
        return jsonb_build_object('ok', false, 'error', 'not_authenticated');
    end if;

    select
        coalesce(coins, 0),
        coalesce(gacha_tickets, 0),
        coalesce(mangan_tickets, 0)
    into v_coins, v_gacha, v_mangan
    from public.profiles
    where discord_user_id = v_user_id;
    if not found then
        v_coins := 0;
        v_gacha := 0;
        v_mangan := 0;
    end if;

    -- レシピ取得
    select * into v_exchange
    from public.badge_exchanges
    where id = p_exchange_id and is_active = true;

    if not found then
        return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;

    -- 素材チェック：各素材の所持数を確認
    for v_mat in
        select bem.badge_id, bem.quantity, bem.material_type, b.name as badge_name, b.image_url
        from public.badge_exchange_materials bem
        left join public.badges b on b.id = bem.badge_id
        where bem.exchange_id = p_exchange_id
    loop
        if v_mat.material_type is null or v_mat.material_type = 'badge' then
            select count(*) into v_owned_count
            from public.user_badges_new
            where user_id = v_user_id and badge_id = v_mat.badge_id;

            if v_owned_count < v_mat.quantity then
                v_has_missing := true;
                v_missing := v_missing || jsonb_build_object(
                    'material_type', 'badge',
                    'badge_id', v_mat.badge_id,
                    'badge_name', v_mat.badge_name,
                    'image_url', v_mat.image_url,
                    'required', v_mat.quantity,
                    'owned', v_owned_count
                );
            end if;
        elsif v_mat.material_type = 'coins' then
            if v_coins < v_mat.quantity then
                v_has_missing := true;
                v_missing := v_missing || jsonb_build_object(
                    'material_type', 'coins',
                    'required', v_mat.quantity,
                    'owned', v_coins
                );
            end if;
        elsif v_mat.material_type = 'gacha_tickets' then
            if v_gacha < v_mat.quantity then
                v_has_missing := true;
                v_missing := v_missing || jsonb_build_object(
                    'material_type', 'gacha_tickets',
                    'required', v_mat.quantity,
                    'owned', v_gacha
                );
            end if;
        elsif v_mat.material_type = 'mangan_tickets' then
            if v_mangan < v_mat.quantity then
                v_has_missing := true;
                v_missing := v_missing || jsonb_build_object(
                    'material_type', 'mangan_tickets',
                    'required', v_mat.quantity,
                    'owned', v_mangan
                );
            end if;
        end if;
    end loop;

    if v_has_missing then
        return jsonb_build_object('ok', false, 'error', 'insufficient_materials', 'missing', v_missing);
    end if;

    -- 素材消費：各素材を quantity 分だけ user_badges_new から削除
    for v_mat in
        select badge_id, quantity, material_type
        from public.badge_exchange_materials
        where exchange_id = p_exchange_id
    loop
        if v_mat.material_type is null or v_mat.material_type = 'badge' then
            v_delete_uuids := array[]::uuid[];
            for v_row in
                select uuid from public.user_badges_new
                where user_id = v_user_id and badge_id = v_mat.badge_id
                order by acquired_at asc
                limit v_mat.quantity
            loop
                v_delete_uuids := v_delete_uuids || v_row.uuid;
            end loop;

            delete from public.user_badges_new where uuid = any(v_delete_uuids);
        elsif v_mat.material_type = 'coins' then
            update public.profiles
            set coins = coins - v_mat.quantity
            where discord_user_id = v_user_id;
        elsif v_mat.material_type = 'gacha_tickets' then
            update public.profiles
            set gacha_tickets = coalesce(gacha_tickets, 0) - v_mat.quantity
            where discord_user_id = v_user_id;
        elsif v_mat.material_type = 'mangan_tickets' then
            update public.profiles
            set mangan_tickets = coalesce(mangan_tickets, 0) - v_mat.quantity
            where discord_user_id = v_user_id;
        end if;
    end loop;

    -- ミュータント判定
    v_is_mutant := (random() < 0.03);

    -- 報酬バッジ付与
    insert into public.user_badges_new (user_id, badge_id, acquired_at, is_mutant, purchased_price)
    values (v_user_id, v_exchange.reward_badge_id, now(), v_is_mutant, 0)
    returning uuid into v_reward_uuid;

    -- 報酬バッジ情報取得
    select name, image_url into v_reward_name, v_reward_image
    from public.badges where id = v_exchange.reward_badge_id;

    -- 交換ログ記録
    insert into public.badge_exchange_logs (exchange_id, discord_user_id)
    values (p_exchange_id, v_user_id);

    return jsonb_build_object(
        'ok', true,
        'reward_uuid', v_reward_uuid,
        'reward_name', v_reward_name,
        'reward_image', v_reward_image,
        'is_mutant', v_is_mutant
    );
END;
$$;

-- 管理者：レシピ作成（素材は別途追加）
create or replace function public.admin_create_badge_exchange(
    p_reward_badge_id uuid,
    p_materials jsonb,  -- [{"material_type":"badge","badge_id":"...","quantity":1}, {"material_type":"coins","quantity":100}, ...]
    p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
DECLARE
    v_exchange_id uuid;
    v_mat jsonb;
BEGIN
    if not public.is_admin() then
        return jsonb_build_object('ok', false, 'error', 'not_admin');
    end if;

    -- バッジ存在チェック
    if not exists(select 1 from public.badges where id = p_reward_badge_id) then
        return jsonb_build_object('ok', false, 'error', 'reward_badge_not_found');
    end if;

    -- レシピ作成
    insert into public.badge_exchanges (reward_badge_id, is_active)
    values (p_reward_badge_id, coalesce(p_is_active, true))
    returning id into v_exchange_id;

    -- 素材登録
    for v_mat in select * from jsonb_array_elements(p_materials)
    loop
        insert into public.badge_exchange_materials (exchange_id, badge_id, material_type, quantity)
        values (
            v_exchange_id,
            nullif(v_mat ->> 'badge_id', '')::uuid,
            coalesce(v_mat ->> 'material_type', 'badge'),
            coalesce((v_mat ->> 'quantity')::integer, 1)
        );
    end loop;

    return jsonb_build_object('ok', true, 'id', v_exchange_id);
END;
$$;

-- 管理者：レシピ削除
create or replace function public.admin_delete_badge_exchange(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
BEGIN
    if not public.is_admin() then
        return jsonb_build_object('ok', false, 'error', 'not_admin');
    end if;

    delete from public.badge_exchanges where id = p_id;

    return jsonb_build_object('ok', true);
END;
$$;

-- 管理者：レシピ有効/無効切替
create or replace function public.admin_toggle_badge_exchange(p_id uuid, p_is_active boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
BEGIN
    if not public.is_admin() then
        return jsonb_build_object('ok', false, 'error', 'not_admin');
    end if;

    update public.badge_exchanges set is_active = p_is_active where id = p_id;

    return jsonb_build_object('ok', true);
END;
$$;

-- ===== RLS =====
alter table public.badge_exchanges enable row level security;
alter table public.badge_exchange_materials enable row level security;
alter table public.badge_exchange_logs enable row level security;

drop policy if exists "badge_exchanges_select_all" on public.badge_exchanges;
create policy "badge_exchanges_select_all"
    on public.badge_exchanges for select using (true);

drop policy if exists "badge_exchange_materials_select_all" on public.badge_exchange_materials;
create policy "badge_exchange_materials_select_all"
    on public.badge_exchange_materials for select using (true);

drop policy if exists "badge_exchange_logs_select_own" on public.badge_exchange_logs;
create policy "badge_exchange_logs_select_own"
    on public.badge_exchange_logs for select
    using (discord_user_id = (auth.jwt() -> 'user_metadata' ->> 'provider_id'));

-- ===== 権限 =====
grant select on public.badge_exchanges to anon, authenticated;
grant select on public.badge_exchange_materials to anon, authenticated;
grant select on public.badge_exchange_logs to authenticated;

grant execute on function public.execute_badge_exchange(uuid) to authenticated;
grant execute on function public.admin_create_badge_exchange(uuid, jsonb, boolean) to authenticated;
grant execute on function public.admin_delete_badge_exchange(uuid) to authenticated;
grant execute on function public.admin_toggle_badge_exchange(uuid, boolean) to authenticated;

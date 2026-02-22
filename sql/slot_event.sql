-- Slot event: schema, functions, and seed data

-- =============================
-- 1) Tables
-- =============================

create table if not exists public.slot_event_settings (
    id uuid primary key default gen_random_uuid(),
    is_active boolean not null default false,
    cost integer not null default 100,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.slot_reel_positions (
    id uuid primary key default gen_random_uuid(),
    reel_index integer not null check (reel_index between 1 and 7),
    position_index integer not null check (position_index between 1 and 10),
    is_bust boolean not null default false,
    reward_type text,
    reward_name text,
    reward_id text,
    amount integer default 0,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (reel_index, position_index)
);

create table if not exists public.slot_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id text not null,
    account_name text,
    status text not null default 'active' check (status in ('active', 'bust', 'cashed_out')),
    cost integer not null,
    current_reel integer not null default 1 check (current_reel between 1 and 7),
    bust_reel integer,
    bust_position_id uuid,
    reels_state jsonb not null default '[]'::jsonb,
    payout_summary jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    ended_at timestamptz
);

create table if not exists public.slot_session_results (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null unique references public.slot_sessions(id) on delete cascade,
    user_id text not null,
    account_name text,
    outcome text not null check (outcome in ('bust', 'cashed_out')),
    reward_summary jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now()
);

create unique index if not exists slot_sessions_active_user_uq
    on public.slot_sessions(user_id)
    where status = 'active';

-- 既存テーブルへのカラム追加
alter table public.slot_sessions add column if not exists account_name text;
alter table public.slot_sessions add column if not exists reels_state jsonb default '[]'::jsonb;
alter table public.slot_session_results add column if not exists account_name text;

-- =============================
-- 2) Helper: Secure random
-- =============================

create or replace function public.slot_secure_random()
returns double precision
language sql
volatile
as $$
    select random();
$$;

-- =============================
-- 3) RPC: Get active session state
-- =============================

create or replace function public.slot_get_state(p_user_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_session record;
    v_reels jsonb := '[]'::jsonb;
begin
    select * into v_session
    from public.slot_sessions
    where user_id = p_user_id and status = 'active'
    order by created_at desc
    limit 1;

    if not found then
        return jsonb_build_object('ok', true, 'session', null, 'reels', v_reels);
    end if;

    v_reels := coalesce(v_session.reels_state, '[]'::jsonb);

    return jsonb_build_object(
        'ok', true,
        'session', jsonb_build_object(
            'id', v_session.id,
            'status', v_session.status,
            'cost', v_session.cost,
            'current_reel', v_session.current_reel,
            'created_at', v_session.created_at
        ),
        'reels', v_reels
    );
end;
$$;

-- =============================
-- 4) RPC: Start session (coin consumption + session create)
-- =============================

create or replace function public.slot_start_session(p_user_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_settings record;
    v_session record;
    v_coins integer;
    v_now timestamptz := now();
    v_is_admin boolean := false;
    v_account_name text;
    v_reels jsonb := '[]'::jsonb;
begin
    perform pg_advisory_xact_lock(hashtext('slot:' || p_user_id));

    -- auth.jwt() が取れない場合の保険でID直指定も許可
    select (public.is_admin() or p_user_id = any(array['666909228300107797','1184908452959621233'])) into v_is_admin;

    select * into v_settings
    from public.slot_event_settings
    order by created_at desc
    limit 1;

    if (not found or v_settings.is_active is false) and not v_is_admin then
        return jsonb_build_object('ok', false, 'error', 'EVENT_INACTIVE');
    end if;

    -- 期間制御は不要（ページ管理ON/OFFで制御）

    select * into v_session
    from public.slot_sessions
    where user_id = p_user_id and status = 'active'
    order by created_at desc
    limit 1
    for update;

    if found then
        v_reels := coalesce(v_session.reels_state, '[]'::jsonb);

        return jsonb_build_object(
            'ok', true,
            'session', jsonb_build_object(
                'id', v_session.id,
                'status', v_session.status,
                'cost', v_session.cost,
                'current_reel', v_session.current_reel,
                'created_at', v_session.created_at
            ),
            'reels', v_reels,
            'already_active', true
        );
    end if;

    select coins into v_coins
    from public.profiles
    where discord_user_id = p_user_id
    for update;

    if v_coins is null then
        return jsonb_build_object('ok', false, 'error', 'USER_NOT_FOUND');
    end if;

    if v_coins < v_settings.cost then
        return jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_COINS', 'required', v_settings.cost);
    end if;

    update public.profiles
    set coins = coins - v_settings.cost
    where discord_user_id = p_user_id;

    select account_name into v_account_name
    from public.profiles
    where discord_user_id = p_user_id
    limit 1;

    begin
        insert into public.slot_sessions (user_id, account_name, status, cost, current_reel, reels_state, created_at, updated_at)
        values (p_user_id, v_account_name, 'active', v_settings.cost, 1, '[]'::jsonb, v_now, v_now)
        returning * into v_session;
    exception when unique_violation then
        select * into v_session
        from public.slot_sessions
        where user_id = p_user_id and status = 'active'
        order by created_at desc
        limit 1;
    end;

    return jsonb_build_object(
        'ok', true,
        'session', jsonb_build_object(
            'id', v_session.id,
            'status', v_session.status,
            'cost', v_session.cost,
            'current_reel', v_session.current_reel,
            'created_at', v_session.created_at
        ),
        'reels', v_reels,
        'already_active', false
    );
end;
$$;

-- =============================
-- 5) RPC: Spin reel
-- =============================

create or replace function public.slot_spin_reel(p_user_id text, p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_session record;
    v_reel_index integer;
    v_total_weight integer;
    v_random_val integer;
    v_cumulative integer := 0;
    v_position record;
    v_existing jsonb;
    v_reels jsonb := '[]'::jsonb;
    v_payout jsonb := '[]'::jsonb;
    v_auto_cashout boolean := false;
begin
    perform pg_advisory_xact_lock(hashtext('slot:' || p_user_id));

    select * into v_session
    from public.slot_sessions
    where id = p_session_id and user_id = p_user_id
    for update;

    if not found then
        return jsonb_build_object('ok', false, 'error', 'SESSION_NOT_FOUND');
    end if;

    if v_session.status <> 'active' then
        return jsonb_build_object('ok', false, 'error', 'SESSION_NOT_ACTIVE', 'status', v_session.status);
    end if;

    v_reel_index := v_session.current_reel;

    v_reels := coalesce(v_session.reels_state, '[]'::jsonb);
    select elem into v_existing
    from jsonb_array_elements(v_reels) elem
    where (elem->>'reel_index')::int = v_reel_index
    limit 1;

    if v_existing is not null then
        return jsonb_build_object(
            'ok', true,
            'session', jsonb_build_object(
                'id', v_session.id,
                'status', v_session.status,
                'cost', v_session.cost,
                'current_reel', v_session.current_reel,
                'created_at', v_session.created_at
            ),
            'result', v_existing,
            'reels', v_reels,
            'already_spun', true
        );
    end if;

    select count(*) into v_total_weight
    from public.slot_reel_positions
    where reel_index = v_reel_index and is_active = true;

    if v_total_weight is null or v_total_weight <= 0 then
        return jsonb_build_object('ok', false, 'error', 'NO_REEL_CONFIG');
    end if;

    v_random_val := floor(public.slot_secure_random() * v_total_weight)::int;

    for v_position in
        select *
        from public.slot_reel_positions
        where reel_index = v_reel_index and is_active = true
        order by position_index
    loop
        v_cumulative := v_cumulative + 1;
        if v_random_val < v_cumulative then
            exit;
        end if;
    end loop;

    if v_position.id is null then
        return jsonb_build_object('ok', false, 'error', 'SPIN_FAILED');
    end if;

    v_reels := v_reels || jsonb_build_array(jsonb_build_object(
        'reel_index', v_reel_index,
        'position_id', v_position.id,
        'is_bust', v_position.is_bust,
        'reward_type', v_position.reward_type,
        'reward_name', v_position.reward_name,
        'reward_id', v_position.reward_id,
        'amount', v_position.amount
    ));

    if v_position.is_bust then
        update public.slot_sessions
        set status = 'bust',
            bust_reel = v_reel_index,
            bust_position_id = v_position.id,
            reels_state = v_reels,
            updated_at = now(),
            ended_at = now()
        where id = v_session.id;

        insert into public.slot_session_results (session_id, user_id, account_name, outcome, reward_summary)
        values (v_session.id, p_user_id, v_session.account_name, 'bust', '[]'::jsonb)
        on conflict (session_id) do nothing;
    else
        if v_reel_index >= 7 then
            update public.slot_sessions
            set reels_state = v_reels,
                updated_at = now()
            where id = v_session.id;
            v_auto_cashout := true;
            v_payout := public.slot_cashout(p_user_id, v_session.id)->'payout';
        else
            update public.slot_sessions
            set current_reel = v_reel_index + 1,
                reels_state = v_reels,
                updated_at = now()
            where id = v_session.id;
        end if;
    end if;


    select * into v_session
    from public.slot_sessions
    where id = v_session.id;

    return jsonb_build_object(
        'ok', true,
        'session', jsonb_build_object(
            'id', v_session.id,
            'status', v_session.status,
            'cost', v_session.cost,
            'current_reel', v_session.current_reel,
            'created_at', v_session.created_at
        ),
        'result', jsonb_build_object(
            'reel_index', v_reel_index,
            'position_id', v_position.id,
            'is_bust', v_position.is_bust,
            'reward_type', v_position.reward_type,
            'reward_name', v_position.reward_name,
            'reward_id', v_position.reward_id,
            'amount', v_position.amount
        ),
        'reels', v_reels,
        'auto_cashout', v_auto_cashout,
        'payout', v_payout
    );
end;
$$;

-- =============================
-- 6) RPC: Cashout (grant rewards)
-- =============================

create or replace function public.slot_cashout(p_user_id text, p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
    v_session record;
    v_rewards record;
    v_summary jsonb := '[]'::jsonb;
begin
    perform pg_advisory_xact_lock(hashtext('slot:' || p_user_id));

    select * into v_session
    from public.slot_sessions
    where id = p_session_id and user_id = p_user_id
    for update;

    if not found then
        return jsonb_build_object('ok', false, 'error', 'SESSION_NOT_FOUND');
    end if;

    if v_session.status = 'bust' then
        return jsonb_build_object('ok', true, 'session', jsonb_build_object(
            'id', v_session.id, 'status', v_session.status, 'cost', v_session.cost,
            'current_reel', v_session.current_reel, 'created_at', v_session.created_at
        ), 'payout', '[]'::jsonb, 'outcome', 'bust');
    end if;

    if v_session.status = 'cashed_out' then
        return jsonb_build_object('ok', true, 'session', jsonb_build_object(
            'id', v_session.id, 'status', v_session.status, 'cost', v_session.cost,
            'current_reel', v_session.current_reel, 'created_at', v_session.created_at
        ), 'payout', v_session.payout_summary, 'outcome', 'cashed_out');
    end if;

    -- マルチプライヤー判定：multiplier報酬がある場合、倍率を取得
    declare
        v_multiplier integer := 1;
        v_elem jsonb;
    begin
        for v_elem in
            select elem from jsonb_array_elements(coalesce(v_session.reels_state, '[]'::jsonb)) elem
            where elem->>'reward_type' = 'multiplier'
        loop
            v_multiplier := v_multiplier * coalesce((v_elem->>'amount')::int, 1);
        end loop;

        for v_rewards in
            select
                elem->>'reward_type' as reward_type,
                elem->>'reward_id' as reward_id,
                elem->>'reward_name' as reward_name,
                sum((elem->>'amount')::int) as amount
            from jsonb_array_elements(coalesce(v_session.reels_state, '[]'::jsonb)) elem
            where (elem->>'is_bust')::boolean = false
              and elem->>'reward_type' is not null
              and elem->>'reward_type' <> 'multiplier'
              and (elem->>'amount')::int > 0
            group by elem->>'reward_type', elem->>'reward_id', elem->>'reward_name'
            order by elem->>'reward_type', elem->>'reward_id'
        loop
            -- マルチプライヤー適用
            v_rewards.amount := v_rewards.amount * v_multiplier;

            v_summary := v_summary || jsonb_build_array(jsonb_build_object(
                'type', v_rewards.reward_type,
                'reward_id', v_rewards.reward_id,
                'reward_name', v_rewards.reward_name,
                'amount', v_rewards.amount
            ));

            if v_rewards.reward_type = 'coin' then
                update public.profiles
                set coins = coins + v_rewards.amount,
                    total_assets = total_assets + v_rewards.amount
                where discord_user_id = p_user_id;
            elsif v_rewards.reward_type = 'gacha_ticket' then
                update public.profiles
                set gacha_tickets = coalesce(gacha_tickets, 0) + v_rewards.amount
                where discord_user_id = p_user_id;
            elsif v_rewards.reward_type = 'mangan_ticket' then
                update public.profiles
                set mangan_tickets = coalesce(mangan_tickets, 0) + v_rewards.amount
                where discord_user_id = p_user_id;
            elsif v_rewards.reward_type = 'exchange_ticket' then
                update public.profiles
                set exchange_tickets = jsonb_set(
                    coalesce(exchange_tickets, '{}'::jsonb),
                    array[v_rewards.reward_id],
                    (coalesce((exchange_tickets->>v_rewards.reward_id)::int, 0) + v_rewards.amount)::text::jsonb
                )
                where discord_user_id = p_user_id;
            elsif v_rewards.reward_type = 'badge' then
                insert into public.user_badges_new (user_id, badge_id, purchased_price)
                select p_user_id, v_rewards.reward_id::uuid, 0
                from generate_series(1, v_rewards.amount);
            end if;
        end loop;

        -- マルチプライヤー情報をサマリーに追加
        if v_multiplier > 1 then
            v_summary := jsonb_build_array(jsonb_build_object(
                'type', 'multiplier',
                'reward_name', v_multiplier || '倍',
                'amount', v_multiplier
            )) || v_summary;
        end if;
    end;

    update public.slot_sessions
    set status = 'cashed_out',
        payout_summary = v_summary,
        updated_at = now(),
        ended_at = now()
    where id = v_session.id;

    insert into public.slot_session_results (session_id, user_id, account_name, outcome, reward_summary)
    values (v_session.id, p_user_id, v_session.account_name, 'cashed_out', v_summary)
    on conflict (session_id) do nothing;

    select * into v_session from public.slot_sessions where id = v_session.id;

    return jsonb_build_object(
        'ok', true,
        'session', jsonb_build_object(
            'id', v_session.id,
            'status', v_session.status,
            'cost', v_session.cost,
            'current_reel', v_session.current_reel,
            'created_at', v_session.created_at
        ),
        'payout', v_summary,
        'outcome', 'cashed_out'
    );
end;
$$;

-- =============================
-- 7) Seed data
-- =============================

-- event settings (default OFF)
insert into public.slot_event_settings (is_active, cost)
values (false, 100)
on conflict do nothing;

-- reel positions (7 reels x 10 positions)
-- リールが進むほどバースト率UP＆報酬UP、Reel6に満願符、Reel7にマルチプライヤー
insert into public.slot_reel_positions
(reel_index, position_index, is_bust, reward_type, reward_name, reward_id, amount)
values
-- Reel 1 (バースト1/10)
(1,  1, false, 'coin',         'コイン +30',   null,  30),
(1,  2, false, 'coin',         'コイン +20',   null,  20),
(1,  3, false, 'coin',         'コイン +10',   null,  10),
(1,  4, false, 'coin',         'コイン +10',   null,  10),
(1,  5, false, 'coin',         'コイン +5',    null,   5),
(1,  6, false, 'coin',         'コイン +5',    null,   5),
(1,  7, false, 'coin',         'コイン +5',    null,   5),
(1,  8, false, 'coin',         'コイン +5',    null,   5),
(1,  9, false, 'coin',         'コイン +5',    null,   5),
(1, 10, true,  null,           null,           null,   0),
-- Reel 2 (バースト2/10)
(2,  1, false, 'coin',         'コイン +100',  null, 100),
(2,  2, false, 'coin',         'コイン +50',   null,  50),
(2,  3, false, 'coin',         'コイン +30',   null,  30),
(2,  4, false, 'coin',         'コイン +15',   null,  15),
(2,  5, false, 'coin',         'コイン +15',   null,  15),
(2,  6, false, 'coin',         'コイン +7',    null,   7),
(2,  7, false, 'coin',         'コイン +7',    null,   7),
(2,  8, false, 'coin',         'コイン +7',    null,   7),
(2,  9, true,  null,           null,           null,   0),
(2, 10, true,  null,           null,           null,   0),
-- Reel 3 (バースト3/10)
(3,  1, false, 'gacha_ticket', '祈願符 +1',    null,   1),
(3,  2, false, 'coin',         'コイン +80',   null,  80),
(3,  3, false, 'coin',         'コイン +50',   null,  50),
(3,  4, false, 'coin',         'コイン +30',   null,  30),
(3,  5, false, 'coin',         'コイン +10',   null,  10),
(3,  6, false, 'coin',         'コイン +10',   null,  10),
(3,  7, false, 'coin',         'コイン +10',   null,  10),
(3,  8, true,  null,           null,           null,   0),
(3,  9, true,  null,           null,           null,   0),
(3, 10, true,  null,           null,           null,   0),
-- Reel 4 (バースト4/10)
(4,  1, false, 'gacha_ticket', '祈願符 +2',    null,   2),
(4,  2, false, 'coin',         'コイン +100',  null, 100),
(4,  3, false, 'coin',         'コイン +80',   null,  80),
(4,  4, false, 'coin',         'コイン +50',   null,  50),
(4,  5, false, 'coin',         'コイン +20',   null,  20),
(4,  6, false, 'coin',         'コイン +20',   null,  20),
(4,  7, true,  null,           null,           null,   0),
(4,  8, true,  null,           null,           null,   0),
(4,  9, true,  null,           null,           null,   0),
(4, 10, true,  null,           null,           null,   0),
-- Reel 5 (バースト5/10)
(5,  1, false, 'gacha_ticket', '祈願符 +3',    null,   3),
(5,  2, false, 'coin',         'コイン +150',  null, 150),
(5,  3, false, 'coin',         'コイン +100',  null, 100),
(5,  4, false, 'coin',         'コイン +80',   null,  80),
(5,  5, false, 'coin',         'コイン +30',   null,  30),
(5,  6, true,  null,           null,           null,   0),
(5,  7, true,  null,           null,           null,   0),
(5,  8, true,  null,           null,           null,   0),
(5,  9, true,  null,           null,           null,   0),
(5, 10, true,  null,           null,           null,   0),
-- Reel 6 (バースト6/10、満願符あり)
(6,  1, false, 'mangan_ticket','満願符 +1',    null,   1),
(6,  2, false, 'gacha_ticket', '祈願符 +3',    null,   3),
(6,  3, false, 'gacha_ticket', '祈願符 +2',    null,   2),
(6,  4, false, 'gacha_ticket', '祈願符 +1',    null,   1),
(6,  5, true,  null,           null,           null,   0),
(6,  6, true,  null,           null,           null,   0),
(6,  7, true,  null,           null,           null,   0),
(6,  8, true,  null,           null,           null,   0),
(6,  9, true,  null,           null,           null,   0),
(6, 10, true,  null,           null,           null,   0),
-- Reel 7 (バースト7/10、マルチプライヤー＆満願符)
(7,  1, false, 'multiplier',   '2倍',          null,   2),
(7,  2, false, 'mangan_ticket','満願符 +5',    null,   5),
(7,  3, false, 'gacha_ticket', '祈願符 +10',   null,  10),
(7,  4, true,  null,           null,           null,   0),
(7,  5, true,  null,           null,           null,   0),
(7,  6, true,  null,           null,           null,   0),
(7,  7, true,  null,           null,           null,   0),
(7,  8, true,  null,           null,           null,   0),
(7,  9, true,  null,           null,           null,   0),
(7, 10, true,  null,           null,           null,   0)
on conflict (reel_index, position_index) do update
set is_bust = excluded.is_bust,
    reward_type = excluded.reward_type,
    reward_name = excluded.reward_name,
    reward_id = excluded.reward_id,
    amount = excluded.amount,
    updated_at = now();

-- page settings entry
insert into public.page_settings (path, name, is_active)
values ('/event/slot.html', '期間限定イベント：スロット', false)
on conflict (path) do update
set name = excluded.name;

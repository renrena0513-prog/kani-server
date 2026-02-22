-- Slot event: schema, functions, and seed data

-- =============================
-- 1) Tables
-- =============================

create table if not exists public.slot_event_settings (
    id uuid primary key default gen_random_uuid(),
    is_active boolean not null default false,
    cost integer not null default 100,
    start_at timestamptz,
    end_at timestamptz,
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
    weight integer not null default 1,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (reel_index, position_index)
);

create table if not exists public.slot_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id text not null,
    status text not null default 'active' check (status in ('active', 'bust', 'cashed_out')),
    cost integer not null,
    current_reel integer not null default 1 check (current_reel between 1 and 7),
    bust_reel integer,
    bust_position_id uuid,
    payout_summary jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    ended_at timestamptz
);

create table if not exists public.slot_session_reels (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.slot_sessions(id) on delete cascade,
    user_id text not null,
    reel_index integer not null check (reel_index between 1 and 7),
    position_id uuid references public.slot_reel_positions(id),
    is_bust boolean not null default false,
    reward_type text,
    reward_name text,
    reward_id text,
    amount integer default 0,
    created_at timestamptz not null default now(),
    unique (session_id, reel_index)
);

create table if not exists public.slot_session_results (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null unique references public.slot_sessions(id) on delete cascade,
    user_id text not null,
    outcome text not null check (outcome in ('bust', 'cashed_out')),
    reward_summary jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now()
);

create unique index if not exists slot_sessions_active_user_uq
    on public.slot_sessions(user_id)
    where status = 'active';

-- =============================
-- 2) Helper: Secure random
-- =============================

create or replace function public.slot_secure_random()
returns double precision
language plpgsql
volatile
as $$
declare
    v_bytes bytea;
    v_bigint bigint;
begin
    v_bytes := gen_random_bytes(8);
    v_bigint := (('x' || encode(v_bytes, 'hex'))::bit(64)::bigint);
    if v_bigint < 0 then
        v_bigint := v_bigint * -1;
    end if;
    return v_bigint / 9223372036854775808.0; -- 2^63
end;
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

    select coalesce(jsonb_agg(jsonb_build_object(
        'reel_index', reel_index,
        'position_id', position_id,
        'is_bust', is_bust,
        'reward_type', reward_type,
        'reward_name', reward_name,
        'reward_id', reward_id,
        'amount', amount
    ) order by reel_index), '[]'::jsonb)
    into v_reels
    from public.slot_session_reels
    where session_id = v_session.id;

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
    v_reels jsonb := '[]'::jsonb;
begin
    perform pg_advisory_xact_lock(hashtext('slot:' || p_user_id));

    select * into v_settings
    from public.slot_event_settings
    order by created_at desc
    limit 1;

    if not found or v_settings.is_active is false then
        return jsonb_build_object('ok', false, 'error', 'EVENT_INACTIVE');
    end if;

    if v_settings.start_at is not null and v_now < v_settings.start_at then
        return jsonb_build_object('ok', false, 'error', 'EVENT_NOT_STARTED');
    end if;

    if v_settings.end_at is not null and v_now > v_settings.end_at then
        return jsonb_build_object('ok', false, 'error', 'EVENT_ENDED');
    end if;

    select * into v_session
    from public.slot_sessions
    where user_id = p_user_id and status = 'active'
    order by created_at desc
    limit 1
    for update;

    if found then
        select coalesce(jsonb_agg(jsonb_build_object(
            'reel_index', reel_index,
            'position_id', position_id,
            'is_bust', is_bust,
            'reward_type', reward_type,
            'reward_name', reward_name,
            'reward_id', reward_id,
            'amount', amount
        ) order by reel_index), '[]'::jsonb)
        into v_reels
        from public.slot_session_reels
        where session_id = v_session.id;

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

    begin
        insert into public.slot_sessions (user_id, status, cost, current_reel, created_at, updated_at)
        values (p_user_id, 'active', v_settings.cost, 1, v_now, v_now)
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
    v_existing record;
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

    select * into v_existing
    from public.slot_session_reels
    where session_id = v_session.id and reel_index = v_reel_index;

    if found then
        select coalesce(jsonb_agg(jsonb_build_object(
            'reel_index', reel_index,
            'position_id', position_id,
            'is_bust', is_bust,
            'reward_type', reward_type,
            'reward_name', reward_name,
            'reward_id', reward_id,
            'amount', amount
        ) order by reel_index), '[]'::jsonb)
        into v_reels
        from public.slot_session_reels
        where session_id = v_session.id;

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
                'reel_index', v_existing.reel_index,
                'position_id', v_existing.position_id,
                'is_bust', v_existing.is_bust,
                'reward_type', v_existing.reward_type,
                'reward_name', v_existing.reward_name,
                'reward_id', v_existing.reward_id,
                'amount', v_existing.amount
            ),
            'reels', v_reels,
            'already_spun', true
        );
    end if;

    select sum(weight) into v_total_weight
    from public.slot_reel_positions
    where reel_index = v_reel_index and is_active = true and weight > 0;

    if v_total_weight is null or v_total_weight <= 0 then
        return jsonb_build_object('ok', false, 'error', 'NO_REEL_CONFIG');
    end if;

    v_random_val := floor(public.slot_secure_random() * v_total_weight)::int;

    for v_position in
        select *
        from public.slot_reel_positions
        where reel_index = v_reel_index and is_active = true and weight > 0
        order by position_index
    loop
        v_cumulative := v_cumulative + v_position.weight;
        if v_random_val < v_cumulative then
            exit;
        end if;
    end loop;

    if v_position.id is null then
        return jsonb_build_object('ok', false, 'error', 'SPIN_FAILED');
    end if;

    begin
        insert into public.slot_session_reels (
            session_id, user_id, reel_index, position_id, is_bust,
            reward_type, reward_name, reward_id, amount
        ) values (
            v_session.id, p_user_id, v_reel_index, v_position.id, v_position.is_bust,
            v_position.reward_type, v_position.reward_name, v_position.reward_id, v_position.amount
        );
    exception when unique_violation then
        select * into v_existing
        from public.slot_session_reels
        where session_id = v_session.id and reel_index = v_reel_index;
    end;

    if v_position.is_bust then
        update public.slot_sessions
        set status = 'bust',
            bust_reel = v_reel_index,
            bust_position_id = v_position.id,
            updated_at = now(),
            ended_at = now()
        where id = v_session.id;

        insert into public.slot_session_results (session_id, user_id, outcome, reward_summary)
        values (v_session.id, p_user_id, 'bust', '[]'::jsonb)
        on conflict (session_id) do nothing;
    else
        if v_reel_index >= 7 then
            v_auto_cashout := true;
            v_payout := public.slot_cashout(p_user_id, v_session.id)->'payout';
        else
            update public.slot_sessions
            set current_reel = v_reel_index + 1,
                updated_at = now()
            where id = v_session.id;
        end if;
    end if;

    select coalesce(jsonb_agg(jsonb_build_object(
        'reel_index', reel_index,
        'position_id', position_id,
        'is_bust', is_bust,
        'reward_type', reward_type,
        'reward_name', reward_name,
        'reward_id', reward_id,
        'amount', amount
    ) order by reel_index), '[]'::jsonb)
    into v_reels
    from public.slot_session_reels
    where session_id = v_session.id;

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

    for v_rewards in
        select reward_type, reward_id, reward_name, sum(amount) as amount
        from public.slot_session_reels
        where session_id = v_session.id and is_bust = false and reward_type is not null and amount > 0
        group by reward_type, reward_id, reward_name
        order by reward_type, reward_id
    loop
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

    update public.slot_sessions
    set status = 'cashed_out',
        payout_summary = v_summary,
        updated_at = now(),
        ended_at = now()
    where id = v_session.id;

    insert into public.slot_session_results (session_id, user_id, outcome, reward_summary)
    values (v_session.id, p_user_id, 'cashed_out', v_summary)
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
-- Example distribution: 1 bust, 7 coin tiers, 2 ticket rewards per reel
insert into public.slot_reel_positions
(reel_index, position_index, is_bust, reward_type, reward_name, reward_id, amount, weight)
values
-- Reel 1
(1, 1, true,  null, null, null, 0, 4),
(1, 2, false, 'coin', 'コイン +10', null, 10, 18),
(1, 3, false, 'coin', 'コイン +20', null, 20, 16),
(1, 4, false, 'coin', 'コイン +30', null, 30, 14),
(1, 5, false, 'coin', 'コイン +50', null, 50, 10),
(1, 6, false, 'coin', 'コイン +80', null, 80, 8),
(1, 7, false, 'coin', 'コイン +120', null, 120, 6),
(1, 8, false, 'gacha_ticket', '祈願符 +1', null, 1, 4),
(1, 9, false, 'gacha_ticket', '祈願符 +2', null, 2, 2),
(1,10, false, 'coin', 'コイン +200', null, 200, 1),
-- Reel 2
(2, 1, true,  null, null, null, 0, 4),
(2, 2, false, 'coin', 'コイン +10', null, 10, 18),
(2, 3, false, 'coin', 'コイン +20', null, 20, 16),
(2, 4, false, 'coin', 'コイン +30', null, 30, 14),
(2, 5, false, 'coin', 'コイン +50', null, 50, 10),
(2, 6, false, 'coin', 'コイン +80', null, 80, 8),
(2, 7, false, 'coin', 'コイン +120', null, 120, 6),
(2, 8, false, 'gacha_ticket', '祈願符 +1', null, 1, 4),
(2, 9, false, 'gacha_ticket', '祈願符 +2', null, 2, 2),
(2,10, false, 'coin', 'コイン +200', null, 200, 1),
-- Reel 3
(3, 1, true,  null, null, null, 0, 4),
(3, 2, false, 'coin', 'コイン +10', null, 10, 18),
(3, 3, false, 'coin', 'コイン +20', null, 20, 16),
(3, 4, false, 'coin', 'コイン +30', null, 30, 14),
(3, 5, false, 'coin', 'コイン +50', null, 50, 10),
(3, 6, false, 'coin', 'コイン +80', null, 80, 8),
(3, 7, false, 'coin', 'コイン +120', null, 120, 6),
(3, 8, false, 'gacha_ticket', '祈願符 +1', null, 1, 4),
(3, 9, false, 'gacha_ticket', '祈願符 +2', null, 2, 2),
(3,10, false, 'coin', 'コイン +200', null, 200, 1),
-- Reel 4
(4, 1, true,  null, null, null, 0, 4),
(4, 2, false, 'coin', 'コイン +10', null, 10, 18),
(4, 3, false, 'coin', 'コイン +20', null, 20, 16),
(4, 4, false, 'coin', 'コイン +30', null, 30, 14),
(4, 5, false, 'coin', 'コイン +50', null, 50, 10),
(4, 6, false, 'coin', 'コイン +80', null, 80, 8),
(4, 7, false, 'coin', 'コイン +120', null, 120, 6),
(4, 8, false, 'gacha_ticket', '祈願符 +1', null, 1, 4),
(4, 9, false, 'gacha_ticket', '祈願符 +2', null, 2, 2),
(4,10, false, 'coin', 'コイン +200', null, 200, 1),
-- Reel 5
(5, 1, true,  null, null, null, 0, 4),
(5, 2, false, 'coin', 'コイン +10', null, 10, 18),
(5, 3, false, 'coin', 'コイン +20', null, 20, 16),
(5, 4, false, 'coin', 'コイン +30', null, 30, 14),
(5, 5, false, 'coin', 'コイン +50', null, 50, 10),
(5, 6, false, 'coin', 'コイン +80', null, 80, 8),
(5, 7, false, 'coin', 'コイン +120', null, 120, 6),
(5, 8, false, 'gacha_ticket', '祈願符 +1', null, 1, 4),
(5, 9, false, 'gacha_ticket', '祈願符 +2', null, 2, 2),
(5,10, false, 'coin', 'コイン +200', null, 200, 1),
-- Reel 6
(6, 1, true,  null, null, null, 0, 4),
(6, 2, false, 'coin', 'コイン +10', null, 10, 18),
(6, 3, false, 'coin', 'コイン +20', null, 20, 16),
(6, 4, false, 'coin', 'コイン +30', null, 30, 14),
(6, 5, false, 'coin', 'コイン +50', null, 50, 10),
(6, 6, false, 'coin', 'コイン +80', null, 80, 8),
(6, 7, false, 'coin', 'コイン +120', null, 120, 6),
(6, 8, false, 'gacha_ticket', '祈願符 +1', null, 1, 4),
(6, 9, false, 'gacha_ticket', '祈願符 +2', null, 2, 2),
(6,10, false, 'coin', 'コイン +200', null, 200, 1),
-- Reel 7
(7, 1, true,  null, null, null, 0, 4),
(7, 2, false, 'coin', 'コイン +10', null, 10, 18),
(7, 3, false, 'coin', 'コイン +20', null, 20, 16),
(7, 4, false, 'coin', 'コイン +30', null, 30, 14),
(7, 5, false, 'coin', 'コイン +50', null, 50, 10),
(7, 6, false, 'coin', 'コイン +80', null, 80, 8),
(7, 7, false, 'coin', 'コイン +120', null, 120, 6),
(7, 8, false, 'gacha_ticket', '祈願符 +1', null, 1, 4),
(7, 9, false, 'gacha_ticket', '祈願符 +2', null, 2, 2),
(7,10, false, 'coin', 'コイン +200', null, 200, 1)
on conflict (reel_index, position_index) do update
set is_bust = excluded.is_bust,
    reward_type = excluded.reward_type,
    reward_name = excluded.reward_name,
    reward_id = excluded.reward_id,
    amount = excluded.amount,
    weight = excluded.weight,
    updated_at = now();

-- page settings entry
insert into public.page_settings (path, name, is_active)
values ('/event/slot.html', '期間限定イベント：スロット', false)
on conflict (path) do update
set name = excluded.name;

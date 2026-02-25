-- Slot event: schema, functions, and seed data (v2 consolidated)

-- =============================
-- 1) Tables (3 tables only)
-- =============================

-- リール設定テーブル (通常リール + フリースピンリール統合)
create table if not exists public.slot_reel_positions (
    id uuid primary key default gen_random_uuid(),
    mode text not null default 'normal' check (mode in ('normal', 'free')),
    reel_index integer not null check (reel_index between 1 and 7),
    position_index integer not null check (position_index between 1 and 10),
    is_bust boolean not null default false,
    is_jackpot boolean not null default false,
    is_free_spin_stock boolean not null default false,
    reward_type text,
    reward_name text,
    reward_id text,
    amount numeric(10,2) default 0,
    is_active boolean not null default true,
    unique (mode, reel_index, position_index)
);

-- セッションテーブル
create table if not exists public.slot_sessions (
    id uuid primary key default gen_random_uuid(),
    user_id text not null,
    account_name text,
    status text not null default 'active' check (status in ('active', 'bust', 'cashed_out')),
    cost integer not null,
    current_reel integer not null default 1 check (current_reel between 1 and 7),
    reels_state jsonb not null default '[]'::jsonb,
    -- バースト情報
    bust_reel integer,
    bust_position_id uuid,
    -- ジャックポット / フリースピン
    jackpot_hits integer not null default 0,
    jackpot_unlocked boolean not null default false,
    free_spin_confirmed boolean not null default false,
    free_spin_active boolean not null default false,
    free_spins_remaining integer not null default 0,
    free_spin_round integer not null default 0,
    free_spin_stocks integer not null default 0,
    -- 精算
    payout_summary jsonb not null default '{}'::jsonb,
    -- 時刻
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    ended_at timestamptz
);

create unique index if not exists slot_sessions_active_user_uq
    on public.slot_sessions(user_id)
    where status = 'active';

alter table public.slot_sessions add column if not exists updated_at timestamptz default now();

-- page_settings に config カラム追加 (スロットコスト等の設定用)
alter table public.page_settings add column if not exists config jsonb default '{}'::jsonb;
alter table public.slot_sessions add column if not exists free_spin_confirmed boolean default false;


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
            'jackpot_hits', v_session.jackpot_hits,
            'jackpot_unlocked', v_session.jackpot_unlocked,
            'free_spin_active', v_session.free_spin_active,
            'free_spins_remaining', v_session.free_spins_remaining,
            'free_spin_round', v_session.free_spin_round,
            'free_spin_stocks', v_session.free_spin_stocks,
            'free_spin_confirmed', coalesce(v_session.free_spin_confirmed, false),
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
    v_session record;
    v_is_admin boolean := false;
    v_page_active boolean := false;
    v_cost integer := 100;
    v_coins integer;
    v_account_name text;
    v_reels jsonb := '[]'::jsonb;
    v_now timestamptz := now();
    v_config jsonb;
begin
    perform pg_advisory_xact_lock(hashtext('slot:' || p_user_id));

    select (public.is_admin() or p_user_id = any(array['666909228300107797','1184908452959621233'])) into v_is_admin;

    select is_active, coalesce(config, '{}'::jsonb)
    into v_page_active, v_config
    from public.page_settings
    where path = '/event/slot.html'
    limit 1;

    if not coalesce(v_page_active, false) and not v_is_admin then
        return jsonb_build_object('ok', false, 'error', 'EVENT_INACTIVE');
    end if;

    -- コスト設定を page_settings.config から取得
    v_cost := coalesce((v_config->>'slot_cost')::int, 100);

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
            'jackpot_hits', v_session.jackpot_hits,
            'jackpot_unlocked', v_session.jackpot_unlocked,
            'free_spin_active', v_session.free_spin_active,
            'free_spins_remaining', v_session.free_spins_remaining,
            'free_spin_round', v_session.free_spin_round,
            'free_spin_stocks', v_session.free_spin_stocks,
            'free_spin_confirmed', coalesce(v_session.free_spin_confirmed, false),
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

    if v_coins < v_cost then
        return jsonb_build_object('ok', false, 'error', 'INSUFFICIENT_COINS', 'required', v_cost);
    end if;

    update public.profiles
    set coins = coins - v_cost
    where discord_user_id = p_user_id;

    select account_name into v_account_name
    from public.profiles
    where discord_user_id = p_user_id
    limit 1;

    begin
        insert into public.slot_sessions (user_id, account_name, status, cost, current_reel, reels_state, jackpot_hits, jackpot_unlocked, free_spin_active, free_spins_remaining, free_spin_round, created_at)
        values (p_user_id, v_account_name, 'active', v_cost, 1, '[]'::jsonb, 0, false, false, 0, 0, v_now)
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
            'jackpot_hits', v_session.jackpot_hits,
            'jackpot_unlocked', v_session.jackpot_unlocked,
            'free_spin_active', v_session.free_spin_active,
            'free_spins_remaining', v_session.free_spins_remaining,
            'free_spin_round', v_session.free_spin_round,
            'free_spin_stocks', v_session.free_spin_stocks,
            'free_spin_confirmed', coalesce(v_session.free_spin_confirmed, false),
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
    v_new_hits integer := 0;
    v_remaining integer := 0;
    v_round integer := 0;
    v_result_json jsonb := '{}'::jsonb;
    v_mode text;
    v_is_bust boolean := false;
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
    v_mode := case when v_session.free_spin_active then 'free' else 'normal' end;

    v_reels := coalesce(v_session.reels_state, '[]'::jsonb);
    select elem into v_existing
    from jsonb_array_elements(v_reels) elem
    where (elem->>'reel_index')::int = v_reel_index
      and coalesce((elem->>'free_spin_round')::int, 0) = v_session.free_spin_round
    limit 1;

    if v_existing is not null then
        return jsonb_build_object(
            'ok', true,
            'session', jsonb_build_object(
                'id', v_session.id,
                'status', v_session.status,
                'cost', v_session.cost,
                'current_reel', v_session.current_reel,
                'jackpot_hits', v_session.jackpot_hits,
                'jackpot_unlocked', v_session.jackpot_unlocked,
                'free_spin_active', v_session.free_spin_active,
                'free_spins_remaining', v_session.free_spins_remaining,
                'free_spin_round', v_session.free_spin_round,
                'free_spin_confirmed', coalesce(v_session.free_spin_confirmed, false),
                'created_at', v_session.created_at
            ),
            'result', v_existing,
            'reels', v_reels,
            'already_spun', true
        );
    end if;

    -- リール回転: mode に応じてリール設定を取得
    select count(*) into v_total_weight
    from public.slot_reel_positions
    where mode = v_mode and reel_index = v_reel_index and is_active = true;

    if v_total_weight is null or v_total_weight <= 0 then
        return jsonb_build_object('ok', false, 'error', 'NO_REEL_CONFIG');
    end if;

    v_random_val := floor(public.slot_secure_random() * v_total_weight)::int;

    for v_position in
        select *
        from public.slot_reel_positions
        where mode = v_mode and reel_index = v_reel_index and is_active = true
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

    v_is_bust := coalesce(v_position.is_bust, false);
    if v_session.free_spin_active then
        v_is_bust := false;
    end if;

    -- 結果を reels_state に追加
    v_reels := v_reels || jsonb_build_array(jsonb_build_object(
        'reel_index', v_reel_index,
        'position_id', v_position.id,
        'is_bust', v_is_bust,
        'is_jackpot', coalesce(v_position.is_jackpot, false),
        'is_free_spin_stock', coalesce(v_position.is_free_spin_stock, false),
        'is_free_spin', v_session.free_spin_active,
        'free_spin_round', v_session.free_spin_round,
        'reward_type', v_position.reward_type,
        'reward_name', v_position.reward_name,
        'reward_id', v_position.reward_id,
        'amount', v_position.amount
    ));

    v_result_json := jsonb_build_object(
        'reel_index', v_reel_index,
        'position_id', v_position.id,
        'is_bust', v_is_bust,
        'reward_type', v_position.reward_type,
        'reward_name', v_position.reward_name,
        'reward_id', v_position.reward_id,
        'amount', v_position.amount
    );

    -- ===== フリースピン中 =====
    if v_session.free_spin_active then
        -- FreeSpin ストック蓄積
        declare
            v_stocks integer := v_session.free_spin_stocks;
            v_extra_spins integer := 0;
        begin
            if coalesce(v_position.is_free_spin_stock, false) then
                v_stocks := v_stocks + 1;
            end if;

            if v_reel_index >= 7 then
                if v_stocks >= 3 then
                    v_extra_spins := v_stocks / 3;
                    v_stocks := v_stocks % 3;
                end if;
                v_remaining := greatest(v_session.free_spins_remaining - 1 + v_extra_spins, 0);
                v_round := v_session.free_spin_round + 1;

                update public.slot_sessions
                set reels_state = v_reels,
                    free_spins_remaining = v_remaining,
                    free_spin_round = v_round,
                    free_spin_stocks = v_stocks,
                    current_reel = case when v_remaining > 0 then 1 else v_session.current_reel end,
                    free_spin_active = case when v_remaining > 0 then true else false end
                where id = v_session.id;

                if v_remaining <= 0 then
                    v_auto_cashout := true;
                    v_payout := public.slot_cashout(p_user_id, v_session.id)->'payout';
                end if;
            else
                update public.slot_sessions
                set current_reel = v_reel_index + 1,
                    reels_state = v_reels,
                    free_spin_stocks = v_stocks,
                    free_spins_remaining = v_session.free_spins_remaining
                where id = v_session.id;
            end if;
        end;

    -- ===== 通常スピン中 =====
    else
        v_new_hits := v_session.jackpot_hits + case when v_position.is_jackpot then 1 else 0 end;

        if v_is_bust then
            if v_new_hits >= 3 then
                -- バーストでもジャックポット3個以上ならフリースピンへ
                update public.slot_sessions
                set reels_state = v_reels,
                    jackpot_hits = v_new_hits,
                    jackpot_unlocked = true,
                    free_spin_active = true,
                    free_spins_remaining = v_new_hits,
                    free_spin_round = 1,
                    current_reel = 1
                where id = v_session.id;
            else
                update public.slot_sessions
                set status = 'bust',
                    bust_reel = v_reel_index,
                    bust_position_id = v_position.id,
                    reels_state = v_reels,
                    ended_at = now()
                where id = v_session.id;
            end if;
        else
            if v_reel_index >= 7 then
                update public.slot_sessions
                set reels_state = v_reels,
                    jackpot_hits = v_new_hits,
                    jackpot_unlocked = (v_new_hits >= 3)
                where id = v_session.id;
                if v_new_hits < 3 then
                    v_auto_cashout := true;
                    v_payout := public.slot_cashout(p_user_id, v_session.id)->'payout';
                else
                    -- 7リール完走 & ジャックポット3個以上 → フリースピンへ
                    update public.slot_sessions
                    set free_spin_active = true,
                        free_spins_remaining = v_new_hits,
                        free_spin_round = 1,
                        current_reel = 1
                    where id = v_session.id;
                end if;
            else
                update public.slot_sessions
                set current_reel = v_reel_index + 1,
                    reels_state = v_reels,
                    jackpot_hits = v_new_hits,
                    jackpot_unlocked = false,
                    free_spin_active = false,
                    free_spins_remaining = 0,
                    free_spin_round = 0
                where id = v_session.id;
            end if;
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
            'jackpot_hits', v_session.jackpot_hits,
            'jackpot_unlocked', v_session.jackpot_unlocked,
            'free_spin_active', v_session.free_spin_active,
            'free_spins_remaining', v_session.free_spins_remaining,
            'free_spin_round', v_session.free_spin_round,
            'free_spin_stocks', v_session.free_spin_stocks,
            'free_spin_confirmed', coalesce(v_session.free_spin_confirmed, false),
            'created_at', v_session.created_at
        ),
        'result', v_result_json,
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
    v_source jsonb := '[]'::jsonb;
    v_source_has_rewards boolean := false;
    v_transition_free_spin boolean := false;
    v_existing_summary jsonb := '[]'::jsonb;
begin
    perform pg_advisory_xact_lock(hashtext('slot:' || p_user_id));

    select * into v_session
    from public.slot_sessions
    where id = p_session_id and user_id = p_user_id
    for update;

    if not found then
        return jsonb_build_object('ok', false, 'error', 'SESSION_NOT_FOUND');
    end if;

    v_existing_summary := coalesce(v_session.payout_summary, '[]'::jsonb);

    if v_session.status = 'bust' then
        return jsonb_build_object('ok', true, 'session', jsonb_build_object(
            'id', v_session.id, 'status', v_session.status, 'cost', v_session.cost,
            'current_reel', v_session.current_reel,
            'jackpot_hits', v_session.jackpot_hits,
            'jackpot_unlocked', v_session.jackpot_unlocked,
            'free_spin_active', v_session.free_spin_active,
            'free_spins_remaining', v_session.free_spins_remaining,
            'free_spin_round', v_session.free_spin_round,
            'free_spin_stocks', v_session.free_spin_stocks,
            'free_spin_confirmed', coalesce(v_session.free_spin_confirmed, false),
            'created_at', v_session.created_at
        ), 'payout', '[]'::jsonb, 'outcome', 'bust');
    end if;

    if v_session.status = 'cashed_out' then
        return jsonb_build_object('ok', true, 'session', jsonb_build_object(
            'id', v_session.id, 'status', v_session.status, 'cost', v_session.cost,
            'current_reel', v_session.current_reel,
            'jackpot_hits', v_session.jackpot_hits,
            'jackpot_unlocked', v_session.jackpot_unlocked,
            'free_spin_active', v_session.free_spin_active,
            'free_spins_remaining', v_session.free_spins_remaining,
            'free_spin_round', v_session.free_spin_round,
            'free_spin_stocks', v_session.free_spin_stocks,
            'free_spin_confirmed', coalesce(v_session.free_spin_confirmed, false),
            'created_at', v_session.created_at
        ), 'payout', v_session.payout_summary, 'outcome', 'cashed_out');
    end if;

    select exists(
        select 1
        from jsonb_array_elements(coalesce(v_session.reels_state, '[]'::jsonb)) elem
        where (elem->>'is_free_spin')::boolean = true
           or coalesce((elem->>'free_spin_round')::int, 0) > 0
    ) into v_source_has_rewards;

    if v_session.jackpot_hits >= 3 and v_session.free_spin_active = false and v_source_has_rewards = false then
        v_transition_free_spin := true;
    end if;

    select exists(
        select 1
        from jsonb_array_elements(coalesce(v_session.reels_state, '[]'::jsonb)) elem
        where (elem->>'is_free_spin')::boolean = true
           or coalesce((elem->>'free_spin_round')::int, 0) > 0
    ) into v_source_has_rewards;

    if v_source_has_rewards then
        select coalesce(jsonb_agg(elem), '[]'::jsonb) into v_source
        from jsonb_array_elements(coalesce(v_session.reels_state, '[]'::jsonb)) elem
        where (elem->>'is_free_spin')::boolean = true
           or coalesce((elem->>'free_spin_round')::int, 0) > 0;
    else
        v_source := coalesce(v_session.reels_state, '[]'::jsonb);
    end if;

    select exists(
        select 1
        from jsonb_array_elements(v_source) elem
        where (elem->>'is_bust')::boolean = false
          and elem->>'reward_type' is not null
          and elem->>'reward_type' <> 'multiplier'
          and (elem->>'amount')::numeric > 0
    ) into v_source_has_rewards;

    if v_source_has_rewards = false then
        v_source := coalesce(v_session.reels_state, '[]'::jsonb);
    end if;

    -- マルチプライヤー判定：multiplier報酬がある場合、倍率を取得
    declare
        v_multiplier numeric := 1;
        v_elem jsonb;
        v_mult_label text;
    begin
        for v_elem in
            select elem from jsonb_array_elements(v_source) elem
            where elem->>'reward_type' = 'multiplier'
        loop
            v_multiplier := v_multiplier + coalesce((v_elem->>'amount')::numeric, 0);
        end loop;

        for v_rewards in
            select
                elem->>'reward_type' as reward_type,
                elem->>'reward_id' as reward_id,
                elem->>'reward_name' as reward_name,
                sum((elem->>'amount')::numeric) as amount
            from jsonb_array_elements(v_source) elem
            where (elem->>'is_bust')::boolean = false
              and elem->>'reward_type' is not null
              and elem->>'reward_type' <> 'multiplier'
              and (elem->>'amount')::numeric > 0
            group by elem->>'reward_type', elem->>'reward_id', elem->>'reward_name'
            order by elem->>'reward_type', elem->>'reward_id'
        loop
            v_rewards.amount := v_rewards.amount * v_multiplier;
            if v_rewards.reward_type in ('gacha_ticket', 'mangan_ticket') then
                v_rewards.amount := round(v_rewards.amount, 1);
            else
                v_rewards.amount := floor(v_rewards.amount);
            end if;

            v_summary := v_summary || jsonb_build_array(jsonb_build_object(
                'type', v_rewards.reward_type,
                'reward_id', v_rewards.reward_id,
                'reward_name', v_rewards.reward_name,
                'amount', v_rewards.amount
            ));

            if v_rewards.reward_type = 'coin' then
                update public.profiles
                set coins = coins + v_rewards.amount::int,
                    total_assets = total_assets + v_rewards.amount::int
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
                    (coalesce((exchange_tickets->>v_rewards.reward_id)::int, 0) + v_rewards.amount::int)::text::jsonb
                )
                where discord_user_id = p_user_id;
            elsif v_rewards.reward_type = 'badge' then
                insert into public.user_badges_new (user_id, badge_id, purchased_price)
                select p_user_id, v_rewards.reward_id::uuid, 0
                from generate_series(1, v_rewards.amount::int);
            end if;
        end loop;

        if v_multiplier > 1 then
            v_mult_label := trim(trailing '.' from trim(trailing '0' from to_char(v_multiplier, 'FM999999990.99')));
            v_summary := jsonb_build_array(jsonb_build_object(
                'type', 'multiplier',
                'reward_name', v_mult_label || '倍',
                'amount', v_multiplier
            )) || v_summary;
        end if;
    end;

    if v_transition_free_spin then
        update public.slot_sessions
        set payout_summary = v_existing_summary || v_summary,
            free_spin_active = true,
            free_spins_remaining = v_session.jackpot_hits,
            free_spin_round = 1,
            current_reel = 1
        where id = v_session.id;

        select * into v_session from public.slot_sessions where id = v_session.id;

        return jsonb_build_object(
            'ok', true,
            'session', jsonb_build_object(
                'id', v_session.id,
                'status', v_session.status,
                'cost', v_session.cost,
                'current_reel', v_session.current_reel,
                'jackpot_hits', v_session.jackpot_hits,
                'jackpot_unlocked', v_session.jackpot_unlocked,
                'free_spin_active', v_session.free_spin_active,
                'free_spins_remaining', v_session.free_spins_remaining,
                'free_spin_round', v_session.free_spin_round,
                'free_spin_stocks', v_session.free_spin_stocks,
                'free_spin_confirmed', coalesce(v_session.free_spin_confirmed, false),
                'created_at', v_session.created_at
            ),
            'payout', v_summary,
            'outcome', 'free_spin'
        );
    end if;

    update public.slot_sessions
    set status = 'cashed_out',
        payout_summary = v_existing_summary || v_summary,
        ended_at = now()
    where id = v_session.id;

    select * into v_session from public.slot_sessions where id = v_session.id;

    return jsonb_build_object(
        'ok', true,
        'session', jsonb_build_object(
            'id', v_session.id,
            'status', v_session.status,
            'cost', v_session.cost,
            'current_reel', v_session.current_reel,
            'jackpot_hits', v_session.jackpot_hits,
            'jackpot_unlocked', v_session.jackpot_unlocked,
            'free_spin_active', v_session.free_spin_active,
            'free_spins_remaining', v_session.free_spins_remaining,
            'free_spin_round', v_session.free_spin_round,
            'free_spin_stocks', v_session.free_spin_stocks,
            'free_spin_confirmed', coalesce(v_session.free_spin_confirmed, false),
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

-- =============================
-- 8) RPC: Confirm jackpot -> enter free spin (safe)
-- =============================

create or replace function public.slot_confirm_jackpot(p_user_id text, p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = 'public'
as $$
declare
    v_session record;
    v_reels jsonb := '[]'::jsonb;
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
        return jsonb_build_object('ok', false, 'error', 'SESSION_NOT_ACTIVE');
    end if;

    if v_session.jackpot_unlocked = false then
        return jsonb_build_object('ok', false, 'error', 'JACKPOT_NOT_UNLOCKED');
    end if;

    if v_session.free_spin_confirmed = true then
        return jsonb_build_object('ok', false, 'error', 'FREE_SPIN_ALREADY_CONFIRMED');
    end if;

    -- 既にFS中ならリセットしない
    if v_session.free_spin_active = true then
        update public.slot_sessions
        set free_spin_confirmed = true,
            updated_at = now()
        where id = v_session.id;
    else
        update public.slot_sessions
        set free_spin_confirmed = true,
            free_spin_active = true,
            free_spins_remaining = greatest(v_session.jackpot_hits, 1),
            free_spin_round = 1,
            current_reel = 1,
            updated_at = now()
        where id = v_session.id;
    end if;

    v_reels := coalesce(v_session.reels_state, '[]'::jsonb);

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
            'jackpot_hits', v_session.jackpot_hits,
            'jackpot_unlocked', v_session.jackpot_unlocked,
            'free_spin_confirmed', v_session.free_spin_confirmed,
            'free_spin_active', v_session.free_spin_active,
            'free_spins_remaining', v_session.free_spins_remaining,
            'free_spin_round', v_session.free_spin_round,
            'created_at', v_session.created_at
        ),
        'reels', v_reels
    );
end;
$$;

-- slot_reel_positions from CSV
delete from public.slot_reel_positions;
insert into public.slot_reel_positions
(mode, reel_index, position_index, is_bust, is_jackpot, is_free_spin_stock, reward_type, reward_name, reward_id, amount, is_active)
values
('normal', 1, 1, false, true, false, 'multiplier', '倍率+1', null, 1.00, true
),
('normal', 1, 2, false, false, false, 'multiplier', '倍率+0.5', null, 0.50, true
),
('normal', 1, 3, false, false, false, 'coin', 'コイン +20', null, 20.00, true
),
('normal', 1, 4, false, false, false, 'coin', 'コイン +20', null, 20.00, true
),
('normal', 1, 5, false, false, false, 'coin', 'コイン +20', null, 20.00, true
),
('normal', 1, 6, false, false, false, 'coin', 'コイン +10', null, 10.00, true
),
('normal', 1, 7, false, false, false, 'coin', 'コイン +10', null, 10.00, true
),
('normal', 1, 8, false, false, false, 'coin', 'コイン +10', null, 10.00, true
),
('normal', 1, 9, false, false, false, 'coin', 'コイン +10', null, 10.00, true
),
('normal', 1, 10, true, false, false, null, null, null, 0.00, true
),
('normal', 2, 1, false, true, false, 'multiplier', '倍率+0.5', null, 0.50, true
),
('normal', 2, 2, false, false, false, 'multiplier', '倍率+0,5', null, 0.50, true
),
('normal', 2, 3, false, false, false, 'coin', 'コイン +50', null, 50.00, true
),
('normal', 2, 4, false, false, false, 'coin', 'コイン +30', null, 30.00, true
),
('normal', 2, 5, false, false, false, 'coin', 'コイン +20', null, 20.00, true
),
('normal', 2, 6, false, false, false, 'coin', 'コイン +10', null, 10.00, true
),
('normal', 2, 7, false, false, false, 'coin', 'コイン +10', null, 10.00, true
),
('normal', 2, 8, false, false, false, 'coin', 'コイン +10', null, 10.00, true
),
('normal', 2, 9, true, false, false, null, null, null, 0.00, true
),
('normal', 2, 10, true, false, false, null, null, null, 0.00, true
),
('normal', 3, 1, false, true, false, 'coin', 'コイン +100', null, 100.00, true
),
('normal', 3, 2, false, false, false, 'multiplier', '倍率+0.5', null, 0.50, true
),
('normal', 3, 3, false, false, false, 'coin', 'コイン +80', null, 80.00, true
),
('normal', 3, 4, false, false, false, 'coin', 'コイン +50', null, 50.00, true
),
('normal', 3, 5, false, false, false, 'coin', 'コイン +30', null, 30.00, true
),
('normal', 3, 6, false, false, false, 'coin', 'コイン +20', null, 20.00, true
),
('normal', 3, 7, false, false, false, 'coin', 'コイン +20', null, 20.00, true
),
('normal', 3, 8, true, false, false, null, null, null, 0.00, true
),
('normal', 3, 9, true, false, false, null, null, null, 0.00, true
),
('normal', 3, 10, true, false, false, null, null, null, 0.00, true
),
('normal', 4, 1, false, true, false, 'gacha_ticket', '祈願符+1', null, 1.00, true
),
('normal', 4, 2, false, false, false, 'coin', 'コイン +100', null, 100.00, true
),
('normal', 4, 3, false, false, false, 'coin', 'コイン +80', null, 80.00, true
),
('normal', 4, 4, false, false, false, 'coin', 'コイン +50', null, 50.00, true
),
('normal', 4, 5, false, false, false, 'coin', 'コイン +30', null, 30.00, true
),
('normal', 4, 6, false, false, false, 'coin', 'コイン +20', null, 20.00, true
),
('normal', 4, 7, true, false, false, null, null, null, 0.00, true
),
('normal', 4, 8, true, false, false, null, null, null, 0.00, true
),
('normal', 4, 9, true, false, false, null, null, null, 0.00, true
),
('normal', 4, 10, true, false, false, null, null, null, 0.00, true
),
('normal', 5, 1, false, true, false, 'gacha_ticket', '祈願符+2', null, 2.00, true
),
('normal', 5, 2, false, false, false, 'gacha_ticket', '祈願符+1', null, 1.00, true
),
('normal', 5, 3, false, false, false, 'coin', 'コイン +300', null, 300.00, true
),
('normal', 5, 4, false, false, false, 'coin', 'コイン +200', null, 200.00, true
),
('normal', 5, 5, false, false, false, 'coin', 'コイン +100', null, 100.00, true
),
('normal', 5, 6, true, false, false, null, null, null, 0.00, true
),
('normal', 5, 7, true, false, false, null, null, null, 0.00, true
),
('normal', 5, 8, true, false, false, null, null, null, 0.00, true
),
('normal', 5, 9, true, false, false, null, null, null, 0.00, true
),
('normal', 5, 10, true, false, false, null, null, null, 0.00, true
),
('normal', 6, 1, false, true, false, 'mangan_ticket', '満願符 +1', null, 1.00, true
),
('normal', 6, 2, false, true, false, 'gacha_ticket', '祈願符 +2', null, 2.00, true
),
('normal', 6, 3, false, true, false, 'gacha_ticket', '祈願符 +1', null, 1.00, true
),
('normal', 6, 4, false, true, false, 'coin', 'コイン+100', null, 100.00, true
),
('normal', 6, 5, true, false, false, null, null, null, 0.00, true
),
('normal', 6, 6, true, false, false, null, null, null, 0.00, true
),
('normal', 6, 7, true, false, false, null, null, null, 0.00, true
),
('normal', 6, 8, true, false, false, null, null, null, 0.00, true
),
('normal', 6, 9, true, false, false, null, null, null, 0.00, true
),
('normal', 6, 10, true, false, false, null, null, null, 0.00, true
),
('normal', 7, 1, false, true, false, 'mangan_ticket', '満願符 +3', null, 3.00, true
),
('normal', 7, 2, false, true, false, 'mangan_ticket', '満願符 +2', null, 2.00, true
),
('normal', 7, 3, false, true, false, 'gacha_ticket', '祈願符 +5', null, 5.00, true
),
('normal', 7, 4, true, false, false, null, null, null, 0.00, true
),
('normal', 7, 5, true, false, false, null, null, null, 0.00, true
),
('normal', 7, 6, true, false, false, null, null, null, 0.00, true
),
('normal', 7, 7, true, false, false, null, null, null, 0.00, true
),
('normal', 7, 8, true, false, false, null, null, null, 0.00, true
),
('normal', 7, 9, true, false, false, null, null, null, 0.00, true
),
('normal', 7, 10, true, false, false, null, null, null, 0.00, true
),
('free', 1, 1, false, false, true, 'multiplier', '倍率+0.1', null, 0.10, true
),
('free', 1, 2, false, false, false, 'multiplier', '倍率+0.2', null, 0.20, true
),
('free', 1, 3, false, false, false, 'multiplier', '倍率+0.3', null, 0.30, true
),
('free', 1, 4, false, false, false, 'multiplier', '倍率+0.4', null, 0.40, true
),
('free', 1, 5, false, false, false, 'multiplier', '倍率+0.5', null, 0.50, true
),
('free', 1, 6, false, false, false, 'mangan_ticket', '満願符+0.1', null, 0.10, true
),
('free', 1, 7, false, false, false, 'gacha_ticket', '祈願符+0.2', null, 0.20, true
),
('free', 1, 8, false, false, false, 'coin', 'コイン+50', null, 50.00, true
),
('free', 1, 9, false, false, false, 'coin', 'コイン+30', null, 30.00, true
),
('free', 1, 10, false, false, false, 'coin', 'コイン+10', null, 10.00, true
),
('free', 2, 1, false, false, false, 'multiplier', '倍率+0.1', null, 0.10, true
),
('free', 2, 2, false, false, true, 'multiplier', '倍率+0.2', null, 0.20, true
),
('free', 2, 3, false, false, false, 'multiplier', '倍率+0.3', null, 0.30, true
),
('free', 2, 4, false, false, false, 'multiplier', '倍率+0.4', null, 0.40, true
),
('free', 2, 5, false, false, false, 'multiplier', '倍率+0.5', null, 0.50, true
),
('free', 2, 6, false, false, false, 'mangan_ticket', '満願符+0.1', null, 0.10, true
),
('free', 2, 7, false, false, false, 'gacha_ticket', '祈願符+0.2', null, 0.20, true
),
('free', 2, 8, false, false, false, 'coin', 'コイン+50', null, 50.00, true
),
('free', 2, 9, false, false, false, 'coin', 'コイン+30', null, 30.00, true
),
('free', 2, 10, false, false, false, 'coin', 'コイン+10', null, 10.00, true
),
('free', 3, 1, false, false, false, 'multiplier', '倍率+0.1', null, 0.10, true
),
('free', 3, 2, false, false, false, 'multiplier', '倍率+0.2', null, 0.20, true
),
('free', 3, 3, false, false, true, 'multiplier', '倍率+0.3', null, 0.30, true
),
('free', 3, 4, false, false, false, 'multiplier', '倍率+0.4', null, 0.40, true
),
('free', 3, 5, false, false, false, 'multiplier', '倍率+0.5', null, 0.50, true
),
('free', 3, 6, false, false, false, 'mangan_ticket', '満願符+0.1', null, 0.10, true
),
('free', 3, 7, false, false, false, 'gacha_ticket', '祈願符+0.2', null, 0.20, true
),
('free', 3, 8, false, false, false, 'coin', 'コイン+50', null, 50.00, true
),
('free', 3, 9, false, false, false, 'coin', 'コイン+30', null, 30.00, true
),
('free', 3, 10, false, false, false, 'coin', 'コイン+10', null, 10.00, true
),
('free', 4, 1, false, false, false, 'multiplier', '倍率+0.1', null, 0.10, true
),
('free', 4, 2, false, false, false, 'multiplier', '倍率+0.2', null, 0.20, true
),
('free', 4, 3, false, false, false, 'multiplier', '倍率+0.3', null, 0.30, true
),
('free', 4, 4, false, false, true, 'multiplier', '倍率+0.4', null, 0.40, true
),
('free', 4, 5, false, false, false, 'multiplier', '倍率+0.5', null, 0.50, true
),
('free', 4, 6, false, false, false, 'mangan_ticket', '満願符+0.1', null, 0.10, true
),
('free', 4, 7, false, false, false, 'gacha_ticket', '祈願符+0.2', null, 0.20, true
),
('free', 4, 8, false, false, false, 'coin', 'コイン+50', null, 50.00, true
),
('free', 4, 9, false, false, false, 'coin', 'コイン+30', null, 30.00, true
),
('free', 4, 10, false, false, false, 'coin', 'コイン+10', null, 10.00, true
),
('free', 5, 1, false, false, false, 'multiplier', '倍率+0.1', null, 0.10, true
),
('free', 5, 2, false, false, false, 'multiplier', '倍率+0.2', null, 0.20, true
),
('free', 5, 3, false, false, false, 'multiplier', '倍率+0.3', null, 0.30, true
),
('free', 5, 4, false, false, false, 'multiplier', '倍率+0.4', null, 0.40, true
),
('free', 5, 5, false, false, true, 'multiplier', '倍率+0.5', null, 0.50, true
),
('free', 5, 6, false, false, false, 'mangan_ticket', '満願符+0.1', null, 0.10, true
),
('free', 5, 7, false, false, false, 'gacha_ticket', '祈願符+0.2', null, 0.20, true
),
('free', 5, 8, false, false, false, 'coin', 'コイン+50', null, 50.00, true
),
('free', 5, 9, false, false, false, 'coin', 'コイン+30', null, 30.00, true
),
('free', 5, 10, false, false, false, 'coin', 'コイン+10', null, 10.00, true
),
('free', 6, 1, false, false, true, 'multiplier', '倍率+0.1', null, 0.10, true
),
('free', 6, 2, false, false, false, 'multiplier', '倍率+0.2', null, 0.20, true
),
('free', 6, 3, false, false, false, 'multiplier', '倍率+0.3', null, 0.30, true
),
('free', 6, 4, false, false, false, 'multiplier', '倍率+0.4', null, 0.40, true
),
('free', 6, 5, false, false, false, 'multiplier', '倍率+0.5', null, 0.50, true
),
('free', 6, 6, false, false, false, 'multiplier', '倍率+0.6', null, 0.60, true
),
('free', 6, 7, false, false, false, 'multiplier', '倍率+0.7', null, 0.70, true
),
('free', 6, 8, false, false, false, 'multiplier', '倍率+0.8', null, 0.80, true
),
('free', 6, 9, false, false, false, 'multiplier', '倍率+0.9', null, 0.90, true
),
('free', 6, 10, false, false, false, 'multiplier', '倍率+1', null, 1.00, true
),
('free', 7, 1, false, false, false, 'mangan_ticket', '満願符+0.3', null, 0.30, true
),
('free', 7, 2, false, false, false, 'mangan_ticket', '満願符+0.1', null, 0.10, true
),
('free', 7, 3, false, false, true, 'gacha_ticket', '祈願符+1', null, 1.00, true
),
('free', 7, 4, false, false, false, 'gacha_ticket', '祈願符+0.7', null, 0.70, true
),
('free', 7, 5, false, false, false, 'gacha_ticket', '祈願符+0.5', null, 0.50, true
),
('free', 7, 6, false, false, false, 'gacha_ticket', '祈願符+0.2', null, 0.20, true
),
('free', 7, 7, false, false, false, 'coin', 'コイン+100', null, 100.00, true
),
('free', 7, 8, false, false, false, 'coin', 'コイン+50', null, 50.00, true
),
('free', 7, 9, false, false, false, 'coin', 'コイン+30', null, 30.00, true
),
('free', 7, 10, false, false, false, 'coin', 'コイン+10', null, 10.00, true);

-- page settings entry (コスト設定を config に格納)
insert into public.page_settings (path, name, is_active, config)
values ('/event/slot.html', '期間限定イベント：スロット', false, '{"slot_cost": 100}'::jsonb)
on conflict (path) do update
set name = excluded.name,
    config = coalesce(excluded.config, '{}'::jsonb);

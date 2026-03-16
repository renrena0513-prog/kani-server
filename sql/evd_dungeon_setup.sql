-- 欲望ダンジョン MVP セットアップ
-- TODO: badges の永続化先が確定したら秘宝箱報酬を別テーブルへ反映する

create extension if not exists pgcrypto;

create or replace function public.evd_current_user_id()
returns text
language sql
stable
as $$
    select coalesce(auth.jwt() -> 'user_metadata' ->> 'provider_id', '');
$$;

create table if not exists public.evd_item_catalog (
    code text primary key,
    name text not null,
    description text not null,
    item_kind text not null,
    shop_pool text not null default 'なし',
    carry_in_allowed boolean not null default true,
    base_price integer not null default 0,
    max_stack integer not null default 9,
    effect_data jsonb not null default '{}'::jsonb,
    is_active boolean not null default true,
    sort_order integer not null default 0,
    created_at timestamptz not null default now()
);

create table if not exists public.evd_player_item_stocks (
    user_id text not null,
    item_code text not null references public.evd_item_catalog(code) on delete cascade,
    quantity integer not null default 0 check (quantity >= 0),
    updated_at timestamptz not null default now(),
    primary key (user_id, item_code)
);

create table if not exists public.evd_game_balance_profiles (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    description text not null default '',
    config jsonb not null,
    is_active boolean not null default true,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create table if not exists public.evd_game_runs (
    id uuid primary key default gen_random_uuid(),
    user_id text not null,
    generation_profile_id uuid not null references public.evd_game_balance_profiles(id),
    status text not null default '進行中',
    entry_fee integer not null default 1000,
    board_size integer not null default 7,
    max_floors integer not null default 10,
    current_floor integer not null default 1,
    current_x integer not null default 3,
    current_y integer not null default 3,
    life integer not null default 3,
    max_life integer not null default 3,
    run_coins integer not null default 0,
    secured_coins integer not null default 0,
    badges_gained integer not null default 0,
    gacha_tickets_gained integer not null default 0,
    mangan_tickets_gained integer not null default 0,
    floor_bonus_total integer not null default 0,
    final_return_multiplier numeric(8, 2) not null default 1.0,
    substitute_negates_remaining integer not null default 0,
    inventory_state jsonb not null default '{"items":{},"flags":{},"pending_resolution":null,"pending_shop":null}'::jsonb,
    death_reason text,
    result_payout integer not null default 0,
    started_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    last_active_at timestamptz not null default now(),
    ended_at timestamptz,
    version integer not null default 1
);

create table if not exists public.evd_run_floors (
    id uuid primary key default gen_random_uuid(),
    run_id uuid not null references public.evd_game_runs(id) on delete cascade,
    user_id text not null,
    floor_no integer not null,
    start_x integer not null,
    start_y integer not null,
    stairs_x integer not null,
    stairs_y integer not null,
    grid jsonb not null,
    revealed jsonb not null default '[]'::jsonb,
    visited jsonb not null default '[]'::jsonb,
    floor_status text not null default '進行中',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (run_id, floor_no)
);

create table if not exists public.evd_run_events (
    id bigserial primary key,
    run_id uuid not null references public.evd_game_runs(id) on delete cascade,
    user_id text not null,
    floor_no integer not null,
    step_no integer not null,
    event_type text not null,
    message text not null,
    payload jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);

create unique index if not exists evd_game_runs_active_user_uq
    on public.evd_game_runs(user_id)
    where status = '進行中';

create index if not exists evd_run_floors_run_floor_idx on public.evd_run_floors(run_id, floor_no);
create index if not exists evd_run_events_run_step_idx on public.evd_run_events(run_id, step_no desc);
create index if not exists evd_run_events_user_idx on public.evd_run_events(user_id, created_at desc);

alter table public.evd_item_catalog enable row level security;
alter table public.evd_player_item_stocks enable row level security;
alter table public.evd_game_balance_profiles enable row level security;
alter table public.evd_game_runs enable row level security;
alter table public.evd_run_floors enable row level security;
alter table public.evd_run_events enable row level security;

drop policy if exists evd_item_catalog_read on public.evd_item_catalog;
create policy evd_item_catalog_read on public.evd_item_catalog
for select using (true);

drop policy if exists evd_balance_profiles_read on public.evd_game_balance_profiles;
create policy evd_balance_profiles_read on public.evd_game_balance_profiles
for select using (true);

drop policy if exists evd_player_item_stocks_rw on public.evd_player_item_stocks;
create policy evd_player_item_stocks_rw on public.evd_player_item_stocks
for all using (user_id = public.evd_current_user_id())
with check (user_id = public.evd_current_user_id());

drop policy if exists evd_game_runs_rw on public.evd_game_runs;
create policy evd_game_runs_rw on public.evd_game_runs
for all using (user_id = public.evd_current_user_id())
with check (user_id = public.evd_current_user_id());

drop policy if exists evd_run_floors_rw on public.evd_run_floors;
create policy evd_run_floors_rw on public.evd_run_floors
for all using (user_id = public.evd_current_user_id())
with check (user_id = public.evd_current_user_id());

drop policy if exists evd_run_events_rw on public.evd_run_events;
create policy evd_run_events_rw on public.evd_run_events
for all using (user_id = public.evd_current_user_id())
with check (user_id = public.evd_current_user_id());

insert into public.evd_item_catalog (code, name, description, item_kind, shop_pool, carry_in_allowed, base_price, max_stack, effect_data, sort_order)
values
    ('escape_rope', '脱出のひも', 'その場で即帰還して精算する。', '手動', '通常', true, 180, 3, '{"effect":"return"}', 10),
    ('bomb_radar', '爆弾レーダー', 'その階の爆弾系マス数を感知する。', '手動', '通常', true, 160, 3, '{"effect":"bomb_radar"}', 20),
    ('healing_potion', '回復ポーション', 'ライフを 1 回復する。', '手動', '通常', true, 220, 3, '{"effect":"heal","amount":1}', 30),
    ('insurance_token', '保険札', '死亡時にそのランの所持コイン半分を持ち帰る。', '自動', '通常', true, 260, 1, '{"effect":"insurance"}', 40),
    ('stairs_search', '階段サーチ', 'その階の下り階段を可視化する。', '手動', '通常', true, 240, 3, '{"effect":"stairs_search"}', 50),
    ('calamity_map', '厄災の地図', '爆弾以外の危険マスを可視化する。', '手動', '通常', true, 280, 3, '{"effect":"hazard_map"}', 60),
    ('holy_grail', '女神の聖杯', 'ライフ全快し、最大ライフを 1 増やす。', '手動', '限定', true, 680, 1, '{"effect":"holy_grail"}', 70),
    ('substitute_doll', '身代わり人形', 'マイナス効果を 3 回まで無効化する。', '自動', '限定', true, 620, 2, '{"effect":"substitute","charges":3}', 80),
    ('abyss_ticket', '奈落直通札', '3 階層先へ直行する。', '手動', '限定', true, 760, 1, '{"effect":"abyss_ticket","floors":3}', 90),
    ('golden_contract', '黄金契約書', '無事に帰還した時の報酬を 2 倍にする。', '自動', '限定', true, 820, 1, '{"effect":"golden_contract"}', 100),
    ('full_scan_map', '完全探査図', 'その階の爆弾位置を可視化する。', '手動', '限定', true, 540, 2, '{"effect":"full_scan"}', 110),
    ('vault_box', '保全金庫', '入手時点の所持コイン 70% を確保する。', '自動', '限定', true, 740, 1, '{"effect":"vault_box","rate":0.7}', 120)
on conflict (code) do update
set
    name = excluded.name,
    description = excluded.description,
    item_kind = excluded.item_kind,
    shop_pool = excluded.shop_pool,
    carry_in_allowed = excluded.carry_in_allowed,
    base_price = excluded.base_price,
    max_stack = excluded.max_stack,
    effect_data = excluded.effect_data,
    is_active = true,
    sort_order = excluded.sort_order;

insert into public.evd_game_balance_profiles (name, description, config, is_active)
select
    'default',
    '欲望ダンジョン MVP 標準設定',
    '{
      "floor_bonuses": {"2":80,"3":120,"4":180,"5":280,"6":420,"7":650,"8":1000,"9":1500,"10":2200},
      "thief_ransom": {"1":150,"2":150,"3":300,"4":300,"5":500,"6":500,"7":800,"8":800,"9":1200,"10":1200},
      "value_ranges": {
        "1":{"小銭":[40,120],"宝箱":[120,240],"財宝箱":[280,420],"祝福":[1.10,1.25],"罠":[60,140],"呪い":[0.75,0.92]},
        "2":{"小銭":[60,140],"宝箱":[160,300],"財宝箱":[340,520],"祝福":[1.12,1.28],"罠":[80,170],"呪い":[0.74,0.90]},
        "3":{"小銭":[80,180],"宝箱":[220,360],"財宝箱":[420,650],"祝福":[1.15,1.30],"罠":[100,220],"呪い":[0.72,0.89]},
        "4":{"小銭":[100,220],"宝箱":[260,420],"財宝箱":[520,760],"祝福":[1.18,1.34],"罠":[130,260],"呪い":[0.70,0.88]},
        "5":{"小銭":[120,260],"宝箱":[320,480],"財宝箱":[650,900],"祝福":[1.20,1.38],"罠":[160,320],"呪い":[0.68,0.86]},
        "6":{"小銭":[150,300],"宝箱":[360,540],"財宝箱":[760,1050],"祝福":[1.22,1.42],"罠":[190,380],"呪い":[0.66,0.84]},
        "7":{"小銭":[180,340],"宝箱":[420,620],"財宝箱":[900,1220],"祝福":[1.25,1.48],"罠":[220,430],"呪い":[0.64,0.82]},
        "8":{"小銭":[210,380],"宝箱":[480,700],"財宝箱":[1050,1380],"祝福":[1.28,1.52],"罠":[260,500],"呪い":[0.62,0.80]},
        "9":{"小銭":[250,420],"宝箱":[560,780],"財宝箱":[1220,1560],"祝福":[1.30,1.56],"罠":[300,560],"呪い":[0.60,0.78]},
        "10":{"小銭":[300,480],"宝箱":[650,880],"財宝箱":[1400,1760],"祝福":[1.34,1.62],"罠":[340,620],"呪い":[0.58,0.76]}
      },
      "tile_weights": {
        "1":{"空白":24,"小銭":14,"宝箱":10,"財宝箱":4,"秘宝箱":1,"宝石箱":2,"祝福":2,"泉":2,"爆弾":8,"大爆発":2,"罠":6,"呪い":3,"盗賊":2,"落とし穴":1,"ショップ":2,"限定ショップ":0},
        "2":{"空白":22,"小銭":14,"宝箱":10,"財宝箱":4,"秘宝箱":1,"宝石箱":2,"祝福":2,"泉":2,"爆弾":9,"大爆発":2,"罠":6,"呪い":3,"盗賊":2,"落とし穴":1,"ショップ":2,"限定ショップ":0},
        "3":{"空白":20,"小銭":12,"宝箱":11,"財宝箱":5,"秘宝箱":1,"宝石箱":2,"祝福":2,"泉":2,"爆弾":9,"大爆発":3,"罠":7,"呪い":4,"盗賊":3,"落とし穴":2,"ショップ":2,"限定ショップ":1},
        "4":{"空白":18,"小銭":12,"宝箱":10,"財宝箱":6,"秘宝箱":1,"宝石箱":2,"祝福":2,"泉":2,"爆弾":10,"大爆発":3,"罠":7,"呪い":4,"盗賊":3,"落とし穴":2,"ショップ":2,"限定ショップ":1},
        "5":{"空白":16,"小銭":11,"宝箱":10,"財宝箱":6,"秘宝箱":2,"宝石箱":3,"祝福":2,"泉":2,"爆弾":10,"大爆発":4,"罠":7,"呪い":5,"盗賊":3,"落とし穴":2,"転送罠":2,"ショップ":2,"限定ショップ":1},
        "6":{"空白":15,"小銭":10,"宝箱":10,"財宝箱":7,"秘宝箱":2,"宝石箱":3,"祝福":2,"泉":2,"爆弾":10,"大爆発":4,"罠":8,"呪い":5,"盗賊":3,"落とし穴":2,"転送罠":2,"ショップ":2,"限定ショップ":1},
        "7":{"空白":14,"小銭":10,"宝箱":9,"財宝箱":7,"秘宝箱":2,"宝石箱":3,"祝福":2,"泉":2,"爆弾":10,"大爆発":5,"罠":8,"呪い":5,"盗賊":4,"落とし穴":2,"転送罠":2,"ショップ":2,"限定ショップ":1},
        "8":{"空白":12,"小銭":9,"宝箱":9,"財宝箱":8,"秘宝箱":2,"宝石箱":3,"祝福":2,"泉":2,"爆弾":11,"大爆発":5,"罠":8,"呪い":5,"盗賊":4,"落とし穴":2,"転送罠":3,"ショップ":2,"限定ショップ":1},
        "9":{"空白":10,"小銭":8,"宝箱":8,"財宝箱":9,"秘宝箱":2,"宝石箱":4,"祝福":2,"泉":2,"爆弾":11,"大爆発":6,"罠":9,"呪い":5,"盗賊":4,"落とし穴":2,"転送罠":3,"ショップ":2,"限定ショップ":1},
        "10":{"空白":8,"小銭":8,"宝箱":8,"財宝箱":10,"秘宝箱":3,"宝石箱":4,"祝福":2,"泉":2,"爆弾":11,"大爆発":6,"罠":9,"呪い":6,"盗賊":4,"落とし穴":3,"転送罠":3,"ショップ":2,"限定ショップ":1}
      }
    }'::jsonb,
    true
where not exists (
    select 1 from public.evd_game_balance_profiles where name = 'default'
);

insert into public.page_settings (path, name, is_active)
values ('/event/dungeon.html', '期間限定イベント：欲望ダンジョン', true)
on conflict (path) do update
set name = excluded.name,
    is_active = excluded.is_active;

create or replace function public.evd_random_int(p_min integer, p_max integer)
returns integer
language sql
as $$
    select floor(random() * ((p_max - p_min) + 1) + p_min)::integer;
$$;

create or replace function public.evd_random_numeric(p_min numeric, p_max numeric)
returns numeric
language sql
as $$
    select round((random() * (p_max - p_min) + p_min)::numeric, 2);
$$;

create or replace function public.evd_pick_weighted(p_weights jsonb)
returns text
language plpgsql
as $$
declare
    v_total integer := 0;
    v_roll numeric;
    v_acc integer := 0;
    v_key text;
    v_val integer;
begin
    for v_key, v_val in
        select key, value::integer
        from jsonb_each_text(p_weights)
    loop
        if v_val > 0 then
            v_total := v_total + v_val;
        end if;
    end loop;

    if v_total <= 0 then
        return '空白';
    end if;

    v_roll := floor(random() * v_total) + 1;

    for v_key, v_val in
        select key, value::integer
        from jsonb_each_text(p_weights)
    loop
        if v_val > 0 then
            v_acc := v_acc + v_val;
            if v_roll <= v_acc then
                return v_key;
            end if;
        end if;
    end loop;

    return '空白';
end;
$$;

create or replace function public.evd_get_range_value(p_config jsonb, p_floor integer, p_key text, p_numeric boolean default false)
returns numeric
language plpgsql
as $$
declare
    v_floor_key text := p_floor::text;
    v_range jsonb;
begin
    v_range := p_config -> 'value_ranges' -> v_floor_key -> p_key;
    if v_range is null then
        return 0;
    end if;

    if p_numeric then
        return public.evd_random_numeric((v_range ->> 0)::numeric, (v_range ->> 1)::numeric);
    end if;

    return public.evd_random_int((v_range ->> 0)::integer, (v_range ->> 1)::integer);
end;
$$;

create or replace function public.evd_set_cell(p_grid jsonb, p_x integer, p_y integer, p_cell jsonb)
returns jsonb
language sql
immutable
as $$
    select jsonb_set(p_grid, array[p_y::text, p_x::text], p_cell, true);
$$;

create or replace function public.evd_get_cell(p_grid jsonb, p_x integer, p_y integer)
returns jsonb
language sql
immutable
as $$
    select p_grid -> p_y -> p_x;
$$;

create or replace function public.evd_add_item(p_inventory jsonb, p_item_code text, p_amount integer default 1)
returns jsonb
language plpgsql
as $$
declare
    v_qty integer;
begin
    v_qty := coalesce((p_inventory -> 'items' -> p_item_code ->> 'quantity')::integer, 0) + p_amount;
    return jsonb_set(
        p_inventory,
        array['items', p_item_code],
        jsonb_build_object('quantity', v_qty),
        true
    );
end;
$$;

create or replace function public.evd_remove_item(p_inventory jsonb, p_item_code text, p_amount integer default 1)
returns jsonb
language plpgsql
as $$
declare
    v_qty integer;
begin
    v_qty := greatest(coalesce((p_inventory -> 'items' -> p_item_code ->> 'quantity')::integer, 0) - p_amount, 0);
    if v_qty = 0 then
        return jsonb_set(p_inventory, array['items', p_item_code], '{"quantity":0}'::jsonb, true);
    end if;

    return jsonb_set(
        p_inventory,
        array['items', p_item_code],
        jsonb_build_object('quantity', v_qty),
        true
    );
end;
$$;

create or replace function public.evd_add_log(
    p_run_id uuid,
    p_user_id text,
    p_floor_no integer,
    p_event_type text,
    p_message text,
    p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
as $$
declare
    v_step integer;
begin
    select coalesce(max(step_no), 0) + 1
      into v_step
      from public.evd_run_events
     where run_id = p_run_id;

    insert into public.evd_run_events (run_id, user_id, floor_no, step_no, event_type, message, payload)
    values (p_run_id, p_user_id, p_floor_no, v_step, p_event_type, p_message, p_payload);
end;
$$;

create or replace function public.evd_build_snapshot(p_run_id uuid, p_user_id text)
returns jsonb
language plpgsql
as $$
declare
    v_run public.evd_game_runs%rowtype;
    v_floor public.evd_run_floors%rowtype;
    v_profile record;
    v_logs jsonb;
begin
    select * into v_run from public.evd_game_runs where id = p_run_id and user_id = p_user_id;
    select * into v_floor from public.evd_run_floors where run_id = p_run_id and floor_no = v_run.current_floor;
    select coins, total_assets, gacha_tickets, mangan_tickets, account_name
      into v_profile
      from public.profiles
     where discord_user_id = p_user_id;

    select coalesce(jsonb_agg(to_jsonb(t) order by t.step_no), '[]'::jsonb)
      into v_logs
      from (
        select event_type, message, created_at, step_no
          from public.evd_run_events
         where run_id = p_run_id
         order by step_no desc
         limit 40
      ) t;

    return jsonb_build_object(
        'run', to_jsonb(v_run),
        'floor', to_jsonb(v_floor),
        'profile', to_jsonb(v_profile),
        'logs', v_logs
    );
end;
$$;

create or replace function public.evd_generate_shop_offers(p_shop_type text)
returns jsonb
language sql
as $$
    select coalesce(jsonb_agg(jsonb_build_object(
        'code', code,
        'name', name,
        'description', description,
        'price', base_price
    )), '[]'::jsonb)
    from (
        select code, name, description, base_price
          from public.evd_item_catalog
         where is_active = true
           and (
                (p_shop_type = 'ショップ' and shop_pool in ('通常', '両方'))
             or (p_shop_type = '限定ショップ' and shop_pool in ('限定', '両方'))
           )
         order by random()
         limit 3
    ) q;
$$;

create or replace function public.evd_generate_floor(p_profile_id uuid, p_floor_no integer, p_board_size integer default 7)
returns jsonb
language plpgsql
as $$
declare
    v_config jsonb;
    v_weights jsonb;
    v_grid jsonb := '[]'::jsonb;
    v_row jsonb;
    v_x integer;
    v_y integer;
    v_stairs_x integer;
    v_stairs_y integer;
    v_cell_type text;
    v_cell jsonb;
begin
    select config into v_config from public.evd_game_balance_profiles where id = p_profile_id;
    v_weights := v_config -> 'tile_weights' -> p_floor_no::text;

    v_stairs_x := floor(random() * p_board_size)::integer;
    v_stairs_y := floor(random() * p_board_size)::integer;
    while v_stairs_x = 3 and v_stairs_y = 3 loop
        v_stairs_x := floor(random() * p_board_size)::integer;
        v_stairs_y := floor(random() * p_board_size)::integer;
    end loop;

    for v_y in 0..(p_board_size - 1) loop
        v_row := '[]'::jsonb;
        for v_x in 0..(p_board_size - 1) loop
            if v_x = 3 and v_y = 3 then
                v_cell_type := '空白';
            elsif v_x = v_stairs_x and v_y = v_stairs_y then
                v_cell_type := '下り階段';
            else
                v_cell_type := public.evd_pick_weighted(v_weights);
            end if;

            v_cell := jsonb_build_object(
                'x', v_x,
                'y', v_y,
                'type', v_cell_type,
                'revealed', (v_x = 3 and v_y = 3),
                'visited', (v_x = 3 and v_y = 3),
                'resolved', (v_x = 3 and v_y = 3),
                'hint',
                    case
                        when v_cell_type in ('爆弾', '大爆発') then 'bomb'
                        when v_cell_type in ('罠', '呪い', '盗賊', '落とし穴', '転送罠') then 'hazard'
                        else null
                    end
            );
            v_row := v_row || jsonb_build_array(v_cell);
        end loop;
        v_grid := v_grid || jsonb_build_array(v_row);
    end loop;

    return jsonb_build_object(
        'start_x', 3,
        'start_y', 3,
        'stairs_x', v_stairs_x,
        'stairs_y', v_stairs_y,
        'grid', v_grid,
        'revealed', jsonb_build_array('3,3'),
        'visited', jsonb_build_array('3,3'),
        'floor_status', '進行中'
    );
end;
$$;

create or replace function public.evd_finish_run(
    p_run_id uuid,
    p_user_id text,
    p_status text,
    p_reason text
)
returns jsonb
language plpgsql
as $$
declare
    v_run public.evd_game_runs%rowtype;
    v_payout integer;
    v_flags jsonb;
begin
    select * into v_run from public.evd_game_runs where id = p_run_id and user_id = p_user_id for update;
    if not found then
        raise exception 'ランが見つかりません';
    end if;

    v_flags := coalesce(v_run.inventory_state -> 'flags', '{}'::jsonb);
    if p_status = '帰還' then
        v_payout := floor((v_run.run_coins + v_run.secured_coins) * case when coalesce((v_flags ->> 'golden_contract_active')::boolean, false) then 2 else v_run.final_return_multiplier end)::integer;
    elsif coalesce((v_flags ->> 'insurance_active')::boolean, false) then
        v_payout := v_run.secured_coins + floor(v_run.run_coins / 2.0)::integer;
        v_flags := jsonb_set(v_flags, array['insurance_active'], 'false'::jsonb, true);
        v_run.inventory_state := jsonb_set(v_run.inventory_state, array['flags'], v_flags, true);
    else
        v_payout := v_run.secured_coins;
    end if;

    update public.evd_game_runs
       set status = p_status,
           death_reason = p_reason,
           result_payout = greatest(v_payout, 0),
           inventory_state = v_run.inventory_state,
           ended_at = now(),
           updated_at = now(),
           last_active_at = now(),
           version = version + 1
     where id = p_run_id;

    update public.profiles
       set coins = coalesce(coins, 0) + greatest(v_payout, 0),
           total_assets = coalesce(total_assets, 0) + greatest(v_payout, 0),
           gacha_tickets = coalesce(gacha_tickets, 0) + coalesce(v_run.gacha_tickets_gained, 0),
           mangan_tickets = coalesce(mangan_tickets, 0) + coalesce(v_run.mangan_tickets_gained, 0)
     where discord_user_id = p_user_id;

    perform public.evd_add_log(
        p_run_id,
        p_user_id,
        v_run.current_floor,
        case when p_status = '帰還' then '帰還' else '死亡' end,
        case when p_status = '帰還'
             then format('無事に帰還して %s コイン持ち帰った。', v_payout)
             else format('%s。%s コインを持ち帰った。', p_reason, v_payout)
        end,
        jsonb_build_object('payout', v_payout)
    );

    return public.evd_build_snapshot(p_run_id, p_user_id);
end;
$$;

create or replace function public.evd_start_run(p_carry_items text[] default '{}')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id text := public.evd_current_user_id();
    v_run_id uuid;
    v_profile_id uuid;
    v_profile record;
    v_floor_seed jsonb;
    v_inventory jsonb := jsonb_build_object(
        'items', '{}'::jsonb,
        'flags', jsonb_build_object(
            'insurance_active', false,
            'golden_contract_active', false,
            'stairs_known', false,
            'hazards_known', false,
            'bombs_known', false
        ),
        'floor_bonus_preview', (select config -> 'floor_bonuses' from public.evd_game_balance_profiles where is_active = true order by updated_at desc limit 1),
        'pending_resolution', null,
        'pending_shop', null
    );
    v_item text;
    v_effect text;
begin
    if v_user_id = '' then
        raise exception 'ログインが必要です';
    end if;

    perform pg_advisory_xact_lock(hashtext('evd:' || v_user_id));

    if array_length(p_carry_items, 1) > 2 then
        raise exception '持ち込みは 2 個までです';
    end if;

    if exists (select 1 from public.evd_game_runs where user_id = v_user_id and status = '進行中') then
        raise exception '進行中のランがあります';
    end if;

    select discord_user_id, coins into v_profile
      from public.profiles
     where discord_user_id = v_user_id
     for update;

    if not found then
        raise exception 'プロフィールが見つかりません';
    end if;

    if coalesce(v_profile.coins, 0) < 1000 then
        raise exception 'コインが足りません';
    end if;

    update public.profiles
       set coins = coins - 1000
     where discord_user_id = v_user_id;

    select id
      into v_profile_id
      from public.evd_game_balance_profiles
     where is_active = true
     order by updated_at desc
     limit 1;

    foreach v_item in array p_carry_items loop
        update public.evd_player_item_stocks
           set quantity = quantity - 1,
               updated_at = now()
         where user_id = v_user_id
           and item_code = v_item
           and quantity > 0;

        if not found then
            raise exception '持ち込み在庫が不足しています: %', v_item;
        end if;

        select effect_data ->> 'effect' into v_effect from public.evd_item_catalog where code = v_item;
        if v_effect = 'substitute' then
            v_inventory := jsonb_set(v_inventory, array['flags', 'substitute_ready'], 'true'::jsonb, true);
        elsif v_effect = 'insurance' then
            v_inventory := jsonb_set(v_inventory, array['flags', 'insurance_active'], 'true'::jsonb, true);
        elsif v_effect = 'golden_contract' then
            v_inventory := jsonb_set(v_inventory, array['flags', 'golden_contract_active'], 'true'::jsonb, true);
        else
            v_inventory := public.evd_add_item(v_inventory, v_item, 1);
        end if;
    end loop;

    insert into public.evd_game_runs (
        user_id, generation_profile_id, status, inventory_state, substitute_negates_remaining
    )
    values (
        v_user_id,
        v_profile_id,
        '進行中',
        v_inventory,
        case when coalesce((v_inventory -> 'flags' ->> 'substitute_ready')::boolean, false) then 3 else 0 end
    )
    returning id into v_run_id;

    v_floor_seed := public.evd_generate_floor(v_profile_id, 1, 7);

    insert into public.evd_run_floors (
        run_id, user_id, floor_no, start_x, start_y, stairs_x, stairs_y, grid, revealed, visited, floor_status
    )
    values (
        v_run_id,
        v_user_id,
        1,
        (v_floor_seed ->> 'start_x')::integer,
        (v_floor_seed ->> 'start_y')::integer,
        (v_floor_seed ->> 'stairs_x')::integer,
        (v_floor_seed ->> 'stairs_y')::integer,
        v_floor_seed -> 'grid',
        v_floor_seed -> 'revealed',
        v_floor_seed -> 'visited',
        '進行中'
    );

    perform public.evd_add_log(v_run_id, v_user_id, 1, 'プレイ開始', '欲望ダンジョンへ入場した。', jsonb_build_object('carry_items', p_carry_items));

    return public.evd_build_snapshot(v_run_id, v_user_id);
end;
$$;

create or replace function public.evd_resolve_floor_shift(
    p_run_id uuid,
    p_user_id text,
    p_target_floor integer,
    p_status text default '進行中'
)
returns void
language plpgsql
as $$
declare
    v_run public.evd_game_runs%rowtype;
    v_floor_seed jsonb;
begin
    select * into v_run from public.evd_game_runs where id = p_run_id and user_id = p_user_id for update;

    if not exists (
        select 1 from public.evd_run_floors where run_id = p_run_id and floor_no = p_target_floor
    ) then
        v_floor_seed := public.evd_generate_floor(v_run.generation_profile_id, p_target_floor, v_run.board_size);
        insert into public.evd_run_floors (
            run_id, user_id, floor_no, start_x, start_y, stairs_x, stairs_y, grid, revealed, visited, floor_status
        )
        values (
            p_run_id,
            p_user_id,
            p_target_floor,
            (v_floor_seed ->> 'start_x')::integer,
            (v_floor_seed ->> 'start_y')::integer,
            (v_floor_seed ->> 'stairs_x')::integer,
            (v_floor_seed ->> 'stairs_y')::integer,
            v_floor_seed -> 'grid',
            v_floor_seed -> 'revealed',
            v_floor_seed -> 'visited',
            p_status
        );
    end if;

    update public.evd_game_runs
       set current_floor = p_target_floor,
           current_x = 3,
           current_y = 3,
           inventory_state = jsonb_set(
                jsonb_set(
                    jsonb_set(
                        jsonb_set(inventory_state, array['flags', 'stairs_known'], 'false'::jsonb, true),
                        array['flags', 'hazards_known'], 'false'::jsonb, true
                    ),
                    array['flags', 'bombs_known'], 'false'::jsonb, true
                ),
                array['pending_resolution'], 'null'::jsonb, true
           ),
           updated_at = now(),
           last_active_at = now(),
           version = version + 1
     where id = p_run_id;
end;
$$;

create or replace function public.evd_move(p_run_id uuid, p_direction text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id text := public.evd_current_user_id();
    v_run public.evd_game_runs%rowtype;
    v_floor public.evd_run_floors%rowtype;
    v_grid jsonb;
    v_cell jsonb;
    v_flags jsonb;
    v_config jsonb;
    v_next_x integer;
    v_next_y integer;
    v_damage integer := 0;
    v_coin_delta integer := 0;
    v_message text := '';
    v_multiplier numeric := 1;
    v_ransom integer := 0;
    v_item_to_lose text;
    v_offers jsonb;
begin
    if v_user_id = '' then
        raise exception 'ログインが必要です';
    end if;

    perform pg_advisory_xact_lock(hashtext('evd:' || v_user_id));

    select * into v_run from public.evd_game_runs where id = p_run_id and user_id = v_user_id and status = '進行中' for update;
    if not found then
        raise exception '進行中のランが見つかりません';
    end if;

    if coalesce(v_run.inventory_state -> 'pending_shop', 'null'::jsonb) <> 'null'::jsonb then
        raise exception 'ショップの処理を先に完了してください';
    end if;

    if coalesce(v_run.inventory_state -> 'pending_resolution', 'null'::jsonb) <> 'null'::jsonb then
        raise exception '現在の選択を先に解決してください';
    end if;

    select * into v_floor from public.evd_run_floors where run_id = p_run_id and floor_no = v_run.current_floor for update;
    select config into v_config from public.evd_game_balance_profiles where id = v_run.generation_profile_id;

    v_next_x := v_run.current_x + case p_direction when 'left' then -1 when 'right' then 1 else 0 end;
    v_next_y := v_run.current_y + case p_direction when 'up' then -1 when 'down' then 1 else 0 end;

    if v_next_x < 0 or v_next_x >= v_run.board_size or v_next_y < 0 or v_next_y >= v_run.board_size then
        raise exception 'その方向には進めません';
    end if;

    v_grid := v_floor.grid;
    v_cell := public.evd_get_cell(v_grid, v_next_x, v_next_y);
    v_flags := coalesce(v_run.inventory_state -> 'flags', '{}'::jsonb);

    v_cell := jsonb_set(jsonb_set(v_cell, array['revealed'], 'true'::jsonb, true), array['visited'], 'true'::jsonb, true);
    v_grid := public.evd_set_cell(v_grid, v_next_x, v_next_y, v_cell);

    update public.evd_game_runs
       set current_x = v_next_x,
           current_y = v_next_y,
           updated_at = now(),
           last_active_at = now(),
           version = version + 1
     where id = p_run_id;

    update public.evd_run_floors
       set grid = v_grid,
           revealed = case when not (v_floor.revealed @> jsonb_build_array(format('%s,%s', v_next_x, v_next_y))) then v_floor.revealed || jsonb_build_array(format('%s,%s', v_next_x, v_next_y)) else v_floor.revealed end,
           visited = case when not (v_floor.visited @> jsonb_build_array(format('%s,%s', v_next_x, v_next_y))) then v_floor.visited || jsonb_build_array(format('%s,%s', v_next_x, v_next_y)) else v_floor.visited end,
           updated_at = now()
     where id = v_floor.id;

    perform public.evd_add_log(p_run_id, v_user_id, v_run.current_floor, '移動', format('%sに移動した。', case p_direction when 'left' then '左' when 'right' then '右' when 'up' then '上' else '下' end));

    if coalesce((v_cell ->> 'resolved')::boolean, false) then
        return public.evd_build_snapshot(p_run_id, v_user_id);
    end if;

    case v_cell ->> 'type'
        when '小銭' then
            v_coin_delta := public.evd_get_range_value(v_config, v_run.current_floor, '小銭')::integer;
            v_message := format('小銭を拾い、%s コイン獲得した。', v_coin_delta);
        when '宝箱' then
            v_coin_delta := public.evd_get_range_value(v_config, v_run.current_floor, '宝箱')::integer;
            v_message := format('宝箱を開け、%s コイン獲得した。', v_coin_delta);
        when '財宝箱' then
            v_coin_delta := public.evd_get_range_value(v_config, v_run.current_floor, '財宝箱')::integer;
            v_message := format('財宝箱から %s コイン獲得した。', v_coin_delta);
        when '秘宝箱' then
            update public.evd_game_runs set badges_gained = badges_gained + 1 where id = p_run_id;
            v_message := '秘宝箱を見つけ、秘宝バッジを 1 個確保した。';
        when '宝石箱' then
            update public.evd_game_runs
               set gacha_tickets_gained = gacha_tickets_gained + 1,
                   mangan_tickets_gained = mangan_tickets_gained + case when random() < 0.35 then 1 else 0 end
             where id = p_run_id;
            v_message := '宝石箱から祈願符と満願符を得た。';
        when '祝福' then
            v_multiplier := public.evd_get_range_value(v_config, v_run.current_floor, '祝福', true);
            update public.evd_game_runs
               set run_coins = floor(run_coins * v_multiplier)::integer
             where id = p_run_id;
            v_message := format('祝福が宿り、所持コイン倍率が x%s になった。', v_multiplier);
        when '泉' then
            update public.evd_game_runs
               set life = least(max_life, life + 1)
             where id = p_run_id;
            v_message := '泉の力でライフを 1 回復した。';
        when '爆弾' then
            v_damage := 1;
            v_message := '爆弾を踏み、ライフを 1 失った。';
        when '大爆発' then
            v_damage := 2;
            v_message := '大爆発に巻き込まれ、ライフを 2 失った。';
        when '罠' then
            v_coin_delta := -1 * public.evd_get_range_value(v_config, v_run.current_floor, '罠')::integer;
            v_message := format('罠にかかり、%s コイン失った。', abs(v_coin_delta));
        when '呪い' then
            v_multiplier := public.evd_get_range_value(v_config, v_run.current_floor, '呪い', true);
            update public.evd_game_runs
               set run_coins = floor(run_coins * v_multiplier)::integer
             where id = p_run_id;
            v_message := format('呪いにより所持コインが x%s になった。', v_multiplier);
        when '盗賊' then
            v_ransom := coalesce((v_config -> 'thief_ransom' ->> v_run.current_floor::text)::integer, 150);
            if exists (
                select 1
                  from jsonb_each(coalesce(v_run.inventory_state -> 'items', '{}'::jsonb)) e
                 where coalesce((e.value ->> 'quantity')::integer, 0) > 0
            ) then
                if v_run.run_coins >= v_ransom then
                    v_coin_delta := -1 * v_ransom;
                    v_message := format('盗賊に遭遇したが、%s コイン支払って荷物を守った。', v_ransom);
                else
                    select key into v_item_to_lose
                      from jsonb_each(v_run.inventory_state -> 'items')
                     where coalesce((value ->> 'quantity')::integer, 0) > 0
                     limit 1;
                    update public.evd_game_runs
                       set inventory_state = public.evd_remove_item(inventory_state, v_item_to_lose, 1)
                     where id = p_run_id;
                    v_message := format('盗賊に襲われ、%s を 1 個奪われた。', v_item_to_lose);
                end if;
            else
                v_coin_delta := -1 * least(v_run.run_coins, v_ransom);
                v_message := format('盗賊に遭遇し、%s コイン奪われた。', abs(v_coin_delta));
            end if;
        when '落とし穴' then
            v_damage := 1;
            v_message := '落とし穴に落ち、1 階下へ落下した。';
        when '転送罠' then
            v_message := '転送罠が発動し、2 階層上へ戻された。';
        when 'ショップ' then
            v_offers := public.evd_generate_shop_offers('ショップ');
            update public.evd_game_runs
               set inventory_state = jsonb_set(inventory_state, array['pending_shop'], jsonb_build_object('shop_type', 'ショップ', 'offers', v_offers), true)
             where id = p_run_id;
            v_message := '行商人が店を広げた。';
        when '限定ショップ' then
            v_offers := public.evd_generate_shop_offers('限定ショップ');
            update public.evd_game_runs
               set inventory_state = jsonb_set(inventory_state, array['pending_shop'], jsonb_build_object('shop_type', '限定ショップ', 'offers', v_offers), true)
             where id = p_run_id;
            v_message := '珍しい商人が隠し市を開いた。';
        when '下り階段' then
            update public.evd_game_runs
               set inventory_state = jsonb_set(inventory_state, array['pending_resolution'], '{"type":"stairs"}'::jsonb, true)
             where id = p_run_id;
            v_message := '下り階段を見つけた。';
        else
            v_message := '何も起こらなかった。';
    end case;

    if v_damage > 0 then
        if v_run.substitute_negates_remaining > 0 then
            update public.evd_game_runs
               set substitute_negates_remaining = substitute_negates_remaining - 1
             where id = p_run_id;
            v_message := format('身代わり人形が砕け、%s を無効化した。', v_cell ->> 'type');
            v_damage := 0;
        else
            update public.evd_game_runs
               set life = greatest(life - v_damage, 0)
             where id = p_run_id;
        end if;
    end if;

    if v_coin_delta <> 0 then
        if v_run.substitute_negates_remaining > 0 and v_coin_delta < 0 then
            update public.evd_game_runs
               set substitute_negates_remaining = substitute_negates_remaining - 1
             where id = p_run_id;
            v_message := format('身代わり人形が砕け、%s を無効化した。', v_cell ->> 'type');
        else
            update public.evd_game_runs
               set run_coins = greatest(run_coins + v_coin_delta, 0)
             where id = p_run_id;
        end if;
    end if;

    v_cell := jsonb_set(v_cell, array['resolved'], 'true'::jsonb, true);
    v_grid := public.evd_set_cell(v_grid, v_next_x, v_next_y, v_cell);
    update public.evd_run_floors set grid = v_grid where id = v_floor.id;

    perform public.evd_add_log(p_run_id, v_user_id, v_run.current_floor, 'マス公開', v_message, jsonb_build_object('tile_type', v_cell ->> 'type'));

    select * into v_run from public.evd_game_runs where id = p_run_id;

    if v_run.life <= 0 then
        return public.evd_finish_run(p_run_id, v_user_id, '死亡', '迷宮で力尽きた');
    end if;

    if (v_cell ->> 'type') = '落とし穴' then
        perform public.evd_resolve_floor_shift(p_run_id, v_user_id, least(v_run.max_floors, v_run.current_floor + 1), '落下移動');
    elsif (v_cell ->> 'type') = '転送罠' then
        perform public.evd_resolve_floor_shift(p_run_id, v_user_id, greatest(1, v_run.current_floor - 2), '転送移動');
    end if;

    return public.evd_build_snapshot(p_run_id, v_user_id);
end;
$$;

create or replace function public.evd_use_item(p_run_id uuid, p_item_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id text := public.evd_current_user_id();
    v_run public.evd_game_runs%rowtype;
    v_bonus_sum integer := 0;
begin
    perform pg_advisory_xact_lock(hashtext('evd:' || v_user_id));

    select * into v_run from public.evd_game_runs where id = p_run_id and user_id = v_user_id and status = '進行中' for update;
    if not found then
        raise exception '進行中のランが見つかりません';
    end if;

    if coalesce((v_run.inventory_state -> 'items' -> p_item_code ->> 'quantity')::integer, 0) <= 0 then
        raise exception 'そのアイテムは所持していません';
    end if;

    update public.evd_game_runs
       set inventory_state = public.evd_remove_item(inventory_state, p_item_code, 1),
           updated_at = now(),
           last_active_at = now(),
           version = version + 1
     where id = p_run_id;

    case p_item_code
        when 'escape_rope' then
            perform public.evd_add_log(p_run_id, v_user_id, v_run.current_floor, 'アイテム使用', '脱出のひもで帰還した。');
            return public.evd_finish_run(p_run_id, v_user_id, '帰還', '脱出のひも');
        when 'bomb_radar' then
            update public.evd_game_runs set inventory_state = jsonb_set(inventory_state, array['flags', 'bombs_known'], 'true'::jsonb, true) where id = p_run_id;
            perform public.evd_add_log(p_run_id, v_user_id, v_run.current_floor, 'アイテム使用', '爆弾レーダーで爆弾の気配を探った。');
        when 'healing_potion' then
            update public.evd_game_runs set life = least(max_life, life + 1) where id = p_run_id;
            perform public.evd_add_log(p_run_id, v_user_id, v_run.current_floor, 'アイテム使用', '回復ポーションでライフを 1 回復した。');
        when 'stairs_search' then
            update public.evd_game_runs set inventory_state = jsonb_set(inventory_state, array['flags', 'stairs_known'], 'true'::jsonb, true) where id = p_run_id;
            perform public.evd_add_log(p_run_id, v_user_id, v_run.current_floor, 'アイテム使用', '階段サーチで下り階段の位置が見えた。');
        when 'calamity_map' then
            update public.evd_game_runs set inventory_state = jsonb_set(inventory_state, array['flags', 'hazards_known'], 'true'::jsonb, true) where id = p_run_id;
            perform public.evd_add_log(p_run_id, v_user_id, v_run.current_floor, 'アイテム使用', '厄災の地図で危険マスを可視化した。');
        when 'full_scan_map' then
            update public.evd_game_runs set inventory_state = jsonb_set(inventory_state, array['flags', 'bombs_known'], 'true'::jsonb, true) where id = p_run_id;
            perform public.evd_add_log(p_run_id, v_user_id, v_run.current_floor, 'アイテム使用', '完全探査図で爆弾マスを可視化した。');
        when 'holy_grail' then
            update public.evd_game_runs set max_life = max_life + 1, life = max_life + 1 where id = p_run_id;
            perform public.evd_add_log(p_run_id, v_user_id, v_run.current_floor, 'アイテム使用', '女神の聖杯で完全回復し、最大ライフが 1 増えた。');
        when 'abyss_ticket' then
            select coalesce(sum((value)::integer), 0)
              into v_bonus_sum
              from jsonb_each_text((v_run.inventory_state -> 'floor_bonus_preview'))
             where (key)::integer > v_run.current_floor
               and (key)::integer <= least(v_run.current_floor + 3, v_run.max_floors);

            update public.evd_game_runs
               set run_coins = run_coins + v_bonus_sum,
                   floor_bonus_total = floor_bonus_total + v_bonus_sum
             where id = p_run_id;

            perform public.evd_resolve_floor_shift(p_run_id, v_user_id, least(v_run.current_floor + 3, v_run.max_floors), '進行中');
            perform public.evd_add_log(p_run_id, v_user_id, least(v_run.current_floor + 3, v_run.max_floors), 'アイテム使用', format('奈落直通札で %s 階層先へ進み、到達ボーナス %s コインを得た。', least(3, v_run.max_floors - v_run.current_floor), v_bonus_sum));
        else
            raise exception 'このアイテムは使用できません';
    end case;

    return public.evd_build_snapshot(p_run_id, v_user_id);
end;
$$;

create or replace function public.evd_resolve_stairs(p_run_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id text := public.evd_current_user_id();
    v_run public.evd_game_runs%rowtype;
    v_bonus integer := 0;
    v_target_floor integer;
begin
    perform pg_advisory_xact_lock(hashtext('evd:' || v_user_id));

    select * into v_run from public.evd_game_runs where id = p_run_id and user_id = v_user_id and status = '進行中' for update;
    if not found then
        raise exception '進行中のランが見つかりません';
    end if;

    if coalesce(v_run.inventory_state -> 'pending_resolution' ->> 'type', '') <> 'stairs' then
        raise exception '解決待ちの階段がありません';
    end if;

    if p_action = 'return' or v_run.current_floor >= v_run.max_floors then
        perform public.evd_add_log(p_run_id, v_user_id, v_run.current_floor, '帰還', '階段から地上へ引き返した。');
        return public.evd_finish_run(p_run_id, v_user_id, '帰還', '地上へ帰還');
    end if;

    v_target_floor := v_run.current_floor + 1;
    v_bonus := coalesce((v_run.inventory_state -> 'floor_bonus_preview' ->> v_target_floor::text)::integer, 0);

    update public.evd_game_runs
       set run_coins = run_coins + v_bonus,
           floor_bonus_total = floor_bonus_total + v_bonus
     where id = p_run_id;

    perform public.evd_resolve_floor_shift(p_run_id, v_user_id, v_target_floor, '進行中');
    perform public.evd_add_log(p_run_id, v_user_id, v_target_floor, '次階層へ進行', format('%s 階へ進み、到達ボーナス %s コイン獲得した。', v_target_floor, v_bonus));

    return public.evd_build_snapshot(p_run_id, v_user_id);
end;
$$;

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
    v_effect text;
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
        perform public.evd_add_log(p_run_id, v_user_id, v_run.current_floor, 'ショップ購入', '何も買わず立ち去った。');
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

    select effect_data ->> 'effect' into v_effect from public.evd_item_catalog where code = p_item_code;

    if v_effect = 'substitute' then
        update public.evd_game_runs set substitute_negates_remaining = substitute_negates_remaining + 3 where id = p_run_id;
    elsif v_effect = 'insurance' then
        update public.evd_game_runs set inventory_state = jsonb_set(inventory_state, array['flags', 'insurance_active'], 'true'::jsonb, true) where id = p_run_id;
    elsif v_effect = 'golden_contract' then
        update public.evd_game_runs set inventory_state = jsonb_set(inventory_state, array['flags', 'golden_contract_active'], 'true'::jsonb, true) where id = p_run_id;
    elsif v_effect = 'vault_box' then
        update public.evd_game_runs
           set secured_coins = secured_coins + floor(run_coins * 0.7)::integer
         where id = p_run_id;
    else
        update public.evd_game_runs set inventory_state = public.evd_add_item(inventory_state, p_item_code, 1) where id = p_run_id;
    end if;

    perform public.evd_add_log(
        p_run_id,
        v_user_id,
        v_run.current_floor,
        case when coalesce(v_pending ->> 'shop_type', 'ショップ') = '限定ショップ' then '限定ショップ購入' else 'ショップ購入' end,
        format('%s を %s コインで購入した。', v_offer ->> 'name', v_price),
        jsonb_build_object('item_code', p_item_code, 'price', v_price)
    );

    return public.evd_build_snapshot(p_run_id, v_user_id);
end;
$$;

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

    if not found or not v_item.is_active or v_item.shop_pool = 'なし' then
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

    insert into public.evd_player_item_stocks (user_id, item_code, quantity, updated_at)
    values (v_user_id, p_item_code, 1, now())
    on conflict (user_id, item_code) do update
    set quantity = public.evd_player_item_stocks.quantity + 1,
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

create or replace function public.evd_resolve_thief(p_run_id uuid, p_action text)
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
    v_pending jsonb;
    v_ransom integer := 0;
    v_message text := '';
    v_item_to_lose text;
    v_item_to_lose_name text;
    v_escape_failed boolean := false;
begin
    if v_user_id = '' then
        raise exception 'ログインが必要です';
    end if;

    perform pg_advisory_xact_lock(hashtext('evd:' || v_user_id));

    select * into v_run
      from public.evd_game_runs
     where id = p_run_id
       and user_id = v_user_id
       and status = '進行中'
     for update;
    if not found then
        raise exception '進行中のランが見つかりません';
    end if;

    v_pending := coalesce(v_run.inventory_state -> 'pending_thief', 'null'::jsonb);
    if v_pending = 'null'::jsonb then
        raise exception '解決待ちの盗賊イベントはありません';
    end if;

    select * into v_floor
      from public.evd_run_floors
     where run_id = p_run_id
       and floor_no = v_run.current_floor
     for update;

    v_grid := v_floor.grid;
    v_cell := public.evd_get_cell(v_grid, v_run.current_x, v_run.current_y);
    if coalesce(v_cell ->> 'type', '') <> '盗賊' then
        raise exception '盗賊マス上でのみ実行できます';
    end if;

    v_ransom := greatest(coalesce((v_pending ->> 'ransom')::integer, 150), 0);

    case p_action
        when 'item' then
            select e.key, c.name
              into v_item_to_lose, v_item_to_lose_name
              from jsonb_each(coalesce(v_run.inventory_state -> 'items', '{}'::jsonb)) e
              left join public.evd_item_catalog c
                on c.code = e.key
             where coalesce((e.value ->> 'quantity')::integer, 0) > 0
             order by random()
             limit 1;

            if v_item_to_lose is null then
                raise exception 'アイテムを持っていない';
            end if;

            update public.evd_game_runs
               set inventory_state = public.evd_remove_bucket_item(
                    public.evd_remove_item(inventory_state - 'pending_thief', v_item_to_lose, 1),
                    'carried_items',
                    v_item_to_lose,
                    1
               )
             where id = p_run_id;

            v_message := format('盗賊へ %s を差し出した。', coalesce(v_item_to_lose_name, v_item_to_lose));
        when 'coin' then
            if v_run.run_coins < v_ransom then
                raise exception '所持金が足りない';
            end if;

            update public.evd_game_runs
               set run_coins = run_coins - v_ransom,
                   inventory_state = inventory_state - 'pending_thief'
             where id = p_run_id;

            v_message := format('盗賊へ %s コイン差し出した。', v_ransom);
        when 'escape' then
            if random() < 0.7 then
                update public.evd_game_runs
                   set inventory_state = inventory_state - 'pending_thief'
                 where id = p_run_id;

                v_message := '盗賊から逃げ切った。何も起こらなかった。';
            else
                update public.evd_game_runs
                   set life = 0,
                       inventory_state = inventory_state - 'pending_thief'
                 where id = p_run_id;

                v_message := '盗賊から逃げようとしたが、返り討ちに遭って死亡した。';
                v_escape_failed := true;
            end if;
        else
            raise exception '不正な選択です';
    end case;

    v_cell := jsonb_set(v_cell, array['resolved'], 'true'::jsonb, true);
    v_grid := public.evd_set_cell(v_grid, v_run.current_x, v_run.current_y, v_cell);
    update public.evd_run_floors
       set grid = v_grid
     where id = v_floor.id;

    perform public.evd_add_log(
        p_run_id,
        v_user_id,
        v_run.account_name,
        v_run.current_floor,
        'マス公開',
        v_message,
        jsonb_build_object('tile_type', '盗賊', 'thief_action', p_action)
    );

    if v_escape_failed then
        return public.evd_finish_run(p_run_id, v_user_id, '死亡', '盗賊から逃げようとして返り討ちに遭った');
    end if;

    return public.evd_build_snapshot(p_run_id, v_user_id);
end;
$$;

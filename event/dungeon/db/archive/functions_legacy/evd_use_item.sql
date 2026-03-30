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
    v_should_consume boolean := true;
begin
    perform pg_advisory_xact_lock(hashtext('evd:' || v_user_id));

    select * into v_run from public.evd_game_runs where id = p_run_id and user_id = v_user_id and status = '進行中' for update;
    if not found then
        raise exception '進行中のランが見つかりません';
    end if;

    if coalesce((v_run.inventory_state -> 'items' -> p_item_code ->> 'quantity')::integer, 0) <= 0 then
        raise exception 'そのアイテムは所持していません';
    end if;

    case p_item_code
        when 'escape_rope' then
            v_should_consume := true;
            perform public.evd_add_log(p_run_id, v_user_id, v_run.account_name, v_run.current_floor, 'アイテム使用', '脱出のひもで帰還した。');
        when 'bomb_radar' then
            v_should_consume := false;
            raise exception '爆弾レーダーは所持しているだけで常時有効です';
        when 'healing_potion' then
            v_should_consume := true;
            update public.evd_game_runs set life = least(max_life, life + 1) where id = p_run_id;
            perform public.evd_add_log(p_run_id, v_user_id, v_run.account_name, v_run.current_floor, 'アイテム使用', '回復ポーションでライフを 1 回復した。');
        when 'super_healing_potion' then
            v_should_consume := true;
            update public.evd_game_runs set life = least(max_life, life + 2) where id = p_run_id;
            perform public.evd_add_log(p_run_id, v_user_id, v_run.account_name, v_run.current_floor, 'アイテム使用', '上級回復ポーションでライフを 2 回復した。');
        when 'stairs_search' then
            v_should_consume := true;
            update public.evd_game_runs set inventory_state = jsonb_set(inventory_state, array['flags', 'stairs_known'], 'true'::jsonb, true) where id = p_run_id;
            perform public.evd_add_log(p_run_id, v_user_id, v_run.account_name, v_run.current_floor, 'アイテム使用', '階段サーチで下り階段の位置が見えた。');
        when 'calamity_map' then
            v_should_consume := true;
            update public.evd_game_runs set inventory_state = jsonb_set(inventory_state, array['flags', 'hazards_known'], 'true'::jsonb, true) where id = p_run_id;
            perform public.evd_add_log(p_run_id, v_user_id, v_run.account_name, v_run.current_floor, 'アイテム使用', '厄災の地図で危険マスを可視化した。');
        when 'full_scan_map' then
            v_should_consume := true;
            update public.evd_game_runs set inventory_state = jsonb_set(inventory_state, array['flags', 'bombs_known'], 'true'::jsonb, true) where id = p_run_id;
            perform public.evd_add_log(p_run_id, v_user_id, v_run.account_name, v_run.current_floor, 'アイテム使用', '完全探査図で爆弾マスを可視化した。');
        when 'holy_grail' then
            v_should_consume := true;
            update public.evd_game_runs set max_life = max_life + 1, life = max_life + 1 where id = p_run_id;
            perform public.evd_add_log(p_run_id, v_user_id, v_run.account_name, v_run.current_floor, 'アイテム使用', '女神の聖杯で完全回復し、最大ライフが 1 増えた。');
        when 'life_vessel' then
            v_should_consume := true;
            update public.evd_game_runs
               set max_life = max_life + 1,
                   life = least(max_life + 1, life + 1)
             where id = p_run_id;
            perform public.evd_add_log(p_run_id, v_user_id, v_run.account_name, v_run.current_floor, 'アイテム使用', '命の器で最大ライフが 1 増えた。');
        when 'abyss_ticket' then
            v_should_consume := true;
            select coalesce(sum(fbp.bonus_coins), 0)
              into v_bonus_sum
              from public.evd_floor_bonus_profiles fbp
             where fbp.profile_id = v_run.generation_profile_id
               and fbp.floor_no > v_run.current_floor
               and fbp.floor_no <= least(v_run.current_floor + 3, v_run.max_floors);

            update public.evd_game_runs
               set run_coins = run_coins + v_bonus_sum,
                   floor_bonus_total = floor_bonus_total + v_bonus_sum
             where id = p_run_id;

            perform public.evd_resolve_floor_shift(p_run_id, v_user_id, least(v_run.current_floor + 3, v_run.max_floors), '進行中');
            perform public.evd_add_log(p_run_id, v_user_id, v_run.account_name, least(v_run.current_floor + 3, v_run.max_floors), 'アイテム使用', format('奈落直通札で %s 階層先へ進み、到達ボーナス %s コインを得た。', least(3, v_run.max_floors - v_run.current_floor), v_bonus_sum));
        else
            raise exception 'このアイテムは使用できません';
    end case;

    if v_should_consume then
        update public.evd_game_runs
           set inventory_state = public.evd_remove_bucket_item(public.evd_remove_item(inventory_state, p_item_code, 1), 'carried_items', p_item_code, 1),
               updated_at = now(),
               last_active_at = now(),
               version = version + 1
         where id = p_run_id;
    end if;

    if p_item_code = 'escape_rope' then
        return public.evd_finish_run(p_run_id, v_user_id, '帰還', '脱出のひも');
    end if;

    return public.evd_build_snapshot(p_run_id, v_user_id);
end;
$$;

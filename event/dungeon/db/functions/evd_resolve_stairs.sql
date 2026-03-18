create or replace function public.evd_resolve_stairs(p_run_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user_id text := public.evd_current_user_id();
    v_run public.evd_game_runs%rowtype;
    v_floor public.evd_run_floors%rowtype;
    v_current_cell jsonb;
    v_bonus integer := 0;
    v_target_floor integer;
    v_offers jsonb;
begin
    perform pg_advisory_xact_lock(hashtext('evd:' || v_user_id));

    select * into v_run from public.evd_game_runs where id = p_run_id and user_id = v_user_id and status = '進行中' for update;
    if not found then
        raise exception '進行中のランが見つかりません';
    end if;

    select * into v_floor
      from public.evd_run_floors
     where run_id = p_run_id
       and floor_no = v_run.current_floor;

    v_current_cell := public.evd_get_cell(v_floor.grid, v_run.current_x, v_run.current_y);
    if coalesce(v_current_cell ->> 'type', '') <> '下り階段' then
        raise exception '階段の上にいないため選択できません';
    end if;

    if v_run.current_floor >= v_run.max_floors then
        if p_action <> 'return' then
            raise exception '深部の祭壇では帰還のみ選択できます';
        end if;

        with relic_pool as (
            select
                c.code,
                c.name,
                c.description,
                c.sort_order,
                greatest(coalesce(c.weight, 0), 1) as effective_weight
              from public.evd_item_catalog c
             where c.is_active = true
               and c.shop_pool = 'レリック'
        )
        select coalesce(
            jsonb_agg(
                jsonb_build_object(
                    'code', picked.code,
                    'name', picked.name,
                    'description', picked.description
                )
                order by picked.sort_order, picked.code
            ),
            '[]'::jsonb
        )
          into v_offers
          from (
            select code, name, description, sort_order
              from relic_pool
             order by -ln(greatest(random(), 1e-9)) / effective_weight
             limit 2
          ) picked;

        if coalesce(jsonb_array_length(v_offers), 0) = 0 then
            perform public.evd_add_log(p_run_id, v_user_id, v_run.account_name, v_run.current_floor, '帰還', '深部の祭壇を後にして地上へ引き返した。');
            return public.evd_finish_run(p_run_id, v_user_id, '帰還', '深部の祭壇から帰還');
        end if;

        update public.evd_game_runs
           set inventory_state = jsonb_set(inventory_state, array['pending_altar_reward'], jsonb_build_object('offers', v_offers), true)
         where id = p_run_id;

        perform public.evd_add_log(
            p_run_id,
            v_user_id,
            v_run.account_name,
            v_run.current_floor,
            '祭壇報酬',
            '深部の祭壇が輝き、レリックを 1 つ選べるようになった。',
            jsonb_build_object('offers', v_offers)
        );

        return public.evd_build_snapshot(p_run_id, v_user_id);
    end if;

    if p_action = 'return' then
        perform public.evd_add_log(p_run_id, v_user_id, v_run.account_name, v_run.current_floor, '帰還', '階段から地上へ引き返した。');
        return public.evd_finish_run(p_run_id, v_user_id, '帰還', '地上へ帰還');
    end if;

    v_target_floor := v_run.current_floor + 1;
    select coalesce(fbp.bonus_coins, 0)
      into v_bonus
      from public.evd_floor_bonus_profiles fbp
     where fbp.profile_id = v_run.generation_profile_id
       and fbp.floor_no = v_target_floor;

    v_bonus := coalesce(v_bonus, 0);

    update public.evd_game_runs
       set run_coins = run_coins + v_bonus,
           floor_bonus_total = floor_bonus_total + v_bonus
     where id = p_run_id;

    perform public.evd_resolve_floor_shift(p_run_id, v_user_id, v_target_floor, '進行中');
    perform public.evd_add_log(p_run_id, v_user_id, v_run.account_name, v_target_floor, '次階層へ進行', format('%s 階へ進み、到達ボーナス %s コイン獲得した。', v_target_floor, v_bonus));

    return public.evd_build_snapshot(p_run_id, v_user_id);
end;
$$;

create or replace function public.evd_item_effect_abyss_ticket_use(
    p_run_id uuid,
    p_user_id text,
    p_account_name text,
    p_current_floor integer,
    p_max_floors integer,
    p_generation_profile_id uuid
)
returns jsonb
language plpgsql
as $$
declare
    v_bonus_sum integer := 0;
    v_target_floor integer := least(p_current_floor + 3, p_max_floors);
    v_shift_count integer := greatest(v_target_floor - p_current_floor, 0);
begin
    select coalesce(sum(fbp.bonus_coins), 0)
      into v_bonus_sum
      from public.evd_floor_bonus_profiles fbp
     where fbp.profile_id = p_generation_profile_id
       and fbp.floor_no > p_current_floor
       and fbp.floor_no <= v_target_floor;

    update public.evd_game_runs
       set run_coins = run_coins + v_bonus_sum,
           floor_bonus_total = floor_bonus_total + v_bonus_sum
     where id = p_run_id;

    perform public.evd_resolve_floor_shift(p_run_id, p_user_id, v_target_floor, 'ラン中');
    perform public.evd_add_log(
        p_run_id,
        p_user_id,
        p_account_name,
        v_target_floor,
        'アイテム使用',
        format('奈落の切符で %s 階層進み、ボーナス %s coin を獲得した。', v_shift_count, v_bonus_sum)
    );

    return jsonb_build_object(
        'should_consume', true,
        'finish_run', false
    );
end;
$$;
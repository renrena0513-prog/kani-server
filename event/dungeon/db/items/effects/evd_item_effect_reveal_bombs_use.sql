create or replace function public.evd_item_effect_reveal_bombs_use(
    p_run_id uuid,
    p_user_id text,
    p_account_name text,
    p_current_floor integer
)
returns jsonb
language plpgsql
as $$
begin
    update public.evd_game_runs
       set inventory_state = jsonb_set(inventory_state, array['flags', 'bombs_known'], 'true'::jsonb, true)
     where id = p_run_id;

    perform public.evd_add_log(
        p_run_id,
        p_user_id,
        p_account_name,
        p_current_floor,
        'アイテム使用',
        '全域探査図で爆弾マスの位置を把握した。'
    );

    return jsonb_build_object(
        'should_consume', true,
        'finish_run', false
    );
end;
$$;
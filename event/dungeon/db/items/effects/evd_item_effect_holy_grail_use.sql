create or replace function public.evd_item_effect_holy_grail_use(
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
       set max_life = max_life + 1,
           life = max_life + 1
     where id = p_run_id;

    perform public.evd_add_log(
        p_run_id,
        p_user_id,
        p_account_name,
        p_current_floor,
        'アイテム使用',
        '聖杯の力で最大LIFEが 1 増え、LIFEが全回復した。'
    );

    return jsonb_build_object(
        'should_consume', true,
        'finish_run', false
    );
end;
$$;
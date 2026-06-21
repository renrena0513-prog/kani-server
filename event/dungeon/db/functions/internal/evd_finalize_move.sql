create or replace function public.evd_finalize_move(
    p_run_id uuid,
    p_user_id text,
    p_account_name text,
    p_floor_no integer,
    p_tile_type text,
    p_message text,
    p_item_code text default null,
    p_item_name text default null
)
returns jsonb
language plpgsql
as $$
declare
    v_run public.evd_game_runs%rowtype;
begin
    perform public.evd_add_log(
        p_run_id,
        p_user_id,
        p_account_name,
        p_floor_no,
        '移動イベント',
        p_message,
        jsonb_build_object('tile_type', p_tile_type)
            || case
                when p_tile_type = 'アイテム' and p_item_code is not null then
                    jsonb_build_object('item_code', p_item_code, 'item_name', p_item_name)
                else '{}'::jsonb
            end
    );

    select *
      into v_run
      from public.evd_game_runs
     where id = p_run_id;

    if v_run.life <= 0 then
        if public.evd_try_consume_revival_charm(p_run_id, p_user_id, p_account_name, p_floor_no) then
            return public.evd_build_snapshot(p_run_id, p_user_id);
        end if;

        return public.evd_finish_run(p_run_id, p_user_id, '死亡', '移動イベントでライフが尽きた');
    end if;

    return public.evd_build_snapshot(p_run_id, p_user_id);
end;
$$;

create or replace function public.evd_item_effect_heal_hp_use(
    p_run_id uuid,
    p_user_id text,
    p_account_name text,
    p_current_floor integer,
    p_effect_data jsonb
)
returns jsonb
language plpgsql
as $$
declare
    v_amount integer := greatest(coalesce((p_effect_data ->> 'amount')::integer, 1), 1);
begin
    update public.evd_game_runs
       set life = least(max_life, life + v_amount)
     where id = p_run_id;

    perform public.evd_add_log(
        p_run_id,
        p_user_id,
        p_account_name,
        p_current_floor,
        'アイテム使用',
        format('回復アイテムでLIFEを %s 回復した。', v_amount)
    );

    return jsonb_build_object(
        'should_consume', true,
        'finish_run', false
    );
end;
$$;
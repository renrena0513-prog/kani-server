create or replace function public.evd_item_effect_escape_rope_use(
    p_run_id uuid,
    p_user_id text,
    p_account_name text,
    p_current_floor integer
)
returns jsonb
language plpgsql
as $$
begin
    perform public.evd_add_log(
        p_run_id,
        p_user_id,
        p_account_name,
        p_current_floor,
        'アイテム使用',
        '脱出のひもを使って帰還した。'
    );

    return jsonb_build_object(
        'should_consume', true,
        'finish_run', true,
        'finish_status', '帰還',
        'finish_reason', '脱出のひも'
    );
end;
$$;
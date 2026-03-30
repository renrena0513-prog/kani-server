create or replace function public.evd_finish_run_finalize(
    p_run_id uuid,
    p_user_id text,
    p_account_name text,
    p_floor_no integer,
    p_status text,
    p_reason text,
    p_payout integer,
    p_inventory_state jsonb
)
returns void
language plpgsql
as $$
begin
    update public.evd_game_runs
       set status = p_status,
           death_reason = p_reason,
           result_payout = greatest(p_payout, 0),
           inventory_state = p_inventory_state,
           ended_at = now(),
           updated_at = now(),
           last_active_at = now(),
           version = version + 1
     where id = p_run_id;

    update public.profiles
       set coins = coalesce(coins, 0) + greatest(p_payout, 0),
           total_assets = coalesce(total_assets, 0) + greatest(p_payout, 0)
     where discord_user_id = p_user_id;

    perform public.evd_add_log(
        p_run_id,
        p_user_id,
        p_account_name,
        p_floor_no,
        case when p_status = '帰還' then '帰還' else '死亡' end,
        case when p_status = '帰還'
             then format('無事に帰還して %s コインを持ち帰った。', p_payout)
             else format('%s。精算結果は %s コインだった。', p_reason, p_payout)
        end,
        jsonb_build_object('payout', p_payout)
    );
end;
$$;

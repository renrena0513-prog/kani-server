create or replace function public.evd_build_snapshot(p_run_id uuid, p_user_id text)
returns jsonb
language plpgsql
as $$
declare
    v_run public.evd_game_runs%rowtype;
    v_floor public.evd_run_floors%rowtype;
    v_profile record;
    v_logs jsonb;
begin
    select * into v_run from public.evd_game_runs where id = p_run_id and user_id = p_user_id;
    select * into v_floor from public.evd_run_floors where run_id = p_run_id and floor_no = v_run.current_floor;
    select coins, total_assets, gacha_tickets, mangan_tickets, account_name
      into v_profile
      from public.profiles
     where discord_user_id = p_user_id;

    select coalesce(jsonb_agg(to_jsonb(t) order by t.step_no), '[]'::jsonb)
      into v_logs
      from (
        select event_type, message, created_at, step_no
          from public.evd_run_events
         where run_id = p_run_id
         order by step_no desc
         limit 40
      ) t;

    return jsonb_build_object(
        'run', to_jsonb(v_run),
        'floor', to_jsonb(v_floor),
        'profile', to_jsonb(v_profile),
        'logs', v_logs
    );
end;
$$;

create or replace function public.evd_add_log(
    p_run_id uuid,
    p_user_id text,
    p_account_name text,
    p_floor_no integer,
    p_event_type text,
    p_message text,
    p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
as $$
declare
    v_step integer;
begin
    select coalesce(max(step_no), 0) + 1
      into v_step
      from public.evd_run_events
     where run_id = p_run_id;

    insert into public.evd_run_events (run_id, user_id, account_name, floor_no, step_no, event_type, message, payload)
    values (p_run_id, p_user_id, p_account_name, p_floor_no, v_step, p_event_type, p_message, p_payload);
end;
$$;

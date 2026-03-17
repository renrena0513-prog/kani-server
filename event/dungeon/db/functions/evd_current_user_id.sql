create or replace function public.evd_current_user_id()
returns text
language sql
stable
as $$
    select coalesce(auth.jwt() -> 'user_metadata' ->> 'provider_id', '');
$$;

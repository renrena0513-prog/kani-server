create or replace function public.evd_start_run_load_context(
    p_user_id text,
    p_carry_items text[] default '{}'
)
returns jsonb
language plpgsql
as $$
declare
    v_profile record;
    v_profile_id uuid;
    v_carry_limit integer := 2;
    v_passive_modifiers jsonb := '{}'::jsonb;
begin
    if exists (
        select 1
          from public.evd_game_runs
         where user_id = p_user_id
           and status = '騾ｲ陦御ｸｭ'
    ) then
        raise exception '進行中のランが既にあります';
    end if;

    select discord_user_id, coins, account_name
      into v_profile
      from public.profiles
     where discord_user_id = p_user_id
     for update;

    if not found then
        raise exception 'プロフィールが見つかりません';
    end if;

    if coalesce(v_profile.coins, 0) < 1000 then
        raise exception 'コインが足りません';
    end if;

    update public.profiles
       set coins = coins - 1000
     where discord_user_id = p_user_id;

    select id
      into v_profile_id
      from public.evd_game_balance_profiles
     where is_active = true
     order by updated_at desc
     limit 1;

    v_passive_modifiers := public.evd_collect_passive_modifiers(p_user_id);
    v_carry_limit := v_carry_limit + coalesce((v_passive_modifiers ->> 'carry_limit_bonus')::integer, 0);

    if array_length(p_carry_items, 1) > v_carry_limit then
        raise exception '持ち込み数は % 個までです', v_carry_limit;
    end if;

    return jsonb_build_object(
        'account_name', v_profile.account_name,
        'profile_id', v_profile_id,
        'carry_limit', v_carry_limit,
        'golden_return_bonus', coalesce((v_passive_modifiers ->> 'return_multiplier_bonus')::numeric, 0),
        'has_doom_eye', coalesce((v_passive_modifiers ->> 'always_bomb_radar')::boolean, false),
        'has_giant_cup', coalesce((v_passive_modifiers ->> 'max_life_bonus')::integer, 0) > 0,
        'passive_modifiers', v_passive_modifiers
    );
end;
$$;

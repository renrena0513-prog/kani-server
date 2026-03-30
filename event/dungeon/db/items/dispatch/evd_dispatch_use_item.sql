create or replace function public.evd_dispatch_use_item(
    p_run_id uuid,
    p_user_id text,
    p_account_name text,
    p_current_floor integer,
    p_max_floors integer,
    p_generation_profile_id uuid,
    p_item_code text
)
returns jsonb
language plpgsql
as $$
declare
    v_effect_data jsonb := '{}'::jsonb;
    v_effect text;
begin
    select coalesce(effect_data, '{}'::jsonb), effect_data ->> 'effect'
      into v_effect_data, v_effect
      from public.evd_item_catalog
     where code = p_item_code;

    case v_effect
        when 'escape_run' then
            return public.evd_item_effect_escape_rope_use(p_run_id, p_user_id, p_account_name, p_current_floor);
        when 'bomb_radar' then
            return public.evd_item_effect_bomb_radar_use(p_item_code);
        when 'reveal_stairs' then
            return public.evd_item_effect_reveal_stairs_use(p_run_id, p_user_id, p_account_name, p_current_floor);
        when 'reveal_hazards' then
            return public.evd_item_effect_reveal_hazards_use(p_run_id, p_user_id, p_account_name, p_current_floor);
        when 'reveal_bombs' then
            return public.evd_item_effect_reveal_bombs_use(p_run_id, p_user_id, p_account_name, p_current_floor);
        when 'increase_max_hp_full_restore' then
            return public.evd_item_effect_holy_grail_use(p_run_id, p_user_id, p_account_name, p_current_floor);
        when 'advance_floor_with_bonus' then
            return public.evd_item_effect_abyss_ticket_use(p_run_id, p_user_id, p_account_name, p_current_floor, p_max_floors, p_generation_profile_id);
        when 'heal_hp' then
            return public.evd_item_effect_heal_hp_use(p_run_id, p_user_id, p_account_name, p_current_floor, v_effect_data);
        when 'increase_max_hp' then
            return public.evd_item_effect_increase_max_hp_use(p_run_id, p_user_id, p_account_name, p_current_floor, v_effect_data);
        else
            raise exception 'このアイテムは使用できません: %', p_item_code;
    end case;
end;
$$;
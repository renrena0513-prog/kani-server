create or replace function public.evd_item_effect_bomb_radar_use(
    p_item_code text
)
returns jsonb
language plpgsql
as $$
begin
    raise exception '爆弾レーダーは既に常時効果として反映されているため使用できません';
end;
$$;
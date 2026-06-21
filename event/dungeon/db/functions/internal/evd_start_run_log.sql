create or replace function public.evd_start_run_log(
    p_run_id uuid,
    p_user_id text,
    p_account_name text,
    p_inventory jsonb,
    p_golden_return_bonus numeric,
    p_has_doom_eye boolean,
    p_floor_seed jsonb,
    p_carry_items text[] default '{}'
)
returns void
language plpgsql
as $$
declare
    v_bomb_count integer := 0;
begin
    perform public.evd_add_log(
        p_run_id,
        p_user_id,
        p_account_name,
        1,
        'プレイ開始',
        '欲望渦巻くダンジョンへ入場した。',
        jsonb_build_object('carry_items', p_carry_items)
    );

    if coalesce((p_inventory -> 'flags' ->> 'relic_giant_cup_active')::boolean, false) then
        perform public.evd_add_log(
            p_run_id,
            p_user_id,
            p_account_name,
            1,
            'レリック効果',
            '巨人の盃の力で最大LIFEが 1 増加した。',
            jsonb_build_object('effect', 'relic_max_life_plus_1')
        );
    end if;

    if coalesce(p_golden_return_bonus, 0) > 0 then
        perform public.evd_add_log(
            p_run_id,
            p_user_id,
            p_account_name,
            1,
            'レリック効果',
            format('黄金の帰路が輝き、持ち帰り倍率が +%s された。', to_char(p_golden_return_bonus, 'FM0.00')),
            jsonb_build_object('effect', 'relic_return_multiplier_plus_0_05', 'bonus', p_golden_return_bonus)
        );
    end if;

    if coalesce((p_inventory -> 'items' -> 'bomb_radar' ->> 'quantity')::integer, 0) > 0 or p_has_doom_eye then
        select count(*)
          into v_bomb_count
          from jsonb_array_elements(p_floor_seed -> 'grid') as row_cells(cell_row)
          cross join jsonb_array_elements(row_cells.cell_row) as cell(cell_item)
         where cell.cell_item ->> 'type' in ('爆弾', '大爆発');

        perform public.evd_add_log(
            p_run_id,
            p_user_id,
            p_account_name,
            1,
            case when p_has_doom_eye then 'レリック効果' else '爆弾レーダー' end,
            case when p_has_doom_eye
                 then format('破滅の魔眼がこの階層の爆弾を暴いた。爆弾は %s 個あるようだ...', v_bomb_count)
                 else format('爆弾レーダーが反応を示した。この階層には爆弾が %s 個あるようだ...', v_bomb_count)
            end,
            jsonb_build_object('bomb_count', v_bomb_count, 'effect', case when p_has_doom_eye then 'relic_bomb_radar_always' else 'bomb_radar' end)
        );
    end if;
end;
$$;
create or replace function public.evd_generate_floor(p_profile_id uuid, p_floor_no integer, p_board_size integer default 7)
returns jsonb
language plpgsql
as $$
declare
    v_weights jsonb;
    v_counts jsonb := '{}'::jsonb;
    v_grid jsonb := '[]'::jsonb;
    v_cells text[];
    v_coord text;
    v_parts text[];
    v_row jsonb;
    v_x integer;
    v_y integer;
    v_stairs_x integer;
    v_stairs_y integer;
    v_cell_type text;
    v_cell jsonb;
    v_rule record;
    v_current_count integer;
    v_min_count integer;
    v_max_count integer;
    v_remaining_min integer := 0;
    v_force_min boolean := false;
    v_available_cells integer;
begin
    v_available_cells := (p_board_size * p_board_size) - 2;

    v_stairs_x := floor(random() * p_board_size)::integer;
    v_stairs_y := floor(random() * p_board_size)::integer;
    while v_stairs_x = 3 and v_stairs_y = 3 loop
        v_stairs_x := floor(random() * p_board_size)::integer;
        v_stairs_y := floor(random() * p_board_size)::integer;
    end loop;

    for v_y in 0..(p_board_size - 1) loop
        v_row := '[]'::jsonb;
        for v_x in 0..(p_board_size - 1) loop
            if v_x = 3 and v_y = 3 then
                v_cell_type := '空白';
            elsif v_x = v_stairs_x and v_y = v_stairs_y then
                v_cell_type := '下り階段';
            else
                v_cell_type := '空白';
            end if;

            v_cell := jsonb_build_object(
                'x', v_x,
                'y', v_y,
                'type', v_cell_type,
                'revealed', (v_x = 3 and v_y = 3),
                'visited', (v_x = 3 and v_y = 3),
                'resolved', (v_x = 3 and v_y = 3),
                'hint',
                    case
                        when v_cell_type in ('爆弾', '大爆発') then 'bomb'
                        when v_cell_type in ('罠', '呪い') then 'hazard'
                        else null
                    end
            );
            v_row := v_row || jsonb_build_array(v_cell);
        end loop;
        v_grid := v_grid || jsonb_build_array(v_row);
    end loop;

    select array_agg(format('%s,%s', c.x, c.y) order by random())
      into v_cells
      from (
        select xg as x, yg as y
          from generate_series(0, p_board_size - 1) as xg
          cross join generate_series(0, p_board_size - 1) as yg
         where not (xg = 3 and yg = 3)
           and not (xg = v_stairs_x and yg = v_stairs_y)
      ) c;

    foreach v_coord in array coalesce(v_cells, array[]::text[]) loop
        v_parts := string_to_array(v_coord, ',');
        v_x := coalesce(v_parts[1], '0')::integer;
        v_y := coalesce(v_parts[2], '0')::integer;

        v_remaining_min := 0;
        for v_rule in
            select tile_type, min_count
              from public.evd_floor_tile_weight_profiles
             where profile_id = p_profile_id
               and floor_no = p_floor_no
               and is_enabled = true
               and tile_type <> '下り階段'
        loop
            v_current_count := coalesce((v_counts ->> v_rule.tile_type)::integer, 0);
            v_min_count := greatest(coalesce(v_rule.min_count, 0), 0);
            if v_current_count < v_min_count then
                v_remaining_min := v_remaining_min + (v_min_count - v_current_count);
            end if;
        end loop;

        v_force_min := v_remaining_min > 0;
        v_weights := '{}'::jsonb;

        for v_rule in
            select tile_type, weight, min_count, max_count
              from public.evd_floor_tile_weight_profiles
             where profile_id = p_profile_id
               and floor_no = p_floor_no
               and is_enabled = true
               and tile_type <> '下り階段'
        loop
            v_current_count := coalesce((v_counts ->> v_rule.tile_type)::integer, 0);
            v_min_count := greatest(coalesce(v_rule.min_count, 0), 0);
            v_max_count := coalesce(v_rule.max_count, v_available_cells);
            if v_max_count < v_min_count then
                v_max_count := v_min_count;
            end if;

            if v_current_count >= v_max_count then
                continue;
            end if;
            if v_force_min and v_current_count >= v_min_count then
                continue;
            end if;
            if coalesce(v_rule.weight, 0) <= 0 then
                continue;
            end if;

            v_weights := jsonb_set(
                v_weights,
                array[v_rule.tile_type],
                to_jsonb(v_rule.weight),
                true
            );
        end loop;

        if v_weights = '{}'::jsonb then
            if v_force_min then
                for v_rule in
                    select tile_type, min_count
                      from public.evd_floor_tile_weight_profiles
                     where profile_id = p_profile_id
                       and floor_no = p_floor_no
                       and is_enabled = true
                       and tile_type <> '下り階段'
                loop
                    v_current_count := coalesce((v_counts ->> v_rule.tile_type)::integer, 0);
                    v_min_count := greatest(coalesce(v_rule.min_count, 0), 0);
                    if v_current_count < v_min_count then
                        v_weights := jsonb_set(v_weights, array[v_rule.tile_type], to_jsonb(1), true);
                    end if;
                end loop;
            end if;
            if v_weights = '{}'::jsonb then
                v_weights := jsonb_build_object('空白', 1);
            end if;
        end if;

        v_cell_type := public.evd_pick_weighted(v_weights);
        v_counts := jsonb_set(
            v_counts,
            array[v_cell_type],
            to_jsonb(coalesce((v_counts ->> v_cell_type)::integer, 0) + 1),
            true
        );

        v_cell := jsonb_build_object(
            'x', v_x,
            'y', v_y,
            'type', v_cell_type,
            'revealed', false,
            'visited', false,
            'resolved', false,
            'hint',
                case
                    when v_cell_type in ('爆弾', '大爆発') then 'bomb'
                    when v_cell_type in ('罠', '呪い') then 'hazard'
                    else null
                end
        );
        v_grid := public.evd_set_cell(v_grid, v_x, v_y, v_cell);
    end loop;

    return jsonb_build_object(
        'start_x', 3,
        'start_y', 3,
        'stairs_x', v_stairs_x,
        'stairs_y', v_stairs_y,
        'grid', v_grid,
        'revealed', jsonb_build_array('3,3'),
        'visited', jsonb_build_array('3,3'),
        'floor_status', '探索中'
    );
end;
$$;

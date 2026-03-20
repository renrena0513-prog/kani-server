update public.evd_floor_value_profiles f
set trap_max = v.trap_max,
    updated_at = now()
from public.evd_game_balance_profiles p
join (
    values
        (2, 70),
        (3, 100),
        (4, 130),
        (5, 160),
        (6, 190),
        (7, 220),
        (8, 250),
        (9, 280),
        (10, 310)
) as v(floor_no, trap_max)
  on p.is_active = true
where f.profile_id = p.id
  and f.floor_no = v.floor_no;

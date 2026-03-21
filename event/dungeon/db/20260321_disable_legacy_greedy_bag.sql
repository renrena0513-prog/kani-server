update public.evd_item_catalog
set is_active = false
where code = 'greedy_bag';

update public.evd_player_item_stocks
set is_set = false,
    updated_at = now()
where item_code = 'greedy_bag';

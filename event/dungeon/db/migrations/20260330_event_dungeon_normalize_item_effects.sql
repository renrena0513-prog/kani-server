-- Normalize event dungeon item effects so use-item dispatch resolves by effect name only.

update public.evd_item_catalog
   set effect_data = jsonb_set(coalesce(effect_data, '{}'::jsonb), array['effect'], to_jsonb('heal_hp'::text), true)
 where code = 'healing_potion'
   and coalesce(effect_data ->> 'effect', '') = 'heal';

update public.evd_item_catalog
   set effect_data = jsonb_set(coalesce(effect_data, '{}'::jsonb), array['effect'], to_jsonb('escape_run'::text), true)
 where code = 'escape_rope'
   and coalesce(effect_data ->> 'effect', '') <> 'escape_run';

update public.evd_item_catalog
   set effect_data = jsonb_set(coalesce(effect_data, '{}'::jsonb), array['effect'], to_jsonb('bomb_radar'::text), true)
 where code = 'bomb_radar'
   and coalesce(effect_data ->> 'effect', '') <> 'bomb_radar';

update public.evd_item_catalog
   set effect_data = jsonb_set(coalesce(effect_data, '{}'::jsonb), array['effect'], to_jsonb('reveal_stairs'::text), true)
 where code = 'stairs_search'
   and coalesce(effect_data ->> 'effect', '') <> 'reveal_stairs';

update public.evd_item_catalog
   set effect_data = jsonb_set(coalesce(effect_data, '{}'::jsonb), array['effect'], to_jsonb('reveal_hazards'::text), true)
 where code = 'calamity_map'
   and coalesce(effect_data ->> 'effect', '') <> 'reveal_hazards';

update public.evd_item_catalog
   set effect_data = jsonb_set(coalesce(effect_data, '{}'::jsonb), array['effect'], to_jsonb('reveal_bombs'::text), true)
 where code = 'full_scan_map'
   and coalesce(effect_data ->> 'effect', '') <> 'reveal_bombs';

update public.evd_item_catalog
   set effect_data = jsonb_set(coalesce(effect_data, '{}'::jsonb), array['effect'], to_jsonb('increase_max_hp_full_restore'::text), true)
 where code = 'holy_grail'
   and coalesce(effect_data ->> 'effect', '') <> 'increase_max_hp_full_restore';

update public.evd_item_catalog
   set effect_data = jsonb_set(coalesce(effect_data, '{}'::jsonb), array['effect'], to_jsonb('increase_max_hp'::text), true)
 where code = 'life_vessel'
   and coalesce(effect_data ->> 'effect', '') <> 'increase_max_hp';

update public.evd_item_catalog
   set effect_data = jsonb_set(coalesce(effect_data, '{}'::jsonb), array['effect'], to_jsonb('advance_floor_with_bonus'::text), true)
 where code = 'abyss_ticket'
   and coalesce(effect_data ->> 'effect', '') <> 'advance_floor_with_bonus';

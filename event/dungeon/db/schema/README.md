# Event Dungeon Schema Notes

## Read / Write Tables

- `profiles`
- `evd_game_runs`
- `evd_run_floors`
- `evd_run_events`
- `evd_player_item_stocks`
- `evd_item_catalog`
- `evd_game_balance_profiles`
- `evd_floor_bonus_profiles`
- `evd_floor_tile_weight_profiles`
- `evd_floor_value_profiles`

## Objects Not Found In Scope

- event dungeon 専用 view
- event dungeon 専用 trigger
- event dungeon 専用 seed

調査範囲は `event/dungeon` 配下と関連 SQL です。

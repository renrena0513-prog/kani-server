# Event Dungeon Deleted Tile Removal Report

## Scope

- 完全削除対象: `盗賊`, `落とし穴`, `転送罠`
- 対象領域: canonical SQL, recreate bundle, migration, floor 生成, move 分岐, UI, 文言, テスト資料

## Removed DB / SQL

- `event/dungeon/db/functions/rpc/evd_resolve_thief.sql` を削除
- `internal/evd_resolve_move_tile.sql` から 3 種マス分岐と `pending_thief` 生成を削除
- `rpc/evd_move.sql` から `pending_thief` 待機制御を削除
- `internal/evd_finalize_move.sql` から落とし穴 / 転送罠の階層移動後処理を削除
- `internal/evd_generate_floor.sql` の hazard hint 対象を `罠` / `呪い` に限定
- `internal/evd_get_floor_value.sql` から `盗賊` 値参照を削除
- recreate bundle から `evd_resolve_thief` を除外

## Removed App / UI

- `event/dungeon/index.html` の盗賊モーダルを削除
- `event/dungeon/css/style.css` の盗賊専用 UI class を削除
- `event/dungeon/js/game.js` の `resolveThief` と関連分岐を削除
- `event/dungeon/js/ui.js` の `renderThiefPrompt` と関連 DOM binding を削除
- `event/dungeon/js/constants.js` / `event/dungeon/js/ui.js` の tile 表示定義から 3 種マスを削除

## Data Cleanup Migration

- `20260330_event_dungeon_remove_deleted_tiles.sql` を追加
- tile weight profile から `盗賊` / `落とし穴` / `転送罠` を削除
- 既存 run floor の grid から削除済み tile を `空白` へ置換
- `pending_thief` と盗賊専用 item (`thief_ward_charm`, `escape_talisman`) を run / stock / catalog から削除

## Remaining Legacy Source

- canonical source と recreate bundle からは削除済みです
- `all_functions.sql` など旧 source は reference 扱いのまま残っています
- 今後の編集対象は `db/functions/internal` と `db/functions/rpc` のみです

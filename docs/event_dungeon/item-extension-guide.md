# Event Dungeon Item Extension Guide

## 1. Add Item Catalog Definition

1. `event/dungeon/db/items/item_catalog/` に `<item_code>.json` を追加する
2. `code` と `effect` を必ず記述する
3. `grant_phase` / `collect_phase` / `use_phase` / `settlement_phase` のうち必要な phase を記述する

## 2. Add Effect Handler

- 既存 effect を再利用できるなら handler 追加は不要
- 新 effect が必要なら `event/dungeon/db/items/effects/` に handler SQL を追加する
- handler は 1 effect 1 責務にする

## 3. Register Dispatcher

- 付与型なら `evd_dispatch_apply_granted_item.sql` に登録する
- 常時補正型なら `evd_collect_passive_modifiers.sql` に登録する
- 使用時なら `evd_dispatch_use_item.sql` に登録する
- 帰還精算なら `evd_dispatch_finish_run_escape_settlement.sql` に登録する
- 死亡精算なら `evd_dispatch_finish_run_death_settlement.sql` に登録する
- 未登録の effect は `evd_validate_item_effect_registry()` と validation script で検出される

## 4. Rebuild Bundle

1. `build_event_dungeon_bundle.ps1` を実行する
2. `validate_event_dungeon_items.ps1` を実行する
3. `20260330_event_dungeon_recreate_functions.sql` を再生成する

## 5. Verify

- `select * from public.evd_validate_item_effect_registry();` が 0 行
- 対象 phase の smoke test を更新する
- caller 側に item code 分岐を戻していないことをレビューする
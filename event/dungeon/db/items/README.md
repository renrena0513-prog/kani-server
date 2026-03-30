# Event Dungeon Item Runtime

## Directories

- `item_catalog/`
  - アイテムごとの定義ファイル
- `effects/`
  - effect 単位の handler SQL
- `dispatch/`
  - phase 単位の dispatcher / validation SQL
- `scripts/`
  - 定義ファイルの validation script

## Runtime Functions

- `evd_dispatch_apply_granted_item`
- `evd_collect_passive_modifiers`
- `evd_dispatch_use_item`
- `evd_dispatch_finish_run_escape_settlement`
- `evd_dispatch_finish_run_death_settlement`
- `evd_validate_item_effect_registry`

## Rule

- 新規アイテムはまず `item_catalog/*.json` を追加する
- runtime が必要なら `effects/*.sql` と `dispatch/*.sql` へ登録する
- phase は `granted_item` / `passive_modifiers` / `use_item` / `settlement_escape` / `settlement_death` から選ぶ
- 既存関数から個別 item code 分岐を増やさず、dispatcher 経由で呼ぶ
- validation script と SQL validation を両方通す
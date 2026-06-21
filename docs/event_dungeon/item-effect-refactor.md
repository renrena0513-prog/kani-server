# Event Dungeon Item Effect Refactor

## Current Problem Summary

- item effect の挙動が `evd_start_run`, `evd_move`, `evd_shop_purchase`, `evd_generate_shop_offers`, `evd_buy_stock_item`, `evd_use_item`, `evd_finish_run_calculate` に分散していた
- `effect_data` を持っていても、実際の処理は関数ごとの if / elsif や item code 分岐へ散っていた
- 新規 item 追加時に既存分岐を壊しやすかった

## New Layout

- `event/dungeon/db/items/item_catalog/`
  - アイテムごとの定義ファイル
- `event/dungeon/db/items/effects/`
  - effect ごとの handler
- `event/dungeon/db/items/dispatch/`
  - phase ごとの dispatcher と validation

## Runtime Entry Points

- `evd_dispatch_apply_granted_item`
  - item 付与時の dispatcher
- `evd_collect_passive_modifiers`
  - 常時補正の共通集計
- `evd_dispatch_use_item`
  - 使用時処理の dispatcher
- `evd_dispatch_finish_run_escape_settlement`
  - 帰還時精算の dispatcher
- `evd_dispatch_finish_run_death_settlement`
  - 死亡時精算の dispatcher
- `evd_validate_item_effect_registry`
  - active item の phase 実装漏れを確認する

## Moved Representative Effects

- granted item
  - `substitute`
  - `insurance`
  - `golden_contract`
  - `vault_box`
- passive modifiers
  - `relic_shop_discount_plus_5pct`
  - `relic_carry_limit_plus_1`
  - `relic_return_multiplier_plus_0_05`
  - `relic_bomb_radar_always`
  - `relic_max_life_plus_1`
  - `relic_death_coin_keep_plus_2pct`
  - `relic_keep_unused_manual_on_death`
- use item
  - `heal_hp`
  - `increase_max_hp`
  - `escape_rope`
  - `bomb_radar`
  - `stairs_search`
  - `calamity_map`
  - `full_scan_map`
  - `holy_grail`
  - `abyss_ticket`
- settlement
  - `golden_contract`
  - `return_multiplier_bonus_on_escape`
  - `vault_box`
  - `insurance`

## Current State

- `evd_use_item` は dispatcher 呼び出しへ置き換え済み
- `evd_finish_run_calculate` は escape / death settlement dispatcher 呼び出しへ置き換え済み
- 今後の item 追加は phase ごとに handler を追加する
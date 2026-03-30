# Event Dungeon Refactor Report

## 1. 現状分析

- アプリ側の実行入口は [`event/dungeon/js/game.js`](C:/Arakawa/かに鯖サイト/event/dungeon/js/game.js) の `api.rpc(...)` で、直接呼ばれている RPC は 9 個です。
- アプリ側の参照クエリは [`event/dungeon/js/api.js`](C:/Arakawa/かに鯖サイト/event/dungeon/js/api.js) で `profiles` / `evd_game_runs` / `evd_run_floors` / `evd_run_events` / `evd_player_item_stocks` / `evd_item_catalog` を直接読んでいます。
- DB 側には `event/dungeon/db/functions/*.sql` の分割版に加えて、同内容を束ねた `all_functions.sql`、差分パッチ寄りの `evd_latest_bundle_update.sql`、さらに一部関数を再定義する `evd_add_new_items_and_normal_limited_shop.sql` があり、正本が不明瞭です。
- `view` / `trigger` / `seed` / `job` はイベントダンジョン配下では見つかりませんでした。`old_sql` も実質空です。
- 推測: 実際の本番 DB でどの SQL が最後に適用されたかはリポジトリだけでは断定できません。コードベース上は「分割版 + 後続パッチファイル」が最新候補です。

### 問題点

- 関数の正本が 1 箇所に定まっていない
- `start_run` / `move` / `finish_run` が肥大化しており責務が混在している
- 旧 bundle SQL が残っていて、再適用すると意図せず巻き戻る危険がある
- 関数の公開境界が曖昧で、RPC と内部 helper が同列に並んでいる

## 2. 既存 DB 関数の棚卸し

詳細一覧は [`db-function-inventory.md`](C:/Arakawa/かに鯖サイト/docs/event_dungeon/db-function-inventory.md) に集約しています。

### 直接 RPC 呼び出しされる関数

- `evd_set_stock_item_set`
- `evd_buy_stock_item`
- `evd_start_run`
- `evd_move`
- `evd_use_item`
- `evd_resolve_stairs`
- `evd_claim_altar_reward`
- `evd_resolve_thief`
- `evd_shop_purchase`

### 内部 helper として使われる関数

- 認証・共通: `evd_current_user_id`, `evd_add_log`, `evd_build_snapshot`
- JSON 操作: `evd_add_item`, `evd_add_bucket_item`, `evd_remove_item`, `evd_remove_bucket_item`, `evd_get_cell`, `evd_set_cell`
- 生成・抽選: `evd_pick_weighted`, `evd_generate_floor`, `evd_generate_shop_offers`, `evd_get_floor_value`, `evd_resolve_floor_shift`
- 終了処理: `evd_finish_run`

### 退役対象

- `evd_get_range_value`
- `evd_random_int`
- `evd_random_numeric`
- source bundle としての `all_functions.sql`
- source bundle としての `evd_latest_bundle_update.sql`
- source bundle としての `evd_add_new_items_and_normal_limited_shop.sql`

## 3. 削除方針

- 旧 bundle 系 SQL は正本から外し、アーカイブ扱いにします。
- DB 関数は migration で `drop function if exists` してから再作成する前提にしました。
- 未使用 helper の `evd_get_range_value`、およびそれ専用の乱数 helper `evd_random_int` / `evd_random_numeric` は再作成しません。
- アプリ互換性を壊さないため、公開 RPC 名は `evd_resolve_thief` を除いて維持しつつ中身を再構築する方針にしました。

## 4. 再設計方針

- 公開 RPC と内部 helper をディレクトリで分離する
- 正本は `event/dungeon/db/functions/internal` と `event/dungeon/db/functions/rpc` に限定する
- migration 用 bundle は script で生成し、手で複製しない
- `evd_get_floor_value` へ乱数処理を内包して helper 数を減らす
- 既存 JS の RPC 契約は維持し、今回の変更を DB 配置整理に集中させる

## 5. 実施した変更

- 新しい正本ディレクトリを追加
  - `event/dungeon/db/functions/internal`
  - `event/dungeon/db/functions/rpc`
- 旧分割 SQL から canonical copy を作成し、公開 RPC と内部 helper を分離
- `evd_get_floor_value` を更新し、`evd_get_range_value` / `evd_random_int` / `evd_random_numeric` 依存を除去
- 削除 SQL を追加
  - [`20260330_event_dungeon_drop_legacy_functions.sql`](C:/Arakawa/かに鯖サイト/event/dungeon/db/migrations/20260330_event_dungeon_drop_legacy_functions.sql)
- 再作成 SQL の生成スクリプトを追加
  - [`build_event_dungeon_bundle.ps1`](C:/Arakawa/かに鯖サイト/event/dungeon/db/scripts/build_event_dungeon_bundle.ps1)
- 再作成 SQL の生成先を追加
  - [`20260330_event_dungeon_recreate_functions.sql`](C:/Arakawa/かに鯖サイト/event/dungeon/db/migrations/20260330_event_dungeon_recreate_functions.sql)
- 保守資料を追加
  - [`maintenance-guide.md`](C:/Arakawa/かに鯖サイト/docs/event_dungeon/maintenance-guide.md)
  - [`STRUCTURE.md`](C:/Arakawa/かに鯖サイト/event/dungeon/db/functions/STRUCTURE.md)

## 6. 新しいディレクトリ構成

```text
docs/
  event_dungeon/
    refactor-report.md
    db-function-inventory.md
    maintenance-guide.md

event/dungeon/db/
  archive/
    README.md
  functions/
    STRUCTURE.md
    internal/
      evd_*.sql
    rpc/
      evd_*.sql
  migrations/
    20260330_event_dungeon_drop_legacy_functions.sql
    20260330_event_dungeon_recreate_functions.sql
  schema/
    README.md
  scripts/
    build_event_dungeon_bundle.ps1
```

## 7. 新しい DB 関数構成

### Public RPC

- `evd_set_stock_item_set`
- `evd_buy_stock_item`
- `evd_start_run`
- `evd_move`
- `evd_use_item`
- `evd_resolve_stairs`
- `evd_claim_altar_reward`
- `evd_resolve_thief`
- `evd_shop_purchase`
- `evd_finish_run`

### Internal Helper

- `evd_current_user_id`
- `evd_add_log`
- `evd_build_snapshot`
- `evd_add_item`
- `evd_add_bucket_item`
- `evd_remove_item`
- `evd_remove_bucket_item`
- `evd_get_cell`
- `evd_set_cell`
- `evd_pick_weighted`
- `evd_generate_floor`
- `evd_generate_shop_offers`
- `evd_get_floor_value`
- `evd_resolve_floor_shift`

### 廃止

- `evd_get_range_value`
- `evd_random_int`
- `evd_random_numeric`

## 8. DB 処理の読み方

1. 画面操作は [`event/dungeon/js/game.js`](C:/Arakawa/かに鯖サイト/event/dungeon/js/game.js) から RPC に入る
2. 公開境界は `db/functions/rpc` を見る
3. RPC 内で共通処理に降りる箇所は `db/functions/internal` を追う
4. migration へ反映する時は build script で bundle を生成してから SQL Editor に流す

## 9. 保守と拡張のガイド

- 新しい RPC を増やす前に、既存 RPC の責務を増やさず内部 helper へ切り出す
- 画面変更だけなら `js/game.js` と `js/ui.js` を先に確認する
- floor 生成調整は `evd_generate_floor` と `evd_floor_tile_weight_profiles`
- マス効果の数値調整は `evd_get_floor_value` と `evd_floor_value_profiles`
- ショップ調整は `evd_generate_shop_offers` / `evd_shop_purchase`
- ラン終了時の持ち帰り条件は `evd_finish_run`

## 10. 残課題

- `evd_start_run` / `evd_move` / `evd_finish_run` はまだ大きく、次段でさらに内部 helper へ分解余地があります
- 本番 DB で最後に適用された SQL は未確認です。適用前に migration 差分確認が必要です
- 現在のワークツリーに既存変更があるため、旧ファイルの物理移動や削除は今回見送り、canonical source の追加で整理しています



# Event Dungeon Maintenance Guide

## First Stop

- 画面イベントから追うなら [`event/dungeon/js/game.js`](C:/Arakawa/かに鯖サイト/event/dungeon/js/game.js)
- 初期取得クエリを追うなら [`event/dungeon/js/api.js`](C:/Arakawa/かに鯖サイト/event/dungeon/js/api.js)
- DB 正本を追うなら [`STRUCTURE.md`](C:/Arakawa/かに鯖サイト/event/dungeon/db/functions/STRUCTURE.md)
- item effect を追うなら [`event/dungeon/db/items/README.md`](C:/Arakawa/かに鯖サイト/event/dungeon/db/items/README.md)

## App To DB Flow

1. UI action
2. `game.js` で RPC 呼び出し
3. `db/functions/rpc/*.sql` でユースケース実行
4. item effect が絡む場合は `db/items/dispatch/*.sql` を経由する
5. 必要に応じて `db/items/effects/*.sql` の handler を呼ぶ
6. `evd_build_snapshot` が画面更新用 payload を返す

## Where To Modify

- ラン開始条件: `rpc/evd_start_run.sql`
- 1 マス移動時の分岐: `rpc/evd_move.sql`
- アイテム使用: `rpc/evd_use_item.sql`
- 階段処理: `rpc/evd_resolve_stairs.sql`
- ショップ購入: `rpc/evd_shop_purchase.sql`
- 祭壇報酬: `rpc/evd_claim_altar_reward.sql`
- 持ち帰り倍率・死亡時返却: `rpc/evd_finish_run.sql`
- 使用時 dispatcher: `items/dispatch/evd_dispatch_use_item.sql`
- 帰還精算 dispatcher: `items/dispatch/evd_dispatch_finish_run_escape_settlement.sql`
- 死亡精算 dispatcher: `items/dispatch/evd_dispatch_finish_run_death_settlement.sql`
- 常時補正集計: `items/dispatch/evd_collect_passive_modifiers.sql`
- phase 検証: `items/dispatch/evd_validate_item_effect_registry.sql`

## Removal Note

- `盗賊` / `落とし穴` / `転送罠` は仕様削除済みです
- `evd_resolve_thief` は削除済みで、今後は再導入しません
- hazard hint は `罠` / `呪い` のみを対象にします

## Migration Rule

1. `internal` / `rpc` / `items` 配下を正本として修正する
2. [`build_event_dungeon_bundle.ps1`](C:/Arakawa/かに鯖サイト/event/dungeon/db/scripts/build_event_dungeon_bundle.ps1) を実行する
3. `validate_event_dungeon_items.ps1` と `evd_validate_item_effect_registry()` を通す
4. 生成された [`20260330_event_dungeon_recreate_functions.sql`](C:/Arakawa/かに鯖サイト/event/dungeon/db/migrations/20260330_event_dungeon_recreate_functions.sql) を確認する
5. drop SQL、recreate SQL、必要ならデータ cleanup migration の順で適用する
6. 正本以外の SQL は編集しない

## Split Result

- `evd_start_run`: 入場可否判定、初期 inventory、初回 floor 作成、開始ログへ分割済み
- `evd_move`: タイル効果解決、移動後確定処理へ分割済み
- `evd_use_item`: use-item dispatcher 経由へ分割済み
- `evd_finish_run`: 復活判定、escape/death settlement dispatcher、返却処理、終了確定へ分割済み
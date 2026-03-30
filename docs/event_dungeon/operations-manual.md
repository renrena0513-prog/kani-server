# Event Dungeon Operations Manual

## 正本ディレクトリ

- `event/dungeon/db/functions/internal`
- `event/dungeon/db/functions/rpc`

## 編集禁止ファイル

- `event/dungeon/db/functions/all_functions.sql`
- `event/dungeon/db/archive/evd_latest_bundle_update.sql`
- `event/dungeon/db/archive/evd_add_new_items_and_normal_limited_shop.sql`
- generate 済み bundle を source として直接編集すること

## 今後の関数追加ルール

1. 先に `internal` または `rpc` のどちらに属するか決める
2. `1 関数 1 責務` を守る
3. 既存 RPC に処理を詰め込まず helper に分ける
4. canonical source 更新後に bundle を再生成する
5. 追加関数は `STRUCTURE.md` と verification SQL に反映する

## SQL レビュー観点

- 関数名と責務が一致しているか
- `security definer` の要否が説明できるか
- advisory lock と transaction 境界を壊していないか
- inventory / floor / payout 更新が二重反映しないか
- snapshot を返すタイミングが既存 contract を壊さないか
- helper 依存順が build order に反映されているか
- 退役対象関数を再導入していないか

## 障害時対応手順

- 基本は [`rollback-guide.md`](C:/Arakawa/かに鯖サイト/docs/event_dungeon/rollback-guide.md) に従う
- まず新規操作停止、次に失敗 SQL と時刻を保全する
- 部分作成状態では dump ベースで戻す

## 検証手順の完成版

- compile: [`compile-verification.md`](C:/Arakawa/かに鯖サイト/docs/event_dungeon/compile-verification.md)
- smoke: [`smoke-test-plan.md`](C:/Arakawa/かに鯖サイト/docs/event_dungeon/smoke-test-plan.md)
- apply: [`production-apply.md`](C:/Arakawa/かに鯖サイト/docs/event_dungeon/production-apply.md)
- go/no-go: [`go-no-go-checklist.md`](C:/Arakawa/かに鯖サイト/docs/event_dungeon/go-no-go-checklist.md)

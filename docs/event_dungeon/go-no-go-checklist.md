# Event Dungeon Go / No-Go Checklist

## GO 条件

- [`compile-verification.md`](C:/Arakawa/かに鯖サイト/docs/event_dungeon/compile-verification.md) の全項目が通過
- [`production-apply.md`](C:/Arakawa/かに鯖サイト/docs/event_dungeon/production-apply.md) の事前条件を満たす
- [`test-checklist.md`](C:/Arakawa/かに鯖サイト/docs/event_dungeon/test-checklist.md) に対応する smoke test を実施し、重大失敗 0 件
- `game.js` / `api.js` の RPC contract が維持されている
- retired helper が DB に残っていない
- archive 対象と正本の境界が運用文書に反映済み

## NO-GO 条件

- recreate 時に compile error が 1 件でも出る
- `pg_proc` 上で引数・戻り値・関数数が期待と一致しない
- active run が残った状態で適用しようとしている
- smoke test の start / move / finish / rollback のいずれかに失敗
- canonical source 以外に未整理の本番 source が残っている
- `all_functions.sql` の dirty 差分を正本扱いしない根拠が共有されていない

## 判定チェックリスト

- [ ] active run 0 件
- [ ] pre-deploy dump 取得済み
- [ ] drop SQL / recreate SQL 最新化済み
- [ ] compile error 0 件
- [ ] `pg_proc` 関数一覧一致
- [ ] retired helper 0 件
- [ ] smoke test 成功
- [ ] rollback 手順確認済み
- [ ] old source 整理方針共有済み
- [ ] 運用移管資料共有済み

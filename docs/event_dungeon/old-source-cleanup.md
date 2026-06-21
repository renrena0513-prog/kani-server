# Event Dungeon Old Source Cleanup

## Archive 済み

- `event/dungeon/db/archive/evd_latest_bundle_update.sql`
- `event/dungeon/db/archive/evd_add_new_items_and_normal_limited_shop.sql`

## 参照専用で残置

- `event/dungeon/db/functions/all_functions.sql`
  - 現在 dirty worktree のため未移動
  - 正本ではない
  - 編集禁止

## all_functions.sql の最終結論

- dirty 差分の内容は `revival_charm` の carried_items 対応、coin pickup bonus 改善、floor shift の補強で、canonical source に既に吸収済み
- よって `all_functions.sql` を正本として残す理由はない
- 結論: dirty worktree 解消後に archive 化、その後削除候補
- 現時点では「参照専用・編集禁止」で固定する

## 物理削除候補

- `event/dungeon/db/functions/all_functions.sql`
  - dirty worktree 解消後に archive へ移動または削除
- `event/dungeon/db/functions/README.md`
  - `STRUCTURE.md` に役割を移した後、内容統合して削除候補
- 旧 root 直下 patch / bundle
  - archive 配下へ移動済みのため、root 直下の再作成は禁止

## dirty worktree の扱い

- `all_functions.sql` の差分は「残すべき正本差分」ではなく「既に canonical source へ反映済みの過去差分」と判断する
- 今回はユーザー既存変更を壊さないため物理削除しない
- 事故防止のため、review / deploy では `all_functions.sql` を入力 source として使わない

## 運用ルール

- 正本以外は編集しない
- 正本は `event/dungeon/db/functions/internal` と `event/dungeon/db/functions/rpc` のみ
- migration 反映は generated bundle のみを使う
- 緊急 patch を作る場合でも、先に canonical source を更新してから bundle を再生成する

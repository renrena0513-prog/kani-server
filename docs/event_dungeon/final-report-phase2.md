# Event Dungeon Phase 2 Final Report

## Scope

- 本番適用手順の整備
- `evd_start_run` / `evd_move` / `evd_finish_run` の追加分割
- 旧 source 整理案の確定
- アプリ側整合確認
- テスト観点整理

## Split Summary

- `evd_start_run`
  - `evd_start_run_load_context`
  - `evd_start_run_build_inventory`
  - `evd_start_run_create_initial_floor`
  - `evd_start_run_log`
- `evd_move`
  - `evd_compute_coin_pickup_bonus`
  - `evd_draw_pickup_item`
  - `evd_resolve_move_tile`
  - `evd_finalize_move`
- `evd_finish_run`
  - `evd_try_consume_revival_charm`
  - `evd_finish_run_calculate`
  - `evd_finish_run_restore_items`
  - `evd_finish_run_finalize`

## Old Source Policy

- 正本: `functions/internal`, `functions/rpc`
- 参照専用: `all_functions.sql`, legacy patch files
- 編集禁止: canonical source 以外の SQL

## Remaining Risks

- DB 実行環境での compile / smoke test は未実施
- 旧 `all_functions.sql` は dirty worktree のため物理移動していない
- patch SQL の一部は archive へ移動候補だが、運用手順優先で今回は候補化までに留める


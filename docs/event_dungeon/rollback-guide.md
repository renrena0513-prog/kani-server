# Event Dungeon Rollback Guide

## 1. ロールバック開始条件

- recreate 後に公開 RPC の作成失敗がある
- smoke test の start / move / finish のいずれかが失敗する
- 進行中 run に対して snapshot 構築ができない

## 2. ロールバック手順

1. event dungeon の新規操作を停止する
2. 失敗ログと失敗した SQL を保存する
3. 直前に保存した pre-deploy dump または旧 recreate bundle を適用する
4. 旧構成へ戻した後、`pg_proc` の `evd_%` 一覧を確認する
5. active run の読取り確認を行う
6. 必要ならアプリ側を旧 bundle に合わせて一時凍結する

## 3. ロールバック用に保持すべきもの

- deploy 前の `pg_proc` 一覧
- deploy 前の schema dump
- 旧構成の recreate SQL
- deploy 時刻と commit hash

## 4. 注意点

- drop 実行後に recreate が途中失敗した場合は、部分作成状態になるため dump ベースで戻す方が安全です
- `evd_game_runs` / `evd_run_floors` / `evd_run_events` のデータはロールバック対象ではなく、関数定義だけを戻します

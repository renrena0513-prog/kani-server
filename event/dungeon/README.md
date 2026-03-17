# Dungeon Event Layout

- `index.html`: 画面本体
- `css/style.css`: ダンジョン専用スタイル
- `js/constants.js`: 定数
- `js/api.js`: Supabase RPC 呼び出し
- `js/ui.js`: 描画/モーダル/UI制御
- `js/game.js`: ゲーム進行ロジック
- `db/evd_dungeon_setup.sql`: ダンジョン用DB定義・関数SQL
- `db/evd_floor_bonus_profiles`: 到達ボーナスを階層ごとに設定
- `db/evd_floor_tile_weight_profiles`: 階層ごとのタイル出現設定（`is_enabled`/`weight`/`min_count`/`max_count`）
- `db/functions/`: `evd_dungeon_setup.sql` から抽出した関数単位SQL

他ページに影響しないよう、ダンジョン固有コードはこのフォルダ内で完結させる。

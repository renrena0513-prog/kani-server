# Event Structure

各イベントゲームは `event/<game>/` 配下に完結させる。

## 推奨構成

- `event/<game>/index.html`
- `event/<game>/css/`
- `event/<game>/js/`
- `event/<game>/db/` (DB定義やRPC用SQL)
- `event/<game>/assets/` (必要なら)

## 互換URL

既存URLを維持したい場合は `event/<game>.html` をリダイレクトとして残す。

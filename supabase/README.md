# SQL Directory Structure

## `sql/SQL`
- Supabase SQL Editor に貼り付けて実行する前提のファイル。
- テーブル定義、RLS、GRANT、関数定義を含むセットアップ系。

## `sql/function`
- DB Function（RPC）本体コードを中心に管理するファイル。
- 関数の個別修正・差し替え用途。

## Current Split Rule
- 構成要素が多い（DDL/RLS/GRANT を含む）ファイルは `SQL`。
- 関数単体・パッチ用途のファイルは `function`。

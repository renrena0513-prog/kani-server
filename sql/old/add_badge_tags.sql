-- badges テーブルにタグ配列を追加（複数タグ対応）
ALTER TABLE badges
ADD COLUMN IF NOT EXISTS tags text[];

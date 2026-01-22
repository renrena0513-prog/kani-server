-- =============================================
-- アンケートテーブル作成 (一時的な機能)
-- 撤去時: このテーブルを DROP するだけでOK
-- =============================================

-- テーブル作成
CREATE TABLE survey_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_user_id TEXT NOT NULL UNIQUE,
    account_name TEXT,  -- ニックネーム（一目でわかるように）
    choice INTEGER NOT NULL CHECK (choice BETWEEN 1 AND 4),
    additional_comment TEXT,  -- 選択肢3を選んだ場合の追加コメント
    free_comment TEXT,        -- 自由記入欄
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックス（ユーザーIDで高速検索）
CREATE INDEX idx_survey_responses_user ON survey_responses(discord_user_id);

-- RLS有効化
ALTER TABLE survey_responses ENABLE ROW LEVEL SECURITY;

-- 誰でも自分の回答を挿入可能
CREATE POLICY "Users can insert own response"
    ON survey_responses FOR INSERT
    WITH CHECK (true);

-- 誰でも回答を読み取り可能（自分の回答チェック用）
CREATE POLICY "Users can read responses"
    ON survey_responses FOR SELECT
    USING (true);

-- =============================================
-- 撤去時のSQL (必要になったら実行)
-- =============================================
-- DROP TABLE IF EXISTS survey_responses;

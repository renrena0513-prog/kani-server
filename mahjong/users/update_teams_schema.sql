-- teamsテーブルにlogo_badge_idカラムを追加
ALTER TABLE teams 
ADD COLUMN logo_badge_id UUID REFERENCES badges(id);

-- コメント追加
COMMENT ON COLUMN teams.logo_badge_id IS 'チームロゴとして使用するバッジのID';

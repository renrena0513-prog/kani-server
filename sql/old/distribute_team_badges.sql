-- チーム所属ユーザーに対して、そのチームのロゴバッジを一括付与するスクリプト
-- 既に持っている場合はスキップします

INSERT INTO user_badges_new (user_id, badge_id, purchased_price, is_mutant, acquired_at)
SELECT
  p.discord_user_id,        -- user_badges_new.user_id (profiles.discord_user_id)
  t.logo_badge_id,          -- user_badges_new.badge_id (teams.logo_badge_id)
  0,                        -- purchased_price
  false,                    -- is_mutant
  NOW()                     -- acquired_at
FROM profiles p
JOIN teams t ON p.team_id = t.id
WHERE t.logo_badge_id IS NOT NULL -- ロゴバッジが設定されているチームのみ
AND NOT EXISTS (
    -- 既にそのバッジを持っているかチェック
    SELECT 1 
    FROM user_badges_new ub 
    WHERE ub.user_id = p.discord_user_id 
    AND ub.badge_id = t.logo_badge_id
);

-- 実行結果を確認（オプション）
-- SELECT * FROM user_badges_new WHERE acquired_at > NOW() - INTERVAL '1 minute';

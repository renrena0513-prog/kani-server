-- 指定されたバッジID
-- '626d7f12-1eb6-4e90-bf28-2dde532794bf'

INSERT INTO public.user_badges_new (user_id, badge_id, purchased_price)
SELECT DISTINCT m.discord_user_id, '626d7f12-1eb6-4e90-bf28-2dde532794bf'::uuid, 0
FROM public.match_results m
WHERE m.tournament_type = '第二回麻雀大会'
  AND NOT EXISTS (
      -- 既に持っている人には付与しない
      SELECT 1 
      FROM public.user_badges_new ub 
      WHERE ub.user_id = m.discord_user_id 
        AND ub.badge_id = '626d7f12-1eb6-4e90-bf28-2dde532794bf'::uuid
  );

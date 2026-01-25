-- badgesテーブルから未使用のgacha_weightカラムを削除
-- Note: rarity_thresholdsのgacha_weightはお賽銭機能で使用するため維持

alter table public.badges drop column if exists gacha_weight;

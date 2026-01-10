-- ユーザーデータ統合スクリプト
-- 移行元: 430021517145931777 (Source)
-- 移行先: 284615072922468352 (Target)

DO $$
DECLARE
    v_old_id Text := '430021517145931777';
    v_new_id Text := '284615072922468352';
    v_old_coins Int;
    v_old_assets BigInt;
    v_old_team_id UUID;
BEGIN
    -- 1. 移行元プロフィールの情報を取得
    SELECT coins, total_assets, team_id 
    INTO v_old_coins, v_old_assets, v_old_team_id
    FROM profiles WHERE discord_user_id = v_old_id;

    IF NOT FOUND THEN
        RAISE NOTICE '移行元ユーザー (%) が見つかりません。中断します。', v_old_id;
        RETURN;
    END IF;

    -- 2. 移行先プロフィールの存在確認と合算
    IF EXISTS (SELECT 1 FROM profiles WHERE discord_user_id = v_new_id) THEN
        -- 合算処理
        UPDATE profiles 
        SET coins = coins + COALESCE(v_old_coins, 0),
            total_assets = total_assets + COALESCE(v_old_assets, 0)
        WHERE discord_user_id = v_new_id;

        -- チーム未加入の場合のみチームを継承
        UPDATE profiles 
        SET team_id = v_old_team_id
        WHERE discord_user_id = v_new_id AND team_id IS NULL;
    ELSE
        -- 移行先がまだ profiles にない場合は、移行元のレコードを書き換えて作成
        INSERT INTO profiles (discord_user_id, account_name, avatar_url, coins, total_assets, team_id)
        SELECT v_new_id, account_name, avatar_url, coins, total_assets, team_id
        FROM profiles WHERE discord_user_id = v_old_id;
    END IF;

    -- 3. 関連データの紐付け変更 (Update referencing tables)
    
    -- activity_logs
    UPDATE activity_logs SET user_id = v_new_id WHERE user_id = v_old_id;
    
    -- match_results
    UPDATE match_results SET discord_user_id = v_new_id WHERE discord_user_id = v_old_id;
    
    -- user_badges_new (所持バッジ)
    UPDATE user_badges_new SET user_id = v_new_id WHERE user_id = v_old_id;
    
    -- team_admin_requests
    UPDATE team_admin_requests SET requester_discord_id = v_new_id WHERE requester_discord_id = v_old_id;
    UPDATE team_admin_requests SET target_discord_id = v_new_id WHERE target_discord_id = v_old_id;
    
    -- badges (バッジ権利者情報)
    UPDATE badges SET discord_user_id = v_new_id WHERE discord_user_id = v_old_id;

    -- 4. 移行元プロフィールの削除（統合完了）
    DELETE FROM profiles WHERE discord_user_id = v_old_id;

    RAISE NOTICE 'ユーザー % から % へのデータ統合が完了しました。', v_old_id, v_new_id;
END $$;

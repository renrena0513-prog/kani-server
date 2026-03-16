(function () {
    const { LOG_LIMIT } = window.DUNGEON_CONSTANTS;

    function getUserKey(user) {
        return user?.user_metadata?.provider_id || null;
    }

    async function getProfile(userId) {
        return supabaseClient
            .from('profiles')
            .select('coins, total_assets, gacha_tickets, mangan_tickets, account_name')
            .eq('discord_user_id', userId)
            .maybeSingle();
    }

    async function getStocks(userId) {
        const { data, error } = await supabaseClient
            .from('evd_player_item_stocks')
            .select('item_code, quantity, updated_at, evd_item_catalog(name, description, item_kind, base_price, carry_in_allowed, shop_pool, sort_order)')
            .eq('user_id', userId)
            .gt('quantity', 0)
            .order('updated_at', { ascending: false });

        if (error) {
            return { data: [], error };
        }

        return {
            data: (data || []).sort((a, b) => {
                const left = a.evd_item_catalog?.sort_order ?? 999;
                const right = b.evd_item_catalog?.sort_order ?? 999;
                return left - right;
            }),
            error: null
        };
    }

    async function getActiveRun(userId) {
        return supabaseClient
            .from('evd_game_runs')
            .select('*')
            .eq('user_id', userId)
            .eq('status', '進行中')
            .order('started_at', { ascending: false })
            .limit(1)
            .maybeSingle();
    }

    async function getCurrentFloor(runId, floorNo) {
        return supabaseClient
            .from('evd_run_floors')
            .select('*')
            .eq('run_id', runId)
            .eq('floor_no', floorNo)
            .maybeSingle();
    }

    async function getLogs(runId) {
        return supabaseClient
            .from('evd_run_events')
            .select('event_type, message, created_at')
            .eq('run_id', runId)
            .order('step_no', { ascending: false })
            .limit(LOG_LIMIT);
    }

    async function getCatalog() {
        return supabaseClient
            .from('evd_item_catalog')
            .select('*')
            .eq('is_active', true)
            .order('sort_order');
    }

    async function getBootstrap() {
        const user = await getCurrentUser();
        if (!user) {
            throw new Error('ログインが必要です');
        }

        const userId = getUserKey(user);
        const [
            profileRes,
            stocksRes,
            runRes,
            catalogRes
        ] = await Promise.all([
            getProfile(userId),
            getStocks(userId),
            getActiveRun(userId),
            getCatalog()
        ]);

        if (profileRes.error) throw profileRes.error;
        if (stocksRes.error) throw stocksRes.error;
        if (runRes.error) throw runRes.error;
        if (catalogRes.error) throw catalogRes.error;

        let floor = null;
        let logs = [];
        if (runRes.data) {
            const [floorRes, logsRes] = await Promise.all([
                getCurrentFloor(runRes.data.id, runRes.data.current_floor),
                getLogs(runRes.data.id)
            ]);
            if (floorRes.error) throw floorRes.error;
            if (logsRes.error) throw logsRes.error;
            floor = floorRes.data;
            logs = logsRes.data || [];
        }

        return {
            user,
            userId,
            profile: profileRes.data,
            stocks: stocksRes.data || [],
            catalog: catalogRes.data || [],
            run: runRes.data,
            floor,
            logs: logs.reverse()
        };
    }

    async function rpc(name, params) {
        const { data, error } = await supabaseClient.rpc(name, params);
        if (error) throw error;
        return data;
    }

    window.DUNGEON_API = {
        getBootstrap,
        rpc,
        getCurrentFloor,
        getLogs
    };
})();

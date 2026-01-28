        async function checkTeamNotifications() {
            const user = await getCurrentUser();
            if (!user) return;
            const discordId = user.user_metadata.provider_id;
            const { data: myTeams } = await supabaseClient.from('teams').select('id').eq('creator_discord_id', discordId);
            if (!myTeams || myTeams.length === 0) return;

            const teamIds = myTeams.map(t => t.id);
            const { data: pendingRequests } = await supabaseClient.from('team_join_requests').select('id').in('team_id', teamIds).in('status', ['pending', 'leave_pending']);
            const count = pendingRequests?.length || 0;

            if (count > 0) {
                const badge = document.getElementById('team-notification-badge');
                if (badge) {
                    badge.textContent = count;
                    badge.style.display = 'inline';
                }
            }
        }

        document.addEventListener('DOMContentLoaded', checkTeamNotifications);

// Mutant badge UI helpers
(function () {
    function ensureShine(container) {
        if (!container) return null;
        let shine = container.querySelector('.mutant-badge-shine');
        if (!shine) {
            shine = document.createElement('div');
            shine.className = 'mutant-badge-shine';
            container.appendChild(shine);
        }
        return shine;
    }

    function setActive(container, isActive) {
        if (!container) return;
        container.classList.toggle('active', !!isActive);
        const shine = ensureShine(container);
        if (shine) {
            shine.style.display = isActive ? 'block' : 'none';
        }
    }

    function renderShine(isActive) {
        return `<div class="mutant-badge-shine" style="display: ${isActive ? 'block' : 'none'};"></div>`;
    }

    async function applyEffect(containerId, badgeId, userId) {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (!badgeId || !userId || typeof supabaseClient === 'undefined') {
            setActive(container, false);
            return;
        }

        try {
            const { data } = await supabaseClient
                .from('user_badges_new')
                .select('uuid')
                .eq('user_id', userId)
                .eq('badge_id', badgeId)
                .eq('is_mutant', true)
                .limit(1);

            const isMutant = data && data.length > 0;
            setActive(container, isMutant);
        } catch (err) {
            console.error('Mutant effect check failed:', err);
        }
    }

    window.MutantBadge = {
        ensureShine,
        setActive,
        renderShine,
        applyEffect
    };
})();

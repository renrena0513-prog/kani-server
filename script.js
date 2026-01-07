// パーティクルのランダム化（位置・速度・順序）
document.addEventListener('DOMContentLoaded', async () => {
    const particlesContainer = document.getElementById('particles');
    if (!particlesContainer) return;

    // Supabaseからバッジ画像を取得
    try {
        const { data: badges, error } = await supabaseClient
            .from('badges')
            .select('image_url, name')
            .order('name', { ascending: true });

        if (error) {
            console.error('バッジ取得エラー:', error);
            return;
        }

        if (!badges || badges.length === 0) {
            console.log('バッジがありません');
            return;
        }

        // バッジ画像からパーティクルを生成
        badges.forEach(badge => {
            if (!badge.image_url) return;

            const img = document.createElement('img');
            img.className = 'particle';
            img.src = badge.image_url;
            img.alt = badge.name || '';
            particlesContainer.appendChild(img);
        });

        // 生成後にアニメーションを設定
        initParticleAnimation();

    } catch (err) {
        console.error('パーティクル生成エラー:', err);
    }
});

// パーティクルアニメーションの初期化
function initParticleAnimation() {
    const particles = document.querySelectorAll('.particle');

    particles.forEach((particle) => {
        // 初回の位置設定（ランダム）
        particle.style.left = `${Math.random() * 90}%`;

        // 速度もランダム（12秒〜25秒の範囲）
        particle.style.animationDuration = `${12 + Math.random() * 13}s`;

        // ディレイもランダム（0秒〜30秒の範囲）
        particle.style.animationDelay = `${Math.random() * 30}s`;

        // アニメーション完了時に位置を変更
        particle.addEventListener('animationiteration', () => {
            particle.style.left = `${Math.random() * 90}%`;
        });
    });
}

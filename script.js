// パーティクルのランダム化（位置・速度・順序）
document.addEventListener('DOMContentLoaded', () => {
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
});

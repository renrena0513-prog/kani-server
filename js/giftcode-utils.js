// ギフトコード正規化ユーティリティ
function normalizeGiftCode(input) {
    if (!input) return '';
    let value = String(input).normalize('NFKC');
    value = value.replace(/\s+/g, '');
    value = value.toLowerCase();
    value = value.replace(/[\u30a1-\u30f6]/g, (ch) => {
        return String.fromCharCode(ch.charCodeAt(0) - 0x60);
    });
    return value;
}

function formatGiftRewards(coin, kiganfu, manganfu, badgeName, badgeImage) {
    const parts = [];
    if (coin > 0) parts.push(`🪙${Number(coin).toLocaleString()}`);
    if (kiganfu > 0) parts.push(`🎟️祈願符${Number(kiganfu).toLocaleString()}枚`);
    if (manganfu > 0) parts.push(`🧧満願符${Number(manganfu).toLocaleString()}枚`);
    if (badgeName) {
        const imgHtml = badgeImage ? `<img src="${badgeImage}" style="width:20px;height:20px;border-radius:4px;vertical-align:middle;margin-right:2px;">` : '';
        parts.push(`🏅${imgHtml}${badgeName}`);
    }
    return parts.join('、');
}

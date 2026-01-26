/**
 * バッジ計算ユーティリティ（新レアリティシステム対応）
 * 
 * 使い方:
 * 1. このファイルを読み込む前に rarity_thresholds をフェッチし、
 *    window.rarityThresholds = thresholds; としてセットしておく
 * 2. 各関数を呼び出す
 */

/**
 * 基本価格から基本★ランクを取得
 * @param {number} basePrice - badges.price
 * @param {string|null} fixedRarity - badges.fixed_rarity_name
 * @param {Array} thresholds - rarity_thresholds の配列（threshold_value昇順）
 * @returns {object} { starLevel: number, rarityName: string }
 */
function getBaseRarity(basePrice, fixedRarity, thresholds) {
    if (fixedRarity) {
        const idx = thresholds.findIndex(t => t.rarity_name === fixedRarity);
        return { starLevel: idx + 1, rarityName: fixedRarity };
    }
    if (!thresholds || thresholds.length === 0) {
        return { starLevel: 1, rarityName: '★1 並品・I' };
    }

    let starLevel = 1;
    let rarityName = thresholds[0].rarity_name;

    for (let i = 0; i < thresholds.length; i++) {
        if (basePrice >= thresholds[i].threshold_value) {
            starLevel = i + 1;
            rarityName = thresholds[i].rarity_name;
        } else {
            break;
        }
    }

    return { starLevel, rarityName };
}

/**
 * 変動型バッジの最終★ランクを計算（流通数で昇格、上限★46）
 * @param {number} baseStarLevel - 基本★レベル
 * @param {number} circulationCount - 流通数（枚数）
 * @param {Array} thresholds - rarity_thresholds の配列
 * @returns {object} { starLevel: number, rarityName: string }
 */
function getVariableTypeRarity(baseStarLevel, uniqueOwnerCount, thresholds) {
    const MAX_STAR = 46; // ★46（伝説）が上限
    const finalStar = Math.min(baseStarLevel + Math.max(0, uniqueOwnerCount - 1), MAX_STAR);

    // thresholds は 1-indexed で ★1 = index 0
    const idx = finalStar - 1;
    if (idx < 0 || idx >= thresholds.length) {
        return { starLevel: MAX_STAR, rarityName: thresholds[MAX_STAR - 1]?.rarity_name || '★46 伝説' };
    }

    return { starLevel: finalStar, rarityName: thresholds[idx].rarity_name };
}

/**
 * ★レベルから市場価値（基準価格）を取得
 * @param {number} starLevel - 最終★レベル
 * @param {Array} thresholds - rarity_thresholds の配列
 * @returns {number} 市場価値（C）
 */
function getMarketValue(starLevel, thresholds) {
    const idx = starLevel - 1;
    if (idx < 0 || idx >= thresholds.length) {
        return thresholds[0]?.threshold_value || 50;
    }
    return thresholds[idx].threshold_value;
}

/**
 * 売却価格を計算（2段階下のレアリティ価格、下限★1=50C）
 * @param {number} currentStarLevel - 現在の★レベル
 * @param {Array} thresholds - rarity_thresholds の配列
 * @returns {number} 売却価格（C）
 */
function getSellPrice(currentStarLevel, thresholds) {
    if (currentStarLevel === 1) return 30; // 特例: Rank 1は30
    const sellStarLevel = Math.max(currentStarLevel - 2, 1); // 2段階下、最低★1
    return getMarketValue(sellStarLevel, thresholds);
}

/**
 * バッジの市場価値と売却価格を一括計算
 * @param {object} badge - バッジオブジェクト（price, sales_type, fixed_rarity_name）
 * @param {number} circulationCount - 流通数（変動型の場合に使用）
 * @param {Array} thresholds - rarity_thresholds の配列
 * @returns {object} { starLevel, rarityName, marketValue, sellPrice }
 */
function calculateBadgeValues(badge, uniqueOwnerCount, thresholds) {
    const { starLevel: baseStar, rarityName: baseRarityName } = getBaseRarity(
        badge.price,
        badge.fixed_rarity_name,
        thresholds
    );

    let assetStar, buyingStar;
    let finalRarityName;

    if (badge.sales_type === '変動型') {
        // 資産価値用: n-1 (1枚目は基本ランク)
        const assetResult = getVariableTypeRarity(baseStar, uniqueOwnerCount, thresholds);
        assetStar = assetResult.starLevel;
        finalRarityName = assetResult.rarityName;

        // 購入価格用: n (1枚目からランク上昇考慮、ただし0枚のときは0)
        // ロジック: baseStar + n
        // countに1足すのではなく、nそのものを加算するロジックが必要だが、
        // getVariableTypeRarity は count-1 している。
        // なので、count+1 を渡せば (count+1)-1 = count となり、期待通りの base + count になる。
        const buyingResult = getVariableTypeRarity(baseStar, uniqueOwnerCount + 1, thresholds);
        buyingStar = buyingResult.starLevel;
    } else {
        // 固定型、換金品、限定品など
        assetStar = baseStar;
        buyingStar = baseStar;
        finalRarityName = baseRarityName;
    }

    const marketValue = getMarketValue(assetStar, thresholds);
    const buyingPrice = getMarketValue(buyingStar, thresholds);
    const sellPrice = getSellPrice(assetStar, thresholds); // 売却は資産価値基準

    return {
        starLevel: assetStar, // 資産ランクを表示
        rarityName: finalRarityName,
        marketValue, // 資産価値
        buyingPrice, // 購入価格 (新規)
        sellPrice
    };
}

/**
 * ミュータントの場合の資産価値（3倍）
 * @param {number} marketValue - 通常の市場価値
 * @param {boolean} isMutant - ミュータントかどうか
 * @returns {number} 資産価値
 */
function getMutantValue(marketValue, isMutant) {
    return isMutant ? marketValue * 3 : marketValue;
}

// グローバルに公開
window.BadgeUtils = {
    getBaseRarity,
    getVariableTypeRarity,
    getMarketValue,
    getSellPrice,
    calculateBadgeValues,
    getMutantValue
};

// 共通：バッジ売却確認UI
// 依存: getRarityClass (supabase-config.js), shopActionModal のDOM

function buildSellConfirmContent(item) {
    const name = item.badge_name || '';
    const buyPrice = Number(item.purchased_price) || 0;
    const sellPrice = Number(item.sell_price) || 0;
    const marketValue = Number(item.market_value) || 0;
    const profit = sellPrice - buyPrice;
    const profitStr = (profit >= 0 ? '+' : '') + profit.toLocaleString();

    const rarityLabel = item.rarity_name || '';
    const sellRarityLabel = item.sell_rarity_name || rarityLabel;
    const rarityClass = rarityLabel ? getRarityClass(rarityLabel) : '';
    const sellRarityClass = sellRarityLabel ? getRarityClass(sellRarityLabel) : rarityClass;

    const typeLabel = item.sales_type || '固定型';
    const creatorName = item.creator_name || '不明';
    const creatorAvatar = item.creator_avatar || '';
    const circulation = item.market_count || 0;
    const isConvertible = item.sales_type === '換金品';

    const purchaseLabel = buyPrice <= 0 ? '無料' : `${rarityLabel}💵${buyPrice.toLocaleString()}`;
    const assetLabel = isConvertible
        ? `💵${marketValue.toLocaleString()}`
        : `${rarityLabel}💵${marketValue.toLocaleString()}`;
    const sellLabel = isConvertible
        ? `💵${sellPrice.toLocaleString()}`
        : `${sellRarityLabel}💵${sellPrice.toLocaleString()}`;

    const creatorAvatarHtml = creatorAvatar
        ? `<img src="${creatorAvatar}" style="width:20px;height:20px;border-radius:50%;object-fit:cover;">`
        : '';
    const profitClass = profit < 0 ? 'profit-negative' : '';

    const purchaseLine = buyPrice <= 0
        ? '無料'
        : `<span class="rarity-pill ${rarityClass}" style="background: rgba(0,0,0,0.2);">${rarityLabel}</span>💵${buyPrice.toLocaleString()}`;
    const assetLine = assetLabel.startsWith('💵')
        ? assetLabel
        : `<span class="rarity-pill ${rarityClass}" style="background: rgba(0,0,0,0.2);">${rarityLabel}</span>💵${marketValue.toLocaleString()}`;
    const sellLine = sellLabel.startsWith('💵')
        ? sellLabel
        : `<span class="rarity-pill ${sellRarityClass}" style="background: rgba(0,0,0,0.2);">${sellRarityLabel}</span>💵${sellPrice.toLocaleString()}`;

    return `
        <h5 class="fw-bold mb-2">売却の確認</h5>
        <div class="fw-bold mb-1">${name}</div>
        <div class="d-flex justify-content-center gap-2 flex-wrap mb-2 sell-meta-row">
            ${rarityLabel ? `<span class="rarity-pill ${rarityClass}" style="background: rgba(0,0,0,0.2);">${rarityLabel}</span>` : ''}
            <span class="badge badge-type-pill ${typeLabel === '変動型' ? 'rarity-epic' : 'bg-light text-dark border'}">${typeLabel}</span>
            <span class="creator-pill">${creatorAvatarHtml}<span>${creatorName}</span></span>
        </div>
        <div class="text-muted mb-3">流通数：${circulation}枚</div>
        <div class="text-start sell-detail-large">
            <div class="sell-line">購入額：${purchaseLine}</div>
            <div class="sell-line">資産価値：${assetLine}</div>
            <div class="sell-line">売却額：${sellLine}</div>
            <div class="fw-bold mt-2 ${profitClass}">損益：💵${profitStr}</div>
        </div>
    `;
}

function renderSellConfirmModal(item, onConfirm, options = {}) {
    const content = document.getElementById('shopActionContent');
    const btnExec = document.getElementById('btnShopActionExec');
    if (!content || !btnExec) return;

    content.innerHTML = buildSellConfirmContent(item);
    btnExec.textContent = options.confirmLabel || '売却する';
    btnExec.className = `btn px-4 ${options.confirmClass || 'btn-danger'}`;
    btnExec.onclick = onConfirm;
    new bootstrap.Modal(document.getElementById('shopActionModal')).show();
}

window.BadgeSellUI = {
    buildSellConfirmContent,
    renderSellConfirmModal
};

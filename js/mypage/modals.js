(function () {
  function injectMypageModals() {
    const root = document.getElementById('mypage-modal-root');
    if (!root || root.dataset.injected === '1') return;
    const html = `
    <!-- バッジ在庫モーダル（ショップの所持バッジUIを流用） -->
    <div class="modal fade" id="inventoryModal" tabindex="-1" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
            <div class="modal-content border-0 shadow-lg" style="border-radius: 20px;">
                <div class="modal-header border-bottom-0 pb-0">
                    <h5 class="modal-title" id="inventoryModalLabel">🎒 あなたの所持バッジ</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body pt-2 bg-light">
                    <div class="filter-controls badge-control-panel mb-3">
                        <div class="row g-3 filter-row-top">
                            <div class="col-12 col-md-5">
                                <div class="position-relative">
                                    <i class="bi bi-search search-icon"></i>
                                    <input type="text" id="inventory-search" class="form-control form-control-sm search-input"
                                        placeholder="バッジ名で検索..." oninput="filterAndRenderInventoryBadges()">
                                </div>
                            </div>
                            <div class="col-12 col-md-3">
                                <div class="d-flex align-items-center gap-2">
                                    <label class="filter-label flex-shrink-0">並び替え</label>
                                    <select id="inventory-sort" class="form-select form-select-sm"
                                        onchange="filterAndRenderInventoryBadges()">
                                        <option value="acquired_desc">入手順（新→古）</option>
                                        <option value="acquired_asc">入手順（古→新）</option>
                                        <option value="id_asc">ナンバー順（低→高）</option>
                                        <option value="id_desc">ナンバー順（高→低）</option>
                                        <option value="price_desc">価格順（高→低）</option>
                                        <option value="price_asc">価格順（低→高）</option>
                                        <option value="count_desc">所持数順（多→少）</option>
                                        <option value="count_asc">所持数順（少→多）</option>
                                        <option value="circulation_desc">流通数順（多→少）</option>
                                        <option value="circulation_asc">流通数順（少→多）</option>
                                        <option value="name">名前順</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <hr class="my-3">

                        <div class="row g-3">
                            <div class="col-12 col-md-3">
                                <label class="filter-label">レアリティ</label>
                                <div class="creator-dropdown">
                                    <button class="creator-dropdown-btn" type="button" id="inventory-rarity-filter-btn">
                                        <span id="inventory-rarity-filter-label">すべて</span>
                                        <i class="bi bi-caret-down-fill ms-auto"></i>
                                    </button>
                                    <input type="hidden" id="inventory-rarity-filter" value="">
                                    <div class="creator-menu" id="inventory-rarity-filter-menu"></div>
                                </div>
                            </div>
                            <div class="col-12 col-md-3">
                                <label class="filter-label">クリエイター</label>
                                <div class="creator-dropdown">
                                    <button class="creator-dropdown-btn" type="button" id="inventory-creator-filter-btn">
                                        <img src="" class="creator-avatar" id="inventory-creator-filter-avatar" alt="">
                                        <span id="inventory-creator-filter-label">すべて</span>
                                        <i class="bi bi-caret-down-fill ms-auto"></i>
                                    </button>
                                    <input type="hidden" id="inventory-creator-filter" value="">
                                    <div class="creator-menu" id="inventory-creator-filter-menu"></div>
                                </div>
                            </div>
                            <div class="col-12 col-md-3">
                                <label class="filter-label">バッジタイプ</label>
                                <select id="inventory-type-filter" class="form-select form-select-sm"
                                    onchange="filterAndRenderInventoryBadges()">
                                    <option value="">すべて</option>
                                </select>
                            </div>
                            <div class="col-12 col-md-3">
                                <label class="filter-label">ラベル</label>
                                <select id="inventory-label-filter" class="form-select form-select-sm"
                                    onchange="filterAndRenderInventoryBadges()">
                                    <option value="">すべて</option>
                                </select>
                            </div>
                            <div class="col-12 col-md-3">
                                <label class="filter-label">タグ</label>
                                <select id="inventory-tag-filter" class="form-select form-select-sm"
                                    onchange="filterAndRenderInventoryBadges()">
                                    <option value="">すべて</option>
                                </select>
                            </div>
                            <div class="col-12 col-md-3">
                                <label class="filter-label">入手方法</label>
                                <select id="inventory-method-filter" class="form-select form-select-sm"
                                    onchange="filterAndRenderInventoryBadges()">
                                    <option value="">すべて</option>
                                </select>
                            </div>
                            <div class="col-12 col-md-3">
                                <label class="filter-label">ミュータント</label>
                                <button id="inventory-mutant-btn" class="btn btn-sm w-100 btn-mutant-filter py-1"
                                    onclick="toggleInventoryMutantFilter()"
                                    style="font-size: 0.8rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    ✨ ミュータント
                                </button>
                            </div>
                            <div class="col-12 col-md-3">
                                <label class="filter-label"> </label>
                                <button class="btn btn-sm w-100 btn-outline-secondary" onclick="resetInventoryFilters()">
                                    リセット
                                </button>
                            </div>
                        </div>
                    </div>
                    <div id="inventory-list" class="vstack gap-2">
                        <div class="text-center py-4 text-muted">読み込み中...</div>
                    </div>
                    <nav aria-label="Page navigation" class="mt-3" id="inventory-pagination-area" style="display:none;">
                        <ul class="pagination pagination-sm justify-content-center mb-0" id="inventory-pagination"></ul>
                    </nav>
                </div>
                <div class="modal-footer border-0 bg-light" style="border-radius: 0 0 20px 20px;">
                    <small class="text-muted" id="inventory-hint">
                        ※ ここから直接売却/譲渡できます。
                    </small>
                    <button type="button" class="btn btn-outline-secondary btn-sm"
                        data-bs-dismiss="modal">閉じる</button>
                </div>
            </div>
        </div>
    </div>

    <!-- 共通アクションモーダル（売却/譲渡確認） -->
    <div class="modal fade" id="shopActionModal" tabindex="-1" aria-hidden="true" style="z-index: 1060;">
        <div class="modal-dialog modal-dialog-centered">
            <div class="modal-content shadow-lg border-0" style="border-radius: 20px;">
                <div class="modal-body p-4 text-center">
                    <div id="shopActionContent"></div>
                    <div class="d-flex justify-content-center gap-3 mt-4">
                        <button type="button" class="btn btn-outline-secondary px-4"
                            data-bs-dismiss="modal">キャンセル</button>
                        <button type="button" class="btn btn-danger px-4" id="btnShopActionExec">実行</button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- ユーザー選択モーダル (譲渡・送金用) -->
    <div class="modal fade" id="userSelectModal" tabindex="-1" aria-labelledby="userSelectModalLabel"
        aria-hidden="true">
        <div class="modal-dialog modal-dialog-scrollable">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="userSelectModalLabel">譲渡先のユーザーを選択</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body p-0">
                    <div id="transfer-user-list" class="list-group list-group-flush">
                        <!-- JSで生成 -->
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- コイン送金金額入力モーダル -->
    <div class="modal fade" id="coinAmountModal" tabindex="-1" aria-labelledby="coinAmountModalLabel"
        aria-hidden="true">
        <div class="modal-dialog modal-sm">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="coinAmountModalLabel">送金金額を入力</h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <p id="coin-transfer-target-name" class="fw-bold text-center mb-3"></p>
                    <div class="mb-3">
                        <label class="form-label">送金するコイン数</label>
                        <input type="number" id="coin-transfer-amount" class="form-control" placeholder="金額..." min="1">
                        <div class="form-text mt-2 text-center">あなたの所持金: 🪙 <span id="my-coins-ref">0</span></div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">キャンセル</button>
                    <button type="button" class="btn btn-primary" onclick="executeCoinTransfer()">送金する</button>
                </div>
            </div>
        </div>
    </div>

`;
    root.innerHTML = html;
    root.dataset.injected = '1';
  }
  window.injectMypageModals = injectMypageModals;
})();

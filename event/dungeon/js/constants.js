window.DUNGEON_CONSTANTS = {
    PAGE_PATH: '/event/dungeon/index.html',
    ENTRY_FEE: 1000,
    BOARD_SIZE: 7,
    MAX_FLOORS: 10,
    START_POS: { x: 3, y: 3 },
    LOG_LIMIT: 40,
    CARRY_LIMIT: 2,
    DIRECTIONS: {
        up: { x: 0, y: -1, label: '上' },
        down: { x: 0, y: 1, label: '下' },
        left: { x: -1, y: 0, label: '左' },
        right: { x: 1, y: 0, label: '右' }
    },
    TILE_LABELS: {
        '空白': '・',
        '小銭': '🪙',
        '宝箱': '📦',
        '財宝箱': '💰',
        '秘宝箱': '📛',
        '宝石箱': '💎',
        '祝福': '✨',
        '泉': '⛲',
        '爆弾': '💣',
        '大爆発': '☄️',
        '罠': '🕳️',
        '呪い': '🕸️',
        '盗賊': '🦹',
        '落とし穴': '🌀',
        '転送罠': '🧭',
        'ショップ': '🛒',
        '限定ショップ': '🏪',
        '下り階段': '🪜'
    },
    MANUAL_ITEM_CODES: [
        'escape_rope',
        'bomb_radar',
        'healing_potion',
        'stairs_search',
        'calamity_map',
        'full_scan_map',
        'abyss_ticket',
        'holy_grail'
    ]
};

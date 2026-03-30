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
        '空白': '▫️',
        '小銭': '🪙',
        '宝箱': '🧰',
        '財宝箱': '💰',
        '秘宝箱': '🗝️',
        '宝石箱': '💎',
        'アイテム': '🎁',
        '祝福': '✨',
        '泉': '⛲',
        '爆弾': '💣',
        '大爆発': '💥',
        '罠': '⚠️',
        '呪い': '☠️',
<<<<<<< HEAD
=======
        '盗賊': '🥷',
        '落とし穴': '🕳️',
        '転送罠': '🌀',
>>>>>>> f4551e61db7ebd161209630406706d93ed61315c
        'ショップ': '🛒',
        '限定ショップ': '🏬',
        '下り階段': '🪜'
    },
    MANUAL_ITEM_CODES: [
        'escape_rope',
        'healing_potion',
        'super_healing_potion',
        'stairs_search',
        'calamity_map',
        'full_scan_map',
        'abyss_ticket',
        'holy_grail',
        'life_vessel'
    ]
};

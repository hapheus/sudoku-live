const discoveredBoardModules = import.meta.glob(
    [
        '../assets/boards/*.webp',
        '../assets/boards/*.png',
        '../assets/boards/*.jpg',
        '../assets/boards/*.jpeg',
        '../assets/boards/*.avif',
    ],
    { eager: true, import: 'default' },
);

/**
 * Optional metadata per board image filename.
 * Future images added to `src/assets/boards/` are automatically discovered;
 * add an entry here whenever you want seasonal tags or a custom sort order.
 */
export const BOARD_BACKGROUND_METADATA = {
    'alpenpanorama_mit_see_im_sonnenuntergang.webp': {
        title: 'Alpenpanorama mit See im Sonnenuntergang',
        seasons: ['spring', 'summer', 'autumn', 'winter'],
        order: 1,
    },
};

export const DEFAULT_BOARD_SELECTION_STRATEGY = 'random';

export function getSeasonForDate(date = new Date()) {
    const target = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
    const month = target.getMonth(); // 0 = Jan ... 11 = Dec
    if (month >= 2 && month <= 4) return 'spring';
    if (month >= 5 && month <= 7) return 'summer';
    if (month >= 8 && month <= 10) return 'autumn';
    return 'winter';
}

function hashSeed(seed) {
    const str = String(seed);
    let hash = 2166136261;
    for (let i = 0; i < str.length; i += 1) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function pickIndex(length, { random = Math.random, seed = null } = {}) {
    if (length <= 1) return 0;
    if (seed !== null && seed !== undefined && String(seed).length > 0) {
        return hashSeed(seed) % length;
    }
    const raw = typeof random === 'function' ? Number(random()) : Math.random();
    if (!Number.isFinite(raw)) return 0;
    const clamped = Math.min(0.999999999, Math.max(0, raw));
    return Math.floor(clamped * length);
}

function getCandidatePool(backgrounds, previousId = null) {
    if (!Array.isArray(backgrounds) || backgrounds.length === 0) return [];
    if (previousId && backgrounds.length > 1) {
        const withoutPrevious = backgrounds.filter((bg) => bg.id !== previousId);
        if (withoutPrevious.length > 0) return withoutPrevious;
    }
    return backgrounds;
}

export const BOARD_SELECTION_STRATEGIES = {
    random: ({ backgrounds, previousId = null, random = Math.random, seed = null }) => {
        const pool = getCandidatePool(backgrounds, previousId);
        if (pool.length === 0) return null;
        return pool[pickIndex(pool.length, { random, seed })];
    },

    seasonal: ({
        backgrounds,
        previousId = null,
        date = new Date(),
        random = Math.random,
        seed = null,
    }) => {
        if (!Array.isArray(backgrounds) || backgrounds.length === 0) return null;
        const season = getSeasonForDate(date);
        const seasonalMatches = backgrounds.filter(
            (bg) => Array.isArray(bg.seasons) && bg.seasons.includes(season),
        );
        const activeList = seasonalMatches.length > 0 ? seasonalMatches : backgrounds;
        const pool = getCandidatePool(activeList, previousId);
        return pool[pickIndex(pool.length, { random, seed })];
    },

    sequential: ({ backgrounds, previousId = null }) => {
        if (!Array.isArray(backgrounds) || backgrounds.length === 0) return null;
        if (!previousId) return backgrounds[0];
        const prevIdx = backgrounds.findIndex((bg) => bg.id === previousId);
        if (prevIdx === -1) return backgrounds[0];
        return backgrounds[(prevIdx + 1) % backgrounds.length];
    },
};

export function getBoardBackgrounds(
    modules = discoveredBoardModules,
    metadataMap = BOARD_BACKGROUND_METADATA,
) {
    return Object.entries(modules || {})
        .filter(([, src]) => typeof src === 'string' && src.length > 0)
        .map(([filePath, src]) => {
            const fileName = filePath.split('/').pop() || filePath;
            const stem = fileName.replace(/\.[^.]+$/, '');
            const meta = metadataMap?.[fileName] || metadataMap?.[stem] || {};
            const fallbackTitle = stem.replace(/[_-]+/g, ' ').trim();
            return {
                id: fileName,
                title: meta.title || fallbackTitle || fileName,
                src,
                seasons: Array.isArray(meta.seasons) && meta.seasons.length > 0 ? [...meta.seasons] : null,
                order: typeof meta.order === 'number' ? meta.order : Number.MAX_SAFE_INTEGER,
            };
        })
        .sort((a, b) => {
            if (a.order !== b.order) return a.order - b.order;
            return a.id.localeCompare(b.id, undefined, { numeric: true, sensitivity: 'base' });
        });
}

export function getBoardBackgroundById(id, backgrounds = getBoardBackgrounds()) {
    if (!id || !Array.isArray(backgrounds) || backgrounds.length === 0) return null;
    return backgrounds.find((bg) => bg.id === id) || null;
}

export function selectBoardBackground({
    backgrounds = getBoardBackgrounds(),
    strategy = DEFAULT_BOARD_SELECTION_STRATEGY,
    previousId = null,
    date = new Date(),
    random = Math.random,
    seed = null,
} = {}) {
    if (!Array.isArray(backgrounds) || backgrounds.length === 0) return null;
    const selector = typeof strategy === 'function'
        ? strategy
        : (BOARD_SELECTION_STRATEGIES[strategy] || BOARD_SELECTION_STRATEGIES[DEFAULT_BOARD_SELECTION_STRATEGY]);
    return selector({ backgrounds, previousId, date, random, seed }) || backgrounds[0];
}

const AGENTS_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/agents.json';
const KEYCHAINS_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/keychains.json';
const PATCHES_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/patches.json';
const MUSIC_KITS_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/music_kits.json';
const GRAFFITI_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/graffiti.json';
const COLLECTIBLES_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/collectibles.json';
const STICKERS_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/stickers.json';

let _agentsCache = null;
export async function getAgents() {
    if (_agentsCache) return _agentsCache;
    const res = await fetch(AGENTS_URL);
    if (!res.ok) throw new Error('Failed to load agents.json');
    _agentsCache = await res.json();
    return _agentsCache;
}

let _keychainsCache = null;
export async function getCharms() {
    if (_keychainsCache) return _keychainsCache;
    const res = await fetch(KEYCHAINS_URL);
    if (!res.ok) throw new Error('Failed to load keychains.json');
    _keychainsCache = await res.json();
    return _keychainsCache;
}

let _patchesCache = null;
export async function getPatches() {
    if (_patchesCache) return _patchesCache;
    const res = await fetch(PATCHES_URL);
    if (!res.ok) throw new Error('Failed to load patches.json');
    _patchesCache = await res.json();
    return _patchesCache;
}

let _musicKitsCache = null;
export async function getMusicKits() {
    if (_musicKitsCache) return _musicKitsCache;
    const res = await fetch(MUSIC_KITS_URL);
    if (!res.ok) throw new Error('Failed to load music_kits.json');
    _musicKitsCache = await res.json();
    return _musicKitsCache;
}

let _graffitiCache = null;
export async function getGraffiti() {
    if (_graffitiCache) return _graffitiCache;
    const res = await fetch(GRAFFITI_URL);
    if (!res.ok) throw new Error('Failed to load graffiti.json');
    _graffitiCache = await res.json();
    return _graffitiCache;
}

let _collectiblesCache = null;
async function getCollectibles() {
    if (_collectiblesCache) return _collectiblesCache;
    const res = await fetch(COLLECTIBLES_URL);
    if (!res.ok) throw new Error('Failed to load collectibles.json');
    _collectiblesCache = await res.json();
    return _collectiblesCache;
}

//pins live inside collectibles.json alongside trophies, coins, and medals - filtered out by type
export async function getPins() {
    const collectibles = await getCollectibles();
    return collectibles.filter(c => c.type === 'Pin');
}

let _stickersCache = null;
export async function getStickers() {
    if (_stickersCache) return _stickersCache;
    const res = await fetch(STICKERS_URL);
    if (!res.ok) throw new Error('Failed to load stickers.json');
    _stickersCache = await res.json();
    return _stickersCache;
}

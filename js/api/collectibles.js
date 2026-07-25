let _agentsCache = null;
export async function getAgents() {
    if (_agentsCache) return _agentsCache;
    const res = await fetch('data/agents.json');
    if (!res.ok) throw new Error('Failed to load agents.json');
    _agentsCache = await res.json();
    return _agentsCache;
}

let _charmsCache = null;
export async function getCharms() {
    if (_charmsCache) return _charmsCache;
    const res = await fetch('data/charms.json');
    if (!res.ok) throw new Error('Failed to load charms.json');
    _charmsCache = await res.json();
    return _charmsCache;
}

let _patchesCache = null;
export async function getPatches() {
    if (_patchesCache) return _patchesCache;
    const res = await fetch('data/patches.json');
    if (!res.ok) throw new Error('Failed to load patches.json');
    _patchesCache = await res.json();
    return _patchesCache;
}

let _musicKitsCache = null;
export async function getMusicKits() {
    if (_musicKitsCache) return _musicKitsCache;
    const res = await fetch('data/music-kits.json');
    if (!res.ok) throw new Error('Failed to load music-kits.json');
    _musicKitsCache = await res.json();
    return _musicKitsCache;
}

let _graffitiCache = null;
export async function getGraffiti() {
    if (_graffitiCache) return _graffitiCache;
    const res = await fetch('data/graffiti.json');
    if (!res.ok) throw new Error('Failed to load graffiti.json');
    _graffitiCache = await res.json();
    return _graffitiCache;
}

let _collectiblesCache = null;
async function getCollectibles() {
    if (_collectiblesCache) return _collectiblesCache;
    const res = await fetch('data/collectibles.json');
    if (!res.ok) throw new Error('Failed to load collectibles.json');
    _collectiblesCache = await res.json();
    return _collectiblesCache;
}

//pins live inside collectibles.json alongside operation/tournament passes - filtered out by type
export async function getPins() {
    const collectibles = await getCollectibles();
    return collectibles.filter(c => c.type === 'Pin');
}

let _stickersCache = null;
export async function getStickers() {
    if (_stickersCache) return _stickersCache;
    const res = await fetch('data/stickers.json');
    if (!res.ok) throw new Error('Failed to load stickers.json');
    _stickersCache = await res.json();
    return _stickersCache;
}

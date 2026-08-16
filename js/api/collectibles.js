import { cachedJson } from './json-cache.js';

const loadAgents       = cachedJson('data/agents.json',       'Failed to load agents.json');
const loadCharms       = cachedJson('data/charms.json',       'Failed to load charms.json');
const loadPatches      = cachedJson('data/patches.json',      'Failed to load patches.json');
const loadMusicKits    = cachedJson('data/music-kits.json',   'Failed to load music-kits.json');
const loadGraffiti     = cachedJson('data/graffiti.json',     'Failed to load graffiti.json');
const loadCollectibles = cachedJson('data/collectibles.json', 'Failed to load collectibles.json');
const loadStickers     = cachedJson('data/stickers.json',     'Failed to load stickers.json');

export async function getAgents() {
    return loadAgents();
}

export async function getCharms() {
    return loadCharms();
}

export async function getPatches() {
    return loadPatches();
}

export async function getMusicKits() {
    return loadMusicKits();
}

export async function getGraffiti() {
    return loadGraffiti();
}

//pins live inside collectibles.json alongside operation/tournament passes - filtered out by type
export async function getPins() {
    const collectibles = await loadCollectibles();
    return collectibles.filter(c => c.type === 'Pin');
}

export async function getStickers() {
    return loadStickers();
}

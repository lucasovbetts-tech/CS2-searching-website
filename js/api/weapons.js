import { cachedJson } from './json-cache.js';

const loadWeapons = cachedJson('data/weapons.json', 'Failed to load weapons.json');

export async function getWeapons() {
    return loadWeapons();
}

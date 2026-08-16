import { cachedJson } from './json-cache.js';

const COLLECTIONS_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/collections.json';

const loadCollections = cachedJson(COLLECTIONS_URL, 'Failed to load collections.json');

export async function getCollections() {
    return loadCollections();
}

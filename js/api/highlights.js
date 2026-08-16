import { cachedJson } from './json-cache.js';

const loadHighlights = cachedJson('data/highlights.json', 'Failed to load highlights.json');

export async function getHighlights() {
    return loadHighlights();
}

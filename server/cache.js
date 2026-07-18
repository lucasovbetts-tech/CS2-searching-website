import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = path.join(__dirname, '..', 'data', 'price-cache.json');
const CACHE_TTL_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

function load() {
    try {
        return JSON.parse(fs.readFileSync(CACHE_PATH, 'utf-8'));
    } catch {
        return {};
    }
}

function save(cache) {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

export function getCached(key) {
    const cache = load();
    const entry = cache[key];
    if (entry && Date.now() - entry.time < CACHE_TTL_MS) return entry.data;
    return null;
}

export function setCached(key, data) {
    const cache = load();
    cache[key] = { data, time: Date.now() };
    save(cache);
}
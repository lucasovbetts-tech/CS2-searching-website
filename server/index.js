import './env.js'; // must stay the first import so env.js is loaded first
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getCsMarketApiPrices } from './csmarketapi.js';
import { getCached, setCached } from './cache.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SKINS_PATH = path.join(ROOT, 'data', 'skins.json');

const app = express();
const PORT = process.env.PORT || 3001;
app.use(cors());

// serves the frontend from the same origin as the API, so prices.js never needs an
// environment-specific backend URL - never server/ itself, which holds .env
app.use('/css', express.static(path.join(ROOT, 'css')));
app.use('/js', express.static(path.join(ROOT, 'js')));
app.use('/data', express.static(path.join(ROOT, 'data')));
app.use('/assets', express.static(path.join(ROOT, 'assets')));
app.get('/', (req, res) => res.sendFile(path.join(ROOT, 'index.html')));

let allSkins = null;
let skinsIndex = null;
function loadSkins() {
    if (!allSkins) {
        allSkins = JSON.parse(fs.readFileSync(SKINS_PATH, 'utf-8'));
        skinsIndex = new Map(allSkins.map(s => [`${s.defIndex}:${s.paintIndex}`, s]));
    }
}
function findSkin(defIndex, paintIndex) {
    loadSkins();
    return skinsIndex.get(`${defIndex}:${paintIndex}`);
}

app.get('/api/price', async (req, res) => {
    const defIndex = Number(req.query.defIndex);
    const paintIndex = Number(req.query.paintIndex);
    if (!Number.isFinite(defIndex) || !Number.isFinite(paintIndex)) {
        return res.status(400).json({ error: 'defIndex and paintIndex query params are required' });
    }

    const cacheKey = `${defIndex}:${paintIndex}`;
    const cached = getCached(cacheKey);
    if (cached) return res.json(cached);

    const skin = findSkin(defIndex, paintIndex);
    if (!skin) return res.status(404).json({ error: 'Unknown skin' });

    try {
        const prices = await getCsMarketApiPrices(skin);
        setCached(cacheKey, prices);
        res.json(prices);
    } catch (err) {
        console.error('CSMarketAPI error:', err.message);
        res.status(502).json({ error: 'Failed to fetch prices' });
    }
});

app.listen(PORT, () => console.log(`Price server listening on http://localhost:${PORT}`));
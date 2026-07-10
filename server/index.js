import './env.js'; //loads the secret keys - must be the first import, see the comment in that file
import express from 'express'; //creates the backend server
import cors from 'cors'; //lets frontend access the backend
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getCsMarketApiPrices, getPriceRangesForSkins } from './csmarketapi.js';
import { getCached, setCached } from './cache.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url)); //gets the file url, converts it to a path then gets the folder the file is in
const ROOT = path.join(__dirname, '..');
const SKINS_PATH = path.join(ROOT, 'data', 'skins.json');

const app = express();
const PORT = process.env.PORT || 3001;
app.use(cors());

// serves the frontend from the same origin as the API, so prices.js never needs an
// environment-specific backend URL. Only the folders the frontend actually references —
// never server/ itself, which holds .env
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
        const { prices, hadFailure } = await getCsMarketApiPrices(skin);
        if (!hadFailure) setCached(cacheKey, prices); // a partial failure shouldn't get remembered as fact for the whole cache window
        res.json(prices);
    } catch (err) {
        console.error('CSMarketAPI error:', err.message);
        res.status(502).json({ error: 'Failed to fetch prices' });
    }
});

//price range (lowest wear -> highest wear, per variant) for every skin of one weapon at once - built
//for weapon pages like "AK-47" (61 skins), not the full grid getCsMarketApiPrices gives one skin
app.get('/api/prices/weapon', async (req, res) => {
    const weapon = req.query.weapon;
    if (!weapon) return res.status(400).json({ error: 'weapon query param is required' });

    loadSkins();
    const skins = allSkins.filter(s => s.weapon === weapon);
    if (!skins.length) return res.json({});

    const result = {};
    const toFetch = [];
    for (const skin of skins) {
        const id = `${skin.defIndex}-${skin.paintIndex}`;
        const cached = getCached(`range:${skin.defIndex}:${skin.paintIndex}`);
        if (cached) result[id] = cached;
        else toFetch.push(skin);
    }

    if (toFetch.length) {
        try {
            const fetched = await getPriceRangesForSkins(toFetch);
            fetched.forEach(({ lowTier, highTier, low, high, hadFailure }, i) => {
                const skin = toFetch[i];
                const data = { lowTier, highTier, low, high };
                if (!hadFailure) setCached(`range:${skin.defIndex}:${skin.paintIndex}`, data);
                result[`${skin.defIndex}-${skin.paintIndex}`] = data;
            });
        } catch (err) {
            console.error('CSMarketAPI weapon-range error:', err.message);
            // whatever was already cached still gets returned - only the uncached skins are missing
        }
    }

    res.json(result);
});

app.listen(PORT, () => console.log(`Price server listening on http://localhost:${PORT}`));

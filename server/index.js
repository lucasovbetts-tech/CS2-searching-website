import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getCsfloatPrices } from './csfloat.js';
import { getCs2capPrices } from './cs2cap.js';
import { getCached, setCached } from './cache.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SKINS_PATH = path.join(__dirname, '..', 'data', 'skins.json');

const app = express();
const PORT = process.env.PORT || 3001;
app.use(cors());

let skinsIndex = null;
function findSkin(defIndex, paintIndex) {
    if (!skinsIndex) {
        const skins = JSON.parse(fs.readFileSync(SKINS_PATH, 'utf-8'));
        skinsIndex = new Map(skins.map(s => [`${s.defIndex}:${s.paintIndex}`, s]));
    }
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

    const [csfloat, otherMarkets] = await Promise.all([
        getCsfloatPrices(skin).catch(err => { console.error('CSFloat error:', err.message); return null; }),
        getCs2capPrices(skin).catch(err => { console.error('CS2Cap error:', err.message); return null; })
    ]);

    const result = { csfloat, otherMarkets };
    setCached(cacheKey, result);
    res.json(result);
});

app.listen(PORT, () => console.log(`Price server listening on http://localhost:${PORT}`));

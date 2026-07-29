import './env.js'; // must stay the first import so env.js is loaded first
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

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

app.listen(PORT, () => console.log(`Price server listening on http://localhost:${PORT}`));
// Loads server/.env explicitly by path, rather than relying on dotenv's default (which looks for
// .env in the current working directory - that breaks if this is launched as "node server/index.js"
// from the project root instead of from inside server/ itself).
// Must stay the very first import in index.js so the key is set before csmarketapi.js reads it.
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });



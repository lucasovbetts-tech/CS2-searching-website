// Throwaway teaching file - delete whenever. Run it with:  node learn-auth.js
// Then open http://localhost:4000 and refresh a few times.

import express from 'express';
import crypto from 'crypto';

const app = express();

// STEP 2: instead of one shared counter, one counter PER visitor.
// The key is a random id we hand out; the value is that visitor's count.
const visitsById = new Map();

app.get('/', (req, res) => {
    // 1. Did this browser send us an id it was given earlier?
    //    Cookies arrive as one header string: "a=1; b=2; visitorId=abc"
    const cookies = Object.fromEntries(
        (req.headers.cookie ?? '').split('; ').filter(Boolean).map(c => {
            const [k, ...v] = c.split('=');
            return [k, v.join('=')];
        })
    );
    let id = cookies.visitorId;

    // 2. No id? Then this is someone new. Make one and tell the browser to keep it.
    if (!id) {
        id = crypto.randomBytes(16).toString('hex');
        res.setHeader('Set-Cookie', `visitorId=${id}; HttpOnly; Path=/`);
    }

    // 3. Look up THIS visitor's count, not a global one.
    const count = (visitsById.get(id) ?? 0) + 1;
    visitsById.set(id, count);

    res.send(`
        <h1>Your visits: ${count}</h1>
        <p>Your id: <code>${id}</code></p>
        <p>Total visitors the server has seen: ${visitsById.size}</p>
        <p>Refresh. Then try a private window.</p>
    `);
});

app.listen(4000, () => console.log('open http://localhost:4000'));

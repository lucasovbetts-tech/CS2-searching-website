// Throwaway teaching file - delete whenever. Run it with:  node learn-auth.js
// Then open http://localhost:4000

import express from 'express';
import crypto from 'crypto';

const app = express();
app.use(express.urlencoded({ extended: false })); // parses the login form's POST body

const SECRET = 'toy-secret-do-not-use-for-real';

// STEP 4: the session now holds WHO you are, not just a visit count.
// id -> { visits, user }.  user is null until you log in.
const sessions = new Map();

// Pretend user database. A real one would store a hash, never the password itself -
// see the note at the bottom of this file.
const USERS = { lucas: 'hunter2', daniel: 'balls' };

function sign(id) {
    const sig = crypto.createHmac('sha256', SECRET).update(id).digest('base64url');
    return `${id}.${sig}`;
}

function unsign(signed) {
    const dot = signed.lastIndexOf('.');
    if (dot < 0) return null;
    const id = signed.slice(0, dot);
    const expected = sign(id);
    if (signed.length !== expected.length) return null;
    return crypto.timingSafeEqual(Buffer.from(signed), Buffer.from(expected)) ? id : null;
}

// Everything cookie-related now lives in one middleware, so each route below can just
// read req.session - which is exactly what express-session does for you in the real app.
app.use((req, res, next) => {
    const cookies = Object.fromEntries(
        (req.headers.cookie ?? '').split('; ').filter(Boolean).map(c => {
            const [k, ...v] = c.split('=');
            return [k, v.join('=')];
        })
    );

    const raw = cookies.visitorId;
    let id = raw ? unsign(decodeURIComponent(raw)) : null;

    if (!id) {
        id = crypto.randomBytes(16).toString('hex');
        res.setHeader('Set-Cookie', `visitorId=${encodeURIComponent(sign(id))}; HttpOnly; Path=/`);
    }

    if (!sessions.has(id)) sessions.set(id, { visits: 0, user: null });

    req.sessionId = id;
    req.session = sessions.get(id); // attached to req, so every route below can use it
    next();                          // hand control to the next middleware/route
});

app.get('/', (req, res) => {
    req.session.visits++;

    res.send(req.session.user ? `
        <h1>Hello, ${req.session.user}</h1>
        <p>You have visited ${req.session.visits} times.</p>
        <form method="POST" action="/logout"><button>Log out</button></form>
    ` : `
        <h1>Not logged in</h1>
        <p>Visits: ${req.session.visits} (counted even while logged out)</p>
        <form method="POST" action="/login">
            <input name="username" placeholder="lucas">
            <input name="password" type="password" placeholder="hunter2">
            <button>Log in</button>
        </form>
    `);
});

app.post('/login', (req, res) => {
    const { username, password } = req.body;

    // THE ONLY STEP STEAM REPLACES. Everything else on this page stays the same.
    if (USERS[username] && USERS[username] === password) {
        req.session.user = username;
    }
    res.redirect('/');
});

app.post('/logout', (req, res) => {
    sessions.delete(req.sessionId); // throw the whole session away
    res.redirect('/');
});

app.listen(4000, () => console.log('open http://localhost:4000'));

// Note the visit count survives logging in and out - the SESSION and the IDENTITY are
// separate things. You always have a session; sometimes it has a user attached.
//
// Storing a plaintext password like this is wrong in real code (you'd store a slow hash,
// e.g. argon2/bcrypt) - and avoiding that responsibility entirely is a big reason to
// delegate to Steam, Google, etc. instead of handling passwords yourself.

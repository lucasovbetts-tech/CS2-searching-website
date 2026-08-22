import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import passport from 'passport';
import { Strategy as SteamStrategy } from 'passport-steam';

//Steam sends the user back to this origin after they sign in, so it has to match wherever the
//browser is actually reaching the site - localhost while developing, the Pi's address in the
//house, a real domain if it ever goes public. Kept in .env so the code doesn't care which.
const BASE_URL = process.env.BASE_URL || 'http://localhost:3001';

//only steam_id is Steam's to own - the rest is profile data we refresh on every login,
//since users rename themselves and change avatars
async function upsertUser(pool, profile) {
    const { rows } = await pool.query(
        `INSERT INTO users (steam_id, display_name, avatar, profile_url)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (steam_id) DO UPDATE
            SET display_name = EXCLUDED.display_name,
                avatar       = EXCLUDED.avatar,
                profile_url  = EXCLUDED.profile_url,
                last_login   = CURRENT_TIMESTAMP
         RETURNING steam_id, display_name, avatar, profile_url`,
        [profile.id, profile.displayName, profile._json?.avatarfull ?? null, profile._json?.profileurl ?? null]
    );
    return rows[0];
}

export function setupAuth(app, pool) {
    const apiKey = process.env.STEAM_API_KEY;
    if (!apiKey) {
        //the rest of the site works fine without auth, so this warns rather than throwing
        console.warn('STEAM_API_KEY not set - Steam sign-in disabled, everything else still works');
        app.get('/api/me', (req, res) => res.json(null));
        return;
    }

    const PgSession = connectPgSimple(session);

    app.set('trust proxy', 1); //so secure cookies work if this ends up behind a tunnel/proxy

    app.use(session({
        store: new PgSession({ pool, tableName: 'session' }),
        secret: process.env.SESSION_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 30 * 24 * 60 * 60 * 1000, //30 days
            httpOnly: true,                   //not readable from JS, so XSS can't lift the session
            sameSite: 'lax',                  //'lax' still allows the redirect back from Steam
            secure: BASE_URL.startsWith('https://'),
        },
    }));

    app.use(passport.initialize());
    app.use(passport.session());

    //the whole user row goes in the session - it's four small fields, so this avoids a
    //database round-trip on every single request just to rehydrate a name and avatar
    passport.serializeUser((user, done) => done(null, user));
    passport.deserializeUser((user, done) => done(null, user));

    passport.use(new SteamStrategy({
        returnURL: `${BASE_URL}/auth/steam/return`,
        realm: BASE_URL,
        apiKey,
    }, async (identifier, profile, done) => {
        try {
            done(null, await upsertUser(pool, profile));
        } catch (err) {
            done(err);
        }
    }));

    app.get('/auth/steam', passport.authenticate('steam'));

    app.get('/auth/steam/return',
        passport.authenticate('steam', { failureRedirect: '/?login=failed' }),
        (req, res) => res.redirect('/')
    );

    app.post('/auth/logout', (req, res, next) => {
        req.logout(err => {
            if (err) return next(err);
            req.session.destroy(() => res.json({ ok: true }));
        });
    });

    //what the frontend polls on load to decide whether to show the sign-in button or the profile
    app.get('/api/me', (req, res) => res.json(req.user ?? null));
}

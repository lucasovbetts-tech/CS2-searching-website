-- Steam auth tables. Run once per environment:
--   psql -U postgres -h localhost -d wearhouse -f schema-auth.sql

-- One row per Steam user who has signed in. steam_id is Steam's own 64-bit id,
-- stored as TEXT because it exceeds what a JS number can represent exactly.
CREATE TABLE IF NOT EXISTS users (
    steam_id     TEXT PRIMARY KEY,
    display_name TEXT,
    avatar       TEXT,
    profile_url  TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Session store for connect-pg-simple. Sessions live in Postgres rather than in
-- memory so a pm2 restart or a reboot doesn't sign everyone out.
CREATE TABLE IF NOT EXISTS session (
    sid    VARCHAR NOT NULL COLLATE "default",
    sess   JSON NOT NULL,
    expire TIMESTAMP(6) NOT NULL
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_pkey') THEN
        ALTER TABLE session ADD CONSTRAINT session_pkey PRIMARY KEY (sid) NOT DEFERRABLE INITIALLY IMMEDIATE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_session_expire ON session (expire);

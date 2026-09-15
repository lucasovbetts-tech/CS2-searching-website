# WearHouse

A price comparison site for CS2 skins. It pulls prices from 41 marketplaces, keeps a history of
them in Postgres, and shows the cheapest one per item so you don't have to check each site yourself.
There's also a trade-up calculator that works out the real odds of each possible outcome.

<!-- TODO: screenshot of the explore page goes here -->

## What it does

- **Explore** every skin, case, collection, sticker capsule and souvenir package in the game, grouped
  by weapon type. 2,126 skins and 11,120 stickers, plus agents, charms, patches, music kits, graffiti
  and pins.
- **Compare prices** across 41 markets. Grids show the cheapest price; open a skin and you get the
  full per-market breakdown with links to buy.
- **Trade-up calculator** that takes 10 inputs and gives you the probability of every outcome,
  including the gold (knife/glove) trade-ups, with profit indicators against live prices.
- **Sign in with Steam**, which is there for the inventory features that aren't built yet.

The inventory page is a placeholder. Everything else works.

## How it's built

No framework and no build step. The front end is plain ES modules served straight to the browser,
with a hash router that swaps out a `#app` div. Open `index.html` through the server and it runs.

The back end is two separate programs that only talk to each other through the database:

| | Sync scripts | API server |
|---|---|---|
| Files | `server/sync-*.js` | `server/index.js` |
| Runs | On a schedule | Per request |
| Does | CS2Cap API into Postgres | Postgres out to the browser |

That split is the whole design. The sync is slow and nobody is waiting on it, so anything expensive
gets done there instead of on the request path.

## The performance problem

This is the part of the project I'd point at first.

`price_history` is append-only. It's at 24 million rows and grows by about 2 million a day. The
original `/api/prices` found the newest price per skin with `DISTINCT ON ... ORDER BY fetched_at DESC`,
which meant scanning the entire table on every single request. That was 11.5 seconds on an SSD, and
hours on the Raspberry Pi, where the sort spilled a 22MB temp file onto an SD card.

Two things fixed it.

**Move the work to write time.** The data only changes once per sync, so computing the latest price
per item on every request was pointless. It now lives in materialized views that the sync scripts
refresh when they finish (`server/schema-views.sql`). Refreshing happens `CONCURRENTLY`, so the site
keeps serving the previous snapshot while the new one builds.

**Stop sending data nobody reads.** The bulk `/api/prices` endpoint used to return every market's
price for every skin, but the grids only ever called `Math.min()` on them. It now returns just the
cheapest, and detail pages fetch the full breakdown for one skin when you open it.

```
Query time    11,468ms  ->  0.6ms
Payload          ~29MB  ->  54KB gzipped
```

`server/schema-indexes.sql` has the earlier round of this, where matching an index to the query's
exact sort order took a 400k-row version from 1072ms to 243ms.

## Trade-up probabilities

`js/utils/tradeup-probability.js` works out the odds for a trade-up contract. The straightforward
part is that outcome chances are weighted by how many skins each collection contributes. The fiddly
part is gold trade-ups, where you have to account for knife model, finish, and phase.

Doppler phases aren't uniform, and Chroma cases use a different phase table from every other case,
so the same knife has different Ruby odds depending on which case it came from. Those weights are in
`PHASE_WEIGHTS`.

There are 34 tests in `js/utils/tradeup-probability.test.js`, checked against real case pools pulled
from `crates.json` rather than made-up data. No test runner is installed, so it's a plain Node script:

```
node js/utils/tradeup-probability.test.js
```

## Running it

You need Node and Postgres.

```bash
cd server
npm install
cp .env.example .env     # then fill it in
```

`.env` wants:

- `DATABASE_URL` - Postgres connection string
- `CS2CAP_API_KEY` - for prices, from cs2c.app
- `STEAM_API_KEY` - for sign-in, from steamcommunity.com/dev/apikey. Leave it out and the site
  still works, just without login.
- `SESSION_SECRET` - any long random string
- `BASE_URL` - where the browser actually reaches the site. Steam redirects back to it after login,
  so it has to match.

Then set up the database and pull the data:

```bash
psql -d wearhouse -f server/schema-auth.sql
psql -d wearhouse -f server/schema-indexes.sql
psql -d wearhouse -f server/schema-views.sql

node scripts/sync-catalog.js       # catalog into data/*.json
node server/sync-skin-prices.js    # prices into Postgres
node server/sync-item-prices.js

cd server && npm start             # http://localhost:3001
```

The price syncs are what you run on a schedule. `sync-skins.bat` and `sync-items.bat` are there for
Windows Task Scheduler and log to `sync.log`.

Both sync scripts are rate limited to 40 requests a minute, spaced evenly rather than fired in a
burst, and back off on a 429 using the `Retry-After` the API sends. A full run is tens of thousands
of rows, inserted 500 at a time.

## Data

Catalog data (names, images, rarities, float ranges, case contents) comes from
[ByMykel/CSGO-API](https://github.com/ByMykel/CSGO-API). Prices come from
[CS2Cap](https://cs2c.app), which aggregates the 41 markets.

Neither is affiliated with Valve, and neither am I.

## Not done yet

- Inventory page is a stub
- `price_history` has no retention policy, so at 2M rows a day it will need partitioning or
  rolling old rows into daily aggregates
- No rate limiting on the public API

-- Current-price views. Run once per environment:
--   psql -U postgres -h localhost -d wearhouse -f schema-views.sql
--
-- price_history is an append-only log - 24M rows and climbing by ~2M/day. Finding the newest
-- row per skin with DISTINCT ON meant scanning the whole table on EVERY request (11.5s on an
-- SSD, and hours on a Raspberry Pi's SD card). These views compute that once per sync instead,
-- and the sync scripts refresh them when they finish.
--
-- Two levels per table, because the pages need different things:
--   *_markets   - every market's price + link. Only the detail pages need this.
--   *_cheapest  - just the lowest price. What the big grids use, and ~98% smaller to ship.

-- ── Skins ──────────────────────────────────────────────────────────────────

DROP MATERIALIZED VIEW IF EXISTS current_skin_cheapest;
DROP MATERIALIZED VIEW IF EXISTS current_skin_markets;

CREATE MATERIALIZED VIEW current_skin_markets AS
SELECT DISTINCT ON (def_index, paint_index, wear_tier, variant, market)
       def_index, paint_index, wear_tier, variant, market, price
FROM price_history
ORDER BY def_index, paint_index, wear_tier, variant, market, fetched_at DESC;

-- UNIQUE so the view can be refreshed CONCURRENTLY (readers aren't blocked during a refresh)
CREATE UNIQUE INDEX current_skin_markets_key
    ON current_skin_markets (def_index, paint_index, wear_tier, variant, market);
-- how the per-skin detail endpoint looks a single skin up
CREATE INDEX current_skin_markets_skin
    ON current_skin_markets (def_index, paint_index);

CREATE MATERIALIZED VIEW current_skin_cheapest AS
SELECT def_index, paint_index, wear_tier, variant, MIN(price) AS price
FROM current_skin_markets
GROUP BY def_index, paint_index, wear_tier, variant;

CREATE UNIQUE INDEX current_skin_cheapest_key
    ON current_skin_cheapest (def_index, paint_index, wear_tier, variant);

-- ── Non-skin items (stickers, agents, charms, ...) ──────────────────────────

DROP MATERIALIZED VIEW IF EXISTS current_item_cheapest;
DROP MATERIALIZED VIEW IF EXISTS current_item_markets;

CREATE MATERIALIZED VIEW current_item_markets AS
SELECT DISTINCT ON (item_id, market)
       item_id, market, price
FROM item_price_history
ORDER BY item_id, market, fetched_at DESC;

CREATE UNIQUE INDEX current_item_markets_key ON current_item_markets (item_id, market);

CREATE MATERIALIZED VIEW current_item_cheapest AS
SELECT item_id, MIN(price) AS price
FROM current_item_markets
GROUP BY item_id;

CREATE UNIQUE INDEX current_item_cheapest_key ON current_item_cheapest (item_id);

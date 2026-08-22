-- Performance indexes for the two "latest price" endpoints. Run once per environment:
--   psql -U postgres -h localhost -d wearhouse -f schema-indexes.sql
--
-- /api/prices and /api/item-prices both use DISTINCT ON ... ORDER BY ... fetched_at DESC.
-- The existing UNIQUE constraints sort fetched_at ASCENDING, so Postgres couldn't use them
-- for these queries and fell back to a sequential scan plus a full sort - which spilled to
-- disk once the tables grew past a few hundred thousand rows. These indexes match the
-- queries' exact sort order, so the sort disappears entirely.
--
-- Measured on ~400k rows: 1072ms -> 243ms, and no more 22MB temp file. The gain is far
-- larger on the Pi, where that temp file was being written to an SD card.

CREATE INDEX IF NOT EXISTS idx_price_history_latest
    ON price_history (def_index, paint_index, wear_tier, variant, market, fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_item_price_history_latest
    ON item_price_history (item_id, market, fetched_at DESC);

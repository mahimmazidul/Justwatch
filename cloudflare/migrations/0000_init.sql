-- Cloudflare D1 schema for JustWatch Search.
--
-- Applied with:  wrangler d1 migrations apply justwatch-db --remote
--
-- This is the SQLite equivalent of the original Postgres schema. Both tables
-- back optional features (the anonymous watchlist and the trending-searches
-- rail); the app degrades gracefully if they are missing, so a failure to
-- apply this file never takes the site down.

CREATE TABLE IF NOT EXISTS `watchlist_items` (
	`id` text PRIMARY KEY NOT NULL,
	`anon_id` text NOT NULL,
	`node_id` text NOT NULL,
	`object_type` text NOT NULL,
	`title` text NOT NULL,
	`year` integer,
	`poster_url` text,
	`full_path` text,
	`created_at` integer NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS `watchlist_items_anon_node_unique`
	ON `watchlist_items` (`anon_id`, `node_id`);

CREATE INDEX IF NOT EXISTS `watchlist_items_anon_idx`
	ON `watchlist_items` (`anon_id`);

CREATE TABLE IF NOT EXISTS `search_events` (
	`id` text PRIMARY KEY NOT NULL,
	`query` text NOT NULL,
	`normalized` text NOT NULL,
	`results_count` integer DEFAULT 0 NOT NULL,
	`market` text DEFAULT 'US' NOT NULL,
	`created_at` integer NOT NULL
);

CREATE INDEX IF NOT EXISTS `search_events_normalized_idx`
	ON `search_events` (`normalized`);

CREATE INDEX IF NOT EXISTS `search_events_created_idx`
	ON `search_events` (`created_at`);

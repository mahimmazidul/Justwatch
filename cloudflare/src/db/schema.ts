import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Persistence runs on Cloudflare D1 (SQLite), not Postgres.
 *
 * Two Postgres features have no SQLite equivalent and are handled in code
 * instead, in src/lib/store.ts:
 *   - uuid().defaultRandom()  -> crypto.randomUUID() assigned on insert
 *   - timestamp().defaultNow() -> Date.now() stored as integer milliseconds
 *
 * Both tables keep the same column names as the original Postgres schema so
 * the queries in store.ts read identically.
 */

/**
 * Anonymous watchlist — a cookie-scoped list of saved titles.
 */
export const watchlistItems = sqliteTable(
  "watchlist_items",
  {
    id: text("id").primaryKey(),
    anonId: text("anon_id").notNull(),
    nodeId: text("node_id").notNull(),
    objectType: text("object_type").notNull(),
    title: text("title").notNull(),
    year: integer("year"),
    posterUrl: text("poster_url"),
    fullPath: text("full_path"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("watchlist_items_anon_node_unique").on(table.anonId, table.nodeId),
    index("watchlist_items_anon_idx").on(table.anonId),
  ]
);

/**
 * Search telemetry — powers the "trending searches" rail on the homepage.
 */
export const searchEvents = sqliteTable(
  "search_events",
  {
    id: text("id").primaryKey(),
    query: text("query").notNull(),
    normalized: text("normalized").notNull(),
    resultsCount: integer("results_count").notNull().default(0),
    market: text("market").notNull().default("US"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("search_events_normalized_idx").on(table.normalized),
    index("search_events_created_idx").on(table.createdAt),
  ]
);

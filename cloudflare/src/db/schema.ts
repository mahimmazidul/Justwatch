import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/**
 * Anonymous watchlist — a cookie-scoped list of saved titles.
 */
export const watchlistItems = pgTable(
  "watchlist_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    anonId: text("anon_id").notNull(),
    nodeId: text("node_id").notNull(),
    objectType: text("object_type").notNull(),
    title: text("title").notNull(),
    year: integer("year"),
    posterUrl: text("poster_url"),
    fullPath: text("full_path"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("watchlist_items_anon_node_unique").on(table.anonId, table.nodeId),
    index("watchlist_items_anon_idx").on(table.anonId),
  ]
);

/**
 * Search telemetry — powers the "trending searches" rail on the homepage.
 */
export const searchEvents = pgTable(
  "search_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    query: text("query").notNull(),
    normalized: text("normalized").notNull(),
    resultsCount: integer("results_count").notNull().default(0),
    market: text("market").notNull().default("US"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("search_events_normalized_idx").on(table.normalized),
    index("search_events_created_idx").on(table.createdAt),
  ]
);

import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { searchEvents, watchlistItems } from "@/db/schema";
import type { JWTitleSummary } from "./justwatch";

/* Persistence runs on Cloudflare D1. All access is failure-tolerant exactly as
 * it was against Postgres: if the binding is missing, the tables are not
 * migrated, or a query fails, callers get graceful fallbacks instead of a 500.
 * getDb() resolving to null means "no database available" and takes the same
 * path.
 *
 * SQLite has no uuid() or CURRENT_TIMESTAMP column default, so both are
 * assigned here at insert time. */

export function logSearchEvent(query: string, resultsCount: number, market: string): void {
  const normalized = query.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized || normalized.length < 2) return;
  // Fire and forget: telemetry must never delay or break a search response.
  void (async () => {
    try {
      const db = await getDb();
      if (!db) return;
      await db.insert(searchEvents).values({
        id: crypto.randomUUID(),
        query: query.trim().slice(0, 120),
        normalized: normalized.slice(0, 120),
        resultsCount,
        market,
        createdAt: new Date(),
      });
    } catch {
      /* telemetry is best-effort */
    }
  })();
}

export interface TrendingSearch {
  label: string;
  count: number;
}

const FALLBACK_TRENDING: TrendingSearch[] = [
  { label: "severance", count: 0 },
  { label: "dune", count: 0 },
  { label: "the bear", count: 0 },
  { label: "spirited away", count: 0 },
  { label: "true detective", count: 0 },
  { label: "past lives", count: 0 },
];

export async function getTrendingSearches(limit = 8): Promise<TrendingSearch[]> {
  try {
    const db = await getDb();
    if (!db) return FALLBACK_TRENDING;
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const rows = await db
      .select({
        normalized: searchEvents.normalized,
        label: sql<string>`max(${searchEvents.query})`,
        // SQLite count() already returns an integer; Postgres needed the ::int cast.
        count: sql<number>`count(*)`,
      })
      .from(searchEvents)
      .where(gte(searchEvents.createdAt, since))
      .groupBy(searchEvents.normalized)
      .orderBy(desc(sql`count(*)`))
      .limit(limit);
    if (rows.length === 0) return FALLBACK_TRENDING;
    return rows.map((r) => ({ label: r.label, count: Number(r.count) }));
  } catch {
    return FALLBACK_TRENDING;
  }
}

export interface WatchlistRow {
  nodeId: string;
  objectType: string;
  title: string;
  year: number | null;
  posterUrl: string | null;
  fullPath: string | null;
  createdAt: Date;
}

export async function listWatchlist(anonId: string): Promise<WatchlistRow[]> {
  try {
    const db = await getDb();
    if (!db) return [];
    return await db
      .select({
        nodeId: watchlistItems.nodeId,
        objectType: watchlistItems.objectType,
        title: watchlistItems.title,
        year: watchlistItems.year,
        posterUrl: watchlistItems.posterUrl,
        fullPath: watchlistItems.fullPath,
        createdAt: watchlistItems.createdAt,
      })
      .from(watchlistItems)
      .where(eq(watchlistItems.anonId, anonId))
      .orderBy(desc(watchlistItems.createdAt));
  } catch {
    return [];
  }
}

export async function addToWatchlist(anonId: string, title: JWTitleSummary): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;
    await db
      .insert(watchlistItems)
      .values({
        id: crypto.randomUUID(),
        anonId,
        nodeId: title.id,
        objectType: title.objectType,
        title: title.title,
        year: title.year,
        posterUrl: title.poster,
        fullPath: title.fullPath,
        createdAt: new Date(),
      })
      .onConflictDoNothing();
    return true;
  } catch {
    return false;
  }
}

export async function removeFromWatchlist(anonId: string, nodeId: string): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;
    await db
      .delete(watchlistItems)
      .where(and(eq(watchlistItems.anonId, anonId), eq(watchlistItems.nodeId, nodeId)));
    return true;
  } catch {
    return false;
  }
}

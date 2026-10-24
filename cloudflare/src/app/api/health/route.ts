import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import { searchEvents, watchlistItems } from "@/db/schema";

export const dynamic = "force-dynamic";

/**
 * Liveness and database readiness probe.
 *
 * Querying the real tables rather than `select 1` means this reports whether
 * the D1 migration has actually been applied, not just whether the binding
 * exists. That is the thing most likely to be wrong after a first deploy.
 *
 * A missing database is reported as 200 with status "not-configured" because
 * the site is designed to work without it — the watchlist and trending rail
 * fall back gracefully. A database that is present but broken is a real fault,
 * so that returns 503.
 */
export async function GET() {
  const db = await getDb();

  if (!db) {
    return Response.json({
      ok: true,
      database: "not-configured",
      detail: "no D1 binding; watchlist and trending fall back to defaults",
    });
  }

  try {
    const [events, items] = await Promise.all([
      db.select({ n: sql<number>`count(*)` }).from(searchEvents),
      db.select({ n: sql<number>`count(*)` }).from(watchlistItems),
    ]);
    return Response.json({
      ok: true,
      database: "ready",
      searchEvents: Number(events[0]?.n ?? 0),
      watchlistItems: Number(items[0]?.n ?? 0),
    });
  } catch (err) {
    return Response.json(
      {
        ok: false,
        database: "error",
        detail:
          "D1 is bound but the query failed — most likely the schema has not been applied. " +
          "Run: npx wrangler d1 migrations apply justwatch-db --remote",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 503 }
    );
  }
}

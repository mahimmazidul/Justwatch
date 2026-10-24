import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as schema from "./schema";

/**
 * Cloudflare D1 replaces the Postgres pool this app originally used.
 *
 * `pg` opened TCP sockets, which Workers cannot do; D1 is a runtime binding
 * instead. Bindings only exist per-request, so `getCloudflareContext()` is
 * async and there is no module-level `db` to import — callers await `getDb()`.
 *
 * It resolves to null rather than throwing whenever D1 is unavailable: the
 * binding commented out of wrangler.jsonc, a plain `next dev` without the
 * adapter, or a deploy made before the database was created. Every caller in
 * src/lib/store.ts treats null as "no persistence" and returns the same
 * graceful fallbacks it already used for a dropped Postgres connection, so the
 * site keeps working without a database.
 */

export type Db = DrizzleD1Database<typeof schema>;

/**
 * Read through a locally declared shape rather than the generated
 * `CloudflareEnv`, so this still compiles if `wrangler types` is re-run while
 * the d1_databases block is commented out and `DB` disappears from it.
 */
type D1Binding = { DB?: D1Database };

let cachedEnv: D1Binding | null = null;

async function resolveEnv(): Promise<D1Binding | null> {
  // Only a successful resolution is cached; a failure retries on the next call
  // so a transient miss cannot permanently disable persistence for the isolate.
  if (cachedEnv) return cachedEnv;
  try {
    // `{ async: true }` selects the promise-returning overload. The synchronous
    // one only works once the runtime has populated the context for this
    // request, which is not guaranteed from every call site.
    const { env } = await getCloudflareContext({ async: true });
    cachedEnv = (env as unknown as D1Binding) ?? null;
  } catch {
    cachedEnv = null;
  }
  return cachedEnv;
}

/** The D1 database, or null when no binding is available. */
export async function getDb(): Promise<Db | null> {
  const env = await resolveEnv();
  const d1 = env?.DB;
  if (!d1) return null;
  return drizzle(d1, { schema });
}

/**
 * Whether persistence is switched on at all.
 *
 * Lets the UI say "storage is not configured" instead of "nothing saved yet",
 * which would otherwise be a promise the deployment cannot keep. An empty
 * watchlist and a missing database look identical to listWatchlist().
 */
export async function isDatabaseConfigured(): Promise<boolean> {
  return (await getDb()) !== null;
}

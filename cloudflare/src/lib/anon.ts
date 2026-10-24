import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const ANON_COOKIE = "ss_uid";
export const MARKET_COOKIE = "ss_market";

/**
 * Anonymous identity and market preference, read from cookies.
 *
 * `randomUUID` used to be imported from Node's `crypto` module. Workers
 * provide the same function on the Web Crypto global, so the import is gone —
 * one less Node builtin for the runtime to shim.
 */

/** A UUID we issued ourselves. Anything else is treated as absent. */
const ANON_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Read the anonymous watchlist owner id from cookies (server side). */
export async function readAnonId(): Promise<string | null> {
  const jar = await cookies();
  const value = jar.get(ANON_COOKIE)?.value ?? null;
  return value && ANON_ID.test(value) ? value : null;
}

/** Read the preferred market from cookies. */
export async function readMarket(): Promise<string | null> {
  const jar = await cookies();
  const value = jar.get(MARKET_COOKIE)?.value?.toUpperCase() ?? null;
  // Two-letter ISO code only; it is interpolated into queries and links.
  return value && /^[A-Z]{2}$/.test(value) ? value : null;
}

/**
 * Ensure an anon id exists; sets the cookie on the outgoing response if new.
 *
 * A malformed or oversized cookie value is rejected rather than trusted, so
 * only ids this server generated are ever used as a database key.
 */
export function ensureAnonId(req: Request): {
  anonId: string;
  setCookieOn: (res: NextResponse) => NextResponse;
} {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${ANON_COOKIE}=([^;]+)`));
  const candidate = match?.[1];
  const existing = candidate && ANON_ID.test(candidate) ? candidate : null;
  const anonId = existing ?? crypto.randomUUID();
  return {
    anonId,
    setCookieOn: (res: NextResponse) => {
      if (!existing) {
        res.cookies.set(ANON_COOKIE, anonId, {
          httpOnly: true,
          sameSite: "lax",
          maxAge: 60 * 60 * 24 * 365,
          path: "/",
        });
      }
      return res;
    },
  };
}

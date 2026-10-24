import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

export const ANON_COOKIE = "ss_uid";
export const MARKET_COOKIE = "ss_market";

/** Read the anonymous watchlist owner id from cookies (server side). */
export async function readAnonId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(ANON_COOKIE)?.value ?? null;
}

/** Read the preferred market from cookies. */
export async function readMarket(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(MARKET_COOKIE)?.value ?? null;
}

/** Ensure an anon id exists; sets the cookie on the outgoing response if new. */
export function ensureAnonId(req: Request): { anonId: string; setCookieOn: (res: NextResponse) => NextResponse } {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${ANON_COOKIE}=([^;]+)`));
  const existing = match?.[1];
  const anonId = existing && existing.length >= 8 ? existing : randomUUID();
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

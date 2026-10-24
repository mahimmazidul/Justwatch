import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_MARKET, searchTitles } from "@/lib/justwatch";
import { isValidMarket } from "@/lib/markets";
import { logSearchEvent } from "@/lib/store";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") ?? "").trim();
  const country = (sp.get("country") ?? DEFAULT_MARKET).toUpperCase();
  const type = sp.get("type");
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 20, 1), 40);

  if (q.length < 2) {
    return NextResponse.json({ results: [], query: q, country });
  }

  const objectType = type === "movie" ? "MOVIE" : type === "show" ? "SHOW" : undefined;
  const results = await searchTitles(q, {
    country: isValidMarket(country) ? country : DEFAULT_MARKET,
    first: limit,
    objectType,
  });

  logSearchEvent(q, results.length, country);

  return NextResponse.json(
    { results, query: q, country },
    { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } }
  );
}

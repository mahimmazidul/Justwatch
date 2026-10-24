import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_MARKET, popularTitles } from "@/lib/justwatch";
import { isValidMarket } from "@/lib/markets";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const country = (sp.get("country") ?? DEFAULT_MARKET).toUpperCase();
  const type = sp.get("type") === "show" ? "SHOW" : "MOVIE";
  const limit = Math.min(Math.max(Number(sp.get("limit")) || 14, 1), 30);

  const results = await popularTitles(type, {
    country: isValidMarket(country) ? country : DEFAULT_MARKET,
    first: limit,
  });

  return NextResponse.json(
    { results, country, type },
    { headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=7200" } }
  );
}

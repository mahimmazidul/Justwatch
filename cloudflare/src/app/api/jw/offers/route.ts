import { NextRequest, NextResponse } from "next/server";
import { getAllOffers, getTitle, getTitleCountries } from "@/lib/justwatch";
import { getUsdRates } from "@/lib/fx";

/**
 * The equivalent of the original app's GetAllOffers:
 * resolve title -> locales -> countries -> one GraphQL query with one
 * alias per market -> prices normalised to USD.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const id = sp.get("id");
  if (!id || !/^[a-z0-9]+$/i.test(id) || id.length > 24) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  let path = sp.get("path");
  if (!path) {
    const title = await getTitle(id);
    if (!title) return NextResponse.json({ error: "title not found" }, { status: 404 });
    path = title.fullPath;
  }

  const [countries, fx] = await Promise.all([getTitleCountries(path), getUsdRates()]);
  const bundle = await getAllOffers(id, countries, fx.rates);

  return NextResponse.json(
    { id, path, ...bundle, fx: { base: "USD" as const, timestamp: fx.timestamp, degraded: fx.degraded } },
    { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=1800" } }
  );
}

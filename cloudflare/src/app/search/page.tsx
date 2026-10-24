import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { searchTitles } from "@/lib/justwatch";
import { readMarket } from "@/lib/anon";
import { logSearchEvent } from "@/lib/store";
import { SearchBar } from "@/components/search-bar";
import { SearchResults } from "@/components/search-results";
import { isValidMarket } from "@/lib/markets";

export const metadata: Metadata = { title: "Search" };

async function Results({
  q,
  type,
  market,
}: {
  q: string;
  type: "all" | "movie" | "show";
  market: string;
}) {
  const objectType = type === "movie" ? "MOVIE" : type === "show" ? "SHOW" : undefined;
  const results = await searchTitles(q, {
    country: market,
    first: 30,
    objectType,
  });
  logSearchEvent(q, results.length, market);
  return <SearchResults results={results} query={q} market={market} activeType={type} />;
}

function ResultsSkeleton() {
  return (
    <div>
      <div className="mb-8 flex gap-2">
        {[80, 90, 90].map((w, i) => (
          <div key={i} className="skeleton h-8 rounded-full" style={{ width: w }} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {Array.from({ length: 18 }).map((_, i) => (
          <div key={i}>
            <div className="skeleton aspect-[2/3]" />
            <div className="skeleton mt-2.5 h-3.5 w-3/4" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = (typeof sp.q === "string" ? sp.q : "").trim();
  const marketRaw = typeof sp.market === "string" ? sp.market.toUpperCase() : null;
  const cookieMarket = (await readMarket()) ?? "US";
  const market = marketRaw && isValidMarket(marketRaw) ? marketRaw : cookieMarket;
  const type: "all" | "movie" | "show" =
    sp.type === "movie" ? "movie" : sp.type === "show" ? "show" : "all";

  if (!q) redirect("/");

  return (
    <div className="mx-auto max-w-[1440px] px-5 pb-24 pt-10 sm:px-8">
      <div className="mb-10 border-b border-[var(--color-line)] pb-8">
        <SearchBar market={market} variant="compact" initialQuery={q} />
        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <h1 className="display text-3xl sm:text-5xl">
            <span className="serif-accent mr-2 normal-case text-[var(--color-accent)]">results for</span>“{q}”
          </h1>
          <span className="label">Market · {market}</span>
        </div>
      </div>
      <Suspense key={`${q}-${type}-${market}`} fallback={<ResultsSkeleton />}>
        <Results q={q} type={type} market={market} />
      </Suspense>
    </div>
  );
}

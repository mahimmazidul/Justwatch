"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ArrowDownUp, ArrowUpRight, CircleDollarSign, Globe2, Package2 } from "lucide-react";
import type { JWCountryOffers, JWOffer, JWOfferBundle, OfferCategory } from "@/lib/justwatch";
import { OFFER_TYPE_LABEL } from "@/lib/format";

/* ------------------------------------------------------------------ */
/* Grouping: collapse duplicate (provider, category) rows into one,    */
/* keeping the cheapest price and the full set of quality tiers.       */
/* ------------------------------------------------------------------ */

interface GroupedOffer {
  key: string;
  category: OfferCategory;
  packageName: string;
  packageIcon: string | null;
  presentations: string[];
  priceLocal: number | null;
  currency: string | null;
  priceLabel: string | null;
  priceUsd: number | null;
  url: string | null;
}

const QUALITY_RANK: Record<string, number> = { SD: 1, HD: 2, "4K": 3 };

function groupOffers(offers: JWOffer[]): GroupedOffer[] {
  const map = new Map<string, GroupedOffer>();
  for (const o of offers) {
    const key = `${o.packageId}:${o.category}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        category: o.category,
        packageName: o.packageName,
        packageIcon: o.packageIcon,
        presentations: [o.presentation],
        priceLocal: o.priceLocal,
        currency: o.currency,
        priceLabel: o.priceLabel,
        priceUsd: o.priceUsd,
        url: o.url,
      });
    } else {
      if (!existing.presentations.includes(o.presentation)) {
        existing.presentations.push(o.presentation);
        existing.presentations.sort((a, b) => (QUALITY_RANK[a] ?? 0) - (QUALITY_RANK[b] ?? 0));
      }
      const aPrice = existing.priceUsd ?? Number.POSITIVE_INFINITY;
      const bPrice = o.priceUsd ?? Number.POSITIVE_INFINITY;
      if (bPrice < aPrice) {
        existing.priceUsd = o.priceUsd;
        existing.priceLocal = o.priceLocal;
        existing.currency = o.currency;
        existing.priceLabel = o.priceLabel;
        if (o.url) existing.url = o.url;
      }
    }
  }
  const catRank: Record<OfferCategory, number> = { stream: 0, free: 1, rent: 2, buy: 3, cinema: 4 };
  return [...map.values()].sort((a, b) => {
    const c = catRank[a.category] - catRank[b.category];
    if (c !== 0) return c;
    const pa = a.priceUsd ?? -1;
    const pb = b.priceUsd ?? -1;
    if (pa !== pb) return pa - pb;
    return a.packageName.localeCompare(b.packageName);
  });
}

const CAT_COLOR: Record<OfferCategory, string> = {
  stream: "var(--color-stream)",
  free: "var(--color-free)",
  rent: "var(--color-rent)",
  buy: "var(--color-buy)",
  cinema: "var(--color-muted)",
};

const TABS: { key: OfferCategory | "all"; label: string }[] = [
  { key: "all", label: "All offers" },
  { key: "stream", label: "Stream" },
  { key: "free", label: "Free" },
  { key: "rent", label: "Rent" },
  { key: "buy", label: "Buy" },
];

interface OfferMatrixProps {
  bundle: Omit<JWOfferBundle, "fx"> & { fx: { base: "USD"; timestamp: string | null; degraded: boolean } };
}

export function OfferMatrix({ bundle }: OfferMatrixProps) {
  const [tab, setTab] = useState<OfferCategory | "all">("all");
  const [query, setQuery] = useState("");
  const [usd, setUsd] = useState(true);
  const [sort, setSort] = useState<"az" | "price">("az");

  useEffect(() => {
    const saved = window.localStorage.getItem("ss_currency_mode");
    // The currency preference is browser-only state, so it has to be read after
    // mount. Reading it during render or in a lazy useState initializer would
    // produce markup that differs from the server render and trip React's
    // hydration check, which is worse than the extra render this rule warns
    // about - and it only happens once, on the first visit that has a
    // preference stored.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved === "local") setUsd(false);
  }, []);

  const toggleCurrency = () => {
    // Persisted outside the updater on purpose: a state updater must be pure,
    // and React is allowed to invoke it more than once. The write used to sit
    // inside it.
    window.localStorage.setItem("ss_currency_mode", usd ? "local" : "usd");
    setUsd(!usd);
  };

  /* group offers per country once */
  const countries = useMemo(
    () =>
      bundle.countries.map((c) => ({
        ...c,
        grouped: groupOffers(c.offers),
      })),
    [bundle.countries]
  );

  /* global tab counts */
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0, stream: 0, free: 0, rent: 0, buy: 0 };
    for (const c of countries) {
      for (const g of c.grouped) {
        counts[g.category] = (counts[g.category] ?? 0) + 1;
        counts.all += 1;
      }
    }
    return counts;
  }, [countries]);

  /* filter + sort */
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = countries
      .map((c) => ({
        ...c,
        grouped: tab === "all" ? c.grouped : c.grouped.filter((g) => g.category === tab),
      }))
      .filter((c) => c.grouped.length > 0)
      .filter(
        (c) => !q || c.countryName.toLowerCase().includes(q) || c.country.toLowerCase().includes(q)
      );
    if (sort === "price") {
      list = [...list].sort((a, b) => {
        const minA = Math.min(...a.grouped.map((g) => g.priceUsd ?? Number.POSITIVE_INFINITY));
        const minB = Math.min(...b.grouped.map((g) => g.priceUsd ?? Number.POSITIVE_INFINITY));
        if (minA === minB) return a.countryName.localeCompare(b.countryName);
        return minA - minB;
      });
    } else {
      list = [...list].sort((a, b) => a.countryName.localeCompare(b.countryName));
    }
    return list;
  }, [countries, tab, query, sort]);

  return (
    <div>
      {/* ------------------------- best-deal summary ------------------------- */}
      <div className="grid gap-px overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-line)] sm:grid-cols-3">
        <BestDealCard
          label="Streaming"
          accent="var(--color-stream)"
          headline={bundle.best.stream ? bundle.best.stream.packageName : "—"}
          sub={bundle.best.stream ? `${bundle.best.stream.country} · included with subscription` : "No flatrate offers found"}
        />
        <BestDealCard
          label="Cheapest rent"
          accent="var(--color-rent)"
          headline={bundle.best.rent ? `$${bundle.best.rent.priceUsd.toFixed(2)}` : "—"}
          sub={
            bundle.best.rent
              ? `${bundle.best.rent.country} · ${bundle.best.rent.packageName}`
              : "No rental offers found"
          }
        />
        <BestDealCard
          label="Cheapest buy"
          accent="var(--color-buy)"
          headline={bundle.best.buy ? `$${bundle.best.buy.priceUsd.toFixed(2)}` : "—"}
          sub={
            bundle.best.buy
              ? `${bundle.best.buy.country} · ${bundle.best.buy.packageName}`
              : "No purchase offers found"
          }
        />
      </div>

      {/* ------------------------------ toolbar ----------------------------- */}
      <div className="sticky top-16 z-30 -mx-5 mt-10 border-y border-[var(--color-line)] bg-[rgba(244,241,234,0.88)] px-5 py-3.5 backdrop-blur-xl sm:-mx-8 sm:px-8">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-2">
          <div className="mr-2 flex items-center gap-2">
            {TABS.map((t) => {
              const count = tabCounts[t.key] ?? 0;
              if (t.key !== "all" && count === 0) return null;
              return (
                <button key={t.key} type="button" className="chip" data-active={tab === t.key} onClick={() => setTab(t.key)}>
                  {t.label}
                  <span className="tabular opacity-60">{count}</span>
                </button>
              );
            })}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="input-shell flex items-center gap-2 rounded-full px-3.5 py-1.5">
              <Globe2 size={11} className="text-[var(--color-faint)]" strokeWidth={1.8} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter markets"
                className="w-28 bg-transparent font-mono text-[11px] tracking-wide outline-none placeholder:text-[var(--color-faint)]"
                aria-label="Filter markets"
              />
            </div>
            <button
              type="button"
              className="chip"
              data-active={sort === "price"}
              onClick={() => setSort((s) => (s === "az" ? "price" : "az"))}
              title="Sort by cheapest offer"
            >
              <ArrowDownUp size={10} strokeWidth={2} />
              {sort === "price" ? "Cheapest" : "A–Z"}
            </button>
            <button
              type="button"
              className="chip"
              data-active={usd}
              onClick={toggleCurrency}
              title="Toggle USD-normalised prices"
            >
              <CircleDollarSign size={10} strokeWidth={2} />
              {usd ? "USD" : "Local"}
            </button>
          </div>
        </div>
      </div>

      {/* ---------------------------- country rows --------------------------- */}
      {visible.length === 0 ? (
        <div className="hairline-card mt-10 grid place-items-center px-8 py-20 text-center">
          <Package2 size={26} strokeWidth={1.4} className="text-[var(--color-faint)]" />
          <p className="display mt-5 text-xl sm:text-2xl">No offers in view</p>
          <p className="mt-2 max-w-sm text-sm text-[var(--color-muted)]">
            {query ? "No market matches your filter." : "No offers of this type were found for this title."}
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {visible.map((c) => (
            <CountrySection key={c.country} country={c} usd={usd} />
          ))}
        </div>
      )}

      <p className="label mt-8 text-[var(--color-faint)]">
        {bundle.fx.degraded
          ? "Exchange rates are cached estimates — FX service unreachable."
          : "Prices normalised to USD via daily exchange rates."}{" "}
        {visible.length} market{visible.length === 1 ? "" : "s"} · {bundle.offerCount} raw offers resolved.
      </p>
    </div>
  );
}

function BestDealCard({ label, accent, headline, sub }: { label: string; accent: string; headline: string; sub: string }) {
  return (
    <div className="bg-[var(--color-bg-2)] p-5 sm:p-6">
      <div className="label flex items-center gap-2">
        <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: accent }} />
        {label}
      </div>
      <div className="display mt-3 text-2xl sm:text-3xl" style={{ color: headline === "—" ? "var(--color-faint)" : "var(--color-ink)" }}>
        {headline}
      </div>
      <div className="mt-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-[var(--color-muted)]">{sub}</div>
    </div>
  );
}

function CountrySection({
  country,
  usd,
}: {
  country: JWCountryOffers & { grouped: GroupedOffer[] };
  usd: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--color-line)]">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-[var(--color-line)] bg-[var(--color-panel)] px-5 py-3">
        <span className="font-mono text-[11px] tracking-[0.2em] text-[var(--color-accent)]">{country.country}</span>
        <h3 className="text-[15px] font-semibold">{country.countryName}</h3>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-faint)] tabular">
          {country.grouped.length} offer{country.grouped.length === 1 ? "" : "s"}
        </span>
      </header>
      <ul className="divide-y divide-[var(--color-line)] bg-[var(--color-bg-2)]">
        {country.grouped.map((g) => (
          <OfferRow key={g.key} offer={g} usd={usd} />
        ))}
      </ul>
    </section>
  );
}

function OfferRow({ offer, usd }: { offer: GroupedOffer; usd: boolean }) {
  const isPriced = offer.category === "rent" || offer.category === "buy";
  const usdLabel = offer.priceUsd != null ? `$${offer.priceUsd.toFixed(2)}` : null;
  const localLabel =
    offer.priceLabel ??
    (offer.priceLocal != null && offer.currency
      ? (() => {
          try {
            return new Intl.NumberFormat("en", { style: "currency", currency: offer.currency }).format(offer.priceLocal);
          } catch {
            return `${offer.priceLocal.toFixed(2)} ${offer.currency}`;
          }
        })()
      : null);

  const main = usd ? usdLabel ?? localLabel : localLabel ?? usdLabel;
  const secondary = isPriced
    ? usd
      ? localLabel && usdLabel && localLabel !== usdLabel
        ? localLabel
        : null
      : usdLabel && localLabel !== usdLabel
        ? `${usdLabel} USD`
        : null
    : null;

  const priceText = isPriced ? main ?? "—" : offer.category === "stream" ? "Included" : "Free";

  const inner = (
    <li className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-[var(--color-panel)]">
      <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-[9px] border border-[var(--color-line)] bg-[var(--color-panel-2)]">
        {offer.packageIcon ? (
          <Image src={offer.packageIcon} alt={offer.packageName} fill sizes="36px" className="object-cover" />
        ) : (
          <span className="grid h-full w-full place-items-center font-mono text-[10px] text-[var(--color-faint)]">
            {offer.packageName.slice(0, 2).toUpperCase()}
          </span>
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[14px] font-medium leading-tight">{offer.packageName}</span>
          {offer.presentations.map((p) => (
            <span key={p} className="quality-badge" data-q={p}>
              {p}
            </span>
          ))}
        </span>
        <span className="mt-0.5 flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[var(--color-faint)]">
          <span className="inline-block h-1 w-1 rounded-full" style={{ background: CAT_COLOR[offer.category] }} />
          {OFFER_TYPE_LABEL[offer.category]}
        </span>
      </span>

      <span className="text-right">
        <span className={`block font-mono text-[13px] tabular leading-tight ${isPriced ? "text-[var(--color-ink)]" : "text-[var(--color-muted)]"}`}>
          {priceText}
        </span>
        {secondary && (
          <span className="block font-mono text-[10px] tabular text-[var(--color-faint)]">{secondary}</span>
        )}
      </span>

      {offer.url && (
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[var(--color-line)] text-[var(--color-faint)] transition-all group-hover:border-[var(--color-accent)] group-hover:text-[var(--color-accent)]">
          <ArrowUpRight size={12} strokeWidth={2} />
        </span>
      )}
    </li>
  );

  if (offer.url) {
    return (
      <a href={offer.url} target="_blank" rel="noopener noreferrer" className="block" aria-label={`Watch on ${offer.packageName}`}>
        {inner}
      </a>
    );
  }
  return inner;
}

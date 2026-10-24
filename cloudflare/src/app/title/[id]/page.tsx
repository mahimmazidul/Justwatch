import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Clock, ExternalLink, Star } from "lucide-react";
import {
  getAllOffers,
  getTitle,
  getTitleCountries,
  jwWebUrl,
  type JWTitleSummary,
} from "@/lib/justwatch";
import { getUsdRates } from "@/lib/fx";
import { readAnonId, readMarket } from "@/lib/anon";
import { listWatchlist } from "@/lib/store";
import { fmtRuntime, kindLabel } from "@/lib/format";
import { OfferMatrix } from "@/components/offer-matrix";
import { WatchlistButton } from "@/components/watchlist-button";
import { BackButton } from "@/components/back-button";

interface PageProps {
  params: Promise<{ id: string }>;
}

async function resolveTitle(id: string, market: string): Promise<JWTitleSummary | null> {
  if (!/^[a-z0-9]+$/i.test(id) || id.length > 24) return null;
  return getTitle(id, market);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const title = await resolveTitle(id, "US");
  if (!title) return { title: "Title not found" };
  return {
    title: `${title.title}${title.year ? ` (${title.year})` : ""} — where to watch`,
    description: title.description?.slice(0, 160) ?? undefined,
    openGraph: title.poster ? { images: [{ url: title.poster }] } : undefined,
  };
}

async function OffersSection({ title }: { title: JWTitleSummary }) {
  const [countries, fx] = await Promise.all([
    getTitleCountries(title.fullPath),
    getUsdRates(),
  ]);
  const bundle = await getAllOffers(title.id, countries, fx.rates);
  return (
    <OfferMatrix
      bundle={{
        ...bundle,
        fx: { base: "USD", timestamp: fx.timestamp, degraded: fx.degraded },
      }}
    />
  );
}

function OffersSkeleton() {
  return (
    <div>
      <div className="grid gap-px overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-line)] sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="bg-[var(--color-bg-2)] p-6">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton mt-4 h-8 w-40" />
            <div className="skeleton mt-2 h-3 w-32" />
          </div>
        ))}
      </div>
      <div className="mt-10 space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-[var(--color-line)]">
            <div className="border-b border-[var(--color-line)] bg-[var(--color-panel)] px-5 py-3.5">
              <div className="skeleton h-4 w-40" />
            </div>
            <div className="space-y-0 bg-[var(--color-bg-2)] p-2">
              {[0, 1, 2].map((r) => (
                <div key={r} className="flex items-center gap-4 px-3 py-2.5">
                  <div className="skeleton h-9 w-9 rounded-[9px]" />
                  <div className="flex-1">
                    <div className="skeleton h-3.5 w-40" />
                    <div className="skeleton mt-1.5 h-2.5 w-24" />
                  </div>
                  <div className="skeleton h-4 w-14" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="label mt-8 text-[var(--color-faint)]">Resolving up to 54 markets…</p>
    </div>
  );
}

export default async function TitlePage({ params }: PageProps) {
  const { id } = await params;
  const market = (await readMarket()) ?? "US";
  const title = await resolveTitle(id, market);
  if (!title) notFound();

  const anonId = await readAnonId();
  const saved = anonId
    ? (await listWatchlist(anonId)).some((i) => i.nodeId === title.id)
    : false;

  const runtime = fmtRuntime(title.runtimeMinutes);
  const runtimeLabel =
    runtime && title.objectType === "SHOW" ? `${title.runtimeMinutes}m / episode` : runtime;
  const jwUrl = jwWebUrl(title.fullPath);

  return (
    <article className="relative">
      {/* backdrop */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[560px] overflow-hidden">
        {title.backdrop && (
          <Image
            src={title.backdrop}
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover opacity-60"
          />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(244,241,234,0.1),rgba(244,241,234,0.55)_52%,var(--color-bg)_96%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(244,241,234,0.55),transparent_60%)]" />
      </div>

      <div className="relative mx-auto max-w-[1440px] px-5 pt-28 sm:px-8">
        <div className="rise" style={{ animationDelay: "60ms" }}>
          <BackButton />
        </div>

        <div className="mt-8 grid gap-10 md:grid-cols-[220px_1fr] lg:grid-cols-[260px_1fr]">
          {/* poster */}
          <div className="rise mx-auto w-[180px] md:mx-0 md:w-full" style={{ animationDelay: "140ms" }}>
            <div className="poster-card aspect-[2/3] shadow-[0_36px_70px_-28px_rgba(45,40,30,0.5)]">
              {title.poster ? (
                <Image
                  src={title.poster}
                  alt={title.title}
                  fill
                  priority
                  sizes="(max-width: 768px) 180px, 260px"
                  className="object-cover"
                />
              ) : (
                <div className="absolute inset-0 grid place-items-center p-6 text-center">
                  <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-faint)]">
                    No artwork
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* facts */}
          <div className="min-w-0 pb-4">
            <div className="rise label label--accent flex items-center gap-2" style={{ animationDelay: "200ms" }}>
              <span className="inline-block h-px w-6 bg-[var(--color-accent)]" />
              {kindLabel(title.objectType)} · Market view {market}
            </div>

            <h1 className="rise display mt-4 text-[clamp(2.4rem,6vw,5.2rem)]" style={{ animationDelay: "280ms" }}>
              {title.title}
            </h1>

            <div className="rise mt-5 flex flex-wrap items-center gap-2" style={{ animationDelay: "360ms" }}>
              {title.year && <span className="chip">{title.year}</span>}
              {runtimeLabel && (
                <span className="chip">
                  <Clock size={10} strokeWidth={2} />
                  {runtimeLabel}
                </span>
              )}
              {title.genres.slice(0, 4).map((g) => (
                <span key={g} className="chip">{g}</span>
              ))}
            </div>

            {title.description && (
              <p className="rise mt-6 max-w-2xl text-[15px] leading-relaxed text-[var(--color-muted)]" style={{ animationDelay: "440ms" }}>
                {title.description}
              </p>
            )}

            <div className="rise mt-8 flex flex-wrap items-center gap-3" style={{ animationDelay: "520ms" }}>
              <WatchlistButton
                nodeId={title.id}
                initialSaved={saved}
                payload={{
                  id: title.id,
                  objectType: title.objectType,
                  title: title.title,
                  year: title.year,
                  poster: title.poster,
                  fullPath: title.fullPath,
                }}
              />
              {title.imdbId && (
                <a
                  href={`https://www.imdb.com/title/${title.imdbId}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="chip"
                >
                  <Star size={10} strokeWidth={2} />
                  IMDb
                  <ExternalLink size={9} strokeWidth={2} />
                </a>
              )}
              {jwUrl && (
                <a href={jwUrl} target="_blank" rel="noopener noreferrer" className="chip">
                  JustWatch page
                  <ExternalLink size={9} strokeWidth={2} />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* offers */}
        <section className="mt-16 pb-24">
          <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-[var(--color-line)] pb-6">
            <div>
              <div className="label label--accent mb-2 flex items-center gap-2">
                <span className="inline-block h-px w-6 bg-[var(--color-accent)]" />
                Global availability
              </div>
              <h2 className="display text-3xl sm:text-4xl">
                The offer <span className="serif-accent text-[var(--color-accent)]">matrix</span>
              </h2>
            </div>
            <p className="label max-w-[260px] leading-relaxed">
              Every provider offer, every market — one query, prices in USD.
            </p>
          </div>
          <Suspense fallback={<OffersSkeleton />}>
            <OffersSection title={title} />
          </Suspense>
        </section>
      </div>
    </article>
  );
}

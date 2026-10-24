import Link from "next/link";
import { Suspense } from "react";
import { ArrowUpRight, Flame } from "lucide-react";
import { popularTitles, type JWTitleSummary } from "@/lib/justwatch";
import { readMarket } from "@/lib/anon";
import { MARKET_LIST } from "@/lib/markets";
import { getTrendingSearches } from "@/lib/store";
import { SearchBar } from "@/components/search-bar";
import { TitleCard } from "@/components/title-card";
import { Rail } from "@/components/rail";
import { Reveal } from "@/components/reveal";
import { PosterMarquee, TextMarquee } from "@/components/marquee";

export const metadata = { title: "JustWatch Search — Find where to watch anything, anywhere" };

async function TrendingChips() {
  const trending = await getTrendingSearches(7);
  return (
    <div className="mt-7 flex flex-wrap items-center gap-2">
      <span className="label mr-1 flex items-center gap-1.5">
        <Flame size={11} className="text-[var(--color-accent)]" strokeWidth={2} />
        Trending
      </span>
      {trending.map((t) => (
        <Link key={t.label} href={`/search?q=${encodeURIComponent(t.label)}`} className="chip capitalize">
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export default async function HomePage() {
  const market = (await readMarket()) ?? "US";
  const [movies, shows] = await Promise.all([
    popularTitles("MOVIE", { country: market, first: 16 }).catch(() => [] as JWTitleSummary[]),
    popularTitles("SHOW", { country: market, first: 16 }).catch(() => [] as JWTitleSummary[]),
  ]);
  const backdrop = [...movies.slice(0, 8), ...shows.slice(0, 8)];
  const backdrop2 = [...shows.slice(4, 12), ...movies.slice(4, 12)];

  return (
    <div className="relative">
      {/* ------------------------------ HERO ------------------------------ */}
      <section className="relative flex min-h-[92svh] flex-col justify-center overflow-hidden">
        <div className="pointer-events-none absolute inset-x-[-8%] -top-8 rotate-[-5deg] opacity-[0.5] [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_70%,transparent)]">
          <PosterMarquee titles={backdrop} />
          <div className="mt-5">
            <PosterMarquee titles={backdrop2} reverse />
          </div>
        </div>
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_62%_56%_at_50%_45%,rgba(244,241,234,0.55),var(--color-bg)_80%)]" />

        <div className="relative z-10 mx-auto w-full max-w-[1440px] px-5 py-20 sm:px-8">
          <div className="max-w-4xl">
            <div className="rise label label--accent mb-7 flex items-center gap-3" style={{ animationDelay: "80ms" }}>
              <span className="inline-block h-px w-10 bg-[var(--color-accent)]" />
              Streaming availability engine — {MARKET_LIST.length} markets
            </div>

            <h1 className="display text-[clamp(3rem,9.5vw,7.5rem)]">
              <span className="rise block" style={{ animationDelay: "160ms" }}>Where to watch</span>
              <span className="rise block" style={{ animationDelay: "260ms" }}>
                <span className="serif-accent mr-3 text-[clamp(2.6rem,8.5vw,6.8rem)] text-[var(--color-accent)]">anything,</span>
                anywhere.
              </span>
            </h1>

            <p className="rise mt-7 max-w-xl text-[15px] leading-relaxed text-[var(--color-muted)] sm:text-base" style={{ animationDelay: "360ms" }}>
              Search any film or series and see every streaming, rental and purchase offer
              across {MARKET_LIST.length} countries — prices normalised to USD, so you can
              compare the whole world at a glance.
            </p>

            {/* `relative z-30` is load-bearing, not decorative. `.rise` animates
                transform with fill-mode both, so Chromium keeps this element
                composited after the intro and it becomes a stacking context.
                That traps the autocomplete's z-40 inside this wrapper, and the
                next `.rise` sibling below (the trending chips) then paints over
                the open dropdown and swallows clicks on the top results.
                Positioning this wrapper above its siblings is what lets the
                dropdown win. Removing it silently breaks selecting a title. */}
            <div className="rise relative z-30 mt-9 max-w-2xl" style={{ animationDelay: "460ms" }}>
              <SearchBar market={market} variant="hero" />
            </div>

            <div className="rise" style={{ animationDelay: "560ms" }}>
              <Suspense fallback={<div className="mt-7 h-7 w-64 skeleton" />}>
                <TrendingChips />
              </Suspense>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[var(--color-bg)] to-transparent" />
      </section>

      <TextMarquee />

      {/* ------------------------------ RAILS ----------------------------- */}
      <section className="mx-auto max-w-[1440px] space-y-16 px-5 pb-10 sm:px-8">
        {movies.length > 0 && (
          <Reveal>
            <Rail label={`Now trending — ${market}`} caption="Films people are watching">
              {movies.map((t, i) => (
                <div key={t.id} className="w-[42vw] shrink-0 snap-start sm:w-[200px]">
                  <TitleCard title={t} rank={i} />
                </div>
              ))}
            </Rail>
          </Reveal>
        )}
        {shows.length > 0 && (
          <Reveal>
            <Rail label={`Now trending — ${market}`} caption="Series on the rise">
              {shows.map((t, i) => (
                <div key={t.id} className="w-[42vw] shrink-0 snap-start sm:w-[200px]">
                  <TitleCard title={t} rank={i} />
                </div>
              ))}
            </Rail>
          </Reveal>
        )}
      </section>

      {/* --------------------------- MARKET INDEX -------------------------- */}
      <section id="markets" className="mx-auto max-w-[1440px] px-5 py-20 sm:px-8">
        <Reveal>
          <div className="label label--accent mb-3 flex items-center gap-2">
            <span className="inline-block h-px w-6 bg-[var(--color-accent)]" />
            Coverage index
          </div>
          <h2 className="display max-w-3xl text-3xl sm:text-5xl">
            {MARKET_LIST.length} markets, <span className="serif-accent text-[var(--color-accent)]">one query.</span>
          </h2>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-[var(--color-muted)]">
            For every title we resolve the full locale graph, then fetch provider-level
            offers for each market in a single request. Pick your home market in the header;
            compare the rest on any title page.
          </p>
        </Reveal>
        <Reveal delay={120}>
          <div className="mt-10 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-line)] sm:grid-cols-6 lg:grid-cols-9">
            {MARKET_LIST.map((m) => (
              <div key={m.code} className="group bg-[var(--color-bg-2)] px-3 py-4 text-center transition-colors hover:bg-[var(--color-panel-2)]">
                <div className="font-mono text-[11px] tracking-[0.2em] text-[var(--color-accent)]">{m.code}</div>
                <div className="mt-1 truncate text-[11px] text-[var(--color-muted)] transition-colors group-hover:text-[var(--color-ink)]">
                  {m.name}
                </div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ----------------------------- METHOD ------------------------------ */}
      <section className="border-t border-[var(--color-line)] bg-[var(--color-bg-2)]">
        <div className="mx-auto max-w-[1440px] px-5 py-20 sm:px-8">
          <Reveal>
            <div className="label label--accent mb-3 flex items-center gap-2">
              <span className="inline-block h-px w-6 bg-[var(--color-accent)]" />
              Method
            </div>
            <h2 className="display text-3xl sm:text-5xl">Three steps to the truth</h2>
          </Reveal>
          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-[var(--color-line)] bg-[var(--color-line)] md:grid-cols-3">
            {[
              {
                n: "01",
                h: "Search the catalogue",
                p: "Type any film or series. We query the JustWatch catalogue in your market and match instantly as you type.",
              },
              {
                n: "02",
                h: "Resolve every locale",
                p: "Each title maps to a locale graph. We unfold it into up to 54 national markets — automatically.",
              },
              {
                n: "03",
                h: "Compare the offers",
                p: "Subscription, free, rent or buy: every provider, quality tier and price, normalised to USD for honest comparison.",
              },
            ].map((s, i) => (
              <Reveal key={s.n} delay={i * 110} className="group bg-[var(--color-bg)] p-8 transition-colors hover:bg-[var(--color-panel)] sm:p-10">
                <div className="outline-text display text-6xl transition-all duration-500 group-hover:text-[var(--color-accent)] group-hover:[-webkit-text-stroke:0px] sm:text-7xl">
                  {s.n}
                </div>
                <h3 className="mt-6 text-lg font-semibold">{s.h}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">{s.p}</p>
              </Reveal>
            ))}
          </div>

          <Reveal delay={160}>
            <div className="mt-14 flex flex-col items-start justify-between gap-6 rounded-2xl border border-[var(--color-line-strong)] bg-[linear-gradient(120deg,rgba(67,101,79,0.08),transparent_55%)] p-8 sm:flex-row sm:items-center sm:p-10">
              <div>
                <div className="display text-2xl sm:text-3xl">Run a query against the planet.</div>
                <div className="serif-accent mt-1 text-lg text-[var(--color-muted)]">It takes about two seconds.</div>
              </div>
              <Link
                href="/search?q=inception"
                className="group inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-6 py-3.5 font-mono text-[12px] font-medium uppercase tracking-[0.16em] text-[var(--color-on-accent)] transition-all hover:scale-[1.03] hover:bg-[var(--color-accent-deep)] active:scale-[0.98]"
              >
                Try “Inception”
                <ArrowUpRight size={15} strokeWidth={2.2} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </div>
  );
}

import Link from "next/link";
import { Bookmark, Compass } from "lucide-react";
import { MarketSelect } from "./market-select";

function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" stroke="var(--color-accent)" strokeWidth="1.4" />
      <circle cx="12" cy="12" r="5.5" stroke="var(--color-accent)" strokeWidth="1.1" opacity="0.55" />
      <path d="M10.2 9.4v5.2c0 .5.56.8.98.52l3.9-2.6a.6.6 0 0 0 0-1.04l-3.9-2.6a.62.62 0 0 0-.98.52Z" fill="var(--color-accent)" />
    </svg>
  );
}

export function SiteHeader({ market }: { market: string }) {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-line)] bg-[rgba(244,241,234,0.82)] backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-5 px-5 sm:px-8">
        <Link href="/" className="group flex items-center gap-2.5">
          <LogoMark />
          <span className="display text-[15px] tracking-[0.08em]">
            JustWatch <span className="text-[var(--color-accent)]">Search</span>
          </span>
        </Link>

        <nav className="ml-4 hidden items-center gap-6 md:flex">
          <Link href="/search?q=a" className="label link-underline transition-colors hover:text-[var(--color-ink)]">
            Index
          </Link>
          <Link href="/watchlist" className="label link-underline flex items-center gap-1.5 transition-colors hover:text-[var(--color-ink)]">
            <Bookmark size={11} strokeWidth={1.8} />
            Watchlist
          </Link>
          <a href="/#markets" className="label link-underline hidden items-center gap-1.5 transition-colors hover:text-[var(--color-ink)] lg:flex">
            <Compass size={11} strokeWidth={1.8} />
            54 Markets
          </a>
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="label hidden xl:block">Market</span>
          <MarketSelect current={market} />
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="relative border-t border-[var(--color-line)]">
      <div className="mx-auto max-w-[1440px] px-5 py-14 sm:px-8">
        <div className="flex flex-col gap-10 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <LogoMark size={18} />
              <span className="display text-sm tracking-[0.08em]">
                JustWatch <span className="text-[var(--color-accent)]">Search</span>
              </span>
            </div>
            <p className="serif-accent mt-4 max-w-md text-lg leading-snug text-[var(--color-muted)]">
              Every stream, rental and purchase. Every country. One search.
            </p>
          </div>
          <div className="label max-w-md leading-relaxed">
            Availability &amp; pricing data via the public JustWatch API. Not affiliated with
            or endorsed by JustWatch GmbH. Prices are normalised to USD using daily
            exchange rates and may differ at checkout.
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-3 border-t border-[var(--color-line)] pt-6 text-[var(--color-faint)] sm:flex-row sm:items-center sm:justify-between">
          <span className="label">JustWatch Search — a streaming availability engine</span>
          <span className="label tabular">54 markets · USD-normalised · updated hourly</span>
        </div>
      </div>
    </footer>
  );
}

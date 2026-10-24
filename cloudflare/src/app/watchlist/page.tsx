import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Bookmark, Compass } from "lucide-react";
import { readAnonId } from "@/lib/anon";
import { listWatchlist } from "@/lib/store";
import { kindLabel } from "@/lib/format";
import { WatchlistButton } from "@/components/watchlist-button";

export const metadata: Metadata = { title: "Watchlist" };
export const dynamic = "force-dynamic";

export default async function WatchlistPage() {
  const anonId = await readAnonId();
  const items = anonId ? await listWatchlist(anonId) : [];

  return (
    <div className="mx-auto max-w-[1440px] px-5 pb-24 pt-12 sm:px-8">
      <div className="mb-10 border-b border-[var(--color-line)] pb-8">
        <div className="label label--accent mb-3 flex items-center gap-2">
          <span className="inline-block h-px w-6 bg-[var(--color-accent)]" />
          <Bookmark size={11} strokeWidth={2} />
          Your shelf
        </div>
        <h1 className="display text-4xl sm:text-6xl">Watchlist</h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-[var(--color-muted)]">
          Titles you bookmarked are stored against this browser — no account, no tracking
          beyond an anonymous cookie.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="hairline-card grid place-items-center px-8 py-24 text-center">
          <Bookmark size={28} strokeWidth={1.4} className="text-[var(--color-faint)]" />
          <p className="display mt-6 text-2xl sm:text-3xl">Nothing saved yet</p>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-[var(--color-muted)]">
            Open any title and hit “Add to watchlist” — it will land here, ready for
            a worldwide price check.
          </p>
          <Link
            href="/"
            className="group mt-8 inline-flex items-center gap-2 rounded-full bg-[var(--color-accent)] px-6 py-3.5 font-mono text-[12px] font-medium uppercase tracking-[0.16em] text-[var(--color-on-accent)] transition-all hover:scale-[1.03] hover:bg-[var(--color-accent-deep)]"
          >
            <Compass size={14} strokeWidth={2} />
            Start searching
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {items.map((item) => (
            <div key={item.nodeId} className="group relative">
              <Link href={`/title/${item.nodeId}`} className="block">
                <div className="poster-card aspect-[2/3]">
                  {item.posterUrl ? (
                    <Image
                      src={item.posterUrl}
                      alt={item.title}
                      fill
                      sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 220px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 grid place-items-center p-4">
                      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-faint)]">
                        No artwork
                      </span>
                    </div>
                  )}
                </div>
                <div className="mt-2.5 flex items-start justify-between gap-2 px-0.5">
                  <span className="truncate text-[13px] font-medium leading-snug transition-colors group-hover:text-[var(--color-accent)]">
                    {item.title}
                  </span>
                  <span className="label mt-0.5 shrink-0 text-[9px] text-[var(--color-faint)]">
                    {item.year ?? kindLabel(item.objectType)}
                  </span>
                </div>
              </Link>
              <div className="absolute right-2 top-2">
                <WatchlistButton
                  nodeId={item.nodeId}
                  initialSaved
                  compact
                  payload={{
                    id: item.nodeId,
                    objectType: item.objectType,
                    title: item.title,
                    year: item.year,
                    poster: item.posterUrl,
                    fullPath: item.fullPath ?? "",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

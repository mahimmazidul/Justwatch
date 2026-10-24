import Image from "next/image";
import type { JWTitleSummary } from "@/lib/justwatch";

export function TextMarquee() {
  const items = [
    "Subscription", "Rental", "Purchase", "ads-supported", "54 markets",
    "usd-normalised pricing", "1080p · 4k · sd", "one search, everywhere",
  ];
  const row = [...items, ...items];
  return (
    <div className="marquee-paused overflow-hidden border-y border-[var(--color-line)] bg-[var(--color-bg-2)] py-3.5" aria-hidden="true">
      <div className="marquee-track flex w-max items-center gap-8" style={{ "--marquee-speed": "24s" } as React.CSSProperties}>
        {row.map((item, i) => (
          <span key={i} className="flex items-center gap-8 whitespace-nowrap">
            {i % 2 === 0 ? (
              <span className="label">{item}</span>
            ) : (
              <span className="serif-accent text-[15px] leading-none text-[var(--color-accent)]">{item}</span>
            )}
            <span className="inline-block h-1 w-1 rounded-full bg-[var(--color-faint)]" />
          </span>
        ))}
      </div>
    </div>
  );
}

/** Dimmed poster strips drifting behind the hero — pure CSS marquee. */
export function PosterMarquee({ titles, reverse = false }: { titles: JWTitleSummary[]; reverse?: boolean }) {
  const withPosters = titles.filter((t) => t.poster);
  const row = [...withPosters, ...withPosters];
  return (
    <div className="overflow-hidden" aria-hidden="true">
      <div
        className={`marquee-track flex w-max gap-5 ${reverse ? "marquee-track--reverse" : ""}`}
        style={{ "--marquee-speed": "38s" } as React.CSSProperties}
      >
        {row.map((t, i) => (
          <div
            key={`${t.id}-${i}`}
            className="relative aspect-[2/3] w-[120px] shrink-0 overflow-hidden rounded-lg border border-[var(--color-line)] sm:w-[150px]"
          >
            <Image
              src={t.poster!}
              alt=""
              fill
              sizes="150px"
              className="object-cover"
              loading="lazy"
            />
          </div>
        ))}
      </div>
    </div>
  );
}

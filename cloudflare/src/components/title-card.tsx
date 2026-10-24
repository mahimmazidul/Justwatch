import Image from "next/image";
import Link from "next/link";
import { Film, Tv } from "lucide-react";
import type { JWTitleSummary } from "@/lib/justwatch";
import { fmtRuntime, kindLabel } from "@/lib/format";

interface TitleCardProps {
  title: JWTitleSummary;
  rank?: number;
  eager?: boolean;
}

export function TitleCard({ title, rank, eager }: TitleCardProps) {
  const runtime = fmtRuntime(title.runtimeMinutes);
  return (
    <Link href={`/title/${title.id}`} className="group block">
      <div className="poster-card aspect-[2/3]">
        {title.poster ? (
          <Image
            src={title.poster}
            alt={title.title}
            fill
            sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 220px"
            className="object-cover"
            loading={eager ? "eager" : "lazy"}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center p-4 text-center">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[var(--color-faint)]">
              No artwork
            </span>
          </div>
        )}

        {typeof rank === "number" && rank < 9 && (
          <span className="outline-text pointer-events-none absolute -left-1.5 -top-4 z-10 font-sans text-[64px] font-bold leading-none md:text-[72px]">
            {String(rank + 1).padStart(2, "0")}
          </span>
        )}

        <div className="card-veil absolute inset-x-0 bottom-0 bg-gradient-to-t from-[rgba(24,21,16,0.92)] via-[rgba(24,21,16,0.5)] to-transparent p-3 pt-10">
          <div className="flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.14em] text-[#f4f1ea]">
            {title.objectType === "SHOW" ? (
              <Tv size={10} strokeWidth={2} className="text-[#a9c7b4]" />
            ) : (
              <Film size={10} strokeWidth={2} className="text-[#a9c7b4]" />
            )}
            <span>{title.year ?? "—"}</span>
            {runtime && (
              <>
                <span className="text-[rgba(244,241,234,0.45)]">/</span>
                <span>{runtime}</span>
              </>
            )}
          </div>
          {title.genres.length > 0 && (
            <div className="mt-1 truncate text-[11px] text-[rgba(244,241,234,0.72)]">
              {title.genres.slice(0, 3).join(" · ")}
            </div>
          )}
        </div>
      </div>
      <div className="mt-2.5 flex items-start justify-between gap-2 px-0.5">
        <span className="truncate text-[13px] font-medium leading-snug text-[var(--color-ink)] transition-colors group-hover:text-[var(--color-accent)]">
          {title.title}
        </span>
        <span className="label mt-0.5 shrink-0 text-[9px] text-[var(--color-faint)]">
          {kindLabel(title.objectType)}
        </span>
      </div>
    </Link>
  );
}

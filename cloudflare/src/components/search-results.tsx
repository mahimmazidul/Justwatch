"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowUpDown, SearchX } from "lucide-react";
import type { JWTitleSummary } from "@/lib/justwatch";
import { TitleCard } from "./title-card";

type SortKey = "relevance" | "newest" | "oldest" | "title";
type TypeKey = "all" | "movie" | "show";

interface SearchResultsProps {
  results: JWTitleSummary[];
  query: string;
  market: string;
  activeType: TypeKey;
}

const SORTS: { key: SortKey; label: string }[] = [
  { key: "relevance", label: "Relevance" },
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "title", label: "Title A–Z" },
];

export function SearchResults({ results, query, market, activeType }: SearchResultsProps) {
  const [sort, setSort] = useState<SortKey>("relevance");

  const sorted = useMemo(() => {
    const list = [...results];
    switch (sort) {
      case "newest":
        return list.sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
      case "oldest":
        return list.sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999));
      case "title":
        return list.sort((a, b) => a.title.localeCompare(b.title));
      default:
        return list;
    }
  }, [results, sort]);

  const typeHref = (t: TypeKey) =>
    `/search?q=${encodeURIComponent(query)}${t === "all" ? "" : `&type=${t}`}`;

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-center gap-3">
        <div className="mr-auto flex items-center gap-2">
          {(["all", "movie", "show"] as TypeKey[]).map((t) => (
            <Link key={t} href={typeHref(t)} className="chip" data-active={activeType === t} scroll={false}>
              {t === "all" ? "All" : t === "movie" ? "Films" : "Series"}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <ArrowUpDown size={12} className="text-[var(--color-faint)]" strokeWidth={1.8} />
          <div className="flex gap-1.5">
            {SORTS.map((s) => (
              <button key={s.key} type="button" className="chip" data-active={sort === s.key} onClick={() => setSort(s.key)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {sorted.length > 0 ? (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {sorted.map((t, i) => (
            <TitleCard key={t.id} title={t} eager={i < 6} />
          ))}
        </div>
      ) : (
        <div className="hairline-card grid place-items-center px-8 py-24 text-center">
          <SearchX size={28} strokeWidth={1.4} className="text-[var(--color-faint)]" />
          <p className="display mt-6 text-2xl sm:text-3xl">Nothing in the {market} catalogue</p>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-[var(--color-muted)]">
            Try another spelling, or switch your market in the header — catalogues differ
            from country to country.
          </p>
        </div>
      )}
    </div>
  );
}

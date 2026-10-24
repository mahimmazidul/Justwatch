"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowRight, CornerDownLeft, Loader2, Search, Slash } from "lucide-react";
import type { JWTitleSummary } from "@/lib/justwatch";
import { kindLabel } from "@/lib/format";

interface SearchBarProps {
  market: string;
  variant?: "hero" | "compact";
  initialQuery?: string;
  placeholder?: string;
}

export function SearchBar({ market, variant = "hero", initialQuery = "", placeholder }: SearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<JWTitleSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /* "/" focuses the search from anywhere */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* close on outside click */
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const fetchSuggestions = useCallback(
    async (q: string) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setLoading(true);
      try {
        const res = await fetch(`/api/jw/search?q=${encodeURIComponent(q)}&country=${market}&limit=7`, {
          signal: ctrl.signal,
        });
        const json = (await res.json()) as { results: JWTitleSummary[] };
        setResults(json.results ?? []);
        setOpen(true);
        setActive(-1);
      } catch {
        /* aborted */
      } finally {
        setLoading(false);
      }
    },
    [market]
  );

  const onChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 180);
  };

  const goToTitle = (t: JWTitleSummary) => {
    setOpen(false);
    router.push(`/title/${t.id}`);
  };

  const submit = () => {
    const q = query.trim();
    if (!q) return;
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" && results.length) {
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp" && results.length) {
      e.preventDefault();
      setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && results[active]) goToTitle(results[active]);
      else submit();
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const hero = variant === "hero";

  return (
    <div ref={rootRef} className={`relative w-full ${hero ? "" : "max-w-xl"}`}>
      <div
        className={`input-shell flex items-center gap-3 rounded-2xl ${
          hero ? "px-5 py-4 sm:px-6 sm:py-5" : "px-4 py-2.5"
        }`}
      >
        {loading ? (
          <Loader2 size={hero ? 20 : 16} className="shrink-0 animate-spin text-[var(--color-accent)]" />
        ) : (
          <Search size={hero ? 20 : 16} className="shrink-0 text-[var(--color-muted)]" strokeWidth={1.8} />
        )}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => results.length && setOpen(true)}
          placeholder={placeholder ?? "Search any film or series…"}
          aria-label="Search titles"
          autoComplete="off"
          spellCheck={false}
          className={`w-full bg-transparent outline-none placeholder:text-[var(--color-faint)] ${
            hero ? "text-lg font-medium sm:text-xl" : "text-sm"
          }`}
        />
        {hero ? (
          <kbd className="hidden shrink-0 items-center gap-1.5 rounded-md border border-[var(--color-line-strong)] px-2 py-1 font-mono text-[10px] tracking-[0.1em] text-[var(--color-muted)] sm:flex">
            <Slash size={10} strokeWidth={2} /> TO SEARCH
          </kbd>
        ) : (
          <button
            type="button"
            onClick={submit}
            aria-label="Search"
            className="shrink-0 text-[var(--color-muted)] transition-colors hover:text-[var(--color-accent)]"
          >
            <CornerDownLeft size={15} strokeWidth={1.8} />
          </button>
        )}
      </div>

      {open && results.length > 0 && (
        <div className="autocomplete-shadow absolute inset-x-0 top-[calc(100%+10px)] z-40 overflow-hidden rounded-2xl border border-[var(--color-line-strong)] bg-[rgba(250,248,243,0.98)] backdrop-blur-xl">
          <ul>
            {results.map((t, i) => (
              <li key={t.id}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onClick={() => goToTitle(t)}
                  className={`flex w-full items-center gap-3.5 px-4 py-2.5 text-left transition-colors ${
                    active === i ? "bg-[var(--color-panel-2)]" : ""
                  }`}
                >
                  <span className="relative h-12 w-[34px] shrink-0 overflow-hidden rounded-[4px] border border-[var(--color-line)] bg-[var(--color-panel)]">
                    {t.poster ? (
                      <Image src={t.poster} alt="" fill sizes="34px" className="object-cover" />
                    ) : (
                      <span className="absolute inset-0 grid place-items-center font-mono text-[8px] text-[var(--color-faint)]">N/A</span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-medium leading-tight">{t.title}</span>
                    <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--color-faint)]">
                      {kindLabel(t.objectType)} · {t.year ?? "—"}
                      {t.genres[0] ? ` · ${t.genres[0]}` : ""}
                    </span>
                  </span>
                  <ArrowRight
                    size={14}
                    strokeWidth={1.8}
                    className={`shrink-0 transition-all ${active === i ? "translate-x-0 text-[var(--color-accent)] opacity-100" : "-translate-x-1 opacity-0"}`}
                  />
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={submit}
            className="flex w-full items-center justify-between border-t border-[var(--color-line)] px-4 py-3 text-left transition-colors hover:bg-[var(--color-panel-2)]"
          >
            <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--color-muted)]">
              All results for “{query.trim()}”
            </span>
            <ArrowRight size={13} className="text-[var(--color-accent)]" />
          </button>
        </div>
      )}
    </div>
  );
}

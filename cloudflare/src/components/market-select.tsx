"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Globe2 } from "lucide-react";
import { MARKET_LIST } from "@/lib/markets";

export function MarketSelect({ current }: { current: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return MARKET_LIST;
    return MARKET_LIST.filter(
      (m) => m.name.toLowerCase().includes(f) || m.code.toLowerCase().includes(f)
    );
  }, [filter]);

  const choose = (code: string) => {
    // The market preference is persisted in a cookie so the server can read it
    // on the next render (readMarket() in src/lib/anon.ts). Assigning to
    // document.cookie is a deliberate side effect inside an event handler, not
    // a mutation of anything React owns.
    // eslint-disable-next-line react-hooks/immutability
    document.cookie = `ss_market=${code};path=/;max-age=${60 * 60 * 24 * 365};samesite=lax`;
    setOpen(false);
    setFilter("");
    router.refresh();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-full border border-[var(--color-line-strong)] px-3.5 py-1.5 font-mono text-[11px] tracking-[0.14em] text-[var(--color-ink)] transition-colors hover:border-[var(--color-accent)]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Globe2 size={12} strokeWidth={1.8} className="text-[var(--color-accent)]" />
        {current}
        <ChevronDown size={12} strokeWidth={2} className={`text-[var(--color-muted)] transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="autocomplete-shadow absolute right-0 top-[calc(100%+10px)] z-50 w-64 overflow-hidden rounded-xl border border-[var(--color-line-strong)] bg-[var(--color-panel)]">
          <div className="border-b border-[var(--color-line)] p-2.5">
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter markets…"
              className="w-full bg-transparent px-1.5 py-1 font-mono text-xs tracking-wide text-[var(--color-ink)] outline-none placeholder:text-[var(--color-faint)]"
            />
          </div>
          <ul role="listbox" className="no-scrollbar max-h-72 overflow-y-auto p-1.5">
            {filtered.map((m) => (
              <li key={m.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={m.code === current}
                  onClick={() => choose(m.code)}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-[13px] text-[var(--color-muted)] transition-colors hover:bg-[var(--color-panel-2)] hover:text-[var(--color-ink)]"
                >
                  <span className="truncate">{m.name}</span>
                  <span className="ml-3 flex items-center gap-2 font-mono text-[10px] tracking-[0.14em] text-[var(--color-faint)]">
                    {m.code}
                    {m.code === current && <Check size={11} className="text-[var(--color-accent)]" />}
                  </span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-4 font-mono text-xs text-[var(--color-faint)]">No market matches.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

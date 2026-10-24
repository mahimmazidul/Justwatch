"use client";

import { useRef } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { ReactNode } from "react";

interface RailProps {
  label: string;
  caption?: string;
  children: ReactNode;
}

export function Rail({ label, caption, children }: RailProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollBy = (dir: 1 | -1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: "smooth" });
  };

  return (
    <section className="relative">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <div className="label label--accent mb-2 flex items-center gap-2">
            <span className="inline-block h-px w-6 bg-[var(--color-accent)]" />
            {label}
          </div>
          {caption && <h2 className="display text-2xl sm:text-3xl">{caption}</h2>}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => scrollBy(-1)}
            aria-label="Scroll left"
            className="grid h-9 w-9 place-items-center rounded-full border border-[var(--color-line-strong)] text-[var(--color-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            <ArrowLeft size={14} strokeWidth={1.8} />
          </button>
          <button
            type="button"
            onClick={() => scrollBy(1)}
            aria-label="Scroll right"
            className="grid h-9 w-9 place-items-center rounded-full border border-[var(--color-line-strong)] text-[var(--color-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            <ArrowRight size={14} strokeWidth={1.8} />
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="no-scrollbar -mx-5 flex snap-x gap-4 overflow-x-auto px-5 pb-2 sm:-mx-8 sm:px-8"
      >
        {children}
      </div>
    </section>
  );
}

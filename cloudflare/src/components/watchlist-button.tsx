"use client";

import { useState, useTransition } from "react";
import { Bookmark, BookmarkCheck, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface WatchlistButtonProps {
  nodeId: string;
  payload: {
    id: string;
    objectType: string;
    title: string;
    year: number | null;
    poster: string | null;
    fullPath: string;
  };
  initialSaved: boolean;
  compact?: boolean;
}

export function WatchlistButton({ nodeId, payload, initialSaved, compact }: WatchlistButtonProps) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [pending, startTransition] = useTransition();
  // Set when the save is rejected, so the optimistic flip is explained instead
  // of silently undoing itself. 503 is what the API returns when the D1
  // database is not configured, which is a setup state, not a transient error.
  const [error, setError] = useState<string | null>(null);

  const toggle = () => {
    const next = !saved;
    setSaved(next); // optimistic
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(
          next ? "/api/watchlist" : `/api/watchlist?nodeId=${encodeURIComponent(nodeId)}`,
          next
            ? {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
              }
            : { method: "DELETE" }
        );
        if (!res.ok) {
          setSaved(!next);
          setError(
            res.status === 503
              ? "Watchlist storage is not configured"
              : "Could not update your watchlist"
          );
        }
      } catch {
        setSaved(!next);
        setError("Could not reach the server");
      }
      router.refresh();
    });
  };

  const Icon = pending ? Loader2 : saved ? BookmarkCheck : Bookmark;

  if (compact) {
    // Icon-only: the explanation goes in the accessible name and the tooltip,
    // because there is no room for a text line here.
    return (
      <button
        type="button"
        onClick={toggle}
        title={error ?? undefined}
        aria-label={error ?? (saved ? "Remove from watchlist" : "Add to watchlist")}
        className={`grid h-9 w-9 place-items-center rounded-full border transition-colors ${
          saved
            ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-on-accent)]"
            : "border-[var(--color-line-strong)] bg-[rgba(250,248,243,0.8)] text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
        }`}
      >
        <Icon size={15} strokeWidth={1.9} className={pending ? "animate-spin" : ""} />
      </button>
    );
  }

  return (
    <span className="inline-flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={toggle}
        className={`inline-flex items-center gap-2.5 rounded-full border px-5 py-3 font-mono text-[11px] uppercase tracking-[0.16em] transition-all ${
          saved
            ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-on-accent)]"
            : "border-[var(--color-line-strong)] bg-[rgba(250,248,243,0.7)] text-[var(--color-ink)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
        }`}
      >
        <Icon size={14} strokeWidth={2} className={pending ? "animate-spin" : ""} />
        {saved ? "In your watchlist" : "Add to watchlist"}
      </button>
      {error && (
        <span role="status" className="label text-[var(--color-faint)]">
          {error}
        </span>
      )}
    </span>
  );
}

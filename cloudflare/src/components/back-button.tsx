"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export function BackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="label link-underline inline-flex items-center gap-2 transition-colors hover:text-[var(--color-ink)]"
    >
      <ArrowLeft size={12} strokeWidth={2} />
      Back
    </button>
  );
}

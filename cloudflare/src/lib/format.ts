export function fmtRuntime(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function fmtUsd(amount: number | null | undefined): string | null {
  if (amount == null) return null;
  return `$${amount.toFixed(2)}`;
}

export function fmtLocal(
  amount: number | null | undefined,
  currency: string | null | undefined,
  fallbackLabel: string | null | undefined
): string | null {
  if (fallbackLabel) return fallbackLabel;
  if (amount == null || !currency) return null;
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

export function kindLabel(objectType: string): string {
  return objectType === "MOVIE" ? "Film" : objectType === "SHOW" ? "Series" : "Title";
}

export const OFFER_TYPE_LABEL: Record<string, string> = {
  stream: "Subscription",
  free: "Free",
  rent: "Rent",
  buy: "Buy",
  cinema: "Cinema",
};

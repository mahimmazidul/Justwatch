/**
 * USD-normalisation for offer prices, same approach as the original app:
 * open.er-api.com gives USD-based rates, price/rate = USD price.
 * Rates are cached 12h; a static fallback keeps the app usable offline.
 */

const FX_ENDPOINT = "https://open.er-api.com/v6/latest/USD";

// Rough static fallback (updated occasionally) for when the FX API is down.
const FALLBACK_RATES: Record<string, number> = {
  USD: 1, EUR: 0.92, GBP: 0.79, CAD: 1.36, AUD: 1.52, NZD: 1.66,
  JPY: 149, KRW: 1350, INR: 84, BRL: 5.1, MXN: 17.2, ARS: 990,
  CLP: 940, COP: 4200, PEN: 3.7, CRC: 510, BOB: 6.9, VES: 36, GTQ: 7.7, ECV: 25000,
  CHF: 0.88, SEK: 10.4, NOK: 10.8, DKK: 6.85, PLN: 3.95, CZK: 23.2,
  HUF: 360, RON: 4.55, BGN: 1.8, HRK: 0, GEL: 2.7, RUB: 92, TRY: 34,
  ZAR: 17.8, EGP: 48, SAR: 3.75, AED: 3.67, ILS: 3.7, PKR: 278,
  THB: 34, MYR: 4.4, SGD: 1.32, IDR: 15500, PHP: 56, TWD: 31.5, HKD: 7.8, CNY: 7.1,
};

export interface FxRates {
  rates: Record<string, number>;
  timestamp: string | null;
  degraded: boolean;
}

let cached: FxRates | null = null;
let cachedAt = 0;
const TTL_MS = 12 * 60 * 60 * 1000;

export async function getUsdRates(): Promise<FxRates> {
  const now = Date.now();
  if (cached && now - cachedAt < TTL_MS) return cached;
  try {
    const res = await fetch(FX_ENDPOINT, { next: { revalidate: 43200 } });
    if (!res.ok) throw new Error(`fx ${res.status}`);
    const json = (await res.json()) as {
      result?: string;
      rates?: Record<string, number>;
      time_last_update_utc?: string;
    };
    if (!json.rates) throw new Error("fx payload");
    cached = {
      rates: { ...FALLBACK_RATES, ...json.rates },
      timestamp: json.time_last_update_utc ?? null,
      degraded: false,
    };
  } catch {
    cached = { rates: FALLBACK_RATES, timestamp: null, degraded: true };
  }
  cachedAt = now;
  return cached;
}

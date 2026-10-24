import { countryName } from "./justwatch";

/**
 * Every market JustWatch exposed for titles at build time (54, discovered
 * via /content/urls href_lang_tags). Used for the market picker and the
 * coverage index.
 */
export const MARKETS: string[] = [
  "AE", "AR", "AT", "AU", "BE", "BG", "BO", "BR", "CA", "CH", "CL", "CO",
  "CR", "CZ", "DE", "DK", "EC", "EG", "ES", "FI", "FR", "GB", "GR", "GT",
  "HR", "HU", "ID", "IE", "IN", "IT", "JP", "KR", "MX", "MY", "NL", "NO",
  "NZ", "PE", "PH", "PK", "PL", "PT", "RO", "RU", "SA", "SE", "SG", "SK",
  "TH", "TR", "TW", "US", "VE", "ZA",
];

export interface Market {
  code: string;
  name: string;
}

export const MARKET_LIST: Market[] = MARKETS.map((code) => ({
  code,
  name: countryName(code),
})).sort((a, b) => a.name.localeCompare(b.name));

export function isValidMarket(code: string): boolean {
  return MARKETS.includes(code.toUpperCase());
}

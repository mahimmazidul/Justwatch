/**
 * JustWatch API client.
 *
 * Server-side port of the original Blazor app's JustWatch integration:
 * - Search (popularTitles with a TitleFilter)
 * - Title node details (GetTitleNode)
 * - Locale discovery per title (/content/urls -> href_lang_tags)
 * - Cross-country offers (one GraphQL query, one alias per market)
 *
 * JustWatch blocks browser CORS, so all of this runs server-side.
 */

const GQL_ENDPOINT = "https://apis.justwatch.com/graphql";
const URLS_ENDPOINT = "https://apis.justwatch.com/content/urls";
export const JW_IMAGE_BASE = "https://images.justwatch.com";
const JW_WEB_BASE = "https://www.justwatch.com";

export const DEFAULT_MARKET = "US";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type JWObjectType = "MOVIE" | "SHOW" | string;

export interface JWTitleSummary {
  id: string;
  objectId: number;
  objectType: JWObjectType;
  title: string;
  fullPath: string;
  year: number | null;
  releaseDate: string | null;
  runtimeMinutes: number | null;
  description: string | null;
  genres: string[];
  genreCodes: string[];
  imdbId: string | null;
  tmdbId: string | null;
  poster: string | null;
  backdrop: string | null;
}

export type OfferCategory = "stream" | "free" | "rent" | "buy" | "cinema";

export interface JWOffer {
  id: string;
  country: string;
  monetization: string;
  category: OfferCategory;
  presentation: string;
  priceLocal: number | null;
  currency: string | null;
  priceLabel: string | null;
  priceUsd: number | null;
  elementCount: number;
  url: string | null;
  packageId: number;
  packageName: string;
  packageSlug: string;
  packageIcon: string | null;
}

export interface JWCountryOffers {
  country: string;
  countryName: string;
  offers: JWOffer[];
  counts: Record<OfferCategory, number>;
}

export interface JWOfferBundle {
  marketCount: number;
  offerCount: number;
  countries: JWCountryOffers[];
  fx: { base: "USD"; timestamp: string | null; degraded: boolean };
  best: {
    stream: { country: string; packageName: string } | null;
    rent: { country: string; priceUsd: number; priceLocal: number | null; currency: string | null; packageName: string } | null;
    buy: { country: string; priceUsd: number; priceLocal: number | null; currency: string | null; packageName: string } | null;
  };
}

/* ------------------------------------------------------------------ */
/* GraphQL documents                                                   */
/* ------------------------------------------------------------------ */

const SEARCH_QUERY = /* GraphQL */ `
  query GetSearchTitles(
    $searchTitlesFilter: TitleFilter!
    $country: Country!
    $language: Language!
    $first: Int!
    $formatPoster: ImageFormat
    $profile: PosterProfile
    $backdropProfile: BackdropProfile
  ) {
    popularTitles(
      country: $country
      filter: $searchTitlesFilter
      first: $first
      sortBy: POPULAR
      sortRandomSeed: 0
    ) {
      edges {
        node {
          id
          objectId
          objectType
          content(country: $country, language: $language) {
            title
            fullPath
            originalReleaseYear
            originalReleaseDate
            runtime
            shortDescription
            genres { shortName }
            externalIds { imdbId tmdbId }
            posterUrl(profile: $profile, format: $formatPoster)
            backdrops(profile: $backdropProfile, format: $formatPoster) { backdropUrl }
          }
        }
      }
    }
  }
`;

const TITLE_NODE_QUERY = /* GraphQL */ `
  query GetTitleNode(
    $nodeId: ID!
    $language: Language!
    $country: Country!
    $formatPoster: ImageFormat
    $profile: PosterProfile
    $backdropProfile: BackdropProfile
  ) {
    node(id: $nodeId) {
      ... on MovieOrShow {
        id
        objectId
        objectType
        content(country: $country, language: $language) {
          title
          fullPath
          originalReleaseYear
          originalReleaseDate
          runtime
          shortDescription
          genres { shortName }
          externalIds { imdbId tmdbId }
          posterUrl(profile: $profile, format: $formatPoster)
          backdrops(profile: $backdropProfile, format: $formatPoster) { backdropUrl }
        }
      }
    }
  }
`;

function buildOffersQuery(countries: string[]): string {
  const aliases = countries
    .map(
      (c) =>
        `${c.toLowerCase()}: offers(country: ${c}, platform: $platform, filter: $filterBuy) { ...TitleOffer }`
    )
    .join("\n");
  return /* GraphQL */ `
    query GetTitleOffers($nodeId: ID!, $language: Language!, $filterBuy: OfferFilter!, $platform: Platform! = WEB) {
      node(id: $nodeId) {
        ... on MovieOrShowOrSeasonOrEpisode {
          ${aliases}
        }
      }
    }
    fragment TitleOffer on Offer {
      id
      presentationType
      monetizationType
      retailPrice(language: $language)
      retailPriceValue
      currency
      type
      package { id packageId clearName technicalName icon(profile: S100) }
      standardWebURL
      elementCount
      availableTo
    }
  `;
}

/* ------------------------------------------------------------------ */
/* Raw response shapes (internal)                                      */
/* ------------------------------------------------------------------ */

interface RawContent {
  title?: string | null;
  fullPath?: string | null;
  originalReleaseYear?: number | null;
  originalReleaseDate?: string | null;
  runtime?: number | null;
  shortDescription?: string | null;
  genres?: { shortName?: string | null }[] | null;
  externalIds?: { imdbId?: string | null; tmdbId?: string | null } | null;
  posterUrl?: string | null;
  backdrops?: { backdropUrl?: string | null }[] | null;
}

interface RawNode {
  id: string;
  objectId: number;
  objectType: JWObjectType;
  content?: RawContent | null;
}

interface RawOffer {
  id: string;
  presentationType?: string | null;
  monetizationType?: string | null;
  retailPrice?: string | null;
  retailPriceValue?: number | null;
  currency?: string | null;
  type?: string | null;
  package?: {
    id?: string | null;
    packageId?: number | null;
    clearName?: string | null;
    technicalName?: string | null;
    icon?: string | null;
  } | null;
  standardWebURL?: string | null;
  elementCount?: number | null;
  availableTo?: unknown;
}

/* ------------------------------------------------------------------ */
/* Fetch helpers                                                       */
/* ------------------------------------------------------------------ */

interface GqlOptions {
  revalidate?: number | false;
}

async function gql<T>(
  query: string,
  variables: Record<string, unknown>,
  operationName: string,
  opts: GqlOptions = {}
): Promise<T | null> {
  try {
    const res = await fetch(GQL_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ operationName, query, variables }),
      next: opts.revalidate === false ? undefined : { revalidate: opts.revalidate ?? 300 },
      ...(opts.revalidate === false ? { cache: "no-store" } : {}),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: T; errors?: unknown };
    if (!json.data) return null;
    return json.data;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Normalizers                                                         */
/* ------------------------------------------------------------------ */

export function jwImage(path: string | null | undefined, format = "png"): string | null {
  if (!path) return null;
  const replaced = path.replace("{format}", format);
  if (replaced.startsWith("http")) return replaced;
  return `${JW_IMAGE_BASE}${replaced.startsWith("/") ? "" : "/"}${replaced}`;
}

export function jwWebUrl(fullPath: string | null | undefined): string | null {
  if (!fullPath) return null;
  return `${JW_WEB_BASE}${fullPath.startsWith("/") ? "" : "/"}${fullPath}`;
}

const GENRE_LABELS: Record<string, string> = {
  act: "Action",
  adv: "Adventure",
  ani: "Animation",
  cmy: "Comedy",
  crm: "Crime",
  doc: "Documentary",
  drm: "Drama",
  eur: "European",
  fam: "Family",
  fnt: "Fantasy",
  hst: "History",
  hrr: "Horror",
  msc: "Music",
  mys: "Mystery",
  rma: "Romance",
  scf: "Sci-Fi",
  spt: "Sport",
  trl: "Thriller",
  war: "War",
  wsn: "Western",
  rty: "Reality",
};

export function genreLabel(code: string | null | undefined): string {
  if (!code) return "Other";
  return GENRE_LABELS[code] ?? code.toUpperCase();
}

function normalizeNode(node: RawNode): JWTitleSummary {
  const c = node.content ?? {};
  const genreCodes = (c.genres ?? [])
    .map((g) => g.shortName)
    .filter((g): g is string => Boolean(g));
  return {
    id: node.id,
    objectId: node.objectId,
    objectType: node.objectType,
    title: c.title ?? "Unknown title",
    fullPath: c.fullPath ?? "",
    year: c.originalReleaseYear ?? null,
    releaseDate: c.originalReleaseDate ?? null,
    runtimeMinutes: c.runtime ?? null,
    description: c.shortDescription ?? null,
    genres: genreCodes.map(genreLabel),
    genreCodes,
    imdbId: c.externalIds?.imdbId ?? null,
    tmdbId: c.externalIds?.tmdbId ?? null,
    poster: jwImage(c.posterUrl, "jpg"),
    backdrop: jwImage(c.backdrops?.[0]?.backdropUrl ?? null, "jpg"),
  };
}

const MONETIZATION_CATEGORY: Record<string, OfferCategory> = {
  FLATRATE: "stream",
  FREE: "free",
  ADS: "free",
  RENT: "rent",
  BUY: "buy",
  CINEMA: "cinema",
};

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

export function countryName(code: string): string {
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

function normalizeOffer(
  raw: RawOffer,
  country: string,
  rates: Record<string, number>
): JWOffer {
  const monetization = raw.monetizationType ?? "UNKNOWN";
  const currency = raw.currency ?? null;
  const priceLocal = raw.retailPriceValue ?? null;
  let priceUsd: number | null = null;
  if (priceLocal != null && currency) {
    if (currency === "USD") {
      priceUsd = Math.round(priceLocal * 100) / 100;
    } else {
      const rate = rates[currency];
      if (rate && rate > 0) {
        const converted = priceLocal / rate;
        // Some storefronts (Apple TV, Google Play) price in USD even in
        // non-USD markets, while JustWatch still tags the local currency.
        // A converted price under $0.50 with a plausible USD-looking local
        // number is treated as already-USD rather than as a $0.01 anomaly.
        if (converted < 0.5 && priceLocal >= 1 && priceLocal <= 120) {
          priceUsd = Math.round(priceLocal * 100) / 100;
        } else {
          priceUsd = Math.round(converted * 100) / 100;
        }
      }
    }
  }
  const presentationRaw = (raw.presentationType ?? "").replace(/^_/, "");
  return {
    id: raw.id,
    country,
    monetization,
    category: MONETIZATION_CATEGORY[monetization] ?? "stream",
    presentation: presentationRaw === "" ? "SD" : presentationRaw,
    priceLocal,
    currency,
    priceLabel: raw.retailPrice ?? null,
    priceUsd,
    elementCount: raw.elementCount ?? 0,
    url: raw.standardWebURL ?? null,
    packageId: raw.package?.packageId ?? -1,
    packageName: raw.package?.clearName ?? "Unknown",
    packageSlug: raw.package?.technicalName ?? "",
    packageIcon: jwImage(raw.package?.icon ?? null, "png"),
  };
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export interface SearchOptions {
  country?: string;
  first?: number;
  objectType?: "MOVIE" | "SHOW";
}

export async function searchTitles(query: string, opts: SearchOptions = {}): Promise<JWTitleSummary[]> {
  const country = (opts.country ?? DEFAULT_MARKET).toUpperCase();
  const filter: Record<string, unknown> = {};
  if (query.trim()) filter.searchQuery = query.trim();
  if (opts.objectType) filter.objectTypes = [opts.objectType];
  const data = await gql<{ popularTitles?: { edges?: { node: RawNode }[] } }>(
    SEARCH_QUERY,
    {
      searchTitlesFilter: filter,
      country,
      language: "en",
      first: opts.first ?? 20,
      formatPoster: "JPG",
      formatOfferIcon: "PNG",
      profile: "S718",
      backdropProfile: "S1920",
      filter: {},
    },
    "GetSearchTitles",
    { revalidate: query.trim() ? 60 : 1800 }
  );
  const edges = data?.popularTitles?.edges ?? [];
  return edges.map((e) => normalizeNode(e.node)).filter((t) => t.fullPath);
}

export async function popularTitles(
  objectType: "MOVIE" | "SHOW",
  opts: { country?: string; first?: number } = {}
): Promise<JWTitleSummary[]> {
  return searchTitles("", {
    country: opts.country,
    first: opts.first ?? 14,
    objectType,
  });
}

export async function getTitle(nodeId: string, market = DEFAULT_MARKET): Promise<JWTitleSummary | null> {
  const data = await gql<{ node?: RawNode | null }>(
    TITLE_NODE_QUERY,
    {
      nodeId,
      language: "en",
      country: market.toUpperCase(),
      formatPoster: "JPG",
      formatOfferIcon: "PNG",
      profile: "S718",
      backdropProfile: "S1920",
    },
    "GetTitleNode",
    { revalidate: 3600 }
  );
  if (!data?.node || !data.node.content) return null;
  return normalizeNode(data.node);
}

export async function getTitleCountries(fullPath: string): Promise<string[]> {
  try {
    const res = await fetch(`${URLS_ENDPOINT}?path=${encodeURIComponent(fullPath)}`, {
      next: { revalidate: 86400 },
    });
    if (!res.ok) return [DEFAULT_MARKET];
    const json = (await res.json()) as {
      href_lang_tags?: { locale?: string }[];
    };
    const countries = new Set<string>();
    for (const tag of json.href_lang_tags ?? []) {
      const locale = tag.locale ?? "";
      const country = locale.split("_").pop();
      if (country && /^[A-Z]{2}$/.test(country)) countries.add(country);
    }
    if (countries.size === 0) return [DEFAULT_MARKET];
    return [...countries].sort();
  } catch {
    return [DEFAULT_MARKET];
  }
}

export async function getAllOffers(
  nodeId: string,
  countries: string[],
  rates: Record<string, number>
): Promise<Omit<JWOfferBundle, "fx">> {
  const query = buildOffersQuery(countries);
  const data = await gql<{ node?: Record<string, RawOffer[] | null> | null }>(
    query,
    {
      Country: DEFAULT_MARKET,
      filterBuy: {},
      language: "en",
      nodeId,
      platform: "WEB",
    },
    "GetTitleOffers",
    { revalidate: 600 }
  );

  const node = data?.node ?? {};
  const out: JWCountryOffers[] = [];
  let offerCount = 0;
  let bestStream: JWOfferBundle["best"]["stream"] = null;
  let bestRent: JWOfferBundle["best"]["rent"] = null;
  let bestBuy: JWOfferBundle["best"]["buy"] = null;

  for (const country of countries) {
    const rawOffers = node[country.toLowerCase()] ?? [];
    const offers = rawOffers
      .map((o) => normalizeOffer(o, country, rates))
      .filter((o) => o.category !== "cinema");
    if (offers.length === 0) continue;

    // stable, useful ordering: category, then price (free first), then provider
    const catRank: Record<OfferCategory, number> = { stream: 0, free: 1, rent: 2, buy: 3, cinema: 4 };
    offers.sort((a, b) => {
      const c = catRank[a.category] - catRank[b.category];
      if (c !== 0) return c;
      const pa = a.priceUsd ?? -1;
      const pb = b.priceUsd ?? -1;
      if (pa !== pb) return pa - pb;
      return a.packageName.localeCompare(b.packageName);
    });

    const counts: Record<OfferCategory, number> = { stream: 0, free: 0, rent: 0, buy: 0, cinema: 0 };
    for (const o of offers) {
      counts[o.category] += 1;
      if (o.category === "stream" && !bestStream) {
        bestStream = { country, packageName: o.packageName };
      }
      if (o.priceUsd != null && o.priceUsd > 0) {
        if (o.category === "rent" && (!bestRent || o.priceUsd < bestRent.priceUsd)) {
          bestRent = { country, priceUsd: o.priceUsd, priceLocal: o.priceLocal, currency: o.currency, packageName: o.packageName };
        }
        if (o.category === "buy" && (!bestBuy || o.priceUsd < bestBuy.priceUsd)) {
          bestBuy = { country, priceUsd: o.priceUsd, priceLocal: o.priceLocal, currency: o.currency, packageName: o.packageName };
        }
      }
    }

    offerCount += offers.length;
    out.push({ country, countryName: countryName(country), offers, counts });
  }

  return { marketCount: out.length, offerCount, countries: out, best: { stream: bestStream, rent: bestRent, buy: bestBuy } };
}

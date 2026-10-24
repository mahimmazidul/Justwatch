import { defineCloudflareConfig } from "@opennextjs/cloudflare";

/**
 * OpenNext configuration for the Cloudflare Workers runtime.
 *
 * No cache overrides are declared. The default in-memory incremental cache is
 * enough because this app does not use ISR: there is no `revalidate`, no
 * `generateStaticParams` and no `revalidateTag` anywhere in src/. Adding the
 * R2 incremental cache would mean creating and paying for an R2 bucket to store
 * entries that are never written.
 *
 * Freshness is handled where it actually belongs, in the HTTP responses:
 *   /api/jw/offers   Cache-Control: public, s-maxage=600,  stale-while-revalidate=1800
 *   /api/jw/search   Cache-Control: public, s-maxage=60,   stale-while-revalidate=300
 *   /_next/static/*  Cache-Control: public, max-age=31536000, immutable (public/_headers)
 * Cloudflare's CDN honours all three without any binding.
 */
export default defineCloudflareConfig({});

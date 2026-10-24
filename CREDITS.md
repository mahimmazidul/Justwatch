# Credits and licence

This repository contains a modified and combined version of third-party free
software. It is redistributed under the terms of the **GNU General Public
License version 3.0**, which is what the upstream project requires.

GPL-3.0 §5 obliges anyone conveying a modified version to keep the original
copyright and licence notices intact, to state that the work is licensed under
GPL-3.0, and to give every recipient a copy of the licence. The full text is in
[`LICENSE`](LICENSE).

## Application source — `source/`

**JustWatch Search** — a Blazor WebAssembly app that queries the JustWatch
GraphQL API for every streaming, rental and purchase offer for a film or series
across all countries.

- Original author: **NoBraincellsLeft**
- Upstream: <https://github.com/NoBraincellsLeft/JustWatch-Search>
- Licence: **GPL-3.0**
- Copyright © NoBraincellsLeft

Modifications made in this repository:

- `source/JustWatchSearch/Program.cs` — the API base address was changed from
  `/proxy/https://apis.justwatch.com` to the host-only form
  `/proxy/apis.justwatch.com`, for the proxy that this directory used to be
  deployed with.

No other change was made to the C# application.

**This directory is no longer built or deployed.** It is kept because it is the
GPL-3.0 work this repository derives from, and because the attribution and licence
obligations above travel with it. The deployed application is `cloudflare/`.

## Deployed application — `cloudflare/`

A Next.js 16 app, provided by the repository owner as the replacement frontend,
running on Cloudflare Workers through the OpenNext adapter.

Third-party packages it depends on, all bundled rather than loaded from a CDN —
the rendered HTML references no external origin:

| Package | Licence | Role |
|---|---|---|
| [Next.js](https://github.com/vercel/next) | MIT | framework |
| [React](https://github.com/facebook/react) | MIT | rendering |
| [@opennextjs/cloudflare](https://github.com/opennextjs/opennextjs-cloudflare) | MIT | builds the app into a Worker |
| [Drizzle ORM](https://github.com/drizzle-team/drizzle-orm) | Apache-2.0 | D1 queries |
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) | MIT | styling |
| [lucide](https://github.com/lucide-icons/lucide) | ISC | icons |
| [Wrangler](https://github.com/cloudflare/workers-sdk) | MIT OR Apache-2.0 | deploy tooling |

Changes made in this repository to the provided application:

- **Persistence ported from Postgres to Cloudflare D1.** `pg` opens TCP sockets,
  which Workers cannot do. Rewrote `src/db/schema.ts` (`pgTable` → `sqliteTable`,
  `uuid().defaultRandom()` and `timestamp().defaultNow()` replaced by values
  assigned in code), `src/db/index.ts` (connection pool → the per-request D1
  binding via `getCloudflareContext`, returning null instead of throwing so the
  app degrades), and `src/lib/store.ts` (dropped the Postgres-only `::int` cast).
  `src/app/api/health/route.ts` now reports which state it found.
- **`src/lib/anon.ts`** — replaced the Node `crypto` import with the Web Crypto
  global, and the anonymous id and market cookies are now validated against
  strict patterns instead of any string of eight or more characters, so a crafted
  cookie cannot be used as a database key.
- **`next.config.ts`** — `images.unoptimized`, because Next's image optimizer
  runs as a separate Node service that does not exist inside a Worker; posters
  already arrive pre-sized from the JustWatch CDN. Also added the
  `initOpenNextCloudflareForDev()` call the OpenNext adapter needs for `next dev`.
- **`package.json`** — Next 16.2.6 → 16.4.3, because `@opennextjs/cloudflare`
  declares `>=15.5.28 <16 || >=16.4.1` and 16.2.6 falls in the unsupported gap.
  Removed `pg`, `@types/pg` and the unused `dotenv`; added the adapter, Wrangler
  and Workers types.
- **Watchlist degradation made honest** — the button previously flipped to "saved"
  and silently flipped back when the API rejected it. It now reports why, and the
  watchlist page distinguishes "nothing saved yet" from "storage is not
  configured".
- **Homepage** — removed the four-item statistics block ("Markets indexed",
  "Streaming providers", "Offer types compared", "GraphQL query per title") and
  with it the now-unused `CountUp` component, an unused `ArrowRight` import and
  the hidden placeholder element that existed only to keep that import alive.
- **Footer** — links this repository and its licence, states the real cache
  windows instead of an inaccurate "updated hourly", and takes the market count
  from the data rather than hardcoding 54 in two places.
- **Three lint errors fixed** — `<a href="/#markets">` became a `next/link`
  `Link`; a `localStorage` write was moved out of a `setState` updater, which must
  stay pure because React may invoke it more than once; and two rules
  (`react-hooks/immutability` on the `document.cookie` write, and
  `react-hooks/set-state-in-effect` on restoring the stored currency preference)
  are suppressed in place with the reason recorded, since both are browser-only
  side effects that belong where they are.
- **Added for the deployment**: `open-next.config.ts`, `wrangler.jsonc`,
  `migrations/0000_init.sql`, `drizzle.config.json` (SQLite), `public/_headers`,
  `.dev.vars.example`, `build.sh`, `verify.py`, `fetch-fonts.py` and
  `cloudflare-env.d.ts`.

The Cloudflare Worker configuration, build script, D1 schema and migration, and
the test suite were written for this repository and contain no code copied from
the upstream Blazor project.

## Fonts — `cloudflare/src/assets/fonts/`

Five woff2 files, self-hosted and referenced by `next/font/local`. They were
missing from the application as provided, which made `next build` fail;
`fetch-fonts.py` re-downloads them. All three families are **SIL Open Font
License 1.1**, and the full licence text for each ships alongside the fonts as
that licence requires:

| Family | Copyright | Licence file |
|---|---|---|
| Space Grotesk | 2020 The Space Grotesk Project Authors | `OFL-space-grotesk.txt` |
| Instrument Serif | 2022 The Instrument Serif Project Authors | `OFL-instrument-serif.txt` |
| IBM Plex Mono | 2017 IBM Corp., Reserved Font Name "Plex" | `OFL-ibm-plex-mono.txt` |

Only the `latin` subset of each is included, which is what `layout.tsx` loads.
None has been modified, and IBM Plex Mono is not redistributed under a different
name, as its reserved-font-name clause requires.

## Third-party services

This application calls two external APIs at runtime. Neither is affiliated with
this repository, and neither's code is included here:

- **JustWatch** — <https://apis.justwatch.com> — film and series availability data.
  This is an unofficial, undocumented client. JustWatch may change or restrict it
  at any time, which will break this app. Please respect their terms of service and
  rate limits. Called from inside the Worker, so no CORS proxy is involved.
- **ExchangeRate-API** — <https://open.er-api.com> — currency conversion, so offers
  can be compared in USD. Also called from the Worker, and cached for 12 hours with
  a static fallback if it is unreachable.
- **images.justwatch.com** — poster artwork and provider icons, loaded by the
  browser directly from JustWatch's CDN.

The retained Blazor app in `source/` additionally loads Bootstrap, Bootstrap
Icons, Chart.js and chartjs-plugin-datalabels from CDNs; the deployed Next.js app
does not use any of them.

## Trademarks

"JustWatch" is a trademark of JustWatch GmbH. This project is not endorsed by,
affiliated with, or sponsored by JustWatch GmbH.

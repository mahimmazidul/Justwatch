# Justwatch

**Live: <https://justwatch.byaislop.workers.dev>**

Search any film or series and see **every** streaming, rental and purchase offer
for it, across all 54 countries JustWatch covers, with prices normalised to USD.

A Next.js app deployed to Cloudflare as **one Worker**: server rendering, the API
routes and the static assets all come from a single script.

```
browser ──► Cloudflare Worker ──┬──► /_next/static/*  (edge-served, free, unmetered)
                                ├──► SSR + /api/*     ──► apis.justwatch.com
                                │                    └──► open.er-api.com  (FX rates)
                                └──► D1 (optional)    ──► watchlist, trending searches
```

The JustWatch API sends no `Access-Control-Allow-Origin` header, so a browser may
not call it directly. That used to require a separate CORS proxy container; here
the calls happen inside the Worker, which is not subject to CORS at all. There is
no proxy to maintain, harden or route around.

---

## Repository layout

```
cloudflare/    The deployed application — Next.js 16 + the Worker that serves it
  ├─ src/app/                  Routes: /, /search, /title/[id], /watchlist, /api/*
  ├─ src/lib/justwatch.ts      GraphQL queries and the offer-normalisation layer
  ├─ src/lib/store.ts          D1 persistence (watchlist, search telemetry)
  ├─ src/db/                   Drizzle schema and the D1 connection
  ├─ src/assets/fonts/         Five self-hosted woff2 files + their OFL licences
  ├─ migrations/0000_init.sql  D1 schema, applied by wrangler
  ├─ open-next.config.ts       OpenNext adapter configuration
  ├─ wrangler.jsonc            Worker name, bindings, compatibility flags
  ├─ build.sh                  Config checks, then next build + the Worker bundle
  ├─ fetch-fonts.py            Re-downloads the font files if they go missing
  └─ verify.py                 65-check end-to-end test suite
source/        The original Blazor WebAssembly app. Retained for history and
               attribution under GPL-3.0; it is no longer built or deployed.
.github/workflows/deploy.yml   Push-to-deploy: verify on every push, then deploy
LICENSE                        GNU GPL v3.0 (required by the upstream app)
CREDITS.md                     Attribution and licence details
```

## Prerequisites

- **Node.js 20 or newer** — Wrangler 4 refuses to start on Node 18, and Next 16
  needs Node 20. Node 22 is what CI uses.
- A Cloudflare account; the free tier is enough.
- No .NET SDK. `source/` is not part of the build.

## Run locally

```bash
cd cloudflare
npm install
npm run dev          # Next dev server, wired to the Cloudflare runtime
```

`next.config.ts` calls `initOpenNextCloudflareForDev()`, which gives the dev
server the real bindings, so D1 works locally too once it is enabled.

To run the actual production Worker instead:

```bash
cd cloudflare
npm run preview      # ./build.sh, then wrangler dev on :8787
```

## Deploy

```bash
cd cloudflare
npx wrangler login   # once
npm run deploy       # ./build.sh && opennextjs-cloudflare deploy
```

Serves `https://justwatch.<your-subdomain>.workers.dev`. The Worker is named in
`wrangler.jsonc`; changing `name` creates a **second** Worker rather than
updating this one.

Pushes to `main` deploy automatically through GitHub Actions once the two
repository secrets below exist.

### The optional D1 database

The watchlist and the "trending searches" rail are backed by D1. Everything else
works without it, so the binding ships **empty** — `"d1_databases": []` — and the
site builds and deploys with no setup at all, and with no Cloudflare account
needed to build it locally. When D1 is absent:

- `/api/health` reports `database: "not-configured"`
- `/api/watchlist` returns `503`, and the button says why instead of failing silently
- `/watchlist` explains that storage is not configured
- `/api/trending` returns a static fallback list

#### On deploy, CI provisions it

Push to `main` and the workflow creates the database, writes the binding into
`wrangler.jsonc`, applies `migrations/` and then builds and deploys — in that
order, because the build reads that config. There is nothing to create by hand
and no database id to commit.

`cloudflare/d1-setup.sh` does the work and is safe to re-run. It looks the
database up **by name** and creates one only when nothing matches, so a second run
reuses the first database instead of making another: `wrangler d1 create` is not
idempotent, which is why the script lists before it creates. The `wrangler.jsonc`
edit lives only for the duration of that CI run, which is enough, because the next
run resolves the same database by name again.

The token needs **D1 → Edit** on top of Workers Script Edit; the "Edit Cloudflare
Workers" template alone does not include it. If the permission is missing the
workflow emits a warning, removes the binding and deploys anyway rather than
failing, because everything except the watchlist and the trending rail works
without a database.

#### Locally, or by hand

```bash
cd cloudflare
./d1-setup.sh            # create if absent, bind it, apply migrations --remote
./d1-setup.sh --status   # report what is bound right now, change nothing
./d1-setup.sh --disable  # remove the binding again
```

Then `npm run deploy`. To keep the binding permanently, commit the resulting
`wrangler.jsonc` change; to leave the repository clean, run `--disable` before
you commit.

`build.sh` refuses to build if a binding still names the placeholder id, so a
half-finished setup cannot ship.

## Cloudflare credentials

Deploying needs two values. Neither requires a paid plan.

### 1. Account ID

Not a secret — it appears in your dashboard URL and is safe to store as a CI
variable.

1. Sign in at <https://dash.cloudflare.com> and pick your account.
2. On the **Overview** page it is in the right-hand sidebar as **Account ID**, with
   a copy button. It is also the long hex string in the address bar:
   `dash.cloudflare.com/<ACCOUNT_ID>/...`
3. Or, once Wrangler is authenticated, `npx wrangler whoami` prints it.

Docs: [Find account and zone IDs](https://developers.cloudflare.com/fundamentals/setup/find-account-and-zone-ids/)

### 2. API token

This **is** a secret. Never commit it — `.gitignore` here blocks `.dev.vars` and
`.env` for exactly that reason.

1. Go to [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
   (or: avatar → **My Profile** → **API Tokens**).
2. **Create Token**.
3. Under **API token templates**, find **Edit Cloudflare Workers** → **Use template**.
4. Under **Account Resources**, select your account. Leave **Zone Resources** alone
   unless you are attaching a custom domain on one.
5. **Continue to summary** → **Create Token**, then copy it — it is shown once.

Do **not** use the *Read All Resources* template — it can read everything and write
nothing, so `wrangler deploy` fails with an authentication error.

Source: [API token templates](https://developers.cloudflare.com/fundamentals/api/reference/template/)

Docs: [Create API tokens](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/) ·
[GitHub Actions for Workers](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)

### Where to put them

**For CI** (`.github/workflows/deploy.yml`): GitHub repo → **Settings** → **Secrets and
variables** → **Actions** → **New repository secret**, twice:

| Secret name | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | the token from step 2 |
| `CLOUDFLARE_ACCOUNT_ID` | the account ID from step 1 |

Until both exist, the deploy job skips itself with a notice instead of failing, so
pushes stay green. The `verify` job always runs and needs no credentials.

**For local deploys**, either is fine:

```bash
npx wrangler login                                  # interactive OAuth, no token needed
# or
export CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=...
```

**For local `wrangler dev`**, secrets go in `cloudflare/.dev.vars` — already
gitignored. Copy `.dev.vars.example` to start.

## Tests

Two suites, because they catch different classes of bug: `verify.py` checks what
the server sends, `ui-test.mjs` checks what a person can actually do with it.

```bash
cd cloudflare
npm run typecheck
npm run lint
npm run preview &                                   # in another shell
python3 verify.py http://127.0.0.1:8787             # 65 HTTP-level checks
npm run test:ui -- http://127.0.0.1:8787            # 26 checks in a real browser
```

`next build` does **not** type-check: `next.config.ts` sets
`typescript.ignoreBuildErrors`, because running the checker a second time inside
the build roughly doubles its peak memory (Next also generates `.next/types`
there) and that was enough to get the build OOM-killed on a small machine.
`npm run typecheck` is a separate CI step on every push, so nothing is skipped —
it is just not done twice in one process. Next 16 does not run ESLint during
`next build` at all, so `npm run lint` is the only place that happens.

`verify.py` runs **65 checks** against a live Worker: every route, the 404 path,
the self-hosted font files and their cache headers, the requested content changes,
all four JustWatch API routes and their cache policies, the removal of the old
`/proxy/*` layer, multi-market offer coverage with USD normalisation, and the
watchlist CRUD cycle.

The database checks adapt to what they find. `/api/health` reports whether D1 is
bound; with it bound the suite exercises save, duplicate-guard, delete, cookie
isolation and search telemetry (65 checks, 0 skipped). Without it the suite asserts
the degraded behaviour instead and skips the rest (59 checks, 1 skip). Either way a
green run means the deployment is correct for its configuration.

It calls the real JustWatch API, so it needs network access.

### Browser interaction tests

```bash
npx playwright install chromium        # once, downloads ~120 MB
npm run test:ui -- http://127.0.0.1:8787
```

`ui-test.mjs` drives a real Chromium: it types into the search box, waits for the
autocomplete, clicks a suggestion and asserts the browser actually navigated. It
covers the hero and compact search bars, the "all results" row, arrow-key plus
Enter selection, the results grid, the Films/Series filters, the sort chips, and
the same flows again at a 390×844 viewport. 26 checks, exit code 1 on any failure.

It exists because of a bug `verify.py` structurally could not see. The hero
autocomplete rendered correctly and every suggestion was present in the HTML, so
all 65 HTTP checks passed — but `.rise` animates `transform` with
`animation-fill-mode: both`, which leaves Chromium keeping the element composited
and therefore a stacking context. That trapped the dropdown's `z-40` inside its own
wrapper, so the *next* `.rise` sibling (the trending chips) painted over the open
list and swallowed the clicks. The top suggestions were unselectable while every
status code, header and string assertion stayed green.

So the test asserts clickability directly rather than inferring it from markup:
for each row it calls `document.elementFromPoint()` at the row's centre and fails
if the element that would receive the click is not inside that row. That names the
covering element in the failure message, which is what made this one quick to
diagnose. The fix is `relative z-30` on the search bar's wrapper in
`src/app/page.tsx`, with a comment there explaining why it must not be removed.

## Free-tier budget

Measured from `wrangler deploy --dry-run` and the built output:

| | Allowance | This app |
|---|---|---|
| Worker bundle, uncompressed | 64 MiB | **5.5 MiB** |
| Worker bundle, compressed | *no limit since 2026-09-04* | 1.2 MiB |
| Files per Worker version | 20,000 | **24** |
| Largest single static asset | 25 MiB | **224 KB** (a JS chunk) |
| Worker invocations | 100,000/day | one per SSR page or API call |
| Subrequests per invocation | 50 | ~4 on a title page |
| D1 rows read | 5,000,000/day | a handful per watchlist page |

Requests for `/_next/static/*` are served from the edge as static assets and never
invoke the Worker, so the JS, CSS and font payload is unmetered. `public/_headers`
marks those files `immutable` for a year.

Two things worth knowing before relying on the free tier:

- **CPU is 10 ms per invocation on Free.** A server-rendered React page can exceed
  that, where the previous static-Blazor deployment could not. If a route starts
  returning error 1102, the Workers Paid plan ($5/month) raises the limit to 30 s.
  This cannot be measured locally, only against a real deployment.
- **Cloudflare's CDN does not cache HTML or extensionless JSON by default**, so the
  `s-maxage` values the API routes set are honoured by browsers and by any cache you
  configure, but not automatically at the edge. Adding a Cache Rule for `/api/jw/*`
  would cut invocations substantially, since those responses change slowly.

## What changed from the Blazor version

| Before | Now |
|---|---|
| Blazor WebAssembly, ~20 MB of .NET runtime shipped to the browser | Next.js, 866 KB of static assets |
| A hand-written CORS proxy (`src/proxy.js`) with a host allowlist | No proxy: the Worker calls JustWatch server-side |
| Two deployment shapes, Workers and Pages | Workers only — OpenNext does not target Pages |
| Browser made every data call through the proxy | The Worker makes them server-side; the rendered HTML references no external origin at all |
| No persistence | Optional D1 for the watchlist and search telemetry |
| `verify.py`, 36 proxy-contract checks | `verify.py`, 65 app-level checks |

`source/` is unchanged and still builds with the .NET 8 SDK if you want the
original app; it is simply no longer what gets deployed.

## Licence

**GNU General Public License v3.0.** See [`LICENSE`](LICENSE).

This repository contains a modified version of
[NoBraincellsLeft/JustWatch-Search](https://github.com/NoBraincellsLeft/JustWatch-Search),
which is GPL-3.0. Copyleft therefore applies to the combined work as a whole — any
redistribution, including of the Cloudflare deployment layer, must remain GPL-3.0.
Full attribution, including the fonts and their SIL Open Font Licences, is in
[`CREDITS.md`](CREDITS.md).

Not affiliated with or endorsed by JustWatch GmbH. "JustWatch" is their trademark.
The JustWatch GraphQL API used here is unofficial and undocumented; it may change
or be restricted at any time.

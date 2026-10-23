# Justwatch

Search any film or series and see **every** streaming, rental and purchase offer
for it, across all ~54 countries JustWatch covers, with prices normalised to USD.

Built as a Blazor WebAssembly app and deployed to Cloudflare as a **single
program** — one Worker serving both the static frontend and the API proxy it needs.

```
browser ──► Cloudflare Worker ──┬──► static Blazor app   (edge-cached, free, unlimited)
                                └──► /proxy/*  ─────────► apis.justwatch.com
```

---

## Why the proxy exists

`apis.justwatch.com` answers an `OPTIONS` preflight with `204` but sends **no
`Access-Control-Allow-Origin` header**, so a browser is not allowed to call it
directly from a web page. The request has to be relayed server-side.

The upstream project solved this with a separate Node.js/Express container behind
nginx, run via `docker-compose`. This repository replaces all three of those with
roughly 250 lines of dependency-free Worker code:

| Before | After |
|---|---|
| `nginx` — static serving, `.wasm` MIME type, `/proxy/` rewrite | Cloudflare static assets (sets `application/wasm` automatically) |
| `cors-proxy` — Node + Express + `request` (deprecated since 2020) | `cloudflare/src/proxy.js` — plain `fetch`, zero dependencies |
| `docker-compose.yml` — two containers | `npx wrangler deploy` |

Because the app and the proxy now share one origin, the browser never preflights
these calls at all.

### Hardening

The proxy this replaces was fully open — `Access-Control-Allow-Origin: *` and a
forward to any URL the caller supplied, which on a public deployment is an abuse
and SSRF vector. `cloudflare/src/proxy.js` instead:

- allowlists upstream hosts — rejects `example.com`, `169.254.169.254`, `10.0.0.1`, `localhost`
- rejects non-`http(s)` schemes such as `file://`
- accepts same-origin callers only by default
- forwards a small header allowlist, so cookies and Cloudflare-internal headers
  (`CF-Connecting-IP`, `CF-IPCountry`) are not leaked upstream
- strips hop-by-hop headers and `content-encoding`/`content-length` from responses
- answers `OPTIONS` itself rather than forwarding it

## Repository layout

```
source/      The Blazor WebAssembly application (C#, .NET 8)
cloudflare/  Everything needed to deploy it as one Cloudflare program
  ├─ src/index.js                Workers entry point: routes /proxy/* vs static assets
  ├─ src/proxy.js                The proxy. Shared by both deployment shapes.
  ├─ functions/proxy/[[url]].js  Pages entry point, delegates to src/proxy.js
  ├─ wrangler.jsonc              Worker name, assets dir, SPA fallback, routing, vars
  ├─ build.sh                    dotnet publish -> cloudflare/dist
  └─ verify.py                   36-check end-to-end test suite
.github/workflows/deploy.yml     Push-to-deploy
LICENSE                          GNU GPL v3.0 (required by the upstream app)
CREDITS.md                       Attribution and licence details
```

## Prerequisites

- **.NET 8 SDK** — <https://dotnet.microsoft.com/download/dotnet/8.0>
- **Node.js 22 or newer** — Wrangler 4 refuses to start on Node 20
- A Cloudflare account; the free tier is enough

## Run locally

```bash
cd cloudflare
npm install
npm run dev          # publishes the app, then runs the real Worker on :8787
```

`wrangler dev` runs `workerd`, the actual production runtime — not a simulator.

> The publish step needs roughly 1 GB of free RAM. On a small machine the .NET IL
> linker is killed by the OOM reaper with `error MSB6006: "dotnet" exited with
> code 137`. Close other processes, or add `-p:PublishTrimmed=false` to the
> `dotnet publish` line in `build.sh`.

## Deploy — Workers (recommended)

```bash
cd cloudflare
npx wrangler login   # once
npm run deploy       # ./build.sh && wrangler deploy
```

Serves `https://justwatch-search.<your-subdomain>.workers.dev`. Rename it via
`name` in `wrangler.jsonc`.

## Deploy — Pages

The same code also deploys to Cloudflare Pages, using `functions/proxy/[[url]].js`
instead of a Worker script. Behaviour is identical.

```bash
cd cloudflare
npm run deploy:pages
```

Two Pages details this repo already handles:

- **`[[url]].js`, not `[...url].js`.** Cloudflare Pages uses double brackets for a
  catch-all. The Next.js/Vercel spelling is rejected by Wrangler with
  *"Invalid Pages function route parameter"*.
- **`dist/_routes.json`** (emitted by `build.sh --pages`) restricts Function
  invocations to `/proxy/*`. Without it, Pages invokes a Function for *every*
  request once a `functions/` directory exists, burning the 100k/day free
  allowance on ordinary page loads.

### One behavioural difference between the platforms

| Proxy URL form | Workers | Pages |
|---|---|---|
| `/proxy/apis.justwatch.com/graphql` ← used by the app | 200 | 200 |
| `/proxy/https:/apis.justwatch.com/graphql` | 200 | 200 |
| `/proxy/https://apis.justwatch.com/graphql` | 200 | **307 → 405** |

Pages normalises merged slashes with a `307` before your Function runs, and a
`POST` cannot follow it. This is why `source/JustWatchSearch/Program.cs` uses the
host-only form. All three forms still work on Workers.

## Configuration

Set under `vars` in `cloudflare/wrangler.jsonc`, in the dashboard, or in
`cloudflare/.dev.vars` locally:

| Variable | Default | Purpose |
|---|---|---|
| `ALLOWED_UPSTREAM_HOSTS` | `apis.justwatch.com` | Comma-separated host allowlist |
| `ALLOWED_ORIGINS` | *(unset)* | Comma-separated browser origins allowed to call the proxy |
| `ALLOW_EXTERNAL_ORIGINS` | *(unset)* | `"true"` lets any origin call the proxy |

## Tests

```bash
cd cloudflare
python3 verify.py http://127.0.0.1:8787 workers   # while npm run dev is running
python3 verify.py http://127.0.0.1:8788 pages     # while npm run dev:pages is running
```

36 checks: static serving, `application/wasm` MIME type, Blazor deep-link SPA
fallback, the full live JustWatch call chain (search → `/content/urls` locale list
→ the 54-country `GetTitleOffers` query → `GetTitleNode`), CORS preflight, every
hardening rule above, and backwards compatibility with the old proxy's URL forms.
It calls the real JustWatch API, so it needs network access.

## Cost and limits — free tier

| | Allowance | This app |
|---|---|---|
| Static asset requests | Free, unlimited | The whole Blazor app |
| Files per Worker version | 20,000 | **219** |
| Largest single file | 25 MiB | **2.8 MiB** (`dotnet.native.wasm`) |
| Worker invocations | 100,000/day | Only `/proxy/*` |
| CPU per invocation | 10 ms | One `fetch`, no parsing |

`assets.run_worker_first` is scoped to `["/proxy/*"]`, so requests for real files
are served from the edge without invoking the Worker and cost nothing. One search
plus one title view is roughly 4 invocations.

The 20 MB of assets is mostly the .NET runtime. `dotnet publish` already emits
Brotli and gzip variants of every file and Blazor's boot loader negotiates them,
so the real first-load transfer is considerably smaller.

## Licence

**GNU General Public License v3.0.** See [`LICENSE`](LICENSE).

This repository contains a modified version of
[NoBraincellsLeft/JustWatch-Search](https://github.com/NoBraincellsLeft/JustWatch-Search),
which is GPL-3.0. Copyleft therefore applies to the combined work as a whole — any
redistribution, including of the Cloudflare deployment layer, must remain GPL-3.0.
Full attribution and a list of the modifications made are in
[`CREDITS.md`](CREDITS.md).

Not affiliated with or endorsed by JustWatch GmbH. "JustWatch" is their trademark.
The JustWatch GraphQL API used here is unofficial and undocumented; it may change
or be restricted at any time.

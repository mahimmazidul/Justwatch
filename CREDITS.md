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
  `/proxy/apis.justwatch.com`. Cloudflare Pages normalises the merged slashes in
  `https://` with a `307` redirect before a Function runs, and a `POST` cannot
  follow it, so the original form fails there. The host-only form works on both
  Cloudflare Workers and Pages.

No other change was made to the C# application.

## Deployment layer — `cloudflare/`

The Cloudflare Worker, its Pages Function counterpart, the build script, the
configuration and the test suite in `cloudflare/` were **written from scratch for
this repository**. They contain no code copied from either upstream project.

`cloudflare/src/proxy.js` is an independent reimplementation that replaces the
Node.js CORS proxy the upstream project depended on at runtime. It preserves that
proxy's *interface* — the `/proxy/<target>` path convention and the optional
`Target-URL` request header — so the application behaves the same, but shares no
code with it.

## Third-party services

This application calls two external APIs at runtime. Neither is affiliated with
this repository, and neither's code is included here:

- **JustWatch** — <https://apis.justwatch.com> — film and series availability data.
  This is an unofficial, undocumented client. JustWatch may change or restrict it
  at any time, which will break this app. Please respect their terms of service and
  rate limits.
- **ExchangeRate-API** — <https://open.er-api.com> — currency conversion, so offers
  can be compared in USD. Called directly from the browser; it sends
  `Access-Control-Allow-Origin: *`, so it needs no proxy.

Also loaded from CDN by `source/JustWatchSearch/wwwroot/index.html`: Bootstrap,
Bootstrap Icons, Chart.js and chartjs-plugin-datalabels.

## Trademarks

"JustWatch" is a trademark of JustWatch GmbH. This project is not endorsed by,
affiliated with, or sponsored by JustWatch GmbH.

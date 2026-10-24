# Self-hosted fonts

`src/app/layout.tsx` loads these with `next/font/local`, so they are bundled at
build time and served from the Worker's own static assets. Nothing is fetched
from a font CDN at runtime, and no request is made to Google when the page loads.

They were missing from the original source tree, which made `next build` fail
with `Font file not found`. `fetch-fonts.py` in the `cloudflare/` directory
re-downloads all five; run it if this directory is ever emptied.

| File | Family | Weights | Licence |
| --- | --- | --- | --- |
| `space-grotesk-normal-300-700-latin.woff2` | Space Grotesk | 300–700 variable | SIL OFL 1.1 |
| `instrument-serif-normal-400-latin.woff2` | Instrument Serif | 400 | SIL OFL 1.1 |
| `instrument-serif-italic-400-latin.woff2` | Instrument Serif | 400 italic | SIL OFL 1.1 |
| `ibm-plex-mono-normal-400-latin.woff2` | IBM Plex Mono | 400 | SIL OFL 1.1 |
| `ibm-plex-mono-normal-500-latin.woff2` | IBM Plex Mono | 500 | SIL OFL 1.1 |

Only the `latin` subset of each family is included, which is what the
`localFont` declarations in `layout.tsx` point at. Total size is about 91 KB.

The full licence text for each family is in this directory:

- `OFL-space-grotesk.txt` — Copyright 2020 The Space Grotesk Project Authors
- `OFL-instrument-serif.txt` — Copyright 2022 The Instrument Serif Project Authors
- `OFL-ibm-plex-mono.txt` — Copyright 2017 IBM Corp. with Reserved Font Name "Plex"

The SIL Open Font License permits bundling and redistribution with the
software, provided the copyright notices and licence text travel with the fonts,
which these files do. Note the reserved-name clause on IBM Plex: the font must
not be redistributed under a modified name, and it has not been.

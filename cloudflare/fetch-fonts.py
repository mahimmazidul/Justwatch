#!/usr/bin/env python3
"""Vendor the five latin-subset woff2 files that src/app/layout.tsx references.

They were missing from the uploaded source tree, which made `next build` fail
with "Font file not found". The layout deliberately uses next/font/local
("no build-time network dependency"), so the fix is to add the real files
rather than switch to next/font/google.

All three families are SIL Open Font License 1.1 and are fetched from the
Google Fonts CSS API, which serves the same latin subsets. A modern User-Agent
is required or the API returns truetype instead of woff2.
"""
import os
import re
import sys
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "src", "assets", "fonts")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")

# css2 query -> the latin @font-face we want -> target filename
WANT = [
    ("Space+Grotesk:wght@300..700",
     "space-grotesk-normal-300-700-latin.woff2"),
    ("Instrument+Serif:ital@0",
     "instrument-serif-normal-400-latin.woff2"),
    ("Instrument+Serif:ital@1",
     "instrument-serif-italic-400-latin.woff2"),
    ("IBM+Plex+Mono:wght@400",
     "ibm-plex-mono-normal-400-latin.woff2"),
    ("IBM+Plex+Mono:wght@500",
     "ibm-plex-mono-normal-500-latin.woff2"),
]


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    return urllib.request.urlopen(req, timeout=60).read()


def latin_woff2_url(css_text):
    """Pull the src url out of the @font-face block commented /* latin */."""
    # Split on subset comments; keep the segment labelled latin.
    blocks = re.split(r"/\*\s*([a-z0-9-]+)\s*\*/", css_text)
    # blocks = [pre, name1, body1, name2, body2, ...]
    for i in range(1, len(blocks) - 1, 2):
        if blocks[i].strip().lower() == "latin":
            m = re.search(r"src:\s*url\((https://[^)]+\.woff2)\)", blocks[i + 1])
            if m:
                return m.group(1)
    # Fall back to the last woff2 in the sheet if no subset comment matched.
    urls = re.findall(r"url\((https://[^)]+\.woff2)\)", css_text)
    return urls[-1] if urls else None


os.makedirs(OUT, exist_ok=True)
failed = []
for family, filename in WANT:
    css_url = f"https://fonts.googleapis.com/css2?family={family}&display=swap"
    try:
        css = fetch(css_url).decode("utf-8", "replace")
        src = latin_woff2_url(css)
        if not src:
            raise RuntimeError(f"no latin woff2 url in stylesheet for {family}")
        data = fetch(src)
        if data[:4] != b"wOF2":
            raise RuntimeError(f"downloaded {filename} is not woff2 (magic {data[:4]!r})")
        path = os.path.join(OUT, filename)
        with open(path, "wb") as fh:
            fh.write(data)
        print(f"  OK  {filename:46s} {len(data)//1024:4d} KB  <- {src.split('/')[-1]}")
    except Exception as exc:  # noqa: BLE001
        failed.append((filename, str(exc)))
        print(f"  FAIL {filename:45s} {exc}")

print()
if failed:
    print(f"{len(failed)} font(s) failed; `next build` will still fail.")
    sys.exit(1)
print(f"all {len(WANT)} fonts written to {os.path.relpath(OUT, HERE)}/")

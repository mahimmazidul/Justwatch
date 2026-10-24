#!/usr/bin/env python3
"""
End-to-end verification of the Cloudflare deployment.

Covers the Next.js app now served by the Worker: routing, the self-hosted font
assets, the JustWatch API routes that replaced the old CORS proxy, the D1-backed
watchlist when a database is bound, and the specific content changes requested
for this release.

The database tests are conditional. /api/health reports whether D1 is bound, and
the suite asserts the correct behaviour for whichever state it finds, so it
passes both before and after the database is created.

Usage: python3 verify.py [base_url]     (default http://127.0.0.1:8787)
"""
import http.cookiejar
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8787").rstrip("/")

# A title that is stable in the JustWatch catalogue: Dune (2021).
TITLE_ID = "tm305113"
TITLE_NAME = "Dune"

passed = 0
failed = 0
skipped = 0


def check(label, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"  PASS  {label}")
    else:
        failed += 1
        print(f"  FAIL  {label}  {detail}")


def skip(label, reason):
    global skipped
    skipped += 1
    print(f"  SKIP  {label}\n          {reason}")


class CI(dict):
    """Case-insensitive header map.

    Keys are normalised on the way in, because the casing depends on the HTTP
    version: HTTP/2 sends lowercase names, HTTP/1.1 sends `Content-Type`.
    Lowercasing only at lookup time (the previous approach) silently misses
    every header from an HTTP/1.1 server.
    """

    def __init__(self, other=None):
        super().__init__()
        for k, v in dict(other or {}).items():
            self[str(k).lower()] = v

    def get(self, key, default=None):
        return super().get(str(key).lower(), default)

    def __contains__(self, key):
        return super().__contains__(str(key).lower())


def call(method, url, body=None, headers=None, timeout=120):
    """Returns (status, headers, body_text). Never raises on HTTP errors."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("User-Agent", "verify.py")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read()
            return res.status, CI(dict(res.headers)), raw.decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        raw = e.read()
        return e.code, CI(dict(e.headers or {})), raw.decode("utf-8", "replace")
    except Exception as e:  # noqa: BLE001
        return 0, CI({}), f"{type(e).__name__}: {e}"


def get(path, **kw):
    return call("GET", BASE + path, **kw)


def jbody(text):
    try:
        return json.loads(text)
    except Exception:  # noqa: BLE001
        return None


print(f"\nVerifying {BASE}\n")

# ── 1. Pages and routing ─────────────────────────────────────────────────────
print("Routing")
status, hdrs, home = get("/")
check("GET / returns 200", status == 200, f"got {status}")
check("/ serves HTML", "text/html" in hdrs.get("content-type", ""), hdrs.get("content-type", ""))
check("/ renders the product name", "JustWatch" in home)

status, _, search = get("/search?q=dune")
check("GET /search?q=dune returns 200", status == 200, f"got {status}")
check("/search renders results", "dune" in search.lower())

status, _, title = get(f"/title/{TITLE_ID}")
check(f"GET /title/{TITLE_ID} returns 200", status == 200, f"got {status}")
check(f"/title renders {TITLE_NAME}", TITLE_NAME in title)

status, _, wl = get("/watchlist")
check("GET /watchlist returns 200", status == 200, f"got {status}")

status, _, nf = get("/no/such/page")
check("unknown path returns 404, not a 200 shell", status == 404, f"got {status}")

status, hdrs, _ = get("/icon.svg")
check("GET /icon.svg returns 200", status == 200, f"got {status}")
check("/icon.svg is served as SVG", "svg" in hdrs.get("content-type", ""), hdrs.get("content-type", ""))

# ── 2. Self-hosted fonts ─────────────────────────────────────────────────────
print("\nStatic assets and fonts")
fonts = sorted(set(re.findall(r"/_next/static/media/[^\"')\s]+\.woff2", home)))
check("homepage references self-hosted woff2 fonts", len(fonts) >= 3, f"found {len(fonts)}")
check("no external font CDN is requested",
      not re.search(r"fonts\.(googleapis|gstatic)\.com", home),
      "found a Google Fonts reference")

font_ok = mime_ok = 0
for f in fonts[:5]:
    st, fh, _ = get(f)
    if st == 200:
        font_ok += 1
        if "font" in fh.get("content-type", "") or "octet-stream" in fh.get("content-type", ""):
            mime_ok += 1
check("every referenced font file is served", font_ok == len(fonts[:5]),
      f"{font_ok}/{len(fonts[:5])}")
check("fonts are served with a font MIME type", mime_ok == len(fonts[:5]),
      f"{mime_ok}/{len(fonts[:5])}")

if fonts:
    st, fh, _ = get(fonts[0])
    cc = fh.get("cache-control", "")
    check("font assets are cached immutable for a year",
          "immutable" in cc and "31536000" in cc, f"Cache-Control: {cc or '(none)'}")

# ── 3. The content changes requested for this release ────────────────────────
print("\nRequested content changes")
REMOVED_STATS = ["Markets indexed", "Streaming providers",
                 "Offer types compared", "GraphQL query per title"]
still = [s for s in REMOVED_STATS if s in home]
check("homepage stats block removed", not still, f"still present: {still}")
check("CountUp component no longer referenced", "CountUp" not in home)

check("footer links the repository",
      "github.com/mahimmazidul/Justwatch" in home)
check("footer has a 'Source on GitHub' link", "Source on GitHub" in home)
check("footer links the GPL-3.0 licence", "/blob/main/LICENSE" in home)
check("footer no longer claims 'updated hourly'", "updated hourly" not in home)
check("footer states the real cache windows",
      "offers cached 10 min" in home and "search cached 1 min" in home)

# ── 4. JustWatch API routes (these replaced the old /proxy/* CORS layer) ─────
print("\nJustWatch API routes")
status, hdrs, text = get("/api/jw/search?q=dune&limit=5")
payload = jbody(text)
check("GET /api/jw/search returns 200", status == 200, f"got {status}")
check("/api/jw/search returns a results array",
      isinstance(payload, dict) and isinstance(payload.get("results"), list), text[:120])
if isinstance(payload, dict) and payload.get("results"):
    check(f"search finds {TITLE_NAME}",
          any(TITLE_NAME.lower() in (r.get("title") or "").lower() for r in payload["results"]),
          str([r.get("title") for r in payload["results"][:5]]))
cc = hdrs.get("cache-control", "")
check("search responses are edge-cached (s-maxage=60)", "s-maxage=60" in cc, cc or "(none)")

status, _, text = get("/api/jw/search?q=x")
payload = jbody(text)
check("a too-short query returns 200 with no results",
      status == 200 and isinstance(payload, dict) and payload.get("results") == [], text[:120])

status, _, text = get("/api/jw/popular?type=MOVIE&limit=5")
payload = jbody(text)
check("GET /api/jw/popular returns 200", status == 200, f"got {status}")
check("/api/jw/popular returns titles",
      isinstance(payload, dict) and bool(payload.get("titles") or payload.get("results")),
      text[:150])

status, hdrs, text = get(f"/api/jw/offers?id={TITLE_ID}")
offers = jbody(text)
check("GET /api/jw/offers returns 200", status == 200, f"got {status} {text[:150]}")
countries = offers.get("countries") if isinstance(offers, dict) else None
if isinstance(countries, list):
    check("offers cover many countries in one response", len(countries) > 40,
          f"{len(countries)} countries")
    populated = [c for c in countries if isinstance(c, dict) and c.get("offers")]
    check("offers include per-country provider rows", len(populated) > 40,
          f"{len(populated)} countries with offers")
elif isinstance(offers, dict):
    check("offers payload has a recognisable shape", bool(offers), str(list(offers)[:6]))
cc = hdrs.get("cache-control", "")
check("offer responses are edge-cached (s-maxage=600)", "s-maxage=600" in cc, cc or "(none)")

status, _, text = get("/api/jw/offers?id=" + urllib.parse.quote("bad id!!"))
check("an invalid offer id is rejected with 400", status == 400, f"got {status}")

# The core value of the app: one title, prices from many markets at once.
if isinstance(offers, dict):
    blob = json.dumps(offers)
    symbols = [s for s in ("$", "EUR", "GBP", "price") if s in blob]
    check("offer payload carries pricing data", bool(symbols), "no price fields found")

# ── 5. The old CORS proxy is gone ────────────────────────────────────────────
print("\nLegacy proxy removal")
status, _, _ = get("/proxy/apis.justwatch.com/graphql")
check("/proxy/* no longer exists (Next.js calls JustWatch server-side)",
      status == 404, f"got {status}")
status, _, _ = call("POST", BASE + "/proxy/apis.justwatch.com/graphql", body={"query": "{}"})
check("POST /proxy/* is also gone", status in (404, 405), f"got {status}")

# ── 6. Health and the D1-backed features ─────────────────────────────────────
print("\nHealth and persistence")
status, _, text = get("/api/health")
health = jbody(text)
check("GET /api/health returns 200", status == 200, f"got {status} {text[:150]}")
check("health reports ok", isinstance(health, dict) and health.get("ok") is True, text[:150])
db_state = (health or {}).get("database")
check("health names the database state",
      db_state in ("ready", "not-configured", "error"), str(db_state))
print(f"          database: {db_state}")

status, _, text = get("/api/trending")
trending = jbody(text)
check("GET /api/trending returns 200", status == 200, f"got {status}")
check("trending returns a list",
      isinstance(trending, dict) and isinstance(trending.get("trending"), list), text[:150])

WATCHLIST_ITEM = {
    "id": TITLE_ID, "objectType": "MOVIE", "title": TITLE_NAME, "year": 2021,
    "poster": None, "fullPath": "/us/movie/dune-2021",
}

if db_state == "ready":
    print("\nWatchlist (D1 bound)")
    # A real cookie jar, because the identity is carried by an httpOnly cookie
    # issued on the first response and must be replayed on every later call.
    # Parsing Set-Cookie by hand is unreliable: its Expires attribute contains
    # commas, and dict(headers) keeps only one of several Set-Cookie lines.
    jar = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    def sess(method, path, body=None):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(BASE + path, data=data, method=method)
        req.add_header("User-Agent", "verify.py")
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with opener.open(req, timeout=120) as res:
                return res.status, CI(dict(res.headers)), res.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            return e.code, CI(dict(e.headers or {})), e.read().decode("utf-8", "replace")

    st, _, tx = sess("GET", "/api/watchlist")
    check("GET /api/watchlist returns 200", st == 200, f"got {st}")
    cookie_names = {c.name for c in jar}
    check("an anonymous cookie is issued", "ss_uid" in cookie_names, str(cookie_names))

    st, _, tx = sess("POST", "/api/watchlist", WATCHLIST_ITEM)
    saved = jbody(tx)
    check("POST /api/watchlist saves the title",
          st == 200 and isinstance(saved, dict) and saved.get("saved") is True, tx[:150])
    check("the saved title comes back in the list",
          any(i.get("nodeId") == TITLE_ID for i in (saved or {}).get("items", [])), tx[:200])

    before = len((saved or {}).get("items", []))
    st, _, tx = sess("POST", "/api/watchlist", WATCHLIST_ITEM)
    after = len((jbody(tx) or {}).get("items", []))
    check("saving the same title twice does not duplicate it", after == before,
          f"{before} -> {after}")

    st, _, tx = sess("DELETE", f"/api/watchlist?nodeId={TITLE_ID}")
    check("DELETE removes the title",
          st == 200 and not any(i.get("nodeId") == TITLE_ID
                                for i in (jbody(tx) or {}).get("items", [])), tx[:150])

    st, _, tx = call("GET", BASE + "/api/watchlist",
                     headers={"Cookie": "ss_uid=not-a-valid-uuid"})
    check("a malformed anon cookie cannot read a list",
          st == 200 and (jbody(tx) or {}).get("items") == [], tx[:150])

    sess("GET", "/api/jw/search?q=verifyprobe&limit=3")
    st, _, tx = get("/api/trending")
    labels = [t.get("label") for t in (jbody(tx) or {}).get("trending", [])]
    check("search telemetry is written to D1 and read back",
          "verifyprobe" in labels, str(labels[:8]))

    st, _, tx = get("/api/health")
    h2 = jbody(tx) or {}
    check("health counts rows in both tables",
          isinstance(h2.get("searchEvents"), int) and isinstance(h2.get("watchlistItems"), int),
          tx[:150])
else:
    print("\nWatchlist (no database bound)")
    st, _, tx = call("POST", BASE + "/api/watchlist", body=WATCHLIST_ITEM)
    check("POST /api/watchlist reports 503 rather than a false success",
          st == 503, f"got {st} {tx[:120]}")
    st, _, tx = get("/watchlist")
    check("the watchlist page says storage is not configured",
          "not configured" in tx.lower(), "no explanation rendered")
    check("the page does not claim nothing is saved yet",
          "Nothing saved yet" not in tx)
    skip("watchlist CRUD and search telemetry",
         "D1 is not bound. Run ./d1-setup.sh to create, bind and migrate one "
         "(needs Cloudflare credentials); CI does this automatically on deploy")

# ── 7. Multi-market data, the reason the app exists ──────────────────────────
print("\nMulti-market coverage")
if isinstance(offers, dict) and isinstance(countries, list):
    codes = {c.get("country") for c in countries if isinstance(c, dict) and c.get("country")}
    check("response covers the full JustWatch market list", len(codes) >= 50,
          f"{len(codes)} markets")
    check("marketCount agrees with the country list",
          offers.get("marketCount") == len([c for c in countries if isinstance(c, dict) and c.get("offers")]),
          f"marketCount={offers.get('marketCount')} populated={len([c for c in countries if isinstance(c, dict) and c.get('offers')])}")
    check("offerCount is reported and non-trivial",
          isinstance(offers.get("offerCount"), int) and offers["offerCount"] > 100,
          f"offerCount={offers.get('offerCount')}")
    for probe in ("US", "GB", "IN", "JP"):
        check(f"  {probe} is present", probe in codes, f"missing {probe}")
    names = {c.get("countryName") for c in countries if isinstance(c, dict)}
    check("country names are decoded, not raw codes only",
          any(n and len(str(n)) > 2 for n in names), str(list(names)[:4]))

    # Prices are normalised to USD, which is what makes cross-market comparison possible.
    all_offers = [o for c in countries if isinstance(c, dict) for o in (c.get("offers") or [])]
    with_usd = [o for o in all_offers if isinstance(o.get("priceUsd"), (int, float))]
    check("offers carry USD-normalised prices", len(with_usd) > 50,
          f"{len(with_usd)}/{len(all_offers)} offers have priceUsd")
    check("offers carry the local price and currency too",
          any(o.get("currency") and o.get("priceLabel") for o in all_offers),
          "no local pricing found")
    check("provider names are present",
          any(o.get("packageName") for o in all_offers), "no packageName values")

    best = offers.get("best") or {}
    check("the bundle names a cheapest rent and buy market",
          isinstance(best.get("rent"), dict) and isinstance(best.get("buy"), dict),
          str(best)[:150])
    fx = offers.get("fx") or {}
    check("FX provenance is reported", fx.get("base") == "USD" and "degraded" in fx,
          str(fx)[:120])

# ── summary ──────────────────────────────────────────────────────────────────
summary = f"  {passed} passed, {failed} failed"
if skipped:
    summary += f", {skipped} skipped"
print("\n" + "=" * 62)
print(summary)
print("=" * 62 + "\n")
sys.exit(1 if failed else 0)

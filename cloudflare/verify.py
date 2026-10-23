#!/usr/bin/env python3
"""
End-to-end verification of the unified Cloudflare deployment.

Replays the exact call chain the Blazor app performs at runtime, through the
Worker's /proxy/* route, and asserts the proxy layer behaves correctly.

Usage: python3 verify.py [base_url]     (default http://127.0.0.1:8787)
"""
import json
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8787").rstrip("/")
PLATFORM = (sys.argv[2] if len(sys.argv) > 2 else "workers").lower()
assert PLATFORM in ("workers", "pages"), "platform must be 'workers' or 'pages'"
PROXY = f"{BASE}/proxy/apis.justwatch.com"

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
    """Case-insensitive header map — servers vary between HTTP/1.1 and HTTP/2 casing."""

    def get(self, key, default=None):
        return super().get(key.lower(), default)

    def __contains__(self, key):
        return super().__contains__(key.lower())


def call(method, url, body=None, headers=None, expect=None):
    """Returns (status, headers, body_text). Never raises on HTTP errors."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("User-Agent", "verify.py")
    if data is not None:
        req.add_header("Content-Type", "application/json")
    for k, v in (headers or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, CI({k.lower(): v for k, v in r.headers.items()}), r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, CI({k.lower(): v for k, v in e.headers.items()}), e.read().decode("utf-8", "replace")


def gql(query, variables, operation=None):
    payload = {"query": query, "variables": variables}
    if operation:
        payload["operationName"] = operation
    status, _, text = call("POST", f"{PROXY}/graphql", payload)
    if status != 200:
        raise RuntimeError(f"GraphQL call failed: HTTP {status} {text[:300]}")
    envelope = json.loads(text)
    if envelope.get("errors"):
        raise RuntimeError(f"GraphQL errors: {json.dumps(envelope['errors'])[:400]}")
    return envelope["data"]


print(f"\nTarget:   {BASE}\nPlatform: Cloudflare {PLATFORM.capitalize()}\n")

# ---------------------------------------------------------------- static app
print("[1] Static Blazor app")
s, h, b = call("GET", f"{BASE}/")
check("GET / -> 200 index.html", s == 200 and "<title>JustWatch Search</title>" in b, f"HTTP {s}")
check(
    "index.html served as text/html",
    h.get("Content-Type", "").startswith("text/html"),
    h.get("Content-Type"),
)

s, h, b = call("GET", f"{BASE}/_framework/blazor.webassembly.js")
check("blazor.webassembly.js -> 200", s == 200, f"HTTP {s}")

s, h, b = call("GET", f"{BASE}/_framework/dotnet.native.wasm")
check(
    ".wasm served as application/wasm (nginx.conf used to do this by hand)",
    s == 200 and h.get("Content-Type") == "application/wasm",
    f"HTTP {s} {h.get('Content-Type')}",
)
check(".wasm payload is intact (>1MB)", len(b) > 1_000_000, f"{len(b)} bytes")

s, h, b = call("GET", f"{BASE}/_framework/blazor.boot.json")
check("blazor.boot.json -> 200 valid JSON", s == 200 and "resources" in json.loads(b), f"HTTP {s}")

# ------------------------------------------------------------- SPA deep links
print("\n[2] SPA deep links (Blazor client-side routes, hard refresh)")
for route in ("/title/tm305113", "/search", "/search?q=dune", "/no/such/page"):
    s, h, b = call("GET", f"{BASE}{route}")
    check(
        f"{route} -> 200 index.html (not 404)",
        s == 200 and "<title>JustWatch Search</title>" in b,
        f"HTTP {s}",
    )

# ------------------------------------------------------------- the app's flow
print("\n[3] Live JustWatch API flow through the proxy (what the app actually does)")

SEARCH = """
query GetSearchTitles($searchTitlesFilter: TitleFilter!, $country: Country!,
                      $language: Language!, $first: Int!, $formatPoster: ImageFormat,
                      $profile: PosterProfile) {
  popularTitles(country: $country, filter: $searchTitlesFilter, first: $first,
                sortBy: POPULAR, sortRandomSeed: 0) {
    edges { node { id objectId objectType
      content(country: $country, language: $language) {
        title fullPath originalReleaseYear shortDescription
        posterUrl(profile: $profile, format: $formatPoster)
        externalIds { imdbId tmdbId }
      } } }
  }
}
"""
data = gql(
    SEARCH,
    {
        "searchTitlesFilter": {"searchQuery": "dune"},
        "country": "US",
        "language": "en",
        "first": 5,
        "formatPoster": "JPG",
        "profile": "S718",
    },
    "GetSearchTitles",
)
edges = data["popularTitles"]["edges"]
check("search 'dune' returned results", len(edges) > 0, f"{len(edges)} edges")
node = edges[0]["node"]
content = node["content"]
check("result has title + fullPath", bool(content.get("title") and content.get("fullPath")))
check("result has poster URL", bool(content.get("posterUrl")), content.get("posterUrl"))
print(f"        -> {content['title']} ({content.get('originalReleaseYear')})  id={node['id']}  path={content['fullPath']}")

# GetUrlMetadataResponseAsync -> locale list, exactly as JustwatchApiService does it
s, h, b = call("GET", f"{PROXY}/content/urls?path={urllib.parse.quote(content['fullPath'], safe='')}")
check("GET /content/urls -> 200", s == 200, f"HTTP {s}")
meta = json.loads(b)
locales = [t["locale"] for t in meta.get("href_lang_tags", [])]
check(f"locale list parsed ({len(locales)} countries)", len(locales) > 50, f"{len(locales)}")
check("response is JSON with correct content-type", "json" in h.get("Content-Type", ""), h.get("Content-Type"))

# GetTitleOffers -> one aliased `offers(country: XX)` block per locale, the big query
countries = [loc.split("_")[-1] for loc in locales]
blocks = "".join(
    f'{c.lower()}: offers(country: {c}, platform: $platform, filter: $filterBuy) {{ ...TitleOffer }}'
    for c in countries
)
OFFERS = (
    'query GetTitleOffers($nodeId: ID!, $language: Language!, $filterBuy: OfferFilter!, $platform: Platform! = WEB) {'
    f"  node(id: $nodeId) {{ ... on MovieOrShowOrSeasonOrEpisode {{ {blocks} }} }} }}"
    "fragment TitleOffer on Offer { id presentationType monetizationType retailPrice(language: $language) "
    "retailPriceValue currency package { packageId clearName technicalName icon(profile: S100) } standardWebURL }"
)
offers = gql(
    OFFERS,
    {"nodeId": node["id"], "language": "en", "filterBuy": {}, "platform": "WEB"},
    "GetTitleOffers",
)
per_country = offers["node"]
total = sum(len(v) for v in per_country.values() if isinstance(v, list))
check(
    f"multi-country offers query succeeded ({len(per_country)} countries, {total} offers)",
    total > 0,
    f"{total} offers",
)
sample = next(
    (o for v in per_country.values() if isinstance(v, list) for o in v),
    None,
)
if sample:
    pkg = (sample.get("package") or {}).get("clearName")
    print(f"        -> e.g. {sample.get('monetizationType')} on {pkg}: {sample.get('retailPrice')}")

# GetTitleNode
s, h, b = call(
    "POST",
    f"{PROXY}/graphql",
    {
        "operationName": "GetTitleNode",
        "query": "query GetTitleNode($nodeId: ID!, $language: Language!, $country: Country!) {"
        " node(id: $nodeId) { ... on MovieOrShow { id objectId objectType"
        " content(country: $country, language: $language) { title fullPath originalReleaseYear } } } }",
        "variables": {"nodeId": node["id"], "language": "en", "country": "US"},
    },
)
check("GetTitleNode -> 200 with data", s == 200 and json.loads(b)["data"]["node"]["id"] == node["id"], f"HTTP {s}")

# --------------------------------------------- proxy contract + hardening
print("\n[4] Proxy contract")
s, h, b = call(
    "OPTIONS",
    f"{PROXY}/graphql",
    headers={
        "Origin": BASE,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
    },
)
check("OPTIONS preflight -> 204", s == 204, f"HTTP {s}")
check("preflight sets Access-Control-Allow-Origin", h.get("Access-Control-Allow-Origin") == BASE, h.get("Access-Control-Allow-Origin"))
check("preflight echoes requested headers", "content-type" in (h.get("Access-Control-Allow-Headers") or "").lower())

s, h, b = call("POST", f"{PROXY}/graphql", {"query": "query { __typename }"}, headers={"Origin": BASE})
check("same-origin POST allowed", s == 200, f"HTTP {s}")
vary = h.get("Vary", "")
check("Vary contains Origin exactly once", vary.lower().split().count("origin,") + vary.lower().count(", origin") <= 1 and "origin" in vary.lower(), repr(vary))
check("no duplicate Origin token in Vary", vary.lower().replace(" ", "").split(",").count("origin") <= 1, repr(vary))

s, h, b = call("GET", f"{PROXY}/content/urls?path=%2Fus%2Fmovie%2Fdune-2021", headers={"Origin": "https://evil.example"})
check("foreign Origin rejected by default (403)", s == 403, f"HTTP {s}")

print("\n[5] Hardening (this is what the old open proxy did NOT do)")
for host, label in [
    ("example.com", "unlisted host"),
    ("169.254.169.254/latest/meta-data", "cloud metadata IP"),
    ("10.0.0.1", "private RFC1918 IP"),
    ("localhost:8787", "localhost"),
]:
    s, h, b = call("GET", f"{BASE}/proxy/{host}")
    check(f"{label} blocked -> 403", s == 403, f"HTTP {s}")

s, h, b = call("GET", f"{BASE}/proxy/")
check("missing target -> 400 with usage hint", s == 400 and "usage" in b, f"HTTP {s}")
s, h, b = call("GET", f"{BASE}/proxy/file:///etc/passwd")
check("non-http(s) scheme -> 400", s == 400, f"HTTP {s}")

print("\n[6] Backwards compatibility with the original cors-proxy")
s, h, b = call("POST", f"{BASE}/proxy/https://apis.justwatch.com/graphql", {"query": "query { __typename }"})
if PLATFORM == "workers":
    check("legacy '/proxy/https://host/path' form works", s == 200 and "__typename" in b, f"HTTP {s}")
else:
    # Pages normalises merged slashes in the path with a 307 before the Function
    # runs, and a POST cannot follow it (405). This is a Pages platform behaviour,
    # not a bug here -- and it is exactly why Program.cs was switched to the
    # host-only form, which works identically on both platforms.
    check(
        "legacy '/proxy/https://host/path' is redirected by Pages (expected, unused by the app)",
        s in (307, 405),
        f"HTTP {s}",
    )
    skip(
        "legacy double-slash form as a usable proxy path",
        "Pages answers it with 307/405; the app uses /proxy/<host>/<path> instead.",
    )
s, h, b = call("POST", f"{BASE}/proxy/https:/apis.justwatch.com/graphql", {"query": "query { __typename }"})
check("collapsed-slash 'https:/host' form repaired", s == 200 and "__typename" in b, f"HTTP {s}")
s, h, b = call(
    "POST",
    f"{BASE}/proxy/graphql",
    {"query": "query { __typename }"},
    headers={"Target-URL": "https://apis.justwatch.com"},
)
check("Target-URL header form works", s == 200 and "__typename" in b, f"HTTP {s}")

print("\n[7] Currency API (called directly by the app, not proxied)")
try:
    s, h, b = call("GET", "https://open.er-api.com/v6/latest/USD", headers={"Origin": BASE})
    rates = json.loads(b).get("rates", {})
    check(f"open.er-api.com reachable, {len(rates)} rates", s == 200 and len(rates) > 100, f"HTTP {s}")
    check("er-api sends Access-Control-Allow-Origin: * (so no proxy needed)", h.get("Access-Control-Allow-Origin") == "*", h.get("Access-Control-Allow-Origin"))
except Exception as e:
    check("open.er-api.com reachable", False, str(e))

summary = f"  {passed} passed, {failed} failed"
if skipped:
    summary += f", {skipped} skipped (platform-specific)"
print(f"\n{'='*62}\n{summary}\n{'='*62}\n")
sys.exit(1 if failed else 0)

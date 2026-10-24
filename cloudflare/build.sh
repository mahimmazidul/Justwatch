#!/usr/bin/env bash
#
# Builds the Next.js app into a Cloudflare Worker bundle.
#
#   ./build.sh              build (what CI and `npm run deploy` call)
#   ./build.sh --check      validate the configuration only, do not build
#
# Output lands in .open-next/: worker.js is the Worker entry point named by
# wrangler.jsonc, and assets/ holds the static client bundle that Cloudflare
# serves from the edge without invoking the Worker.
#
set -euo pipefail
cd "$(dirname "$0")"

CHECK_ONLY=0
[ "${1:-}" = "--check" ] && CHECK_ONLY=1

fail() { printf 'error: %s\n' "$1" >&2; exit 1; }
note() { printf '%s\n' "$1"; }

# --- Node version -----------------------------------------------------------
# Wrangler 4 refuses to run on Node 18 and below, and Next 16 needs Node 20+.
command -v node >/dev/null 2>&1 || fail "node was not found on PATH"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
	fail "Node 20 or newer is required (found $(node -v))"
fi

# --- D1 binding -------------------------------------------------------------
# The watchlist and trending-searches features need a D1 database. Creating one
# needs Cloudflare credentials, so it cannot be done from this script; the state
# is checked here instead of failing cryptically inside wrangler later.
#
# `d1_databases` ships as an empty array, so the normal case is no binding at
# all. Comments are still stripped first so that a hand-written commented-out
# example cannot be mistaken for a live binding, and so that a placeholder id
# left behind by an interrupted ./d1-setup.sh is caught rather than deployed.
WRANGLER_ACTIVE="$(sed -E '/^[[:space:]]*\/\//d; s:[[:space:]]//.*$::' wrangler.jsonc)"
# `|| true` because grep exits 1 when there is no binding, which is the normal
# state here, not an error - and pipefail would otherwise abort the build.
DB_ID="$(printf '%s\n' "$WRANGLER_ACTIVE" \
	| { grep -o '"database_id"[[:space:]]*:[[:space:]]*"[^"]*"' || true; } | head -1 \
	| sed 's/.*"\([^"]*\)"$/\1/')"
if [ -z "$DB_ID" ]; then
	note "note: no D1 binding - the site builds and deploys, but the watchlist"
	note "      and trending rail stay inert. Run ./d1-setup.sh to provision one,"
	note "      which needs Cloudflare credentials, or let CI do it on deploy."
elif [ "$DB_ID" = "REPLACE_WITH_D1_DATABASE_ID" ]; then
	cat >&2 <<'MSG'
error: wrangler.jsonc names a D1 binding but database_id is still the
placeholder, so wrangler would reject the deploy.

Resolve it automatically (creates the database if it does not exist yet, then
applies the migrations):

    ./d1-setup.sh

or drop the binding and deploy without persistence:

    ./d1-setup.sh --disable
MSG
	exit 1
else
	note "D1 binding: justwatch-db ($DB_ID)"
fi

if [ "$CHECK_ONLY" = "1" ]; then
	note "configuration OK"
	exit 0
fi

# --- dependencies -----------------------------------------------------------
if [ ! -d node_modules ]; then
	note "installing dependencies"
	npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund
fi

# --- build ------------------------------------------------------------------
# `opennextjs-cloudflare build` runs `next build` and then converts the output
# into the Worker bundle, so there is no separate next build step here.
note "building the Worker bundle"
npx opennextjs-cloudflare build

[ -f .open-next/worker.js ] || fail ".open-next/worker.js was not produced"
[ -d .open-next/assets ] || fail ".open-next/assets was not produced"

ASSET_FILES="$(find .open-next/assets -type f | wc -l | tr -d ' ')"
printf '\n.open-next/ ready: worker %s, %s static assets, %s total\n' \
	"$(du -h .open-next/worker.js | cut -f1)" \
	"$ASSET_FILES" \
	"$(du -sh .open-next | cut -f1)"

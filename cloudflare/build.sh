#!/usr/bin/env bash
#
# Publishes the Blazor WebAssembly app into ./dist, which is the directory
# Cloudflare uploads as static assets for BOTH deployment shapes:
#
#   Workers:  wrangler deploy                  (reads assets.directory in wrangler.jsonc)
#   Pages:    wrangler pages deploy dist       (takes the directory as an argument)
#
set -euo pipefail
cd "$(dirname "$0")"

# --pages additionally emits dist/_routes.json, which Pages needs (see below).
TARGET="${1:-workers}"

# --- locate the .NET SDK -----------------------------------------------------
if ! command -v dotnet >/dev/null 2>&1; then
	# ./.dotnet first: a previous run may already have bootstrapped it, and
	# re-downloading 200 MB on every rebuild is pointless.
	for candidate in "$PWD/.dotnet/dotnet" "$(dirname "$0")/.dotnet/dotnet" "$HOME/.dotnet/dotnet" /usr/share/dotnet/dotnet /usr/local/share/dotnet/dotnet /opt/dotnet/dotnet; do
		if [ -x "$candidate" ]; then
			export DOTNET_ROOT="$(cd "$(dirname "$candidate")" && pwd)"
			export PATH="$DOTNET_ROOT:$PATH"
			break
		fi
	done
fi

DOTNET_VERSION="${DOTNET_VERSION:-8.0}"

if ! command -v dotnet >/dev/null 2>&1; then
	# Cloudflare's build image ships .NET 3.1.302 with no way to select another
	# version, which cannot build a net8.0 Blazor app. Both Cloudflare's own
	# Blazor/Pages guide and the community do the same thing: install the SDK
	# into the build directory as part of the build. Skipped when dotnet is
	# already on PATH, so local builds are unaffected.
	if [ "${BOOTSTRAP_DOTNET:-1}" = "1" ]; then
		echo "dotnet not found - installing the .NET ${DOTNET_VERSION} SDK into ./.dotnet"
		curl -sSL --retry 3 https://dot.net/v1/dotnet-install.sh -o .dotnet-install.sh
		chmod +x .dotnet-install.sh
		./.dotnet-install.sh --channel "$DOTNET_VERSION" --install-dir ./.dotnet --no-path
		rm -f .dotnet-install.sh
		export DOTNET_ROOT="$PWD/.dotnet"
		export PATH="$DOTNET_ROOT:$PATH"
	else
		echo "error: the .NET ${DOTNET_VERSION} SDK was not found on PATH." >&2
		echo "       install it from https://dotnet.microsoft.com/download/dotnet/8.0" >&2
		echo "       or unset BOOTSTRAP_DOTNET=0 to let this script fetch it." >&2
		exit 1
	fi
fi

export DOTNET_CLI_TELEMETRY_OPTOUT=1
export DOTNET_NOLOGO=1

# --- publish -----------------------------------------------------------------
rm -rf .publish dist
dotnet publish ../source/JustWatchSearch/JustWatchSearch.csproj -c Release -o .publish --nologo

cp -R .publish/wwwroot dist

# NOTE: deliberately no dist/_redirects file.
#
# The old Pages recipe for single-page apps was `/* /index.html 200`. Cloudflare
# Pages now runs on the Workers static-assets engine, which strips `.html` and
# `/index` from URLs itself — so that rule matches its own output and Cloudflare
# rejects the whole deploy with "Infinite loop detected in this rule [code: 100324]".
#
# SPA fallback is already covered twice over without it:
#   - Workers: assets.not_found_handling = "single-page-application" in wrangler.jsonc
#   - Pages:   built-in SPA detection, because dist/ has no top-level 404.html
#
# Both make /title/tm305113 and /search?q=dune return index.html with HTTP 200.

rm -rf .publish

if [ "$TARGET" = "--pages" ] || [ "$TARGET" = "pages" ]; then
	# Pages-only: the moment a project has a functions/ directory, Pages invokes a
	# Function for EVERY request by default — including all 219 static files, which
	# burns the 100k/day free allowance on plain page loads. _routes.json restricts
	# invocations to /proxy/* so the Blazor app itself stays free and edge-cached.
	#
	# Workers does not use this file; it gets the same effect from
	# assets.run_worker_first = ["/proxy/*"] in wrangler.jsonc.
	cat > dist/_routes.json <<'JSON'
{
  "version": 1,
  "include": ["/proxy/*"],
  "exclude": []
}
JSON
	printf 'dist/_routes.json written (Pages: Functions run on /proxy/* only)\n'
fi

printf 'dist/ ready: %s, %s files\n' "$(du -sh dist | cut -f1)" "$(find dist -type f | wc -l | tr -d ' ')"

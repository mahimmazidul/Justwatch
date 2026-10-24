#!/usr/bin/env bash
#
# Provisions the D1 database and binds it in wrangler.jsonc.
#
#   ./d1-setup.sh            create the database if needed, write its id in
#   ./d1-setup.sh --disable  remove the binding (watchlist and trending go inert)
#   ./d1-setup.sh --status   report what is currently bound, change nothing
#
# Idempotent, and safe to run on every CI build: `wrangler d1 create` is NOT
# idempotent (running it twice makes two databases), so this looks the database
# up by name first and only creates it when nothing matches.
#
# wrangler.jsonc ships with an empty "d1_databases": [] so that a fresh clone
# builds and deploys with no Cloudflare account at all. This script is what turns
# persistence on, and it edits the config in place - in CI that edit lives only
# for the duration of the run, which is enough, because the next run resolves the
# same database by name again.
#
set -euo pipefail
cd "$(dirname "$0")"

CONFIG="wrangler.jsonc"
DB_NAME="justwatch-db"
MODE="enable"
case "${1:-}" in
	--disable) MODE="disable" ;;
	--status) MODE="status" ;;
	"") ;;
	*) printf 'usage: %s [--disable|--status]\n' "$0" >&2; exit 2 ;;
esac

# The current database_id, empty when the binding is absent or empty.
current_id() {
	python3 - "$CONFIG" <<'PY'
import json, re, sys
src = open(sys.argv[1]).read()
# strip // comments so the JSONC parses as JSON
src = re.sub(r'^\s*//.*$', '', src, flags=re.M)
src = re.sub(r'(?<!:)//.*$', '', src, flags=re.M)
try:
    cfg = json.loads(src)
except Exception:
    sys.exit(0)
for db in cfg.get("d1_databases") or []:
    if db.get("binding") == "DB":
        print(db.get("database_id") or "")
        break
PY
}

# Write the binding in, or take it back out, without disturbing the comments.
write_binding() {
	local id="$1" python_arg="$2"
	ID="$id" CFG="$CONFIG" python3 - "$python_arg" <<'PY'
import os, re, sys
mode = sys.argv[1]
path = os.environ["CFG"]
db_id = os.environ.get("ID", "")
src = open(path).read()

block = ('\t"d1_databases": [\n'
         '\t\t{\n'
         '\t\t\t"binding": "DB",\n'
         '\t\t\t"database_name": "justwatch-db",\n'
         '\t\t\t"database_id": "%s",\n'
         '\t\t\t"migrations_dir": "./migrations"\n'
         '\t\t}\n'
         '\t],' % db_id)
empty = '\t"d1_databases": [],'

# Match either form, whatever indentation or whitespace it currently has.
pattern = re.compile(r'^\t"d1_databases": \[(?:[^\[\]]|\[[^\]]*\])*\],\s*$', re.M)
if not pattern.search(src):
    raise SystemExit("could not find a d1_databases key in %s" % path)
src = pattern.sub(block if mode == "enable" else empty, src, count=1)
open(path, "w").write(src)
PY
}

have_id="$(current_id)"

if [ "$MODE" = "status" ]; then
	if [ -n "$have_id" ]; then
		printf 'D1 bound: %s (%s)\n' "$DB_NAME" "$have_id"
	else
		printf 'D1 not bound: "d1_databases" is empty, so the watchlist and the\n'
		printf 'trending rail fall back to defaults. Run ./d1-setup.sh to bind one.\n'
	fi
	exit 0
fi

if [ "$MODE" = "disable" ]; then
	write_binding "" disable
	printf 'D1 binding removed from %s.\n' "$CONFIG"
	printf 'The site still builds and deploys; /api/health will report\n'
	printf 'database "not-configured" and the watchlist explains itself.\n'
	exit 0
fi

if [ -n "$have_id" ]; then
	printf 'D1 already bound: %s (%s)\n' "$DB_NAME" "$have_id"
	exit 0
fi

# --- resolve or create -------------------------------------------------------
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] && [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
	if ! npx --no-install wrangler whoami >/dev/null 2>&1; then
		cat >&2 <<MSG
error: cannot provision D1 without Cloudflare credentials.

Either authenticate interactively:

    npx wrangler login
    ./d1-setup.sh

or export them:

    export CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=...
    ./d1-setup.sh

The token needs D1 Edit in addition to Workers Script Edit; the "Edit Cloudflare
Workers" template on its own is not enough.

To build and deploy without a database instead:

    ./d1-setup.sh --disable
MSG
		exit 1
	fi
fi

printf 'Looking for an existing D1 database named %s\n' "$DB_NAME"
list_json="$(npx --no-install wrangler d1 list --json 2>/dev/null || true)"
resolved="$(printf '%s' "$list_json" | NAME="$DB_NAME" python3 -c '
import json, os, sys
try:
    rows = json.load(sys.stdin)
except Exception:
    sys.exit(0)
for r in rows if isinstance(rows, list) else []:
    if r.get("name") == os.environ["NAME"]:
        print(r.get("uuid") or "")
        break
' 2>/dev/null || true)"

if [ -n "$resolved" ]; then
	printf 'Found it: %s\n' "$resolved"
else
	printf 'Not found - creating %s\n' "$DB_NAME"
	npx --no-install wrangler d1 create "$DB_NAME"
	list_json="$(npx --no-install wrangler d1 list --json)"
	resolved="$(printf '%s' "$list_json" | NAME="$DB_NAME" python3 -c '
import json, os, sys
rows = json.load(sys.stdin)
for r in rows if isinstance(rows, list) else []:
    if r.get("name") == os.environ["NAME"]:
        print(r.get("uuid") or "")
        break
')"
	if [ -z "$resolved" ]; then
		printf 'error: created the database but could not read its id back from `wrangler d1 list`.\n' >&2
		exit 1
	fi
	printf 'Created: %s\n' "$resolved"
fi

write_binding "$resolved" enable
printf 'Wrote the binding into %s\n' "$CONFIG"

printf 'Applying migrations from ./migrations\n'
npx --no-install wrangler d1 migrations apply "$DB_NAME" --remote
printf '\nD1 is ready: %s (%s)\n' "$DB_NAME" "$resolved"

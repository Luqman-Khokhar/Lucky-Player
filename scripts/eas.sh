#!/usr/bin/env bash
# Runs eas-cli as the personal Expo account named in app.json "owner", regardless of which
# account is logged in globally. The token is read from EXPO_TOKEN in .env.
#
#   bash scripts/eas.sh whoami
#   bash scripts/eas.sh build -p android --profile preview
set -euo pipefail
cd "$(dirname "$0")/.."

die() {
  echo "eas.sh: $*" >&2
  exit 1
}

[ -f .env ] || die ".env missing. Copy .env.example to .env and set EXPO_TOKEN."

# Read the single key; never source .env.
EXPO_TOKEN="$(grep -E '^EXPO_TOKEN=' .env | head -1 | cut -d= -f2- | tr -d '\r' || true)"
[ -n "$EXPO_TOKEN" ] || die "EXPO_TOKEN is empty in .env"
export EXPO_TOKEN

if command -v eas >/dev/null 2>&1; then
  EAS=(eas)
else
  EAS=(npx --yes eas-cli)
fi

OWNER="$(node -p "require('./app.json').expo.owner || ''")"
[ -n "$OWNER" ] || die "app.json has no expo.owner"

WHOAMI="$("${EAS[@]}" whoami 2>/dev/null | grep -vE '^\s*$|eas-cli|upgrade|Proceeding' | head -1 | awk '{print $1}' || true)"
[ "$WHOAMI" = "$OWNER" ] || die "EXPO_TOKEN belongs to '${WHOAMI:-no account}', but app.json owner is '$OWNER'"

exec "${EAS[@]}" "$@"

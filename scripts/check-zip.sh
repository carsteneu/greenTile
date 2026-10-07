#!/usr/bin/env bash
# Verify the release zip: it must ship exactly the runtime files (the
# build-release.sh list) and nothing dev-only, and every shipped .js must parse.
# Shared by ci.yml (every push) and release-dispatch.yml (before publishing), so
# the artifact that is actually released is checked, not only a branch build.
#
# Usage: scripts/check-zip.sh [path/to/greenTile-X.Y.Z.zip]
set -euo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)

ZIP=${1:-}
if [ -z "$ZIP" ]; then
    ZIP=$(ls "$ROOT"/dist/*.zip 2>/dev/null | head -n1 || true)
fi
if [ -z "$ZIP" ] || [ ! -f "$ZIP" ]; then
    echo "check-zip: no zip found — run ./build-release.sh first" >&2
    exit 1
fi

# Staging stays inside the repo (git-ignored), never /tmp.
WORKROOT="$ROOT/.yesmem/tmp"
mkdir -p "$WORKROOT"
WORK=$(mktemp -d "$WORKROOT/check-zip.XXXXXX")
trap 'rm -rf "$WORK"' EXIT

unzip -Z1 "$ZIP" > "$WORK/zip.lst"
root=$(head -n1 "$WORK/zip.lst")
for f in install.sh update.sh greenTile@carsteneu/extension.js greenTile@carsteneu/metadata.json \
         greenTile@carsteneu/settings-schema.json greenTile@carsteneu/stylesheet.css \
         greenTile@carsteneu/icon.png greenTile@carsteneu/LICENSE \
         greenTile@carsteneu/lib/app/app.js greenTile@carsteneu/po/de.po; do
    grep -qx "$root$f" "$WORK/zip.lst" || { echo "check-zip: missing in zip: $f" >&2; exit 1; }
done
if grep -E '(package(-lock)?\.json|tsconfig|eslint|/types/|/tests/|node_modules|\.github|/docs/|greenTile\.js$)' "$WORK/zip.lst"; then
    echo "check-zip: dev-only or obsolete files in the zip" >&2; exit 1
fi
mkdir "$WORK/unpacked"
unzip -q "$ZIP" -d "$WORK/unpacked"
find "$WORK/unpacked" -name '*.js' -print0 | xargs -0 -n1 node --check
echo "zip ok: $(wc -l < "$WORK/zip.lst") entries"

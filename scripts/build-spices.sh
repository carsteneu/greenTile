#!/usr/bin/env bash
# Assemble the Cinnamon Spices submission layout for greenTile:
#
#   <dest>/info.json  screenshot.png  README.md
#   <dest>/files/greenTile@carsteneu/{extension.js,metadata.json,settings-schema.json,
#                                    stylesheet.css,icon.png,LICENSE,lib/**,po/*}
#
# The layout differs from the GitHub release zip (build-release.sh): the runtime
# files sit under files/<UUID>/ instead of the zip root, and install.sh/update.sh
# are left out — the Spices installer copies files/<UUID>/ into the extensions
# directory itself, so a shell installer inside the xlet directory is not part of
# the submission (nothing beyond the extension's own source directory).
#
# The source is the git tag v<metadata.json version>, not the working copy, so the
# submission is reproducible from the released tree. For an unreleased tree pass
# SPICES_REF=<ref>.
#
# The tree is assembled and checked in a temp dir first, and <dest> is replaced
# only once it passed: a failing run never leaves a half-built submission behind.
#
# Usage: scripts/build-spices.sh [destination]
set -euo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
UUID=greenTile@carsteneu
cd "$ROOT"

VER=$(python3 -c 'import json; print(json.load(open("metadata.json"))["version"])')
REF=${SPICES_REF:-v$VER}
DEST=${1:-dist/spices/$UUID}

case $DEST in
    /|"$HOME"|"$ROOT"|'')
        echo "build-spices: refusing to replace '$DEST'" >&2
        exit 1
        ;;
esac

if ! git rev-parse --verify --quiet "refs/tags/$REF^{commit}" >/dev/null &&
    ! git rev-parse --verify --quiet "$REF^{commit}" >/dev/null; then
    echo "build-spices: ref '$REF' not found — pass SPICES_REF=<ref> for an unreleased tree" >&2
    exit 1
fi

# Staging stays inside the repo (git-ignored), never /tmp — same as check-zip.sh.
WORKROOT="$ROOT/.yesmem/tmp"
mkdir -p "$WORKROOT"
WORK=$(mktemp -d "$WORKROOT/spices.XXXXXX")
trap 'rm -rf "$WORK"' EXIT
git archive "$REF" | tar -x -C "$WORK"

# Listing level: what GitHub and the Spices website show.
OUT="$WORK/submission"
mkdir -p "$OUT/files/$UUID/po"
cp "$WORK/spices/$UUID/info.json" "$WORK/spices/$UUID/README.md" \
   "$WORK/spices/$UUID/screenshot.png" "$OUT/"

# Runtime level: what Cinnamon installs, under files/<UUID>/.
F="$OUT/files/$UUID"
cp "$WORK/extension.js" "$WORK/metadata.json" "$WORK/settings-schema.json" \
   "$WORK/stylesheet.css" "$WORK/icon.png" "$WORK/LICENSE" "$F/"
cp -R "$WORK/lib" "$F/lib"
cp "$WORK/po/"*.po "$WORK/po/"*.pot "$F/po/"

# Invariants validate-spice enforces — fail here instead of at submission time.
if [ "$(ls -A "$OUT/files" | wc -l)" -ne 1 ] || [ ! -d "$F" ]; then
    echo "build-spices: files/ must contain only the $UUID directory" >&2
    exit 1
fi
if find "$OUT" \( -name '*.mo' -o -name 'install.sh' -o -name 'update.sh' \
        -o -name 'package*.json' -o -name 'tsconfig.json' -o -name '*eslint*' \
        -o -name '*.bak' \) -print -quit | grep -q .; then
    echo "build-spices: dev-only or forbidden file in the layout" >&2
    exit 1
fi
if [ "$(find "$F/po" -name '*.pot' | wc -l)" -ne 1 ]; then
    echo "build-spices: po/ must hold exactly one .pot template" >&2
    exit 1
fi
if [ "$(ls "$F/po/" | wc -l)" -ne "$(ls "$WORK/po/" | wc -l)" ]; then
    echo "build-spices: po/ does not match the $REF tree" >&2
    exit 1
fi

rm -rf "$DEST"
mkdir -p "$(dirname -- "$DEST")"
cp -R "$OUT" "$DEST"

echo "built $DEST (ref $REF, version $VER)"

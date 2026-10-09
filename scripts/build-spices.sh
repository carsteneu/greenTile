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
# Usage: scripts/build-spices.sh [destination]
set -euo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
UUID=greenTile@carsteneu
cd "$ROOT"

VER=$(python3 -c 'import json; print(json.load(open("metadata.json"))["version"])')
REF=${SPICES_REF:-v$VER}
DEST=${1:-dist/spices/$UUID}

if ! git rev-parse --verify --quiet "refs/tags/$REF^{commit}" >/dev/null &&
    ! git rev-parse --verify --quiet "$REF^{commit}" >/dev/null; then
    echo "build-spices: ref '$REF' not found — pass SPICES_REF=<ref> for an unreleased tree" >&2
    exit 1
fi

STAGE=$ROOT/.yesmem/tmp/spices-stage
rm -rf "$STAGE" "$DEST"
mkdir -p "$STAGE" "$DEST/files/$UUID/po"
git archive "$REF" | tar -x -C "$STAGE"

# Listing level: what GitHub and the Spices website show.
cp "$STAGE/spices/$UUID/info.json" "$STAGE/spices/$UUID/README.md" \
   "$STAGE/spices/$UUID/screenshot.png" "$DEST/"

# Runtime level: what Cinnamon installs, under files/<UUID>/.
F="$DEST/files/$UUID"
cp "$STAGE/extension.js" "$STAGE/metadata.json" "$STAGE/settings-schema.json" \
   "$STAGE/stylesheet.css" "$STAGE/icon.png" "$STAGE/LICENSE" "$F/"
cp -R "$STAGE/lib" "$F/lib"
cp "$STAGE/po/"*.po "$STAGE/po/"*.pot "$F/po/"
rm -rf "$STAGE"

# Invariants validate-spice enforces — fail here instead of at submission time.
if [ "$(ls -A "$DEST/files" | wc -l)" -ne 1 ] || [ ! -d "$F" ]; then
    echo "build-spices: files/ must contain only the $UUID directory" >&2
    exit 1
fi
if find "$DEST" \( -name '*.mo' -o -name 'install.sh' -o -name 'update.sh' \
        -o -name 'package*.json' -o -name 'tsconfig.json' -o -name '.eslintrc*' \) \
        -print -quit | grep -q .; then
    echo "build-spices: dev-only or forbidden file in the layout" >&2
    exit 1
fi
if [ "$(ls "$F/po/" | wc -l)" -ne "$(ls "$ROOT/po/" | wc -l)" ]; then
    echo "build-spices: po/ does not match the source tree" >&2
    exit 1
fi

echo "built $DEST (ref $REF, version $VER)"

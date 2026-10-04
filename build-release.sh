#!/usr/bin/env bash
# Builds dist/greenTile-<version>.zip: install.sh, update.sh plus the
# greenTile@carsteneu/ folder with the runtime files (no README, tests, docs
# or research). Tag and attach the zip to a GitHub Release after checking it.
set -eu

UUID=greenTile@carsteneu
VER=$(python3 -c 'import json; print(json.load(open("metadata.json"))["version"])')
STAGE="dist/greenTile-$VER"

# A catalog that does not compile would only break in install.sh after the
# release was published — stop here, before the existing artifact is removed.
./scripts/check-catalogs.sh

rm -rf "$STAGE" "dist/greenTile-$VER.zip"
mkdir -p "$STAGE/$UUID/po"
cp extension.js metadata.json settings-schema.json stylesheet.css icon.png LICENSE "$STAGE/$UUID/"
cp -R lib "$STAGE/$UUID/lib"
cp po/*.po "$STAGE/$UUID/po/"
cp install.sh update.sh "$STAGE/"
chmod +x "$STAGE/install.sh" "$STAGE/update.sh"

(cd dist && zip -qr "greenTile-$VER.zip" "greenTile-$VER")
echo "built dist/greenTile-$VER.zip"

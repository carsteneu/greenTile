#!/usr/bin/env bash
# Builds dist/greenTile-<version>.zip: install.sh, update.sh plus the
# greenTile@carsteneu/ folder with the runtime files (no README, tests, docs
# or research). Tag and attach the zip to a GitHub Release after checking it.
set -eu

UUID=greenTile@carsteneu
VER=$(python3 -c 'import json; print(json.load(open("metadata.json"))["version"])')
STAGE="dist/greenTile-$VER"

rm -rf "$STAGE" "dist/greenTile-$VER.zip"
mkdir -p "$STAGE/$UUID/po"
cp greenTile.js extension.js metadata.json settings-schema.json stylesheet.css icon.png "$STAGE/$UUID/"
cp po/*.po "$STAGE/$UUID/po/"
cp install.sh update.sh "$STAGE/"
chmod +x "$STAGE/install.sh" "$STAGE/update.sh"

(cd dist && zip -qr "greenTile-$VER.zip" "greenTile-$VER")
echo "built dist/greenTile-$VER.zip"

#!/usr/bin/env bash
# Installs greenTile for the current user: copies the extension into
# ~/.local/share/cinnamon/extensions/ and compiles the translations.
# Run it from the unpacked release zip (install.sh sits next to greenTile@carsteneu/).
set -eu

UUID=greenTile@carsteneu
HERE=$(cd "$(dirname "$0")" && pwd)
SRC="$HERE/$UUID"
DEST="$HOME/.local/share/cinnamon/extensions/$UUID"

if [ ! -d "$SRC" ]; then
    echo "install.sh: $SRC not found — run this script from the unpacked release zip." >&2
    exit 1
fi

mkdir -p "$DEST"
cp "$SRC"/*.js "$SRC"/*.json "$SRC"/*.css "$SRC"/icon.png "$DEST/"

# Translations need gettext's msgfmt; without it the extension still works (English).
if command -v msgfmt >/dev/null; then
    for po in "$SRC"/po/*.po; do
        lang=$(basename "$po" .po)
        d="$HOME/.local/share/locale/$lang/LC_MESSAGES"
        mkdir -p "$d"
        msgfmt -o "$d/$UUID.mo" "$po"
    done
else
    echo "Note: msgfmt (package gettext) not found — translations were not installed."
fi

echo "greenTile $UUID installed to $DEST"
echo "Restart Cinnamon (Ctrl+Alt+Esc, or Alt+F2 then r) or log out and back in, then enable it:"
echo "System Settings → Extensions → greenTile → turn on."

#!/usr/bin/env bash
# Installs greenTile for the current user: copies the extension into
# ~/.local/share/cinnamon/extensions/ and compiles the translations.
# Run it from the unpacked release zip (install.sh sits next to greenTile@carsteneu/).
# The complete new installation is staged next to the destination and
# validated; the old one is only replaced by a directory rename, and restored
# if that rename fails.
set -eu

UUID=greenTile@carsteneu
HERE=$(cd "$(dirname "$0")" && pwd)
SRC="$HERE/$UUID"
DEST="$HOME/.local/share/cinnamon/extensions/$UUID"

if [ ! -d "$SRC" ]; then
    echo "install.sh: $SRC not found — run this script from the unpacked release zip." >&2
    exit 1
fi
for f in metadata.json extension.js settings-schema.json stylesheet.css icon.png LICENSE; do
    [ -f "$SRC/$f" ] || { echo "install.sh: $f is missing in $SRC — run this script from an unpacked greenTile release zip." >&2; exit 1; }
done

PARENT=$(dirname "$DEST")
mkdir -p "$PARENT"
STAGE=$(mktemp -d "$PARENT/.greenTile-install.XXXXXX")
RESTORE_FAILED=""
cleanup() {
    # If even the restore failed, the backup inside the stage is the user's
    # only copy — keep it and point the way back, instead of removing it.
    if [ -n "$RESTORE_FAILED" ]; then
        echo "install.sh: your previous installation is preserved at $STAGE/old — move it back to $DEST by hand." >&2
        return
    fi
    rm -rf "$STAGE"
}
trap cleanup EXIT
NEW="$STAGE/$UUID"

# Stage everything first: a failure up to the swap leaves the previous
# installation untouched. Translations are compiled here too, so a broken
# .po file aborts before the extension is replaced.
mkdir "$NEW"
cp "$SRC"/*.js "$SRC"/*.json "$SRC"/*.css "$SRC"/icon.png "$SRC"/LICENSE "$NEW/"
cp -R "$SRC/lib" "$NEW/lib"
if command -v msgfmt >/dev/null; then
    for po in "$SRC"/po/*.po; do
        [ -e "$po" ] || break  # no .po files in this package
        lang=$(basename "$po" .po)
        mkdir -p "$STAGE/locale/$lang/LC_MESSAGES"
        msgfmt -o "$STAGE/locale/$lang/LC_MESSAGES/$UUID.mo" "$po"
    done
else
    echo "Note: msgfmt (package gettext) not found — translations were not installed."
fi

for f in metadata.json extension.js settings-schema.json stylesheet.css icon.png lib; do
    [ -e "$NEW/$f" ] || { echo "install.sh: staged $f is missing — aborting, your installation is unchanged." >&2; exit 1; }
done
[ -n "$(ls -A "$NEW/lib")" ] || { echo "install.sh: staged lib/ is empty — aborting, your installation is unchanged." >&2; exit 1; }

# Replace the old installation wholesale: one rename puts the new tree in
# place, so no partial or mixed state can survive; files the package does not
# ship (stale modules, leftover po/, a stray old LICENSE) vanish with it. A
# failed swap moves the backup back; if even that fails, the EXIT trap keeps
# the backup and points at it — it is the only surviving copy.
BACKUP="$STAGE/old"
if [ -e "$DEST" ]; then
    mv "$DEST" "$BACKUP"
fi
if [ -e "$DEST" ]; then
    # $DEST is back while our backup holds the moved-away tree — most likely
    # a second install.sh running concurrently; do not touch anything.
    echo "install.sh: $DEST appeared during the install (another install.sh running?) — aborting, nothing was changed." >&2
    exit 1
fi
if ! mv "$NEW" "$DEST"; then
    if [ -e "$BACKUP" ]; then
        if mv "$BACKUP" "$DEST"; then
            echo "install.sh: could not replace $DEST — your previous installation is intact and restored." >&2
        else
            RESTORE_FAILED=1
            echo "install.sh: replacing $DEST failed and the backup could not be restored — the previous installation is preserved at $BACKUP. Move it back to $DEST by hand." >&2
        fi
    else
        echo "install.sh: could not install to $DEST — nothing was changed." >&2
    fi
    exit 1
fi

for mofile in "$STAGE"/locale/*/LC_MESSAGES/*.mo; do
    [ -e "$mofile" ] || continue
    lang=$(basename "$(dirname "$(dirname "$mofile")")")
    # same failure class as the mv below: report, keep going
    if ! mkdir -p "$HOME/.local/share/locale/$lang/LC_MESSAGES"; then
        echo "Note: could not install the $lang translation — the extension works without it (English)." >&2
        continue
    fi
    if ! mv "$mofile" "$HOME/.local/share/locale/$lang/LC_MESSAGES/$UUID.mo"; then
        echo "Note: could not install the $lang translation — the extension works without it (English)." >&2
    fi
done

echo "greenTile $UUID installed to $DEST"
echo "Restart Cinnamon (Ctrl+Alt+Esc, or Alt+F2 then r) or log out and back in, then enable it:"
echo "System Settings → Extensions → greenTile → turn on."

#!/usr/bin/env bash
# Installs greenTile for the current user: copies the extension into
# ~/.local/share/cinnamon/extensions/ and compiles the translations.
# Run it from the unpacked release zip (install.sh sits next to greenTile@carsteneu/).
# The complete new installation is staged next to the destination and
# validated; the previous one is only taken out of the way by a directory
# rename, and it stays recoverable until the swap has succeeded.
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
cleanup() {
    # $STAGE/old holds the previous installation from the moment it is moved
    # aside until the swap or a restore has put a tree back at $DEST. While it
    # is there it is the user's only copy, so it is never deleted: if $DEST is
    # free again the tree goes back, otherwise the stage is kept and printed.
    if [ -n "$STAGE" ] && { [ -e "$STAGE/old" ] || [ -L "$STAGE/old" ]; }; then
        if [ ! -e "$DEST" ] && [ ! -L "$DEST" ] && mv -T "$STAGE/old" "$DEST"; then
            echo "install.sh: the previous installation is back in place at $DEST." >&2
            rm -rf "$STAGE"
            STAGE=""
        else
            echo "install.sh: your previous installation is preserved at $STAGE/old — move it back to $DEST by hand." >&2
        fi
        return
    fi
    if [ -n "$STAGE" ]; then
        rm -rf "$STAGE"
    fi
}
trap cleanup EXIT
# Catchable termination must still report or restore. SIGKILL cannot be caught:
# then the stage with the backup simply stays on disk, without a message.
trap 'exit 143' TERM
trap 'exit 130' INT
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
# ship (stale modules, leftover po/, a stray old LICENSE) vanish with it. mv -T
# treats the target as a plain name instead of a container, so a $DEST that
# another install.sh recreates in between makes the rename fail instead of
# nesting the tree inside it; the previous installation then goes back via the
# EXIT trap. -T is coreutils mv (Linux, the only platform Cinnamon runs on);
# where it is missing the rename fails and the previous installation is put
# back rather than nested into a directory that is not ours.
BACKUP="$STAGE/old"
if [ -e "$DEST" ] || [ -L "$DEST" ]; then
    # Hand the previous tree to the stage: from here on this is its only copy.
    if ! mv -T "$DEST" "$BACKUP"; then
        echo "install.sh: another install.sh moved $DEST away first — aborting, nothing of yours was changed." >&2
        exit 1
    fi
fi
if [ -e "$DEST" ] || [ -L "$DEST" ]; then
    # $DEST is back while the stage holds the tree we moved aside — most likely
    # a second install.sh. Never publish over what it wrote and never discard
    # the copy we hold: the EXIT trap reports where it is.
    echo "install.sh: another install.sh wrote to $DEST in the meantime — aborting without touching it." >&2
    exit 1
fi
if ! mv -T "$NEW" "$DEST"; then
    if [ -e "$BACKUP" ] || [ -L "$BACKUP" ]; then
        echo "install.sh: could not replace $DEST." >&2
    else
        echo "install.sh: could not install to $DEST — nothing was changed." >&2
    fi
    exit 1
fi
# The swap succeeded: the new tree is at $DEST, the copy in the stage is
# superseded and must not keep the stage alive.
rm -rf "$BACKUP"

# The extension loads translations from GLib.get_user_data_dir()/locale (the
# XDG data dir); mirror that here instead of hardcoding ~/.local/share.
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}"
for mofile in "$STAGE"/locale/*/LC_MESSAGES/*.mo; do
    [ -e "$mofile" ] || continue
    lang=$(basename "$(dirname "$(dirname "$mofile")")")
    # same failure class as the mv below: report, keep going
    if ! mkdir -p "$DATA_DIR/locale/$lang/LC_MESSAGES"; then
        echo "Note: could not install the $lang translation — the extension works without it (English)." >&2
        continue
    fi
    if ! mv "$mofile" "$DATA_DIR/locale/$lang/LC_MESSAGES/$UUID.mo"; then
        echo "Note: could not install the $lang translation — the extension works without it (English)." >&2
    fi
done

echo "greenTile $UUID installed to $DEST"
echo "The files on disk are the new version now. If greenTile was already loaded, Cinnamon keeps"
echo "that code: reloading or toggling the extension re-reads only extension.js, so replaced code"
echo "under lib/ becomes active after a Cinnamon restart, not by itself."
echo "Restart Cinnamon: Ctrl+Alt+Esc, or Alt+F2 then r. Wayland has no such restart — log out"
echo "and back in instead."
echo "Then enable it: System Settings → Extensions → greenTile → turn on."

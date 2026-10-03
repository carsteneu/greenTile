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
# A catchable signal must still report or restore. SIGKILL cannot be caught:
# then the stage with the backup simply stays on disk, without a message.
trap 'exit 143' TERM
trap 'exit 130' INT

# What sits at $DEST right now. A tree that is no longer this one was published
# by another install.sh meanwhile and is not ours to move away.
DEST_ID=""
if [ -e "$DEST" ] || [ -L "$DEST" ]; then
    DEST_ID=$(stat -c %i "$DEST" 2>/dev/null || true)
fi

# Set once the staged tree has taken the place of the previous installation:
# from then on the previous tree is superseded and must never be put back — even
# if $DEST looks free for a moment because a competing installer moved our just
# published tree aside. Without this the EXIT trap undid a finished install.
PUBLISHED=0

STAGE=$(mktemp -d "$PARENT/.greenTile-install.XXXXXX")
NEW="$STAGE/$UUID"
BACKUP="$STAGE/old"
cleanup() {
    trap - TERM INT
    if [ -z "${STAGE:-}" ]; then
        return
    fi
    # $BACKUP holds the previous installation from the moment it is moved aside.
    # It is the user's only copy only until this run has published: after a
    # successful rename NEW is gone, even if a signal preceded PUBLISHED=1 and a
    # competitor now holds that published tree. An empty DEST alone is not proof
    # of a failed publication. Before publication NEW still exists: the backup
    # goes back if DEST is free, otherwise its path is printed and the stage kept.
    if [ "$PUBLISHED" = 0 ] &&
        { [ -e "$BACKUP" ] || [ -L "$BACKUP" ]; } &&
        { [ -e "$NEW" ] || [ -L "$NEW" ]; }; then
        if [ ! -e "$DEST" ] && [ ! -L "$DEST" ] && mv -T "$BACKUP" "$DEST"; then
            echo "install.sh: the previous installation is back in place at $DEST." >&2
            rm -rf "$STAGE"
        else
            echo "install.sh: your previous installation is preserved at $BACKUP — move it back to $DEST by hand." >&2
        fi
        return
    fi
    rm -rf "$STAGE"
}
trap cleanup EXIT

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
# another install.sh creates in between makes the rename fail instead of
# nesting the tree inside it, and the previous installation goes back via the
# EXIT trap. -T is coreutils mv, i.e. GNU/Linux, the only platform Cinnamon
# runs on; where it is missing the swap fails and this installer aborts with
# the previous installation untouched — it never falls back to a nesting mv.
if [ -e "$DEST" ] || [ -L "$DEST" ]; then
    # Only the tree from the start of this run may be handed to the stage. The
    # check before the rename cannot be atomic, so the rename itself is the
    # step that counts and what it moved is identified afterwards: the stage
    # then holds exactly the tree that was at $DEST in that instant.
    if [ "$(stat -c %i "$DEST" 2>/dev/null || true)" != "$DEST_ID" ]; then
        echo "install.sh: $DEST was replaced while this install was preparing — aborting without touching it." >&2
        exit 1
    fi
    if ! mv -T "$DEST" "$BACKUP"; then
        echo "install.sh: could not move $DEST aside — aborting, nothing of yours was changed." >&2
        exit 1
    fi
    if [ "$(stat -c %i "$BACKUP" 2>/dev/null || true)" != "$DEST_ID" ]; then
        # not the tree this install looked at: another install.sh published
        # meanwhile, so its installation goes back untouched
        if mv -T "$BACKUP" "$DEST" 2>/dev/null; then
            echo "install.sh: another install.sh published to $DEST while this one was preparing — aborting, its installation is back in place." >&2
        else
            # $BACKUP is that other tree, not this user's previous installation:
            # keep the stage and stop the EXIT trap from reporting it as ours.
            echo "install.sh: another install.sh published to $DEST while this one was preparing — aborting, its tree is preserved at $BACKUP." >&2
            STAGE=""
        fi
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
PUBLISHED=1
# The swap succeeded: the new tree is at $DEST and the staged copy has left the
# stage, so the EXIT trap no longer keeps the stage for the previous one.

# The extension loads translations from GLib.get_user_data_dir()/locale (the
# XDG data dir); mirror that here instead of hardcoding ~/.local/share.
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}"
for mofile in "$STAGE"/locale/*/LC_MESSAGES/*.mo; do
    [ -e "$mofile" ] || continue
    lang=$(basename "$(dirname "$(dirname "$mofile")")")
    modest="$DATA_DIR/locale/$lang/LC_MESSAGES/$UUID.mo"
    # same failure class as the mv below: report, keep going
    if ! mkdir -p "$DATA_DIR/locale/$lang/LC_MESSAGES"; then
        echo "Note: could not install the $lang translation — the extension works without it (English)." >&2
        continue
    fi
    # Only a plain file is a catalogue we may replace. A directory — or a
    # symlink to one — would make a plain mv move the catalogue *inside* it
    # and still exit 0, leaving the path the loader reads as a directory: a
    # silent false success. Never delete what the user put there; name the
    # concrete path and keep the English fallback instead.
    if { [ -e "$modest" ] || [ -L "$modest" ]; } &&
        { [ ! -f "$modest" ] || [ -L "$modest" ]; }; then
        echo "Note: $modest exists and is not a plain file — the $lang translation was not installed; the extension works without it (English)." >&2
        continue
    fi
    # -T: the destination is a name, never a container, so anything that
    # appears between the check above and the move fails the rename instead
    # of nesting the catalogue inside it.
    if ! mv -T "$mofile" "$modest"; then
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

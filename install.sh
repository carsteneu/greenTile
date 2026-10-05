#!/usr/bin/env bash
# Installs greenTile for the current user: copies the extension into
# ~/.local/share/cinnamon/extensions/ and compiles the translations.
# Run it from the unpacked release zip (install.sh sits next to greenTile@carsteneu/).
# The complete new installation is staged next to the destination and
# validated; the previous one is only taken out of the way by a directory
# rename, and it stays recoverable until the swap has succeeded. Cooperating
# installs for the same account serialize on one flock next to the destination.
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

# Cooperative installers for the same account serialize on one lock: the second
# one fails clearly instead of interleaving with the first. The lock file is
# never removed — unlinking it would let a later installer lock a different
# inode — and flock releases the lock automatically when this process ends.
command -v flock >/dev/null || {
    echo "install.sh: need flock (package util-linux) to serialize installs." >&2
    exit 1
}
LOCK="$PARENT/.greenTile.lock"
exec 9>>"$LOCK"
if ! flock -n 9; then
    echo "install.sh: another greenTile install is already running for this account — try again once it finished." >&2
    exit 1
fi

# A catchable signal must still report or restore. SIGKILL cannot be caught:
# then the stage with the backup simply stays on disk, without a message. The
# EXIT trap is installed before anything is created, so an early signal leaves
# nothing of ours behind.
trap 'exit 143' TERM
trap 'exit 130' INT
STAGE="" NEW="" BACKUP="" WORK=""
# Roll back the previous installation unless the new tree was already published.
# While NEW still sits in the stage the swap has not happened and BACKUP is the
# user's only copy of the old tree; once the rename has taken NEW out of the
# stage the old tree is superseded and the stage is discarded. The filesystem,
# not a flag, tells the two states apart, so a signal arriving in between cannot
# misread them. The restore only runs while nothing else holds the destination
# name — mv -T fails rather than nest — and when it cannot run the backup's path
# is reported and the stage kept, so the copy is never deleted.
cleanup() {
    trap - TERM INT
    if [ -n "$WORK" ]; then
        rm -rf "$WORK"
    fi
    if [ -z "$STAGE" ]; then
        return
    fi
    if [ ! -e "$NEW" ] && [ ! -L "$NEW" ]; then
        rm -rf "$STAGE"                       # published: the old tree is superseded
        return
    fi
    if [ -e "$BACKUP" ] || [ -L "$BACKUP" ]; then
        if mv -T "$BACKUP" "$DEST" 2>/dev/null; then
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
STAGE=$(mktemp -d "$PARENT/.greenTile-install.XXXXXX")
NEW="$STAGE/$UUID"
BACKUP="$STAGE/old"

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
# treats the target as a plain name instead of a container, so a target that is
# not the previous tree makes the rename fail instead of nesting the tree
# inside it, and the previous installation goes back via the EXIT trap. -T is
# coreutils mv, i.e. GNU/Linux, the only platform Cinnamon runs on; where it is
# missing the swap fails and this installer aborts with the previous
# installation untouched — it never falls back to a nesting mv.
if [ -e "$DEST" ] || [ -L "$DEST" ]; then
    mv -T "$DEST" "$BACKUP" || { echo "install.sh: could not move $DEST aside — aborting, nothing of yours was changed." >&2; exit 1; }
fi
if ! mv -T "$NEW" "$DEST"; then
    if [ -e "$BACKUP" ] || [ -L "$BACKUP" ]; then
        echo "install.sh: could not replace $DEST." >&2
    else
        echo "install.sh: could not install to $DEST — nothing was changed." >&2
    fi
    exit 1
fi

# The extension loads translations from GLib.get_user_data_dir()/locale (the
# XDG data dir); mirror that here instead of hardcoding ~/.local/share.
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}"
for mofile in "$STAGE"/locale/*/LC_MESSAGES/*.mo; do
    [ -e "$mofile" ] || continue
    lang=$(basename "$(dirname "$(dirname "$mofile")")")
    localedir="$DATA_DIR/locale/$lang/LC_MESSAGES"
    modest="$localedir/$UUID.mo"
    # same failure class as the moves below: report, keep going
    if ! mkdir -p "$localedir"; then
        echo "Note: could not install the $lang translation — the extension works without it (English)." >&2
        continue
    fi
    # Only a plain regular file is ours to replace. A directory — or a symlink
    # to one — would make a plain mv move the catalogue *inside* it and still
    # exit 0, leaving the path the loader reads as a directory: a silent false
    # success. Refuse that up front, naming the concrete path.
    if { [ -e "$modest" ] || [ -L "$modest" ]; } &&
        { [ ! -f "$modest" ] || [ -L "$modest" ]; }; then
        echo "Note: $modest exists and is not a plain file — the $lang translation was left untouched; the extension falls back to English if no usable catalogue is found there." >&2
        continue
    fi
    # Catalogues sit apart from the extension and can be on another filesystem,
    # so the compiled catalogue is copied into a working directory of our own —
    # created exclusively next to its destination — and renamed into place. The
    # rename is atomic on the destination filesystem and replaces only a plain
    # regular file; a failure at any step leaves the previous catalogue as it
    # was, and the extension then works without that translation (English).
    if ! WORK=$(mktemp -d "$localedir/.$UUID.XXXXXX" 2>/dev/null); then
        echo "Note: could not install the $lang translation — no working directory could be created next to $modest; the extension falls back to English if no usable catalogue is found there." >&2
        continue
    fi
    if ! cp "$mofile" "$WORK/catalogue" || ! mv -T "$WORK/catalogue" "$modest"; then
        echo "Note: could not install the $lang translation — $modest was left unchanged; the extension falls back to English if no usable catalogue is found there." >&2
    fi
    rm -rf "$WORK"
    WORK=""
done

echo "greenTile $UUID installed to $DEST"
echo "The files on disk are the new version now. If greenTile was already loaded, Cinnamon keeps"
echo "that code: reloading or toggling the extension re-reads only extension.js, so replaced code"
echo "under lib/ becomes active after a Cinnamon restart, not by itself."
echo "Restart Cinnamon: Ctrl+Alt+Esc, or Alt+F2 then r. Wayland has no such restart — log out"
echo "and back in instead."
echo "Then enable it: System Settings → Extensions → greenTile → turn on."

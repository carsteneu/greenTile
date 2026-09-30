#!/usr/bin/env bash
# Updates greenTile to the latest GitHub release: downloads the release zip
# and runs the install.sh bundled with it. Works from anywhere, nothing from
# the current directory is used. With --force it reinstalls even when the
# newest version is already installed.
set -eu

REPO=carsteneu/greenTile
UUID=greenTile@carsteneu
DEST="$HOME/.local/share/cinnamon/extensions/$UUID"

if [ "${1:-}" != "--force" ] && [ -n "${1:-}" ]; then
    echo "usage: $0 [--force]" >&2
    exit 1
fi

url_get() {  # url -> stdout
    if command -v curl >/dev/null; then curl -fsSL "$1"
    elif command -v wget >/dev/null; then wget -qO- "$1"
    else
        echo "update.sh: need curl or wget to download." >&2
        exit 1
    fi
}

url_dl() {  # url file
    if command -v curl >/dev/null; then curl -fsSL -o "$2" "$1"
    else wget -qO "$2" "$1"; fi
}

latest() {
    local tag
    tag=$(url_get "https://api.github.com/repos/$REPO/releases/latest" |
          sed -n 's/.*"tag_name": *"v\([^"]*\)".*/\1/p' | head -1)
    # Fallback: follow the redirect of releases/latest (no API rate limit).
    if [ -z "$tag" ] && command -v curl >/dev/null; then
        tag=$(curl -fsSI "https://github.com/$REPO/releases/latest" |
              sed -n 's/^[Ll]ocation: .*\/tag\/v\([^\r ]*\).*/\1/p' | head -1)
    fi
    printf '%s' "$tag"
}

installed() {
    [ -f "$DEST/metadata.json" ] &&
        grep -o '"version": *"[^"]*"' "$DEST/metadata.json" | head -1 | cut -d'"' -f4
}

command -v unzip >/dev/null || {
    echo "update.sh: need unzip (package unzip)." >&2
    exit 1
}

VER=$(latest)
[ -n "$VER" ] || { echo "update.sh: could not determine the latest release." >&2; exit 1; }

CUR=$(installed)
if [ "$CUR" = "$VER" ] && [ "${1:-}" != "--force" ]; then
    echo "greenTile $VER is already installed. Run '$0 --force' to reinstall."
    exit 0
fi

if [ -n "$CUR" ]; then
    echo "Updating greenTile $CUR -> $VER …"
else
    echo "Installing greenTile $VER …"
fi

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

url_dl "https://github.com/$REPO/releases/download/v$VER/greenTile-$VER.zip" "$TMP/greenTile.zip" ||
    { echo "update.sh: download failed." >&2; exit 1; }
unzip -q "$TMP/greenTile.zip" -d "$TMP"

"$TMP/greenTile-$VER/install.sh"

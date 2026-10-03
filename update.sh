#!/usr/bin/env bash
# Updates greenTile to the latest GitHub release: downloads the release zip
# and runs the install.sh bundled with it. Works from anywhere, nothing from
# the current directory is used. With --force it reinstalls even when the
# newest version is already installed.
set -eu

REPO=carsteneu/greenTile
UUID=greenTile@carsteneu
DEST="$HOME/.local/share/cinnamon/extensions/$UUID"

if [ "${1:-}" != "--force" ]; then
    FORCE=0
    if [ -n "${1:-}" ]; then
        echo "usage: $0 [--force]" >&2
        exit 1
    fi
else
    FORCE=1
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
    local tag='' json='' headers=''
    # The answer is only parsed when the transfer itself succeeded. url_get's
    # exit status would otherwise be lost in the pipeline below (pipefail is
    # off), and a truncated answer that already carries a tag would be taken
    # as the confirmed release — curl even exits 18 when it printed a tag.
    if json=$(url_get "https://api.github.com/repos/$REPO/releases/latest"); then
        tag=$(printf '%s\n' "$json" |
              sed -n 's/.*"tag_name": *"v\([^"]*\)".*/\1/p' | head -1)
    fi
    # Fallback: follow the redirect of releases/latest (no API rate limit).
    # Same rule: a partial header answer is not a confirmed tag.
    if [ -z "$tag" ] && command -v curl >/dev/null; then
        if headers=$(curl -fsSI "https://github.com/$REPO/releases/latest"); then
            tag=$(printf '%s\n' "$headers" |
                  sed -n 's/^[Ll]ocation: .*\/tag\/v\([^\r ]*\).*/\1/p' | head -1)
        fi
    fi
    printf '%s' "$tag"
}

installed_version() {  # -> version (status 0), 1 = no installation, 2 = unreadable
    if [ ! -f "$DEST/metadata.json" ]; then
        return 1
    fi
    local v
    v=$(grep -o '"version": *"[^"]*"' "$DEST/metadata.json" 2>/dev/null | head -1 | cut -d'"' -f4)
    if [ -z "$v" ]; then
        echo "update.sh: found an installation at $DEST, but its version cannot be read (broken metadata.json). Remove the folder or run '$0 --force' to reinstall." >&2
        return 2
    fi
    printf '%s' "$v"
}

command -v unzip >/dev/null || {
    echo "update.sh: need unzip (package unzip)." >&2
    exit 1
}

VER=$(latest)
[ -n "$VER" ] || { echo "update.sh: could not determine the latest release." >&2; exit 1; }

# A missing installation is the normal first-install case (st=1); only a
# broken existing one is an error (st=2) — abbreviating that to "installing"
# would hide a real problem. --force overrides it: the install replaces the
# broken metadata anyway.
CUR=""
st=0
CUR=$(installed_version) || st=$?
if [ "$st" = 2 ]; then
    if [ "$FORCE" != 1 ]; then
        exit 2
    fi
    echo "update.sh: continuing despite the unreadable installed version (--force)." >&2
    CUR=""
fi

if [ "$CUR" = "$VER" ] && [ "$FORCE" != 1 ]; then
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

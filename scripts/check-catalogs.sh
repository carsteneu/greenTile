#!/usr/bin/env bash
# Compiles every shipped catalog with msgfmt. A .po syntax error fails the
# release checks here, before build-release.sh packs the zip; install.sh would
# otherwise only hit it after the release was already published.
# Explicit file arguments are validated instead of po/*.po.
set -eu

# builtins only, so the script also runs with no coreutils on PATH. A bare name
# carries no directory — refuse instead of validating some other tree.
SOURCE=${BASH_SOURCE[0]}
if [ "$SOURCE" = "${SOURCE#*/}" ]; then
    echo "check-catalogs: cannot locate the repository — invoke this script by path." >&2
    exit 1
fi
HERE=$(cd -- "${SOURCE%/*}" && pwd)
ROOT=$(cd -- "$HERE/.." && pwd)

if ! command -v msgfmt >/dev/null 2>&1; then
    echo "check-catalogs: msgfmt (package gettext) not found — the catalogs cannot be validated." >&2
    exit 1
fi

if [ "$#" -gt 0 ]; then
    files=("$@")
else
    files=("$ROOT"/po/*.po)
fi

status=0
empty=0
for po in "${files[@]}"; do
    if [ ! -e "$po" ]; then
        echo "check-catalogs: catalog not found: $po" >&2
        status=1
    elif ! msgfmt --check -o /dev/null "$po"; then
        echo "check-catalogs: $po does not compile — the release would ship a broken translation." >&2
        status=1
    else
        # Compiling is all this gate can require: a string that was added since
        # the last translation sync is legitimately untranslated and falls back
        # to English. Count it anyway — a release should not ship that silently.
        # LC_ALL=C keeps the statistics line parseable regardless of the locale,
        # and the comma split lets it read "87 translated, 7 untranslated".
        count=$(LC_ALL=C msgfmt --statistics -o /dev/null "$po" 2>&1 \
            | tr ',' '\n' | sed -n 's/^ *\([0-9][0-9]*\) untranslated.*/\1/p')
        count=${count:-0}
        if [ "$count" -gt 0 ]; then
            echo "check-catalogs: ${po##*/} has $count untranslated string(s)" >&2
            empty=$((empty + count))
        fi
    fi
done

if [ "$status" -ne 0 ]; then
    exit 1
fi
if [ "$empty" -gt 0 ]; then
    echo "check-catalogs: ${#files[@]} catalogs compile, $empty untranslated string(s) in total"
else
    echo "check-catalogs: ${#files[@]} catalogs compile, all strings translated"
fi

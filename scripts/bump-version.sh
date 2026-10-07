#!/usr/bin/env bash
# Set every version marker in the tree to a new X.Y.Z in one go.
#
# The markers are the 24 lines the release depends on: the "version" of
# metadata.json and package.json, the two version lines of package-lock.json
# (its own and the root package entry) and the "Project-Id-Version: greenTile
# X.Y.Z" header of every po/*.po plus the pot template. The script never
# commits, tags or pushes — the caller (a human or
# .github/workflows/release-dispatch.yml) does that.
#
# Safety: every new file is computed and staged first, and only then swapped in;
# an EXIT trap restores the originals if the swap fails, so a failed run never
# leaves a half-bumped tree.
set -euo pipefail

ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
cd "$ROOT"

die() { printf 'bump-version: %s\n' "$*" >&2; exit 1; }

[ "$#" -eq 1 ] || die "usage: scripts/bump-version.sh X.Y.Z"

NEW=$1
# Strict X.Y.Z: no v prefix, no missing or extra parts, no leading zeros.
if ! [[ "$NEW" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
    die "'$NEW' is not a plain X.Y.Z version (no v prefix, no extra parts, no leading zeros)"
fi

command -v node >/dev/null 2>&1 || die "node is required to edit the JSON files"

CUR=$(node -p "require('./metadata.json').version")
[ -n "$CUR" ] || die "could not read the current version from metadata.json"

# A bump must move strictly forward: same version is a mistake, lower is a revert.
IFS=. read -r cmaj cmin cpat <<<"$CUR"
IFS=. read -r nmaj nmin npat <<<"$NEW"
newer=0
if   (( nmaj > cmaj )); then newer=1
elif (( nmaj == cmaj && nmin > cmin )); then newer=1
elif (( nmaj == cmaj && nmin == cmin && npat > cpat )); then newer=1
fi
[ "$newer" -eq 1 ] || die "$NEW is not greater than the current version $CUR"

POS=(po/*.po)
[ "${#POS[@]}" -gt 0 ] || die "no po/*.po catalogs found"
POT="po/greenTile@carsteneu.pot"
[ -f "$POT" ] || die "$POT not found"
FILES=(metadata.json package.json package-lock.json "$POT" "${POS[@]}")
MARKERS=$(( ${#FILES[@]} + 1 )) # package-lock.json carries two version lines

# Staging lives inside the repo (git-ignored), never /tmp: that path is not
# reliably writable and would mix state across worktrees.
WORK=$(mktemp -d "$ROOT/.yesmem/tmp/bump-version.XXXXXX" 2>/dev/null) || {
    mkdir -p "$ROOT/.yesmem/tmp"
    WORK=$(mktemp -d "$ROOT/.yesmem/tmp/bump-version.XXXXXX")
}
cleanup() {
    local rc=$?
    if [ "$rc" -ne 0 ] && [ -f "$WORK/orig.tar" ]; then
        printf 'bump-version: failed — restoring the original files\n' >&2
        tar -xf "$WORK/orig.tar" -C "$ROOT"
    fi
    rm -rf "$WORK"
}
trap cleanup EXIT

mkdir -p "$WORK/new"
BUMP_ROOT=$ROOT BUMP_STAGE="$WORK/new" BUMP_OLD="$CUR" BUMP_NEW="$NEW" \
BUMP_FILES=$(printf '%s\n' "${FILES[@]}") \
node <<'NODE'
'use strict';
// Computes every new file into the staging dir. Nothing is written to the repo
// here, so a failure at this point leaves the tree untouched.
const fs = require('node:fs');
const path = require('node:path');

const root = process.env.BUMP_ROOT;
const stage = process.env.BUMP_STAGE;
const oldV = process.env.BUMP_OLD;
const newV = process.env.BUMP_NEW;
const files = process.env.BUMP_FILES.split('\n').filter(Boolean);
const jsonFiles = new Set(['metadata.json', 'package.json', 'package-lock.json']);

const fail = (msg) => { throw new Error(msg); };
const staged = [];

for (const rel of files) {
    const raw = fs.readFileSync(path.join(root, rel), 'utf8');
    let out;
    if (jsonFiles.has(rel)) {
        let obj;
        try { obj = JSON.parse(raw); } catch (e) { fail(`${rel}: not valid JSON (${e.message})`); }
        // Byte-identical apart from the version: only an already-canonical file
        // is rewritten, so a reformat can never slip in unnoticed.
        if (JSON.stringify(obj, null, 4) + '\n' !== raw) {
            fail(`${rel}: not in canonical 4-space JSON form — reformat it before bumping`);
        }
        if (obj.version !== oldV) fail(`${rel}: version ${obj.version} != current ${oldV}`);
        obj.version = newV;
        if (rel === 'package-lock.json') {
            if (!obj.packages || !obj.packages['']) fail('package-lock.json: root package entry missing');
            if (obj.packages[''].version !== oldV) fail(`package-lock.json: packages[""].version ${obj.packages[''].version} != current ${oldV}`);
            obj.packages[''].version = newV;
        }
        out = JSON.stringify(obj, null, 4) + '\n';
    }
    else {
        // The po header carries a literal backslash-n before the closing quote.
        const needle = `"Project-Id-Version: greenTile ${oldV}\\n"`;
        const count = raw.split(needle).length - 1;
        if (count !== 1) fail(`${rel}: expected exactly one '${needle}' header, found ${count}`);
        out = raw.replace(needle, `"Project-Id-Version: greenTile ${newV}\\n"`);
    }
    if (!out.includes(newV)) fail(`${rel}: staged content does not carry ${newV}`);
    const dst = path.join(stage, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.writeFileSync(dst, out);
    staged.push(rel);
}
if (staged.length !== files.length) fail('staged file count mismatch');
NODE

# Everything is staged — back up, then swap in.
tar -cf "$WORK/orig.tar" -C "$ROOT" -- "${FILES[@]}"
for rel in "${FILES[@]}"; do
    cp -- "$WORK/new/$rel" "$ROOT/$rel"
done

[ "$(node -p "require('./metadata.json').version")" = "$NEW" ] || die "post-swap check failed: metadata.json is not $NEW"

printf 'bump-version: %s -> %s — %d files, %d markers updated\n' "$CUR" "$NEW" "${#FILES[@]}" "$MARKERS"
printf 'next: run "npm run check", commit "release %s: <summary>", tag -a v%s -m "greenTile %s", push.\n' "$NEW" "$NEW" "$NEW"

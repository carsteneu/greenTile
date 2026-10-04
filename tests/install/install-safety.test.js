'use strict';
// install.sh under interruption and concurrent installers (docs/local/todo_fixes_2.md
// issues 1 and 2): the EXIT cleanup must never delete the only remaining copy of the
// previous installation, and neither the swap nor the restore may nest a tree inside a
// competing DEST. Every case runs a copy of the real install.sh under a private HOME;
// the mv double injects a competitor or a signal exactly at the state transition.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const { UUID, EXT, LATEST, TMP, REAL_MV, mkdir, write } = require('../helpers/release-env');
const { ROOT } = require('../helpers/cinnamon-loader');

const cleanups = [];
test.after(() => {
    for (const dir of cleanups) {fs.rmSync(dir, { recursive: true, force: true });}
});

// mv double: delegates to the real mv, but injects a competing installer or a signal
// at the transition named by GT_MODE. The gate in front of the first mv keeps two
// spawned installers in flight at the same time instead of letting them serialize.
const MV_STUB = `#!/usr/bin/env bash
# test double for mv — see tests/install/install-safety.test.js
set -u
src=""; dst=""
for a in "$@"; do
    case "$a" in
        -*) ;;
        *) if [ -z "$src" ]; then src="$a"; else dst="$a"; fi ;;
    esac
done
competitor() {
    [ -n "\${GT_DEST:-}" ] || { echo "mv stub: GT_DEST unset" >&2; exit 3; }
    mkdir -p "$GT_DEST"
    printf '{"version": "competitor"}\\\\n' > "$GT_DEST/metadata.json"
    printf 'competitor\\\\n' > "$GT_DEST/competitor-only"
}
if [ -n "\${GT_ARRIVE_DIR:-}" ] && [ ! -e "$GT_ARRIVE_DIR/arrived.$$" ]; then
    : > "$GT_ARRIVE_DIR/arrived.$$"
    i=0
    while [ "$i" -lt 1000 ]; do
        count=0
        for f in "$GT_ARRIVE_DIR"/arrived.*; do
            [ -e "$f" ] && count=$((count + 1))
        done
        [ "$count" -ge 2 ] && break
        sleep 0.01
        i=$((i + 1))
    done
fi
case "\${GT_MODE:-none}" in
    nested)
        # a competing installer publishes DEST between our existence check and our swap
        case "$src" in */.greenTile-install.*/${UUID}) competitor ;; esac
        ;;
    restore-race)
        # our swap fails, and the restore finds a DEST that a competitor just created
        case "$src" in
            */.greenTile-install.*/${UUID}) exit 7 ;;
            */.greenTile-install.*/old) competitor ;;
        esac
        ;;
    early-backup)
        # DEST reappears right after the previous tree was moved into the stage
        case "$dst" in */.greenTile-install.*/old) "$GT_REAL_MV" "$@"; competitor; exit 0 ;; esac
        ;;
    interrupt)
        "$GT_REAL_MV" "$@"
        if [ "$src" = "$GT_DEST" ]; then kill -TERM "$PPID"; fi
        exit 0
        ;;
    interrupt-int)
        "$GT_REAL_MV" "$@"
        if [ "$src" = "$GT_DEST" ]; then kill -INT "$PPID"; fi
        exit 0
        ;;
    interrupt-after-swap)
        # the swap itself went through, the signal arrives right after it
        case "$src" in
            */.greenTile-install.*/${UUID}) "$GT_REAL_MV" "$@"; kill -TERM "$PPID"; exit 0 ;;
        esac
        ;;
    stolen-after-swap)
        # after this run published, a competing installer moves the just published
        # tree aside (it will give it back from its own abort path). $DEST is free
        # again while this run exits — the previous tree must not come back.
        case "$src" in
            */.greenTile-install.*/${UUID}) "$GT_REAL_MV" "$@"; "$GT_REAL_MV" -T "$GT_DEST" "$GT_DEST.stolen"; exit 0 ;;
        esac
        ;;
    stolen-interrupt-after-swap)
        # publication finished but the shell has not yet recorded that fact;
        # a competitor holds the new tree when the signal arrives
        case "$src" in
            */.greenTile-install.*/${UUID})
                "$GT_REAL_MV" "$@" || exit 3
                "$GT_REAL_MV" -T "$GT_DEST" "$GT_DEST.stolen" || exit 3
                kill -"$GT_SIGNAL" "$PPID"
                exit 0
                ;;
        esac
        ;;
    interrupt-failed-swap)
        # failed publication leaves NEW in the stage: the old tree must still
        # be restored even when the failure coincides with a catchable signal
        case "$src" in
            */.greenTile-install.*/${UUID}) kill -TERM "$PPID"; exit 7 ;;
        esac
        ;;
    no-target)
        # an mv without coreutils -T: every -T call must fail, the installer has
        # to abort with the previous installation untouched instead of nesting
        for arg in "$@"; do
            case "$arg" in -T) echo "mv: invalid option -- 'T'" >&2; exit 2 ;; esac
        done
        ;;
    replaced)
        # between the installer's check and its move, another install.sh
        # publishes its own tree at DEST
        case "$dst" in
            */.greenTile-install.*/old)
                "$GT_REAL_MV" -T "$GT_DEST" "$GT_DEST.previous" || exit 3
                mkdir -p "$GT_DEST"
                printf '{"version": "competitor"}\\\\n' > "$GT_DEST/metadata.json"
                printf 'competitor\\\\n' > "$GT_DEST/competitor-only"
                ;;
        esac
        ;;
    mismatch-kept)
        # this run's move picks up a competitor's tree (ours was already moved
        # away by it), and a third tree appears at DEST so the give-back fails
        case "$dst" in
            */.greenTile-install.*/old)
                "$GT_REAL_MV" -T "$GT_DEST" "$GT_DEST.previous" || exit 3
                mkdir -p "$GT_DEST"
                printf '{"version": "competitor"}\\\\n' > "$GT_DEST/metadata.json"
                printf 'competitor\\\\n' > "$GT_DEST/competitor-only"
                ;;
        esac
        case "$src" in
            */.greenTile-install.*/old)
                mkdir -p "$GT_DEST"
                printf '{"version": "third"}\\\\n' > "$GT_DEST/metadata.json"
                printf 'third\\\\n' > "$GT_DEST/third-only"
                ;;
        esac
        ;;
    killed)
        "$GT_REAL_MV" "$@"
        if [ "$src" = "$GT_DEST" ]; then kill -KILL "$PPID"; fi
        exit 0
        ;;
esac
exec "$GT_REAL_MV" "$@"
`;

function makeEnv(name) {
    const dir = fs.mkdtempSync(path.join(TMP, `${name}-`));
    cleanups.push(dir);
    const home = path.join(dir, 'home');
    const bin = path.join(dir, 'bin');
    const tmp = path.join(dir, 'tmp');
    mkdir(home);
    mkdir(bin);
    mkdir(tmp);
    const here = path.join(dir, 'release');
    const src = path.join(here, UUID);
    mkdir(path.join(src, 'po'));
    fs.copyFileSync(path.join(ROOT, 'install.sh'), path.join(here, 'install.sh'));
    write(path.join(src, 'metadata.json'), `{\n    "uuid": "${UUID}",\n    "version": "${LATEST}"\n}\n`);
    write(path.join(src, 'extension.js'), '// NEW extension\n');
    write(path.join(src, 'settings-schema.json'), '{}\n');
    write(path.join(src, 'stylesheet.css'), '.new {}\n');
    write(path.join(src, 'icon.png'), 'png\n');
    write(path.join(src, 'lib', 'core.js'), 'var core = 1;\n');
    write(path.join(src, 'lib', 'util.js'), 'var util = 1;\n');
    fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(src, 'LICENSE'));
    const po = (id) => `msgid ""\nmsgstr ""\n"Content-Type: text/plain; charset=UTF-8\\n"\n\nmsgid "a"\nmsgstr "${id}"\n`;
    write(path.join(src, 'po', 'de.po'), po('de'));
    return {
        dir, home, bin, tmp, here, src,
        env: {
            HOME: home,
            PATH: `${bin}:${process.env.PATH}`,
            TMPDIR: tmp,
            GT_REAL_MV: REAL_MV,
            GT_DEST: path.join(home, EXT),
        },
    };
}

// GT_MODE names the injection; 'none' is the plain pass-through used by the
// concurrency cases, which still need the arrival gate.
function useStub(x, mode) {
    write(path.join(x.bin, 'mv'), MV_STUB);
    fs.chmodSync(path.join(x.bin, 'mv'), 0o755);
    x.env.GT_MODE = mode;
}

// the previous installation in the fake HOME: it carries a marker file, so every
// surviving copy of it is recognizable wherever it ends up
function seedOldInstall(home) {
    const dest = path.join(home, EXT);
    mkdir(path.join(dest, 'po'));
    write(path.join(dest, 'metadata.json'), `{\n    "uuid": "${UUID}",\n    "version": "1.2.0"\n}\n`);
    write(path.join(dest, 'extension.js'), '// OLD extension\n');
    write(path.join(dest, 'greenTile.js'), '// dead code left by an older version\n');
    write(path.join(dest, 'lib', 'old.js'), 'var old = 1;\n');
    write(path.join(dest, 'old-only'), 'sole old copy\n');
    return dest;
}

const destOf = (x) => path.join(x.home, EXT);
const parentOf = (x) => path.dirname(destOf(x));
const stages = (x) => {
    const parent = parentOf(x);
    if (!fs.existsSync(parent)) {return [];}
    return fs.readdirSync(parent)
        .filter((e) => e.startsWith('.greenTile-install.'))
        .map((e) => path.join(parent, e));
};
const version = (dir) => {
    const meta = path.join(dir, 'metadata.json');
    if (!fs.existsSync(meta)) {return null;}
    const m = fs.readFileSync(meta, 'utf8').match(/"version": *"([^"]*)"/);
    return m === null ? 'broken' : m[1];
};
// the previous installation survived if its marker is either back at DEST or still
// inside a preserved stage
const oldSurvives = (x) => fs.existsSync(path.join(destOf(x), 'old-only'))
    || stages(x).some((s) => fs.existsSync(path.join(s, 'old', 'old-only')));
// ...and DEST must then hold that tree, not a half-removed one
const oldIntactOrAbsent = (x) => !fs.existsSync(destOf(x)) || version(destOf(x)) === '1.2.0';
const announced = (r) => /preserved at|back in place/.test(r.stderr);
// byte-level snapshot of a tree: relative path -> sha256 of the file, 'dir' for a
// directory. Renaming preserves every byte of the previous installation; a marker
// file alone would not show a tree that was truncated or half-removed.
function treeFingerprint(root) {
    const files = {};
    const walk = (dir, rel) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true })
            .sort((a, b) => a.name.localeCompare(b.name));
        for (const e of entries) {
            const r = rel ? `${rel}/${e.name}` : e.name;
            const p = path.join(dir, e.name);
            if (e.isDirectory()) {
                files[`${r}/`] = 'dir';
                walk(p, r);
            } else {
                files[r] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
            }
        }
    };
    if (fs.existsSync(root)) {walk(root, '');}
    return files;
}
// where the previous installation survived: back at DEST or inside a preserved stage
function oldTreePath(x) {
    if (fs.existsSync(path.join(destOf(x), 'old-only'))) {return destOf(x);}
    for (const s of stages(x)) {
        const p = path.join(s, 'old');
        if (fs.existsSync(path.join(p, 'old-only'))) {return p;}
    }
    return null;
}

const run = (x) => spawnSync('bash', [path.join(x.here, 'install.sh')],
    { cwd: x.here, env: x.env, encoding: 'utf8' });

test('SIGTERM after the previous tree was moved aside: it survives and is announced', () => {
    const x = makeEnv('safety-sigterm');
    useStub(x, 'interrupt');
    seedOldInstall(x.home);
    const before = treeFingerprint(destOf(x));
    const r = run(x);
    assert.notEqual(r.status, 0, `an interrupted run must not look successful: ${r.stdout}`);
    assert.ok(r.status === 143 || r.signal === 'SIGTERM', `expected a terminated shell, got status=${r.status} signal=${r.signal}`);
    assert.notEqual(version(destOf(x)), LATEST, 'an interrupted run must not publish the new tree');
    assert.ok(!fs.existsSync(path.join(destOf(x), UUID)), 'the new tree was nested inside DEST');
    assert.ok(oldSurvives(x), `the only copy of the previous installation was destroyed — stderr: ${r.stderr}`);
    assert.ok(oldIntactOrAbsent(x), `DEST must hold the previous installation or nothing: ${version(destOf(x))}`);
    assert.deepEqual(treeFingerprint(oldTreePath(x)), before, 'the previous installation survived with changed bytes');
    assert.ok(announced(r), `stderr must say where the previous installation went: ${r.stderr}`);
});

test('SIGINT after the previous tree was moved aside: it survives and is announced', () => {
    const x = makeEnv('safety-sigint');
    useStub(x, 'interrupt-int');
    seedOldInstall(x.home);
    const before = treeFingerprint(destOf(x));
    const r = run(x);
    assert.notEqual(r.status, 0, `an interrupted run must not look successful: ${r.stdout}`);
    assert.ok(r.status === 130 || r.signal === 'SIGINT', `expected an interrupted shell, got status=${r.status} signal=${r.signal}`);
    assert.notEqual(version(destOf(x)), LATEST, 'an interrupted run must not publish the new tree');
    assert.ok(oldSurvives(x), `the only copy of the previous installation was destroyed — stderr: ${r.stderr}`);
    assert.ok(oldIntactOrAbsent(x), `DEST must hold the previous installation or nothing: ${version(destOf(x))}`);
    assert.deepEqual(treeFingerprint(oldTreePath(x)), before, 'the previous installation survived with changed bytes');
    assert.ok(announced(r), `stderr must say where the previous installation went: ${r.stderr}`);
});

test('SIGTERM right after a successful swap: no advice that would undo it', () => {
    const x = makeEnv('safety-sigterm-after-swap');
    useStub(x, 'interrupt-after-swap');
    seedOldInstall(x.home);
    const r = run(x);
    assert.notEqual(r.status, 0, 'the run was interrupted');
    assert.equal(version(destOf(x)), LATEST, 'the swap had already replaced the previous installation');
    assert.ok(fs.existsSync(path.join(destOf(x), 'lib', 'core.js')), 'the published tree is incomplete');
    assert.ok(!fs.existsSync(path.join(destOf(x), 'old')), 'a backup was nested inside DEST');
    assert.equal(stages(x).length, 0,
        `the superseded previous installation must not keep the stage alive: ${stages(x).join(', ')}`);
    assert.ok(!/preserved at/.test(r.stderr),
        `a completed install must not tell the user to move the old tree back: ${r.stderr}`);
});

test('a competing installer holding the just published tree does not bring the previous one back', () => {
    const x = makeEnv('safety-stolen-after-swap');
    useStub(x, 'stolen-after-swap');
    seedOldInstall(x.home);
    const r = run(x);
    // the swap succeeded: the new tree left the stage and was published
    assert.ok(r.stdout.includes('installed to'), `the completed install must be reported: ${r.stdout}`);
    // it was then moved aside by the competitor, so $DEST is momentarily free —
    // the EXIT trap must not mistake that for a lost publication and undo the swap
    assert.ok(!fs.existsSync(path.join(destOf(x), 'old-only')),
        'the previous installation was restored over the just published tree');
    assert.ok(!/preserved at|back in place/.test(r.stderr),
        `a completed install must not advise moving the previous tree back: ${r.stderr}`);
    // the tree the competitor holds is exactly the new one ...
    assert.equal(version(destOf(x) + '.stolen'), LATEST, 'the held tree must be the published one');
    assert.ok(fs.existsSync(path.join(destOf(x) + '.stolen', 'lib', 'core.js')), 'the held tree is incomplete');
    // ... and once the competitor gives it back the result is one consistent runtime
    fs.renameSync(destOf(x) + '.stolen', destOf(x));
    assert.equal(version(destOf(x)), LATEST);
    assert.ok(fs.existsSync(path.join(destOf(x), 'lib', 'core.js')));
});

for (const [signal, status] of [['TERM', 143], ['INT', 130]]) {
    test(`SIG${signal} before the publication flag cannot restore over a competitor-held new tree`, () => {
        const x = makeEnv('safety-stolen-signal-' + signal);
        useStub(x, 'stolen-interrupt-after-swap');
        x.env.GT_SIGNAL = signal;
        seedOldInstall(x.home);
        const r = run(x);
        assert.equal(r.status, status, `the catchable signal must terminate the run: ${r.stderr}`);
        assert.ok(!r.stdout.includes('installed to'), 'an interrupted run must not report success');
        assert.equal(version(destOf(x) + '.stolen'), LATEST, 'the competitor must hold the complete new tree');
        assert.ok(!fs.existsSync(destOf(x)), 'the superseded old tree blocked the competitor from returning the new one');
        assert.doesNotMatch(r.stderr, /preserved at|back in place/, 'the superseded old installation must not be restored or recommended');
        assert.equal(stages(x).length, 0, 'the successful publication superseded the previous installation');
        fs.renameSync(destOf(x) + '.stolen', destOf(x));
        assert.equal(version(destOf(x)), LATEST);
        assert.ok(fs.existsSync(path.join(destOf(x), 'lib', 'core.js')));
    });
}

test('a signal coinciding with a failed publication still restores the previous bytes', () => {
    const x = makeEnv('safety-signal-failed-swap');
    useStub(x, 'interrupt-failed-swap');
    seedOldInstall(x.home);
    const before = treeFingerprint(destOf(x));
    const r = run(x);
    assert.equal(r.status, 143, 'the catchable signal must terminate the run');
    assert.ok(!r.stdout.includes('installed to'), 'a failed publication cannot report success');
    assert.deepEqual(treeFingerprint(destOf(x)), before, 'a failed publication must restore every old byte');
    assert.match(r.stderr, /back in place/);
});

test('an mv without coreutils -T: abort with the previous installation untouched', () => {
    const x = makeEnv('safety-no-target');
    useStub(x, 'no-target');
    seedOldInstall(x.home);
    const r = run(x);
    assert.notEqual(r.status, 0, 'without -T the swap must not run');
    assert.equal(version(destOf(x)), '1.2.0', 'the previous installation must stay in place');
    assert.ok(fs.existsSync(path.join(destOf(x), 'old-only')), 'the previous installation lost files');
    assert.ok(!fs.existsSync(path.join(destOf(x), UUID)), 'the new tree was nested inside DEST');
    assert.equal(stages(x).length, 0, `nothing was moved aside, so nothing may be kept: ${stages(x).join(', ')}`);
    assert.ok(!/another install\.sh/.test(r.stderr), `the abort must not blame a competing installer: ${r.stderr}`);
});

test('a DEST another installer published while this one staged is not moved away', () => {
    const x = makeEnv('safety-replaced-while-staging');
    useStub(x, 'none');
    seedOldInstall(x.home);
    const before = treeFingerprint(destOf(x));
    // the real msgfmt path runs during staging, i.e. between looking at what is
    // at $DEST and the swap — exactly where a competing installer publishes
    const realMsgfmt = spawnSync('which', ['msgfmt'], { encoding: 'utf8' }).stdout.trim();
    write(path.join(x.bin, 'msgfmt'), `#!/usr/bin/env bash
# a competing install.sh replaces the installation while we are still staging
mv -T "$GT_DEST" "$GT_DEST.previous" || exit 3
mkdir -p "$GT_DEST"
printf '{"version": "competitor"}\\\\n' > "$GT_DEST/metadata.json"
printf 'competitor\\\\n' > "$GT_DEST/competitor-only"
exec ${realMsgfmt} "$@"
`);
    fs.chmodSync(path.join(x.bin, 'msgfmt'), 0o755);
    const r = run(x);
    assert.notEqual(r.status, 0, 'a replaced DEST must not be treated as the installation to update');
    assert.equal(version(destOf(x)), 'competitor', 'the other installation was moved away or overwritten');
    assert.ok(fs.existsSync(path.join(destOf(x), 'competitor-only')), 'the other installation lost files');
    assert.ok(!fs.existsSync(path.join(destOf(x), UUID)), 'a tree was nested inside DEST');
    assert.equal(version(destOf(x) + '.previous'), '1.2.0', 'the previous installation was destroyed');
    assert.deepEqual(treeFingerprint(destOf(x) + '.previous'), before, 'the previous installation lost bytes');
    assert.equal(stages(x).length, 0, `nothing of ours was moved aside: ${stages(x).join(', ')}`);
});

test('a tree published between the check and the move is given back, not updated away', () => {
    const x = makeEnv('safety-published-during-move');
    useStub(x, 'replaced');
    seedOldInstall(x.home);
    const before = treeFingerprint(destOf(x));
    const r = run(x);
    assert.notEqual(r.status, 0, 'the tree published in the meantime must not be swallowed');
    assert.equal(version(destOf(x)), 'competitor', 'the other installation is not at DEST any more');
    assert.ok(fs.existsSync(path.join(destOf(x), 'competitor-only')), 'the other installation lost files');
    assert.ok(!fs.existsSync(path.join(destOf(x), UUID)), 'a tree was nested inside DEST');
    assert.equal(version(destOf(x) + '.previous'), '1.2.0', 'the previous installation was destroyed');
    assert.deepEqual(treeFingerprint(destOf(x) + '.previous'), before, 'the previous installation lost bytes');
    assert.ok(!r.stdout.includes('installed to'), 'nothing was installed, so nothing may be announced');
    assert.equal(stages(x).length, 0, `the given-back tree must not keep a stage: ${stages(x).join(', ')}`);
});

test('a foreign tree that cannot be given back is not reported as the user\'s previous installation', () => {
    const x = makeEnv('safety-mismatch-kept');
    useStub(x, 'mismatch-kept');
    seedOldInstall(x.home);
    const r = run(x);
    assert.notEqual(r.status, 0, 'the installer that could not hand the tree back must not report success');
    assert.ok(!r.stdout.includes('installed to'), 'nothing was installed');
    // the held tree is reported as what it is (the other installer's) ...
    assert.ok(r.stderr.includes('its tree is preserved at'), `the held tree must be reported: ${r.stderr}`);
    // ... and must never be described as this user's previous installation, which
    // would send them to clobber a third tree
    assert.ok(!r.stderr.includes('your previous installation is preserved'),
        `a foreign tree must not be labelled as the user's previous installation: ${r.stderr}`);
    // the tree that now occupies DEST is left untouched, and the user's real
    // previous installation is still where the competitor moved it
    assert.equal(version(destOf(x)), 'third', 'the tree at DEST was modified');
    assert.ok(fs.existsSync(path.join(destOf(x), 'third-only')), 'the tree at DEST lost files');
    assert.equal(version(destOf(x) + '.previous'), '1.2.0', 'the user\'s previous installation was destroyed');
    // the competitor tree that could not be given back is preserved in the stage
    assert.ok(stages(x).some((s) => fs.existsSync(path.join(s, 'old', 'competitor-only'))),
        'the tree that could not be given back was not preserved');
});

test('a competing installer publishes DEST before the swap: no nesting, no false success', () => {
    const x = makeEnv('safety-nested');
    useStub(x, 'nested');
    seedOldInstall(x.home);
    const before = treeFingerprint(destOf(x));
    const r = run(x);
    assert.notEqual(r.status, 0, `a lost swap must not report success: ${r.stdout}`);
    assert.ok(!fs.existsSync(path.join(destOf(x), UUID)), 'the new tree was nested inside DEST');
    assert.ok(!fs.existsSync(path.join(destOf(x), 'old')), 'the backup was nested inside DEST');
    assert.ok(!r.stdout.includes('installed to'), 'a failed publication must not claim the extension was installed');
    assert.ok(fs.existsSync(path.join(destOf(x), 'competitor-only')), 'the competing installation was overwritten');
    assert.ok(oldSurvives(x), `the previous installation is gone — stderr: ${r.stderr}`);
    assert.deepEqual(treeFingerprint(oldTreePath(x)), before, 'the previous installation lost bytes');
    assert.ok(r.stderr.includes('preserved at'), `stderr must point at the backup: ${r.stderr}`);
});

test('a DEST created during the restore is not overwritten and cannot nest the backup', () => {
    const x = makeEnv('safety-restore-race');
    useStub(x, 'restore-race');
    seedOldInstall(x.home);
    const before = treeFingerprint(destOf(x));
    const r = run(x);
    assert.notEqual(r.status, 0, `a failed restore must not report success: ${r.stdout}`);
    assert.ok(!fs.existsSync(path.join(destOf(x), 'old')), 'the backup was nested into the competing DEST');
    assert.ok(fs.existsSync(path.join(destOf(x), 'competitor-only')), 'the competing installation was overwritten');
    assert.ok(!r.stderr.includes('intact and restored'), `a failed restore must not claim the installation is back: ${r.stderr}`);
    assert.ok(oldSurvives(x), `the previous installation is gone — stderr: ${r.stderr}`);
    assert.deepEqual(treeFingerprint(oldTreePath(x)), before, 'the previous installation lost bytes');
    assert.ok(r.stderr.includes('preserved at'), `stderr must point at the backup: ${r.stderr}`);
});

test('DEST reappearing before the swap aborts without touching it and keeps the previous tree', () => {
    const x = makeEnv('safety-reappears');
    useStub(x, 'early-backup');
    seedOldInstall(x.home);
    const before = treeFingerprint(destOf(x));
    const r = run(x);
    assert.notEqual(r.status, 0, `the abort must not report success: ${r.stdout}`);
    assert.ok(!fs.existsSync(path.join(destOf(x), UUID)), 'the new tree was nested inside DEST');
    assert.ok(fs.existsSync(path.join(destOf(x), 'competitor-only')), 'the installation that appeared was overwritten');
    assert.ok(oldSurvives(x), `the previous installation is gone — stderr: ${r.stderr}`);
    assert.deepEqual(treeFingerprint(oldTreePath(x)), before, 'the previous installation lost bytes');
    assert.ok(announced(r), `stderr must say where the previous installation went: ${r.stderr}`);
    assert.ok(!r.stderr.includes('nothing was changed'), `the tree was moved aside, the message must not deny it: ${r.stderr}`);
});

test('SIGKILL cannot be trapped: the stage with the backup stays on disk (documented limit)', () => {
    const x = makeEnv('safety-sigkill');
    useStub(x, 'killed');
    seedOldInstall(x.home);
    const r = run(x);
    assert.equal(r.signal, 'SIGKILL', `expected an untrappable kill, got status=${r.status} signal=${r.signal}`);
    assert.ok(stages(x).some((s) => fs.existsSync(path.join(s, 'old', 'old-only'))),
        'no on-disk copy of the previous installation after SIGKILL');
    // no automatic recovery is claimed for this case: nothing could print a location
});

function spawnInstall(x) {
    return new Promise((resolve) => {
        const p = spawn('bash', [path.join(x.here, 'install.sh')], { cwd: x.here, env: x.env, encoding: 'utf8' });
        let stdout = '';
        let stderr = '';
        p.stdout.on('data', (d) => { stdout += d; });
        p.stderr.on('data', (d) => { stderr += d; });
        p.on('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
    });
}

const gateEnv = (x) => {
    x.env.GT_ARRIVE_DIR = path.join(x.dir, 'arrive');
    mkdir(x.env.GT_ARRIVE_DIR);
};

// both installers wait for each other in front of their first mv, so they really
// run concurrently instead of one after the other
test('two concurrent installers over an existing installation: exactly one publishes', { timeout: 30000 }, async () => {
    const x = makeEnv('safety-concurrent-update');
    useStub(x, 'none');
    gateEnv(x);
    seedOldInstall(x.home);
    const runs = await Promise.all([spawnInstall(x), spawnInstall(x)]);
    assert.deepEqual(runs.map((r) => r.status).sort(), [0, 1],
        `exactly one installer may publish over the previous installation: ${JSON.stringify(runs)}`);
    // one consistent runtime: never a tree nested inside another, never a mix
    const destVersion = version(destOf(x));
    assert.equal(destVersion, LATEST, `DEST is neither a complete new nor the previous installation: ${destVersion}`);
    assert.ok(fs.existsSync(path.join(destOf(x), 'lib', 'core.js')), 'the published tree is incomplete');
    assert.ok(!fs.existsSync(path.join(destOf(x), UUID)), 'a tree was nested inside DEST');
    assert.ok(!fs.existsSync(path.join(destOf(x), 'old')), 'a backup was nested inside DEST');
    // a stage only survives when it still holds the previous installation
    for (const stage of stages(x)) {
        assert.ok(fs.existsSync(path.join(stage, 'old')), `stale stage without a previous installation: ${stage}`);
    }
});

test('two concurrent fresh installers: exactly one publishes, nothing is left behind', { timeout: 30000 }, async () => {
    const x = makeEnv('safety-concurrent-fresh');
    useStub(x, 'none');
    gateEnv(x);
    const runs = await Promise.all([spawnInstall(x), spawnInstall(x)]);
    assert.deepEqual(runs.map((r) => r.status).sort(), [0, 1],
        `expected one success and one clean refusal: ${JSON.stringify(runs)}`);
    assert.equal(version(destOf(x)), LATEST);
    assert.ok(!fs.existsSync(path.join(destOf(x), UUID)), 'a tree was nested inside DEST');
    assert.equal(stages(x).length, 0, `a fresh install has nothing to preserve: ${stages(x).join(', ')}`);
});

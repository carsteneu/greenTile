'use strict';
// install.sh under interruption: the EXIT cleanup must never delete the only
// remaining copy of the previous installation, a catchable signal must leave
// either the previous or the new tree in place (never a mix), and the swap must
// never nest a tree inside the destination. Concurrent cooperating installers
// are serialized by one flock, so the tests drive that lock instead of a
// simultaneous-writer protocol. Every case runs a copy of the real install.sh
// under a private HOME; the mv double injects a signal exactly at a transition.
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

// mv double: delegates to the real mv, but injects a signal at the transition
// named by GT_MODE.
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
case "\${GT_MODE:-none}" in
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

// GT_MODE names the injection; 'none' is the plain pass-through.
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

// The lock: one flock serializes cooperating installers for the same account
// and destination. A blocking msgfmt keeps the first installer inside its
// critical section (the lock is taken before staging), so a second run provably
// meets a held lock instead of racing a fast first run. `exec 9>&-` drops the
// lock descriptor the stub would otherwise inherit, so the lock is released
// exactly when the installer process ends — a real msgfmt is short lived.
const REAL_MSGFMT = spawnSync('which', ['msgfmt'], { encoding: 'utf8' }).stdout.trim();
function blockMsgfmt(x) {
    const hold = path.join(x.dir, 'hold');
    mkdir(hold);
    write(path.join(x.bin, 'msgfmt'), `#!/usr/bin/env bash
exec 9>&- 2>/dev/null || true
touch "${hold}/started"
while [ ! -e "${hold}/release" ]; do sleep 0.02; done
exec ${REAL_MSGFMT} "$@"
`);
    fs.chmodSync(path.join(x.bin, 'msgfmt'), 0o755);
    x.hold = hold;
}
const waitForFile = async (p, timeout = 5000) => {
    const t0 = Date.now();
    while (!fs.existsSync(p)) {
        if (Date.now() - t0 > timeout) { throw new Error(`timed out waiting for ${p}`); }
        await new Promise((r) => setTimeout(r, 20));
    }
};
// The first installer must outlive the second while it holds the lock; it runs
// in its own process group (detached) with ignored stdio, so killing the group
// takes the blocking stub down with it and no inherited pipe keeps a read open.
const holderGroups = [];
test.after(() => {
    for (const pid of holderGroups) { try { process.kill(-pid, 'SIGKILL'); } catch { /* already gone */ } }
});
const spawnHolder = (x) => {
    const p = spawn('bash', [path.join(x.here, 'install.sh')],
        { cwd: x.here, env: x.env, detached: true, stdio: 'ignore' });
    holderGroups.push(p.pid);
    return p;
};
// A second installer with the real msgfmt (no blocking stub): without a lock it
// then shows up as an ordinary concurrent success, not a stall.
const runSecond = (x, timeout = 8000) => spawnSync('bash', [path.join(x.here, 'install.sh')],
    { cwd: x.here, env: { ...x.env, PATH: process.env.PATH }, encoding: 'utf8', timeout, killSignal: 'SIGKILL' });

test('a second installer is refused with a clear message while the first holds the lock', { timeout: 30000 }, async () => {
    const x = makeEnv('lock-refused');
    seedOldInstall(x.home);
    blockMsgfmt(x);
    const first = spawnHolder(x);
    await waitForFile(path.join(x.hold, 'started'));
    const second = runSecond(x);
    assert.equal(second.signal, null, 'the second installer must be refused, not left running');
    assert.ok(second.status > 0, `the second installer must not run concurrently: ${JSON.stringify(second)}`);
    assert.match(second.stderr, /already running/, `the refusal must name the running install: ${second.stderr}`);
    assert.equal(version(destOf(x)), '1.2.0', 'the refused installer changed the installation');
    write(path.join(x.hold, 'release'), '');
    await new Promise((r) => first.on('close', r));
    assert.equal(version(destOf(x)), LATEST);
    assert.ok(fs.existsSync(path.join(destOf(x), 'lib', 'core.js')), 'the published tree is incomplete');
});

test('the lock is released when its holder is killed, and a later installer then succeeds', { timeout: 30000 }, async () => {
    const x = makeEnv('lock-release-kill');
    seedOldInstall(x.home);
    blockMsgfmt(x);
    const first = spawnHolder(x);
    await waitForFile(path.join(x.hold, 'started'));
    const during = runSecond(x);
    assert.equal(during.signal, null, 'the lock must be held while the first installer runs');
    assert.ok(during.status > 0, 'the concurrent installer must be refused while the lock is held');
    process.kill(-first.pid, 'SIGKILL'); // takes the installer and its blocked stub down together
    await new Promise((r) => first.on('close', r));
    const after = runSecond(x);
    assert.equal(after.status, 0, `a later installer must acquire the released lock: ${after.stderr}`);
    assert.equal(version(destOf(x)), LATEST);
    assert.ok(fs.existsSync(path.join(destOf(x), 'lib', 'core.js')), 'the published tree is incomplete');
});

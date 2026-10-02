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
const announced = (r) => /preserved at|back in place/.test(r.stderr);

const run = (x) => spawnSync('bash', [path.join(x.here, 'install.sh')],
    { cwd: x.here, env: x.env, encoding: 'utf8' });

test('SIGTERM after the previous tree was moved aside: it survives and is announced', () => {
    const x = makeEnv('safety-sigterm');
    useStub(x, 'interrupt');
    seedOldInstall(x.home);
    const r = run(x);
    assert.notEqual(r.status, 0, `an interrupted run must not look successful: ${r.stdout}`);
    assert.ok(r.status === 143 || r.signal === 'SIGTERM', `expected a terminated shell, got status=${r.status} signal=${r.signal}`);
    assert.notEqual(version(destOf(x)), LATEST, 'an interrupted run must not publish the new tree');
    assert.ok(!fs.existsSync(path.join(destOf(x), UUID)), 'the new tree was nested inside DEST');
    assert.ok(oldSurvives(x), `the only copy of the previous installation was destroyed — stderr: ${r.stderr}`);
    assert.ok(announced(r), `stderr must say where the previous installation went: ${r.stderr}`);
});

test('SIGINT after the previous tree was moved aside: it survives and is announced', () => {
    const x = makeEnv('safety-sigint');
    useStub(x, 'interrupt-int');
    seedOldInstall(x.home);
    const r = run(x);
    assert.notEqual(r.status, 0, `an interrupted run must not look successful: ${r.stdout}`);
    assert.ok(r.status === 130 || r.signal === 'SIGINT', `expected an interrupted shell, got status=${r.status} signal=${r.signal}`);
    assert.notEqual(version(destOf(x)), LATEST, 'an interrupted run must not publish the new tree');
    assert.ok(oldSurvives(x), `the only copy of the previous installation was destroyed — stderr: ${r.stderr}`);
    assert.ok(announced(r), `stderr must say where the previous installation went: ${r.stderr}`);
});

test('a competing installer publishes DEST before the swap: no nesting, no false success', () => {
    const x = makeEnv('safety-nested');
    useStub(x, 'nested');
    seedOldInstall(x.home);
    const r = run(x);
    assert.notEqual(r.status, 0, `a lost swap must not report success: ${r.stdout}`);
    assert.ok(!fs.existsSync(path.join(destOf(x), UUID)), 'the new tree was nested inside DEST');
    assert.ok(!fs.existsSync(path.join(destOf(x), 'old')), 'the backup was nested inside DEST');
    assert.ok(!r.stdout.includes('installed to'), 'a failed publication must not claim the extension was installed');
    assert.ok(fs.existsSync(path.join(destOf(x), 'competitor-only')), 'the competing installation was overwritten');
    assert.ok(oldSurvives(x), `the previous installation is gone — stderr: ${r.stderr}`);
    assert.ok(r.stderr.includes('preserved at'), `stderr must point at the backup: ${r.stderr}`);
});

test('a DEST created during the restore is not overwritten and cannot nest the backup', () => {
    const x = makeEnv('safety-restore-race');
    useStub(x, 'restore-race');
    seedOldInstall(x.home);
    const r = run(x);
    assert.notEqual(r.status, 0, `a failed restore must not report success: ${r.stdout}`);
    assert.ok(!fs.existsSync(path.join(destOf(x), 'old')), 'the backup was nested into the competing DEST');
    assert.ok(fs.existsSync(path.join(destOf(x), 'competitor-only')), 'the competing installation was overwritten');
    assert.ok(!r.stderr.includes('intact and restored'), `a failed restore must not claim the installation is back: ${r.stderr}`);
    assert.ok(oldSurvives(x), `the previous installation is gone — stderr: ${r.stderr}`);
    assert.ok(r.stderr.includes('preserved at'), `stderr must point at the backup: ${r.stderr}`);
});

test('DEST reappearing before the swap aborts without touching it and keeps the previous tree', () => {
    const x = makeEnv('safety-reappears');
    useStub(x, 'early-backup');
    seedOldInstall(x.home);
    const r = run(x);
    assert.notEqual(r.status, 0, `the abort must not report success: ${r.stdout}`);
    assert.ok(!fs.existsSync(path.join(destOf(x), UUID)), 'the new tree was nested inside DEST');
    assert.ok(fs.existsSync(path.join(destOf(x), 'competitor-only')), 'the installation that appeared was overwritten');
    assert.ok(oldSurvives(x), `the previous installation is gone — stderr: ${r.stderr}`);
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

test('two concurrent installers over an existing installation: one consistent runtime', { timeout: 30000 }, async () => {
    const x = makeEnv('safety-concurrent-update');
    useStub(x, 'none');
    gateEnv(x);
    seedOldInstall(x.home);
    const runs = await Promise.all([spawnInstall(x), spawnInstall(x)]);
    assert.ok(runs.some((r) => r.status === 0), `no installer succeeded: ${JSON.stringify(runs)}`);
    const destVersion = version(destOf(x));
    assert.ok(destVersion === LATEST || destVersion === '1.2.0',
        `DEST is neither a complete new nor the previous installation: ${destVersion}`);
    if (destVersion === LATEST) {
        assert.ok(fs.existsSync(path.join(destOf(x), 'lib', 'core.js')), 'the published tree is incomplete');
    }
    assert.ok(!fs.existsSync(path.join(destOf(x), UUID)), 'a tree was nested inside DEST');
    assert.ok(!fs.existsSync(path.join(destOf(x), 'old')), 'a backup was nested inside DEST');
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

'use strict';
// bump-version.sh updates exactly the 24 version markers and nothing else, and
// refuses invalid or non-increasing versions. Every test runs a copy of the
// script against a copy of the marker files under .yesmem/tmp, so the repo and
// its real version are never touched.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { ROOT } = require('../helpers/cinnamon-loader');
const { markerFiles, readVersion, findMismatches } = require('../helpers/version-markers');

const TMP = path.join(ROOT, '.yesmem', 'tmp');
fs.mkdirSync(TMP, { recursive: true });
const SCRIPT = path.join(ROOT, 'scripts', 'bump-version.sh');
const OLD = readVersion(ROOT);
const OLD_RE = new RegExp(OLD.replace(/\./g, '\\.'), 'g');
// A target strictly above the current version, derived rather than fixed: a
// hardcoded 3.4.5 would silently become "not greater" once the project ships it.
const NEXT = (() => {
    const [maj, min, pat] = OLD.split('.').map(Number);
    return `${maj}.${min}.${pat + 1}`;
})();

// A throwaway repo root: the script under scripts/, plus the marker files.
function makeTree(t) {
    const dir = fs.mkdtempSync(path.join(TMP, 'bump-tree-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'po'), { recursive: true });
    fs.copyFileSync(SCRIPT, path.join(dir, 'scripts', 'bump-version.sh'));
    for (const rel of markerFiles(ROOT)) {
        fs.copyFileSync(path.join(ROOT, rel), path.join(dir, rel));
    }
    return dir;
}

// Every file in the tree (except the git-ignored scratch area) as rel -> content.
function snapshot(dir) {
    const out = new Map();
    const walk = (abs, rel) => {
        for (const entry of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            if (rel === '' && entry.name === '.yesmem') {
                continue;
            }
            const childRel = rel ? `${rel}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
                walk(path.join(abs, entry.name), childRel);
            }
            else {
                out.set(childRel, fs.readFileSync(path.join(abs, entry.name), 'utf8'));
            }
        }
    };
    walk(dir, '');
    return out;
}

const changedFiles = (before, after) =>
    [...after.keys()].filter((rel) => before.get(rel) !== after.get(rel)).sort();

const runBump = (dir, args, env = {}) =>
    spawnSync('bash', [path.join('scripts', 'bump-version.sh'), ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });

test('a bump rewrites exactly the marker lines across the marker files', (t) => {
    const dir = makeTree(t);
    const before = snapshot(dir);
    const r = runBump(dir, [NEXT]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const after = snapshot(dir);

    assert.deepEqual(changedFiles(before, after), markerFiles(dir).slice().sort(),
        'a file outside the marker set changed');
    assert.equal(readVersion(dir), NEXT);
    assert.deepEqual(findMismatches(dir), [], 'the tree is inconsistent after the bump');

    let changedLines = 0;
    for (const rel of markerFiles(dir)) {
        const a = before.get(rel).split('\n');
        const b = after.get(rel).split('\n');
        assert.equal(a.length, b.length, `${rel}: line count changed`);
        for (let i = 0; i < a.length; i++) {
            if (a[i] === b[i]) {
                continue;
            }
            changedLines++;
            // the only change on a line is the version substring
            assert.equal(b[i].replace(NEXT, OLD), a[i], `${rel}:${i + 1}: more than the version changed`);
            assert.equal((a[i].match(OLD_RE) || []).length > (b[i].match(OLD_RE) || []).length, true,
                `${rel}:${i + 1}: the old version was not replaced`);
        }
    }
    // one marker per file, plus package-lock.json's second line
    assert.equal(changedLines, markerFiles(dir).length + 1, 'the bump touched the wrong number of lines');
});

test('the summary names the old and new version', (t) => {
    const dir = makeTree(t);
    const r = runBump(dir, [NEXT]);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.match(r.stdout, new RegExp(`${OLD.replace(/\./g, '\\.')} -> ${NEXT.replace(/\./g, '\\.')}`));
});

// Invalid input and non-increasing versions must be refused and change nothing.
const REJECTED = ['v3.4.5', '', '3.4', '3.4.5.6', '3.4.5-rc1', '03.4.5', OLD, '2.2.2', '1.9.9', '2.1.9', 'abc', '3.4.5 '];
for (const arg of REJECTED) {
    test(`refuses the invalid version ${JSON.stringify(arg)} without touching the tree`, (t) => {
        const dir = makeTree(t);
        const before = snapshot(dir);
        const r = runBump(dir, [arg]);
        assert.notEqual(r.status, 0, `'${arg}' must be rejected`);
        assert.match(r.stderr, /bump-version:/);
        assert.deepEqual(snapshot(dir), before, `'${arg}' changed the tree`);
    });
}

test('refuses to run without an argument', (t) => {
    const dir = makeTree(t);
    const before = snapshot(dir);
    const r = runBump(dir, []);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /usage:/);
    assert.deepEqual(snapshot(dir), before);
});

test('refuses more than one argument', (t) => {
    const dir = makeTree(t);
    const before = snapshot(dir);
    const r = runBump(dir, [NEXT, 'extra']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /usage:/);
    assert.deepEqual(snapshot(dir), before);
});

test('a marker that does not match the current version aborts the whole bump', (t) => {
    const dir = makeTree(t);
    const ja = path.join(dir, 'po', 'ja.po');
    fs.writeFileSync(ja, fs.readFileSync(ja, 'utf8').replace(/Project-Id-Version: greenTile [^\\"]*/, 'Project-Id-Version: greenTile 1.0.0'));
    const before = snapshot(dir);
    const r = runBump(dir, [NEXT]);
    assert.notEqual(r.status, 0, 'a drifted marker must stop the bump');
    assert.deepEqual(snapshot(dir), before, 'an aborted bump changed the tree');
});

// A failing swap must be rolled back: inject a cp that fails for one target and
// piggybacks on the real cp for the rest (the same PATH-stub technique the
// install tests use for mv).
test('a failed swap restores every file (no half-bumped tree)', (t) => {
    const dir = makeTree(t);
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin);
    const realCp = spawnSync('which', ['cp'], { encoding: 'utf8' }).stdout.trim();
    fs.writeFileSync(path.join(bin, 'cp'), `#!/usr/bin/env bash
case "\${@: -1}" in
    *"/\${BUMP_FAIL_CP:?}") echo "cp: simulated failure" >&2; exit 1 ;;
esac
exec "\${BUMP_REAL_CP:?}" "$@"
`);
    fs.chmodSync(path.join(bin, 'cp'), 0o755);
    const before = snapshot(dir);
    const r = runBump(dir, [NEXT], {
        PATH: `${bin}:${process.env.PATH}`,
        BUMP_FAIL_CP: 'de.po',
        BUMP_REAL_CP: realCp,
    });
    assert.notEqual(r.status, 0, 'the failed swap must fail the script');
    assert.match(r.stderr, /restoring the original files/);
    assert.deepEqual(snapshot(dir), before, 'the tree was left half-bumped');
});

// The interrupt path: a signal during the swap must run the same restore. bash
// only runs a trap between commands, so the stub blocks inside the first copy
// long enough for the signal to be pending when that copy returns.
test('an interrupt during the swap restores every file', async (t) => {
    const dir = makeTree(t);
    const bin = path.join(dir, 'bin');
    fs.mkdirSync(bin);
    const realCp = spawnSync('which', ['cp'], { encoding: 'utf8' }).stdout.trim();
    const started = fs.mkdtempSync(path.join(TMP, 'bump-interrupt-'));
    t.after(() => fs.rmSync(started, { recursive: true, force: true }));
    const marker = path.join(started, 'started');
    fs.writeFileSync(path.join(bin, 'cp'), `#!/usr/bin/env bash
if [ ! -e "\${BUMP_CP_MARKER:?}" ]; then
    touch "\${BUMP_CP_MARKER}"
    sleep 0.5
fi
exec "\${BUMP_REAL_CP:?}" "$@"
`);
    fs.chmodSync(path.join(bin, 'cp'), 0o755);
    const before = snapshot(dir);
    const child = spawn('bash', [path.join('scripts', 'bump-version.sh'), NEXT], {
        cwd: dir,
        env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, BUMP_CP_MARKER: marker, BUMP_REAL_CP: realCp },
        stdio: 'ignore',
    });
    const deadline = Date.now() + 10000;
    while (!fs.existsSync(marker) && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.ok(fs.existsSync(marker), 'the sweep did not reach the swap in time');
    child.kill('SIGTERM');
    const outcome = await new Promise((resolve) => child.on('exit', (code, signal) => resolve(code === null ? signal : code)));
    assert.notEqual(outcome, 0, 'an interrupted run must not report success');
    assert.deepEqual(snapshot(dir), before, 'the tree was left half-bumped after an interrupt');
});

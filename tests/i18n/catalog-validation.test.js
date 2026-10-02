'use strict';
// Release gate for the shipped catalogs: `npm run check` and build-release.sh
// must compile every po/*.po with msgfmt before a zip can be published.
// pot-drift.test.js only compares msgids against the pot, so a catalog with a
// syntax error passes every test and the zip build and only breaks later in
// install.sh's msgfmt run — after the release is already published.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT } = require('../helpers/cinnamon-loader');

const VALIDATOR = path.join(ROOT, 'scripts', 'check-catalogs.sh');
const TMP = path.join(ROOT, '.yesmem', 'tmp');
fs.mkdirSync(TMP, { recursive: true });
const mkdir = (dir) => fs.mkdirSync(dir, { recursive: true });

const runValidator = (args, options = {}) => spawnSync('bash', [VALIDATOR, ...args], { encoding: 'utf8', ...options });

// A fixture directory the test removes again when it ends.
const tmpDir = (t, name) => {
    const dir = fs.mkdtempSync(path.join(TMP, name));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
};

test('every shipped catalog compiles (the release gate)', () => {
    const r = runValidator([]);
    assert.equal(r.status, 0, `validator rejected the shipped catalogs:\n${r.stdout}${r.stderr}`);
    assert.doesNotMatch(r.stderr, /does not compile/, 'no catalog may be reported as broken');
});

test('a catalog with a syntax error fails the validator', (t) => {
    const dir = tmpDir(t, 'catalogs-broken-');
    const broken = path.join(dir, 'de.po');
    fs.writeFileSync(broken, 'msgid "unterminated\n');
    const r = runValidator([broken]);
    assert.notEqual(r.status, 0, 'a syntactically broken catalog must not pass');
    assert.match(r.stderr, /de\.po/, 'the failing catalog must be named');
});

test('a missing msgfmt is reported, not silently skipped', (t) => {
    const empty = tmpDir(t, 'catalogs-nopath-');
    const r = spawnSync('/bin/bash', [VALIDATOR], {
        encoding: 'utf8',
        env: { ...process.env, PATH: empty },
    });
    assert.notEqual(r.status, 0, 'without msgfmt the gate must fail, not pass');
    assert.match(r.stderr, /msgfmt/);
});

// Faithful but narrow copy of the tree build-release.sh runs in: only the files
// it reads, with the real catalogs. The real po/ is never modified.
function makeReleaseFixture(t) {
    const dir = tmpDir(t, 'release-fixture-');
    const root = path.join(dir, 'repo');
    mkdir(path.join(root, 'scripts'));
    for (const file of ['metadata.json', 'extension.js', 'settings-schema.json',
        'stylesheet.css', 'icon.png', 'LICENSE', 'build-release.sh']) {
        fs.copyFileSync(path.join(ROOT, file), path.join(root, file));
    }
    fs.cpSync(path.join(ROOT, 'lib'), path.join(root, 'lib'), { recursive: true });
    fs.cpSync(path.join(ROOT, 'po'), path.join(root, 'po'), { recursive: true });
    if (fs.existsSync(VALIDATOR)) {
        fs.copyFileSync(VALIDATOR, path.join(root, 'scripts', 'check-catalogs.sh'));
        fs.chmodSync(path.join(root, 'scripts', 'check-catalogs.sh'), 0o755);
    }
    // the build only copies these two verbatim; their content is irrelevant here
    for (const file of ['install.sh', 'update.sh']) {
        fs.writeFileSync(path.join(root, file), '#!/bin/sh\n');
    }
    return root;
}

const buildRelease = (root) => spawnSync('bash', ['build-release.sh'], { cwd: root, encoding: 'utf8' });

const builtZip = (root) => {
    const dist = path.join(root, 'dist');
    if (!fs.existsSync(dist)) { return null; }
    const zips = fs.readdirSync(dist).filter((f) => f.endsWith('.zip'));
    return zips.length === 1 ? path.join(dist, zips[0]) : null;
};

test('build-release.sh refuses to build a zip from a broken catalog', (t) => {
    const root = makeReleaseFixture(t);
    fs.writeFileSync(path.join(root, 'po', 'de.po'), 'msgid "unterminated\n');
    const r = buildRelease(root);
    assert.notEqual(r.status, 0, 'the release build must fail on a broken catalog');
    assert.match(r.stdout + r.stderr, /de\.po|check-catalogs/);
    assert.equal(builtZip(root), null, 'a broken catalog must not produce a zip');
});

test('build-release.sh builds the unmodified catalogs and ships no validator', (t) => {
    const root = makeReleaseFixture(t);
    const r = buildRelease(root);
    assert.equal(r.status, 0, `the release build failed:\n${r.stdout}${r.stderr}`);
    const zip = builtZip(root);
    assert.ok(zip, 'the build must produce exactly one zip');
    const entries = spawnSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean);
    assert.ok(entries.some((e) => e.endsWith('po/de.po')), 'the catalogs must ship');
    assert.ok(!entries.some((e) => e.includes('scripts/')), 'dev-only scripts must not ship');
});

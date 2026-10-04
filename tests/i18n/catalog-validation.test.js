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

test('a bare validator name refuses to validate an unrelated working tree', () => {
    const r = spawnSync('bash', ['check-catalogs.sh'], {
        cwd: path.dirname(VALIDATOR), encoding: 'utf8',
    });
    assert.notEqual(r.status, 0, 'a bare name must not guess a repository');
    assert.match(r.stderr, /invoke this script by path/);
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

test('a broken last catalog fails both gates without replacing a valid release', (t) => {
    const root = makeReleaseFixture(t);
    const first = buildRelease(root);
    assert.equal(first.status, 0, first.stdout + first.stderr);
    const zip = builtZip(root);
    const before = fs.readFileSync(zip);
    const version = JSON.parse(fs.readFileSync(path.join(root, 'metadata.json'), 'utf8')).version;
    const stage = path.join(root, 'dist', `greenTile-${version}`);
    const marker = path.join(stage, 'previous-build-marker');
    fs.writeFileSync(marker, 'previous stage remains intact\n');
    fs.writeFileSync(path.join(root, 'po', 'zh_CN.po'), 'msgid "unterminated\n');

    const gate = spawnSync('bash', ['./scripts/check-catalogs.sh'], { cwd: root, encoding: 'utf8' });
    assert.notEqual(gate.status, 0, 'the validator must reach the last catalog');
    assert.match(gate.stderr, /zh_CN\.po/);
    const rebuilt = buildRelease(root);
    assert.notEqual(rebuilt.status, 0, 'the actual release build must reject the last catalog');
    assert.match(rebuilt.stderr, /zh_CN\.po/);
    assert.deepEqual(fs.readFileSync(zip), before, 'the last good zip was replaced');
    assert.equal(fs.readFileSync(marker, 'utf8'), 'previous stage remains intact\n');
});

test('a missing compiler fails the build without replacing a valid release', (t) => {
    const root = makeReleaseFixture(t);
    const first = buildRelease(root);
    assert.equal(first.status, 0, first.stdout + first.stderr);
    const zip = builtZip(root);
    const before = fs.readFileSync(zip);
    const bin = tmpDir(t, 'catalogs-build-no-msgfmt-');
    const python = spawnSync('which', ['python3'], { encoding: 'utf8' });
    assert.equal(python.status, 0, 'the actual build requires python3');
    fs.symlinkSync(python.stdout.trim(), path.join(bin, 'python3'));
    fs.symlinkSync('/bin/bash', path.join(bin, 'bash'));
    const r = spawnSync('/bin/bash', ['build-release.sh'], {
        cwd: root, encoding: 'utf8', env: { ...process.env, PATH: bin },
    });
    assert.notEqual(r.status, 0, 'a missing compiler must stop the build');
    assert.match(r.stderr, /msgfmt.*not found/);
    assert.deepEqual(fs.readFileSync(zip), before, 'the last good zip was replaced');
});

test('build-release.sh builds the unmodified catalogs and ships no validator', (t) => {
    const root = makeReleaseFixture(t);
    const r = buildRelease(root);
    assert.equal(r.status, 0, `the release build failed:\n${r.stdout}${r.stderr}`);
    const zip = builtZip(root);
    assert.ok(zip, 'the build must produce exactly one zip');
    const listing = spawnSync('unzip', ['-Z1', zip], { encoding: 'utf8' });
    assert.equal(listing.status, 0, listing.stderr);
    const version = JSON.parse(fs.readFileSync(path.join(root, 'metadata.json'), 'utf8')).version;
    const prefix = `greenTile-${version}/`;
    const entries = listing.stdout.split('\n').filter(Boolean).map((e) => {
        assert.ok(e.startsWith(prefix), `entry outside the release root: ${e}`);
        return e.slice(prefix.length);
    }).sort();
    // The frozen release surface: independent of the build's cp commands and
    // of directory enumeration, so missing or accidentally shipped files fail.
    const uuid = 'greenTile@carsteneu/';
    const libraries = [
        'app/app.js', 'app/config.js',
        'model/accent.js', 'model/drop.js', 'model/editor.js', 'model/exclude.js',
        'model/fill.js', 'model/focus.js', 'model/gap.js', 'model/layouts.js',
        'model/lifecycle.js', 'model/monitor.js', 'model/panel-size.js',
        'model/settings-keys.js', 'model/single.js', 'model/split.js',
        'model/state.js', 'model/swap.js', 'model/teardown.js', 'model/theme.js',
        'runtime/auto.js', 'runtime/border.js', 'runtime/drop.js', 'runtime/exclusions.js',
        'runtime/focus.js', 'runtime/hotkeys.js', 'runtime/monitors.js',
        'runtime/panel-state.js', 'runtime/placement.js', 'runtime/scope.js',
        'runtime/session.js', 'runtime/split.js', 'runtime/theme.js',
        'tiling/debug.js', 'tiling/focus-nav.js', 'tiling/grab.js', 'tiling/layout.js',
        'tiling/order.js', 'tiling/place.js', 'tiling/retile.js', 'tiling/screen.js',
        'tiling/swap.js', 'tiling/windows.js',
        'ui/draw.js', 'ui/editor.js', 'ui/i18n.js', 'ui/panel.js',
    ];
    const catalogs = [
        'ca', 'da', 'de', 'es', 'eu', 'fi', 'fr', 'hu', 'it', 'ja', 'ko', 'nl',
        'pt_BR', 'ro', 'ru', 'sv', 'tr', 'vi', 'zh_CN',
    ];
    const expected = [
        '', 'install.sh', 'update.sh', uuid,
        ...['extension.js', 'metadata.json', 'settings-schema.json', 'stylesheet.css',
            'icon.png', 'LICENSE', 'lib/', 'po/'].map((e) => uuid + e),
        ...['app/', 'model/', 'runtime/', 'tiling/', 'ui/'].map((e) => uuid + 'lib/' + e),
        ...libraries.map((e) => uuid + 'lib/' + e),
        ...catalogs.map((e) => uuid + 'po/' + e + '.po'),
    ].sort();
    assert.deepEqual(entries, expected, 'the complete shipped surface changed');
});

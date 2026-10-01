'use strict';
// install.sh behavior in isolation: every test runs a copy of the script
// under its own fake HOME with a prepared source tree. Failure simulations
// (unreadable sources, failing msgfmt, failing swap) must leave the previous
// installation intact; successful updates must remove stale modules.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { UUID, EXT, LATEST, TMP, runScript, mkdir, write } = require('../helpers/release-env');
const { ROOT } = require('../helpers/cinnamon-loader');

const cleanups = [];
test.after(() => {
    for (const dir of cleanups) {fs.rmSync(dir, { recursive: true, force: true });}
});

const LOCALE = path.join('.local', 'share', 'locale');
const moPath = (home, lang) => path.join(home, LOCALE, lang, 'LC_MESSAGES', `${UUID}.mo`);

// previous installation in the fake HOME: old version, old lib module, and
// the stale greenTile.js, po/ and LICENSE files the live install accumulated
// from older releases and deploys
function seedOldInstall(home) {
    const dest = path.join(home, EXT);
    mkdir(path.join(dest, 'po'));
    write(path.join(dest, 'metadata.json'), `{\n    "uuid": "${UUID}",\n    "version": "1.2.0"\n}\n`);
    write(path.join(dest, 'extension.js'), '// OLD extension\n');
    write(path.join(dest, 'greenTile.js'), '// dead code left by an older version\n');
    write(path.join(dest, 'LICENSE'), 'OLD LICENSE\n');
    write(path.join(dest, 'lib', 'old.js'), 'var old = 1;\n');
    return dest;
}

// the unpacked release next to a copy of install.sh: $HERE/$UUID
function makeSource(x, { onePo = false } = {}) {
    const here = path.join(x.dir, 'release');
    mkdir(path.join(here, UUID, 'po'));
    fs.copyFileSync(path.join(ROOT, 'install.sh'), path.join(here, 'install.sh'));
    const src = path.join(here, UUID);
    write(path.join(src, 'metadata.json'), `{\n    "uuid": "${UUID}",\n    "version": "${LATEST}"\n}\n`);
    write(path.join(src, 'extension.js'), '// NEW extension\n');
    write(path.join(src, 'settings-schema.json'), '{}\n');
    write(path.join(src, 'stylesheet.css'), '.new {}\n');
    write(path.join(src, 'icon.png'), 'png\n');
    write(path.join(src, 'lib', 'core.js'), 'var core = 1;\n');
    write(path.join(src, 'lib', 'util.js'), 'var util = 1;\n');
    const po = (id) => `msgid ""\nmsgstr ""\n"Content-Type: text/plain; charset=UTF-8\\n"\n\nmsgid "a"\nmsgstr "${id}"\n`;
    write(path.join(src, 'po', 'de.po'), po('de'));
    if (!onePo) {
        write(path.join(src, 'po', 'it.po'), po('it'));
    }
    return { src };
}

function makeInstallEnv(name, { msgfmt = 'real', failSwap = false } = {}) {
    const x = { dir: fs.mkdtempSync(path.join(TMP, `${name}-`)) };
    cleanups.push(x.dir);
    x.home = path.join(x.dir, 'home');
    x.bin = path.join(x.dir, 'bin');
    mkdir(x.home);
    mkdir(x.bin);
    if (msgfmt === 'fail') {
        write(path.join(x.bin, 'msgfmt'), '#!/usr/bin/env bash\nexit 42\n');
        fs.chmodSync(path.join(x.bin, 'msgfmt'), 0o755);
    }
    if (failSwap) {
        // counting mv stub for injection: every mv whose target ends in the
        // marked failBookmark fails exactly once, then delegates. This kills
        // the non-atomic swap without production-side test hooks.
        write(path.join(x.bin, 'mv'), `#!/usr/bin/env bash
log="\${GT_MVLOG:?}"
n=$(cat "$log" 2>/dev/null || echo 0)
if [ -n "\${GT_FAIL_MV_MARK:-}" ]; then
    case "\${@: -1}" in
        *"\${GT_FAIL_MV_MARK}")
            if [ "$n" = 0 ]; then
                echo 1 > "$log"
                exit 7
            fi
            ;;
    esac
fi
exec "\${GT_REAL_MV:?}" "$@"
`);
        fs.chmodSync(path.join(x.bin, 'mv'), 0o755);
        x.mvlog = path.join(x.dir, 'mv.log');
        write(x.mvlog, '0');
    }
    x.env = {
        HOME: x.home,
        PATH: `${x.bin}:${process.env.PATH}`,
        GT_REAL_MV: '/bin/mv',
    };
    if (failSwap) {
        x.env.GT_MVLOG = x.mvlog;
        // the swap's target basename is the UUID; backup and .mo moves do not
        // end in the UUID, so injection hits the swap and only the swap
        x.env.GT_FAIL_MV_MARK = UUID;
    }
    return x;
}

const runInstall = (x) => runScript(path.join(x.dir, 'release', 'install.sh'), [], x.env);
const extDir = (x) => path.join(x.home, EXT);
const readMetaVersion = (x) => {
    const meta = path.join(extDir(x), 'metadata.json');
    return fs.readFileSync(meta, 'utf8').match(/"version": *"([^"]*)"/)[1];
};
// the extensions parent must contain no staging leftovers after any outcome
const noStagingLeftovers = (x) => {
    const parent = path.join(x.home, '.local', 'share', 'cinnamon', 'extensions');
    return fs.readdirSync(parent).filter((e) => e.startsWith('.greenTile'));
};
const oldInstallIntact = (x) => {
    assert.equal(readMetaVersion(x), '1.2.0');
    assert.equal(fs.readFileSync(path.join(extDir(x), 'extension.js'), 'utf8').trim(), '// OLD extension');
    assert.ok(fs.existsSync(path.join(extDir(x), 'lib', 'old.js')), 'old lib module lost');
    assert.ok(fs.existsSync(path.join(extDir(x), 'LICENSE')), 'pre-existing LICENSE lost');
    assert.ok(!fs.existsSync(moPath(x.home, 'de')), 'no .mo must be installed on a failed run');
    assert.equal(noStagingLeftovers(x).length, 0);
};
const chmod = (p, mode) => fs.chmodSync(p, mode);

test('fresh install: everything lands, no staging leftovers', () => {
    const x = makeInstallEnv('install-fresh');
    makeSource(x);
    const r = runInstall(x);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.equal(readMetaVersion(x), LATEST);
    assert.ok(fs.existsSync(path.join(extDir(x), 'lib', 'core.js')));
    assert.ok(fs.existsSync(path.join(extDir(x), 'icon.png')));
    assert.ok(fs.existsSync(moPath(x.home, 'de')), 'de .mo compiled');
    assert.ok(fs.existsSync(moPath(x.home, 'it')), 'it .mo compiled');
    assert.equal(noStagingLeftovers(x).length, 0);
});

test('update over stale install: wholesale replacement removes stale modules', () => {
    const x = makeInstallEnv('install-stale');
    makeSource(x);
    const dest = seedOldInstall(x.home);
    const r = runInstall(x);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.equal(readMetaVersion(x), LATEST);
    assert.ok(!fs.existsSync(path.join(dest, 'greenTile.js')), 'dead greenTile.js left behind');
    assert.ok(!fs.existsSync(path.join(extDir(x), 'po')), 'stale po/ dir left behind');
    assert.ok(!fs.existsSync(path.join(extDir(x), 'lib', 'old.js')), 'stale module left behind');
    assert.ok(fs.existsSync(path.join(extDir(x), 'lib', 'core.js')));
    // the fixture source carries no LICENSE yet (issue 11 ships it); the
    // wholesale replacement keeps whatever the new package truly contains
    assert.ok(!fs.existsSync(path.join(extDir(x), 'LICENSE')), 'stale LICENSE must not survive a replacement');
    assert.equal(noStagingLeftovers(x).length, 0);
});

test('failing msgfmt: install aborts before touching the old installation', () => {
    const x = makeInstallEnv('install-msgfmt-fail', { msgfmt: 'fail' });
    const { src } = makeSource(x);
    seedOldInstall(x.home);
    const r = runInstall(x);
    assert.ok(r.status !== 0, 'a failing translation must fail the install');
    oldInstallIntact(x);
    assert.equal(fs.readFileSync(path.join(src, 'extension.js'), 'utf8').trim(), '// NEW extension');
});

test('unreadable lib source file: abort leaves the previous installation intact', () => {
    const x = makeInstallEnv('install-lib-unreadable');
    const { src } = makeSource(x);
    seedOldInstall(x.home);
    chmod(path.join(src, 'lib', 'util.js'), 0o000);
    const r = runInstall(x);
    assert.ok(r.status !== 0, 'unreadable source must fail the install');
    chmod(path.join(src, 'lib', 'util.js'), 0o644);
    oldInstallIntact(x);
});

test('unreadable stylesheet.css: abort leaves the previous installation intact', () => {
    const x = makeInstallEnv('install-css-unreadable');
    const { src } = makeSource(x);
    seedOldInstall(x.home);
    chmod(path.join(src, 'stylesheet.css'), 0o000);
    const r = runInstall(x);
    assert.ok(r.status !== 0, 'unreadable source must fail the install');
    chmod(path.join(src, 'stylesheet.css'), 0o644);
    oldInstallIntact(x);
});

test('unwritable extensions parent: abort leaves the previous installation intact', () => {
    const x = makeInstallEnv('install-parent-ro');
    makeSource(x);
    const dest = seedOldInstall(x.home);
    const parent = path.dirname(dest);
    chmod(parent, 0o555);
    const r = runInstall(x);
    chmod(parent, 0o755);
    assert.ok(r.status !== 0, 'unwritable parent must fail the install');
    oldInstallIntact(x);
});

test('fresh install with failing swap: no half installation, no leftovers', () => {
    const x = makeInstallEnv('install-fresh-swap-fail', { failSwap: true });
    const { src } = makeSource(x);
    const r = runInstall(x);
    assert.ok(r.status !== 0, 'failed swap must fail the install');
    assert.equal(fs.readFileSync(path.join(src, 'extension.js'), 'utf8').trim(), '// NEW extension');
    assert.ok(!fs.existsSync(extDir(x)), 'swap failure created a partial installation');
    assert.equal(noStagingLeftovers(x).length, 0);
});

test('update with failing swap: previous installation is restored', () => {
    const x = makeInstallEnv('install-restore', { failSwap: true });
    const { src } = makeSource(x);
    seedOldInstall(x.home);
    const r = runInstall(x);
    assert.ok(r.status !== 0, 'failed swap must fail the install');
    assert.equal(fs.readFileSync(path.join(src, 'extension.js'), 'utf8').trim(), '// NEW extension');
    oldInstallIntact(x);
    assert.equal(readMetaVersion(x), '1.2.0');
});

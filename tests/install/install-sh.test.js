'use strict';
// install.sh behavior in isolation: every test runs a copy of the script
// under its own fake HOME with a prepared source tree. Failure simulations
// (unreadable sources, failing msgfmt, failing swap) must leave the previous
// installation intact; successful updates must remove stale modules.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { UUID, EXT, LATEST, TMP, REAL_MV, REAL_RM, REAL_MKTEMP, runScript, mkdir, write } = require('../helpers/release-env');
const { ROOT } = require('../helpers/cinnamon-loader');

const cleanups = [];
test.after(() => {
    for (const dir of cleanups) {fs.rmSync(dir, { recursive: true, force: true });}
});

const LOCALE = path.join('.local', 'share', 'locale');
const moPath = (home, lang) => path.join(home, LOCALE, lang, 'LC_MESSAGES', `${UUID}.mo`);
// a stderr line that is install.sh's own note naming the path — checked line
// by line, because mv's own error text mentions the path too and would
// otherwise make a path assertion pass without our warning being emitted
const noteNaming = (r, p) => r.stderr.split('\n').some((l) => l.startsWith('Note:') && l.includes(p));

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
function makeSource(x) {
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
    // the release zip ships the license inside the extension folder (issue 11)
    fs.copyFileSync(path.join(ROOT, 'LICENSE'), path.join(src, 'LICENSE'));
    const po = (id) => `msgid ""\nmsgstr ""\n"Content-Type: text/plain; charset=UTF-8\\n"\n\nmsgid "a"\nmsgstr "${id}"\n`;
    write(path.join(src, 'po', 'de.po'), po('de'));
    write(path.join(src, 'po', 'it.po'), po('it'));
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
        // marked failBookmark fails while the failure count in $GT_MVLOG is
        // below GT_FAIL_MV_TIMES, then delegates. Marks hit the swap and
        // (with a second budget) the restore — no production-side test hooks.
        write(path.join(x.bin, 'mv'), `#!/usr/bin/env bash
log="\${GT_MVLOG:?}"
n=$(cat "$log" 2>/dev/null || echo 0)
if [ -n "\${GT_FAIL_MV_MARK:-}" ]; then
    case "\${@: -1}" in
        *"\${GT_FAIL_MV_MARK}")
            if [ "$n" -lt "\${GT_FAIL_MV_TIMES:-1}" ]; then
                echo $((n + 1)) > "$log"
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
            GT_REAL_MV: REAL_MV,
            GT_REAL_RM: REAL_RM,
            GT_REAL_MKTEMP: REAL_MKTEMP,
    };
    if (failSwap) {
        x.env.GT_MVLOG = x.mvlog;
        // the swap's target basename is the UUID; backup and .mo moves do not
        // end in the UUID, so injection hits the swap and only the swap
        x.env.GT_FAIL_MV_MARK = UUID;
        x.env.GT_FAIL_MV_TIMES = x.env.GT_FAIL_MV_TIMES || '1';
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
    return fs.readdirSync(parent).filter((e) => e.startsWith('.greenTile-install.'));
};
const oldInstallIntact = (x) => {
    assert.equal(readMetaVersion(x), '1.2.0');
    assert.equal(fs.readFileSync(path.join(extDir(x), 'extension.js'), 'utf8').trim(), '// OLD extension');
    assert.ok(fs.existsSync(path.join(extDir(x), 'lib', 'old.js')), 'old lib module lost');
    assert.equal(fs.readFileSync(path.join(extDir(x), 'LICENSE'), 'utf8'), 'OLD LICENSE\n', 'pre-existing LICENSE lost or changed');
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
    assert.ok(fs.readFileSync(path.join(extDir(x), 'LICENSE'), 'utf8').trim().startsWith('GNU GENERAL PUBLIC LICENSE'), 'LICENSE must be carried into the installed extension');
    assert.ok(fs.existsSync(moPath(x.home, 'de')), 'de .mo compiled');
    assert.ok(fs.existsSync(moPath(x.home, 'it')), 'it .mo compiled');
    assert.equal(noStagingLeftovers(x).length, 0);
});

test('fresh install with XDG_DATA_HOME set: translations land in the XDG data dir, not ~/.local/share', () => {
    // mirrors GLib.get_user_data_dir(): $XDG_DATA_HOME wins over the default
    const x = makeInstallEnv('install-xdg');
    makeSource(x);
    const xdgData = path.join(x.home, 'xdg-data');
    const r = runScript(path.join(x.dir, 'release', 'install.sh'), [],
        Object.assign({}, x.env, { XDG_DATA_HOME: xdgData }));
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(fs.existsSync(path.join(xdgData, 'locale', 'de', 'LC_MESSAGES', `${UUID}.mo`)),
        'de .mo compiled into $XDG_DATA_HOME/locale');
    assert.ok(!fs.existsSync(moPath(x.home, 'de')),
        'the default ~/.local/share/locale is NOT written when XDG_DATA_HOME is set');
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
    // the wholesale replacement also refreshes the stale LICENSE with the
    // license text the new package ships
    assert.ok(fs.readFileSync(path.join(extDir(x), 'LICENSE'), 'utf8').trim().startsWith('GNU GENERAL PUBLIC LICENSE'), 'stale LICENSE was not replaced by the package license');
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

test('update with failed restore: backup is kept for manual recovery', () => {
    const x = makeInstallEnv('install-restore-fails', { failSwap: true });
    const { src } = makeSource(x);
    seedOldInstall(x.home);
    x.env.GT_FAIL_MV_TIMES = '2'; // swap fails, then the restore fails too
    const r = runInstall(x);
    assert.ok(r.status !== 0, 'failed restore must fail the install');
    assert.equal(fs.readFileSync(path.join(src, 'extension.js'), 'utf8').trim(), '// NEW extension');
    assert.ok(!fs.existsSync(extDir(x)), 'no half installation must exist');
    assert.ok(r.stderr.includes('preserved at'), `stderr must point at the backup: ${r.stderr}`);
    // the kept stage is the user's only copy now: the old lib module and
    // entry file must still be readable inside $STAGE/old
    const parent = path.join(x.home, '.local', 'share', 'cinnamon', 'extensions');
    const kept = fs.readdirSync(parent).filter((e) => e.startsWith('.greenTile-install.'));
    assert.equal(kept.length, 1, `stage not preserved: ${kept.join(', ')}`);
    assert.equal(fs.readFileSync(path.join(parent, kept[0], 'old', 'lib', 'old.js'), 'utf8').trim(), 'var old = 1;', 'old lib module lost from the backup');
    assert.ok(fs.readFileSync(path.join(parent, kept[0], 'old', 'extension.js'), 'utf8').includes('OLD extension'), 'old extension lost from the backup');
});

// issue 15: the catalogue path must be a plain file. Anything else (a
// directory, or a symlink to one) would make a plain mv move the catalogue
// INSIDE that target and still report success, leaving the path the loader
// reads as a directory. These cases must be refused, named, and never deleted.
const GMO_MAGIC = 0x950412de; // native-endian .mo magic, the first 4 bytes

test('a directory at the .mo path is refused with a named warning and kept intact', () => {
    const x = makeInstallEnv('install-mo-dir');
    makeSource(x);
    const target = moPath(x.home, 'de');
    mkdir(target);
    write(path.join(target, 'user-owned.txt'), 'keep me\n');
    const r = runInstall(x);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(fs.statSync(target).isDirectory(), 'the user directory must stay a directory, not be replaced');
    assert.deepEqual(fs.readdirSync(target), ['user-owned.txt'], 'the catalogue must not be nested inside the directory');
    assert.ok(noteNaming(r, target), `the warning must name the destination: ${r.stderr}`);
    assert.ok(r.stderr.includes('English'), `the warning must state the English limitation: ${r.stderr}`);
});

test('a symlink to a directory at the .mo path is refused, symlink and target stay untouched', () => {
    const x = makeInstallEnv('install-mo-link-dir');
    makeSource(x);
    const target = moPath(x.home, 'de');
    const realDir = path.join(x.dir, 'user-locale-dir');
    mkdir(realDir);
    mkdir(path.dirname(target));
    fs.symlinkSync(realDir, target);
    const r = runInstall(x);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(fs.lstatSync(target).isSymbolicLink(), 'the user symlink must not be replaced');
    assert.deepEqual(fs.readdirSync(realDir), [], 'the catalogue must not be nested in the link target');
    assert.ok(noteNaming(r, target), `the warning must name the destination: ${r.stderr}`);
});

test('a symlink to a file at the .mo path is refused, symlink and target stay untouched', () => {
    const x = makeInstallEnv('install-mo-link-file');
    makeSource(x);
    const target = moPath(x.home, 'de');
    const realFile = path.join(x.dir, 'user.mo');
    write(realFile, 'not a catalogue\n');
    mkdir(path.dirname(target));
    fs.symlinkSync(realFile, target);
    const r = runInstall(x);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(fs.lstatSync(target).isSymbolicLink(), 'the user symlink must not be replaced');
    assert.equal(fs.readFileSync(realFile, 'utf8'), 'not a catalogue\n', 'the link target must be untouched');
    assert.ok(noteNaming(r, target), `the warning must name the destination: ${r.stderr}`);
});

test('a regular .mo file at the path is replaced with a valid compiled catalogue', () => {
    const x = makeInstallEnv('install-mo-file');
    makeSource(x);
    const target = moPath(x.home, 'de');
    write(target, 'stale catalogue\n');
    const r = runInstall(x);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    const stat = fs.lstatSync(target);
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), 'the path must hold a plain file');
    const buf = fs.readFileSync(target);
    assert.equal(buf.readUInt32LE(0), GMO_MAGIC, 'the replaced file must be real msgfmt output');
    assert.ok(!buf.toString('latin1').includes('stale catalogue'), 'the stale content must be gone');
    assert.deepEqual(fs.readdirSync(path.dirname(target)), [`${UUID}.mo`], 'no exchange leftovers');
});

// every name our exchange leaves behind under the catalogue's directory
const leftoversUnder = (target) => fs.readdirSync(path.dirname(target))
    .filter((e) => e.startsWith(`.${UUID}.`));

// The pre-existing directory / symlink refusals are pinned above. The tests
// below pin the rest of the catalogue behaviour: the path is never removed by
// name, the working name is taken exclusively, and a failed publish leaves the
// previous catalogue in place and reported.
test('the catalogue path is never removed by name', () => {
    const x = makeInstallEnv('install-mo-no-rm');
    makeSource(x);
    const target = moPath(x.home, 'de');
    write(target, 'previous catalogue\n');
    // removing the path name is itself a check/delete race: whatever takes the
    // name in that instant is destroyed. The installer must not do it at all.
    write(path.join(x.bin, 'rm'), `#!/usr/bin/env bash
case " $* " in
    *" \${GT_TARGET:?} "*)
        touch "\${GT_RACE_SEEN:?}"
        ;;
esac
exec "\${GT_REAL_RM:?}" "$@"
`);
    fs.chmodSync(path.join(x.bin, 'rm'), 0o755);
    x.env.GT_TARGET = target;
    x.env.GT_RACE_SEEN = path.join(x.dir, 'rm-seen');
    const r = runInstall(x);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(!fs.existsSync(x.env.GT_RACE_SEEN),
        'the catalogue path must never be removed by name — that would destroy whatever took it');
    assert.equal(fs.readFileSync(target).readUInt32LE(0), GMO_MAGIC, 'the catalogue must be in place');
});

test('the working directory is asked for exclusively', () => {
    const x = makeInstallEnv('install-mo-workdir');
    makeSource(x);
    const target = moPath(x.home, 'de');
    const log = path.join(x.dir, 'mktemp.log');
    // the working name must be one the system guarantees is free, i.e. a
    // unique-suffix template — not a name we picked and then hoped for
    write(path.join(x.bin, 'mktemp'), `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "\${GT_MKTEMP_LOG:?}"
exec "\${GT_REAL_MKTEMP:?}" "$@"
`);
    fs.chmodSync(path.join(x.bin, 'mktemp'), 0o755);
    x.env.GT_MKTEMP_LOG = log;
    const r = runInstall(x);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(fs.existsSync(log), 'the installer must take its working name exclusively');
    const calls = fs.readFileSync(log, 'utf8').split('\n');
    assert.ok(calls.some((l) => l.includes(path.dirname(target)) && l.includes('XXXXXX')),
        `the working name must be a unique template next to the catalogue: ${calls.join(' | ')}`);
});

test('without an exclusive working name the catalogue is left untouched', () => {
    const x = makeInstallEnv('install-mo-workdir-fails');
    makeSource(x);
    const target = moPath(x.home, 'de');
    write(target, 'previous catalogue\n');
    // only the working name NEXT TO THE CATALOGUE is taken away: the installer
    // must report that, not fall back to writing under a name that may be taken
    write(path.join(x.bin, 'mktemp'), `#!/usr/bin/env bash
case " $* " in
    *"\${GT_LOCALEDIR:?}"*) echo "mktemp: simulated failure" >&2; exit 1 ;;
esac
exec "\${GT_REAL_MKTEMP:?}" "$@"
`);
    fs.chmodSync(path.join(x.bin, 'mktemp'), 0o755);
    x.env.GT_LOCALEDIR = path.dirname(target);
    const r = runInstall(x);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(noteNaming(r, target), `the warning must name the destination: ${r.stderr}`);
    assert.equal(fs.readFileSync(target, 'utf8'), 'previous catalogue\n', 'the catalogue must stay untouched');
    assert.deepEqual(leftoversUnder(target), [], 'nothing may be left behind');
});

test('a failing catalogue publish keeps the previous catalogue and warns', () => {
    const x = makeInstallEnv('install-mo-publish-fail');
    makeSource(x);
    const target = moPath(x.home, 'de');
    write(target, 'previous catalogue\n');
    // the rename into place fails (e.g. the filesystem refuses it): the
    // previous catalogue must stay and the note must name the path, so the
    // extension keeps working (English fallback if the catalogue is unusable)
    write(path.join(x.bin, 'mv'), `#!/usr/bin/env bash
case "\${@: -1}" in
    */${UUID}.mo) echo "mv: simulated failure" >&2; exit 1 ;;
esac
exec "\${GT_REAL_MV:?}" "$@"
`);
    fs.chmodSync(path.join(x.bin, 'mv'), 0o755);
    const r = runInstall(x);
    assert.equal(r.status, 0, `stderr: ${r.stderr}`);
    assert.ok(noteNaming(r, target), `the warning must name the destination: ${r.stderr}`);
    assert.equal(fs.readFileSync(target, 'utf8'), 'previous catalogue\n', 'the previous catalogue must survive');
    assert.deepEqual(leftoversUnder(target), [], 'nothing may be left behind');
});

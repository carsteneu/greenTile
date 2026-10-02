'use strict';
// The accepted reload/cache limitation, pinned on the INSTALLED 6.6 engine
// (cjs 115.1) through the REAL legacy loader (misc.fileUtils requireModule and
// unloadModule — the functions Cinnamon's Extension and forgetExtension call)
// and Cinnamon's reload sequence.
//
// Installed files and the code a running Cinnamon executes are two different
// things. Measured here:
//   shipped — the entry is re-read from disk on a reload (ENTRY_EVALS=2) but the
//             library subtree is evaluated exactly once (LIB_EVALS=1), so after
//             replacing the file on disk with v2 the entry still reads v1: the
//             reload does not activate the installed bytes. The failing
//             `delete imports.extensions[uuid]` is why — the importer tree is
//             permanent for the process lifetime.
//   fresh   — a NEW process, which is what a Cinnamon restart gives, loads the
//             replaced file and reports v2.
//
// Activation policy (user decision): replaced library source under lib/ becomes
// active through a Cinnamon restart, not through a reload and not by toggling
// the extension off and on; disable/enable stays a lifecycle operation and is
// unaffected. X11 restarts with Alt+F2 then r, Wayland has no such restart and
// needs a log out and back in. install.sh states this and
// tests/install/activation-wording.test.js pins that wording. The importer
// topology this rests on is pinned in native-reload-truth.test.js.
//
// Skipped when `cjs` is not installed; the harness simulation stays the
// always-on contract.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../helpers/cinnamon-loader');

const TMP = path.join(ROOT, '.yesmem', 'tmp', 'native-reload-limitation');
const HOST_CJS = spawnSync('sh', ['-c', 'command -v cjs']).status === 0;

const PROBE = `// Installed files versus the code a running Cinnamon executes, measured on the
// INSTALLED 6.6 engine (cjs 115.1) through the REAL legacy loader
// (/usr/share/cinnamon/js/misc/fileUtils.js requireModule/unloadModule — the
// functions Cinnamon's Extension and forgetExtension call).
//
// Variants:
//   shipped — write the library file with v1, load the entry, replace the file
//             with v2 on disk, then run Cinnamon's reload sequence and observe
//             what the entry sees before and after
//   fresh   — the post-restart case: the file on disk says v2 and a NEW process
//             loads it
//
// Run: cjs limitation-poc.js <FX> <variant>
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const ByteArray = imports.byteArray;
const FX = ARGV[0];
const VARIANT = ARGV[1];
const U = 'greenTile@carsteneu';
const P = (t, v) => print(t + '=' + v);

imports.searchPath.unshift(FX);
imports.searchPath.unshift('/usr/share/cinnamon/js'); // misc.fileUtils, the real loader
const fileUtils = imports.misc.fileUtils;
P('LOADER', typeof fileUtils.requireModule + '/' + typeof fileUtils.unloadModule);

const extDir = FX + '/extensions/' + U;
const meta = { path: extDir };
const entryFile = extDir + '/extension.js';
const stateFile = extDir + '/lib/model/state.js';

const write = (p, s) => {
    GLib.mkdir_with_parents(p.slice(0, p.lastIndexOf('/')), 0o755);
    Gio.File.new_for_path(p).replace_contents(new TextEncoder().encode(s), null, false, Gio.FileCreateFlags.NONE, null);
};
const read = (p) => ByteArray.toString(Gio.File.new_for_path(p).load_contents(null)[1]);
// what the FILE on disk says, independent of any module cache
const onDisk = () => (read(stateFile).match(/value = '([^']*)'/) || [])[1];

const STATE = (v) => [
    \`var value = '\${v}';\`,
    'var evaluated = (globalThis.__libEvals = (globalThis.__libEvals || 0) + 1);',
    'function current() { return value; }',
].join('\\n');

// a lib module that cross-imports another one through the canonical chain, like
// the shipped tree (20 of the 46 lib files address siblings this way)
const CONSUMER = [
    \`const XLET = imports.extensions['\${U}'];\`,
    'var value = \\'consumer:\\' + XLET.lib.model.state.value;',
].join('\\n');

const ENTRY = [
    \`const U = '\${U}';\`,
    'var entryEvals = (globalThis.__entryEvals = (globalThis.__entryEvals || 0) + 1);',
    'const XLET = imports.extensions[U];',
    'var value = XLET.lib.model.consumer.value;',
].join('\\n');

globalThis.__libEvals = 0;
globalThis.__entryEvals = 0;

const seed = (v) => {
    write(stateFile, STATE(v));
    write(extDir + '/lib/model/consumer.js', CONSUMER);
    write(entryFile, ENTRY);
};

const load = () => {
    const idx = fileUtils.requireModule(entryFile, extDir, meta, 'extension', false, true);
    return { idx, mod: fileUtils.getModuleByIndex(idx) };
};

if (VARIANT === 'fresh') {
    seed('v2');
    const loaded = load();
    P('ACTIVE', loaded.mod.value);
    P('DISK', onDisk());
    P('ENTRY_EVALS', globalThis.__entryEvals);
    P('LIB_EVALS', globalThis.__libEvals);
    P('DONE', '');
} else {
    seed('v1');
    const first = load();
    P('ACTIVE1', first.mod.value);
    P('DISK1', onDisk());

    // install/update replaces the file while the process keeps running
    seed('v2');
    P('DISK2', onDisk());

    // Cinnamon's reload: unloadExtension -> forgetExtension (unloadModule + the
    // \`delete imports[folder][uuid]\` that fails) -> loadExtension
    fileUtils.unloadModule(first.idx);
    let del;
    try { del = '' + (delete imports.extensions[U]); } catch (e) { del = 'throw'; }
    P('DELETE_UUID', del);
    const second = load();
    P('ACTIVE2', second.mod.value);
    P('ENTRY_EVALS', globalThis.__entryEvals);
    P('LIB_EVALS', globalThis.__libEvals);
    P('DONE', '');
}
`;

const parse = (out) => {
    const map = {};
    for (const line of out.split('\n')) {
        const eq = line.indexOf('=');
        if (eq > 0) {
            map[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
        }
    }
    return map;
};

const runVariant = (variant) => {
    const fx = path.join(TMP, variant);
    fs.rmSync(fx, { recursive: true, force: true });
    fs.mkdirSync(path.join(fx, 'extensions'), { recursive: true });
    const probePath = path.join(TMP, 'probe.js');
    fs.writeFileSync(probePath, PROBE);
    const run = spawnSync('cjs', [probePath, fx, variant], { encoding: 'utf8', timeout: 60000 });
    assert.equal(run.status, 0, 'cjs probe failed (' + variant + '):\n' + run.stdout + run.stderr);
    return parse(run.stdout);
};

test('installed library files are not the code a running Cinnamon executes — only a fresh process picks them up',
    { skip: !HOST_CJS && 'cjs binary not installed on this host' }, () => {
        try {
            const shipped = runVariant('shipped');
            assert.equal(shipped.ACTIVE1, 'consumer:v1', 'the running entry reads the library it loaded');
            assert.equal(shipped.DISK1, 'v1', 'and that matches the file on disk before the update');
            assert.equal(shipped.DISK2, 'v2', 'after the update the file on disk carries the new code');
            assert.equal(shipped.ACTIVE2, 'consumer:v1', 'while the running entry still reads the old code: the reload activated nothing');
            assert.equal(shipped.ENTRY_EVALS, '2', 'the entry itself is re-read from disk by the reload');
            assert.equal(shipped.LIB_EVALS, '1', 'the library subtree is evaluated exactly once per process');
            assert.equal(shipped.DELETE_UUID, 'false', "forgetExtension's delete of the uuid importer fails, which is why the library survives");

            const fresh = runVariant('fresh');
            assert.equal(fresh.DISK, 'v2', 'a fresh process finds the replaced file on disk');
            assert.equal(fresh.ACTIVE, 'consumer:v2', 'and loads it — the restart is what activates replaced library code');
            assert.equal(fresh.ENTRY_EVALS, '1');
            assert.equal(fresh.LIB_EVALS, '1');
        } finally {
            fs.rmSync(TMP, { recursive: true, force: true });
        }
    });

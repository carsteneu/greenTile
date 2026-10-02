'use strict';
// Option evidence for the reload question: can library code be refreshed in the
// SAME process without a Cinnamon restart? The installed 6.6 engine (cjs 115.1)
// cannot evict an already-resolved native module subtree, so this probe measures
// what actually can. It runs the REAL legacy loader
// (/usr/share/cinnamon/js/misc/fileUtils.js: requireModule/unloadModule, the exact
// functions Cinnamon's Extension/forgetExtension call) against a fixture xlet and
// performs two consecutive Cinnamon-style reloads per variant:
//
//   fixed  — the shipped shape today: entry and lib modules address the library
//            through imports.extensions[UUID].lib...
//   gen    — the entry finds a build-named subtree (imports.extensions[UUID][build]),
//            lib modules keep the canonical chain
//   rebind — same build-named subtree, but the entry rebinds the uuid importer's
//            lib child before importing, so the unchanged canonical chains land
//            in the fresh subtree
//   chains — no importer mutation: every lib module resolves the build root itself
//            from the uuid importer's own searchPath[0]
//
// Measured outcome (asserted below): fixed stays stale forever (LIB_EVALS=1 while
// the entry re-evaluates 3x); gen alone is not enough (a cross-importing lib
// module still comes from the cached canonical tree); rebind and chains both
// deliver fresh library code on every reload, in-process, on the installed engine.
//
// This is platform-behaviour evidence for a decision that belongs to the user
// (see the reload BLOCKED report) — it does not implement any of the options.
// Skipped when `cjs` is not installed; the harness simulation stays the always-on
// contract.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../helpers/cinnamon-loader');

const TMP = path.join(ROOT, '.yesmem', 'tmp', 'native-reload-options');
const HOST_CJS = spawnSync('sh', ['-c', 'command -v cjs']).status === 0;

const PROBE = `// PoC on the INSTALLED 6.6 engine (cjs 115.1) + the REAL Cinnamon legacy loader
// (/usr/share/cinnamon/js/misc/fileUtils.js): does a same-process reload refresh
// library code? Two consecutive reloads per variant.
//
// Fixture fidelity: lib modules cross-import each other through the CANONICAL
// chain (const XLET = imports.extensions[UUID]), exactly like the 46 shipped files.
//
//   fixed  — shipped shape, canonical chain everywhere
//   gen    — fresh build-named subtree found by the entry; lib files keep the canonical chain
//   rebind — build-named subtree + entry rebinds uuidImporter.lib before importing lib
//   chains — no importer mutation: every lib module resolves the build root itself
//            from the uuid importer's searchPath[0]
//
// Run: cjs reload-poc.js <FX> <variant>
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
const entry = extDir + '/extension.js';

const write = (p, s) => {
    GLib.mkdir_with_parents(p.slice(0, p.lastIndexOf('/')), 0o755);
    Gio.File.new_for_path(p).replace_contents(new TextEncoder().encode(s), null, false, Gio.FileCreateFlags.NONE, null);
};

const STATE = (v) => [
    \`var value = '\${v}';\`,
    'var evaluated = (globalThis.__libEvals = (globalThis.__libEvals || 0) + 1);',
    'function current() { return value; }',
].join('\\n');

// a lib module that cross-imports another one through the canonical chain, like the shipped tree
const CONSUMER = [
    \`const XLET = imports.extensions['\${U}'];\`,
    'var value = \\'consumer:\\' + XLET.lib.model.state.value;',
].join('\\n');

// a lib module that resolves the build root itself (no importer mutation):
// the uuid importer exposes __modulePath__, so every file can find the marker
const CONSUMER_CHAINS = [
    \`const U = '\${U}';\`,
    'const Gio = imports.gi.Gio;',
    'const ByteArray = imports.byteArray;',
    'const ROOT = imports.extensions[U];',
    "const build = ByteArray.toString(Gio.File.new_for_path(ROOT.searchPath[0] + '/build-id').load_contents(null)[1]).trim();",
    'const XLET = ROOT[build];',
    "var value = 'consumer:' + XLET.lib.model.state.value;",
    'var rootPath = ROOT.searchPath[0];',
].join('\\n');

const ENTRY_COMMON_HEAD = [
    \`const U = '\${U}';\`,
    'var entryEvals = (globalThis.__entryEvals = (globalThis.__entryEvals || 0) + 1);',
];

const ENTRY_GEN = ENTRY_COMMON_HEAD.concat([
    'const Gio = imports.gi.Gio;',
    'const ByteArray = imports.byteArray;',
    'const XLET = imports.extensions[U];',
    "const buildId = ByteArray.toString(Gio.File.new_for_path(__dirname + '/build-id').load_contents(null)[1]).trim();",
    'const LIB = XLET[buildId];',
    'var value = LIB.lib.model.consumer.value;',
    'var root = buildId;',
]).join('\\n');

const ENTRY_FIXED = ENTRY_COMMON_HEAD.concat([
    'const XLET = imports.extensions[U];',
    'var value = XLET.lib.model.consumer.value;',
    "var root = 'canonical';",
]).join('\\n');

const ENTRY_REBIND = ENTRY_COMMON_HEAD.concat([
    'const Gio = imports.gi.Gio;',
    'const ByteArray = imports.byteArray;',
    'const XLET = imports.extensions[U];',
    "const buildId = ByteArray.toString(Gio.File.new_for_path(__dirname + '/build-id').load_contents(null)[1]).trim();",
    'XLET.lib = XLET[buildId].lib;', // writable importer property: rebind the canonical chain
    'var value = XLET.lib.model.consumer.value;',
    'var root = buildId;',
]).join('\\n');

globalThis.__libEvals = 0;
globalThis.__entryEvals = 0;

// canonical lib always present (leftover of the previous install / prerequisite
// for the canonical name to resolve)
write(extDir + '/lib/model/state.js', STATE('canonical-v1'));
write(extDir + '/lib/model/consumer.js', CONSUMER);
if (VARIANT === 'fixed') {
    write(extDir + '/extension.js', ENTRY_FIXED);
} else {
    write(extDir + '/build-a/lib/model/state.js', STATE('gen-a'));
    write(extDir + '/build-a/lib/model/consumer.js', VARIANT === 'chains' ? CONSUMER_CHAINS : CONSUMER);
    write(extDir + '/build-id', 'build-a');
    write(extDir + '/extension.js', VARIANT === 'rebind' ? ENTRY_REBIND : ENTRY_GEN);
}

const load = () => {
    const idx = fileUtils.requireModule(entry, extDir, meta, 'extension', false, true);
    return { idx, mod: fileUtils.getModuleByIndex(idx) };
};

// Cinnamon reloadExtension = unloadExtension(forgetExtension: unloadModule + delete) then loadExtension
const reload = (prev) => {
    fileUtils.unloadModule(prev.idx);
    let del;
    try { del = '' + (delete imports.extensions[U]); } catch (e) { del = 'throw'; }
    return { del, next: load() };
};

const first = load();
P('L1', first.mod.value + ':' + first.mod.root);

// --- install/update #1
if (VARIANT === 'fixed') {
    write(extDir + '/lib/model/state.js', STATE('canonical-v2'));
    write(extDir + '/lib/model/consumer.js', CONSUMER);
} else {
    write(extDir + '/build-b/lib/model/state.js', STATE('gen-b'));
    write(extDir + '/build-b/lib/model/consumer.js', VARIANT === 'chains' ? CONSUMER_CHAINS : CONSUMER);
    write(extDir + '/build-id', 'build-b');
}
const r1 = reload(first);
P('DELETE_UUID', r1.del);
P('L2', r1.next.mod.value + ':' + r1.next.mod.root);

// --- install/update #2 (proves repeated freshness, not fresh-once)
if (VARIANT === 'fixed') {
    write(extDir + '/lib/model/state.js', STATE('canonical-v3'));
    write(extDir + '/lib/model/consumer.js', CONSUMER);
} else {
    write(extDir + '/build-c/lib/model/state.js', STATE('gen-c'));
    write(extDir + '/build-c/lib/model/consumer.js', VARIANT === 'chains' ? CONSUMER_CHAINS : CONSUMER);
    write(extDir + '/build-id', 'build-c');
}
const r2 = reload(r1.next);
P('L3', r2.next.mod.value + ':' + r2.next.mod.root);

P('ENTRY_EVALS', globalThis.__entryEvals); // entry re-evaluated from disk each reload
P('LIB_EVALS', globalThis.__libEvals);     // lib modules evaluated
if (VARIANT !== 'fixed') {
    const oldGen = imports.extensions[U]['build-a'];
    P('OLD_GEN_STILL', oldGen ? oldGen.lib.model.state.value : 'absent');
}
if (VARIANT === 'chains') P('ROOT_PATH', imports.extensions[U].searchPath[0]);
P('FRESH_1', r1.next.mod.value !== first.mod.value);
P('FRESH_2', r2.next.mod.value !== r1.next.mod.value);
P('DONE', '');
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

test('installed cjs 6.6: reload refreshes the entry every time but only a build-scoped root refreshes the library',
    { skip: !HOST_CJS && 'cjs binary not installed on this host' }, () => {
        try {
            const fixed = runVariant('fixed');
            assert.equal(fixed.L1, 'consumer:canonical-v1:canonical', 'the shipped shape loads the canonical library');
            assert.equal(fixed.DELETE_UUID, 'false', "forgetExtension's delete of the uuid importer fails on 6.6");
            assert.equal(fixed.ENTRY_EVALS, '3', 'the entry itself is re-read from disk on every reload');
            assert.equal(fixed.LIB_EVALS, '1', 'the library subtree is evaluated exactly once per process');
            assert.equal(fixed.L2, fixed.L1, 'reload #1 leaves the edited library code stale');
            assert.equal(fixed.L3, fixed.L1, 'reload #2 leaves it stale as well');

            const gen = runVariant('gen');
            assert.equal(gen.L1, 'consumer:canonical-v1:build-a', 'the entry does reach the fresh build subtree');
            assert.equal(gen.L2, 'consumer:canonical-v1:build-b', 'but a cross-importing lib module still resolves the cached canonical tree');
            assert.equal(gen.LIB_EVALS, '1', 'no library module was re-evaluated');
            assert.equal(gen.FRESH_1, 'false', 'a build-named root alone does not deliver fresh library code');

            const rebind = runVariant('rebind');
            assert.equal(rebind.L1, 'consumer:gen-a:build-a', 'rebind lands the canonical chain in the fresh subtree');
            assert.equal(rebind.L2, 'consumer:gen-b:build-b', 'reload #1 delivers the new library code');
            assert.equal(rebind.L3, 'consumer:gen-c:build-c', 'reload #2 delivers the next one');
            assert.equal(rebind.LIB_EVALS, '3', 'the library is re-evaluated on every reload');
            assert.equal(rebind.FRESH_1, 'true');
            assert.equal(rebind.FRESH_2, 'true');
            assert.equal(rebind.OLD_GEN_STILL, 'gen-a', 'the superseded generation keeps its own namespace');

            const chains = runVariant('chains');
            assert.equal(chains.L1, 'consumer:gen-a:build-a', 'per-module build-root resolution finds the fresh subtree');
            assert.equal(chains.L2, 'consumer:gen-b:build-b');
            assert.equal(chains.L3, 'consumer:gen-c:build-c');
            assert.equal(chains.LIB_EVALS, '3');
            assert.equal(chains.FRESH_1, 'true');
            assert.equal(chains.FRESH_2, 'true');
            assert.ok(chains.ROOT_PATH && chains.ROOT_PATH.startsWith('/'), 'the uuid importer exposes its directory in searchPath[0]');
        } finally {
            fs.rmSync(TMP, { recursive: true, force: true });
        }
    });

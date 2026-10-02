'use strict';
// Platform-truth probe against the INSTALLED cjs engine (6.6, 115.1), not the
// simulation: a single pure-cjs child process runs against a fixture tree and
// records how the native importer behaves when files change on disk mid-session.
// It backs the reload topology the harness pins elsewhere:
//
//  (1) the uuid directory importer's property on imports.extensions is
//      permanent — configurable:false, delete fails, so the tree can never be
//      evicted by forgetExtension's `delete imports.extensions[uuid]`.
//  (2) an EXISTING lib module stays cached after its file content changes on
//      disk: the same value comes back, evaluation does not re-run. This is
//      the stale-lib-on-reload fact (entry re-evaluates, lib does not).
//  (3) a NEW module file that appears on disk IS visible through the live
//      importer with fresh content (lazy enumeration — install/update adding
//      new files does not need a cache clear for the new files themselves).
//  (4) installed cjs 115 exposes no clearCache on the directory importer —
//      accessing the method throws ImportError (upstream's clearXletImportCache
//      wraps that in its try/catch; on 6.6 there is nothing to call).
//  (5) the upstream searchPath-isolation technique yields exactly ONE fresh
//      evaluation per process; the root importer is memoized, so a second
//      isolation returns the same namespace — no per-reload freshness on 6.6.
//
// The probe is skipped when `cjs` is not installed (plain CI hosts); the
// harness simulation remains the always-on contract and this test is the
// real-engine cross-check.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../helpers/cinnamon-loader');

const TMP = path.join(ROOT, '.yesmem', 'tmp', 'native-truth');
const FIX = path.join(TMP, 'fx');
const STATE_V1 = [
    'var loads = (globalThis.__nLoads = (globalThis.__nLoads || 0) + 1);',
    "var value = 'v1';",
    'function current() { return value; }',
].join('\n');

const PROBE = `
const Gio = imports.gi.Gio;
const FX = ARGV[0];
const UUID = 'greenTile@carsteneu';
const printLine = (tag, val) => print(tag + '=' + val);
globalThis.__nLoads = 0;
imports.searchPath.unshift(FX);

const d = Object.getOwnPropertyDescriptor(imports.extensions, UUID);
printLine('UUID_CFG', d ? d.configurable : 'none');

const st = imports.extensions[UUID].lib.model.state;
printLine('LOAD1', globalThis.__nLoads + ':' + st.value);

// mid-process disk change: rewrite the existing module and add a NEW one
const stFile = Gio.File.new_for_path(FX + '/extensions/' + UUID + '/lib/model/state.js');
const stOk = stFile.replace_contents(
    new TextEncoder().encode("var loads = (globalThis.__nLoads = (globalThis.__nLoads || 0) + 1);\\nvar value = 'v2';\\nfunction current() { return value; }\\n"),
    null, false, Gio.FileCreateFlags.NONE, null)[0];
const nm = Gio.File.new_for_path(FX + '/extensions/' + UUID + '/lib/model/newmod.js');
const nmOk = nm.replace_contents(
    new TextEncoder().encode("var created = 'fresh-new-file';\\n"),
    null, false, Gio.FileCreateFlags.NONE, null)[0];
printLine('WRITE_OK', stOk + ':' + nmOk);

// re-access the EXISTING module through the same importer: cached, still v1
const st2 = imports.extensions[UUID].lib.model.state;
printLine('STALE', st2.value + ':' + globalThis.__nLoads);

// NEW file on disk is picked up lazily with fresh content
const nm2 = imports.extensions[UUID].lib.model.newmod;
printLine('NEWMOD', nm2 ? nm2.created : 'absent');

// no clearCache on the installed importer
let cc;
try {
    imports.extensions[UUID].clearCache('lib');
    cc = 'absent-no-throw';
} catch (e) {
    cc = 'throws';
}
printLine('CC', cc);

// forgetExtension's delete: permanent property, cannot evict
let del;
try {
    del = '' + (delete imports.extensions[UUID]);
} catch (e) {
    del = 'throws';
}
printLine('DEL', del);
const st3 = imports.extensions[UUID].lib.model.state;
printLine('AFTER_DEL', st3.value + ':' + globalThis.__nLoads);

// upstream searchPath isolation: exactly one fresh eval, then memoized
const orig = imports.searchPath.slice();
const iso1 = (imports.searchPath = [FX + '/extensions'], (() => {
    const imp = imports[UUID];
    imports.searchPath = orig;
    return imp;
})());
const m1 = iso1.lib.model.state;
printLine('ISO1', globalThis.__nLoads + ':' + m1.value + ' vs ' + st.value);
const isoX = (imports.searchPath = [FX + '/extensions'], (() => {
    const imp = imports[UUID];
    imports.searchPath = orig;
    return imp;
})());
const m2 = isoX.lib.model.state;
printLine('ISO2', globalThis.__nLoads + ':' + (m2 === m1));
printLine('DONE', '');
`;

const parseLines = (out) => {
    const map = {};
    for (const line of out.split('\n')) {
        const eq = line.indexOf('=');
        if (eq > 0) {
            map[line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
        }
    }
    return map;
};

test('real cjs 6.6 importer: uuid tree permanent, existing lib stale, new files lazily fresh, no clearCache, isolation fresh-once',
    { skip: !(spawnSync('sh', ['-c', 'command -v cjs']).status === 0) && 'cjs binary not installed on this host' }, () => {
        fs.rmSync(TMP, { recursive: true, force: true });
        fs.mkdirSync(path.join(FIX, 'extensions', 'greenTile@carsteneu', 'lib', 'model'), { recursive: true });
        fs.writeFileSync(path.join(FIX, 'extensions', 'greenTile@carsteneu', 'lib', 'model', 'state.js'), STATE_V1);
        const probePath = path.join(TMP, 'probe.js');
        fs.writeFileSync(probePath, PROBE);
        const run = spawnSync('cjs', [probePath, FIX], { encoding: 'utf8', timeout: 60000 });
        fs.rmSync(TMP, { recursive: true, force: true });
        assert.equal(run.status, 0, 'cjs probe failed:\n' + run.stdout + run.stderr);
        const m = parseLines(run.stdout);

        assert.equal(m.UUID_CFG, 'false', 'uuid dir importer property is permanent (configurable:false)');
        assert.equal(m.LOAD1, '1:v1', 'first evaluation runs once');
        assert.equal(m.WRITE_OK, 'true:true', 'mid-process disk writes succeeded');
        assert.equal(m.STALE, 'v1:1', 'the existing lib module ignored its new byte content — reload cannot refresh it');
        assert.equal(m.NEWMOD, 'fresh-new-file', 'a module that did not exist at importer creation is read fresh (lazy enumeration)');
        assert.equal(m.CC, 'throws', 'installed cjs 115 exposes no clearCache on the directory importer');
        assert.equal(m.DEL, 'false', 'forgetExtension delete of the uuid property fails — the tree survives');
        // the valuation after the failed delete proves no re-evaluation happened
        assert.equal(m.AFTER_DEL, 'v1:1', 'nothing re-evaluated after the permanent-property delete failed');
        // the isolation technique evaluates fresh exactly once, then memoizes
        assert.ok(m.ISO1.startsWith('2:v'), 'the first isolated importer evaluates the module fresh (2nd eval)');
        assert.ok(m.ISO2.startsWith('2:') && m.ISO2.endsWith('true'), 'the second isolation is the same memoized importer — no per-reload freshness');
        assert.ok(m.DONE !== undefined, 'probe finished cleanly');
    });

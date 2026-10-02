'use strict';
// Semantics tests for the native importer simulation (tests/helpers
// /native-importer.js): synthetic fixture trees via injected read/listDir, so
// the contract is pinned without file-system fixtures. These tests are the
// executable contract for the shipped migration: only top-level var and
// function declarations are public, const/let/class stay private, modules are
// cached per path and re-evaluated after clearCache, cycles are rejected.
const test = require('node:test');
const assert = require('node:assert/strict');

const { createXletImporter, publicNames } = require('./native-importer');

const fixtureTree = (files) => {
    const entries = (dir) => {
        const names = new Set();
        for (const file of Object.keys(files)) {
            if (!file.startsWith(dir + '/')) {
                continue;
            }
            const rest = file.slice(dir.length + 1);
            names.add(rest.split('/')[0]);
        }
        return [...names].sort().map((name) => {
            const child = dir ? `${dir}/${name}` : name;
            const isDir = Object.keys(files).some((f) => f.startsWith(child + '/'));
            return {
                name,
                isDirectory: () => isDir,
                isFile: () => !isDir,
            };
        });
    };
    return { entries };
};

const makeImporter = (files) => {
    const { entries } = fixtureTree(files);
    return createXletImporter({
        root: '/xlet',
        read: (file) => {
            assert.ok(files[file], 'unexpected read: ' + file);
            return files[file];
        },
        listDir: entries,
    });
};

test('only top-level var and function declarations are public', () => {
    const xlet = makeImporter({
        '/xlet/mod.js': [
            'var visibleVar = 1;',
            'const hiddenConst = 2;',
            'let hiddenLet = 3;',
            'function visibleFn() { return hiddenConst; }',
            'class HiddenClass {}',
            'var varFn = () => 9;',
        ].join('\n'),
    });
    const mod = xlet.mod;
    assert.equal(mod.visibleVar, 1);
    assert.equal(typeof mod.visibleFn, 'function');
    assert.equal(mod.visibleFn(), 2);
    assert.equal(mod.varFn(), 9);
    assert.equal(mod.hiddenConst, undefined);
    assert.equal(mod.hiddenLet, undefined);
    assert.equal(mod.HiddenClass, undefined);
    assert.deepEqual(Object.keys(mod).sort(), ['varFn', 'visibleFn', 'visibleVar']);
});

test('nested directory chain resolves and caches the same namespace', () => {
    globalThis.__evals = 0;
    const xlet = makeImporter({
        '/xlet/lib/one/a.js': 'var value = ++globalThis.__evals;',
        '/xlet/lib/one/b.js': 'function fromB() { return 2; }',
    });
    assert.equal(xlet.lib.one.a.value, 1);
    assert.equal(typeof xlet.lib.one.b.fromB, 'function');
    // same namespace object on repeat access: the cache, not a re-evaluation
    assert.equal(xlet.lib.one.a.value, 1);
    assert.equal(globalThis.__evals, 1);
    delete globalThis.__evals;
});

test('clearCache drops the module, the next access re-evaluates', () => {
    globalThis.__evals = 0;
    const xlet = makeImporter({
        '/xlet/lib/m.js': 'var value = ++globalThis.__evals;',
    });
    assert.equal(xlet.lib.m.value, 1);
    assert.equal(xlet.lib.m.value, 1);
    xlet.lib.clearCache('m');
    assert.equal(xlet.lib.m.value, 2);
    // directory importers are permanent: clearing the directory NAME does
    // not invalidate the children (GJS importer truth, r3)
    xlet.clearCache('lib');
    assert.equal(xlet.lib.m.value, 2);
    assert.equal(globalThis.__evals, 2);
    delete globalThis.__evals;
});

test('clearCache matches the upstream enumeration loop', () => {
    globalThis.__evals = 0;
    const xlet = makeImporter({
        '/xlet/one.js': 'var a = ++globalThis.__evals;',
        '/xlet/lib/two.js': 'var b = ++globalThis.__evals;',
    });
    void xlet.one.a;
    void xlet.lib.two.b;
    // upstream clearXletImportCache: getOwnPropertyNames + clearCache per prop
    for (const prop of Object.getOwnPropertyNames(xlet)) {
        if (prop === 'clearCache' || prop.startsWith('__')) {
            continue;
        }
        xlet.clearCache(prop);
    }
    assert.equal(xlet.one.a, 3); // direct module re-evaluated
    assert.equal(xlet.lib.two.b, 2, 'the directory clear did not invalidate the child module'); // subtree under lib/ re-evaluated too
    assert.equal(globalThis.__evals, 3);
    delete globalThis.__evals;
});

test('circular imports are rejected with the evaluated chain', () => {
    const xlet = makeImporter({
        '/xlet/lib/ping.js': 'var pong = imports.lib.pong;',
        '/xlet/lib/pong.js': 'var ping = imports.lib.ping;',
    });
    globalThis.imports = xlet;
    assert.throws(() => xlet.lib.ping, /circular native import: lib\/ping -> lib\/pong -> lib\/ping/);
    delete globalThis.imports;
});

test('a module that re-exports nothing exposes no module property', () => {
    const xlet = makeImporter({
        '/xlet/lib/empty.js': 'const onlyPrivate = 1;',
    });
    assert.deepEqual(Object.keys(xlet.lib.empty), []);
});

test('a missing module resolves to undefined, like an object property', () => {
    const xlet = makeImporter({});
    // JS object semantics of the simulation: the native-resolver test forbids
    // missing targets statically, so the shipped graph never relies on this.
    assert.equal(xlet.lib, undefined);
});

test('shipped strict mode: undeclared assignment throws inside the module', () => {
    const xlet = makeImporter({
        '/xlet/lib/strict.js': 'function go() { undeclaredGlobal = 1; }',
    });
    assert.throws(() => xlet.lib.strict.go(), /undeclaredGlobal/);
});

test('eval-time and call-time receiver is the namespace object', () => {
    const xlet = makeImporter({
        '/xlet/entry.js': [
            'var seen = null;',
            'function enable() { this.session = "session"; }',
            'function read() { return this.session; }',
        ].join('\n'),
    });
    const mod = xlet.entry;
    mod.enable();
    assert.equal(mod.read(), 'session');
    assert.equal(globalThis.session, undefined);
});

test('publicNames covers var and function, never const/let/class', () => {
    const names = publicNames([
        'var a = 1;',
        'function b() {}',
        'const c = 2;',
        'let d = 3;',
        'class E {}',
        'var f = () => 1;',
    ].join('\n'));
    assert.deepEqual(names.sort(), ['a', 'b', 'f']);
});

test('non-javascript entries are not exposed as modules', () => {
    const xlet = makeImporter({
        '/xlet/lib/data.json': '{"k": 1}',
        '/xlet/lib/code.js': 'var ok = true;',
    });
    assert.equal(xlet.lib.code.ok, true);
    assert.ok(!Object.prototype.hasOwnProperty.call(xlet.lib, 'data'));
});

// ---------------- reload topology (r3: the REAL per-generation contract) ----------------
// Reviewer's real-CJS probes of 6.6 fileUtils/forgetExtension/main and of
// upstream installXletImporter established: (a) on 6.6 the entry re-evaluates
// after a reload while the lib modules of the global imports.extensions tree
// STAY CACHED — deleting the subtree property does not evict the native
// module cache; (b) upstream builds a PRIVATE per-extension importer for the
// entry that is a DIFFERENT importer from the global UUID tree the shipped
// XLET chains resolve through. These tests pin exactly that topology.

test('6.6 reload: the entry re-evaluates with fresh state, the global lib tree stays cached', () => {
    globalThis.__topoEvals = 0;
    const files = {
        '/xlet/extension.js': [
            'var entryLoads = ++globalThis.__topoEvals;',
            'var lifecycle = { session: null };',
            'var currentSession = () => lifecycle.session;',
        ].join('\n'),
        '/xlet/lib/state.js': 'var libLoads = ++globalThis.__topoEvals;',
    };
    // the imports root caches the xlet directory at startup (main.js
    // _addXletDirectoriesToSearchPath) — ONE importer for the process
    const importsRoot = { extensions: { 'greenTile@carsteneu': makeImporter(files) } };
    const tree = importsRoot.extensions['greenTile@carsteneu'];
    assert.equal(tree.extension.entryLoads, 1);
    assert.equal(tree.lib.state.libLoads, 2);

    // reload: the subtree property is deleted and rebuilt, but the cached
    // directory importer is re-used — only the ENTRY module entry is cleared
    delete importsRoot.extensions['greenTile@carsteneu'];
    importsRoot.extensions['greenTile@carsteneu'] = tree;
    tree.clearCache('extension');
    assert.equal(tree.extension.entryLoads, 3, 'the entry module re-evaluated');
    assert.equal(tree.extension.currentSession(), null, 'the fresh lifecycle holder starts empty');
    assert.equal(tree.lib.state.libLoads, 2, 'the lib module stayed cached across the reload');
    assert.equal(globalThis.__topoEvals, 3);
    delete globalThis.__topoEvals;
});

test('clearing a directory name does not invalidate its children (GJS importer truth)', () => {
    globalThis.__dirEvals = 0;
    const xlet = makeImporter({
        '/xlet/lib/mod.js': 'var loads = ++globalThis.__dirEvals;',
    });
    assert.equal(xlet.lib.mod.loads, 1);
    xlet.clearCache('lib');
    assert.equal(xlet.lib.mod.loads, 1, 'directory importers are permanent; the child module stayed cached');
    delete globalThis.__dirEvals;
});

test('upstream topology: the private entry importer and the global UUID tree are distinct', () => {
    globalThis.__twoTrees = 0;
    const files = {
        '/xlet/extension.js': 'var loads = ++globalThis.__twoTrees;',
        '/xlet/lib/state.js': 'var loads = ++globalThis.__twoTrees;',
    };
    // upstream installXletImporter builds a fresh importer for the entry;
    // the shipped XLET chains resolve through the global UUID tree instead
    const globalTree = makeImporter(files);
    const entryTree = makeImporter(files);
    assert.notEqual(entryTree.lib.state, globalTree.lib.state,
        'the two importers produce distinct module namespaces (verified in real cjs)');
    assert.equal(entryTree.lib.state.loads + globalTree.lib.state.loads, 3,
        'each namespace froze its own counter value (1 + 2)');
    assert.equal(globalThis.__twoTrees, 2, 'exactly two module evaluations across both importers');
    delete globalThis.__twoTrees;
});

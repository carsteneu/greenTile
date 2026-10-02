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
    // subtree form: clearing a directory drops everything under it
    xlet.clearCache('lib');
    assert.equal(xlet.lib.m.value, 3);
    assert.equal(globalThis.__evals, 3);
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
    assert.equal(xlet.lib.two.b, 4); // subtree under lib/ re-evaluated too
    assert.equal(globalThis.__evals, 4);
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

test('6.6 reload identity: a fresh importer instance re-evaluates modules with fresh state', () => {
    // 6.6 forgetExtension deletes the whole imports.extensions[uuid] subtree
    // on unload; the next access builds a NEW directory importer. Module
    // state (top-level let/var mutations) must NOT leak across generations.
    globalThis.__importerEvals = 0;
    const files = {
        '/xlet/lib/state.js': [
            'var loads = ++globalThis.__importerEvals;',
            'var mutable = 1;',
            'function bump() { mutable = 2; }',
        ].join('\n'),
    };
    const first = makeImporter(files);
    assert.equal(first.lib.state.loads, 1);
    first.lib.state.bump();
    assert.equal(first.lib.state.mutable, 2, 'state mutated inside the generation');

    const second = makeImporter(files);
    assert.notEqual(second.lib.state, first.lib.state, 'distinct namespace objects');
    assert.equal(second.lib.state.loads, 2, 'module body re-evaluated for the new importer');
    assert.equal(second.lib.state.mutable, 1, 'no module state leaked across the reload');
    delete globalThis.__importerEvals;
});

test('the extensions-root reload contract: subtree delete + rebuild swaps the tree wholesale', () => {
    globalThis.__importerEvals = 0;
    const files = {
        '/xlet/extension.js': 'var currentSession = () => null;',
        '/xlet/lib/state.js': 'var loads = ++globalThis.__importerEvals;',
    };
    // main.js model: the imports root caches the xlet directories
    const importsRoot = { extensions: { 'greenTile@carsteneu': makeImporter(files) } };
    assert.equal(importsRoot.extensions['greenTile@carsteneu'].lib.state.loads, 1);
    // forgetExtension: delete the subtree
    delete importsRoot.extensions['greenTile@carsteneu'];
    assert.equal(importsRoot.extensions['greenTile@carsteneu'], undefined, 'the old tree is gone');
    // _addXletDirectoriesToSearchPath rebuilds a NEW importer on next access
    importsRoot.extensions['greenTile@carsteneu'] = makeImporter(files);
    const reloaded = importsRoot.extensions['greenTile@carsteneu'];
    assert.equal(reloaded.lib.state.loads, 2, 'fresh evaluation after reload');
    assert.equal(typeof reloaded.extension.currentSession, 'function', 'entry surface intact');
    assert.equal(reloaded.extension.currentSession(), null, 'the fresh lifecycle holder starts empty');
    delete globalThis.__importerEvals;
});

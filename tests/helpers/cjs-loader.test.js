'use strict';
// Source-faithful probes for the 6.6 legacy loader emulation
// (tests/helpers/cjs-loader.js): real fixture FILES on disk, so the size
// cache, the dir-wide unload and the require-closure dir binding run
// against the same file I/O the real fileUtils sees.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCjsLoader } = require('./cjs-loader');

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'gt-cjs-'));
test.after(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const writeModule = (rel, src) => {
    const abs = path.join(tmpRoot, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, src);
    return abs;
};

test('cache: same path and size returns the SAME module object without re-evaluation', () => {
    const abs = writeModule('cache/counter.js', 'var n = (globalThis.__cjsEvals = (globalThis.__cjsEvals || 0) + 1);');
    const loader = createCjsLoader({ root: tmpRoot });
    const first = loader.requireModule(abs);
    const second = loader.requireModule(abs);
    assert.equal(first, second, 'identity-stable cache hit');
    assert.equal(globalThis.__cjsEvals, 1, 'module body ran exactly once');
    delete globalThis.__cjsEvals;
});

test('a file change (different size) forces re-evaluation', () => {
    const abs = writeModule('cache/changed.js', 'var v = 1;');
    const loader = createCjsLoader({ root: tmpRoot });
    const first = loader.requireModule(abs);
    fs.writeFileSync(abs, 'var v = 2; // padding to change the size\n');
    const second = loader.requireModule(abs);
    assert.notEqual(first, second, 'changed size invalidates the cache');
    assert.equal(second.v, 2, 'the new module body ran');
});

test('auto-export skips importNames (lowercased) and loaded GI namespaces', () => {
    const abs = writeModule('skip/skip.js', [
        'var Meta = 1;',
        'var mainloop = 2;',
        'var tweener = 3;',
        'var Kept = 4;',
        'function keptFn() { return 5; }',
    ].join('\n'));
    const loader = createCjsLoader({ root: tmpRoot });
    const mod = loader.requireModule(abs);
    assert.equal(mod.Kept, 4);
    assert.equal(mod.keptFn(), 5);
    assert.equal(mod.Meta, undefined, 'GI namespace names are not modularized');
    assert.equal(mod.mainloop, undefined, 'importNames entries are not modularized');
    assert.equal(mod.tweener, undefined, 'importNames entries are not modularized');
    assert.deepEqual(Object.keys(mod).sort(), ['Kept', 'keptFn']);
});

test('an explicit module.exports line suppresses the auto-export entirely', () => {
    const abs = writeModule('skip/explicit.js', 'var a = 1;\nmodule.exports = { b: 2 };');
    const loader = createCjsLoader({ root: tmpRoot });
    const mod = loader.requireModule(abs);
    assert.deepEqual(mod, { b: 2 });
});

test('unloadModule is dir-wide: every module of the directory re-evaluates, others keep their cache', () => {
    const aAbs = writeModule('dir1/a.js', 'var n = (globalThis.__dir1 = (globalThis.__dir1 || 0) + 1);');
    const bAbs = writeModule('dir1/b.js', 'var n = (globalThis.__dir1b = (globalThis.__dir1b || 0) + 1);');
    const otherAbs = writeModule('dir2/other.js', 'var n = (globalThis.__dir2 = (globalThis.__dir2 || 0) + 1);');
    const loader = createCjsLoader({ root: tmpRoot });
    loader.requireModule(aAbs);
    loader.requireModule(bAbs);
    loader.requireModule(otherAbs);
    loader.unloadModule(loader.findModuleIndex(aAbs));
    // unloading a.js cleared b.js too (same dir), but not dir2/other.js
    loader.requireModule(aAbs);
    loader.requireModule(bAbs);
    loader.requireModule(otherAbs);
    assert.equal(globalThis.__dir1, 2, 'a re-evaluated after unload');
    assert.equal(globalThis.__dir1b, 2, 'b re-evaluated too — unload is dir-wide');
    assert.equal(globalThis.__dir2, 1, 'other dir stayed cached');
    delete globalThis.__dir1;
    delete globalThis.__dir1b;
    delete globalThis.__dir2;
});

test('getModuleByIndex throws for a missing module, unloadModule tolerates it', () => {
    const loader = createCjsLoader({ root: tmpRoot });
    assert.throws(() => loader.getModuleByIndex(0), /Module does not exist/);
    assert.doesNotThrow(() => loader.unloadModule(0));
});

test('the module body runs with this = exports and a dir-bound require closure', () => {
    writeModule('closure/dep.js', 'var v = 41;');
    // one declaration per line: the auto-export regex only sees line starts
    const abs = writeModule('closure/main.js', 'var dep = require("./dep.js");\nvar self = this;');
    const loader = createCjsLoader({ root: tmpRoot });
    const mod = loader.requireModule(abs);
    assert.equal(mod.dep.v, 41, 'require resolves relative to the module dir');
    assert.equal(mod.self, mod, 'the module body ran with this = the exports object');
});

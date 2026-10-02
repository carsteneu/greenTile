'use strict';
// Entry contract: extension.js loads through BOTH Cinnamon module
// generations. Legacy (6.6): fileUtils.js createExports wraps the body and,
// without an explicit module.exports line, auto-exports every top-level name.
// Native (upstream 2803c67): the importer exposes only top-level var and
// function declarations as namespace properties — consts stay private. The
// migration pins the same public surface (init/enable/disable) and the
// session ownership in the module-private lifecycle holder (see
// zero-module-state.test.js for the one allowed mutable binding).
// enable()/disable() are NOT called here (they need the Cinnamon runtime —
// see lifecycle.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cinnamonLoad, load, ROOT } = require('../helpers/cinnamon-loader');

const extensionPath = path.join(ROOT, 'extension.js');

// In GJS 'imports' is a true global; the entry reads it only for the xlet
// importer wiring, which the lifecycle tests provide against the fake env.
const stub = () => new Proxy(function () {}, {
    get: (t, p) => {
        if (p === Symbol.toPrimitive) return () => '';
        return stub();
    },
    apply: () => stub(),
});
globalThis.imports = stub();

// Files whose code derives from the gTile webpack bundle: provenance stays
// traceable through the per-file headers. Every other shipped file must NOT
// carry the attribution — it is purely own code.
const GTILE_DERIVED = [
    'extension.js',
    'lib/app/app.js',
    'lib/app/config.js',
    'lib/tiling/screen.js',
    'lib/tiling/windows.js',
];

const shippedJs = (function collect(dir, prefix) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory())
            {out.push(...collect(path.join(dir, entry.name), rel));}
        else if (entry.name.endsWith('.js'))
            {out.push(rel);}
    }
    return out;
})(path.join(ROOT, 'lib'), 'lib').concat(['extension.js']);

test('the native module namespace exposes exactly init/enable/disable and the session reader', () => {
    // fresh namespace through the importer sim over the repo root: extension
    // (the entry) is a module like the lib files. The reader (currentSession)
    // is the documented diagnostics bridge to the module-private holder.
    const seen = load('./extension');
    assert.deepEqual(Object.keys(seen).sort(), ['currentSession', 'disable', 'enable', 'init']);
    assert.equal(typeof seen.init, 'function');
    assert.equal(typeof seen.enable, 'function');
    assert.equal(typeof seen.disable, 'function');
    assert.equal(typeof seen.currentSession, 'function');
    // init is a no-op, callable without the Cinnamon runtime; enable()/disable()
    // construct the session and run against the fake env in lifecycle.test.js.
    seen.init({ uuid: 'greenTile@carsteneu' });
    assert.equal(seen.currentSession(), null, 'no session before enable()');
});

test('the 6.6 legacy generation auto-exports the same lifecycle surface', () => {
    const src = fs.readFileSync(extensionPath, 'utf8');
    assert.doesNotMatch(src, /^module\.exports(\.[a-zA-Z0-9_$]+)?\s*=/m,
        'module.exports breaks native loading (the module global does not exist there)');
    const ext = cinnamonLoad(src, load, 'extension.js');
    for (const fn of ['init', 'enable', 'disable']) {
        assert.equal(typeof ext[fn], 'function', fn + ' exported by the legacy auto-export');
    }
    // a member call runs against the exports object — the documented receiver
    const recv = { ext, called: false };
    ext.init.call(recv, { uuid: 'greenTile@carsteneu' });
    assert.equal(recv.called, false);
});

test('the session rides the module-private lifecycle holder, not `this`', () => {
    const src = fs.readFileSync(extensionPath, 'utf8');
    const commentsStripped = src.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(commentsStripped, /\bthis\.session\b/,
        'the natively imported namespace extensibility is not a contract to rely on');
    assert.match(src, /^const lifecycle = \{ session: null \};$/m,
        'one module-private holder owns the session across enable/disable');
    assert.match(src, /^var currentSession = \(\) => lifecycle\.session;$/m,
        'the reader exposes the session without handing out the holder');
    assert.match(src, /^var init|^function init\b/m, 'init declared public (var/function)');
    assert.match(src, /^var enable|^function enable\b/m, 'enable declared public');
    assert.match(src, /^var disable|^function disable\b/m, 'disable declared public');
    assert.doesNotMatch(src, /let\s+session\b/, 'no bare module-level session binding');
});

test('greenTile.js is gone and nothing requires it', () => {
    assert.equal(fs.existsSync(path.join(ROOT, 'greenTile.js')), false,
        'greenTile.js must be deleted — extension.js is the only entry');
    for (const file of shippedJs) {
        const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
        assert.doesNotMatch(src, /require\('\.\/greenTile'\)/, file + ' still requires greenTile.js');
    }
});

test('gTile provenance is traceable via file headers, in exactly the derived files', () => {
    for (const file of GTILE_DERIVED) {
        const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
        assert.ok(src.includes('Copyright (C) vibou, shuairan and the gTile contributors'),
            file + ' lacks the gTile attribution');
        assert.ok(src.includes('derived from gTile 2.2.1'), file + ' lacks the derivation note');
        assert.ok(src.includes('SPDX-License-Identifier: GPL-3.0-only'), file + ' lacks the SPDX line');
    }
    for (const file of shippedJs.filter((f) => !GTILE_DERIVED.includes(f))) {
        const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
        assert.ok(!src.includes('vibou'), file + ' is purely own code and must not carry the gTile attribution');
    }
});

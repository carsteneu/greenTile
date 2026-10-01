'use strict';
// Loads extension.js (the single entry) the way Cinnamon does. The loader
// mirrors fileUtils.js createExports (/usr/share/cinnamon/js/misc/fileUtils.js
// ~L150-230): the body is wrapped as 'use strict';<src>; inside a
// Function(require, exports, module, __meta, __dirname, __filename) that
// returns module.exports, and without an explicit module.exports line every
// top-level name is auto-exported. lib/app and lib/runtime/session load through
// the shared root-relative loader; enable()/disable() are NOT called here (they
// need the Cinnamon runtime — see lifecycle.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cinnamonLoad, load, ROOT } = require('../helpers/cinnamon-loader');

const extensionPath = path.join(ROOT, 'extension.js');

const stub = () => new Proxy(function () {}, {
    get: (t, p) => {
        if (p === Symbol.toPrimitive) return () => '';
        return stub();
    },
    apply: () => stub(),
});

// In GJS 'imports' is a true global; in the final shape no shipped module reads
// it at load time, until then the stub keeps the indirection harmless.
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

test('extension.js exports exactly init/enable/disable via explicit module.exports', () => {
    const src = fs.readFileSync(extensionPath, 'utf8');
    assert.match(src, /^module\.exports(\.[a-zA-Z0-9_$]+)?\s*=/m,
        'explicit module.exports required — without it Cinnamon auto-exports every top-level name');
    const ext = cinnamonLoad(src, load, 'extension.js');
    assert.deepEqual(Object.keys(ext).sort(), ['disable', 'enable', 'init']);
    assert.equal(typeof ext.init, 'function');
    assert.equal(typeof ext.enable, 'function');
    assert.equal(typeof ext.disable, 'function');
    // init is a no-op, callable without the Cinnamon runtime; enable()/disable()
    // construct the session and run against the fake env in lifecycle.test.js.
    ext.init({ uuid: 'greenTile@carsteneu' });
});

test('the lifecycle entry points keep the member-call session coupling', () => {
    const src = fs.readFileSync(extensionPath, 'utf8');
    // Cinnamon calls extensionSystem.js getModuleByIndex(i).init/enable/disable
    // member-style on the exports object, so `this` is the exports object and
    // the session rides it — a destructured call or module-level let would
    // break that contract.
    assert.match(src, /\benable\s*=\s*function\b|\benable\s*\(/, 'enable defined');
    assert.match(src, /this\.session\s*=/, 'enable stores the session on the exports object');
    assert.match(src, /this\.session\.destroy\(\)/, 'disable destroys the session');
    assert.doesNotMatch(src.replace(/\/\/[^\n]*/g, ''), /\blet\s+session\b/,
        'no module-level session state — it rides `this`');
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

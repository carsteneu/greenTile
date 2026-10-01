'use strict';
// Loads greenTile.js and extension.js the way Cinnamon does. The loader mirrors
// fileUtils.js createExports (/usr/share/cinnamon/js/misc/fileUtils.js ~L150-230):
// the body is wrapped as 'use strict';<src>; inside a Function(require, exports,
// module, __meta, __dirname, __filename) that returns module.exports, and without
// an explicit module.exports line every top-level name is auto-exported. The
// imports global only has names bound from it at load time, so a deep stub is
// enough; enable()/disable() are NOT called (they need the Cinnamon runtime).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, cinnamonLoad, ROOT } = require('./cinnamon-loader');

const greenTilePath = path.join(ROOT, 'greenTile.js');
const extensionPath = path.join(ROOT, 'extension.js');

const stub = () => new Proxy(function () {}, {
    get: (t, p) => {
        if (p === Symbol.toPrimitive) return () => '';
        return stub();
    },
    apply: () => stub(),
});

// In GJS 'imports' is a true global; greenTile.js binds names from it at load time.
globalThis.imports = stub();

test('greenTile.js exports exactly init/enable/disable via explicit module.exports', () => {
    const src = fs.readFileSync(greenTilePath, 'utf8');
    assert.match(src, /^module\.exports(\.[a-zA-Z0-9_$]+)?\s*=/m,
        'explicit module.exports required — without it Cinnamon auto-exports every top-level name');
    const gtile = cinnamonLoad(src, load, 'greenTile.js');
    assert.deepEqual(Object.keys(gtile).sort(), ['disable', 'enable', 'init']);
    assert.equal(typeof gtile.init, 'function');
    assert.equal(typeof gtile.enable, 'function');
    assert.equal(typeof gtile.disable, 'function');
});

test('extension.js reaches init/enable/disable through require("./greenTile")', () => {
    const greenTile = cinnamonLoad(fs.readFileSync(greenTilePath, 'utf8'), load, 'greenTile.js');
    const extSrc = fs.readFileSync(extensionPath, 'utf8');
    const ext = cinnamonLoad(extSrc, (p) => {
        assert.equal(p, './greenTile');
        return greenTile;
    }, 'extension.js');
    assert.equal(typeof ext.init, 'function');
    assert.equal(typeof ext.enable, 'function');
    assert.equal(typeof ext.disable, 'function');
    // init is a no-op at the greenTile layer, so the delegation is callable without Cinnamon.
    // enable()/disable() construct the App and are only exercised in the live test by the orchestrator.
    ext.init({ uuid: 'greenTile@carsteneu' });
});

test('extension.js forwards init/enable/disable as member calls (this-session coupling)', () => {
    const extSrc = fs.readFileSync(extensionPath, 'utf8');
    assert.match(extSrc, /gtile\.init\(/, 'member-style init call');
    assert.match(extSrc, /gtile\.enable\(\)/,
        'member-style enable call — the extension session rides `this` on greenTile\'s module.exports, '
        + 'a destructured/unbound call would leave `this` undefined');
    assert.match(extSrc, /gtile\.disable\(\)/, 'member-style disable call');
    assert.ok(!/const\s*\{\s*(?:init|enable|disable)[\s,}]/.test(extSrc),
        'no destructured forwarding of the lifecycle entry points');
});

test('no webpack leftovers, gTile provenance markers preserved, header intact', () => {
    const src = fs.readFileSync(greenTilePath, 'utf8');
    assert.ok(!src.includes('__webpack'), 'webpack runtime identifiers must be gone');
    assert.equal(src.split(';// CONCATENATED MODULE: ').length - 1, 5,
        'gTile origin sections must stay traceable');
    assert.ok(src.startsWith('/*\n * greenTile'), 'licence/attribution header must stay at the top');
    assert.ok(src.includes('SPDX-License-Identifier: GPL-3.0-only'));
});

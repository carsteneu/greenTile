'use strict';
// Model purity, enforced on the shipped module sources: the lib/model modules
// may only wire their own model dependencies through the xlet importer
// (imports.extensions['greenTile@carsteneu'] — the native module graph) and
// must stay free of every desktop reference (gi namespaces, global, Main,
// Meta, St, Clutter) so they load and run in plain Node (tests) and cannot
// reach the desktop from inside a model call. A desktop access inside a
// function body would load fine everywhere and only fail when Cinnamon calls
// it — no loader or resolver test can catch that, only this grep can.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const LIB_DIR = path.join(__dirname, '..', '..', 'lib', 'model');
const files = fs.readdirSync(LIB_DIR).filter((f) => f.endsWith('.js')).sort();
assert.equal(files.length, 20, 'expected the 20 extracted model modules');

const purityRe = /imports\.(?!extensions\['greenTile@carsteneu'\])|\bSt\.|\bClutter\.|global\.|\bMain\.|\bMeta\./;
const xletDesktopAccessRe = /XLET\.(?!lib\b)/;
const importRequireRe = /\brequire\s*\(/;
const topLevelLetRe = /^let\s/;

for (const file of files) {
    test(`${file} is pure (no Cinnamon references, no import requires, no top-level let)`, () => {
        let src = fs.readFileSync(path.join(LIB_DIR, file), 'utf8');
        // the own-module wiring through the xlet importer is allowed and is
        // the ONLY imports access; it never reaches a desktop API
        src = src.replace(/^const XLET = imports\.extensions\['greenTile@carsteneu'\];$/m, '');
        assert.doesNotMatch(src, purityRe);
        assert.doesNotMatch(src, importRequireRe);
        assert.doesNotMatch(src, xletDesktopAccessRe);
        // top-level var is the native export mechanism (single-assignment
        // checked by zero-module-state); let stays forbidden
        assert.doesNotMatch(src, topLevelLetRe);
    });
}

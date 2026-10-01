'use strict';
// Model purity, enforced on the shipped module sources: the lib/model modules must
// stay free of every Cinnamon reference so they load and run in plain Node (tests)
// and cannot reach the desktop from inside a model call. This restores the
// per-block "self-contained" assertions the extraction retired: an imports./global./Meta.
// access inside a function body would load fine everywhere and only fail when
// Cinnamon calls it — no loader or resolver test can catch that, only this grep can.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const LIB_DIR = path.join(__dirname, '..', 'lib', 'model');
const files = fs.readdirSync(LIB_DIR).filter((f) => f.endsWith('.js')).sort();
assert.equal(files.length, 18, 'expected the 18 extracted model modules');

const purityRe = /imports\.|tile_St|tile_Clutter|global\.|utils_Main|Meta\./;
const importRequireRe = /\brequire\(\s*['"](?:gi|ui|misc|perf)\./;
const topLevelRebindRe = /^(?:let|var)\s/;

for (const file of files) {
    test(`${file} is pure (no Cinnamon references, no import requires, no top-level let/var)`, () => {
        const src = fs.readFileSync(path.join(LIB_DIR, file), 'utf8');
        assert.doesNotMatch(src, purityRe);
        assert.doesNotMatch(src, importRequireRe);
        assert.doesNotMatch(src, topLevelRebindRe);
    });
}

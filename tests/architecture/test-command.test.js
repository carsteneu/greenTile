'use strict';
// The test command must run every test file exactly once on every supported
// Node version. `node --test <dir>` recurses on Node 18/20 but is taken as a
// file name on Node 21+, so the script passes a one-level glob that the shell
// expands: tests/<area>/<name>.test.js. This guard keeps both sides in step —
// a test file nested deeper (or at the top of tests/) would silently never run.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../helpers/cinnamon-loader');

const TEST_SCRIPT = 'node --test tests/*/*.test.js';

const collect = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? collect(p) : (e.name.endsWith('.test.js') ? [path.relative(ROOT, p)] : []);
});

test('npm test runs the one-level glob, not a directory argument', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    assert.equal(pkg.scripts.test, TEST_SCRIPT);
});

test('every test file sits exactly one level below tests/, so the glob reaches it', () => {
    const files = collect(path.join(ROOT, 'tests'));
    assert.ok(files.length > 0, 'test files found');
    const misplaced = files.filter((f) => f.split(path.sep).length !== 3);
    assert.deepEqual(misplaced, [], 'test files outside tests/<area>/');
});

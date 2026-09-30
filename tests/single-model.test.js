'use strict';
// Tests the single-window option model of greenTile.js (marked block "single-model"),
// cross-checking the fallback layout against the split-model geometry. The opt-in
// setting "Fill the monitor with a single window" (default off) decides whether a
// lone window is tiled; its fallback layout is one full-area row cell.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'greenTile.js'), 'utf8');
const blockMatch = src.match(/\/\/ >>> single-model[^\n]*\n([\s\S]*?)\/\/ <<< single-model/);
if (!blockMatch)
    throw new Error('single-model block not found in greenTile.js');
const block = blockMatch[1];
const names = ['tile_single_fill', 'tile_single_layout'];
const m = new Function(block + '\nreturn {' + names.join(',') + '};')();

const splitMatch = src.match(/\/\/ >>> split-model[^\n]*\n([\s\S]*?)\/\/ <<< split-model/);
if (!splitMatch)
    throw new Error('split-model block not found in greenTile.js');
const split = new Function(splitMatch[1] + '\nreturn {tile_split_rects};')();

test('block is self-contained', () => {
    assert.doesNotMatch(block, /imports\.|tile_St|tile_Clutter|global\.|utils_Main/);
});

test('option off: no window count is singled out (n < 2 guards stay in charge)', () => {
    for (let n = 0; n <= 10; n++)
        assert.equal(m.tile_single_fill(false, n), false, 'n=' + n);
    assert.equal(m.tile_single_fill(undefined, 1), false);
});

test('option on: only a lone window fills the area, never none or several', () => {
    assert.equal(m.tile_single_fill(true, 1), true);
    assert.equal(m.tile_single_fill(true, 0), false);
    assert.equal(m.tile_single_fill(true, 2), false);
    assert.equal(m.tile_single_fill(true, 7), false);
});

test('fallback layout is a single full-area row cell', () => {
    assert.deepEqual(m.tile_single_layout, { kind: 'rows', shape: [1] });
    const area = [0, 0, 1920, 1080];
    assert.deepEqual(
        split.tile_split_rects(m.tile_single_layout.kind, m.tile_single_layout.shape, null, area),
        [area]
    );
});

test('full-area cell is flush with the screen edges (no gap on outer edges)', () => {
    const area = [100, 80, 1280, 720];
    assert.deepEqual(
        split.tile_split_rects(m.tile_single_layout.kind, m.tile_single_layout.shape, null, area),
        [[100, 80, 1280, 720]]
    );
});

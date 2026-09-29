'use strict';
// Tests the pure drop model of greenTile.js (marked block "drop-model"): zone
// detection on a drop target's cell, the new layout after a drag split, and the
// minimum-size check. Extraction pattern like tests/layouts-model.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'greenTile.js'), 'utf8');
const extract = (name) => {
    const match = src.match(new RegExp('// >>> ' + name + '[^\\n]*\\n([\\s\\S]*?)// <<< ' + name));
    if (!match)
        throw new Error(name + ' block not found in greenTile.js');
    return match[1];
};
const dropBlock = extract('drop-model');
const names = ['TILE_DROP_EDGE', 'tile_drop_zone', 'tile_drop_layout', 'tile_drop_fits'];
const m = new Function(dropBlock + '\nreturn {' + names.join(',') + '};')();

test('block is self-contained', () => {
    assert.doesNotMatch(dropBlock, /imports\.|tile_St|tile_Clutter|global\.|utils_Main/);
});

test('zone: centre, four bands, corner by smaller relative distance, outside', () => {
    const c = [0, 0, 400, 200];
    assert.equal(m.tile_drop_zone(c, 200, 100), 'center');
    assert.equal(m.tile_drop_zone(c, 200, 10), 'top');
    assert.equal(m.tile_drop_zone(c, 200, 190), 'bottom');
    assert.equal(m.tile_drop_zone(c, 10, 100), 'left');
    assert.equal(m.tile_drop_zone(c, 390, 100), 'right');
    assert.equal(m.tile_drop_zone(c, 10, 10), 'left');   // 10/400 < 10/200
    assert.equal(m.tile_drop_zone(c, 500, 100), null);
    assert.equal(m.tile_drop_zone(c, -1, 100), null);
    assert.equal(m.tile_drop_zone(c, 200, -1), null);
});

test('layout cols: stack below, new column, identity', () => {
    assert.deepEqual(m.tile_drop_layout('cols', [1, 1, 1], 2, 0, 'bottom'), { kind: 'cols', shape: [2, 1], order: [0, 2, 1] });
    assert.deepEqual(m.tile_drop_layout('cols', [1, 1, 1], 2, 0, 'right'), { kind: 'cols', shape: [1, 1, 1], order: [0, 2, 1] });
    assert.equal(m.tile_drop_layout('cols', [1, 1, 1], 1, 0, 'right'), null);
    assert.deepEqual(m.tile_drop_layout('cols', [2, 1], 1, 2, 'top'), { kind: 'cols', shape: [1, 2], order: [0, 1, 2] });
});

test('layout rows: new row below, insert left in row', () => {
    assert.deepEqual(m.tile_drop_layout('rows', [3], 0, 2, 'bottom'), { kind: 'rows', shape: [2, 1], order: [1, 2, 0] });
    assert.deepEqual(m.tile_drop_layout('rows', [2, 2], 3, 0, 'left'), { kind: 'rows', shape: [3, 1], order: [3, 0, 1, 2] });
});

test('layout: cross-monitor insertion, centre/self/garbage return null', () => {
    assert.deepEqual(m.tile_drop_layout('cols', [1, 1], -1, 1, 'bottom'), { kind: 'cols', shape: [1, 2], order: [0, 1, 2] });
    assert.equal(m.tile_drop_layout('cols', [1, 1, 1], 2, 0, 'center'), null);
    assert.equal(m.tile_drop_layout('cols', [1, 1, 1], 1, 1, 'top'), null);
    assert.equal(m.tile_drop_layout('grid', [2], 0, 1, 'top'), null);
});

test('fits: equal division minus gap against the minimum', () => {
    assert.equal(m.tile_drop_fits('cols', [1, 2], 5120, 1440, 10, 120), true);
    assert.equal(m.tile_drop_fits('cols', [1, 12], 5120, 1440, 10, 120), false);   // 1440/12 - 10 = 110
    assert.equal(m.tile_drop_fits('rows', [40], 5120, 1440, 10, 120), false);      // 5120/40 - 10 = 118
    assert.equal(m.TILE_DROP_EDGE, 0.25);
});

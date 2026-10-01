'use strict';
// Tests the pure drop model (lib/model/drop.js): zone
// detection on a drop target's cell, the new layout after a drag split, and the
// minimum-size check.
const test = require('node:test');
const assert = require('node:assert/strict');

const m = require('../helpers/cinnamon-loader').load('./lib/model/drop.js');

test('zone: centre, four bands, corner by smaller relative distance, outside', () => {
    const c = [0, 0, 400, 200];
    assert.equal(m.dropZone(c, 200, 100), 'center');
    assert.equal(m.dropZone(c, 200, 10), 'top');
    assert.equal(m.dropZone(c, 200, 190), 'bottom');
    assert.equal(m.dropZone(c, 10, 100), 'left');
    assert.equal(m.dropZone(c, 390, 100), 'right');
    assert.equal(m.dropZone(c, 10, 10), 'left');   // 10/400 < 10/200
    assert.equal(m.dropZone(c, 500, 100), null);
    assert.equal(m.dropZone(c, -1, 100), null);
    assert.equal(m.dropZone(c, 200, -1), null);
});

test('layout cols: stack below, new column, identity', () => {
    assert.deepEqual(m.dropLayout('cols', [1, 1, 1], 2, 0, 'bottom'), { kind: 'cols', shape: [2, 1], order: [0, 2, 1] });
    assert.deepEqual(m.dropLayout('cols', [1, 1, 1], 2, 0, 'right'), { kind: 'cols', shape: [1, 1, 1], order: [0, 2, 1] });
    assert.equal(m.dropLayout('cols', [1, 1, 1], 1, 0, 'right'), null);
    assert.deepEqual(m.dropLayout('cols', [2, 1], 1, 2, 'top'), { kind: 'cols', shape: [1, 2], order: [0, 1, 2] });
});

test('layout rows: new row below, insert left in row', () => {
    assert.deepEqual(m.dropLayout('rows', [3], 0, 2, 'bottom'), { kind: 'rows', shape: [2, 1], order: [1, 2, 0] });
    assert.deepEqual(m.dropLayout('rows', [2, 2], 3, 0, 'left'), { kind: 'rows', shape: [3, 1], order: [3, 0, 1, 2] });
});

test('layout: cross-monitor insertion, centre/self/garbage return null', () => {
    assert.deepEqual(m.dropLayout('cols', [1, 1], -1, 1, 'bottom'), { kind: 'cols', shape: [1, 2], order: [0, 1, 2] });
    assert.equal(m.dropLayout('cols', [1, 1, 1], 2, 0, 'center'), null);
    assert.equal(m.dropLayout('cols', [1, 1, 1], 1, 1, 'top'), null);
    assert.equal(m.dropLayout('grid', [2], 0, 1, 'top'), null);
});

test('fits: equal division minus gap against the minimum', () => {
    assert.equal(m.dropFits('cols', [1, 2], 5120, 1440, 10, 120), true);
    assert.equal(m.dropFits('cols', [1, 12], 5120, 1440, 10, 120), false);   // 1440/12 - 10 = 110
    assert.equal(m.dropFits('rows', [40], 5120, 1440, 10, 120), false);      // 5120/40 - 10 = 118
    assert.equal(m.DROP_EDGE, 0.25);
});

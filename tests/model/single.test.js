'use strict';
// Tests the single-window option model (lib/model/single.js),
// cross-checking the fallback layout against the split-model geometry. The opt-in
// setting "Fill the monitor with a single window" (default off) decides whether a
// lone window is tiled; its fallback layout is one full-area row cell.
const test = require('node:test');
const assert = require('node:assert/strict');

const load = require('../helpers/cinnamon-loader').load;
const m = load('./lib/model/single.js');
const split = load('./lib/model/split.js');

test('option off: no window count is singled out (n < 2 guards stay in charge)', () => {
    for (let n = 0; n <= 10; n++)
        {assert.equal(m.singleFill(false, n), false, 'n=' + n);}
    assert.equal(m.singleFill(undefined, 1), false);
});

test('option on: only a lone window fills the area, never none or several', () => {
    assert.equal(m.singleFill(true, 1), true);
    assert.equal(m.singleFill(true, 0), false);
    assert.equal(m.singleFill(true, 2), false);
    assert.equal(m.singleFill(true, 7), false);
});

test('fallback layout is a single full-area row cell', () => {
    assert.deepEqual(m.singleLayout, { kind: 'rows', shape: [1] });
    const area = [0, 0, 1920, 1080];
    assert.deepEqual(
        split.splitRects(m.singleLayout.kind, m.singleLayout.shape, null, area),
        [area]
    );
});

test('full-area cell is flush with the screen edges (no gap on outer edges)', () => {
    const area = [100, 80, 1280, 720];
    assert.deepEqual(
        split.splitRects(m.singleLayout.kind, m.singleLayout.shape, null, area),
        [[100, 80, 1280, 720]]
    );
});

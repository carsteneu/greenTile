'use strict';
// Tests the pure window gap model (lib/model/gap.js).
// A tiled cell is shrunk by half the gap on every side that borders another cell,
// so two neighbouring windows end up exactly one gap apart; sides on the edge of
// the usable screen area stay flush.
const test = require('node:test');
const assert = require('node:assert/strict');

const m = require('../helpers/cinnamon-loader').load('./lib/model/gap.js');

const area = [0, 30, 1920, 1170];

test('gap 0 leaves the cell unchanged', () => {
    assert.deepEqual(m.gapCell([0, 30, 960, 1170], area, 0), [0, 30, 960, 1170]);
});

test('two columns: left cell shrinks on the right, right cell on the left, gap between them', () => {
    const left = m.gapCell([0, 30, 960, 1170], area, 10);
    const right = m.gapCell([960, 30, 960, 1170], area, 10);
    assert.deepEqual(left, [0, 30, 955, 1170]);
    assert.deepEqual(right, [965, 30, 955, 1170]);
    assert.equal(right[0] - (left[0] + left[2]), 10);
});

test('a cell in the middle of a 3x2 grid shrinks on all four sides', () => {
    const a = [100, 100, 900, 600];
    assert.deepEqual(m.gapCell([400, 300, 300, 200], a, 8), [404, 304, 292, 192]);
});

test('stacked cells: vertical gap between them, top and bottom stay flush', () => {
    const top = m.gapCell([0, 30, 640, 585], area, 12);
    const bottom = m.gapCell([0, 615, 640, 585], area, 12);
    assert.deepEqual(top, [0, 30, 634, 579]);
    assert.deepEqual(bottom, [0, 621, 634, 579]);
    assert.equal(bottom[1] - (top[1] + top[3]), 12);
});

test('fractional cell bounds (1920/7) round to integers without gaps drifting', () => {
    const w = 1920 / 7;
    const cells = [0, 1, 2, 3, 4, 5, 6].map((i) => m.gapCell([i * w, 30, w, 1170], area, 8));
    for (const c of cells)
        {c.forEach((v) => assert.ok(Number.isInteger(v)));}
    assert.equal(cells[0][0], 0);
    assert.equal(cells[6][0] + cells[6][2], 1920);
    for (let i = 1; i < cells.length; i++) {
        const between = cells[i][0] - (cells[i - 1][0] + cells[i - 1][2]);
        assert.ok(between >= 7 && between <= 9, 'gap ' + between);
    }
});

test('a single full-area cell is not shrunk', () => {
    assert.deepEqual(m.gapCell(area.slice(), area, 20), area);
});

test('the cell never collapses below 1px', () => {
    const c = m.gapCell([500, 500, 6, 6], [0, 0, 2000, 2000], 40);
    assert.ok(c[2] >= 1 && c[3] >= 1);
});

test('a gap larger than the cell never pushes the frame outside a usable area', () => {
    // issue 12: on a 10x10 work area the four cells are 2.5px wide, so the 48px
    // gap exceeds each cell. The insets must not move a frame past the area.
    const a = [0, 0, 10, 10];
    const cells = [[0, 0, 2.5, 10], [2.5, 0, 2.5, 10], [5, 0, 2.5, 10], [7.5, 0, 2.5, 10]];
    for (const cell of cells) {
        const c = m.gapCell(cell, a, 48);
        assert.ok(c[0] >= a[0] && c[1] >= a[1] && c[0] + c[2] <= a[0] + a[2] && c[1] + c[3] <= a[1] + a[3],
            'frame inside the area, got ' + JSON.stringify(c));
        assert.ok(c[2] >= 1 && c[3] >= 1, 'at least 1px, got ' + JSON.stringify(c));
    }
    // the same on the vertical axis
    const b = [0, 0, 10, 10];
    for (const cell of [[0, 0, 10, 2.5], [0, 2.5, 10, 2.5], [0, 5, 10, 2.5], [0, 7.5, 10, 2.5]]) {
        const c = m.gapCell(cell, b, 48);
        assert.ok(c[0] >= 0 && c[1] >= 0 && c[0] + c[2] <= 10 && c[1] + c[3] <= 10, JSON.stringify(c));
    }
});

test('a bounded gap keeps a whole grid inside an offset tiny area', () => {
    const a = [100, 200, 12, 12];
    const out = [];
    for (let i = 0; i < 3; i++)
        {out.push(m.gapCell([100 + i * 4, 200, 4, 12], a, 48));}
    for (const c of out) {
        assert.ok(c[0] >= 100 && c[1] >= 200 && c[0] + c[2] <= 112 && c[1] + c[3] <= 212, JSON.stringify(c));
    }
});

test('gap_value clamps to 0..MAX on the step and tolerates junk', () => {
    assert.equal(m.GAP_STEP, 2);
    assert.equal(m.gapValue(8), 8);
    assert.equal(m.gapValue(-4), 0);
    assert.equal(m.gapValue(999), m.GAP_MAX);
    assert.equal(m.gapValue(7), 6);
    assert.equal(m.gapValue(undefined), 0);
    assert.equal(m.gapValue('12'), 0);
    assert.equal(m.gapValue(NaN), 0);
});

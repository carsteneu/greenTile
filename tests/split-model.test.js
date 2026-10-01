'use strict';
// Tests the pure split model (lib/model/split.js). A split stores the borders
// of a filled layout as fractions: major = columns (kind "cols") or rows (kind "rows"),
// minor = per column/row the cells inside it. Moving a border changes only the two
// neighbouring parts; every part keeps a minimum size in pixels.
const test = require('node:test');
const assert = require('node:assert/strict');

const m = require('./cinnamon-loader').load('./lib/model/split.js');

const area = [0, 0, 1000, 600];
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const rectsNear = (actual, expected) => {
    assert.equal(actual.length, expected.length);
    actual.forEach((r, i) => r.forEach((v, k) => assert.ok(near(v, expected[i][k], 1e-6), `rect ${i}[${k}] ${v} != ${expected[i][k]}`)));
};

test('constants', () => {
    assert.equal(m.SPLIT_MIN_PX, 120);
    assert.equal(m.SPLIT_STEP_MAX, 64);
});

test('equal split', () => {
    assert.deepEqual(m.splitEqual('cols', [1, 2]), { kind: 'cols', shape: [1, 2], major: [0.5, 0.5], minor: [[1], [0.5, 0.5]] });
    assert.deepEqual(m.splitEqual('rows', [3]), { kind: 'rows', shape: [3], major: [1], minor: [[1 / 3, 1 / 3, 1 / 3]] });
});

test('valid: accepts a matching split and normalises it', () => {
    const s = { kind: 'cols', shape: [1, 2], major: [0.6, 0.4], minor: [[1], [0.3, 0.7]] };
    assert.deepEqual(m.splitValid('cols', [1, 2], s), s);
    const off = m.splitValid('cols', [2], { kind: 'cols', shape: [2], major: [1.004], minor: [[0.5, 0.502]] });
    assert.ok(near(off.major[0], 1));
    assert.ok(near(off.minor[0][0] + off.minor[0][1], 1));
});

test('valid: rejects other kind, other shape, bad lengths and bad numbers', () => {
    const s = { kind: 'cols', shape: [1, 2], major: [0.6, 0.4], minor: [[1], [0.3, 0.7]] };
    assert.equal(m.splitValid('rows', [1, 2], s), null);
    assert.equal(m.splitValid('cols', [2, 1], s), null);
    assert.equal(m.splitValid('cols', [1, 2], Object.assign({}, s, { major: [1] })), null);
    assert.equal(m.splitValid('cols', [1, 2], Object.assign({}, s, { minor: [[1], [1]] })), null);
    assert.equal(m.splitValid('cols', [1, 2], Object.assign({}, s, { major: [0.6, NaN] })), null);
    assert.equal(m.splitValid('cols', [1, 2], Object.assign({}, s, { major: [1.2, -0.2] })), null);
    assert.equal(m.splitValid('cols', [1, 2], Object.assign({}, s, { major: [0.6, 0.6] })), null);
    assert.equal(m.splitValid('cols', [1, 2], null), null);
    assert.equal(m.splitValid('cols', [1, 2], 'x'), null);
});

test('rects without a split are exactly the equal division of the current code', () => {
    const [x, y, w, h] = [10, 30, 1920, 1170];
    const rects = m.splitRects('cols', [1, 2, 2], null, [x, y, w, h]);
    const cw = w / 3;
    const expected = [[x, y, cw, h], [x + cw, y, cw, h / 2], [x + cw, y + h / 2, cw, h / 2],
        [x + 2 * cw, y, cw, h / 2], [x + 2 * cw, y + h / 2, cw, h / 2]];
    assert.deepEqual(rects, expected);
    const rows = m.splitRects('rows', [4, 3], null, [x, y, w, h]);
    assert.deepEqual(rows[0], [x, y, w / 4, h / 2]);
    assert.deepEqual(rows[5], [x + w / 3, y + h / 2, w / 3, h / 2]);
    assert.equal(rows.length, 7);
});

test('rects with fractions: cols and rows, placement order', () => {
    const cols = { kind: 'cols', shape: [1, 2], major: [0.6, 0.4], minor: [[1], [0.25, 0.75]] };
    rectsNear(m.splitRects('cols', [1, 2], cols, area), [[0, 0, 600, 600], [600, 0, 400, 150], [600, 150, 400, 450]]);
    const rows = { kind: 'rows', shape: [2, 1], major: [0.5, 0.5], minor: [[0.3, 0.7], [1]] };
    rectsNear(m.splitRects('rows', [2, 1], rows, area), [[0, 0, 300, 300], [300, 0, 700, 300], [0, 300, 1000, 300]]);
});

test('rects tile the area without gaps or overlaps', () => {
    const s = { kind: 'cols', shape: [3, 1, 2], major: [0.2, 0.5, 0.3], minor: [[0.1, 0.6, 0.3], [1], [0.55, 0.45]] };
    const rects = m.splitRects('cols', [3, 1, 2], s, area);
    const total = rects.reduce((a, r) => a + r[2] * r[3], 0);
    assert.ok(near(total, 1000 * 600, 1e-6));
    const last = rects[rects.length - 1];
    assert.ok(near(last[0] + last[2], 1000, 1e-9));
    assert.ok(near(last[1] + last[3], 600, 1e-9));
});

test('cell_at: nearest centre', () => {
    const rects = m.splitRects('cols', [1, 2], null, area);
    assert.equal(m.splitCellAt(rects, [5, 5, 480, 580]), 0);
    assert.equal(m.splitCellAt(rects, [520, 310, 470, 280]), 2);
    assert.equal(m.splitCellAt(rects, [700, 0, 200, 100]), 1);
    assert.equal(m.splitCellAt([], [0, 0, 1, 1]), -1);
});

test('has_edge: cols', () => {
    const shape = [1, 2]; // cells: 0 = col0, 1 = col1 top, 2 = col1 bottom
    assert.equal(m.splitHasEdge('cols', shape, 0, 'right'), true);
    assert.equal(m.splitHasEdge('cols', shape, 0, 'left'), false);
    assert.equal(m.splitHasEdge('cols', shape, 0, 'bottom'), false);
    assert.equal(m.splitHasEdge('cols', shape, 1, 'left'), true);
    assert.equal(m.splitHasEdge('cols', shape, 1, 'right'), false);
    assert.equal(m.splitHasEdge('cols', shape, 1, 'bottom'), true);
    assert.equal(m.splitHasEdge('cols', shape, 1, 'top'), false);
    assert.equal(m.splitHasEdge('cols', shape, 2, 'top'), true);
    assert.equal(m.splitHasEdge('cols', shape, 2, 'bottom'), false);
});

test('has_edge: rows (transposed)', () => {
    const shape = [2, 1]; // cells: 0 = row0 left, 1 = row0 right, 2 = row1
    assert.equal(m.splitHasEdge('rows', shape, 0, 'right'), true);
    assert.equal(m.splitHasEdge('rows', shape, 0, 'bottom'), true);
    assert.equal(m.splitHasEdge('rows', shape, 1, 'left'), true);
    assert.equal(m.splitHasEdge('rows', shape, 2, 'top'), true);
    assert.equal(m.splitHasEdge('rows', shape, 2, 'left'), false);
    assert.equal(m.splitHasEdge('rows', shape, 2, 'bottom'), false);
});

test('border_pos: current position of an edge, null without neighbour', () => {
    const s = { kind: 'cols', shape: [1, 2], major: [0.6, 0.4], minor: [[1], [0.25, 0.75]] };
    const a = [100, 50, 1000, 600];
    assert.ok(near(m.splitBorderPos('cols', [1, 2], s, 0, 'right', a), 700));
    assert.ok(near(m.splitBorderPos('cols', [1, 2], s, 2, 'left', a), 700));
    assert.ok(near(m.splitBorderPos('cols', [1, 2], s, 1, 'bottom', a), 200));
    assert.equal(m.splitBorderPos('cols', [1, 2], s, 0, 'left', a), null);
    assert.ok(near(m.splitBorderPos('cols', [1, 2], null, 0, 'right', a), 600));
});

test('move: vertical edge in cols moves the column border, only neighbours change', () => {
    const next = m.splitMove('cols', [1, 1, 1], null, 0, 'right', 450, area, 120);
    assert.ok(near(next.major[0], 0.45));
    assert.ok(near(next.major[1], 1 / 3 * 2 - 0.45));
    assert.ok(near(next.major[2], 1 / 3));
    assert.deepEqual(next.shape, [1, 1, 1]);
    assert.equal(next.kind, 'cols');
});

test('move: left edge of a middle column moves the border to its left', () => {
    const next = m.splitMove('cols', [1, 1, 1], null, 1, 'left', 200, area, 120);
    assert.ok(near(next.major[0], 0.2));
    assert.ok(near(next.major[1], 2 / 3 - 0.2));
    assert.ok(near(next.major[2], 1 / 3));
});

test('move: horizontal edge in cols changes only that column', () => {
    const next = m.splitMove('cols', [2, 2], null, 2, 'bottom', 400, area, 120);
    assert.deepEqual(next.minor[0], [0.5, 0.5]);
    assert.ok(near(next.minor[1][0], 400 / 600));
    assert.ok(near(next.minor[1][1], 200 / 600));
    assert.deepEqual(next.major, [0.5, 0.5]);
});

test('move: rows kind, vertical edge moves the cell border inside the row, horizontal the row border', () => {
    const a = m.splitMove('rows', [2, 2], null, 0, 'right', 300, area, 120);
    assert.ok(near(a.minor[0][0], 0.3));
    assert.deepEqual(a.minor[1], [0.5, 0.5]);
    const b = m.splitMove('rows', [2, 2], null, 3, 'top', 240, area, 120);
    assert.ok(near(b.major[0], 0.4));
    assert.ok(near(b.major[1], 0.6));
});

test('move: clamps to the minimum size of both neighbours', () => {
    const left = m.splitMove('cols', [1, 1], null, 0, 'right', 50, area, 120);
    assert.ok(near(left.major[0], 0.12));
    const right = m.splitMove('cols', [1, 1], null, 0, 'right', 990, area, 120);
    assert.ok(near(right.major[1], 0.12));
});

test('move: no neighbour, or no room for two minimum parts, returns null', () => {
    assert.equal(m.splitMove('cols', [1, 1], null, 0, 'left', 20, area, 120), null);
    assert.equal(m.splitMove('cols', [1], null, 0, 'right', 300, area, 120), null);
    const tight = { kind: 'cols', shape: [1, 1, 1], major: [0.45, 0.1, 0.45], minor: [[1], [1], [1]] };
    // parts 1 and 2 together are 550 px: fine; parts 0 and 1 together are 550 px: fine too
    assert.ok(m.splitMove('cols', [1, 1, 1], tight, 0, 'right', 500, area, 120));
    assert.equal(m.splitMove('cols', [1, 1], null, 0, 'right', 500, [0, 0, 200, 600], 120), null);
});

test('move: does not mutate its input, keeps a valid split', () => {
    const s = { kind: 'cols', shape: [1, 2], major: [0.6, 0.4], minor: [[1], [0.25, 0.75]] };
    const copy = JSON.parse(JSON.stringify(s));
    const next = m.splitMove('cols', [1, 2], s, 1, 'bottom', 300, area, 120);
    assert.deepEqual(s, copy);
    assert.ok(m.splitValid('cols', [1, 2], next));
});

test('key_target: wider/narrower use the right border, the rightmost cell its left one', () => {
    assert.deepEqual(m.splitKeyTarget('cols', [1, 1], 0, 'wider'), { edge: 'right', sign: 1 });
    assert.deepEqual(m.splitKeyTarget('cols', [1, 1], 1, 'wider'), { edge: 'left', sign: -1 });
    assert.deepEqual(m.splitKeyTarget('cols', [1, 1], 0, 'narrower'), { edge: 'right', sign: -1 });
    assert.deepEqual(m.splitKeyTarget('cols', [1, 1], 1, 'narrower'), { edge: 'left', sign: 1 });
});

test('key_target: taller/shorter use the bottom border, the bottom cell its top one', () => {
    assert.deepEqual(m.splitKeyTarget('cols', [2], 0, 'taller'), { edge: 'bottom', sign: 1 });
    assert.deepEqual(m.splitKeyTarget('cols', [2], 1, 'taller'), { edge: 'top', sign: -1 });
    assert.deepEqual(m.splitKeyTarget('cols', [2], 0, 'shorter'), { edge: 'bottom', sign: -1 });
    assert.deepEqual(m.splitKeyTarget('cols', [2], 1, 'shorter'), { edge: 'top', sign: 1 });
});

test('key_target: no border in that direction', () => {
    assert.equal(m.splitKeyTarget('cols', [1, 1], 0, 'taller'), null);
    assert.equal(m.splitKeyTarget('rows', [2], 0, 'shorter'), null);
    assert.equal(m.splitKeyTarget('cols', [1], 0, 'wider'), null);
    assert.equal(m.splitKeyTarget('cols', [1, 1], 0, 'bogus'), null);
});

test('accel: tap = 1 px, repeats add 1 px up to 64, new press or other key restarts', () => {
    let r = m.splitAccel(null, 'wider', 1000, 600);
    assert.equal(r.step, 1);
    r = m.splitAccel(r.state, 'wider', 1500, 600);
    assert.equal(r.step, 2);
    r = m.splitAccel(r.state, 'wider', 1530, 600);
    assert.equal(r.step, 3);
    let s = r.state;
    for (let i = 0; i < 100; i++)
        s = m.splitAccel(s, 'wider', 1530 + 30 * (i + 1), 600).state;
    assert.equal(s.step, 64);
    assert.equal(m.splitAccel(s, 'wider', s.last + 601, 600).step, 1);
    assert.equal(m.splitAccel(s, 'taller', s.last + 30, 600).step, 1);
});

test('op_edges: grab op names to moved edges', () => {
    assert.deepEqual(m.splitOpEdges('RESIZING_E'), ['right']);
    assert.deepEqual(m.splitOpEdges('KEYBOARD_RESIZING_W'), ['left']);
    assert.deepEqual(m.splitOpEdges('RESIZING_NE'), ['top', 'right']);
    assert.deepEqual(m.splitOpEdges('RESIZING_SW'), ['bottom', 'left']);
    assert.deepEqual(m.splitOpEdges('KEYBOARD_RESIZING_UNKNOWN'), []);
    assert.deepEqual(m.splitOpEdges('MOVING'), []);
    assert.deepEqual(m.splitOpEdges(undefined), []);
});

test('frame_edges: edges that moved by at least 2 px between two frames', () => {
    assert.deepEqual(m.splitFrameEdges([100, 100, 500, 400], [100, 100, 700, 400]), ['right']);
    assert.deepEqual(m.splitFrameEdges([100, 100, 500, 400], [60, 100, 540, 400]), ['left']);
    assert.deepEqual(m.splitFrameEdges([100, 100, 500, 400], [100, 50, 500, 500]), ['top', 'bottom']);
    assert.deepEqual(m.splitFrameEdges([100, 100, 500, 400], [101, 100, 499, 400]), []);
});

// Reading order for a retile: windows are grouped into columns (kind "cols") or rows
// (kind "rows") by overlap along the major axis, so unequal borders keep every window
// in its column/row. Returns the input indices in placement order.
test('sort order: empty', () => {
    assert.deepEqual(m.sortOrder([], true), []);
    assert.deepEqual(m.sortOrder([], false), []);
});

test('sort order: columns [1,2], column-major then top to bottom', () => {
    const A = [0, 0, 500, 600], B = [500, 0, 500, 300], C = [500, 300, 500, 300];
    assert.deepEqual(m.sortOrder([C, A, B], true), [1, 2, 0]);
});

test('sort order: left edge of the upper stack window dragged right keeps its place', () => {
    // B was dragged from x 500 to x 700; exact x sorting would put C before B
    const A = [0, 0, 500, 600], B = [700, 0, 300, 300], C = [500, 300, 500, 300];
    assert.deepEqual(m.sortOrder([A, B, C], true), [0, 1, 2]);
    // lower window dragged left: same
    const C2 = [300, 300, 700, 300];
    assert.deepEqual(m.sortOrder([A, [500, 0, 500, 300], C2], true), [0, 1, 2]);
});

test('sort order: rows of unequal height stay rows', () => {
    // wide auto grid 7 = 4 + 3, top row made short (150 of 600)
    const top = [0, 1, 2, 3].map((i) => [i * 250, 0, 250, 150]);
    const bottom = [0, 1, 2].map((i) => [i * 1000 / 3, 150, 1000 / 3, 450]);
    const input = [bottom[2], top[3], bottom[0], top[1], top[0], bottom[1], top[2]];
    // expected: top row left to right, then bottom row
    assert.deepEqual(m.sortOrder(input, false), [4, 3, 6, 1, 2, 5, 0]);
});

test('sort order: one row, left to right; equal grid unchanged', () => {
    const r = [3, 0, 2, 1].map((i) => [i * 200, 0, 200, 600]);
    assert.deepEqual(m.sortOrder(r, false), [1, 3, 2, 0]);
    const g = [[500, 300, 500, 300], [0, 0, 500, 300], [0, 300, 500, 300], [500, 0, 500, 300]];
    assert.deepEqual(m.sortOrder(g, false), [1, 3, 2, 0]);
    assert.deepEqual(m.sortOrder(g, true), [1, 2, 3, 0]);
});

test('sort order: gaps between tiled windows do not merge groups', () => {
    const A = [0, 0, 496, 600], B = [504, 0, 496, 296], C = [504, 304, 496, 296];
    assert.deepEqual(m.sortOrder([B, C, A], true), [2, 0, 1]);
});

test('sort order: zero-size rects do not throw', () => {
    assert.deepEqual(m.sortOrder([[10, 0, 0, 0], [0, 0, 0, 0]], true), [1, 0]);
});

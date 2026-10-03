'use strict';
// Issue 12 — valid geometry under extreme space shortage (lib/model/split.js).
//
// The read-time correction (splitMinimal / splitClampAxis) raises FINAL frames to
// the promised minimum where feasible. For geometrically impossible budgets — a
// zero-length axis, or a cell count whose gaps exceed the axis — it must never
// hide the missing area behind invalid data: fraction sums above 1, negative raw
// cells, non-finite arithmetic. The ground truth pipeline is the real placement
// path: splitRects (raw cells) -> gapCell (final frames), exactly what placeRects
// (lib/tiling/place.js) runs.
const test = require('node:test');
const assert = require('node:assert/strict');

const m = require('../helpers/cinnamon-loader').load('./lib/model/split.js');
const g = require('../helpers/cinnamon-loader').load('./lib/model/gap.js');

const MIN = m.SPLIT_MIN_PX;
const GAP = 48;
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const sum = (a) => a.reduce((x, y) => x + y, 0);
const finiteRect = (r) => r.every(Number.isFinite) && r[2] >= 0 && r[3] >= 0;
const inside = (r, area) => r[0] >= area[0] - 1e-6 && r[1] >= area[1] - 1e-6
    && r[0] + r[2] <= area[0] + area[2] + 1e-6 && r[1] + r[3] <= area[1] + area[3] + 1e-6;
const effective = (kind, shape, out) => out || m.splitEqual(kind, shape);

// A returned split must always be a structurally valid split (positive fractions
// summing to 1); a decline (null) is allowed and means "no correction".
const assertValidOrNull = (out, kind, shape, label) => {
    if (out === null) {
        return;
    }
    assert.notEqual(m.splitValid(kind, shape, out), null, label + ': a returned split stays splitValid');
};

const assertFractionsAndRaw = (kind, shape, split, area, out, label) => {
    const eff = effective(kind, shape, out);
    [eff.major, ...eff.minor].forEach((list, i) => {
        assert.ok(near(sum(list), 1, 1e-9), `${label}: fraction list ${i} sums to 1, got ${sum(list)}`);
        assert.ok(list.every((f) => f > 0 && Number.isFinite(f)), `${label}: fraction list ${i} positive and finite`);
    });
    assertValidOrNull(out, kind, shape, label);
    const rects = m.splitRects(kind, shape, out, area);
    rects.forEach((r, i) => {
        assert.ok(finiteRect(r), `${label}: raw frame ${i} finite and non-negative: ${r}`);
        assert.ok(inside(r, area), `${label}: raw frame ${i} inside the area: ${r}`);
    });
    const finals = rects.map((r) => g.gapCell(r, area, GAP));
    finals.forEach((r, i) => {
        assert.ok(r.every(Number.isFinite), `${label}: final frame ${i} finite: ${r}`);
        assert.ok(r[2] >= 1 && r[3] >= 1, `${label}: final frame ${i} at least 1 px: ${r}`);
        // a usable area must contain every final frame (issue 12: the original
        // counterexample was a final frame at x=637 in a 600px area). A degenerate
        // area (0 on an axis) cannot contain anything — that case is guarded at
        // placement time instead.
        if (area[2] >= 1 && area[3] >= 1) {
            assert.ok(inside(r, area), `${label}: final frame ${i} inside the area: ${r}`);
        }
    });
};

test('issue 12: 14 columns on 600 px with gap 48 keep valid fractions and raw frames inside the area', () => {
    const shape = new Array(14).fill(1);
    const area = [0, 0, 600, 600];
    const out = m.splitMinimal('cols', shape, null, area, GAP, MIN);
    assertFractionsAndRaw('cols', shape, null, area, out, '14x600');
});

test('issue 12: the same overload on the rows kind (major axis along y)', () => {
    const shape = new Array(14).fill(1);
    const area = [0, 0, 600, 600];
    const out = m.splitMinimal('rows', shape, null, area, GAP, MIN);
    assertFractionsAndRaw('rows', shape, null, area, out, 'rows-14');
});

test('issue 12: a gap-overloaded minor axis (5 stacked cells on 100 px)', () => {
    const area = [0, 0, 600, 100];
    const shape = [5];
    const out = m.splitMinimal('cols', shape, null, area, GAP, MIN);
    assertFractionsAndRaw('cols', shape, null, area, out, 'stack5-100');
});

test('issue 12: a zero-length axis yields only finite geometry (stored split passed through)', () => {
    const split = { kind: 'cols', shape: [1, 1], major: [0.5, 0.5], minor: [[1], [1]] };
    const shape = [1, 1];
    const area = [0, 0, 0, 600];
    const out = m.splitMinimal('cols', shape, split, area, GAP, MIN);
    const rects = m.splitRects('cols', shape, out, area);
    rects.forEach((r, i) => assert.ok(r.every(Number.isFinite), `zero-width: raw frame ${i} finite: ${r}`));
    const finals = rects.map((r) => g.gapCell(r, area, GAP));
    finals.forEach((r, i) => assert.ok(r.every(Number.isFinite), `zero-width: final frame ${i} finite: ${r}`));
});

test('issue 12: a zero-length major AND minor axis (0x0 usable area) stays finite', () => {
    const shape = [1, 1];
    const area = [0, 0, 0, 0];
    const out = m.splitMinimal('cols', shape, null, area, GAP, MIN);
    const rects = m.splitRects('cols', shape, out, area);
    rects.forEach((r, i) => assert.ok(r.every(Number.isFinite), `zero-area: raw frame ${i}: ${r}`));
});

test('issue 12: a 1 px area overloaded on both axes keeps valid fractions', () => {
    const shape = [3, 3];
    const area = [0, 0, 1, 1];
    const out = m.splitMinimal('cols', shape, null, area, GAP, MIN);
    assertFractionsAndRaw('cols', shape, null, area, out, '1px-both');
});

test('issue 12: a huge gap over a small axis keeps valid fractions (both kinds)', () => {
    for (const kind of ['cols', 'rows']) {
        const shape = [2, 2, 2];
        const area = [0, 0, 50, 50];
        const out = m.splitMinimal(kind, shape, null, area, GAP, MIN);
        assertFractionsAndRaw(kind, shape, null, area, out, 'huge-gap-' + kind);
    }
});

test('issue 12: the stored split is never mutated and a correction is deterministic', () => {
    const split = { kind: 'cols', shape: [2, 2], major: [0.4, 0.6], minor: [[0.5, 0.5], [0.5, 0.5]] };
    const stored = JSON.parse(JSON.stringify(split));
    const area = [0, 0, 100, 100];
    const a = m.splitMinimal('cols', [2, 2], split, area, GAP, MIN);
    const b = m.splitMinimal('cols', [2, 2], split, area, GAP, MIN);
    assert.deepEqual(split, stored, 'the stored split is untouched');
    assert.deepEqual(a, b, 'the correction is deterministic');
});

test('issue 12: feasible ordinary splits are untouched (no regression of the accepted behaviour)', () => {
    const split = { kind: 'cols', shape: [1, 2], major: [0.6, 0.4], minor: [[1], [0.25, 0.75]] };
    const area = [0, 0, 1000, 600];
    assert.equal(m.splitMinimal('cols', [1, 2], split, area, GAP, MIN), split, 'same reference when nothing changes');
    assert.equal(m.splitMinimal('cols', [1, 2], null, area, GAP, MIN), null, 'null stays null');
    // the fair-shortfall case stays exactly as accepted (9 cells of 1000 px, gap 48)
    const shape = new Array(9).fill(1);
    const box = [0, 0, 1000, 600];
    const out = m.splitMinimal('cols', shape, null, box, GAP, MIN);
    assert.ok(out, 'a feasible-but-short budget still tiles');
    const fr = m.splitRects('cols', shape, out, box).map((r) => g.gapCell(r, box, GAP));
    assert.deepEqual(fr.map((r) => r[2]), [69, 69, 69, 69, 68, 68, 68, 68, 68], 'the accepted fair shares are unchanged');
});

test('issue 12: a non-integer axis length returns fractions summing to exactly 1', () => {
    for (const n of [2, 3, 5]) {
        const shape = new Array(n).fill(1);
        const area = [0, 0, 49.6, 600];
        const out = m.splitMinimal('cols', shape, null, area, GAP, MIN);
        const eff = effective('cols', shape, out);
        assert.ok(near(sum(eff.major), 1, 1e-9), `n=${n}: major sums to exactly 1, got ${sum(eff.major)}`);
        assert.ok(eff.major.every((f) => f > 0 && Number.isFinite(f)), `n=${n}: fractions positive and finite`);
        const rects = m.splitRects('cols', shape, out, area);
        const last = rects[rects.length - 1];
        assert.ok(last[0] + last[2] <= area[0] + area[2] + 1e-6, `n=${n}: the last raw cell stays inside the area`);
        const finals = rects.map((r) => g.gapCell(r, area, GAP));
        for (const r of finals) {
            assert.ok(r[0] >= area[0] - 1e-6 && r[1] >= area[1] - 1e-6
                && r[0] + r[2] <= area[0] + area[2] + 1e-6 && r[1] + r[3] <= area[1] + area[3] + 1e-6,
                `n=${n}: the final frame stays inside the fractional area, got ${JSON.stringify(r)}`);
        }
    }
});

test('issue 12: final frames stay inside a tiny usable area on both axes', () => {
    for (const [kind, shape] of [['cols', [1, 1, 1, 1]], ['rows', [1, 1, 1, 1]]]) {
        const area = [0, 0, 10, 10];
        const out = m.splitMinimal(kind, shape, null, area, GAP, MIN);
        const finals = m.splitRects(kind, shape, out, area).map((r) => g.gapCell(r, area, GAP));
        for (const r of finals) {
            assert.ok(inside(r, area), `${kind}: final frame inside the 10x10 area: ${r}`);
            assert.ok(r[2] >= 1 && r[3] >= 1, `${kind}: at least 1px: ${r}`);
        }
    }
});

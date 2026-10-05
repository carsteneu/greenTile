'use strict';
// Pure application-minimum fit (lib/model/split.js splitFit / splitFitShape):
// the nominal shape when it holds the cell minima, the same kind regrouped into
// fewer horizontally adjacent windows otherwise, and the untouched nominal
// arrangement when nothing fits. The runtime integration is covered by
// tests/tiling/minimum-fit.test.js through the real extension.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/cinnamon-loader');

const m = load('./lib/model/split.js');
const MIN = m.SPLIT_MIN_PX;
const sum = (a) => a.reduce((x, y) => x + y, 0);
const cells = (n, w, h) => Array.from({ length: n }, () => ({ w: w, h: h }));

test('splitFitShape: the nominal shape comes back when it holds the minima', () => {
    const shape = [2, 1];
    assert.deepEqual(m.splitFitShape('cols', shape, cells(3, 300, 200), 2000, 1100, 0), [2, 1]);
});

test('splitFitShape: too-wide columns regroup into fewer, stacked ones', () => {
    // four columns of 600 on a 2000 px area: 2400 does not fit, three columns do.
    // Balanced-first tie-break puts the smaller group leftmost — the same rule that
    // yields the uneven [1,2] in the 2000x1100/gap12 three-window case.
    const shape = m.splitFitShape('cols', [1, 1, 1, 1], cells(4, 600, 200), 2000, 1100, 0);
    assert.deepEqual(shape, [1, 1, 2]);
    assert.equal(sum(shape), 4, 'no window is dropped');
});

test('splitFitShape: an uneven feasible grouping is found when the balanced one is not', () => {
    // The orchestrator's R1 fixture: with these minima the balanced 2+1 needs 1300 px
    // of height in one column (800+500) and the balanced 3-wide needs 2700 px of width,
    // so only the uneven 1+2 fits — 1050 for the tall column, 938 for the stacked pair.
    const mins = [{ w: 1050, h: 800 }, { w: 750, h: 500 }, { w: 900, h: 300 }];
    assert.deepEqual(m.splitFitShape('cols', [1, 1, 1], mins, 2000, 1100, 12), [1, 2]);
});

test('splitFitShape: the regroup search is bounded for many windows', () => {
    // 40 windows with no feasible arrangement: the search must terminate on the node
    // cap and return the nominal shape (best effort), not run away.
    const mins = Array.from({ length: 40 }, () => ({ w: 900, h: 900 }));
    const shape = m.splitFitShape('cols', Array.from({ length: 40 }, () => 1), mins, 2000, 1100, 12);
    assert.deepEqual(shape, Array.from({ length: 40 }, () => 1), 'nominal shape, honest best effort');
});

test('splitFitShape: a stack whose cells exceed the height is rejected too', () => {
    // side by side needs 2 * 1100 = 2200 > 2000; one stack of two needs 2 * 700 = 1400
    // of 1100 height, so nothing fits and the nominal shape stays (best effort)
    const shape = m.splitFitShape('rows', [2], [{ w: 1100, h: 700 }, { w: 1100, h: 700 }], 2000, 1100, 0);
    assert.deepEqual(shape, [2], 'no impossible arrangement is promised');
});

test('splitFit: an unchanged shape with no minimum keeps the base split by reference', () => {
    const base = m.splitEqual('cols', [1, 1]);
    const fit = m.splitFit('cols', [1, 1], cells(2, MIN, MIN), [0, 0, 2000, 1100], 0, MIN, base);
    assert.equal(fit.split, base, 'byte-identical: the read-time split is passed through');
    assert.deepEqual(fit.shape, [1, 1]);
    assert.equal(m.splitFit('cols', [1, 1], cells(2, MIN, MIN), [0, 0, 2000, 1100], 0, MIN, null).split, null,
        'without a base split the equal division stays the empty split');
});

test('splitFit: a part is raised to its own cell minimum, financed by the others', () => {
    const fit = m.splitFit('rows', [2], [{ w: 1400, h: MIN }, { w: MIN, h: MIN }], [0, 0, 2000, 1100], 0, MIN, null);
    assert.deepEqual(fit.shape, [2]);
    assert.deepEqual(fit.split.minor[0], [0.7, 0.3], 'the refused cell holds 1400 of 2000');
});

test('splitFit: a minima list that does not match the shape leaves the nominal alone', () => {
    const fit = m.splitFit('cols', [1, 1], cells(3, 900, MIN), [0, 0, 2000, 1100], 0, MIN, null);
    assert.deepEqual(fit.shape, [1, 1], 'the mismatched minima are not attributed to cells');
    assert.equal(fit.split, null, 'the nominal arrangement is returned untouched');
});

test('splitFit: an impossible arrangement stays finite and never fakes a fit', () => {
    const fit = m.splitFit('rows', [2], [{ w: 1500, h: 120 }, { w: 1500, h: 120 }], [0, 0, 2000, 200], 0, MIN, null);
    assert.deepEqual(fit.shape, [2]);
    for (const f of fit.split.major.concat(fit.split.minor[0])) {
        assert.ok(Number.isFinite(f), 'a defined finite fraction');
    }
});

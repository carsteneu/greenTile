'use strict';
// panelThumb draws preset column spans as proportional widths, so a card or a rule row
// shows exactly what a click tiles. Without spans (or with all-one spans) it paints the
// equal division as before, and corrupt spans can neither hang nor break the repaint.
const test = require('node:test');
const assert = require('node:assert/strict');

const { load } = require('../helpers/cinnamon-loader');
const { createCinnamonEnv } = require('../helpers/fakes/cinnamon-env');

// Records the arc calls of the round rects; radius 0 in these fixtures keeps the arc x
// values at the cell's left and right edge.
const makeCr = () => {
    const arcs = [];
    return {
        arcs,
        newSubPath() {},
        arc(x, y, r) { arcs.push([x, y, r]); },
        closePath() {},
        fill() {},
        setSourceRGB() {},
        $dispose() {},
    };
};

const cells = (arcs) => {
    const out = [];
    for (let i = 0; i + 3 < arcs.length; i += 4) {
        const xs = [arcs[i][0], arcs[i + 1][0], arcs[i + 2][0], arcs[i + 3][0]];
        out.push({ x: Math.min.apply(null, xs), width: Math.max.apply(null, xs) - Math.min.apply(null, xs) });
    }
    return out;
};

const paint = (stacks, spans) => {
    globalThis.imports = createCinnamonEnv().imports;
    const { panelThumb } = load('./lib/ui/draw.js');
    const opts = { width: 100, height: 10, gap: 0, radius: 0, color: [1, 2, 3] };
    if (spans) {
        opts.spans = spans;
    }
    const area = panelThumb({}, stacks, opts);
    const handler = area._handlers.find((h) => h.sigName === 'repaint');
    const cr = makeCr();
    handler.cb({ get_context: () => cr, get_surface_size: () => [100, 10] });
    return cells(cr.arcs);
};

test('without spans the preview keeps the equal division', () => {
    assert.deepEqual(paint([1, 1, 1, 1]), [
        { x: 0, width: 25 }, { x: 25, width: 25 }, { x: 50, width: 25 }, { x: 75, width: 25 },
    ]);
});

test('spans draw the columns wide enough to cover their grid columns', () => {
    assert.deepEqual(paint([1, 1, 1], [1, 2, 1]), [
        { x: 0, width: 25 }, { x: 25, width: 50 }, { x: 75, width: 25 },
    ]);
    assert.deepEqual(paint([1, 1], [3, 3]), [
        { x: 0, width: 50 }, { x: 50, width: 50 },
    ]);
});

test('all-one spans are the equal division', () => {
    assert.deepEqual(paint([1, 1, 1], [1, 1, 1]), paint([1, 1, 1]));
});

test('corrupt or mismatched spans fall back to the equal division', () => {
    const infinite = Number.MAX_VALUE * 2;
    assert.deepEqual(paint([1, 1, 1], [0, -2, infinite]), paint([1, 1, 1]));
    assert.deepEqual(paint([1, 1, 1], ['x', null, undefined]), paint([1, 1, 1]));
    assert.deepEqual(paint([1, 1, 1], [1, 2]), paint([1, 1, 1]));
    assert.deepEqual(paint([1, 1, 1], [1, 1, 1, 1]), paint([1, 1, 1]));
});

test('the cell count stays the honest rendering of the stacks', () => {
    assert.equal(paint([3, Infinity], [2, 2]).length, 4);
    assert.equal(paint([1, 2, 2], [1, 1, 1]).length, 5);
});

'use strict';
// The painter's repaint (lib/ui/editor.js editorBody) draws every boundary handle in TWO
// inks, one per band, each chosen for the surface that band covers: a merge handle lies in
// the gap between two painted columns, a split handle inside a merged one. This drives the
// real repaint callback with a recording cairo context and pins both the inks and the
// geometry that lines the bands up with those surfaces.
const test = require('node:test');
const assert = require('node:assert/strict');

const { load } = require('../helpers/cinnamon-loader');
const { createCinnamonEnv } = require('../helpers/fakes/cinnamon-env');

// .gk-painter dark (stylesheet.css) — the surface the columns are painted on.
const PAINTER = [20, 22, 29];
const DARK = [20 / 255, 22 / 255, 29 / 255];
const LIGHT = [246 / 255, 247 / 255, 250 / 255];

/** Records every cairo call the repaint makes, coordinates included. */
const recorder = () => {
    const calls = [];
    const cr = {
        setSourceRGBA: (...a) => calls.push(['rgba', ...a]),
        setSourceRGB: (...a) => calls.push(['rgb', ...a]),
        setLineWidth: (...a) => calls.push(['line', ...a]),
        setDash: (...a) => calls.push(['dash', ...a]),
        newSubPath: () => calls.push(['newSubPath']),
        arc: (...a) => calls.push(['arc', ...a]),
        closePath: () => calls.push(['closePath']),
        rectangle: (...a) => calls.push(['rectangle', ...a]),
        fill: () => calls.push(['fill']),
        stroke: () => calls.push(['stroke']),
        $dispose: () => calls.push(['dispose']),
    };
    return { calls, cr };
};

/** Rect of every rounded-rect path in draw order (4 arcs between newSubPath and closePath). */
const rectsOf = (calls) => {
    const rects = [];
    let arcs = null;
    for (const call of calls) {
        if (call[0] === 'newSubPath') {
            arcs = [];
        }
        else if (call[0] === 'arc' && arcs) {
            arcs.push(call.slice(1));
        }
        else if (call[0] === 'closePath' && arcs && arcs.length === 4) {
            const [a1, , a3, a4] = arcs;
            const r = a1[2];
            const x = a4[0] - r;
            const y = a1[1] - r;
            rects.push({ x: x, y: y, w: a1[0] + r - x, h: a3[1] + r - y });
            arcs = null;
        }
    }
    return rects;
};

const painter = (rule, accent = [255, 150, 64]) => {
    globalThis.imports = createCinnamonEnv().imports;
    const app = {
        theme: { rgb: accent, theme: 'dark', cairo: (k) => (k === 'painter' ? PAINTER : [42, 46, 57]) },
        panel: { draft: { id: 'p1', name: 'T', index: 0, isNew: true, rules: [rule] } },
    };
    const body = load('./lib/ui/editor.js').editorBody(app);
    const { calls, cr } = recorder();
    body.painter.emit('repaint', { get_context: () => cr, get_surface_size: () => [600, 400] });
    return calls;
};

// Handles are the only opaque paints (columns run at 0.85, the empty-column outlines are
// setSourceRGB plus a dashed stroke), so alpha 1 identifies a handle ink.
const opaque = (calls) => calls.filter((c) => c[0] === 'rgba' && Math.abs(c[4] - 1) < 1e-9).map((c) => c.slice(1, 4));
const close = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
// The empty grid columns are stroked at width 1, the handle rims at the wider HANDLE_RIM.
const rimWidth = (calls) => Math.max(...calls.filter((c) => c[0] === 'line').map((c) => c[1]));
/** The second painted column: stacked cells repeat the first column's x. */
const secondColumn = (rects) => rects.find((r) => r.x !== rects[0].x);

test('a split handle keeps the column ink, a merge handle takes the gap ink', () => {
    // spans [2,1] gives one split handle (inside the merged first column) and one merge
    // handle (on the boundary): split fill DARK / rim LIGHT, then merge fill LIGHT (the
    // dark gap needs the light ink) / rim DARK (the bright column needs the dark one).
    const calls = painter({ min: 2, stacks: [2, 1], spans: [2, 1] });
    assert.deepEqual(opaque(calls).map((c) => (close(c, DARK) ? 'dark' : close(c, LIGHT) ? 'light' : 'other')),
        ['dark', 'light', 'light', 'dark']);
    assert.equal(calls.filter((c) => c[0] === 'line' && c[1] === 2).length, 2, 'rim line width on both handles');
    // The accent ink at 0.55 alpha is gone: the handle never blends into the column again.
    assert.equal(calls.filter((c) => c[0] === 'rgba' && Math.abs(c[4] - 0.55) < 1e-9).length, 0, 'no translucency');
});

test('the bands line up with the surfaces: the merge fill band equals the column gap', () => {
    const calls = painter({ min: 2, stacks: [2, 1], spans: [2, 1] });
    const rects = rectsOf(calls);
    const col0a = rects[0];
    const col0b = rects[1];
    const col1 = secondColumn(rects);
    // Every handle draws its fill and then its rim along the same path: the last four
    // paths are split fill/rim and merge fill/rim, in handle order.
    const handles = rects.slice(-4);
    assert.equal(handles[0].x, handles[1].x, 'fill and rim share one path');
    const split = handles[0];
    const merge = handles[2];
    const rim = rimWidth(calls);
    const gap = col1.x - (col0a.x + col0a.w);
    assert.equal(col0b.x, col0a.x, 'the stacked cells share the column x');
    assert.equal(col1.x, col0a.x + col0a.w + gap);
    assert.equal(merge.x + merge.w / 2, col0a.x + col0a.w + gap / 2, 'the merge handle is centred in the gap');
    // The rim eats rim / 2 per side, so the fill band left over is exactly the gap — that is
    // what lets one band be chosen for the gap and the other for the columns.
    assert.equal(merge.w - rim, gap, 'fill band covers the gap exactly');
    assert.ok(split.x - rim / 2 >= col0a.x && split.x + split.w + rim / 2 <= col0a.x + col0a.w,
        'the whole split handle, rim included, lies on the painted column');
});

test('a dark accent flips the merge handle to the light ink', () => {
    const calls = painter({ min: 2, stacks: [2, 1], spans: [2, 1] }, [8, 8, 8]);
    const inks = opaque(calls);
    assert.deepEqual(inks.map((c) => (close(c, DARK) ? 'dark' : close(c, LIGHT) ? 'light' : 'other')),
        ['light', 'dark', 'light', 'light']);
});

test('the painted columns keep the accent at 0.85', () => {
    const calls = painter({ min: 2, stacks: [2, 1], spans: [2, 1] });
    const accentCalls = calls.filter((c) => c[0] === 'rgba' && Math.abs(c[4] - 0.85) < 1e-9);
    assert.equal(accentCalls.length, 2, 'the source is set once per painted column');
    assert.ok(accentCalls.every((c) => Math.abs(c[1] - 1) < 1e-9), 'default accent red channel');
    assert.equal(calls.filter((c) => c[0] === 'fill').length, 5, 'three column cells, two handle fills');
});

test('the free grid columns keep their dashed outline and single-column rules keep one merge handle', () => {
    const calls = painter({ min: 2, stacks: [2, 1], spans: [1, 1] });
    // spans [1,1] covers two of the six grid columns: the other four stay dashed outlines,
    // and the boundary between the two painted columns still carries a merge handle.
    assert.equal(calls.filter((c) => c[0] === 'dash').length, 8, 'set and reset per empty column');
    assert.equal(opaque(calls).length, 2, 'the merge handle fill and rim');
    const rects = rectsOf(calls);
    const col0 = rects[0];
    const col1 = secondColumn(rects);
    const merge = rects.slice(-2)[0];
    const rim = rimWidth(calls);
    assert.equal(merge.w - rim, col1.x - (col0.x + col0.w), 'fill band still equals the gap');
});

'use strict';
// The painter's repaint (lib/ui/editor.js editorBody) draws every boundary handle in
// TWO inks: the fill is the accent ink that contrasts with the painted column, the rim
// the opposite one — so a handle stays visible on the accent column AND in the panel
// gap. This drives the real repaint callback with a recording cairo context.
const test = require('node:test');
const assert = require('node:assert/strict');

const { load } = require('../helpers/cinnamon-loader');
const { createCinnamonEnv } = require('../helpers/fakes/cinnamon-env');

const PANEL = [28, 31, 40];

/** Records every cairo call the repaint makes. */
const recorder = () => {
    const calls = [];
    const cr = {
        setSourceRGBA: (...a) => calls.push(['rgba', ...a]),
        setSourceRGB: (...a) => calls.push(['rgb', ...a]),
        setLineWidth: (...a) => calls.push(['line', ...a]),
        setDash: (...a) => calls.push(['dash', ...a]),
        newSubPath: () => calls.push(['newSubPath']),
        arc: () => calls.push(['arc']),
        closePath: () => calls.push(['closePath']),
        rectangle: () => calls.push(['rectangle']),
        fill: () => calls.push(['fill']),
        stroke: () => calls.push(['stroke']),
        $dispose: () => calls.push(['dispose']),
    };
    return { calls, cr };
};

const painter = (rule, accent = [255, 150, 64]) => {
    globalThis.imports = createCinnamonEnv().imports;
    const app = {
        theme: { rgb: accent, theme: 'dark', cairo: (k) => (k === 'panel' ? PANEL : [40, 50, 60]) },
        panel: { draft: { id: 'p1', name: 'T', index: 0, isNew: true, rules: [rule] } },
    };
    const body = load('./lib/ui/editor.js').editorBody(app);
    const { calls, cr } = recorder();
    body.painter.emit('repaint', { get_context: () => cr, get_surface_size: () => [600, 400] });
    return calls;
};

const rgbaCalls = (calls) => calls.filter((c) => c[0] === 'rgba').map((c) => c.slice(1));
// Handles are the only opaque paints in the painter (columns run at 0.85, the empty-column
// outlines are setSourceRGB + a dashed stroke), so alpha 1 identifies a handle ink.
const opaque = (calls) => rgbaCalls(calls).filter((c) => Math.abs(c[3] - 1) < 1e-9);
const handleStrokes = (calls) => {
    let pending = false;
    let count = 0;
    for (const call of calls) {
        if (call[0] === 'line') {
            // The empty grid columns are stroked at width 1, the handle rims at width 2.
            pending = call[1] === 2;
        }
        else if (call[0] === 'stroke') {
            if (pending) {
                count += 1;
            }
            pending = false;
        }
    }
    return count;
};

test('handles are painted with a contrasting fill and the opposite rim, not the accent', () => {
    // spans [2,1]: one split handle inside the merged column and one merge handle on the
    // boundary — two handles, each filled and rimmed.
    const calls = painter({ min: 2, stacks: [2, 1], spans: [2, 1] });
    const inks = opaque(calls);
    const fill = [20 / 255, 22 / 255, 29 / 255, 1];
    const rim = [246 / 255, 247 / 255, 250 / 255, 1];
    assert.equal(inks.filter((c) => c.every((v, i) => Math.abs(v - fill[i]) < 1e-9)).length, 2, 'both handles filled in the dark ink');
    assert.equal(inks.filter((c) => c.every((v, i) => Math.abs(v - rim[i]) < 1e-9)).length, 2, 'both handles rimmed in the light ink');
    assert.equal(handleStrokes(calls), 2, 'one rim stroke per handle');
    assert.deepEqual(calls.filter((c) => c[0] === 'line' && c[1] === 2).length, 2, 'rim line width on both handles');
    // The accent ink at 0.55 alpha is gone: the handle never blends into the column again.
    assert.equal(rgbaCalls(calls).filter((c) => Math.abs(c[3] - 0.55) < 1e-9).length, 0, 'no translucency on the handles');
});

test('a dark accent flips the ink pair', () => {
    const calls = painter({ min: 2, stacks: [2, 1], spans: [2, 1] }, [8, 8, 8]);
    const inks = opaque(calls);
    assert.ok(inks.some((c) => Math.abs(c[0] - 246 / 255) < 1e-9), 'light fill on a dark accent');
    assert.ok(inks.some((c) => Math.abs(c[0] - 20 / 255) < 1e-9), 'dark rim on a dark accent');
});

test('the painted columns keep the accent at 0.85', () => {
    const calls = painter({ min: 2, stacks: [2, 1], spans: [2, 1] });
    const accentCalls = rgbaCalls(calls).filter((c) => Math.abs(c[3] - 0.85) < 1e-9);
    assert.equal(accentCalls.length, 2, 'the source is set once per painted column');
    assert.ok(accentCalls.every((c) => Math.abs(c[0] - 1) < 1e-9), 'default accent red channel');
    assert.equal(calls.filter((c) => c[0] === 'fill').length, 5, 'three column cells, two handle fills');
});

test('the free grid columns keep their dashed outline and single-column rules keep one merge handle', () => {
    const calls = painter({ min: 2, stacks: [2, 1], spans: [1, 1] });
    // spans [1,1] covers two of the six grid columns: the other four stay dashed outlines,
    // and the boundary between the two painted columns still carries a merge handle.
    assert.equal(calls.filter((c) => c[0] === 'dash').length, 8, 'set and reset per empty column');
    assert.equal(handleStrokes(calls), 1, 'only the merge handle is rimmed');
    assert.equal(opaque(calls).length, 2, 'its fill and its rim');
});

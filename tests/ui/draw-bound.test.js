'use strict';
// Bounded repaint for corrupt thumbnail data (todo_fixes issue 1): panelThumb
// loops per stack cell — a non-finite stack value from a corrupt settings file
// must paint a bounded number of cells instead of hanging the desktop process.
const test = require('node:test');
const assert = require('node:assert/strict');

const { load } = require('../helpers/cinnamon-loader');
const { createCinnamonEnv } = require('../helpers/fakes/cinnamon-env');

const makeCr = () => {
    let arcs = 0;
    return {
        arcs: () => arcs,
        newSubPath() {},
        arc() { arcs++; },
        closePath() {},
        fill() {},
        setSourceRGB() {},
        $dispose() {},
    };
};

test('panelThumb paints a bounded number of cells for corrupt stack data', () => {
    const env = createCinnamonEnv();
    globalThis.imports = env.imports;
    const { panelThumb } = load('./lib/ui/draw.js');
    const area = panelThumb({}, [3, Infinity], { color: [1, 2, 3] });
    const handler = area._handlers.find((h) => h.sigName === 'repaint');
    assert.ok(handler);
    const cr = makeCr();
    // 4 cells painted (the Infinity column reads as one): 4 arcs per round rect.
    handler.cb({ get_context: () => cr, get_surface_size: () => [54, 34] });
    assert.equal(cr.arcs(), 16);
    cr.$dispose();
});

test('panelThumb paints the real cells for valid stack data', () => {
    const env = createCinnamonEnv();
    globalThis.imports = env.imports;
    const { panelThumb } = load('./lib/ui/draw.js');
    const area = panelThumb({}, [1, 2, 2], { color: [1, 2, 3] });
    const handler = area._handlers.find((h) => h.sigName === 'repaint');
    const cr = makeCr();
    handler.cb({ get_context: () => cr, get_surface_size: () => [54, 34] });
    assert.equal(cr.arcs(), 20);
    cr.$dispose();
});

test('panelThumb keeps painting legitimately filled surplus cells unclamped', () => {
    // fillStacks spreads n - total surplus into the last column, so valid data
    // renders stacks above the editor's 4-row ceiling — only corrupt values
    // (non-finite, non-coercible) normalize down to one cell.
    const env = createCinnamonEnv();
    globalThis.imports = env.imports;
    const { panelThumb } = load('./lib/ui/draw.js');
    const area = panelThumb({}, [1, 6], { color: [1, 2, 3] });
    const handler = area._handlers.find((h) => h.sigName === 'repaint');
    const cr = makeCr();
    handler.cb({ get_context: () => cr, get_surface_size: () => [54, 34] });
    assert.equal(cr.arcs(), 28);
    cr.$dispose();
});

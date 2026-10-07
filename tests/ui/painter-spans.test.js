'use strict';
// The spans-aware painter (lib/ui/editor.js) driven through the real editor body on the
// fake Cinnamon runtime: the handle on the boundary between two painted columns merges
// them, the handle inside a merged column splits one grid column off, right-click
// removes the whole column with its span, painting a merged column keeps the span, and
// a new column is offered only while the painter grid has room for it.
//
// The fake actor has no allocation (get_size() is [600, 400]); the painter grid cell is
// therefore (600 - 3 * 5) / 6 = 97.5 px wide with a 100.5 px step, and the local
// painter coordinates are the ones this test clicks with (transform_stage_point is
// stubbed to identity).
const test = require('node:test');
const assert = require('node:assert/strict');

const { load } = require('../helpers/cinnamon-loader');
const { createCinnamonEnv } = require('../helpers/fakes/cinnamon-env');

const STEP = (600 - 3 * 5) / 6 + 3;

/**
 * Builds the editor body for one rule and returns the draft it edits plus a click
 * helper working in local painter coordinates.
 * @param {{ min: number, stacks: number[], spans: number[] }} rule
 */
const painter = (rule) => {
    globalThis.imports = createCinnamonEnv().imports;
    const app = {
        theme: { rgb: [10, 20, 30], cairo: () => [40, 50, 60] },
        panel: { draft: { id: 'p1', name: 'T', index: 0, isNew: true, rules: [rule] } },
    };
    const body = load('./lib/ui/editor.js').editorBody(app);
    body.painter.transform_stage_point = (sx, sy) => [true, sx, sy];
    /** Clicks at local painter coordinates. */
    const click = (x, y, button = 1) => {
        body.painter.emit('button-press-event', body.painter, {
            get_coords: () => [x, y],
            get_button: () => button,
            get_device: () => ({ grab() {}, ungrab() {} }),
        });
    };
    return { draft: app.panel.draft, click };
};

const rule = (r) => r.draft.rules[0];

test('the handle between two painted columns merges them', () => {
    // spans [2, 1]: the split handle of the merged column sits on the grid line at
    // 1 * step - gap/2, the merge handle on the line at 2 * step - gap/2.
    const { draft, click } = painter({ min: 2, stacks: [2, 1], spans: [2, 1] });
    click(2 * STEP - 1.5, 200);
    assert.deepEqual(rule({ draft }), { min: 2, stacks: [2], spans: [3] });
});

test('the handle inside a merged column splits one grid column off the right', () => {
    const { draft, click } = painter({ min: 2, stacks: [2, 1], spans: [2, 1] });
    click(1 * STEP - 1.5, 200);
    assert.deepEqual(rule({ draft }), { min: 2, stacks: [2, 1, 1], spans: [1, 1, 1] });
});

test('a handle merges a wide column with its right neighbour', () => {
    const { draft, click } = painter({ min: 2, stacks: [1, 1, 1], spans: [1, 2, 1] });
    click(3 * STEP - 1.5, 200);
    assert.deepEqual(rule({ draft }), { min: 2, stacks: [1, 1], spans: [1, 3] });
});

test('right-click removes the whole merged column and its span', () => {
    const { draft, click } = painter({ min: 2, stacks: [2, 1], spans: [2, 1] });
    click(50, 50, 3);
    assert.deepEqual(rule({ draft }), { min: 2, stacks: [1], spans: [1] });
});

test('right-click on a handle does nothing', () => {
    const { draft, click } = painter({ min: 2, stacks: [2, 1], spans: [2, 1] });
    click(1 * STEP - 1.5, 200, 3);
    assert.deepEqual(rule({ draft }), { min: 2, stacks: [2, 1], spans: [2, 1] });
});

test('painting a merged column sets its window count and keeps the span', () => {
    const { draft, click } = painter({ min: 2, stacks: [2, 1], spans: [2, 1] });
    // x = 50 sits in the wide first column (0..198), the bottom row is four windows.
    click(50, 350);
    assert.deepEqual(rule({ draft }), { min: 2, stacks: [4, 1], spans: [2, 1] });
});

test('painting right of the painted columns adds one column while the grid has room', () => {
    const { draft, click } = painter({ min: 2, stacks: [1, 1], spans: [1, 1] });
    click(590, 50);
    assert.deepEqual(rule({ draft }), { min: 2, stacks: [1, 1, 1], spans: [1, 1, 1] });
});

test('painting the last column of a full painter grid sets its count without adding a column', () => {
    const { draft, click } = painter({ min: 2, stacks: [1, 1, 1], spans: [2, 2, 2] });
    // x = 590 sits in the last column (402..600), the bottom row is four windows.
    click(590, 350);
    assert.deepEqual(rule({ draft }), { min: 2, stacks: [1, 1, 4], spans: [2, 2, 2] });
});

test('a full painter grid offers no new column, not even beyond its right edge', () => {
    // spans [2,2,2] already cover all six grid columns; the last one ends at the edge.
    const full = painter({ min: 2, stacks: [1, 1, 1], spans: [2, 2, 2] });
    full.click(600 + 10, 200);
    assert.equal(rule(full).stacks.length, 3, 'no fourth column, stacks ' + JSON.stringify(rule(full).stacks));
    assert.equal(rule(full).spans.reduce((a, b) => a + b, 0), 6, 'the spans still fit the grid');
    // Same after a merge: five columns cover the six grid columns (spans sum 6).
    const merged = painter({ min: 2, stacks: [1, 1, 1, 1, 1, 1], spans: [1, 1, 1, 1, 1, 1] });
    merged.click(STEP - 1.5, 200);
    assert.deepEqual(rule(merged).spans, [2, 1, 1, 1, 1]);
    merged.click(600 + 10, 200);
    assert.equal(rule(merged).stacks.length, 5, 'no sixth column, stacks ' + JSON.stringify(rule(merged).stacks));
    assert.equal(rule(merged).spans.reduce((a, b) => a + b, 0), 6,
        'spans over six are dropped again when the preset is read, so the merge would be lost');
});

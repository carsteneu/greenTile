'use strict';
// Responsive card-grid math for the preset panel (no Cinnamon): the panel is a
// St/Clutter actor without CSS grid or flex, so the column count and the card
// width are computed in JS from the panel width. Kept pure so the geometry is
// unit-testable without the fake St widget allocation.
const test = require('node:test');
const assert = require('node:assert/strict');

const { load } = require('../helpers/cinnamon-loader');

const { gridAvailable, gridColumns, gridCardWidth, gridRows, PRESET_CARD_MIN_W, PRESET_CARD_GAP, PRESET_GRID_PAD, PRESET_SCROLLBAR } = load('./lib/model/grid.js');

test('the model exposes the fixed layout tokens', () => {
    assert.equal(PRESET_CARD_MIN_W, 160);
    assert.equal(PRESET_CARD_GAP, 14);
    assert.equal(PRESET_GRID_PAD, 14);
    assert.equal(PRESET_SCROLLBAR, 21);
});

test('gridAvailable subtracts both paddings and the reserved scrollbar from the panel width', () => {
    assert.equal(gridAvailable(600), 600 - 2 * PRESET_GRID_PAD - PRESET_SCROLLBAR);
    assert.equal(gridAvailable(800), 800 - 2 * PRESET_GRID_PAD - PRESET_SCROLLBAR);
});

test('gridAvailable never goes below one pixel for tiny or invalid widths', () => {
    assert.equal(gridAvailable(0), 1);
    assert.equal(gridAvailable(-40), 1);
    assert.equal(gridAvailable(NaN), 1);
    assert.equal(gridAvailable(Infinity), 1);
});

test('gridColumns fits three cards in the default 600px panel', () => {
    assert.equal(gridColumns(gridAvailable(600)), 3);
});

test('gridColumns adds a column when the panel gets wider', () => {
    assert.equal(gridColumns(gridAvailable(800)), 4);
    assert.equal(gridColumns(gridAvailable(1000)), 5);
});

test('gridColumns reduces to a single column when the space is narrow', () => {
    assert.equal(gridColumns(2 * PRESET_CARD_MIN_W + PRESET_CARD_GAP), 2);
    assert.equal(gridColumns(200), 1);
    assert.equal(gridColumns(PRESET_CARD_MIN_W), 1);
});

test('gridColumns clamps invalid widths to one column', () => {
    assert.equal(gridColumns(0), 1);
    assert.equal(gridColumns(-100), 1);
    assert.equal(gridColumns(NaN), 1);
    assert.equal(gridColumns(Infinity), 1);
    assert.equal(gridColumns(-Infinity), 1);
});

test('gridCardWidth splits the available width evenly and never overflows', () => {
    const avail = gridAvailable(600);
    const cols = gridColumns(avail);
    assert.equal(gridCardWidth(avail, cols), 174);
    assert.ok(cols * gridCardWidth(avail, cols) + (cols - 1) * PRESET_CARD_GAP <= avail);
});

test('gridCardWidth stays above the minimum beside a full column set', () => {
    for (const width of [600, 800, 1000, 1440, 1920]) {
        const avail = gridAvailable(width);
        const cols = gridColumns(avail);
        const cardW = gridCardWidth(avail, cols);
        assert.ok(cardW >= PRESET_CARD_MIN_W, `${width}: card ${cardW} below the minimum`);
        assert.ok(cols * cardW + (cols - 1) * PRESET_CARD_GAP <= avail, `${width}: row overflows`);
    }
});

test('gridCardWidth clamps a nonsensical column count to at least one', () => {
    assert.equal(gridCardWidth(300, 0), gridCardWidth(300, 1));
    assert.equal(gridCardWidth(300, -2), gridCardWidth(300, 1));
    assert.equal(gridCardWidth(300, NaN), gridCardWidth(300, 1));
});

test('gridRows chunks the presets into full rows with a short final row', () => {
    assert.deepEqual(gridRows(['a', 'b', 'c', 'd', 'e'], 3), [['a', 'b', 'c'], ['d', 'e']]);
    assert.deepEqual(gridRows(['a', 'b'], 3), [['a', 'b']]);
    assert.deepEqual(gridRows([], 3), []);
});

test('gridRows clamps an invalid column count to one per row', () => {
    assert.deepEqual(gridRows(['a', 'b', 'c'], 0), [['a'], ['b'], ['c']]);
    assert.deepEqual(gridRows(['a', 'b'], NaN), [['a'], ['b']]);
});

test('the layout is deterministic for repeated calls', () => {
    const avail = gridAvailable(600);
    assert.deepEqual(gridRows(['a', 'b', 'c'], gridColumns(avail)), gridRows(['a', 'b', 'c'], gridColumns(avail)));
});

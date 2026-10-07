'use strict';
// Responsive card-grid math for the preset panel (no Cinnamon): the panel is a
// St/Clutter actor without CSS grid or flex, so the column count and the card
// width are computed in JS from the panel width. Kept pure so the geometry is
// unit-testable without the fake St widget allocation.
const test = require('node:test');
const assert = require('node:assert/strict');

const { load } = require('../helpers/cinnamon-loader');

const { gridLayout, gridMetrics, gridAvailable, gridColumns, gridCardWidth, gridRows, PRESET_CARD_MIN_W, PRESET_CARD_GAP, PRESET_GRID_PAD, PRESET_SCROLLBAR, PRESET_PANEL_BORDER, PRESET_PANEL_BORDER_W, PRESET_CARD_CHROME, PRESET_CARD_BORDER_W, PRESET_CARD_STRIPE_W, PRESET_CARD_BOX_PAD } = load('./lib/model/grid.js');

test('the model exposes the fixed layout tokens', () => {
    assert.equal(PRESET_CARD_MIN_W, 160);
    assert.equal(PRESET_CARD_GAP, 14);
    assert.equal(PRESET_GRID_PAD, 14);
    assert.equal(PRESET_SCROLLBAR, 21);
    assert.equal(PRESET_PANEL_BORDER, 2);
});

test('gridAvailable subtracts the border, both paddings and the reserved scrollbar from the panel width', () => {
    assert.equal(gridAvailable(600), 600 - PRESET_PANEL_BORDER - 2 * PRESET_GRID_PAD - PRESET_SCROLLBAR);
    assert.equal(gridAvailable(800), 800 - PRESET_PANEL_BORDER - 2 * PRESET_GRID_PAD - PRESET_SCROLLBAR);
});

test('the card area plus the panel chrome never exceeds the panel width', () => {
    for (const width of [420, 600, 800, 1000, 1440, 1920]) {
        assert.equal(gridAvailable(width) + PRESET_PANEL_BORDER + 2 * PRESET_GRID_PAD + PRESET_SCROLLBAR, width);
    }
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
    assert.equal(gridCardWidth(avail, cols), 173);
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

// --- theme scale factor (HiDPI / fractional UI scaling) ---------------------
// Every CSS box metric the grid models (.gk-card-row spacing, .gk-cards padding,
// .gk-panel border, the scrollbar reservation, the card's own chrome) is a CSS
// px value that St multiplies by the theme context's scale factor, while these JS
// constants do not scale. gridLayout() applies the factor to the model so the row
// minimum can never exceed the card area again. Measured live (Mint 22.3/Cinnamon
// 6.6.4 VM): at scale 2 the real row spacing is 28 and the panel keeps its 1429 px
// allocation while the unscaled composition demanded 1476 — a 105 px overhang.

test('the model owns the card chrome token the panel mirrors', () => {
    assert.equal(PRESET_CARD_CHROME, 21);
    assert.equal(PRESET_CARD_MIN_W - PRESET_CARD_CHROME, 139);
    // the token is the stylesheet's parts (.gk-card border, .gk-card-stripe,
    // both .gk-card-box paddings), not a free-floating number
    assert.equal(PRESET_CARD_CHROME, 2 * PRESET_CARD_BORDER_W + PRESET_CARD_STRIPE_W + 2 * PRESET_CARD_BOX_PAD);
    assert.equal(PRESET_PANEL_BORDER, 2 * PRESET_PANEL_BORDER_W);
});

// St applies and rounds each box term on its own (a 1px border at scale 1.5 is
// 2px on each side, not 2 x ceil(1.5) = 4 for the pair). The model has to
// subtract at least that; rounding per side can only make the card area smaller.
const stSide = (px, scale) => Math.floor(px * scale + 0.5);

test('a fractional theme scale subtracts each chrome part per side, never less', () => {
    for (const scale of [1.25, 1.5, 1.75, 2.25, 2.5, 3.75]) {
        const { chrome, border, minCard } = gridMetrics(scale);
        const perSide = 2 * stSide(PRESET_CARD_BORDER_W, scale)
            + stSide(PRESET_CARD_STRIPE_W, scale)
            + 2 * stSide(PRESET_CARD_BOX_PAD, scale);
        assert.ok(chrome >= perSide, `scale ${scale}: chrome ${chrome} < per-side ${perSide}`);
        assert.ok(chrome >= PRESET_CARD_CHROME * scale, `scale ${scale}: chrome ${chrome} < flat ${PRESET_CARD_CHROME * scale}`);
        assert.ok(border >= 2 * stSide(PRESET_PANEL_BORDER_W, scale), `scale ${scale}: border ${border} too small`);
        assert.equal(minCard, PRESET_CARD_MIN_W - PRESET_CARD_CHROME + chrome);
    }
    // integer scales stay exact: the per-side rule must not inflate them
    for (const scale of [1, 2, 3]) {
        assert.equal(gridMetrics(scale).chrome, PRESET_CARD_CHROME * scale);
        assert.equal(gridMetrics(scale).border, PRESET_PANEL_BORDER * scale);
        assert.equal(gridMetrics(scale).minCard, PRESET_CARD_MIN_W - PRESET_CARD_CHROME + PRESET_CARD_CHROME * scale);
    }
});

test('at theme scale 2 a panel that was 8 columns at scale 1 no longer overflows', () => {
    const W = 1429;
    // the round-1 defect, stated: 8 unscaled cards plus 7 doubled gaps in a 1429 panel
    assert.ok(8 * PRESET_CARD_MIN_W + 7 * (PRESET_CARD_GAP * 2) > W, 'the unscaled composition overflows');
    const layout = gridLayout(W, 2);
    assert.ok(layout.rowWidth <= layout.available, `row ${layout.rowWidth} exceeds the card area ${layout.available}`);
    assert.ok(layout.cardWidth >= (PRESET_CARD_MIN_W - PRESET_CARD_CHROME) + layout.cardChrome,
        'the card still holds the minimum preview beside the scaled chrome');
});

test('the box metrics scale with the theme scale factor (scale 2)', () => {
    const l1 = gridLayout(1429, 1);
    const l2 = gridLayout(1429, 2);
    assert.equal(l1.gap, 14);
    assert.equal(l2.gap, 28);
    assert.equal(l1.minCard, 160);
    assert.equal(l2.minCard, 181);
    assert.equal(l1.cardChrome, 21);
    assert.equal(l2.cardChrome, 42);
    assert.equal(l1.available, 1429 - 2 - 28 - 21);
    assert.equal(l2.available, 1429 - 4 - 56 - 42);
    assert.equal(l2.columns, 6);
    assert.equal(l2.cardWidth, 197);
    assert.equal(l2.rowWidth, 6 * 197 + 5 * 28);
    assert.ok(l2.rowWidth <= l2.available);
});

test('gridLayout at scale 1 is exactly the primitive composition', () => {
    for (const width of [420, 600, 800, 1000, 1429, 1440, 1920, 3440]) {
        const available = gridAvailable(width);
        const columns = gridColumns(available);
        const cardWidth = gridCardWidth(available, columns);
        assert.deepEqual(gridLayout(width, 1), {
            available,
            columns,
            cardWidth,
            gap: PRESET_CARD_GAP,
            minCard: PRESET_CARD_MIN_W,
            cardChrome: PRESET_CARD_CHROME,
            rowWidth: columns * cardWidth + (columns - 1) * PRESET_CARD_GAP,
        });
        assert.deepEqual(gridLayout(width), gridLayout(width, 1), 'the scale is optional and defaults to 1');
    }
});

test('a fractional theme scale rounds up and never overflows', () => {
    for (const scale of [1.25, 1.5]) {
        for (const width of [600, 800, 1429, 1920, 3440]) {
            const layout = gridLayout(width, scale);
            assert.ok(layout.rowWidth <= layout.available, `scale ${scale} width ${width}: row ${layout.rowWidth} > ${layout.available}`);
            // the card still holds the minimum preview beside the chrome
            assert.ok(layout.cardWidth >= (PRESET_CARD_MIN_W - PRESET_CARD_CHROME) + layout.cardChrome,
                `scale ${scale} width ${width}: card ${layout.cardWidth} too narrow for chrome ${layout.cardChrome}`);
            assert.ok(layout.gap >= PRESET_CARD_GAP * scale);
            assert.ok(Number.isFinite(layout.cardWidth) && layout.cardWidth >= 1);
            assert.ok(layout.columns >= 1);
        }
    }
});

test('an unusable scale factor falls back to 1 instead of producing NaN', () => {
    for (const bad of [undefined, null, NaN, Infinity, -Infinity, 0, -2, '2']) {
        assert.deepEqual(gridLayout(900, bad), gridLayout(900, 1), `scale ${String(bad)}`);
    }
});

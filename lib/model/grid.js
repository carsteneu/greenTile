/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * responsive preset-card grid math over pure data (no Cinnamon imports). The
 * preset panel is a St/Clutter actor without CSS grid or flex, so the column
 * count, the equal card width and the row chunking are computed here from the
 * panel width — pure so the geometry is unit-testable without a widget
 * allocation (the test fake has none).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

/** Minimum card width that still shows a usable layout preview (px). */
var PRESET_CARD_MIN_W = 160;
/** Gap between cards, horizontally and between the rows (px). Mirrors the
 *  .gk-cards / .gk-card-row spacing in stylesheet.css — keep them equal. */
var PRESET_CARD_GAP = 14;
/** Panel inner padding left and right of the card area (px). */
var PRESET_GRID_PAD = 14;
/** Width reserved for the vertical scrollbar so a full row never overflows it
 *  (px; the panel's scroll view bar is ~21px while it is shown). */
var PRESET_SCROLLBAR = 21;
/** The .gk-panel 1px border on both sides (px) — it sits inside the panel width
 *  and takes room away from the card area. */
var PRESET_PANEL_BORDER = 2;
/** The card's own horizontal chrome at scale 1 (px): the 1px .gk-card border on
 *  both sides, the .gk-card-stripe and both .gk-card-box paddings. Mirror of
 *  panel.js's PRESET_CARD_CHROME_W (2 + 3 + 2 * PRESET_CARD_PAD) — keep them
 *  equal, the panel-card test pins the agreement. */
var PRESET_CARD_CHROME = 21;

/**
 * Every CSS px value above mirrors a stylesheet length, and St multiplies those
 * by the theme context's scale factor (HiDPI / fractional UI scaling) while
 * these constants do not scale. Without applying the factor the card row's
 * minimum grows past the panel's allocation at scale > 1 and St lays every child
 * out wider than the panel's own background (measured live, Mint 22.3/Cinnamon
 * 6.6.4: 1476 px of row in a 1429 px panel at scale 2).
 * A scale factor that is missing, non-finite or not positive means 1 — an old
 * Cinnamon without the property must not produce NaN geometry.
 * @param {any} scale raw scale factor
 * @returns {number}
 */
var gridScale = (scale) => (Number.isFinite(scale) && scale > 0 ? scale : 1);

/**
 * The CSS box metrics of the card grid at a theme scale factor. Each term is
 * rounded UP, so the computed card area can only ever come out smaller than the
 * real one — a sub-pixel of lost content width is cheaper than a row that
 * overflows the panel (St rounds the box spacing to whole pixels itself, so ceil
 * matches or exceeds what the layout really uses).
 * @param {number} scale theme scale factor
 * @returns {{ gap: number, pad: number, border: number, scrollbar: number, minCard: number, chrome: number }}
 */
var gridMetrics = (scale) => {
    const s = gridScale(scale);
    return {
        gap: Math.ceil(PRESET_CARD_GAP * s),
        pad: Math.ceil(PRESET_GRID_PAD * s),
        border: Math.ceil(PRESET_PANEL_BORDER * s),
        scrollbar: Math.ceil(PRESET_SCROLLBAR * s),
        // PRESET_CARD_MIN_W is NOT multiplied: the card's JS width does not scale
        // (measured: a card stays 160 px wide at scale 2). Only the chrome the
        // preview does not get grows, so the minimum keeps the same preview.
        minCard: Math.ceil((PRESET_CARD_MIN_W - PRESET_CARD_CHROME) + PRESET_CARD_CHROME * s),
        chrome: Math.ceil(PRESET_CARD_CHROME * s),
    };
};

/**
 * Card-area width inside a panel of the given width: the panel border, both
 * inner paddings and the reserved scrollbar are subtracted, each at the theme
 * scale factor. Never below one pixel, so an invalid width cannot produce a
 * zero/negative allocation.
 * @param {number} panelWidth
 * @param {number} [scale] theme scale factor, 1 when omitted
 * @returns {number}
 */
var gridAvailable = (panelWidth, scale = 1) => {
    if (!Number.isFinite(panelWidth)) {
        return 1;
    }
    const m = gridMetrics(scale);
    return Math.max(1, Math.floor(panelWidth) - m.border - 2 * m.pad - m.scrollbar);
};

/**
 * Number of card columns that fit: as many minimum-width cards (plus the gaps
 * between them) as the available width holds, at least one.
 * @param {number} available card-area width
 * @param {number} [minW] minimum card width
 * @param {number} [gap] gap between cards
 * @returns {number}
 */
var gridColumns = (available, minW = PRESET_CARD_MIN_W, gap = PRESET_CARD_GAP) => {
    if (!Number.isFinite(available) || available <= 0) {
        return 1;
    }
    return Math.max(1, Math.floor((available + gap) / (minW + gap)));
};

/**
 * Width of one card when `columns` share the available width: equal widths,
 * floored to whole pixels so a full row never overflows, at least one pixel.
 * A nonsensical column count is clamped to one.
 * @param {number} available card-area width
 * @param {number} columns
 * @param {number} [gap] gap between cards
 * @returns {number}
 */
var gridCardWidth = (available, columns, gap = PRESET_CARD_GAP) => {
    const cols = Number.isFinite(columns) ? Math.max(1, Math.floor(columns)) : 1;
    if (!Number.isFinite(available) || available <= 0) {
        return 1;
    }
    return Math.max(1, Math.floor((available - gap * (cols - 1)) / cols));
};

/**
 * The card layout of one panel at a theme scale factor: the card area, the
 * column count, the equal card width and the row's minimum width. This is the
 * one entry the panel uses, so scaled and unscaled terms cannot be mixed at a
 * call site; gridColumns/gridCardWidth stay the pure primitives it builds on.
 * @param {number} panelWidth
 * @param {number} [scale] theme scale factor, 1 when omitted
 * @returns {{ available: number, columns: number, cardWidth: number, gap: number, minCard: number, cardChrome: number, rowWidth: number }}
 */
var gridLayout = (panelWidth, scale = 1) => {
    const m = gridMetrics(scale);
    const available = gridAvailable(panelWidth, scale);
    const columns = gridColumns(available, m.minCard, m.gap);
    const cardWidth = gridCardWidth(available, columns, m.gap);
    return {
        available,
        columns,
        cardWidth,
        gap: m.gap,
        minCard: m.minCard,
        cardChrome: m.chrome,
        rowWidth: columns * cardWidth + (columns - 1) * m.gap,
    };
};

/**
 * Chunks the presets into rows of at most `columns` items; a short final row
 * keeps the leftovers in their order.
 * @param {any[]} items
 * @param {number} columns
 * @returns {any[][]}
 */
var gridRows = (items, columns) => {
    const cols = Number.isFinite(columns) ? Math.max(1, Math.floor(columns)) : 1;
    const list = Array.isArray(items) ? items : [];
    /** @type {any[][]} */
    const rows = [];
    for (let i = 0; i < list.length; i += cols) {
        rows.push(list.slice(i, i + cols));
    }
    return rows;
};

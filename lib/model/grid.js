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

/**
 * Card-area width inside a panel of the given width: the panel border, both
 * inner paddings and the reserved scrollbar are subtracted. Never below one
 * pixel, so an invalid width cannot produce a zero/negative allocation.
 * @param {number} panelWidth
 * @returns {number}
 */
var gridAvailable = (panelWidth) => {
    if (!Number.isFinite(panelWidth)) {
        return 1;
    }
    return Math.max(1, Math.floor(panelWidth) - PRESET_PANEL_BORDER - 2 * PRESET_GRID_PAD - PRESET_SCROLLBAR);
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

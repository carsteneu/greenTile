/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * gap model over pure data (no Cinnamon imports).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

// Gap between tiled windows (setting windowGap, set with − / + in the preset panel).
// Every side of a cell that borders another cell moves in by half the gap, so two
// neighbours end up exactly one gap apart; sides on the edge of the usable screen area
// stay flush — unless the screen-edge setting (edgeGap) moves them in. Edges are
// rounded before the insets, so fractional cell widths (1920/7) do not make the gaps
// drift.
/** Largest gap in px a stored value can reach. */
var GAP_MAX = 48;
/** Step in px the −/+ buttons in the preset panel change the gap by. */
var GAP_STEP = 2;
/** Largest distance in px a stored screen-edge value can reach. */
var EDGE_MAX = 48;
/** Step in px the −/+ buttons in the preset panel change the edge distance by. */
var EDGE_STEP = 1;
/**
 * Clamps a stored gap value to [0, GAP_MAX] rounded down to GAP_STEP; anything
 * non-finite becomes 0.
 * @param {any} v raw stored value, validated here
 * @returns {number}
 */
var gapValue = (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
        return 0;
    }
    const stepped = Math.floor(v / GAP_STEP) * GAP_STEP;
    return Math.min(Math.max(stepped, 0), GAP_MAX);
};
/**
 * Clamps a stored screen-edge distance to [0, EDGE_MAX] on EDGE_STEP; anything
 * non-finite becomes 0.
 * @param {any} v raw stored value, validated here
 * @returns {number}
 */
var edgeValue = (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
        return 0;
    }
    const stepped = Math.floor(v / EDGE_STEP) * EDGE_STEP;
    return Math.min(Math.max(stepped, 0), EDGE_MAX);
};
/**
 * Cell rectangle with half the gap inset on every side bordering another cell and
 * the edge distance inset on every side lying on the edge of the usable area. Edges
 * are rounded before the insets, so fractional cell widths do not make the gaps
 * drift.
 * @param {Rect} cell
 * @param {Rect} area
 * @param {number} gap
 * @param {number} [edge] distance to the area edge for the sides lying on it
 * @returns {Rect}
 */
var gapCell = (cell, area, gap, edge = 0) => {
    let left = Math.round(cell[0]);
    let top = Math.round(cell[1]);
    let right = Math.round(cell[0] + cell[2]);
    let bottom = Math.round(cell[1] + cell[3]);
    const [ax, ay, aw, ah] = area.map(Math.round);
    if (gap > 0) {
        const lead = Math.floor(gap / 2);
        const trail = gap - lead;
        if (Math.abs(left - ax) >= 1) {
            left += lead;
        }
        if (Math.abs(top - ay) >= 1) {
            top += lead;
        }
        if (Math.abs(right - (ax + aw)) >= 1) {
            right -= trail;
        }
        if (Math.abs(bottom - (ay + ah)) >= 1) {
            bottom -= trail;
        }
    }
    // The screen edge: a side that lies ON the area edge has no neighbour, so it takes
    // the edge distance instead of the gap. For a lone window this is the only inset it
    // ever gets (issue 4), and a cell that already moved in by the gap keeps its seam.
    if (edge > 0) {
        if (Math.abs(left - ax) < 1) {
            left += edge;
        }
        if (Math.abs(top - ay) < 1) {
            top += edge;
        }
        if (Math.abs(right - (ax + aw)) < 1) {
            right -= edge;
        }
        if (Math.abs(bottom - (ay + ah)) < 1) {
            bottom -= edge;
        }
    }
    // Bounded gap: the insets above can push a cell smaller than the gap past the
    // area edge (issue 12: a 10x10 area with a 48px gap put frames at x=27..32).
    // Where the area can hold a frame at all, clamp it back inside; the gap and the
    // edge distance simply give way. Frames are integers, so containment is measured
    // against the area's ceil/floor (identical to the exact bounds for the integer
    // usable areas in production). A degenerate axis (shorter than 1px) has no inside
    // to clamp to — the placement layer declines that case.
    const minX = Math.ceil(area[0]);
    const maxX = Math.floor(area[0] + area[2]);
    if (Number.isFinite(minX) && Number.isFinite(maxX) && maxX - minX >= 1) {
        left = Math.min(Math.max(left, minX), maxX - 1);
        right = Math.max(Math.min(right, maxX), left + 1);
    }
    const minY = Math.ceil(area[1]);
    const maxY = Math.floor(area[1] + area[3]);
    if (Number.isFinite(minY) && Number.isFinite(maxY) && maxY - minY >= 1) {
        top = Math.min(Math.max(top, minY), maxY - 1);
        bottom = Math.max(Math.min(bottom, maxY), top + 1);
    }
    return [left, top, Math.max(right - left, 1), Math.max(bottom - top, 1)];
};

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
// stay flush. Edges are rounded before the insets, so fractional cell widths
// (1920/7) do not make the gaps drift.
const GAP_MAX = 48;
const GAP_STEP = 2;
const gapValue = (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) {
        return 0;
    }
    const stepped = Math.floor(v / GAP_STEP) * GAP_STEP;
    return Math.min(Math.max(stepped, 0), GAP_MAX);
};
const gapCell = (cell, area, gap) => {
    let left = Math.round(cell[0]);
    let top = Math.round(cell[1]);
    let right = Math.round(cell[0] + cell[2]);
    let bottom = Math.round(cell[1] + cell[3]);
    if (gap > 0) {
        const lead = Math.floor(gap / 2);
        const trail = gap - lead;
        const [ax, ay, aw, ah] = area.map(Math.round);
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
    return [left, top, Math.max(right - left, 1), Math.max(bottom - top, 1)];
};

module.exports = {
    GAP_MAX,
    GAP_STEP,
    gapValue,
    gapCell,
};

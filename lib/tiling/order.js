/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * Reading-order sort over windows with the auto mode's sort-rect overrides
 * (set after an edge resize, used up by the next retile).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const { tile_sort_order } = require('./lib/model/split');

// Sort direction must match the target layout: column-major for the low-res
// column-stack, row-major for uniform grids — otherwise re-tiles shuffle
// windows between cells and manual arrangements do not survive. Grouping by overlap
// (tile_sort_order) keeps windows in their column/row with unequal borders too.
// app.auto carries the sort-rect overrides: stable sequence -> frame to sort by
// instead of the current one (set after an edge resize: the dragged window keeps
// the cell it was tiled into; used up by the next retile, ignored after 2000 ms
// when no retile came).
const tile_sort_reading_order = (app, windows, columnMajor) => {
    const GLib = imports.gi.GLib;
    const now = GLib.get_monotonic_time() / 1000;
    app.auto.sortPoll(now);
    const rects = windows.map((w) => {
        const rect = app.auto.sortTake(w.get_stable_sequence(), now);
        if (rect)
            return rect;
        const f = w.get_frame_rect();
        return [f.x, f.y, f.width, f.height];
    });
    return tile_sort_order(rects, columnMajor).map((i) => windows[i]);
};

module.exports = { tile_sort_reading_order };

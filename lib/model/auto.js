/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * auto model, extracted verbatim from the marked pure model block in
 * greenTile.js (no Cinnamon imports). Author of the model code: carsten_eu.
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

// Legacy per-workspace automatic tiling list "autoWorkspaces": rows
// { workspace: <number from 1, as shown in the panel>, auto: true | false }. The
// runtime reads its automatic tiling state from the "layouts" setting now; this block
// survives for the one-time migration, which still parses these rows (invalid rows
// ignored, with duplicates the last row wins).
const tile_auto_row_ok = (row) => row != null && typeof row === 'object'
    && Number.isInteger(row.workspace) && row.workspace >= 1 && typeof row.auto === 'boolean';
const tile_auto_list_map = (list) => {
    const map = {};
    if (!Array.isArray(list))
        return map;
    for (const row of list) {
        if (tile_auto_row_ok(row))
            map[row.workspace - 1] = row.auto;
    }
    return map;
};
const tile_auto_ws_active = (map, wsIndex, hasPreset) => {
    const value = map[wsIndex];
    return typeof value === 'boolean' ? value : hasPreset;
};
const tile_auto_list_set = (list, wsIndex, on) => {
    const rows = (Array.isArray(list) ? list : [])
        .filter((row) => tile_auto_row_ok(row) && row.workspace !== wsIndex + 1)
        .map((row) => ({ workspace: row.workspace, auto: row.auto }));
    rows.push({ workspace: wsIndex + 1, auto: on });
    return rows.sort((a, b) => a.workspace - b.workspace);
};

module.exports = {
    tile_auto_row_ok,
    tile_auto_list_map,
    tile_auto_ws_active,
    tile_auto_list_set,
};

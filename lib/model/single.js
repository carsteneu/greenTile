/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * single model, extracted verbatim from the marked pure model block in
 * greenTile.js (no Cinnamon imports). Author of the model code: carsten_eu.
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

// "Fill the monitor with a single window" (opt-in, default off): with automatic tiling
// or an assigned preset, a lone window is tiled over the whole usable area instead of
// being left untouched. tile_single_fill is the guard predicate for n windows under
// the option state; tile_single_layout is the layout behind a preset that has no rule
// for one window (a rule for n = 1 wins over it).
const tile_single_fill = (on, n) => on === true && n === 1;
const tile_single_layout = { kind: 'rows', shape: [1] };

module.exports = {
    tile_single_fill,
    tile_single_layout,
};

/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * single model over pure data (no Cinnamon imports).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

/**
 * "Fill the monitor with a single window" (opt-in, default off): with automatic tiling
 * or an assigned preset, a lone window is tiled over the whole usable area instead of
 * being left untouched. singleFill is the guard predicate for n windows under
 * the option state; singleLayout is the layout behind a preset that has no rule
 * for one window (a rule for n = 1 wins over it).
 * @param {boolean} on
 * @param {number} n
 * @returns {boolean}
 */
var singleFill = (on, n) => on === true && n === 1;
var singleLayout = Object.freeze({ kind: 'rows', shape: Object.freeze([1]) });


/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * Muffin grab-op classification for the auto-tiling drag observers.
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

// Muffin grab op number -> name (RESIZING_E, KEYBOARD_RESIZING_UNKNOWN, ...).
const tile_grab_op_name = (op) => {
    const Meta = imports.gi.Meta;
    return Object.keys(Meta.GrabOp).find((k) => Meta.GrabOp[k] === op) || '';
};
const tile_grab_is_resize = (op) => /RESIZING/.test(tile_grab_op_name(op));

module.exports = { tile_grab_op_name, tile_grab_is_resize };

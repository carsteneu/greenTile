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

// Auto-mode observer: re-tiles automatically on workspaces with automatic tiling on
// (Super+Ctrl+A on, Super+Ctrl+D off, per workspace) — with the runtime state as a
// per-App component in lib/runtime/auto.js (app.auto): debounce timers, pending
// sets, monitor maps, the workspace/window observers and the sort-rect overrides.
// Triggers: window added/removed on the active workspace (debounced 300ms) and
// manual window moves on release (grab-op-end, 250ms) — the moved window snaps
// into the grid slot nearest its drop position, manual arranging stays possible.
// Dialogs/popups never trigger (NORMAL type + wm_class checks, collector
// re-validates at run time). State is global across workspaces by design.
// Muffin grab op number -> name (RESIZING_E, KEYBOARD_RESIZING_UNKNOWN, ...).
const tile_grab_op_name = (op) => {
    const Meta = imports.gi.Meta;
    return Object.keys(Meta.GrabOp).find((k) => Meta.GrabOp[k] === op) || '';
};
const tile_grab_is_resize = (op) => /RESIZING/.test(tile_grab_op_name(op));

module.exports = { tile_grab_op_name, tile_grab_is_resize };

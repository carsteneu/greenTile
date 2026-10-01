/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * per-App focus bindings: Super+Arrow moves the keyboard focus on
 * monitor+workspaces where automatic tiling is on — the Meta custom bindings
 * are registered with the App's own keypress handler and reset to null on
 * destroy, which restores muffin's own handlers (verified: Super+Arrow tiles
 * natively again after that). The binding-name list is a frozen constant; the
 * keypress logic itself has no state of its own and comes in as the hotkey
 * dep, so the component only owns the registration lifecycle.
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const FOCUS_BINDING_PREFIX = 'push-tile-';
const FOCUS_BINDING_NAMES = Object.freeze([
    'push-tile-left',
    'push-tile-right',
    'push-tile-up',
    'push-tile-down',
]);

// deps: meta (imports.gi.Meta), hotkey ((app, dir) => focusHotkey
// from lib/tiling/focus-nav.js).
class Focus {
    constructor(deps) {
        this._meta = deps.meta;
        this._hotkey = deps.hotkey;
    }

    connect(app) {
        for (const name of FOCUS_BINDING_NAMES)
            this._meta.keybindings_set_custom_handler(name, this._hotkey(app, name.slice(FOCUS_BINDING_PREFIX.length)));
    }

    destroy() {
        for (const name of FOCUS_BINDING_NAMES)
            this._meta.keybindings_set_custom_handler(name, null);
    }
}

module.exports = { Focus };

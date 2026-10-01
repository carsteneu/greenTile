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

/**
 * Focus bindings owner: registers Meta custom handlers for the Super+Arrow
 * push-tile hotkeys with the App and frees them on destroy.
 * @typedef {Object} FocusDeps
 * @property {AnyRecord} meta imports.gi.Meta
 * @property {(app: AppFacade, dir: 'left' | 'right' | 'up' | 'down') => (display: AnyRecord, win: CinnamonWindow) => void} hotkey focusHotkey from lib/tiling/focus-nav.js; the names of FOCUS_BINDING_NAMES end in exactly these directions
 */
var Focus = class {
    /**
     * @param {FocusDeps} deps
     */
    constructor(deps) {
        this._meta = deps.meta;
        this._hotkey = deps.hotkey;
    }

    /**
     * Registers the custom handlers, one per push-tile binding name.
     * @param {AppFacade} app
     */
    connect(app) {
        for (const name of FOCUS_BINDING_NAMES) {
            // FOCUS_BINDING_NAMES is exactly the four focus directions (plus the
            // static prefix), so the slice is every valid MotionDirection key.
            this._meta.keybindings_set_custom_handler(name, this._hotkey(app, /** @type {'left' | 'right' | 'up' | 'down'} */ (name.slice(FOCUS_BINDING_PREFIX.length))));
        }
    }

    /** Restores muffin's own handlers by resetting the bindings to null. */
    destroy() {
        for (const name of FOCUS_BINDING_NAMES) {
            this._meta.keybindings_set_custom_handler(name, null);
        }
    }
};


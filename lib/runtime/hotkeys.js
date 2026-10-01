/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * per-App hotkey owner: registers the static 'greenTile-*' hotkeys on the
 * injected keybindingManager and removes exactly those 14 names idempotently.
 * register() always removes first, so a binding change arriving through
 * Config.EnableHotkey re-registers exactly once — WITHOUT touching the panel's
 * Escape hotkey, which the panel state owner binds and unbounds per open/close
 * (learning #95219: mid-life things keep explicit ids). Per-entry fault
 * tolerant: one failing removeHotKey must not skip the rest.
 * All Cinnamon access is injected (deps).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const HOTKEY_NAMES = Object.freeze([
    'greenTile-auto6', 'greenTile-auto3', 'greenTile-autoN', 'greenTile-autoOff',
    'greenTile-preset', 'greenTile-exclude',
    'greenTile-resize-wider', 'greenTile-resize-narrower', 'greenTile-resize-taller', 'greenTile-resize-shorter',
    'greenTile-swap-left', 'greenTile-swap-right', 'greenTile-swap-up', 'greenTile-swap-down',
]);

const PANEL_ESC_NAME = 'greenTile-panel-esc';

// deps: keybindingManager (Main.keybindingManager)
class Hotkeys {
    constructor(deps) {
        this._keybindingManager = deps.keybindingManager;
    }

    // bindings: [{ name, bindings, callback }] — the 14 static hotkeys with the
    // settings values and callbacks resolved at call time.
    register(bindings) {
        this.remove();
        for (const binding of bindings)
            this._keybindingManager.addHotKey(binding.name, binding.bindings, binding.callback);
    }

    // The settings-driven re-registration path (Config.EnableHotkey on every
    // binding change) touches ONLY the static names: the panel's Escape hotkey
    // is bound and unbound by the panel state owner per open/close and must
    // survive a re-registration while the list is open.
    remove() {
        for (const name of HOTKEY_NAMES) {
            try {
                this._keybindingManager.removeHotKey(name);
            }
            catch (e) {
                // binding was already gone
            }
        }
    }
}

module.exports = { Hotkeys, HOTKEY_NAMES, PANEL_ESC_NAME };

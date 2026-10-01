/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * per-App hotkey owner: registers the static 'greenTile-*' hotkeys on the
 * injected keybindingManager and removes every greenTile binding — the 14
 * settings-driven ones plus the panel's Escape hotkey — idempotently on
 * removal. register() always removes first, so a binding change arriving
 * through Config.EnableHotkey re-registers exactly once. Per-entry fault
 * tolerant: one failing removeHotKey must not skip the rest.
 * The Escape binding itself is owned by the panel state (bound and unbound
 * per panel open); the removal here is the destroy-path safety net.
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

    // Fixed name list, every one removed in its own try/catch: a binding that
    // is (already) gone must not keep the rest of the teardown from running.
    remove() {
        for (const name of [...HOTKEY_NAMES, PANEL_ESC_NAME]) {
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

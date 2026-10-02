/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * per-App focus bindings: Super+Arrow moves the keyboard focus on
 * monitor+workspaces where automatic tiling is on. push-tile-* are Cinnamon's
 * own builtin wm keybindings (org.cinnamon.desktop.keybindings.wm), so both
 * module generations register through the generation's builtin surface:
 *
 *  - 6.8-style (keybindingManager.setBuiltinHandler present): the manager
 *    route, so the shell's action-mode filter applies (default
 *    ActionMode.NORMAL — the hotkeys go quiet in overview/modal states) and
 *    the dispatcher entry is tracked for restore. The Meta action id for the
 *    binding name is resolved from Meta.KeyBindingAction at runtime; muffin
 *    lacking the enum member falls back to the direct path below.
 *  - 6.6 (no setBuiltinHandler): Meta.keybindings_set_custom_handler(name,
 *    handler) directly — mode filtering is not part of that surface.
 *
 * destroy() restores muffin's own handlers in both paths (verified on 6.6:
 * Super+Arrow tiles natively again afterwards): Meta handler back to null
 * plus removal of a manager dispatcher entry we registered. The binding-name
 * list is a frozen constant; the keypress logic itself has no state of its
 * own and comes in as the hotkey dep, so the component only owns the
 * registration lifecycle.
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

// 'push-tile-left' -> 'PUSH_TILE_LEFT' (Meta.KeyBindingAction member naming)
/**
 * @param {string} name
 * @returns {string}
 */
const actionEnumName = (name) => name.toUpperCase().replace(/-/g, '_');

/**
 * Focus bindings owner: registers the push-tile builtin handlers with the App
 * and restores muffin's own on destroy.
 * @typedef {Object} FocusDeps
 * @property {AnyRecord} meta imports.gi.Meta
 * @property {AnyRecord} [keybindingManager] imports.ui.main.keybindingManager — absent on the 6.6 fake surface
 * @property {(app: AppFacade, dir: 'left' | 'right' | 'up' | 'down') => (display: AnyRecord, win: CinnamonWindow) => void} hotkey focusHotkey from lib/tiling/focus-nav.js; the names of FOCUS_BINDING_NAMES end in exactly these directions
 */
var Focus = class {
    /**
     * @param {FocusDeps} deps
     */
    constructor(deps) {
        this._meta = deps.meta;
        this._manager = deps.keybindingManager || null;
        this._hotkey = deps.hotkey;
        /** @type {{ name: string, actionId: number, prior: any }[]} */
        this._managerRegistrations = [];
        /** @type {string[]} names WE overrode through the direct Meta path */
        this._metaNames = [];
    }

    /**
     * Registers the push-tile handlers, one per binding name, through the
     * generation's builtin surface.
     * @param {AppFacade} app
     */
    connect(app) {
        for (const name of FOCUS_BINDING_NAMES) {
            const dir = /** @type {'left' | 'right' | 'up' | 'down'} */ (name.slice(FOCUS_BINDING_PREFIX.length));
            const handler = this._hotkey(app, dir);
            const actionId = this._manager && this._manager.setBuiltinHandler
                ? this._meta.KeyBindingAction[actionEnumName(name)]
                : undefined;
            if (this._manager && this._manager.setBuiltinHandler && actionId !== undefined) {
                // save the rollback ownership BEFORE the registration call:
                // setBuiltinHandler may throw after mutating state, and a
                // partial connect must stay fully restorable by destroy()
                const prior = this._manager.bindings && this._manager.bindings.has(actionId)
                    ? this._manager.bindings.get(actionId)
                    : undefined;
                this._managerRegistrations.push({ name, actionId, prior });
                this._manager.setBuiltinHandler(name, actionId, handler);
            }
            else {
                this._metaNames.push(name);
                this._meta.keybindings_set_custom_handler(name, handler);
            }
        }
    }

    /**
     * Restores what WE acquired, completely:
     *  - manager route: a prior entry is re-entered through setBuiltinHandler
     *    itself — that reinstalls the Meta dispatcher AND the map entry with
     *    the prior callback and its action modes, so the prior binding stays
     *    reachable through the normal delivery path. Without a prior, the
     *    dispatcher we caused is cleared (Meta null) and our map entry
     *    removed.
     *  - direct Meta route (6.6 / enum-less muffin): only the names WE
     *    overrode are reset. Meta.keybindings_set_custom_handler has no
     *    getter counterpart, so a foreign direct handler that predated us
     *    cannot be discovered — the reachable restore target is muffin's
     *    builtin (documented platform limitation, not papered over).
     * Names never acquired by this instance are never touched.
     */
    destroy() {
        for (const { name, actionId, prior } of this._managerRegistrations) {
            // registrations only exist when the manager route was taken
            const manager = /** @type {NonNullable<FocusDeps["keybindingManager"]>} */ (this._manager);
            if (prior !== undefined) {
                manager.setBuiltinHandler(name, actionId, prior.callback, prior.allowedModes);
            }
            else {
                if (manager.bindings)
                    {manager.bindings.delete(actionId);}
                this._meta.keybindings_set_custom_handler(name, null);
            }
        }
        this._managerRegistrations = [];
        for (const name of this._metaNames) {
            this._meta.keybindings_set_custom_handler(name, null);
        }
        this._metaNames = [];
    }
};

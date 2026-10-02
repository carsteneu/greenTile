/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * per-App focus bindings: Super+Arrow moves the keyboard focus on
 * monitor+workspaces where automatic tiling is on. push-tile-* are Cinnamon's
 * own builtin wm keybindings (org.cinnamon.desktop.keybindings.wm), so both
 * module generations register through the generation's builtin surface:
 *
 *  - upstream (keybindingManager.setBuiltinHandler present and
 *    Meta.KeyBindingAction resolves the name): the manager route, so the
 *    shell's action-mode filter applies (default ActionMode.NORMAL — the
 *    hotkeys go quiet in overview/modal states) and the dispatcher entry is
 *    tracked for restore.
 *  - 6.6 / enum-less muffin (no setBuiltinHandler): the direct
 *    Meta.keybindings_set_custom_handler surface — mode filtering is not part
 *    of it.
 *
 * connect() records one registration per name BEFORE the acquisition call and
 * installs an own dispatcher that turns inert the moment destroy() starts, so
 * no failure anywhere in teardown can leave a live callback holding the
 * destroyed App. destroy() restores per registration — one throwing restore
 * never strands the remaining names — reports the combined failures to the
 * caller (Config.destroy logs them) and keeps the failed registrations so the
 * same instance can retry them. A restore that threw before taking effect also
 * has its own dispatcher entry dropped, so the next App's connect cannot adopt
 * our inert leftover as its rollback target.
 *
 * Restore target per route:
 *  - manager route: a prior entry is re-entered through setBuiltinHandler
 *    itself, which reinstalls the Meta dispatcher with the prior callback and
 *    its action modes. Without a prior, our map entry is removed and the Meta
 *    handler reset to muffin's builtin.
 *  - direct Meta route: only the names THIS instance overrode are reset to
 *    muffin's builtin. Meta.keybindings_set_custom_handler has no getter
 *    counterpart, so an unknown foreign direct handler that predated us cannot
 *    be discovered — a platform limitation, reported rather than papered over
 *    with an invented getter.
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
 * and restores the pre-connect owner on destroy.
 * @typedef {Object} FocusDeps
 * @property {AnyRecord} meta imports.gi.Meta
 * @property {AnyRecord} [keybindingManager] imports.ui.main.keybindingManager — absent on the 6.6 fake surface
 * @property {(app: AppFacade, dir: 'left' | 'right' | 'up' | 'down') => (display: AnyRecord, win: CinnamonWindow) => void} hotkey focusHotkey from lib/tiling/focus-nav.js; the names of FOCUS_BINDING_NAMES end in exactly these directions
 */

/**
 * One acquired binding.
 * @typedef {Object} FocusRegistration
 * @property {string} name binding name ('push-tile-left')
 * @property {number | undefined} actionId Meta.KeyBindingAction id; undefined on the direct Meta route
 * @property {AnyRecord | undefined} prior manager entry that was in place before we took over
 * @property {((display: AnyRecord, win: CinnamonWindow, binding?: AnyRecord) => void) | null} handler our live callback, dropped on destroy
 * @property {((display: AnyRecord, win: CinnamonWindow, binding: AnyRecord) => void) | null} install the dispatcher we handed to the shell — kept so a failed restore can tell our own leftover from a restored prior
 * @property {boolean} active false once destroy made the callback inert
 */

var Focus = class {
    /**
     * @param {FocusDeps} deps
     */
    constructor(deps) {
        this._meta = deps.meta;
        this._manager = deps.keybindingManager || null;
        this._hotkey = deps.hotkey;
        /** @type {FocusRegistration[]} */
        this._registrations = [];
    }

    /**
     * Registers the push-tile handlers, one per binding name, through the
     * generation's builtin surface. Re-entrant: an existing ownership is
     * released first, so a repeated connect never captures our own handler as
     * the rollback target (a failing release surfaces here).
     * @param {AppFacade} app
     */
    connect(app) {
        if (this._registrations.length)
            {this.destroy();}
        for (const name of FOCUS_BINDING_NAMES) {
            const dir = /** @type {'left' | 'right' | 'up' | 'down'} */ (name.slice(FOCUS_BINDING_PREFIX.length));
            /** @type {FocusRegistration} */
            const registration = {
                name,
                actionId: undefined,
                prior: undefined,
                handler: this._hotkey(app, dir),
                install: null,
                active: true,
            };
            const dispatch = (/** @type {AnyRecord} */ display, /** @type {CinnamonWindow} */ win, /** @type {AnyRecord} */ binding) => {
                const handler = registration.handler;
                if (registration.active && handler)
                    {handler(display, win, binding);}
            };
            const actionId = this._manager && this._manager.setBuiltinHandler
                ? this._meta.KeyBindingAction[actionEnumName(name)]
                : undefined;
            registration.install = dispatch;
            if (this._manager && this._manager.setBuiltinHandler && actionId !== undefined) {
                registration.actionId = actionId;
                // save the rollback ownership BEFORE the registration call:
                // setBuiltinHandler may throw after mutating state, and a
                // partial connect must stay fully restorable by destroy()
                registration.prior = this._manager.bindings && this._manager.bindings.has(actionId)
                    ? this._manager.bindings.get(actionId)
                    : undefined;
                this._registrations.push(registration);
                this._manager.setBuiltinHandler(name, actionId, dispatch);
            }
            else {
                this._registrations.push(registration);
                this._meta.keybindings_set_custom_handler(name, dispatch);
            }
        }
    }

    /**
     * Restores what WE acquired. Two stages, so a failure can never leave a
     * live own callback behind:
     *  1. make every own callback inert and drop its App closure — a binding
     *     whose restore then fails still delivers nothing;
     *  2. restore per registration, each in its own try, so one throwing
     *     restore never strands the remaining names. A failed registration
     *     keeps its ownership for a later retry and every failure is reported
     *     together.
     * A restore that never took effect would leave our own dispatcher sitting
     * in the manager's map, where the NEXT App's connect would adopt it as its
     * rollback target and the binding would stay dead for the session — so a
     * failed registration also drops that leftover (stage 3).
     */
    destroy() {
        for (const registration of this._registrations) {
            registration.active = false;
            registration.handler = null;
        }
        /** @type {string[]} */ const failures = [];
        /** @type {FocusRegistration[]} */ const unrestored = [];
        for (const registration of this._registrations) {
            try {
                this._restore(registration);
            }
            catch (e) {
                unrestored.push(registration);
                failures.push(registration.name + ': ' + (e instanceof Error ? e.message : String(e)));
                this._dropOwnLeftover(registration);
            }
        }
        this._registrations = unrestored;
        if (failures.length)
            {throw new Error('push-tile restore failed for ' + failures.length + ' binding(s) — ' + failures.join('; '));}
    }

    /**
     * Restores one acquired binding to its pre-connect owner.
     * @param {FocusRegistration} registration
     */
    _restore(registration) {
        const manager = this._manager;
        if (registration.actionId === undefined || manager === null) {
            this._meta.keybindings_set_custom_handler(registration.name, null);
            return;
        }
        if (registration.prior !== undefined) {
            manager.setBuiltinHandler(registration.name, registration.actionId, registration.prior.callback, registration.prior.allowedModes);
            return;
        }
        if (manager.bindings)
            {manager.bindings.delete(registration.actionId);}
        this._meta.keybindings_set_custom_handler(registration.name, null);
    }

    /**
     * A failed manager-route restore may have thrown before it took effect,
     * leaving OUR dispatcher (inert) in the manager's binding map. Remove it and
     * reset the Meta handler, so the binding falls back to muffin's builtin
     * instead of swallowing the key — and so a later App does not mistake our
     * leftover for foreign prior state. Only touches the entry when it is still
     * demonstrably ours; a restore that did mutate already holds the prior.
     * @param {FocusRegistration} registration
     */
    _dropOwnLeftover(registration) {
        const manager = this._manager;
        if (registration.actionId === undefined || manager === null || !manager.bindings || !registration.install)
            {return;}
        const entry = manager.bindings.get(registration.actionId);
        if (!entry || entry.callback !== registration.install)
            {return;}
        try {
            manager.bindings.delete(registration.actionId);
            this._meta.keybindings_set_custom_handler(registration.name, null);
        }
        catch (_e) {
            // the failure that got us here is already collected; dropping the
            // leftover is best effort and must not mask it
        }
    }
};

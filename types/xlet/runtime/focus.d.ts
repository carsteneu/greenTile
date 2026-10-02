// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
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
export const Focus: {
    new (deps: FocusDeps): {
        _meta: AnyRecord;
        _manager: any;
        _hotkey: (app: AppFacade, dir: "left" | "right" | "up" | "down") => (display: AnyRecord, win: CinnamonWindow) => void;
        /** @type {FocusRegistration[]} */
        _registrations: FocusRegistration[];
        /**
         * Registers the push-tile handlers, one per binding name, through the
         * generation's builtin surface. Re-entrant: an existing ownership is
         * released first, so a repeated connect never captures our own handler as
         * the rollback target (a failing release surfaces here).
         * @param {AppFacade} app
         */
        connect(app: AppFacade): void;
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
        destroy(): void;
        /**
         * Restores one acquired binding to its pre-connect owner.
         * @param {FocusRegistration} registration
         */
        _restore(registration: FocusRegistration): void;
        /**
         * A failed manager-route restore may have thrown before it took effect,
         * leaving OUR dispatcher (inert) in the manager's binding map. Remove it and
         * reset the Meta handler, so the binding falls back to muffin's builtin
         * instead of swallowing the key — and so a later App does not mistake our
         * leftover for foreign prior state. Only touches the entry when it is still
         * demonstrably ours; a restore that did mutate already holds the prior.
         * @param {FocusRegistration} registration
         */
        _dropOwnLeftover(registration: FocusRegistration): void;
    };
};
/**
 * Focus bindings owner: registers the push-tile builtin handlers with the App
 * and restores the pre-connect owner on destroy.
 */
export type FocusDeps = {
    /**
     * imports.gi.Meta
     */
    meta: AnyRecord;
    /**
     * imports.ui.main.keybindingManager — absent on the 6.6 fake surface
     */
    keybindingManager?: AnyRecord;
    /**
     * focusHotkey from lib/tiling/focus-nav.js; the names of FOCUS_BINDING_NAMES end in exactly these directions
     */
    hotkey: (app: AppFacade, dir: "left" | "right" | "up" | "down") => (display: AnyRecord, win: CinnamonWindow) => void;
};
/**
 * One acquired binding.
 */
export type FocusRegistration = {
    /**
     * binding name ('push-tile-left')
     */
    name: string;
    /**
     * Meta.KeyBindingAction id; undefined on the direct Meta route
     */
    actionId: number | undefined;
    /**
     * manager entry that was in place before we took over
     */
    prior: AnyRecord | undefined;
    /**
     * our live callback, dropped on destroy
     */
    handler: ((display: AnyRecord, win: CinnamonWindow, binding?: AnyRecord) => void) | null;
    /**
     * the dispatcher we handed to the shell — kept so a failed restore can tell our own leftover from a restored prior
     */
    install: ((display: AnyRecord, win: CinnamonWindow, binding: AnyRecord) => void) | null;
    /**
     * false once destroy made the callback inert
     */
    active: boolean;
};

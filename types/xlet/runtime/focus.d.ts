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
 * @property {((display: AnyRecord, win: CinnamonWindow, binding: AnyRecord) => void) | null} install the dispatcher we handed to the shell — kept so the manager-visible slot can be classified as ours
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
         *     restore never strands the remaining names.
         * A registration that failed is recovered (see _recover) and kept for a
         * retry, unless its slot went to a newer owner.
         */
        destroy(): void;
        /**
         * Classifies the manager-visible slot for one registration. That slot is
         * what a later App captures as its prior, so it decides whether there is
         * anything of ours left to release:
         *  - 'ours': still holds the dispatcher we installed
         *  - 'prior': already holds the entry we recorded before taking over
         *  - 'empty': nobody's
         *  - 'foreign': a newer owner registered after us — untouchable
         * The direct route has no comparable slot, so it reports 'ours' to keep its
         * own retry behaviour.
         * @param {FocusRegistration} registration
         * @returns {'ours' | 'prior' | 'empty' | 'foreign'}
         */
        _ownerState(registration: FocusRegistration): "ours" | "prior" | "empty" | "foreign";
        /**
         * Restores one acquired binding to its pre-connect owner.
         * @param {FocusRegistration} registration
         */
        _restore(registration: FocusRegistration): void;
        /**
         * Best-effort recovery after a restore threw, so the failure leaves as
         * little damage as the platform allows. The collected error from destroy()
         * already reports the throw; nothing here may replace it.
         * @param {FocusRegistration} registration
         */
        _recover(registration: FocusRegistration): void;
        /**
         * Attempts the Meta reset on its own, independent of any manager state, so
         * a dispatcher of ours can never keep swallowing the key just because the
         * binding-map entry is already gone.
         * @param {FocusRegistration} registration
         */
        _retryMetaReset(registration: FocusRegistration): void;
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
     * the dispatcher we handed to the shell — kept so the manager-visible slot can be classified as ours
     */
    install: ((display: AnyRecord, win: CinnamonWindow, binding: AnyRecord) => void) | null;
    /**
     * false once destroy made the callback inert
     */
    active: boolean;
};

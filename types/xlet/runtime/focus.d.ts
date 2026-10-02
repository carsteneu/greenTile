// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
/**
 * Focus bindings owner: registers the push-tile builtin handlers with the App
 * and restores muffin's own on destroy.
 * @typedef {Object} FocusDeps
 * @property {AnyRecord} meta imports.gi.Meta
 * @property {AnyRecord} [keybindingManager] imports.ui.main.keybindingManager — absent on the 6.6 fake surface
 * @property {(app: AppFacade, dir: 'left' | 'right' | 'up' | 'down') => (display: AnyRecord, win: CinnamonWindow) => void} hotkey focusHotkey from lib/tiling/focus-nav.js; the names of FOCUS_BINDING_NAMES end in exactly these directions
 */
export const Focus: {
    new (deps: FocusDeps): {
        _meta: AnyRecord;
        _manager: any;
        _hotkey: (app: AppFacade, dir: "left" | "right" | "up" | "down") => (display: AnyRecord, win: CinnamonWindow) => void;
        /** @type {{ name: string, actionId: number, prior: any }[]} */
        _managerRegistrations: {
            name: string;
            actionId: number;
            prior: any;
        }[];
        /** @type {string[]} names WE overrode through the direct Meta path */
        _metaNames: string[];
        /**
         * Registers the push-tile handlers, one per binding name, through the
         * generation's builtin surface.
         * @param {AppFacade} app
         */
        connect(app: AppFacade): void;
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
        destroy(): void;
    };
};
/**
 * Focus bindings owner: registers the push-tile builtin handlers with the App
 * and restores muffin's own on destroy.
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

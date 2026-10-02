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
        /** @type {[number][]} */
        _managerActionIds: [number][];
        /** @type {[number, any][]} */
        _managerPriors: [number, any][];
        /**
         * Registers the push-tile handlers, one per binding name, through the
         * generation's builtin surface.
         * @param {AppFacade} app
         */
        connect(app: AppFacade): void;
        /**
         * Restores muffin's own handlers: Meta handler back to null (both
         * generations); a manager dispatcher entry registered by us is removed —
         * or replaced by the foreign entry that occupied the action id before
         * our connect, if there was one.
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

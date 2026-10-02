// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
/**
 * Panel state deps.
 * @typedef {Object} PanelStateDeps
 * @property {AnyRecord} main imports.ui.main: keybindingManager, layoutManager
 * @property {AnyRecord} glib imports.gi.GLib: get_monotonic_time
 * @property {string} escName the Escape binding name, greenTile-panel-esc —
 * owned by lib/runtime/hotkeys.js
 */
export const PanelState: {
    new (deps: PanelStateDeps): {
        _main: AnyRecord;
        _glib: AnyRecord;
        _escName: string;
        /** @type {AnyRecord | null} */
        actor: AnyRecord | null;
        positioned: boolean;
        /** @type {Array<{ obj: AnyRecord, id: number }>} */
        sig: {
            obj: AnyRecord;
            id: number;
        }[];
        dragging: boolean;
        /** @type {'list' | 'editor'} */
        view: "list" | "editor";
        /** @type {AnyRecord | null} */
        draft: AnyRecord | null;
        guardUntil: number;
        escBound: boolean;
        /**
         * Double-click guard: right after a switch between list and editor, clicks are
         * swallowed in the capture phase for a moment (the guardUntil time).
         */
        guard(): void;
        /**
         * Closes the panel: unbinds the Escape hotkey, disconnects the signals and
         * removes the chrome actor. Per-entry fault tolerant: one failing
         * removeHotKey/disconnect must not skip the rest of the teardown.
         */
        close(): void;
    };
};
/**
 * Panel state deps.
 */
export type PanelStateDeps = {
    /**
     * imports.ui.main: keybindingManager, layoutManager
     */
    main: AnyRecord;
    /**
     * imports.gi.GLib: get_monotonic_time
     */
    glib: AnyRecord;
    /**
     * the Escape binding name, greenTile-panel-esc —
     * owned by lib/runtime/hotkeys.js
     */
    escName: string;
};

// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
export const HOTKEY_NAMES: readonly string[];
export const PANEL_ESC_NAME: string;
/**
 * Hotkey owner: registers and removes the 14 static 'greenTile-*' hotkeys on
 * the injected keybinding manager.
 * @typedef {Object} HotkeysDeps
 * @property {AnyRecord} keybindingManager Main.keybindingManager
 */
export const Hotkeys: {
    new (deps: HotkeysDeps): {
        _keybindingManager: AnyRecord;
        /**
         * Registers the 14 static hotkeys with the settings values and callbacks
         * resolved at call time, after removing the previous registration.
         * @param {Array<{ name: string, bindings: any, callback: () => void }>} bindings
         */
        register(bindings: Array<{
            name: string;
            bindings: any;
            callback: () => void;
        }>): void;
        /**
         * Removes the 14 static hotkeys idempotently. The settings-driven
         * re-registration path (Config.registerHotkeys on every binding change)
         * touches ONLY the static names: the panel's Escape hotkey is bound and
         * unbound by the panel state owner per open/close and must survive a
         * re-registration while the list is open.
         */
        remove(): void;
    };
};
/**
 * Hotkey owner: registers and removes the 14 static 'greenTile-*' hotkeys on
 * the injected keybinding manager.
 */
export type HotkeysDeps = {
    /**
     * Main.keybindingManager
     */
    keybindingManager: AnyRecord;
};

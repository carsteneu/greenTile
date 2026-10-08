// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
/**
 * Exclusions runtime owner: per-window toggles, exclusion rows and column
 * classes, the installed-changed re-resolution and the picker plumbing.
 * @typedef {Object} ExclusionsDeps
 * @property {AnyRecord} appSystem imports.gi.Cinnamon.AppSystem namespace
 * @property {AnyRecord} windowTracker imports.gi.Cinnamon.WindowTracker namespace
 * @property {AnyRecord} gio imports.gi.Gio, OSD icon
 * @property {AnyRecord} main imports.ui.main, osdWindowManager
 * @property {AnyRecord} global the global object
 * @property {() => CinnamonWindow | null} focusWindow focusWindow
 * @property {(app: AppFacade, monitorIndex: number, focused: CinnamonWindow | null, animate?: boolean, wsIndex?: number | null, actionLayout?: Layout | null, settle?: boolean) => void} retileMonitor retileMonitor
 * @property {(app: AppFacade) => void} retile exclRetile
 * @property {TranslateFn} translate _ gettext
 * @property {Map<number, boolean>} toggles session-owned Super+G toggles, seq -> true
 * @property {Map<number, { disconnect: () => void }>} watches session-owned per-window close watches
 */
export const Exclusions: {
    new (deps: ExclusionsDeps): {
        _deps: ExclusionsDeps;
        _appSystem: AnyRecord;
        _windowTracker: AnyRecord;
        _main: AnyRecord;
        _global: AnyRecord;
        toggled: Map<number, boolean>;
        _watches: Map<number, {
            disconnect: () => void;
        }>;
        /** @type {ExclRow[]} */ rows: ExclRow[];
        classes: any;
        _appSystemHandlerId: number;
        /** @type {any} */ _settings: any;
        /**
         * @param {CinnamonWindow | null} w
         * @returns {boolean}
         */
        isExcluded(w: CinnamonWindow | null): boolean;
        /**
         * StartupWMClass per app row, resolved once per apply (not per window per retile);
         * the value is null when AppSystem cannot resolve the rule text or the app declares
         * no StartupWMClass — those rows fall back to the id compare. Rebuilt with the rows
         * themselves on installed-changed.
         * @param {ExclRow[]} rows
         * @returns {Record<string, string | null>}
         */
        _appClasses(rows: ExclRow[]): Record<string, string | null>;
        /**
         * @param {SettingsFacade} settings
         */
        apply(settings: SettingsFacade): void;
        /**
         * The app picker combobox (SETTINGS_KEYS.excludeAppPicker): the dialog collects its options from
         * the settings file when it opens, so the extension writes them via the official
         * setOptions API at enable time and on AppSystem's installed-changed.
         * @param {SettingsFacade} settings
         */
        populate(settings: SettingsFacade): void;
        /**
         * Apply + populate up front, then the installed-changed handler that keeps
         * both fresh while this App lives.
         * @param {SettingsFacade} settings
         */
        start(settings: SettingsFacade): void;
        destroy(): void;
        /**
         * @param {number} seq
         */
        removeToggle(seq: number): void;
        /**
         * Keeps the close watch for one excluded window: when the window goes
         * away, its entry leaves the session state — closed windows never leak an
         * exclusion for later windows, beyond the auto-tracked set and on paused
         * workspaces alike. The handler closes over the session-owned maps only,
         * so it stays valid after the App that created it was destroyed.
         * @param {CinnamonWindow} w
         * @param {number} seq
         */
        _addCloseWatch(w: CinnamonWindow, seq: number): void;
        /**
         * @param {number} seq
         */
        _clearWatch(seq: number): void;
        /**
         * Picking an app appends the exclusion row and resets the combobox; setValue
         * alone would not fire the exclusions binding, so apply + retile run explicitly.
         * @param {SettingsFacade} settings
         * @param {AppFacade} app
         * @param {string} value
         */
        picked(settings: SettingsFacade, app: AppFacade, value: string): void;
        /**
         * Toggle exclusion for the focused window and retile its monitor, with an
         * OSD as feedback.
         * @param {AppFacade} app
         */
        toggleFocused(app: AppFacade): void;
    };
};
/**
 * Exclusions runtime owner: per-window toggles, exclusion rows and column
 * classes, the installed-changed re-resolution and the picker plumbing.
 */
export type ExclusionsDeps = {
    /**
     * imports.gi.Cinnamon.AppSystem namespace
     */
    appSystem: AnyRecord;
    /**
     * imports.gi.Cinnamon.WindowTracker namespace
     */
    windowTracker: AnyRecord;
    /**
     * imports.gi.Gio, OSD icon
     */
    gio: AnyRecord;
    /**
     * imports.ui.main, osdWindowManager
     */
    main: AnyRecord;
    /**
     * the global object
     */
    global: AnyRecord;
    /**
     * focusWindow
     */
    focusWindow: () => CinnamonWindow | null;
    /**
     * retileMonitor
     */
    retileMonitor: (app: AppFacade, monitorIndex: number, focused: CinnamonWindow | null, animate?: boolean, wsIndex?: number | null, actionLayout?: Layout | null, settle?: boolean) => void;
    /**
     * exclRetile
     */
    retile: (app: AppFacade) => void;
    /**
     * _ gettext
     */
    translate: TranslateFn;
    /**
     * session-owned Super+G toggles, seq -> true
     */
    toggles: Map<number, boolean>;
    /**
     * session-owned per-window close watches
     */
    watches: Map<number, {
        disconnect: () => void;
    }>;
};

// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
/**
 * Theme and accent runtime owner: stylesheet generation and theme/accent
 * probing and resolution.
 * @typedef {Object} ThemeDeps
 * @property {AnyRecord} st imports.gi.St
 * @property {AnyRecord} gio imports.gi.Gio
 * @property {AnyRecord} main imports.ui.main
 * @property {AnyRecord} global the global object
 * @property {AnyRecord} glib imports.gi.GLib
 * @property {AnyRecord} session the extension Session carrying the accent generation
 * sequence and the last-written stylesheet content
 * @property {() => string} nextAccentGen () => 'gk-acc<n>'
 * @property {() => AnyRecord | null} panelOpen () => app.panel.actor, null while no panel is open
 * @property {(app: AppFacade) => void} panelRebuild (app) => panelRebuild(app)
 */
/**
 * Config surface the theme reads and restyles through. init() gets the Config
 * itself, not the app: it runs inside the Config constructor, where the app's
 * config property is not assigned yet — it is set once the constructor finishes.
 * @typedef {Object} ThemeConfig
 * @property {SettingsFacade} settings
 * @property {AppFacade} app
 */
export const Theme: {
    new (deps: ThemeDeps): {
        _deps: ThemeDeps;
        _st: AnyRecord;
        _gio: AnyRecord;
        _main: AnyRecord;
        _global: AnyRecord;
        _glib: AnyRecord;
        _session: AnyRecord;
        /** @type {'dark' | 'light'} */ _theme: "dark" | "light";
        _config: ThemeConfig | null;
        _portal: any;
        _portalSig: number;
        _cinnamon: any;
        _cinnamonSig: number;
        _rgb: any;
        _stateRgb: any;
        _path: any;
        _themeObj: any;
        _themeSig: number;
        _gen: string;
        /** Resolved panel theme. */
        get theme(): "dark" | "light";
        /** Resolved accent color.
         * @returns {Rgb}
         */
        get rgb(): Rgb;
        /** Resolved state color, null until the first change.
         * @returns {Rgb | null}
         */
        get stateRgb(): Rgb | null;
        /** Current stylesheet generation class, '' while nothing is loaded. */
        get gen(): string;
        /**
         * Cairo colors for the current theme (thumbnails, painter's dashed outline
         * — everything the stylesheet does not cover).
         * @param {'thumb' | 'outline'} key
         * @returns {number[]}
         */
        cairo(key: "thumb" | "outline"): number[];
        panelClass(): string;
        /**
         * @param {ThemeConfig} config
         */
        init(config: ThemeConfig): void;
        /** Re-resolves theme and colors and rewrites the stylesheet when changed. */
        changed(): void;
        destroy(): void;
        /**
         * Probes the theme accent color with a temporary widget in the given
         * pseudo-class state. null when the probe cannot run.
         * @param {string} className
         * @param {string} pseudoClass
         * @returns {Rgb | null}
         */
        _probe(className: string, pseudoClass: string): Rgb | null;
        /**
         * @param {AnyRecord} theme the live St.Theme object
         * @param {string} path stylesheet path
         */
        _load(theme: AnyRecord, path: string): void;
        _unload(): void;
        _accentPath(): any;
        /**
         * @param {ThemeConfig} config
         */
        _apply(config: ThemeConfig): void;
    };
};
/**
 * Theme and accent runtime owner: stylesheet generation and theme/accent
 * probing and resolution.
 */
export type ThemeDeps = {
    /**
     * imports.gi.St
     */
    st: AnyRecord;
    /**
     * imports.gi.Gio
     */
    gio: AnyRecord;
    /**
     * imports.ui.main
     */
    main: AnyRecord;
    /**
     * the global object
     */
    global: AnyRecord;
    /**
     * imports.gi.GLib
     */
    glib: AnyRecord;
    /**
     * the extension Session carrying the accent generation
     * sequence and the last-written stylesheet content
     */
    session: AnyRecord;
    /**
     * () => 'gk-acc<n>'
     */
    nextAccentGen: () => string;
    /**
     * () => app.panel.actor, null while no panel is open
     */
    panelOpen: () => AnyRecord | null;
    /**
     * (app) => panelRebuild(app)
     */
    panelRebuild: (app: AppFacade) => void;
};
/**
 * Config surface the theme reads and restyles through. init() gets the Config
 * itself, not the app: it runs inside the Config constructor, where the app's
 * config property is not assigned yet — it is set once the constructor finishes.
 */
export type ThemeConfig = {
    settings: SettingsFacade;
    app: AppFacade;
};

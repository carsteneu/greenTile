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
 * @property {AnyRecord} byteArray imports.byteArray, fromString() = ByteArray
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
/**
 * One look request queued behind the asynchronous stylesheet write.
 * @typedef {Object} LookRequest
 * @property {string} css the generated stylesheet content for this look
 * @property {'dark' | 'light'} theme the resolved panel theme
 * @property {Rgb} base the resolved accent color
 * @property {Rgb} stateBase the resolved state color
 * @property {ThemeConfig} config
 */
export const Theme: {
    new (deps: ThemeDeps): {
        _deps: ThemeDeps;
        _st: AnyRecord;
        _gio: AnyRecord;
        _main: AnyRecord;
        _global: AnyRecord;
        _glib: AnyRecord;
        _byteArray: AnyRecord;
        /** @type {'dark' | 'light'} */ _theme: "dark" | "light";
        _config: ThemeConfig | null;
        _portal: any;
        _portalSig: number;
        _cinnamon: any;
        _cinnamonSig: number;
        _rgb: any;
        _stateRgb: Rgb | null;
        _path: any;
        _themeObj: any;
        _themeSig: number;
        _gen: string;
        _written: string;
        _loaded: string;
        _busy: boolean;
        _pending: {
            config: ThemeConfig;
            css: string;
            theme: "dark" | "light";
            base: any;
            stateBase: any;
        } | null;
        _destroyed: boolean;
        _deleteWhenDone: boolean;
        _directoryReady: boolean;
        _token: string;
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
         * Cairo colors for the current theme (thumbnails, painter's dashed outline, the
         * painter's handle ink — everything the stylesheet does not cover).
         * @param {'thumb' | 'outline' | 'panel'} key
         * @returns {number[]}
         */
        cairo(key: "thumb" | "outline" | "panel"): number[];
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
         * Loads the accent sheet on the live theme. St.Theme.load_stylesheet returns
         * a boolean (and may throw): a false return is a REFUSED load — the load is
         * then not recorded at all, so no generation class marks a sheet that is not
         * there and this Theme stays unloaded (a later changed() retries).
         * @param {AnyRecord} theme the live St.Theme object
         * @param {string} css the content that is now on disk at the stylesheet path
         * @returns {boolean} whether the sheet is loaded
         */
        _load(theme: AnyRecord, css: string): boolean;
        _unload(): void;
        _accentPath(): any;
        /**
         * @param {ThemeConfig} config
         * @param {'dark' | 'light'} theme the freshly resolved panel theme
         */
        _apply(config: ThemeConfig, theme: "dark" | "light"): void;
        /** Writes the pending request's css when needed; the newest request wins. */
        _drain(): void;
        /**
         * A settled write (or its failure): commit the look when this request is
         * still the newest, and on failure re-run the queue so a newer request wins.
         * @param {LookRequest} request
         * @param {any} error
         */
        _settle(request: LookRequest, error: any): void;
        /** Prepares the private (0700) cache directory once after a successful mkdir. */
        _mkdir(): void;
        /**
         * Starts the async bytes write of css to this Theme's file, user-only
         * (Gio.FileCreateFlags.PRIVATE) and replacing any previous content. No
         * Cancellable is passed: cancelling an in-flight replace may leave the
         * destination truncated. A construction throw is routed to done so the
         * queue never wedges.
         * @param {string} css
         * @param {(error: any) => void} done
         */
        _write(css: string, done: (error: any) => void): void;
        /**
         * Commits a persisted (or unchanged) look: theme class, colors, sheet
         * (re)load and the border and an open panel repaint. Only runs while this
         * component is alive — a write may settle after destroy(). A sheet the live
         * theme refuses is NOT committed (the panel is not restyled against a look
         * whose sheet is missing); the same-path reload already dropped the previous
         * sheet, and a later changed() retries.
         * @param {LookRequest} request
         */
        _commit(request: LookRequest): void;
        /** Best-effort async removal of this Theme's stylesheet file. */
        _deleteFile(): void;
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
     * imports.byteArray, fromString() = ByteArray
     */
    byteArray: AnyRecord;
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
/**
 * One look request queued behind the asynchronous stylesheet write.
 */
export type LookRequest = {
    /**
     * the generated stylesheet content for this look
     */
    css: string;
    /**
     * the resolved panel theme
     */
    theme: "dark" | "light";
    /**
     * the resolved accent color
     */
    base: Rgb;
    /**
     * the resolved state color
     */
    stateBase: Rgb;
    config: ThemeConfig;
};

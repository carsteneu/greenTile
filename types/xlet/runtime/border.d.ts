// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
/**
 * Focus border: a thin border around the newly focused tiled window in the
 * state color, pure keyboard feedback after a Super+Arrow focus move.
 */
/**
 * @typedef {Object} BorderDeps
 * @property {AnyRecord} st imports.gi.St
 * @property {AnyRecord} glib imports.gi.GLib
 * @property {AnyRecord} meta imports.gi.Meta
 * @property {AnyRecord} main imports.ui.main
 * @property {AnyRecord} global the global object
 * @property {() => Rgb | null} stateRgb () => the theme component's resolved state color
 * @property {(w: CinnamonWindow) => boolean} exclCheck (w) => app.excl.isExcluded(w)
 * @property {(app: AppFacade, monitorIndex: number, wsIndex: number) => { preset: Preset | null, auto: boolean }} layoutFor layoutFor
 * @property {(monitor: CinnamonMonitor, focus: CinnamonWindow | null, ws?: number) => CinnamonWindow[]} collectWindows (monitor, focus, ws) => collectWindows(app, monitor, focus, ws)
 */
export const Border: {
    new (deps: BorderDeps): {
        _deps: BorderDeps;
        _st: AnyRecord;
        _glib: AnyRecord;
        _meta: AnyRecord;
        _main: AnyRecord;
        _global: AnyRecord;
        _app: AppFacade | null;
        _actor: any;
        _flashWin: CinnamonWindow | null;
        /** @type {Array<{ win: CinnamonWindow, id: number }>} */ _winSig: {
            win: CinnamonWindow;
            id: number;
        }[];
        /** @type {Array<{ obj: AnyRecord, id: number }>} */ _sig: {
            obj: AnyRecord;
            id: number;
        }[];
        _timer: number;
        _style(): string;
        /**
         * the border is keyboard feedback, not a decoration: only the Super+Arrow focus move
         * shows it (flash), it switches itself off after a few seconds and any event that
         * makes the flashed window focusless or unmanaged hides it again
         */
        _armTimer(): void;
        _unbindFlash(): void;
        _rebindFlash(): void;
        /**
         * @param {AppFacade} app
         * @returns {boolean}
         */
        _settingOn(app: AppFacade): boolean;
        /**
         * Frame of win when the border may show for it on the active workspace,
         * null for unmanaged/hidden cases.
         * @param {AppFacade} app
         * @param {CinnamonWindow} win
         * @returns {AnyRecord | null}
         */
        _frame(app: AppFacade, win: CinnamonWindow): AnyRecord | null;
        /**
         * Creates the overlay actor once and binds the global focus/workspace
         * observers.
         * @param {AppFacade} app
         */
        init(app: AppFacade): void;
        /** Shows, moves or hides the border for the flashed window. */
        update(): void;
        /**
         * called from the focus hotkey only — this is what makes the border keyboard feedback
         * @param {CinnamonWindow} win
         */
        flash(win: CinnamonWindow): void;
        /** called by the theme component on every accent/state color change */
        restyle(): void;
        destroy(): void;
    };
};
export type BorderDeps = {
    /**
     * imports.gi.St
     */
    st: AnyRecord;
    /**
     * imports.gi.GLib
     */
    glib: AnyRecord;
    /**
     * imports.gi.Meta
     */
    meta: AnyRecord;
    /**
     * imports.ui.main
     */
    main: AnyRecord;
    /**
     * the global object
     */
    global: AnyRecord;
    /**
     * () => the theme component's resolved state color
     */
    stateRgb: () => Rgb | null;
    /**
     * (w) => app.excl.isExcluded(w)
     */
    exclCheck: (w: CinnamonWindow) => boolean;
    /**
     * layoutFor
     */
    layoutFor: (app: AppFacade, monitorIndex: number, wsIndex: number) => {
        preset: Preset | null;
        auto: boolean;
    };
    /**
     * (monitor, focus, ws) => collectWindows(app, monitor, focus, ws)
     */
    collectWindows: (monitor: CinnamonMonitor, focus: CinnamonWindow | null, ws?: number) => CinnamonWindow[];
};

// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
/**
 * Runtime lifecycle scope: one owner object per component. Per-entry fault
 * tolerance mirrors disconnectEach: one throwing release (signal already gone,
 * source already removed) must not skip the rest.
 */
/**
 * @typedef {Object} ScopeDeps
 * @property {AnyRecord} signalManager Cinnamon SignalManager instance, this scope alone
 * @property {AnyRecord} mainloop mainloop backend
 * @property {AnyRecord} [glib] imports.gi.GLib, needed only by scope-managed timeouts (sources/add/remove); scopes that only wire signals may omit it
 * @property {AnyRecord} [gobject] imports.gi.GObject, activates the scope's vendor guard for GObject targets
 */
export const Scope: {
    new (deps: ScopeDeps): {
        _signalManager: AnyRecord;
        _mainloop: AnyRecord;
        _glib: AnyRecord;
        _gobject: any;
        /** @type {Array<{ id: number, remove: () => void }>} */ _timers: {
            id: number;
            remove: () => void;
        }[];
        /** @type {Array<() => void>} */ _cleanups: (() => void)[];
        _destroyed: boolean;
        /**
         * @param {AnyRecord} obj
         * @param {string} sigName
         * @param {(...args: any[]) => void} callback
         * @param {AnyRecord} [bind]
         * @param {boolean} [force]
         */
        connect(obj: AnyRecord, sigName: string, callback: (...args: any[]) => void, bind?: AnyRecord, force?: boolean): any;
        /**
         * mainloop timer: fn's return value keeps the source alive, like the raw
         * timeout_add callback (truthy = repeat). A timer that stops untracks itself;
         * a throwing callback drops the source in GJS, so it untracks too before the
         * error rethrows (destroy() must not source_remove a dead id).
         * @param {number} ms
         * @param {() => any} fn
         * @returns {number} timer id
         */
        timeout(ms: number, fn: () => any): number;
        /**
         * GLib timer variant (priority, ms); fn returns GLib.SOURCE_REMOVE to stop.
         * @param {number} priority
         * @param {number} ms
         * @param {() => any} fn
         * @returns {number} timer id
         */
        timeoutGL(priority: number, ms: number, fn: () => any): number;
        /**
         * @param {() => void} fn
         */
        cleanup(fn: () => void): void;
        destroy(): void;
        /**
         * @param {number} id
         * @param {() => void} remove
         */
        _track(id: number, remove: () => void): void;
        /**
         * @param {number} id
         */
        _untrack(id: number): void;
        _checkAlive(): void;
    };
};
export function createScope(deps: ScopeDeps): {
    _signalManager: AnyRecord;
    _mainloop: AnyRecord;
    _glib: AnyRecord;
    _gobject: any;
    /** @type {Array<{ id: number, remove: () => void }>} */ _timers: {
        id: number;
        remove: () => void;
    }[];
    /** @type {Array<() => void>} */ _cleanups: (() => void)[];
    _destroyed: boolean;
    /**
     * @param {AnyRecord} obj
     * @param {string} sigName
     * @param {(...args: any[]) => void} callback
     * @param {AnyRecord} [bind]
     * @param {boolean} [force]
     */
    connect(obj: AnyRecord, sigName: string, callback: (...args: any[]) => void, bind?: AnyRecord, force?: boolean): any;
    /**
     * mainloop timer: fn's return value keeps the source alive, like the raw
     * timeout_add callback (truthy = repeat). A timer that stops untracks itself;
     * a throwing callback drops the source in GJS, so it untracks too before the
     * error rethrows (destroy() must not source_remove a dead id).
     * @param {number} ms
     * @param {() => any} fn
     * @returns {number} timer id
     */
    timeout(ms: number, fn: () => any): number;
    /**
     * GLib timer variant (priority, ms); fn returns GLib.SOURCE_REMOVE to stop.
     * @param {number} priority
     * @param {number} ms
     * @param {() => any} fn
     * @returns {number} timer id
     */
    timeoutGL(priority: number, ms: number, fn: () => any): number;
    /**
     * @param {() => void} fn
     */
    cleanup(fn: () => void): void;
    destroy(): void;
    /**
     * @param {number} id
     * @param {() => void} remove
     */
    _track(id: number, remove: () => void): void;
    /**
     * @param {number} id
     */
    _untrack(id: number): void;
    _checkAlive(): void;
};
export type ScopeDeps = {
    /**
     * Cinnamon SignalManager instance, this scope alone
     */
    signalManager: AnyRecord;
    /**
     * mainloop backend
     */
    mainloop: AnyRecord;
    /**
     * imports.gi.GLib, needed only by scope-managed timeouts (sources/add/remove); scopes that only wire signals may omit it
     */
    glib?: AnyRecord;
    /**
     * imports.gi.GObject, activates the scope's vendor guard for GObject targets
     */
    gobject?: AnyRecord;
};

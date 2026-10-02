// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
/**
 * Monitor registry owner: stable per-monitor keys and display labels.
 * @typedef {Object} MonitorsDeps
 * @property {AnyRecord} main imports.ui.main
 * @property {AnyRecord} gio imports.gi.Gio
 * @property {AnyRecord} meta imports.gi.Meta
 * @property {AnyRecord} global the global object
 * @property {AnyRecord} session the extension Session carrying the fallback-logged flag
 */
export const Monitors: {
    new (deps: MonitorsDeps): {
        _main: AnyRecord;
        _gio: AnyRecord;
        _meta: AnyRecord;
        _global: AnyRecord;
        _session: AnyRecord;
        _registry: any;
        _cancellable: any;
        _muffinSettings: any;
        /** @type {string[]} */ keys: string[];
        /** @type {string[]} */ labels: string[];
        ready: boolean;
        /**
         * Rebuilds keys and labels from the current DisplayConfig state and the
         * layout manager monitors, asynchronously.
         * @param {() => void} onReady
         */
        refresh(onReady: () => void): void;
        /**
         * The epoch guard invalidates pending replies, the cancellable is the
         * second line of teardown.
         */
        destroy(): void;
        _cancelCurrent(): void;
        /**
         * Cached muffin schema: 'workspaces-only-on-primary' shapes the workspace
         * part of every layout key.
         * @returns {boolean}
         */
        onlyPrimary(): boolean;
        /**
         * Workspace key for a layout lookup: numbered on the primary monitor (and
         * always when workspaces-only-on-primary is off), '*' for every other
         * monitor when the setting is on.
         * @param {number} monitorIndex
         * @param {number} wsIndex
         * @returns {string}
         */
        wsKey(monitorIndex: number, wsIndex: number): string;
    };
};
/**
 * Monitor registry owner: stable per-monitor keys and display labels.
 */
export type MonitorsDeps = {
    /**
     * imports.ui.main
     */
    main: AnyRecord;
    /**
     * imports.gi.Gio
     */
    gio: AnyRecord;
    /**
     * imports.gi.Meta
     */
    meta: AnyRecord;
    /**
     * the global object
     */
    global: AnyRecord;
    /**
     * the extension Session carrying the fallback-logged flag
     */
    session: AnyRecord;
};

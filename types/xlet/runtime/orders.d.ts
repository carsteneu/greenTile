// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
export const ORDER_WRITE_MS: number;
export const ORDER_DIR: string;
export const ORDER_FILE: string;
/**
 * @typedef {Object} OrdersDeps
 * @property {AnyRecord} glib imports.gi.GLib (get_user_runtime_dir, build_filenamev, mkdir_with_parents)
 * @property {AnyRecord} gio imports.gi.Gio (File.new_for_path, query_info, FileCreateFlags, FileQueryInfoFlags, FileType)
 * @property {{ toString(bytes: Uint8Array): string, fromString(text: string): Uint8Array }} byteArray imports.byteArray
 * @property {AnyRecord} mainloop imports.mainloop (timeout_add, source_remove)
 * @property {AnyRecord} global the Cinnamon global object
 * @property {(msg: string) => void} log
 */
export const Orders: {
    new (deps: OrdersDeps): {
        _glib: AnyRecord;
        _gio: AnyRecord;
        _byteArray: {
            toString(bytes: Uint8Array): string;
            fromString(text: string): Uint8Array;
        };
        _mainloop: AnyRecord;
        _global: AnyRecord;
        _log: (msg: string) => void;
        _runtimeDir: string | null;
        _snapshot: {
            v: number;
            s: Record<string, string[]>;
        } | null;
        _store: {
            v: number;
            s: Record<string, string[]>;
        } | {
            v: any;
            s: {};
        };
        _timer: number;
        _destroyed: boolean;
        _corruptLogged: boolean;
        /**
         * The directory the store lives in, or null when there is no per-session
         * runtime dir to put it in.
         * @returns {string | null}
         */
        _resolveRuntimeDir(): string | null;
        /** @returns {string} the order file path (built from the runtime dir, never from file content). */
        _path(): string;
        /** @returns {string} the directory the order file lives in. */
        _dir(): string;
        /**
         * Reads and parses the file once. A missing file is an empty store; unreadable
         * or foreign content is ignored (logged once) and treated as empty, so tiling
         * never depends on the file's state.
         * @returns {{ v: number, s: Record<string, string[]> } | null}
         */
        _read(): {
            v: number;
            s: Record<string, string[]>;
        } | null;
        /**
         * Logs a rejected file once per store. A file that is not this code's own is
         * never an error that could break tiling: it is ignored and reported.
         * @param {string} why
         */
        _ignore(why: string): void;
        /** Arms (or re-arms) the coalesced write. */
        _schedule(): void;
        /**
         * Writes the whole store, atomically and privately. A failure (no runtime dir,
         * read-only home, full disk) is logged and swallowed; the store keeps the
         * latest order, so a later placement that changes it self-heals.
         */
        _flush(): void;
        /**
         * The stored order for a (monitor, workspace) surface, for the FIRST retile of
         * that surface since enable — null afterwards, and null when there is none.
         * Resolving against the App's monitors keeps the key identical to the one
         * record() writes.
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {number} wsIndex
         * @returns {string[] | null}
         */
        restore(app: AppFacade, monitorIndex: number, wsIndex: number): string[] | null;
        /**
         * Records the order a placement produced. Only windows with an X11
         * description count (a Wayland window has none), and fewer than two leaves no
         * order to restore. An unchanged order writes nothing. A FIRST placement that
         * holds fewer than two windows keeps the stored order: that set can still be
         * opening after a restart.
         *
         * Two callers exist and they differ in what they teach the store:
         * - `explicit` (a swap, or the drag-and-drop that placed the window the user
         *   moved): the placement IS the user's arrangement, so it is recorded and the
         *   surface's pending restore is closed — a later retile must not undo it.
         * - otherwise the retile placed the surface's windows by their live positions,
         *   which after a restart are the ones Muffin scrambled them into. That is no
         *   order to learn from while the surface's stored one is still waiting to be
         *   restored (a background workspace retiled by an exclusion toggle): writing it
         *   would destroy exactly the order the restore is for.
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {number} wsIndex
         * @param {CinnamonWindow[]} ordered the windows in placement order
         * @param {boolean} [explicit] the placement came from a user arrangement
         */
        record(app: AppFacade, monitorIndex: number, wsIndex: number, ordered: CinnamonWindow[], explicit?: boolean): void;
        /**
         * Stops the debounce timer after flushing the pending write: the last
         * placement before a teardown is not lost.
         */
        destroy(): void;
    };
};
export type OrdersDeps = {
    /**
     * imports.gi.GLib (get_user_runtime_dir, build_filenamev, mkdir_with_parents)
     */
    glib: AnyRecord;
    /**
     * imports.gi.Gio (File.new_for_path, query_info, FileCreateFlags, FileQueryInfoFlags, FileType)
     */
    gio: AnyRecord;
    /**
     * imports.byteArray
     */
    byteArray: {
        toString(bytes: Uint8Array): string;
        fromString(text: string): Uint8Array;
    };
    /**
     * imports.mainloop (timeout_add, source_remove)
     */
    mainloop: AnyRecord;
    /**
     * the Cinnamon global object
     */
    global: AnyRecord;
    log: (msg: string) => void;
};

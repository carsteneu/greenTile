// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
export const ORDER_WRITE_MS: number;
export const ORDER_DIR: string;
export const ORDER_FILE: string;
/**
 * @typedef {Object} OrdersDeps
 * @property {AnyRecord} glib imports.gi.GLib (get_user_runtime_dir, build_filenamev, mkdir_with_parents)
 * @property {AnyRecord} gio imports.gi.Gio (File.new_for_path, FileCreateFlags)
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
        _snapshot: {
            v: number;
            s: Record<string, string[]>;
        } | null;
        _store: {
            v: number;
            s: Record<string, string[]>;
        };
        _timer: number;
        _destroyed: boolean;
        _corruptLogged: boolean;
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
         * order to restore. An unchanged order writes nothing.
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {number} wsIndex
         * @param {CinnamonWindow[]} ordered the windows in placement order
         */
        record(app: AppFacade, monitorIndex: number, wsIndex: number, ordered: CinnamonWindow[]): void;
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
     * imports.gi.Gio (File.new_for_path, FileCreateFlags)
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

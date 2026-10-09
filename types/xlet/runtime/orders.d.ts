// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
export const ORDER_WRITE_MS: number;
export const ORDER_DIR: string;
export const ORDER_FILE: string;
export const ORDER_DIR_MODE: number;
export function isExistsError(gio: AnyRecord, error: any): boolean;
/**
 * @typedef {Object} OrdersDeps
 * @property {AnyRecord} glib imports.gi.GLib (get_user_runtime_dir, build_filenamev, Bytes, PRIORITY_DEFAULT)
 * @property {AnyRecord} gio imports.gi.Gio (File.new_for_path, query_info_async, load_contents_async, replace_contents_bytes_async, make_directory_async, set_attributes_async, FileInfo, FileCreateFlags, FileQueryInfoFlags, FileType, IOErrorEnum, io_error_quark)
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
        /** @type {{ v: number, s: Record<string, string[]> }} */
        _store: {
            v: number;
            s: Record<string, string[]>;
        };
        ready: boolean;
        /**
         * Callbacks waiting for the store to be known, released once by _loaded.
         * @type {Array<() => void>}
         */
        _readyCbs: (() => void)[];
        _dirty: boolean;
        _timer: number;
        _destroyed: boolean;
        _corruptLogged: boolean;
        _earlyLogged: boolean;
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
         * Reads and parses the file once, asynchronously. A missing file is an empty
         * store; unreadable or foreign content is ignored (logged once) and treated as
         * empty, so tiling never depends on the file's state. EVERY exit path resolves
         * the store: the settle fan-out waits for `ready` (lib/runtime/auto.js) and must
         * never wait forever.
         */
        _load(): void;
        /**
         * The content half of the read: its callback keeps the second size check the
         * synchronous version had (the file can grow between the query and the read) and
         * then parses.
         * @param {any} file
         */
        _loadContents(file: any): void;
        /**
         * The read settled: publish the snapshot, merge whatever this run recorded while
         * the read was in flight, and release everyone waiting for the store.
         * @param {{ v: number, s: Record<string, string[]> } | null} store
         */
        _loaded(store: {
            v: number;
            s: Record<string, string[]>;
        } | null): void;
        /**
         * Runs cb once the store is known — immediately when it already is. One-shot, and
         * a destroyed store releases nobody: that is what keeps a deferred retile off a
         * torn-down App.
         * @param {() => void} cb
         */
        onReady(cb: () => void): void;
        /**
         * Logs a rejected file once per store. A file that is not this code's own is
         * never an error that could break tiling: it is ignored and reported.
         * @param {string} why
         */
        _ignore(why: string): void;
        /** Arms (or re-arms) the coalesced write. */
        _schedule(): void;
        /**
         * Writes the whole store, privately and replacing any previous content. A failure
         * (no runtime dir, read-only home, full disk) is logged and swallowed; the store
         * keeps the latest order, so a later placement that changes it self-heals. The
         * directory is prepared first and the write is chained to it, both asynchronously.
         */
        _flush(): void;
        /**
         * Prepares the private (0700) directory, then hands over to the write. An existing
         * directory is the normal case — the finish reports EXISTS — and is not a failure;
         * any other error means the store has nowhere to go, so the write is skipped (the
         * next placement retries it) instead of stamping a file into a missing directory.
         * @param {() => void} done
         */
        _makeDir(done: () => void): void;
        /**
         * Applies the private (0700) mode — make_directory_async takes no mode — and hands
         * over to the write. A failure is logged and swallowed: the write reports the real
         * error on the next placement.
         * @param {any} file
         * @param {() => void} done
         */
        _setDirMode(file: any, done: () => void): void;
        /** The write half: the whole store, user-only (PRIVATE), atomically replacing the file. */
        _write(): void;
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
         * - `explicit` (a swap, an edge resize, or the drag-and-drop that placed the
         *   window the user moved): the placement IS the user's arrangement, so it is
         *   recorded and the surface's pending restore is closed — a later retile must
         *   not undo it.
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
     * imports.gi.GLib (get_user_runtime_dir, build_filenamev, Bytes, PRIORITY_DEFAULT)
     */
    glib: AnyRecord;
    /**
     * imports.gi.Gio (File.new_for_path, query_info_async, load_contents_async, replace_contents_bytes_async, make_directory_async, set_attributes_async, FileInfo, FileCreateFlags, FileQueryInfoFlags, FileType, IOErrorEnum, io_error_quark)
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

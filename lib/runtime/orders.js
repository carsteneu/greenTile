/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * Restart-order runtime: the small file-backed store of per-surface window
 * orders (monitor key + workspace key -> X11 window descriptions) that survives
 * a Cinnamon restart. A Cinnamon restart on X11 re-manages the existing X11
 * windows (their descriptions survive) while Muffin moves them around before
 * greenTile loads, so the startup retile would otherwise re-derive the order
 * from the scrambled positions. The store is written after every placement and
 * consumed once per surface by the first retile after enable.
 *
 * The file lives in the user's runtime dir (wiped at logout, exactly the needed
 * lifetime) and is untrusted input: reads tolerate anything, writes are
 * debounced, atomic for local files (Gio.replace_contents writes a temp file and
 * renames it into place) and private (0600 file, 0700 dir). No failure may reach
 * the tiling path — every error is logged and swallowed.
 *
 * All Cinnamon access is injected (deps): glib (imports.gi.GLib), gio
 * (imports.gi.Gio), byteArray (imports.byteArray), mainloop (imports.mainloop),
 * global and log. Read through the app parameter: app.monitors (the surface
 * keys) and app.session.orderUsed (the per-surface first-use gate).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const XLET = imports.extensions['greenTile@carsteneu'];

const { orderKey, orderParse, orderGet, orderSet } = XLET.lib.model['window-order'];

// Placements happen often (window-added bursts, held resize keys, drops); the
// write is coalesced so the runtime file sees at most one write per idle second.
var ORDER_WRITE_MS = 1000;
var ORDER_DIR = 'greenTile@carsteneu';
var ORDER_FILE = 'order.json';

/**
 * @typedef {Object} OrdersDeps
 * @property {AnyRecord} glib imports.gi.GLib (get_user_runtime_dir, build_filenamev, mkdir_with_parents)
 * @property {AnyRecord} gio imports.gi.Gio (File.new_for_path, FileCreateFlags)
 * @property {{ toString(bytes: Uint8Array): string, fromString(text: string): Uint8Array }} byteArray imports.byteArray
 * @property {AnyRecord} mainloop imports.mainloop (timeout_add, source_remove)
 * @property {AnyRecord} global the Cinnamon global object
 * @property {(msg: string) => void} log
 */
var Orders = class {
    /**
     * @param {OrdersDeps} deps
     */
    constructor(deps) {
        this._glib = deps.glib;
        this._gio = deps.gio;
        this._byteArray = deps.byteArray;
        this._mainloop = deps.mainloop;
        this._global = deps.global;
        this._log = deps.log;
        // The store as the file had it when this App was built: the restore side
        // reads ONLY this, so a placement of THIS run can never become a "restored"
        // order for a surface that has not been retiled yet.
        this._snapshot = this._read();
        // The mutable store the record side writes back (seeded from the snapshot).
        this._store = this._snapshot || { v: 1, s: {} };
        this._timer = 0;
        this._destroyed = false;
        this._corruptLogged = false;
    }

    /** @returns {string} the order file path (built from the runtime dir, never from file content). */
    _path() {
        return this._glib.build_filenamev([this._glib.get_user_runtime_dir(), ORDER_DIR, ORDER_FILE]);
    }

    /** @returns {string} the directory the order file lives in. */
    _dir() {
        return this._glib.build_filenamev([this._glib.get_user_runtime_dir(), ORDER_DIR]);
    }

    /**
     * Reads and parses the file once. A missing file is an empty store; unreadable
     * or foreign content is ignored (logged once) and treated as empty, so tiling
     * never depends on the file's state.
     * @returns {{ v: number, s: Record<string, string[]> } | null}
     */
    _read() {
        /** @type {string | null} */
        let text = null;
        try {
            const file = this._gio.File.new_for_path(this._path());
            const [ok, bytes] = file.load_contents(null);
            text = ok && bytes ? this._byteArray.toString(bytes) : null;
        }
        catch (e) {
            this._log('greenTile window-order read failed: ' + e);
            return null;
        }
        if (text === null) {
            return null;
        }
        const store = orderParse(text);
        if (store === null && !this._corruptLogged) {
            this._corruptLogged = true;
            this._log('greenTile window-order file is not valid greenTile data, ignored');
        }
        return store;
    }

    /** Arms (or re-arms) the coalesced write. */
    _schedule() {
        if (this._timer) {
            this._mainloop.source_remove(this._timer);
        }
        this._timer = this._mainloop.timeout_add(ORDER_WRITE_MS, () => {
            this._timer = 0;
            if (!this._destroyed) {
                this._flush();
            }
            return false;
        });
    }

    /**
     * Writes the whole store, atomically and privately. A failure (no runtime dir,
     * read-only home, full disk) is logged and swallowed; the store keeps the
     * latest order, so a later placement that changes it self-heals.
     */
    _flush() {
        if (this._timer) {
            try {
                this._mainloop.source_remove(this._timer);
            }
            catch (_e) {
                // the source was already gone
            }
            this._timer = 0;
        }
        try {
            if (this._glib.mkdir_with_parents(this._dir(), 0o700) < 0) {
                this._log('greenTile window-order dir could not be created');
                return;
            }
            const bytes = this._byteArray.fromString(JSON.stringify(this._store));
            this._gio.File.new_for_path(this._path()).replace_contents(bytes, null, false,
                this._gio.FileCreateFlags.PRIVATE | this._gio.FileCreateFlags.REPLACE_DESTINATION, null);
        }
        catch (e) {
            this._log('greenTile window-order write failed: ' + e);
        }
    }

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
    restore(app, monitorIndex, wsIndex) {
        try {
            const mkey = app.monitors.keys[monitorIndex];
            if (!mkey) {
                return null;
            }
            const key = orderKey(mkey, app.monitors.wsKey(monitorIndex, wsIndex));
            const used = app.session.orderUsed;
            if (used.has(key)) {
                return null;
            }
            used.add(key);
            const ids = orderGet(this._snapshot, key);
            if (ids) {
                this._global.log('greenTile restart order used ws' + (wsIndex + 1) + ' mon=' + mkey);
            }
            return ids;
        }
        catch (e) {
            this._log('greenTile window-order restore failed: ' + e);
            return null;
        }
    }

    /**
     * Records the order a placement produced. Only windows with an X11
     * description count (a Wayland window has none), and fewer than two leaves no
     * order to restore. An unchanged order writes nothing.
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} wsIndex
     * @param {CinnamonWindow[]} ordered the windows in placement order
     */
    record(app, monitorIndex, wsIndex, ordered) {
        if (this._destroyed) {
            return;
        }
        try {
            const mkey = app.monitors.keys[monitorIndex];
            if (!mkey) {
                return;
            }
            /** @type {unknown[]} */
            const ids = [];
            for (const w of ordered) {
                let desc = null;
                try {
                    desc = w.get_description();
                }
                catch (_e) {
                    desc = null;
                }
                ids.push(desc);
            }
            const key = orderKey(mkey, app.monitors.wsKey(monitorIndex, wsIndex));
            const next = orderSet(this._store, key, ids);
            if (JSON.stringify(next) === JSON.stringify(this._store)) {
                return;
            }
            this._store = next;
            this._schedule();
        }
        catch (e) {
            this._log('greenTile window-order record failed: ' + e);
        }
    }

    /**
     * Stops the debounce timer after flushing the pending write: the last
     * placement before a teardown is not lost.
     */
    destroy() {
        this._destroyed = true;
        if (this._timer) {
            this._flush();
        }
        this._timer = 0;
    }
};

/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * runtime lifecycle scope: one owner object per component. Signals ride on an
 * injected Cinnamon SignalManager instance that must belong to THIS scope alone
 * (destroy releases everything the manager holds, there is no selective
 * mid-life disconnect — plan component signal lifecycles accordingly), mainloop/
 * GLib timers are tracked and removed on release, extra cleanup callbacks run
 * in reverse order. Used by later loops to give App-owned components an
 * explicit destroy() path.
 * Per entry fault tolerant (tile_disconnect_each semantics): timer removals,
 * signal releases and cleanups are each attempted in their own try/catch —
 * including per signal, because SignalManager.disconnectAllSignals releases
 * the storage in ONE throw-propagating loop (js/misc/signalManager.js); the
 * storage reset afterwards is best-effort and may leave entries when a
 * disconnect reports a stale connection. Note: SignalManager dedupes connects
 * on (sigName, obj, callback) — a second identical connect is a silent no-op.
 * GObjects follow the vendor _signalIsConnected guard: finalized objects and
 * already-released ids are skipped instead of touched (optional dep gobject =
 * imports.gi.GObject).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

// Per-entry fault tolerance mirrors tile_disconnect_each: one throwing release
// (signal already gone, source already removed) must not skip the rest.
class Scope {
    constructor(deps) {
        this._signalManager = deps.signalManager;
        this._mainloop = deps.mainloop;
        this._glib = deps.glib;
        this._gobject = deps.gobject || null;
        this._timers = [];
        this._cleanups = [];
        this._destroyed = false;
    }

    connect(obj, sigName, callback, bind, force) {
        this._checkAlive();
        return this._signalManager.connect(obj, sigName, callback, bind, force);
    }

    // mainloop timer: fn's return value keeps the source alive, like the raw
    // timeout_add callback (truthy = repeat). A timer that stops untracks itself;
    // a throwing callback drops the source in GJS, so it untracks too before the
    // error rethrows (destroy() must not source_remove a dead id).
    timeout(ms, fn) {
        this._checkAlive();
        let id;
        id = this._mainloop.timeout_add(ms, () => {
            let result;
            try {
                result = fn();
            }
            catch (e) {
                this._untrack(id);
                throw e;
            }
            if (!result)
                this._untrack(id);
            return result;
        });
        this._track(id, () => this._mainloop.source_remove(id));
        return id;
    }

    // GLib timer variant (priority, ms); fn returns GLib.SOURCE_REMOVE to stop.
    timeoutGL(priority, ms, fn) {
        this._checkAlive();
        let id;
        id = this._glib.timeout_add(priority, ms, () => {
            let result;
            try {
                result = fn();
            }
            catch (e) {
                this._untrack(id);
                throw e;
            }
            if (!result)
                this._untrack(id);
            return result;
        });
        this._track(id, () => this._glib.Source.remove(id));
        return id;
    }

    cleanup(fn) {
        this._checkAlive();
        this._cleanups.push(fn);
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        const timers = this._timers;
        this._timers = [];
        for (const timer of timers) {
            try {
                timer.remove();
            }
            catch (e) {
                // source was already gone
            }
        }
        // Release the raw signal ids off a snapshot: delegating to SignalManager
        // disconnect would (a) drop same-(sigName,obj) storage entries without
        // releasing them and (b) silently skip plain JS objects without
        // signalHandlerIsConnected (_signalIsConnected) — either way the signal
        // stays live. Direct obj.disconnect per entry is the only reliable
        // release; a misbehaving target is contained per entry. GObjects get the
        // vendor _signalIsConnected guard: a finalized GObject (MetaWindowActor
        // destroyed in muffin) logs CJS finalized-object warnings when touched
        // and a released id logs GLib warnings — try/catch does neither.
        for (const [, obj, , id] of this._signalManager.getSignals().slice()) {
            if (typeof obj.is_finalized === 'function' && obj.is_finalized())
                continue;
            if (typeof obj.is_finalized === 'function' && this._gobject
                && !this._gobject.signal_handler_is_connected(obj, id))
                continue;
            try {
                obj.disconnect(id);
            }
            catch (e) {
                // signal was already gone
            }
        }
        try {
            this._signalManager.disconnectAllSignals();
        }
        catch (e) {
            // best-effort storage reset: a target that throws here (stale
            // connection report) leaves entries behind — the scope is dead
            // afterwards either way (every mutation method throws)
        }
        for (let i = this._cleanups.length - 1; i >= 0; i--) {
            try {
                this._cleanups[i]();
            }
            catch (e) {
                // cleanup was already gone
            }
        }
        this._cleanups = [];
    }

    _track(id, remove) {
        this._timers.push({ id, remove });
    }

    _untrack(id) {
        const at = this._timers.findIndex((timer) => timer.id === id);
        if (at !== -1)
            this._timers.splice(at, 1);
    }

    _checkAlive() {
        if (this._destroyed)
            throw new Error('greenTile scope destroyed');
    }
}

const createScope = (deps) => new Scope(deps);

module.exports = {
    Scope,
    createScope,
};

/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * runtime lifecycle scope: one owner object per component. Signals ride on an
 * injected Cinnamon SignalManager instance, mainloop/GLib timers are tracked
 * and removed on release, extra cleanup callbacks run in reverse order. Used
 * by later loops to give App-owned components an explicit destroy() path.
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
        this._timers = [];
        this._cleanups = [];
        this._destroyed = false;
    }

    connect(obj, sigName, callback, bind, force) {
        return this._signalManager.connect(obj, sigName, callback, bind, force);
    }

    // mainloop timer: fn's return value keeps the source alive, like the raw
    // timeout_add callback (truthy = repeat). A timer that stops untracks itself.
    timeout(ms, fn) {
        let id;
        id = this._mainloop.timeout_add(ms, () => {
            const result = fn();
            if (!result)
                this._untrack(id);
            return result;
        });
        this._track(id, () => this._mainloop.source_remove(id));
        return id;
    }

    // GLib timer variant (priority, ms); fn returns GLib.SOURCE_REMOVE to stop.
    timeoutGL(priority, ms, fn) {
        let id;
        id = this._glib.timeout_add(priority, ms, () => {
            const result = fn();
            if (!result)
                this._untrack(id);
            return result;
        });
        this._track(id, () => this._glib.Source.remove(id));
        return id;
    }

    cleanup(fn) {
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
        try {
            this._signalManager.disconnectAllSignals();
        }
        catch (e) {
            // one broken disconnect must not skip the cleanups
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
}

const createScope = (deps) => new Scope(deps);

module.exports = {
    Scope,
    createScope,
};

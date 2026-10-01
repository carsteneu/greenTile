/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * extension session: enable() creates ONE Session, disable() destroys it. The
 * session carries everything that must outlive an App recreation — the
 * monitors-changed handler (on its own runtime Scope), the settle wait
 * (pending/timer/started) and the monitor-fallback-logged flag — and owns the
 * App create/recreate/destroy flow. All Cinnamon access is injected (deps or
 * callables); the SignalManager must belong to THIS scope alone.
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const { createScope } = require('./lib/runtime/scope');

// Settle wait after a monitor change: Muffin can take several seconds to move windows
// to their new monitors. The retile runs once, 2 s after the last monitor change or
// window-entered-monitor event, at the latest 15 s after the first change. The timer
// is managed as an explicit id (not on the scope): it is replaced and removed
// mid-life, which the scope's release-everything model does not support.
class Settle {
    // deps: mainloop (mainloop backend), now (clock, Date.now in production),
    // log (global.log), onSettled (the fanned-out retile, tile_auto_schedule_all)
    constructor(deps) {
        this._mainloop = deps.mainloop;
        this._now = deps.now;
        this._log = deps.log;
        this._onSettled = deps.onSettled;
        this._timer = 0;
        this.pending = false;
        this.started = 0;
    }

    start(app) {
        const now = this._now();
        if (!this.started)
            this.started = now;
        const delay = Math.max(Math.min(2000, 15000 - (now - this.started)), 1);
        if (this._timer)
            this._mainloop.source_remove(this._timer);
        this._timer = this._mainloop.timeout_add(delay, () => {
            this._timer = 0;
            const elapsed = this._now() - this.started;
            this.started = 0;
            this._onSettled(app);
            this._log('greenTile monitors settled after ' + elapsed + ' ms');
            return false;
        });
    }

    // A monitor change destroys the App while the settle wait may be running; keep its
    // start time then, so the 15 s limit counts from the first change, not the last.
    teardown() {
        if (this._timer) {
            this._mainloop.source_remove(this._timer);
            this._timer = 0;
        }
        if (!this.pending)
            this.started = 0;
    }

    // Config boot after an App recreation: the wait restarts once for the change that
    // routed through the recreation.
    consumePending(app) {
        if (this.pending) {
            this.pending = false;
            this.start(app);
        }
    }

    destroy() {
        this.teardown();
        this.pending = false;
        this.started = 0;
    }
}

// deps: signalManager (fresh, this scope alone), layoutManager (Main.layoutManager),
// mainloop, gobject (imports.gi.GObject, activates the scope's vendor guard for
// GObject targets), now, log, onSettled, createApp(session) -> { destroy(), ... }
class Session {
    constructor(deps) {
        this._deps = deps;
        this._scope = createScope({
            signalManager: deps.signalManager,
            mainloop: deps.mainloop,
            gobject: deps.gobject,
        });
        this.settle = new Settle({
            mainloop: deps.mainloop,
            now: deps.now,
            log: deps.log,
            onSettled: deps.onSettled,
        });
        this.monitorFallbackLogged = false;
        // "layouts corrupt" splits log-once flag: session lifetime, survives App
        // recreations (same class as monitorFallbackLogged — the split flush reads
        // and resets it, see lib/runtime/split.js).
        this.splitCorruptLogged = false;
        this.app = null;
        this._destroyed = false;
    }

    start() {
        this.app = this._deps.createApp(this);
        this._scope.connect(this._deps.layoutManager, 'monitors-changed', () => {
            // Muffin moves windows asynchronously; the recreation is the mechanism
            // every per-App component rides, so the flag is set before the App dies
            // (settle teardown keeps its start time while pending).
            this.settle.pending = true;
            this.app.destroy();
            this.app = this._deps.createApp(this);
        });
    }

    destroy() {
        if (this._destroyed)
            return;
        this._destroyed = true;
        // The handler goes first, as in the original disable: GJS only logs a
        // throwing app.destroy(), but a still-connected monitors-changed handler
        // would resurrect an App inside a disabled extension (the gTile zombie).
        // The scope releases it, so app.destroy()'s fate must not matter — the
        // finally clears the rest regardless.
        this._scope.destroy();
        try {
            if (this.app)
                this.app.destroy();
        }
        finally {
            this.settle.destroy();
            this.app = null;
        }
    }
}

module.exports = {
    Session,
    Settle,
};

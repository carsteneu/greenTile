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

const XLET = imports.extensions['greenTile@carsteneu'];

const { createScope } = XLET.lib.runtime.scope;

/**
 * Settle wait after a monitor change: Muffin can take several seconds to move windows
 * to their new monitors. The retile runs once, 2 s after the last monitor change or
 * window-entered-monitor event, at the latest 15 s after the first change. The timer
 * is managed as an explicit id (not on the scope): it is replaced and removed
 * mid-life, which the scope's release-everything model does not support.
 * @typedef {Object} SettleDeps
 * @property {AnyRecord} mainloop mainloop backend
 * @property {() => number} now clock, Date.now in production
 * @property {(msg: string) => void} log global.log
 * @property {(app: AppFacade) => void} onSettled the fanned-out retile, autoScheduleAll
 * @property {(app: AppFacade) => boolean} isLive whether that App is still the live one
 */
var Settle = class {
    /**
     * @param {SettleDeps} deps
     */
    constructor(deps) {
        this._mainloop = deps.mainloop;
        this._now = deps.now;
        this._log = deps.log;
        this._onSettled = deps.onSettled;
        this._isLive = deps.isLive;
        this._timer = 0;
        this.pending = false;
        this.started = 0;
    }

    /**
     * @param {AppFacade} app
     */
    start(app) {
        const now = this._now();
        if (!this.started) {
            this.started = now;
        }
        const delay = Math.max(Math.min(2000, 15000 - (now - this.started)), 1);
        if (this._timer) {
            this._mainloop.source_remove(this._timer);
        }
        this._timer = this._mainloop.timeout_add(delay, () => {
            this._timer = 0;
            const elapsed = this._now() - this.started;
            this.started = 0;
            // The App may have been rolled back in the meantime (its asynchronous
            // start failed): settling for it would retile into a torn-down App, so
            // the wait expires silently — the next App owes the wait (pending).
            if (!this._isLive(app)) {
                this._log('greenTile settle wait for a rolled back app expired after ' + elapsed + ' ms');
                return false;
            }
            this._onSettled(app);
            this._log('greenTile monitors settled after ' + elapsed + ' ms');
            return false;
        });
    }

    /**
     * A monitor change destroys the App while the settle wait may be running; keep its
     * start time then, so the 15 s limit counts from the first change, not the last.
     */
    teardown() {
        if (this._timer) {
            this._mainloop.source_remove(this._timer);
            this._timer = 0;
        }
        if (!this.pending) {
            this.started = 0;
        }
    }

    /**
     * Config boot after an App recreation: the wait restarts once for the change that
     * routed through the recreation.
     * @param {AppFacade} app
     */
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
};

/**
 * Session owner: runs the App create/recreate/destroy flow and carries what
 * must outlive an App recreation. Deps are all injected: signalManager (fresh,
 * this scope alone), layoutManager (Main.layoutManager), mainloop, gobject
 * (imports.gi.GObject, activates the scope's vendor guard for GObject targets),
 * now, log, onSettled, createApp.
 * @typedef {Object} SessionDeps
 * @property {AnyRecord} signalManager fresh, this scope alone
 * @property {AnyRecord} layoutManager Main.layoutManager
 * @property {AnyRecord} mainloop mainloop backend
 * @property {AnyRecord} gobject imports.gi.GObject
 * @property {() => number} now clock, Date.now in production
 * @property {(msg: string) => void} log global.log
 * @property {(app: AppFacade) => void} onSettled the fanned-out retile, autoScheduleAll
 * @property {(session: Session) => { destroy(): void }} createApp builds the App on this session
 */
var Session = class {
    /**
     * @param {SessionDeps} deps
     */
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
            isLive: (app) => this._isLive(app),
        });
        // The App a failed start rolled back: its shell stays referenced so the
        // session has one owner until the next recreation, but it is not live.
        /** @type {AppFacade | null} */
        this._rolledBack = null;
        this.monitorFallbackLogged = false;
        // Auto on/off commands the hotkeys accepted before the monitor registry
        // was ready: they carry no layout key yet, so they are queued here (the
        // session outlives an App recreation) and applied by Auto.applyPending
        // in the monitor-ready callback — never reported as done before they are
        // written. At most one intent per monitor+workspace (the newest wins), so
        // a held hotkey cannot grow the queue. An intent whose monitor is gone by
        // the time the registry is ready is dropped — there is no key to address
        // it. Cleared on session destroy; never persisted.
        /** @type {Array<{monitorIndex: number, wsIndex: number, auto: boolean}>} */
        this.pendingAuto = [];
        // "layouts corrupt" splits log-once flag: session lifetime, survives App
        // recreations (same class as monitorFallbackLogged — the split flush reads
        // and resets it, see lib/runtime/split.js).
        this.splitCorruptLogged = false;
        // "layouts corrupt" write-guard log-once flag: session lifetime, survives
        // App recreations — layoutSet and presetsDelete share it
        // (same class as monitorFallbackLogged).
        this.layoutsWriteGuardLogged = false;
        // Accent stylesheet generation sequence: Cinnamon's St keeps its interned
        // theme nodes across load/unload_stylesheet, so a rebuilt panel would get
        // the node computed with the OLD sheet unless every load takes a fresh
        // 'gk-acc<n>' class. Seeded with the clock ONCE per enable and incremented
        // from there, the sequence grows monotonically across App recreations
        // within THIS session (only this session's theme nodes can clash); a
        // re-enable starts again from a fresh Date.now() seed.
        this.accentGenSeq = deps.now();
        // Last written accent stylesheet content. It lives here, one level above
        // the theme component, so an identical CSS compares equal across App
        // recreations and no redundant file write happens (the module-scope
        // string this replaces had exactly that per-session lifetime).
        this.accentCss = '';
        // The preset panel's saved position: the user dragged the panel there and
        // it must survive an App recreation (monitors-changed) — an enable starts
        // without one. Written by the panel open/drag paths in lib/ui/panel.js,
        // re-validated against the current monitors on every open.
        this.panelSaved = null;
        // Super+G ad-hoc exclusions ride the session: their documented lifetime
        // ("until pressed again or the window closes", FEATURES.md) outlives an
        // App recreation — toggles map (seq -> true) plus the per-window close
        // watches that remove the entry when its window goes away. Cleared on
        // session destroy; never persisted.
        this.exclToggles = new Map();
        this.exclWatches = new Map();
        /** @type {any} */ this.app = null;
        this._destroyed = false;
    }

    /**
     * The next accent generation class for the theme component's stylesheet load.
     */
    nextAccentGen() {
        return 'gk-acc' + (++this.accentGenSeq);
    }

    /** Creates the App and connects the monitors-changed recreate handler. */
    start() {
        this.app = this._deps.createApp(this);
        this._scope.connect(this._deps.layoutManager, 'monitors-changed', () => {
            // Muffin moves windows asynchronously; the recreation is the mechanism
            // every per-App component rides, so the flag is set before the App dies
            // (settle teardown keeps its start time while pending).
            this.settle.pending = true;
            // The running wait belonged to the App that is going away: stop its
            // timer here (the App teardown no longer owns the session's wait), the
            // fresh App arms it again through consumePending.
            this.settle.teardown();
            // A failed destruction dies into the finally: the session must never
            // keep the half-destroyed App, the next monitor change retries from
            // a clean null.
            if (this.app) {
                try {
                    this.app.destroy();
                }
                finally {
                    this.app = null;
                    this._rolledBack = null;
                }
            }
            // A createApp failure rolls its own acquisitions back (Config) and
            // rethrows: GJS logs it, this.app stays null until the next change.
            this.app = this._deps.createApp(this);
        });
    }

    /**
     * Whether that App is the live, fully started one — a rolled back shell is not.
     * @param {AppFacade} app
     */
    _isLive(app) {
        return app === this.app && !this._destroyed && app !== this._rolledBack;
    }

    /**
     * Rolls back an App whose asynchronous start failed: the observer set, the
     * hotkeys and the timers of a half-started App must not outlive their use — a
     * hotkey that addresses a registry nobody watches, a settle wait that would
     * retile into a torn-down App, a registry that still reports ready. The App's
     * resources go and its registry flag is cleared, whatever failed (observers,
     * a queued auto command, the settle wait).
     *
     * Synchronous by design: the caller is the monitor-ready reply, which ends
     * with this callback (Monitors.refresh calls onReady as its last statement),
     * so nothing of that component runs after the App is torn down.
     *
     * The App SHELL stays referenced until the next recreation, so the session has
     * a single owner for it and no dangling timer holds a freed object; it is
     * inert — its hotkeys are unregistered, its handlers released, its registry
     * flag cleared, and its settle wait expires silently (Settle.isLive).
     * @param {AppFacade} app
     */
    rollbackApp(app) {
        if (!app || app !== this.app || this._destroyed || app === this._rolledBack) {
            return;
        }
        // The registry flag is part of what the App reports as started; the
        // monitors component has no reset of its own and is owned elsewhere, so the
        // lifecycle owner clears the public flag here (clearing keys is not needed:
        // every consumer gates on `ready` first).
        app.monitors.ready = false;
        try {
            app.destroy();
        }
        catch (e) {
            this._deps.log('greenTile app rollback failed: ' + e);
        }
        this._rolledBack = app;
    }

    destroy() {
        if (this._destroyed) {
            return;
        }
        this._destroyed = true;
        // The handler goes first, as in the original disable: GJS only logs a
        // throwing app.destroy(), but a still-connected monitors-changed handler
        // would resurrect an App inside a disabled extension (the gTile zombie).
        // The scope releases it, so app.destroy()'s fate must not matter — the
        // finally clears the rest regardless.
        this._scope.destroy();
        try {
            if (this.app) {
                this.app.destroy();
            }
        }
        finally {
            this.settle.destroy();
            this.app = null;
            this._rolledBack = null;
            this.pendingAuto = [];
            this._releaseExclusions();
        }
    }

    /** Session teardown is also the end of the exclusion lifetime. */
    _releaseExclusions() {
        for (const watch of this.exclWatches.values()) {
            try {
                watch.disconnect();
            }
            catch (_e) {
                // the window was already gone
            }
        }
        this.exclWatches.clear();
        this.exclToggles.clear();
    }
};

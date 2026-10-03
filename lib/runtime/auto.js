/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * per-App auto-tiling observer: the per-monitor debounce timers, the fresh-
 * window pending sets, the monitor maps, the workspace/window observers and
 * the sort-rect overrides a resize or swap leaves for the next retile. Owned
 * by the App (monitors-changed destroys the App) and destroyed in the
 * autoDisconnectAll slot of Config.destroy, in the same order: timers
 * removed, maps cleared, drop.stop(), sort overrides cleared, exclusion
 * toggles cleared, workspaces disconnected, global signals disconnected,
 * tracked windows untracked.
 * The global signals are connected on the component's own runtime Scope (App
 * lifetime). The workspace window-added/removed handlers are dropped and
 * reconnected mid-life (notify::n-workspaces) and the per-monitor debounce
 * timers are replaced on reschedule — both keep explicit id lists / a timer
 * Map instead of the scope (no selective mid-life disconnect). Split, drop,
 * border and exclusion runtime comes in as injected deps. All Cinnamon access
 * is injected.
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const XLET = imports.extensions['greenTile@carsteneu'];

const { createScope } = XLET.lib.runtime.scope;
const { disconnectEach } = XLET.lib.model.teardown;

// sortRectOverride on this component: stable sequence -> frame to sort by
// instead of the current one (set after an edge resize or a swap: the dragged window
// keeps the cell it was tiled into; used up by the next retile, ignored after
// SORT_OVERRIDE_MS when no retile came)
const SORT_OVERRIDE_MS = 2000;

// deps: mainloop (imports.mainloop), meta (imports.gi.Meta), main
// (imports.ui.main), global (the global object), signalManager (fresh, this
// scope alone), gobject (imports.gi.GObject, activates the scope's GObject
// guard), focusWindow (focusWindow), focusMonitorIndex (focusMonitorIndex),
// layoutFor (layoutFor), layoutSet (layoutSet), retileMonitor
// (retileMonitor), borderUpdate (() => the border component's update),
// grabIsResize (grabIsResize), dropBegin (app.drop.begin), dropEnd (app.drop.end),
// dropStop (app.drop.stop), resizeEnd (app.split.onResizeEnd) — all resolved
// through the app at call time, so construction order does not matter. Ad-hoc
// exclusion state is NOT auto's business: it rides the session (exclusions.js)
// and ends with its window's close watch. The App's own surfaces — app.session
// and app.monitors — are read through the app parameter (settle wait, monitor
// readiness), not injected as deps.
/**
 * @typedef {Object} AutoDeps
 * @property {AnyRecord} mainloop imports.mainloop
 * @property {AnyRecord} meta imports.gi.Meta
 * @property {AnyRecord} main imports.ui.main
 * @property {AnyRecord} global the Cinnamon global object
 * @property {AnyRecord} signalManager fresh, this scope alone
 * @property {AnyRecord} gobject imports.gi.GObject
 * @property {() => CinnamonWindow | null} focusWindow
 * @property {() => number} focusMonitorIndex
 * @property {(app: AppFacade, monitorIndex: number, wsIndex: number) => { auto: boolean }} layoutFor
 * @property {(app: AppFacade, monitorIndex: number, wsIndex: number, patch: {}) => boolean} layoutSet
 * @property {(app: AppFacade, monitorIndex: number, focused: CinnamonWindow | null) => void} retileMonitor
 * @property {() => void} borderUpdate
 * @property {(op: string) => boolean} grabIsResize
 * @property {(app: AppFacade, w: CinnamonWindow, op: string) => boolean} dropBegin
 * @property {(app: AppFacade, w: CinnamonWindow, op: string) => boolean} dropEnd
 * @property {() => void} dropStop
 * @property {(app: AppFacade, w: CinnamonWindow, op: string) => void} resizeEnd
 */
var Auto = class {
    /**
     * @param {AutoDeps} deps
     */
    constructor(deps) {
        this._deps = deps;
        this._mainloop = deps.mainloop;
        this._meta = deps.meta;
        this._main = deps.main;
        this._global = deps.global;
        this._scope = createScope({
            signalManager: deps.signalManager,
            mainloop: deps.mainloop,
            gobject: deps.gobject,
        });
        this._overrides = new Map();
        this._timers = new Map();
        // _pending: per monitor, the stable sequences of fresh windows (append at the end).
        // _lastMonitor: stable sequence -> monitor the window was last seen on (close path).
        // _grabMonitor: stable sequence -> monitor at grab start (manual move across monitors).
        this._pending = new Map();
        this._lastMonitor = new Map();
        this._grabMonitor = new Map();
        // _resizeStart: stable sequence -> { rect, monitor } at the start of an edge resize.
        this._resizeStart = new Map();
        /** @type {Array<[AnyRecord, number, number]>} */
        this._workspaceSignals = [];
        /** @type {Array<[CinnamonWindow, number, number, number]>} */
        this._tracked = [];
    }

    // Per-monitor debounce: every monitor has its own pending timer, so a burst on one
    // monitor does not delay or cancel a retile on another. The timer re-checks that the
    // monitor still exists and that automatic tiling is still on for the active workspace.
    /**
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} ms
     */
    scheduleMonitor(app, monitorIndex, ms) {
        const existing = this._timers.get(monitorIndex);
        if (existing) {
            this._mainloop.source_remove(existing);
            this._timers.delete(monitorIndex);
        }
        this._timers.set(monitorIndex, this._mainloop.timeout_add(ms, () => {
            this._timers.delete(monitorIndex);
            // The App is recreated when monitors change, so indexes never survive a change;
            // a timer for a monitor that is gone (or no longer ready) must do nothing.
            if (!app.monitors.ready || !this._main.layoutManager.monitors[monitorIndex]) {
                return false;
            }
            const wsIndex = this._global.workspace_manager.get_active_workspace().index();
            // A retained intent for this monitor+workspace outranks the stored
            // setting: apply it now that a retile is due (the layouts setting may
            // have been repaired since), and gate the retile on what it says.
            if (!this._applyOrHonorPending(app, monitorIndex, wsIndex)) {
                return false;
            }
            if (this._deps.layoutFor(app, monitorIndex, wsIndex).auto) {
                this._deps.retileMonitor(app, monitorIndex, null);
            }
            return false;
        }));
    }

    /**
     * @param {AppFacade} app
     * @param {number} ms
     */
    scheduleAll(app, ms) {
        const wsIndex = this._global.workspace_manager.get_active_workspace().index();
        const count = this._main.layoutManager.monitors.length;
        for (let i = 0; i < count; i++) {
            if (this._deps.layoutFor(app, i, wsIndex).auto) {
                this.scheduleMonitor(app, i, ms);
            }
        }
    }

    // Automatic tiling is switched per monitor and workspace (stored in the layouts
    // setting): Super+Ctrl+A turns it on for the focused monitor and the active workspace
    // and tiles right away (with the preset if one is assigned, otherwise with the auto
    // grid); pressing it again just tiles again. Super+Ctrl+D turns it off; that also
    // pauses a preset, which stays assigned and comes back with Super+Ctrl+A.
    // The hotkeys exist before the asynchronous monitor reply fills the registry,
    // but a layout write needs the monitor key. Until it is there the command
    // cannot be written: rather than dropping it and still reporting success, the
    // intent is queued on the session (which survives an App recreation) and
    // applied by applyPending() before the first retile. _monitorWritable mirrors
    // the guard layoutSet applies internally.
    /**
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @returns {boolean}
     */
    _monitorWritable(app, monitorIndex) {
        return app.monitors.ready && !!app.monitors.keys[monitorIndex];
    }

    /**
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} wsIndex
     * @param {boolean} auto
     */
    _deferAuto(app, monitorIndex, wsIndex, auto) {
        // One intent per monitor+workspace, the newest one — the queue is bounded
        // by the monitor/workspace count, so a held hotkey cannot grow it.
        const pending = app.session.pendingAuto;
        for (let i = pending.length - 1; i >= 0; i--) {
            if (pending[i].monitorIndex === monitorIndex && pending[i].wsIndex === wsIndex) {
                pending.splice(i, 1);
            }
        }
        pending.push({ monitorIndex: monitorIndex, wsIndex: wsIndex, auto: auto });
        this._global.log('greenTile auto tiling ' + (auto ? 'on' : 'off') + ' pending until monitors ready for ws' + wsIndex);
    }

    /**
     * The retained intent for that monitor+workspace, if any.
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} wsIndex
     * @returns {{monitorIndex: number, wsIndex: number, auto: boolean} | undefined}
     */
    _pendingIntent(app, monitorIndex, wsIndex) {
        return app.session.pendingAuto.find((c) => c.monitorIndex === monitorIndex && c.wsIndex === wsIndex);
    }

    /**
     * Drops the retained intent for that key: an explicit command that took effect
     * (or a newer explicit command) supersedes it, one per monitor+workspace.
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} wsIndex
     */
    _dropIntent(app, monitorIndex, wsIndex) {
        const pending = app.session.pendingAuto;
        for (let i = pending.length - 1; i >= 0; i--) {
            if (pending[i].monitorIndex === monitorIndex && pending[i].wsIndex === wsIndex) {
                pending.splice(i, 1);
            }
        }
    }

    /**
     * Retains an intent the layout guard REFUSED (a corrupt layouts setting): the
     * newest explicit command is the pending one, so it replaces any older one and
     * is applied once the setting can take it.
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} wsIndex
     * @param {boolean} auto
     */
    _holdRefused(app, monitorIndex, wsIndex, auto) {
        this._dropIntent(app, monitorIndex, wsIndex);
        app.session.pendingAuto.push({ monitorIndex: monitorIndex, wsIndex: wsIndex, auto: auto });
        this._global.log('greenTile auto tiling ' + (auto ? 'on' : 'off') + ' retained for ws' + wsIndex + ': the layouts setting refused it');
    }

    /**
     * Applies a retained intent that outranks the stored setting — one held while
     * the layouts setting was corrupt — and reports whether an automatic retile may
     * proceed for that monitor+workspace. A retained PAUSE that still cannot be
     * written returns false: the stored `auto` would otherwise place windows
     * against the user's last command.
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} wsIndex
     * @returns {boolean}
     */
    _applyOrHonorPending(app, monitorIndex, wsIndex) {
        const pending = this._pendingIntent(app, monitorIndex, wsIndex);
        if (!pending) {
            return true;
        }
        if (this._monitorWritable(app, monitorIndex)
            && this._deps.layoutSet(app, monitorIndex, wsIndex, { auto: pending.auto })) {
            this._dropIntent(app, monitorIndex, wsIndex);
            this._global.log('greenTile retained auto tiling ' + (pending.auto ? 'on' : 'off') + ' for ws' + wsIndex);
            return true;
        }
        return pending.auto !== false;
    }

    /**
     * Applies the auto on/off commands queued before the registry was ready —
     * called by the monitor-ready callback after connectAll and before the settle
     * retile, so no automatic tiling runs against a requested pause. Each intent
     * leaves the queue only once the layout write actually happened, so a throw
     * mid-way (or a refusal by the layout guard, e.g. a corrupt layouts setting)
     * keeps it queued for the next monitor-ready; an intent whose monitor no
     * longer exists is dropped (there is no key to address it, and nothing ever
     * will be).
     * @param {AppFacade} app
     */
    applyPending(app) {
        const pending = app.session.pendingAuto;
        if (pending.length === 0) {
            return;
        }
        for (let i = 0; i < pending.length;) {
            const cmd = pending[i];
            if (!this._monitorWritable(app, cmd.monitorIndex)) {
                pending.splice(i, 1);
                continue;
            }
            // (the write result decides: a refused write keeps it retained)
            // A refused write is NOT a success: the intent stays queued (and no
            // retile follows) until the layout setting can take it.
            const written = this._deps.layoutSet(app, cmd.monitorIndex, cmd.wsIndex, { auto: cmd.auto });
            if (!written) {
                i += 1;
                continue;
            }
            pending.splice(i, 1);
            this._global.log('greenTile auto tiling ' + (cmd.auto ? 'on' : 'off') + ' for ws' + cmd.wsIndex);
            if (cmd.auto) {
                this._deps.retileMonitor(app, cmd.monitorIndex, null);
            }
            else {
                // no retile follows auto off — the border has no geometry event to
                // hide it, so refresh right here (the border update lives in
                // lib/runtime/border.js but is only ever CALLED at runtime)
                this._deps.borderUpdate();
            }
        }
    }

    /** @param {AppFacade} app */
    activate(app) {
        const focusWindow = this._deps.focusWindow();
        const monitorIndex = focusWindow ? focusWindow.get_monitor() : this._main.layoutManager.primaryIndex;
        const wsIndex = this._global.workspace_manager.get_active_workspace().index();
        if (!this._monitorWritable(app, monitorIndex)) {
            this._deferAuto(app, monitorIndex, wsIndex, true);
            return;
        }
        if (!this._deps.layoutFor(app, monitorIndex, wsIndex).auto) {
            // a refused write (corrupt layouts) must not be reported as success
            // nor retiled against: the stored state is still off, and the newest
            // explicit command is retained for when the setting can take it
            if (!this._deps.layoutSet(app, monitorIndex, wsIndex, { auto: true })) {
                this._holdRefused(app, monitorIndex, wsIndex, true);
                return;
            }
            this._global.log('greenTile auto tiling on for ws' + wsIndex);
        }
        // the explicit command took effect: it supersedes anything retained for it
        this._dropIntent(app, monitorIndex, wsIndex);
        this._pending.delete(monitorIndex);
        this._deps.retileMonitor(app, monitorIndex, focusWindow);
    }

    /** @param {AppFacade} app */
    deactivate(app) {
        const monitorIndex = this._deps.focusMonitorIndex();
        const wsIndex = this._global.workspace_manager.get_active_workspace().index();
        if (!this._monitorWritable(app, monitorIndex)) {
            this._deferAuto(app, monitorIndex, wsIndex, false);
            return;
        }
        if (!this._deps.layoutSet(app, monitorIndex, wsIndex, { auto: false })) {
            this._holdRefused(app, monitorIndex, wsIndex, false);
            return;
        }
        // the explicit command took effect: it supersedes anything retained for it
        this._dropIntent(app, monitorIndex, wsIndex);
        this._pending.delete(monitorIndex);
        this._global.log('greenTile auto tiling off for ws' + wsIndex);
        // no retile follows auto off — the border has no geometry event to hide it,
        // so refresh right here (the border update lives in lib/runtime/border.js but
        // is only ever CALLED at runtime)
        this._deps.borderUpdate();
    }

    /**
     * @param {AppFacade} app
     * @param {AnyRecord} ws
     * @param {CinnamonWindow} w
     */
    onWindowAdded(app, ws, w) {
        if (ws !== this._global.workspace_manager.get_active_workspace()) {
            return;
        }
        if (w == null || w.get_window_type() !== this._meta.WindowType.NORMAL) {
            return;
        }
        const monitorIndex = w.get_monitor();
        let pending = this._pending.get(monitorIndex);
        if (!pending) {
            pending = new Set();
            this._pending.set(monitorIndex, pending);
        }
        pending.add(w.get_stable_sequence());
        this._lastMonitor.set(w.get_stable_sequence(), monitorIndex);
        this.scheduleMonitor(app, monitorIndex, 300);
    }

    /**
     * @param {AppFacade} app
     * @param {AnyRecord} ws
     * @param {CinnamonWindow} w
     */
    onWindowRemoved(app, ws, w) {
        if (ws !== this._global.workspace_manager.get_active_workspace()) {
            return;
        }
        if (w == null) {
            return;
        }
        // The wrapper may already be destroyed; its stable sequence still maps to the
        // monitor the window was last seen on — without a record there is nothing to retile.
        let seq;
        try {
            seq = w.get_stable_sequence();
        }
        catch (_e) {
            return;
        }
        const monitorIndex = this._lastMonitor.get(seq);
        if (monitorIndex === undefined) {
            return;
        }
        // The window cannot be re-appended: drop its fresh record, so the per-monitor
        // sets stay bounded on a paused monitor, where no retile ever drains them.
        this.pendingForget(seq);
        this.scheduleMonitor(app, monitorIndex, 300);
    }

    /**
     * @param {AppFacade} app
     * @param {CinnamonWindow} w
     * @param {string} op
     */
    onGrabBegin(app, w, op) {
        if (!this._windowOk(w)) {
            return;
        }
        if (this._deps.grabIsResize(op)) {
            // Frame at grab start identifies the cell the window was tiled into.
            const f = w.get_frame_rect();
            this._resizeStart.set(w.get_stable_sequence(), { rect: [f.x, f.y, f.width, f.height], monitor: w.get_monitor() });
            return;
        }
        if (op !== this._meta.GrabOp.MOVING && op !== this._meta.GrabOp.KEYBOARD_MOVING) {
            return;
        }
        this._deps.dropBegin(app, w, op);
        this._grabMonitor.set(w.get_stable_sequence(), w.get_monitor());
    }

    /**
     * @param {AppFacade} app
     * @param {CinnamonWindow} w
     * @param {string} op
     */
    onGrabEnd(app, w, op) {
        if (!this._windowOk(w)) {
            return;
        }
        if (this._deps.grabIsResize(op)) {
            this._deps.resizeEnd(app, w, op);
            return;
        }
        if (op !== this._meta.GrabOp.MOVING && op !== this._meta.GrabOp.KEYBOARD_MOVING) {
            return;
        }
        if (this._deps.dropEnd(app, w, op)) {
            return;
        }
        if (w.get_workspace() !== this._global.workspace_manager.get_active_workspace()) {
            return;
        }
        const seq = w.get_stable_sequence();
        const from = this._grabMonitor.get(seq);
        this._grabMonitor.delete(seq);
        const to = w.get_monitor();
        // Manual moves can cross monitors: both the monitor at grab start and the one at
        // release may need a retile (one call when equal, per-monitor timers anyway).
        if (from !== undefined && from !== to) {
            this.scheduleMonitor(app, from, 250);
        }
        this.scheduleMonitor(app, to, 250);
    }

    // Minimizing does NOT fire workspace window-removed (the window stays on its
    // workspace), and Meta.Display has no 'window-minimize' signal in muffin 6.6 —
    // the canonical way (Cinnamon's own windowManager.js:419) is per-window
    // 'notify::minimized', wired for every window and new windows via window-created.
    /**
     * @param {AppFacade} app
     * @param {CinnamonWindow} w
     */
    onMinimizedNotify(app, w) {
        if (w == null || w.get_window_type() !== this._meta.WindowType.NORMAL) {
            return;
        }
        if (w.get_workspace() !== this._global.workspace_manager.get_active_workspace()) {
            return;
        }
        this.scheduleMonitor(app, w.get_monitor(), 300);
    }

    /**
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {CinnamonWindow} w
     */
    onEnteredMonitor(app, monitorIndex, w) {
        if (w == null) {
            return;
        }
        this._lastMonitor.set(w.get_stable_sequence(), monitorIndex);
        // Muffin moving windows across monitors restarts the settle wait while it runs.
        if (app.session.settle.started) {
            app.session.settle.start(app);
        }
    }

    /** @param {CinnamonWindow} w */
    _windowOk(w) {
        return w != null && !w.minimized && w.get_wm_class() != null
            && w.get_window_type() === this._meta.WindowType.NORMAL;
    }

    /** @param {any[]} args */
    _anyWindow(args) {
        for (let i = 0; i < args.length; i++) {
            const a = args[i];
            if (a && a.get_wm_class) {
                return a;
            }
        }
        return null;
    }

    /** @param {CinnamonWindow} w */
    _untrack(w) {
        const idx = this._tracked.findIndex(([tw]) => tw === w);
        if (idx === -1) {
            return;
        }
        const [_, mid, uid, seq] = this._tracked[idx];
        // stopping the tracking does NOT remove the window's ad-hoc exclusion:
        // it lives on the session until the user toggles again or the window
        // closes (its own close watch, exclusions.js) — waived here even when
        // the trigger is the App's destruction. Each id is attempted on its own:
        // the pair is only ever half-connectable, so a throwing first disconnect
        // must not abandon the second one.
        for (const id of [mid, uid]) {
            try {
                w.disconnect(id);
            }
            catch (_e) {
                // window already destroyed — wrapper invalid, nothing to clean
            }
        }
        this._lastMonitor.delete(seq);
        this._grabMonitor.delete(seq);
        this._resizeStart.delete(seq);
        // The close path is the guaranteed one: window-removed may arrive on an
        // inactive workspace, or after this handler. Drop the fresh record here too,
        // so the per-monitor sets stay bounded on a paused monitor where no retile
        // ever drains them — independent of Muffin's signal order.
        this.pendingForget(seq);
        this._tracked.splice(idx, 1);
    }

    /**
     * @param {AppFacade} app
     * @param {CinnamonWindow} w
     */
    trackWindow(app, w) {
        if (w == null || w.get_window_type() !== this._meta.WindowType.NORMAL) {
            return;
        }
        if (this._tracked.some(([tw]) => tw === w)) {
            return;
        }
        // Read the wrapper-derived values BEFORE connecting: a destroyed wrapper
        // throws here, when no handler exists yet to leak. The two connects are
        // acquired as a pair — a failure on the second releases the first, so the
        // window never carries a handler the teardown does not own.
        const seq = w.get_stable_sequence();
        const monitor = w.get_monitor();
        let mid = 0;
        let uid = 0;
        try {
            mid = w.connect('notify::minimized', () => this.onMinimizedNotify(app, w));
            // closing a window mid-animation must not leave a placement owner
            // behind (the actor may already be gone — the owner tolerates that)
            uid = w.connect('unmanaged', () => {
                this._untrack(w);
                app.placement.release(w);
            });
        }
        catch (e) {
            if (mid) {
                try {
                    w.disconnect(mid);
                }
                catch (_e) {
                    // window already destroyed — wrapper invalid, nothing to clean
                }
            }
            throw e;
        }
        // Spec: a tracked window records its monitor when it is tracked — the close
        // path needs it because the window is gone when window-removed arrives.
        this._lastMonitor.set(seq, monitor);
        this._tracked.push([w, mid, uid, seq]);
    }

    _disconnectWorkspaces() {
        disconnectEach(this._workspaceSignals);
        this._workspaceSignals = [];
    }

    /**
     * @param {AppFacade} app
     * @param {AnyRecord} ws
     */
    _connectWorkspace(app, ws) {
        const a = ws.connect('window-added', (/** @type {AnyRecord} */ ws_, /** @type {CinnamonWindow} */ w) => this.onWindowAdded(app, ws_, w));
        let r = 0;
        try {
            r = ws.connect('window-removed', (/** @type {AnyRecord} */ ws_, /** @type {CinnamonWindow} */ w) => this.onWindowRemoved(app, ws_, w));
        }
        catch (e) {
            // the pair is owned as a unit: a failed second connect must not leave
            // the first handler behind (it would survive destroy, which walks the
            // recorded list only)
            try {
                ws.disconnect(a);
            }
            catch (_e) {
                // the workspace was already gone
            }
            throw e;
        }
        this._workspaceSignals.push([ws, a, r]);
    }

    /** @param {AppFacade} app */
    connectAll(app) {
        // All-or-nothing: a throw part-way through (a failed per-window or
        // per-workspace connect, a destroyed wrapper in the existing-window pass)
        // must not leave a half-started observer set. The rollback restores the
        // pre-attempt state and reports whether the release was clean; a release
        // that left entries behind is logged, because the App rollback that
        // follows (Config's ready boundary) is the only remaining owner of them.
        try {
            this._connectAll(app);
        }
        catch (e) {
            if (!this._rollbackConnectAll()) {
                this._global.logError('greenTile observer rollback left entries behind');
            }
            throw e;
        }
    }

    /** @param {AppFacade} app */
    _connectAll(app) {
        const n = this._global.workspace_manager.get_n_workspaces();
        for (let i = 0; i < n; i++) {
            this._connectWorkspace(app, this._global.workspace_manager.get_workspace_by_index(i));
        }
        this._scope.connect(this._global.workspace_manager, 'notify::n-workspaces', () => {
            // Workspace set changed: drop and reconnect all (old objects may be
            // gone). The reconnect is all-or-nothing like the first pass — a
            // failing connect must not leave a partial workspace set behind.
            this._disconnectWorkspaces();
            const n2 = this._global.workspace_manager.get_n_workspaces();
            try {
                for (let j = 0; j < n2; j++) {
                    this._connectWorkspace(app, this._global.workspace_manager.get_workspace_by_index(j));
                }
            }
            catch (e) {
                this._disconnectWorkspaces();
                this._global.logError('greenTile workspace reconnect failed: ' + e);
            }
        });
        // Muffin 6.6 emits grab-op-begin/end as (display, display, window, op) — the
        // display is passed twice (legacy screen slot). Verified via live signal probe.
        this._scope.connect(this._global.display, 'grab-op-begin', (/** @type {AnyRecord} */ display, /** @type {AnyRecord} */ display2, /** @type {CinnamonWindow} */ w, /** @type {string} */ op) => this.onGrabBegin(app, w, op));
        this._scope.connect(this._global.display, 'grab-op-end', (/** @type {AnyRecord} */ display, /** @type {AnyRecord} */ display2, /** @type {CinnamonWindow} */ w, /** @type {string} */ op) => this.onGrabEnd(app, w, op));
        // Cross-monitor moves: (monitor index, MetaWindow), signature verified live
        // via GObject.signal_query.
        this._scope.connect(this._global.display, 'window-entered-monitor', (/** @type {AnyRecord} */ display, /** @type {number} */ monitorIndex, /** @type {CinnamonWindow} */ w) => this.onEnteredMonitor(app, monitorIndex, w));
        // Arg scan by duck typing guards against muffin signature quirks (grab-op
        // passes the display twice). window-created wires minimize tracking for
        // new windows; existing ones are tracked below.
        this._scope.connect(this._global.display, 'window-created', (/** @type {any} */ ...args) => this.trackWindow(app, this._anyWindow(args)));
        const wn = this._global.workspace_manager.get_n_workspaces();
        for (let i = 0; i < wn; i++) {
            const wl = this._global.workspace_manager.get_workspace_by_index(i).list_windows();
            for (let j = 0; j < wl.length; j++) {
                this.trackWindow(app, wl[j]);
            }
        }
        // Switching onto a preset workspace retiles there (Cinnamon's own
        // windowManager.js:358 uses this signal with (wm, from, to, direction)).
        this._scope.connect(this._global.window_manager, 'switch-workspace', (/** @type {AnyRecord} */ _wm, /** @type {AnyRecord} */ _from, /** @type {AnyRecord} */ _to) => this.scheduleAll(app, 300));
    }

    /**
     * Releases every acquisition connectAll made and rebuilds the scope.
     * @returns {boolean} whether the release was clean (the scope's signal manager
     *   is empty again), i.e. whether a retry may safely re-register
     */
    _rollbackConnectAll() {
        this._disconnectWorkspaces();
        for (const [w] of this._tracked.slice()) {
            this._untrack(w);
        }
        // The scope rebuild is best-effort: a throwing destroy must not replace
        // the error that sent us here (the caller reports the original one).
        try {
            this._scope.destroy();
        }
        catch (e) {
            this._global.logError('greenTile observer scope rollback failed: ' + e);
        }
        const clean = this._deps.signalManager.getSignals().length === 0;
        this._scope = createScope({
            signalManager: this._deps.signalManager,
            mainloop: this._deps.mainloop,
            gobject: this._deps.gobject,
        });
        return clean;
    }

    // new windows (opened while automatic tiling is on) append at the end — their spawn
    // position is meaningless for the reading order. Returns the pending set so far and
    // resets it; cleared after each tiling.
    /** @param {number} monitorIndex */
    pendingTake(monitorIndex) {
        const pending = this._pending.get(monitorIndex) || new Set();
        this._pending.set(monitorIndex, new Set());
        return pending;
    }

    // A successful Drop placed the window explicitly: forget exactly its fresh
    // record, so the next retile does not re-append it at the end. The record is
    // keyed by the monitor the window opened on, which need not be the drop target
    // (cross-monitor drag) — and a window carried to another active workspace can
    // sit under more than one monitor key, so every set is swept. Uninvolved fresh
    // windows keep their records.
    /**
     * @param {number} seq
     */
    pendingForget(seq) {
        for (const pending of this._pending.values()) {
            pending.delete(seq);
        }
    }

    // { rect, monitor } at grab start, dropped on read — an edge resize is consumed once.
    /** @param {number} seq */
    resizeStartTake(seq) {
        const start = this._resizeStart.get(seq);
        this._resizeStart.delete(seq);
        return start;
    }

    // Sort-override state for the tiling reading order: expired entries are
    // pruned on every read, an override handed out is deleted and only honoured while
    // fresh — the exact previous inline semantics.
    /**
     * @param {number} seq
     * @param {Rect} rect
     * @param {number} now
     */
    sortOverride(seq, rect, now) {
        this._overrides.set(seq, { rect: rect, at: now });
    }

    /**
     * @param {number} seq
     * @param {number} now
     */
    sortTake(seq, now) {
        const o = this._overrides.get(seq);
        if (o) {
            this._overrides.delete(seq);
            if (now - o.at <= SORT_OVERRIDE_MS) {
                return o.rect;
            }
        }
        return null;
    }

    // Read-only counterpart of sortTake for callers that place no window (focus
    // navigation): the override stays in place for the retile that does consume
    // it. Callers run sortPoll first (sortReadingOrder does), so expired entries
    // never accumulate.
    /**
     * @param {number} seq
     * @param {number} now
     */
    sortPeek(seq, now) {
        const o = this._overrides.get(seq);
        if (o && now - o.at <= SORT_OVERRIDE_MS) {
            return o.rect;
        }
        return null;
    }

    /** @param {number} seq */
    sortClear(seq) {
        this._overrides.delete(seq);
    }

    /** @param {number} now */
    sortPoll(now) {
        for (const [seq, o] of this._overrides)
            {if (now - o.at > SORT_OVERRIDE_MS)
                {this._overrides.delete(seq);}}
    }

    destroy() {
        // The animated-placement resources are NOT released here: they live on
        // the per-App placement owner, which covers every placement — including
        // the ones that happened before the asynchronous monitor reply filled
        // these tracked lists.
        // Untracking comes FIRST: it runs per window isolated, and a throw in the
        // teardown work below must not leave the window handlers connected to a
        // dead Auto (they would keep the App reachable and call into it).
        for (const [w] of this._tracked.slice()) {
            this._untrack(w);
        }
        for (const id of this._timers.values()) {
            this._mainloop.source_remove(id);
        }
        this._timers.clear();
        this._pending.clear();
        this._lastMonitor.clear();
        this._grabMonitor.clear();
        this._resizeStart.clear();
        this._deps.dropStop();
        this._overrides.clear();
        this._disconnectWorkspaces();
        this._scope.destroy();
    }
};

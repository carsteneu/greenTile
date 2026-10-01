/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * per-App auto-tiling observer: the per-monitor debounce timers, the fresh-
 * window pending sets, the monitor maps, the workspace/window observers and
 * the sort-rect overrides a resize or swap leaves for the next retile. Owned
 * by the App (monitors-changed destroys the App) and destroyed in the
 * tile_auto_disconnect_all slot of Config.destroy, in the same order: timers
 * removed, maps cleared, tile_drop_stop(), sort overrides cleared, exclusion
 * toggles cleared, workspaces disconnected, global signals disconnected,
 * tracked windows untracked.
 * The global signals are connected on the component's own runtime Scope (App
 * lifetime). The workspace window-added/removed handlers are dropped and
 * reconnected mid-life (notify::n-workspaces) and the per-monitor debounce
 * timers are replaced on reschedule — both keep explicit id lists / a timer
 * Map instead of the scope (no selective mid-life disconnect). Split, drop,
 * border and exclusion runtime stays module-level in greenTile.js until its
 * own loop and comes in as injected deps. All Cinnamon access is injected.
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const { createScope } = require('./lib/runtime/scope');
const { tile_disconnect_each } = require('./lib/model/teardown');

// tile_sort_rect_override on this component: stable sequence -> frame to sort by
// instead of the current one (set after an edge resize or a swap: the dragged window
// keeps the cell it was tiled into; used up by the next retile, ignored after
// TILE_SORT_OVERRIDE_MS when no retile came)
const TILE_SORT_OVERRIDE_MS = 2000;

// deps: mainloop (imports.mainloop), meta (imports.gi.Meta), main
// (imports.ui.main), global (the global object), signalManager (fresh, this
// scope alone), gobject (imports.gi.GObject, activates the scope's GObject
// guard), focusWindow (tile_focus_window), focusMonitorIndex
// (tile_focus_monitor_index), layoutFor (tile_layout_for), layoutSet
// (tile_layout_set), retileMonitor (tile_retile_monitor), borderUpdate
// (tile_border_update), grabIsResize (tile_grab_is_resize), dropBegin
// (tile_drop_begin), dropEnd (tile_drop_end), dropStop (tile_drop_stop),
// resizeEnd (tile_split_on_resize_end), exclToggleDelete(seq),
// exclToggleClear()
class Auto {
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
        this._workspaceSignals = [];
        this._tracked = [];
    }

    // Per-monitor debounce: every monitor has its own pending timer, so a burst on one
    // monitor does not delay or cancel a retile on another. The timer re-checks that the
    // monitor still exists and that automatic tiling is still on for the active workspace.
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
            if (!app.monitors.ready || !this._main.layoutManager.monitors[monitorIndex])
                return false;
            if (this._deps.layoutFor(app, monitorIndex, this._global.workspace_manager.get_active_workspace().index()).auto)
                this._deps.retileMonitor(app, monitorIndex, null);
            return false;
        }));
    }

    scheduleAll(app, ms) {
        const wsIndex = this._global.workspace_manager.get_active_workspace().index();
        const count = this._main.layoutManager.monitors.length;
        for (let i = 0; i < count; i++) {
            if (this._deps.layoutFor(app, i, wsIndex).auto)
                this.scheduleMonitor(app, i, ms);
        }
    }

    // Automatic tiling is switched per monitor and workspace (stored in the "layouts"
    // setting): Super+Ctrl+A turns it on for the focused monitor and the active workspace
    // and tiles right away (with the preset if one is assigned, otherwise with the auto
    // grid); pressing it again just tiles again. Super+Ctrl+D turns it off; that also
    // pauses a preset, which stays assigned and comes back with Super+Ctrl+A.
    activate(app) {
        const focusWindow = this._deps.focusWindow();
        const monitorIndex = focusWindow ? focusWindow.get_monitor() : this._main.layoutManager.primaryIndex;
        const wsIndex = this._global.workspace_manager.get_active_workspace().index();
        if (!this._deps.layoutFor(app, monitorIndex, wsIndex).auto) {
            this._deps.layoutSet(app, monitorIndex, wsIndex, { auto: true });
            this._global.log('greenTile auto tiling on for ws' + wsIndex);
        }
        this._pending.delete(monitorIndex);
        this._deps.retileMonitor(app, monitorIndex, focusWindow);
    }

    deactivate(app) {
        const monitorIndex = this._deps.focusMonitorIndex();
        const wsIndex = this._global.workspace_manager.get_active_workspace().index();
        this._deps.layoutSet(app, monitorIndex, wsIndex, { auto: false });
        this._pending.delete(monitorIndex);
        this._global.log('greenTile auto tiling off for ws' + wsIndex);
        // no retile follows auto off — the border has no geometry event to hide it,
        // so refresh right here (the border update is defined in greenTile.js but
        // is only ever CALLED at runtime)
        this._deps.borderUpdate();
    }

    onWindowAdded(app, ws, w) {
        if (ws !== this._global.workspace_manager.get_active_workspace())
            return;
        if (w == null || w.get_window_type() !== this._meta.WindowType.NORMAL)
            return;
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

    onWindowRemoved(app, ws, w) {
        if (ws !== this._global.workspace_manager.get_active_workspace())
            return;
        if (w == null)
            return;
        // The wrapper may already be destroyed; its stable sequence still maps to the
        // monitor the window was last seen on — without a record there is nothing to retile.
        let seq;
        try {
            seq = w.get_stable_sequence();
        }
        catch (e) {
            return;
        }
        const monitorIndex = this._lastMonitor.get(seq);
        if (monitorIndex === undefined)
            return;
        this.scheduleMonitor(app, monitorIndex, 300);
    }

    onGrabBegin(app, w, op) {
        if (!this._windowOk(w))
            return;
        if (this._deps.grabIsResize(op)) {
            // Frame at grab start identifies the cell the window was tiled into.
            const f = w.get_frame_rect();
            this._resizeStart.set(w.get_stable_sequence(), { rect: [f.x, f.y, f.width, f.height], monitor: w.get_monitor() });
            return;
        }
        if (op !== this._meta.GrabOp.MOVING && op !== this._meta.GrabOp.KEYBOARD_MOVING)
            return;
        this._deps.dropBegin(app, w, op);
        this._grabMonitor.set(w.get_stable_sequence(), w.get_monitor());
    }

    onGrabEnd(app, w, op) {
        if (!this._windowOk(w))
            return;
        if (this._deps.grabIsResize(op)) {
            this._deps.resizeEnd(app, w, op);
            return;
        }
        if (op !== this._meta.GrabOp.MOVING && op !== this._meta.GrabOp.KEYBOARD_MOVING)
            return;
        if (this._deps.dropEnd(app, w, op))
            return;
        if (w.get_workspace() !== this._global.workspace_manager.get_active_workspace())
            return;
        const seq = w.get_stable_sequence();
        const from = this._grabMonitor.get(seq);
        this._grabMonitor.delete(seq);
        const to = w.get_monitor();
        // Manual moves can cross monitors: both the monitor at grab start and the one at
        // release may need a retile (one call when equal, per-monitor timers anyway).
        if (from !== undefined && from !== to)
            this.scheduleMonitor(app, from, 250);
        this.scheduleMonitor(app, to, 250);
    }

    // Minimizing does NOT fire workspace window-removed (the window stays on its
    // workspace), and Meta.Display has no 'window-minimize' signal in muffin 6.6 —
    // the canonical way (Cinnamon's own windowManager.js:419) is per-window
    // 'notify::minimized', wired for every window and new windows via window-created.
    onMinimizedNotify(app, w) {
        if (w == null || w.get_window_type() !== this._meta.WindowType.NORMAL)
            return;
        if (w.get_workspace() !== this._global.workspace_manager.get_active_workspace())
            return;
        this.scheduleMonitor(app, w.get_monitor(), 300);
    }

    onEnteredMonitor(app, monitorIndex, w) {
        if (w == null)
            return;
        this._lastMonitor.set(w.get_stable_sequence(), monitorIndex);
        // Muffin moving windows across monitors restarts the settle wait while it runs.
        if (app.session.settle.started)
            app.session.settle.start(app);
    }

    _windowOk(w) {
        return w != null && !w.minimized && w.get_wm_class() != null
            && w.get_window_type() === this._meta.WindowType.NORMAL;
    }

    _anyWindow(args) {
        for (let i = 0; i < args.length; i++) {
            const a = args[i];
            if (a && a.get_wm_class)
                return a;
        }
        return null;
    }

    _untrack(w) {
        const idx = this._tracked.findIndex(([tw]) => tw === w);
        if (idx === -1)
            return;
        const [_, mid, uid, seq] = this._tracked[idx];
        // the window is gone: its ad-hoc exclusion state must not leak into a new window
        this._deps.exclToggleDelete(seq);
        try {
            w.disconnect(mid);
            w.disconnect(uid);
        }
        catch (e) {
            // window already destroyed — wrapper invalid, nothing to clean
        }
        this._lastMonitor.delete(seq);
        this._grabMonitor.delete(seq);
        this._resizeStart.delete(seq);
        this._tracked.splice(idx, 1);
    }

    trackWindow(app, w) {
        if (w == null || w.get_window_type() !== this._meta.WindowType.NORMAL)
            return;
        if (this._tracked.some(([tw]) => tw === w))
            return;
        const mid = w.connect('notify::minimized', () => this.onMinimizedNotify(app, w));
        const uid = w.connect('unmanaged', () => this._untrack(w));
        const seq = w.get_stable_sequence();
        // Spec: a tracked window records its monitor when it is tracked — the close
        // path needs it because the window is gone when window-removed arrives.
        this._lastMonitor.set(seq, w.get_monitor());
        this._tracked.push([w, mid, uid, seq]);
    }

    _disconnectWorkspaces() {
        tile_disconnect_each(this._workspaceSignals);
        this._workspaceSignals = [];
    }

    _connectWorkspace(app, ws) {
        const a = ws.connect('window-added', (ws_, w) => this.onWindowAdded(app, ws_, w));
        const r = ws.connect('window-removed', (ws_, w) => this.onWindowRemoved(app, ws_, w));
        this._workspaceSignals.push([ws, a, r]);
    }

    connectAll(app) {
        const n = this._global.screen.get_n_workspaces();
        for (let i = 0; i < n; i++)
            this._connectWorkspace(app, this._global.screen.get_workspace_by_index(i));
        this._scope.connect(this._global.screen, 'notify::n-workspaces', () => {
            // Workspace set changed: drop and reconnect all (old objects may be gone).
            this._disconnectWorkspaces();
            const n2 = this._global.screen.get_n_workspaces();
            for (let j = 0; j < n2; j++)
                this._connectWorkspace(app, this._global.screen.get_workspace_by_index(j));
        });
        // Muffin 6.6 emits grab-op-begin/end as (display, display, window, op) — the
        // display is passed twice (legacy screen slot). Verified via live signal probe.
        this._scope.connect(this._global.display, 'grab-op-begin', (display, display2, w, op) => this.onGrabBegin(app, w, op));
        this._scope.connect(this._global.display, 'grab-op-end', (display, display2, w, op) => this.onGrabEnd(app, w, op));
        // Cross-monitor moves: (monitor index, MetaWindow), signature verified live
        // via GObject.signal_query.
        this._scope.connect(this._global.display, 'window-entered-monitor', (display, monitorIndex, w) => this.onEnteredMonitor(app, monitorIndex, w));
        // Arg scan by duck typing guards against muffin signature quirks (grab-op
        // passes the display twice). window-created wires minimize tracking for
        // new windows; existing ones are tracked below.
        this._scope.connect(this._global.display, 'window-created', (...args) => this.trackWindow(app, this._anyWindow(args)));
        const wn = this._global.screen.get_n_workspaces();
        for (let i = 0; i < wn; i++) {
            const wl = this._global.screen.get_workspace_by_index(i).list_windows();
            for (let j = 0; j < wl.length; j++)
                this.trackWindow(app, wl[j]);
        }
        // Switching onto a preset workspace retiles there (Cinnamon's own
        // windowManager.js:358 uses this signal with (wm, from, to, direction)).
        this._scope.connect(this._global.window_manager, 'switch-workspace', (wm, from, to) => this.scheduleAll(app, 300));
    }

    // new windows (opened while automatic tiling is on) append at the end — their spawn
    // position is meaningless for the reading order. Returns the pending set so far and
    // resets it; cleared after each tiling.
    pendingTake(monitorIndex) {
        const pending = this._pending.get(monitorIndex) || new Set();
        this._pending.set(monitorIndex, new Set());
        return pending;
    }

    // { rect, monitor } at grab start, dropped on read — an edge resize is consumed once.
    resizeStartTake(seq) {
        const start = this._resizeStart.get(seq);
        this._resizeStart.delete(seq);
        return start;
    }

    // Sort-override state for the reading order in greenTile.js: expired entries are
    // pruned on every read, an override handed out is deleted and only honoured while
    // fresh — the exact previous inline semantics.
    sortOverride(seq, rect, now) {
        this._overrides.set(seq, { rect: rect, at: now });
    }

    sortTake(seq, now) {
        const o = this._overrides.get(seq);
        if (o) {
            this._overrides.delete(seq);
            if (now - o.at <= TILE_SORT_OVERRIDE_MS)
                return o.rect;
        }
        return null;
    }

    sortClear(seq) {
        this._overrides.delete(seq);
    }

    sortPoll(now) {
        for (const [seq, o] of this._overrides)
            if (now - o.at > TILE_SORT_OVERRIDE_MS)
                this._overrides.delete(seq);
    }

    destroy() {
        for (const id of this._timers.values())
            this._mainloop.source_remove(id);
        this._timers.clear();
        this._pending.clear();
        this._lastMonitor.clear();
        this._grabMonitor.clear();
        this._resizeStart.clear();
        this._deps.dropStop();
        this._overrides.clear();
        this._deps.exclToggleClear();
        this._disconnectWorkspaces();
        this._scope.destroy();
        for (const [w] of this._tracked.slice())
            this._untrack(w);
    }
}

module.exports = {
    Auto,
};

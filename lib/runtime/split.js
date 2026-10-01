/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * per-App split runtime: the pending split writes (key "mkey\nwskey\nn" ->
 * { mkey, wskey, n, split }), the 500 ms flush timer they ride, the accel
 * state of the resize hotkeys and the cached keyboard repeat settings.
 * Owned by the App (monitors-changed destroys the App): a hotkey repeat that
 * straddles a monitor change restarts its acceleration in the new App, inside
 * the ~600 ms repeat window the only observable difference. The layouts-corrupt
 * log-once flag instead rides the extension session — the flag must
 * stay log-once across App recreations. destroy() removes the flush timer and
 * clears the pending map: writes go through flush() only, which Config.destroy
 * calls BEFORE any teardown (nothing may write after settings finalize).
 * All Cinnamon access is injected (deps), the App's own surfaces (monitors,
 * auto, session, config) are read through the app parameter.
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const {
    SPLIT_MIN_PX, splitValid, splitRects, splitCellAt,
    splitBorderPos, splitMove, splitKeyTarget,
    splitAccel, splitOpEdges, splitFrameEdges,
} = require('./lib/model/split');
const { layoutsParse, layoutsSplits, layoutsShapes, layoutsSet } = require('./lib/model/layouts');
const { SETTINGS_KEYS } = require('./lib/model/settings-keys');

const SPLIT_FLUSH_MS = 500;

/**
 * Split runtime: pending split writes, flush timer, resize-hotkey
 * acceleration and the cached keyboard repeat settings. Deps (all injected):
 * mainloop (imports.mainloop), glib (imports.gi.GLib), gio (imports.gi.Gio),
 * global (the global object), main (imports.ui.main — layoutManager),
 * focusWindow, layoutFor, layoutShape, layoutSet, collectWindows,
 * usableArea, gap, retileMonitor, grabOpName — too many members for a
 * typedef, so deps stays AnyRecord.
 */
class Split {
    /**
     * @param {AnyRecord} deps
     */
    constructor(deps) {
        this._deps = deps;
        this._mainloop = deps.mainloop;
        this._glib = deps.glib;
        this._gio = deps.gio;
        this._global = deps.global;
        this._main = deps.main;
        this._pending = new Map();
        // Replaced mid-life on every debounced hotkey step: an explicit id, not a scope.
        this._flushTimer = { id: 0 };
        this.keys = { state: null };
        this._keyboardSettings = null;
    }

    /**
     * Pending-write key parts for the monitor + workspace + window count.
     * null when the monitor has no key (unknown monitor).
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} wsIndex
     * @param {number} n
     * @returns {{ key: string, mkey: string, wskey: string, n: string } | null}
     */
    ref(app, monitorIndex, wsIndex, n) {
        const mkey = app.monitors.keys[monitorIndex];
        if (!mkey) {
            return null;
        }
        const wskey = app.monitors.wsKey(monitorIndex, wsIndex);
        return { key: mkey + '\n' + wskey + '\n' + n, mkey: mkey, wskey: wskey, n: String(n) };
    }

    /**
     * Stored split for the layout when it fits (kind, shape), null otherwise.
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} wsIndex
     * @param {number} n
     * @param {Layout} layout
     * @returns {Split | null}
     */
    for (app, monitorIndex, wsIndex, n, layout) {
        const ref = this.ref(app, monitorIndex, wsIndex, n);
        if (!ref) {
            return null;
        }
        const pending = this._pending.get(ref.key);
        if (pending) {
            return splitValid(layout.kind, layout.shape, pending.split);
        }
        const layouts = layoutsParse(app.config.settings.getValue(SETTINGS_KEYS.layouts) || '');
        return splitValid(layout.kind, layout.shape, layoutsSplits(layouts, ref.mkey, ref.wskey)[ref.n]);
    }

    /**
     * Writes all pending splits into the layouts setting and stops the flush
     * timer. Never overwrites a corrupt layouts setting.
     * @param {AppFacade} app
     */
    flush(app) {
        if (this._flushTimer.id) {
            this._mainloop.source_remove(this._flushTimer.id);
            this._flushTimer.id = 0;
        }
        if (this._pending.size === 0) {
            return;
        }
        let layouts = layoutsParse(app.config.settings.getValue(SETTINGS_KEYS.layouts) || '');
        if (layouts === null) {
            // corrupt setting: same rule as layoutSet, never overwrite it
            this._pending.clear();
            if (!app.session.splitCorruptLogged) {
                app.session.splitCorruptLogged = true;
                this._global.log('greenTile layouts setting is corrupt, splits not written');
            }
            return;
        }
        app.session.splitCorruptLogged = false;
        for (const entry of this._pending.values()) {
            layouts = layoutsSet(layouts, entry.mkey, entry.wskey, { splits: { [entry.n]: entry.split } });
        }
        this._pending.clear();
        app.config.settings.setValue(SETTINGS_KEYS.layouts, JSON.stringify(layouts));
    }

    /**
     * Stores a pending split write; debounced by the 500 ms flush timer unless
     * flushNow.
     * @param {AppFacade} app
     * @param {{ key: string, mkey: string, wskey: string, n: string }} ref
     * @param {Split} split
     * @param {boolean} flushNow
     */
    remember(app, ref, split, flushNow) {
        this._pending.set(ref.key, { mkey: ref.mkey, wskey: ref.wskey, n: ref.n, split: split });
        if (flushNow) {
            this.flush(app);
            return;
        }
        if (this._flushTimer.id) {
            this._mainloop.source_remove(this._flushTimer.id);
        }
        this._flushTimer.id = this._mainloop.timeout_add(SPLIT_FLUSH_MS, () => {
            this._flushTimer.id = 0;
            this.flush(app);
            return false;
        });
    }

    /**
     * A split that the hotkeys have not yet written expires: a drop on the same
     * monitor + workspace + window count stores its shape and a stale pending
     * split would win over it on the next read.
     * @param {string} refKey
     */
    forget(refKey) {
        this._pending.delete(refKey);
    }

    /**
     * true when the monitor + workspace has stored (or pending) splits or dragged shapes —
     * shows the reset button
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} wsIndex
     * @returns {boolean}
     */
    any(app, monitorIndex, wsIndex) {
        const ref = this.ref(app, monitorIndex, wsIndex, 0);
        if (!ref) {
            return false;
        }
        const prefix = ref.mkey + '\n' + ref.wskey + '\n';
        for (const key of this._pending.keys()) {
            if (key.indexOf(prefix) === 0) {
                return true;
            }
        }
        const layouts = layoutsParse(app.config.settings.getValue(SETTINGS_KEYS.layouts) || '');
        return Object.keys(layoutsSplits(layouts, ref.mkey, ref.wskey)).length > 0
            || Object.keys(layoutsShapes(layouts, ref.mkey, ref.wskey)).length > 0;
    }

    /**
     * Removes pending splits and stored splits/shapes of the
     * monitor + workspace.
     * @param {AppFacade} app
     * @param {number} monitorIndex
     * @param {number} wsIndex
     */
    reset(app, monitorIndex, wsIndex) {
        const ref = this.ref(app, monitorIndex, wsIndex, 0);
        if (!ref) {
            return;
        }
        const prefix = ref.mkey + '\n' + ref.wskey + '\n';
        for (const key of Array.from(this._pending.keys())) {
            if (key.indexOf(prefix) === 0) {
                this._pending.delete(key);
            }
        }
        this._deps.layoutSet(app, monitorIndex, wsIndex, { splits: null, shapes: null });
        this._global.log('greenTile sizes reset ws' + (wsIndex + 1) + ' mon=' + ref.mkey);
    }

    /**
     * Keyboard repeat delay for the hotkey acceleration: the desktop's repeat delay
     * plus margin, 600 ms as the fallback when the schema is unreadable.
     * @returns {number}
     */
    repeatThreshold() {
        try {
            if (!this._keyboardSettings) {
                this._keyboardSettings = new this._gio.Settings({ schema_id: 'org.cinnamon.desktop.peripherals.keyboard' });
            }
            return this._keyboardSettings.get_uint('delay') + 100;
        }
        catch (_e) {
            return 600;
        }
    }

    /**
     * Resize hotkeys (Super+Alt+arrows): move a border of the focused window's cell. A tap
     * moves 1 px, holding the key accelerates (splitAccel). Retiles without animation
     * at every step; the split is written 500 ms after the last step.
     * @param {AppFacade} app
     * @param {string} action
     */
    hotkey(app, action) {
        const w = this._deps.focusWindow();
        if (!w) {
            return;
        }
        const monitorIndex = w.get_monitor();
        const wsIndex = this._global.workspace_manager.get_active_workspace().index();
        if (!this._deps.layoutFor(app, monitorIndex, wsIndex).auto) {
            return;
        }
        const monitor = this._main.layoutManager.monitors[monitorIndex];
        if (!monitor) {
            return;
        }
        const windows = this._deps.collectWindows(monitor, null);
        // only windows of the layout (focusWindow may fall back to another window)
        if (windows.indexOf(w) === -1) {
            return;
        }
        const n = windows.length;
        const layout = this._deps.layoutShape(app, monitorIndex, n);
        const ref = this.ref(app, monitorIndex, wsIndex, n);
        if (!layout || !ref) {
            return;
        }
        const area = this._deps.usableArea(monitor);
        const split = this.for(app, monitorIndex, wsIndex, n, layout);
        const f = w.get_frame_rect();
        const idx = splitCellAt(splitRects(layout.kind, layout.shape, split, area), [f.x, f.y, f.width, f.height]);
        const target = idx < 0 ? null : splitKeyTarget(layout.kind, layout.shape, idx, action);
        if (!target) {
            return;
        }
        const accel = splitAccel(this.keys.state, action, this._glib.get_monotonic_time() / 1000, this.repeatThreshold());
        this.keys.state = accel.state;
        const from = splitBorderPos(layout.kind, layout.shape, split, idx, target.edge, area);
        const next = splitMove(layout.kind, layout.shape, split, idx, target.edge, from + target.sign * accel.step, area, SPLIT_MIN_PX);
        // at the minimum size the border stays: no retile and no new flush timer per repeat
        if (!next || (split && JSON.stringify(next) === JSON.stringify(split))) {
            return;
        }
        this.remember(app, ref, next, false);
        this._deps.retileMonitor(app, monitorIndex, null, false);
    }

    /**
     * Edge resize of a tiled window (mouse or window menu): the moved edges become the new
     * borders of the layout (lib/model/split.js), stored for this monitor, workspace and
     * window count; the neighbours follow in the retile. Edges on the monitor border have
     * no neighbour: the window snaps back. With automatic tiling off it stays a free resize.
     * @param {AppFacade} app
     * @param {CinnamonWindow} w
     * @param {string} op
     */
    onResizeEnd(app, w, op) {
        const seq = w.get_stable_sequence();
        const start = app.auto.resizeStartTake(seq);
        const active = this._global.workspace_manager.get_active_workspace();
        if (!start || w.get_workspace() !== active) {
            return;
        }
        const monitorIndex = w.get_monitor();
        const wsIndex = active.index();
        if (!this._deps.layoutFor(app, monitorIndex, wsIndex).auto) {
            return;
        }
        const monitor = this._main.layoutManager.monitors[monitorIndex];
        if (!monitor || start.monitor !== monitorIndex) {
            app.auto.scheduleMonitor(app, monitorIndex, 250);
            return;
        }
        const windows = this._deps.collectWindows(monitor, null);
        if (windows.indexOf(w) === -1) {
            return;
        }
        const n = windows.length;
        const layout = this._deps.layoutShape(app, monitorIndex, n);
        const ref = this.ref(app, monitorIndex, wsIndex, n);
        if (!layout || !ref) {
            return;
        }
        // The retile sorts the dragged window by its frame at grab start, so a moved left or
        // top edge never pushes it into another cell (sortReadingOrder).
        app.auto.sortOverride(seq, start.rect, this._glib.get_monotonic_time() / 1000);
        const area = this._deps.usableArea(monitor);
        let split = this.for(app, monitorIndex, wsIndex, n, layout);
        const idx = splitCellAt(splitRects(layout.kind, layout.shape, split, area), start.rect);
        const f = w.get_frame_rect();
        const end = [f.x, f.y, f.width, f.height];
        // Only edges that really moved count: a click on the edge without dragging must not
        // store anything (the frame edge never sits exactly on the computed border — rounding,
        // terminals snap their size to character cells).
        const moved = splitFrameEdges(start.rect, end);
        const named = splitOpEdges(this._deps.grabOpName(op));
        const edges = named.length ? named.filter((/** @type {string} */ e) => moved.indexOf(e) !== -1) : moved;
        // The gap sits half on each side of a border (gapCell): border = frame edge + half gap outward.
        const gap = this._deps.gap(app);
        const lead = Math.floor(gap / 2);
        const trail = gap - lead;
        /** @type {Record<string, number>} */
        const pos = { left: f.x - lead, right: f.x + f.width + trail, top: f.y - lead, bottom: f.y + f.height + trail };
        let changed = false;
        for (const edge of edges) {
            const next = idx < 0 ? null : splitMove(layout.kind, layout.shape, split, idx, edge, pos[edge], area, SPLIT_MIN_PX);
            if (next) {
                split = next;
                changed = true;
            }
        }
        if (changed && split) {
            this.remember(app, ref, split, true);
            this._global.log('greenTile split stored ws' + (wsIndex + 1) + ' mon=' + ref.mkey + ' n=' + n + ' edges=' + edges.join('+'));
        }
        app.auto.scheduleMonitor(app, monitorIndex, 250);
    }

    /** Stops the flush timer and drops all pending writes. */
    destroy() {
        if (this._flushTimer.id) {
            try {
                this._mainloop.source_remove(this._flushTimer.id);
            }
            catch (_e) {
                // the source was already gone
            }
            this._flushTimer.id = 0;
        }
        // No settings write here: pending splits reach the settings through flush(),
        // called by Config.destroy before any teardown — after finalize nothing writes.
        this._pending.clear();
        this.keys.state = null;
        this._keyboardSettings = null;
    }
}

module.exports = {
    Split,
    SPLIT_FLUSH_MS,
};

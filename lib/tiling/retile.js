/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * Retile executors: the column hotkeys, the automatic grid, preset retiles,
 * the per-monitor dispatch and the monitor-wide retiles the settings bindings
 * and exclusion toggles trigger.
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const XLET = imports.extensions['greenTile@carsteneu'];

const { usableArea, focusWindow } = XLET.lib.tiling.screen;
const { collectWindows, windowTileable, windowMaximizedOrFullscreen } = XLET.lib.tiling.windows;
const { placeCell, placeFit } = XLET.lib.tiling.place;
const { sortReadingOrder } = XLET.lib.tiling.order;
const { orderSort } = XLET.lib.model['window-order'];
const { layoutFor, layoutShapeWs, autoAllowed } = XLET.lib.tiling.layout;
const { debugCount } = XLET.lib.tiling.debug;
const { singleActive, singleLeavesMaximized } = XLET.lib.model.single;
const { splitValid } = XLET.lib.model.split;
const { SETTINGS_KEYS } = XLET.lib.model['settings-keys'];

// The X11 window description the restart-order store records, or null for a
// window without one (a Wayland client) or a wrapper that is already gone.
/**
 * @param {CinnamonWindow} w
 * @returns {string | null}
 */
var windowDescription = (w) => {
    try {
        return w.get_description();
    }
    catch (_e) {
        return null;
    }
};

/**
 * The one window a lone placement would move, or null for any other count (0 or
 * 2 and up). The single-window mode's guard reads its maximize state.
 * @param {CinnamonWindow[]} windows collected windows of the monitor/workspace
 * @param {CinnamonWindow | null} focused
 * @param {boolean} hasFocus
 * @returns {CinnamonWindow | null}
 */
const loneWindow = (windows, focused, hasFocus) => (windows.length + (hasFocus ? 1 : 0) === 1)
    ? (hasFocus ? focused : windows[0]) : null;
/**
 * Whether the single-window mode must leave this lone window untouched because it
 * is already maximized (both directions) or fullscreen: the user's own full-area
 * placement, which a placement would unmaximize (windowReset) and shrink into the
 * centered frame. Only the mode's own lone placement skips here — a landing that
 * passes an explicit actionLayout (the split/drop route) still places, and any
 * count of two or more is untouched by this. The lone window's state is read only
 * once there IS a lone window, so no other count touches the window API.
 * @param {AppFacade} app
 * @param {CinnamonWindow[]} windows collected windows of the monitor/workspace
 * @param {CinnamonWindow | null} focused
 * @param {boolean} hasFocus
 * @param {Layout | null} actionLayout
 * @returns {boolean}
 */
const modeLeavesLone = (app, windows, focused, hasFocus, actionLayout) => {
    if (actionLayout != null) {
        return false;
    }
    const lone = loneWindow(windows, focused, hasFocus);
    return lone != null && singleLeavesMaximized(
        app.config.settings.getValue(SETTINGS_KEYS.singleWindowMode), 1, windowMaximizedOrFullscreen(lone));
};

/**
 * @param {AppFacade} app
 * @param {number} cols
 */
var appColumns = (app, cols) => {
    const Main = imports.ui.main;
    const focused = focusWindow();
    if (!focused) {
        return;
    }
    const monitor = Main.layoutManager.monitors[focused.get_monitor()];
    const [screenX, screenY, screenWidth, screenHeight] = usableArea(monitor);
    const windows = collectWindows(app, monitor, focused);
    debugCount(app, monitor, focused, windows);
    if (windows.length === 0) {
        return;
    }
    const colWidth = screenWidth / cols;
    // An excluded or otherwise inadmissible focused window (dialog, minimized, no
    // app) claims no column either — the others still fill them.
    const head = (!app.excl.isExcluded(focused) && windowTileable(focused)) ? [focused] : [];
    const ordered = sortReadingOrder(app, head.concat(windows), false).slice(0, cols);
    /** @type {Rect} */
    const area = [screenX, screenY, screenWidth, screenHeight];
    // The nominal columns double as the probe: a window that refuses its column reveals
    // its application minimum here. With no refusal the nominal columns ARE the whole
    // answer and the underfill (fewer windows than requested columns) is unchanged.
    let refused = false;
    /** @type {Rect[]} */
    const cells = [];
    for (let index = 0; index < ordered.length; index++) {
        const x = Math.round(screenX + index * colWidth);
        const cell = /** @type {Rect} */ ([x, screenY, Math.round(screenX + (index + 1) * colWidth) - x, screenHeight]);
        cells.push(cell);
        const placed = placeCell(app, ordered[index], ...cell, area);
        if (placed) { app.auto.pendingForget(ordered[index].get_stable_sequence()); }
        refused = refused || (!!placed && placed.got.width > placed.req[2] + 2);
    }
    if (!refused) {
        app.split.setPlacement(app, focused.get_monitor(), global.workspace_manager.get_active_workspace().index(), ordered.length, {
            kind: 'cols',
            shape: ordered.map(() => 1),
            split: ordered.length < cols ? { kind: 'cols', shape: ordered.map(() => 1),
                major: cells.map((c) => c[2] / (Math.round(colWidth * ordered.length))), minor: ordered.map(() => [1]) } : null,
            mins: ordered.map((w) => ({ seq: w.get_stable_sequence(), w: 0, h: 0 })),
            ...(ordered.length < cols ? { cells: cells, area: /** @type {Rect} */ ([screenX, screenY, Math.round(colWidth * ordered.length), screenHeight]) } : {}),
        });
        return;
    }
    // Something refused its column: hand the whole arrangement to the same fit the
    // automatic paths use, over the REAL usable area, so the widening, the exact gaps and
    // the fallback to fewer columns / stacking are all computed in one place — and so the
    // consumers read the arrangement that was genuinely placed.
    placeFit(app, ordered, { kind: 'cols', shape: ordered.map(() => 1) }, area, true,
        focused.get_monitor(), global.workspace_manager.get_active_workspace().index(), ordered.length);
};
// Reading order for a retile, with the fresh-window append rules shared by the
// auto grid and the presets: settled windows (plus the focused one) sort by
// position, new windows from the pending list append at the end in opening
// order — their spawn position is meaningless, and that order survives layout
// orientations and monitor changes. Consumes the pending list of the monitor.
// The first retile of a surface after enable also restores the recorded
// restart order (lib/runtime/orders.js) over the settled windows.
/**
 * @param {AppFacade} app
 * @param {number} monitorIndex
 * @param {CinnamonWindow[]} windows collected windows of the monitor/workspace
 * @param {CinnamonWindow | null} focused
 * @param {boolean} hasFocus
 * @param {boolean} columnMajor
 * @param {number | null} ws workspace index of the retile target
 * @param {boolean} useRestore false when this retile applies a user arrangement
 * @returns {CinnamonWindow[]}
 */
const orderWithFresh = (app, monitorIndex, windows, focused, hasFocus, columnMajor, ws, useRestore) => {
    const head = hasFocus && focused ? [focused] : [];
    const active = global.workspace_manager.get_active_workspace();
    // Pending records exist only for windows that opened on the ACTIVE workspace
    // (observer gate in lib/runtime/auto.js): retiles of any other workspace run
    // position-sorted and must not consume them, or the active workspace's
    // debounced retile loses the append order. The recorded restart order is used
    // only here too: a retile of a workspace the user is not looking at must not
    // spend the surface's one restore.
    if (!active || ws == null || ws !== active.index()) {
        return sortReadingOrder(app, head.concat(windows), columnMajor);
    }
    const pending = app.auto.pendingTake(monitorIndex);
    /** @type {CinnamonWindow[]} */
    const fresh = [];
    /** @type {CinnamonWindow[]} */
    const settled = [];
    for (const w of head.concat(windows)) {
        (pending.has(w.get_stable_sequence()) ? fresh : settled).push(w);
    }
    const settledOrder = sortReadingOrder(app, settled, columnMajor);
    // Muffin moved the windows before greenTile loaded; the recorded order from the
    // previous session wins over the positions they were scrambled into. A retile
    // that carries a user arrangement (useRestore false) is the user's word against
    // that older order, so it keeps what it placed. An order needs two windows: a
    // lone one is placed by the mode (lib/model/single.js), and restoring for a set
    // that is still opening would spend the surface's one restore before the rest of
    // its windows are back.
    const ids = useRestore && head.length + windows.length >= 2 ? app.orders.restore(app, monitorIndex, ws) : null;
    const restored = ids ? orderSort(ids, settledOrder, windowDescription) : settledOrder;
    if (fresh.length === 0) {
        return restored;
    }
    // opening order of the pending set wins over the spawn positions; a focused
    // fresh window (panel preset row click, swap) joins the append the same way
    const bySeq = new Map(fresh.map((w) => [w.get_stable_sequence(), w]));
    /** @type {CinnamonWindow[]} */
    const freshOrder = [];
    for (const seq of pending) {
        const w = bySeq.get(seq);
        if (w) {
            freshOrder.push(w);
        }
    }
    return restored.concat(freshOrder);
};
/**
 * Whether this retile carries a user arrangement: an explicit layout (a swap, or
 * the landing of a drag-and-drop) or a sort override left by a recent edge resize
 * or swap. Such a retile owns the order it places and the recorded restart order
 * must not overwrite it; it is also the arrangement to record. Peeking the
 * overrides does not consume them — the sort below does that.
 * @param {AppFacade} app
 * @param {CinnamonWindow[]} windows collected windows of the monitor/workspace
 * @param {CinnamonWindow | null} focused
 * @param {boolean} hasFocus
 * @param {Layout | null} actionLayout
 * @returns {boolean}
 */
var userArranged = (app, windows, focused, hasFocus, actionLayout) => {
    if (actionLayout) {
        return true;
    }
    const GLib = imports.gi.GLib;
    const now = GLib.get_monotonic_time() / 1000;
    app.auto.sortPoll(now);
    const list = hasFocus && focused ? [focused].concat(windows) : windows;
    for (const w of list) {
        if (app.auto.sortPeek(w.get_stable_sequence(), now)) {
            return true;
        }
    }
    return false;
};

/**
 * @param {AppFacade} app
 * @param {number} monitorIndex
 * @param {CinnamonWindow | null} focused
 * @param {boolean} [animate]
 * @param {number | null} [wsIndex]
 * @param {Layout | null} [actionLayout] arrangement addressed by this action only
 */
var appAuto = (app, monitorIndex, focused, animate = true, wsIndex = null, actionLayout = null) => {
    const Main = imports.ui.main;
    const monitor = Main.layoutManager.monitors[monitorIndex];
    if (!monitor) {
        return;
    }
    const ws = wsIndex != null ? wsIndex : global.workspace_manager.get_active_workspace().index();
    const area = usableArea(monitor);
    const windows = collectWindows(app, monitor, focused, ws);
    debugCount(app, monitor, focused, windows);
    const hasFocus = Boolean(focused && windowTileable(focused) && focused.get_monitor() === monitorIndex
        && !app.excl.isExcluded(focused));
    const n = windows.length + (hasFocus ? 1 : 0);
    if (n < 2 && !singleActive(app.config.settings.getValue(SETTINGS_KEYS.singleWindowMode), n)) {
        app.split.setPlacement(app, monitorIndex, ws, n, null);
        return;
    }
    // A lone maximized or fullscreen window is left exactly where it is: the mode
    // does not unmaximize it to re-place it.
    if (modeLeavesLone(app, windows, focused, hasFocus, actionLayout)) {
        app.split.setPlacement(app, monitorIndex, ws, n, null);
        return;
    }
    // Dragged shapes (lib/model/drop.js) win over the auto grid too: resolve through
    // layoutShapeWs, so the swap landing path (another workspace) also reads
    // the shape stored for that workspace. No tiling when nothing applies.
    let layout = actionLayout || layoutShapeWs(app, monitorIndex, ws, n);
    if (!layout) {
        app.split.setPlacement(app, monitorIndex, ws, n, null);
        return;
    }
    const columnMajor = layout.kind === 'cols';
    const arranged = userArranged(app, windows, focused, hasFocus, actionLayout);
    const ordered = orderWithFresh(app, monitorIndex, windows, focused, hasFocus, columnMajor, ws, !arranged);
    const recorded = !actionLayout && app.split.placementFor(app, monitorIndex, ws, n, ordered);
    const manual = recorded && recorded.area && splitValid(recorded.kind, recorded.shape, app.split.manual(app, monitorIndex, ws, n));
    if (manual) { layout = Object.assign({}, recorded, { split: manual }); }
    placeFit(app, ordered, layout, area, animate, monitorIndex, ws, n);
    // the surface retiled its whole window set: record the order it now has, so a
    // restart restores it (the column hotkey places a SUBSET and does not record).
    // A lone window reaches this too (the mode places it): record() ignores a list of
    // fewer than two instead of clearing the surface's stored order.
    app.orders.record(app, monitorIndex, ws, ordered, arranged);
};
/**
 * @param {AppFacade} app
 * @param {number} monitorIndex
 * @param {CinnamonWindow | null} focused
 * @param {boolean} [animate]
 * @param {number | null} [wsIndex]
 */
var presetRetile = (app, monitorIndex, focused, animate = true, wsIndex = null) => {
    const Main = imports.ui.main;
    const monitor = Main.layoutManager.monitors[monitorIndex];
    if (!monitor) {
        return;
    }
    const ws = wsIndex != null ? wsIndex : global.workspace_manager.get_active_workspace().index();
    const preset = layoutFor(app, monitorIndex, ws).preset;
    if (!preset) {
        return;
    }
    const area = usableArea(monitor);
    const windows = collectWindows(app, monitor, focused, ws);
    const hasFocus = Boolean(focused && windowTileable(focused) && focused.get_monitor() === monitorIndex
        && !app.excl.isExcluded(focused));
    const n = windows.length + (hasFocus ? 1 : 0);
    // A lone maximized or fullscreen window keeps its state: no preset placement.
    if (modeLeavesLone(app, windows, focused, hasFocus, null)) {
        app.split.setPlacement(app, monitorIndex, ws, n, null);
        return;
    }
    // the layout belongs to the workspace the windows were collected from, not the
    // active one (explicit wsIndex callers retile workspaces that are not active)
    const layout = layoutShapeWs(app, monitorIndex, ws, n);
    if (!layout) {
        app.split.setPlacement(app, monitorIndex, ws, n, null);
        return;
    }
    const columnMajor = layout.kind === 'cols';
    const arranged = userArranged(app, windows, focused, hasFocus, null);
    const ordered = orderWithFresh(app, monitorIndex, windows, focused, hasFocus, columnMajor, ws, !arranged);
    const fit = placeFit(app, ordered, layout, area, animate, monitorIndex, ws, n);
    app.orders.record(app, monitorIndex, ws, ordered, arranged);
    if (animate) {
        global.log('greenTile preset "' + preset.name + '" applied ws' + (ws + 1) + ' mon=' + (app.monitors.keys[monitorIndex] || '?') + ' n=' + n + ' stacks=[' + (layout.rule ? layout.rule.stacks.join(',') : '1') + ']' + (fit.split ? ' split' : ''));
    }};
// Retiles exactly one monitor: preset layout when (monitor, workspace) has one, else
// the auto grid when automatic tiling is on. A monitor whose entry has automatic
// tiling off — or that carries a RETAINED pause outranking the stored setting — is
// left alone (see autoAllowed); window-added debounces, exclusion toggles and manual
// retiles all come through here, while hotkeys retile directly.
/**
 * @param {AppFacade} app
 * @param {number} monitorIndex
 * @param {CinnamonWindow | null} focused
 * @param {boolean} [animate]
 * @param {number | null} [wsIndex]
 * @param {Layout | null} [actionLayout] arrangement addressed by this action only
 */
var retileMonitor = (app, monitorIndex, focused, animate = true, wsIndex = null, actionLayout = null) => {
    const ws = wsIndex != null ? wsIndex : global.workspace_manager.get_active_workspace().index();
    // one layout snapshot: the autoAllowed gate and the preset/auto branch read it
    const layout = layoutFor(app, monitorIndex, ws);
    if (!autoAllowed(app, monitorIndex, ws, layout)) {
        return;
    }
    if (actionLayout) {
        appAuto(app, monitorIndex, focused, animate, ws, actionLayout);
    }
    else if (layout.preset) {
        presetRetile(app, monitorIndex, focused, animate, ws);
    }
    else {
        appAuto(app, monitorIndex, focused, animate, ws);
    }
};
// The single-window mode takes effect immediately: changing the select retiles
// every monitor and workspace where greenTile tiles (preset or auto), so the lone
// window is placed per the new mode at once. "Leave it untouched" moves nothing.
/** @param {AppFacade} app */
var singleRetile = (app) => {
    const Main = imports.ui.main;
    const monitors = Main.layoutManager.monitors.length;
    const workspaces = global.workspace_manager.get_n_workspaces();
    for (let i = 0; i < monitors; i++) {
        for (let ws = 0; ws < workspaces; ws++) {
            const layout = layoutFor(app, i, ws);
            if (layout.preset || layout.auto) {
                retileMonitor(app, i, null, true, ws);
            }
        }
    }
};
// Retile every monitor whose layout can place windows: preset layouts directly, auto
// grids debounced (consistent with other debounced retiles).
/** @param {AppFacade} app */
var exclRetile = (app) => {
    const Main = imports.ui.main;
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    for (let i = 0; i < Main.layoutManager.monitors.length; i++) {
        const layout = layoutFor(app, i, wsIndex);
        if (layout.preset) {
            retileMonitor(app, i, null);
        }
        else if (layout.auto) {
            app.auto.scheduleMonitor(app, i, 150);
        }
    }
};

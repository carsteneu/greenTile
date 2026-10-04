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
const { collectWindows, windowTileable } = XLET.lib.tiling.windows;
const { placeCell, placeRects } = XLET.lib.tiling.place;
const { sortReadingOrder } = XLET.lib.tiling.order;
const { layoutFor, layoutShapeWs } = XLET.lib.tiling.layout;
const { debugCount } = XLET.lib.tiling.debug;
const { singleFill } = XLET.lib.model.single;
const { SETTINGS_KEYS } = XLET.lib.model['settings-keys'];

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
    for (let index = 0; index < ordered.length; index++) {
        placeCell(app, ordered[index], screenX + index * colWidth, screenY, colWidth, screenHeight, [screenX, screenY, screenWidth, screenHeight]);
    }
};
// Reading order for a retile, with the fresh-window append rules shared by the
// auto grid and the presets: settled windows (plus the focused one) sort by
// position, new windows from the pending list append at the end in opening
// order — their spawn position is meaningless, and that order survives layout
// orientations and monitor changes. Consumes the pending list of the monitor.
/**
 * @param {AppFacade} app
 * @param {number} monitorIndex
 * @param {CinnamonWindow[]} windows collected windows of the monitor/workspace
 * @param {CinnamonWindow | null} focused
 * @param {boolean} hasFocus
 * @param {boolean} columnMajor
 * @param {number | null} ws workspace index of the retile target
 * @returns {CinnamonWindow[]}
 */
const orderWithFresh = (app, monitorIndex, windows, focused, hasFocus, columnMajor, ws) => {
    const head = hasFocus && focused ? [focused] : [];
    const active = global.workspace_manager.get_active_workspace();
    // Pending records exist only for windows that opened on the ACTIVE workspace
    // (observer gate in lib/runtime/auto.js): retiles of any other workspace run
    // position-sorted and must not consume them, or the active workspace's
    // debounced retile loses the append order.
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
    if (fresh.length === 0) {
        return settledOrder;
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
    return settledOrder.concat(freshOrder);
};
/**
 * @param {AppFacade} app
 * @param {number} monitorIndex
 * @param {CinnamonWindow | null} focused
 * @param {boolean} [animate]
 * @param {number | null} [wsIndex]
 */
var appAuto = (app, monitorIndex, focused, animate = true, wsIndex = null) => {
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
    if (n < 2 && !singleFill(app.config.settings.getValue(SETTINGS_KEYS.fillSingleWindow), n)) {
        return;
    }
    // Dragged shapes (lib/model/drop.js) win over the auto grid too: resolve through
    // layoutShapeWs, so the swap landing path (another workspace) also reads
    // the shape stored for that workspace. No tiling when nothing applies.
    const layout = layoutShapeWs(app, monitorIndex, ws, n);
    if (!layout) {
        return;
    }
    const columnMajor = layout.kind === 'cols';
    const ordered = orderWithFresh(app, monitorIndex, windows, focused, hasFocus, columnMajor, ws);
    placeRects(app, ordered, layout, app.split.for(app, monitorIndex, ws, n, layout), area, animate);
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
    // the layout belongs to the workspace the windows were collected from, not the
    // active one (explicit wsIndex callers retile workspaces that are not active)
    const layout = layoutShapeWs(app, monitorIndex, ws, n);
    if (!layout) {
        return;
    }
    const columnMajor = layout.kind === 'cols';
    const ordered = orderWithFresh(app, monitorIndex, windows, focused, hasFocus, columnMajor, ws);
    const split = app.split.for(app, monitorIndex, ws, n, layout);
    placeRects(app, ordered, layout, split, area, animate);
    if (animate) {
        global.log('greenTile preset "' + preset.name + '" applied ws' + (ws + 1) + ' mon=' + (app.monitors.keys[monitorIndex] || '?') + ' n=' + n + ' stacks=[' + (layout.rule ? layout.rule.stacks.join(',') : '1') + ']' + (split ? ' split' : ''));
    }
};
// Retiles exactly one monitor: preset layout when (monitor, workspace) has one, else
// the auto grid when automatic tiling is on. Monitors whose entry has automatic tiling
// off are left alone — hotkeys retile directly and do not come through here.
/**
 * @param {AppFacade} app
 * @param {number} monitorIndex
 * @param {CinnamonWindow | null} focused
 * @param {boolean} [animate]
 * @param {number | null} [wsIndex]
 */
var retileMonitor = (app, monitorIndex, focused, animate = true, wsIndex = null) => {
    const Main = imports.ui.main;
    if (!app.monitors.ready || !Main.layoutManager.monitors[monitorIndex]) {
        return;
    }
    const ws = wsIndex != null ? wsIndex : global.workspace_manager.get_active_workspace().index();
    const layout = layoutFor(app, monitorIndex, ws);
    // Paused monitor-workspaces (auto off via Super+Ctrl+D) accept no retile action
    // until explicit reactivation (Super+Ctrl+A, preset row click, panel Auto switch —
    // they set auto first): window-added debounces, exclusion toggles and manual
    // retiles all come through here. A RETAINED pause counts as paused: the stored
    // setting can still say `auto` while the user's last command waits to be written
    // (a repair of a corrupt layouts setting, say), and an automatic retile — the
    // exclusion toggle's preset blast included — must not place windows against it.
    if (!layout.auto || app.session.holdsPause(app, monitorIndex, ws)) {
        return;
    }
    if (layout.preset) {
        presetRetile(app, monitorIndex, focused, animate, ws);
    }
    else {
        appAuto(app, monitorIndex, focused, animate, ws);
    }
};
// The single-window option takes effect immediately: switching it on retiles every
// monitor and workspace where greenTile tiles (preset or auto), so lone windows fill
// at once. Switching it off just stops greenTile from touching lone windows again.
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

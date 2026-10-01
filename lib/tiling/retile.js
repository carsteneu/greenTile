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

const { usableArea, focusWindow } = require('./lib/tiling/screen');
const { collectWindows } = require('./lib/tiling/windows');
const { placeCell, placeRects } = require('./lib/tiling/place');
const { sortReadingOrder } = require('./lib/tiling/order');
const { layoutFor, layoutShapeWs } = require('./lib/tiling/layout');
const { debugCount } = require('./lib/tiling/debug');
const { singleFill } = require('./lib/model/single');
const { SETTINGS_KEYS } = require('./lib/model/settings-keys');

const appColumns = (app, cols) => {
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
    // An excluded focused window is not tiled, the others still fill the columns.
    const ordered = sortReadingOrder(app, (app.excl.isExcluded(focused) ? windows : [focused].concat(windows)), false).slice(0, cols);
    for (let index = 0; index < ordered.length; index++) {
        placeCell(app, ordered[index], screenX + index * colWidth, screenY, colWidth, screenHeight, [screenX, screenY, screenWidth, screenHeight]);
    }
};
const appAuto = (app, monitorIndex, focusWindow, animate = true, wsIndex = null) => {
    const Main = imports.ui.main;
    const monitor = Main.layoutManager.monitors[monitorIndex];
    if (!monitor) {
        return;
    }
    const ws = wsIndex != null ? wsIndex : global.workspace_manager.get_active_workspace().index();
    const area = usableArea(monitor);
    const windows = collectWindows(app, monitor, focusWindow, ws);
    debugCount(app, monitor, focusWindow, windows);
    const focused = focusWindow && !focusWindow.minimized && focusWindow.get_monitor() === monitorIndex
        && !app.excl.isExcluded(focusWindow);
    const n = windows.length + (focused ? 1 : 0);
    if (n < 2 && !singleFill(app.config.settings.getValue(SETTINGS_KEYS.fillSingleWindow), n)) {
        return;
    }
    // New windows (opened while automatic tiling is on) append at the end — their spawn
    // position is meaningless for the reading order. Cleared after each tiling.
    const pending = app.auto.pendingTake(monitorIndex);
    const fresh = windows.filter((w) => pending.has(w.get_stable_sequence()));
    const settled = windows.filter((w) => !pending.has(w.get_stable_sequence()));
    // Sort direction follows the layout: column-major for columns, rows for rows.
    // Dragged shapes (lib/model/drop.js) win over the auto grid too: resolve through
    // layoutShapeWs, so the swap landing path (another workspace) also reads
    // the shape stored for that workspace. No tiling when nothing applies.
    const layout = layoutShapeWs(app, monitorIndex, ws, n);
    if (!layout) {
        return;
    }
    const columnMajor = layout.kind === 'cols';
    const ordered = sortReadingOrder(app, (focused ? [focusWindow] : []).concat(settled), columnMajor)
        .concat(sortReadingOrder(app, fresh, columnMajor));
    placeRects(app, ordered, layout, app.split.for(app, monitorIndex, ws, n, layout), area, animate);
};
const presetRetile = (app, monitorIndex, focusWindow, animate = true, wsIndex = null) => {
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
    const windows = collectWindows(app, monitor, focusWindow, ws);
    const focused = focusWindow && !focusWindow.minimized && focusWindow.get_monitor() === monitorIndex
        && !app.excl.isExcluded(focusWindow);
    const n = windows.length + (focused ? 1 : 0);
    // the layout belongs to the workspace the windows were collected from, not the
    // active one (explicit wsIndex callers retile workspaces that are not active)
    const layout = layoutShapeWs(app, monitorIndex, ws, n);
    if (!layout) {
        return;
    }
    const ordered = sortReadingOrder(app, (focused ? [focusWindow] : []).concat(windows), layout.kind === 'cols');
    const split = app.split.for(app, monitorIndex, ws, n, layout);
    placeRects(app, ordered, layout, split, area, animate);
    if (animate) {
        global.log('greenTile preset "' + preset.name + '" applied ws' + (ws + 1) + ' mon=' + (app.monitors.keys[monitorIndex] || '?') + ' n=' + n + ' stacks=[' + (layout.rule ? layout.rule.stacks.join(',') : '1') + ']' + (split ? ' split' : ''));
    }
};
// Retiles exactly one monitor: preset layout when (monitor, workspace) has one, else
// the auto grid when automatic tiling is on. Monitors whose entry has automatic tiling
// off are left alone — hotkeys retile directly and do not come through here.
const retileMonitor = (app, monitorIndex, focusWindow, animate = true, wsIndex = null) => {
    const Main = imports.ui.main;
    if (!app.monitors.ready || !Main.layoutManager.monitors[monitorIndex]) {
        return;
    }
    const ws = wsIndex != null ? wsIndex : global.workspace_manager.get_active_workspace().index();
    const layout = layoutFor(app, monitorIndex, ws);
    if (layout.preset) {
        presetRetile(app, monitorIndex, focusWindow, animate, ws);
    }
    else if (layout.auto)
        {appAuto(app, monitorIndex, focusWindow, animate, ws)}
};
// The single-window option takes effect immediately: switching it on retiles every
// monitor and workspace where greenTile tiles (preset or auto), so lone windows fill
// at once. Switching it off just stops greenTile from touching lone windows again.
const singleRetile = (app) => {
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
const exclRetile = (app) => {
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

module.exports = { appColumns, appAuto, presetRetile, retileMonitor, singleRetile, exclRetile };

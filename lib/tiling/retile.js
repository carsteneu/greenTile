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

const { getUsableScreenArea, tile_focus_window } = require('./lib/tiling/screen');
const { tile_collect_windows } = require('./lib/tiling/windows');
const { tile_place_cell, tile_place_rects } = require('./lib/tiling/place');
const { tile_sort_reading_order } = require('./lib/tiling/order');
const { tile_layout_for, tile_layout_shape_ws } = require('./lib/tiling/layout');
const { tile_debug_count } = require('./lib/tiling/debug');
const { tile_single_fill } = require('./lib/model/single');

const tile_app_columns = (app, cols) => {
    const Main = imports.ui.main;
    const focusWindow = tile_focus_window();
    if (!focusWindow)
        return;
    let monitor = Main.layoutManager.monitors[focusWindow.get_monitor()];
    let [screenX, screenY, screenWidth, screenHeight] = getUsableScreenArea(monitor);
    let windows = tile_collect_windows(app, monitor, focusWindow);
    tile_debug_count(app, monitor, focusWindow, windows);
    if (windows.length === 0)
        return;
    let colWidth = screenWidth / cols;
    // An excluded focused window is not tiled, the others still fill the columns.
    let ordered = tile_sort_reading_order(app, (app.excl.isExcluded(focusWindow) ? windows : [focusWindow].concat(windows)), false).slice(0, cols);
    for (let index = 0; index < ordered.length; index++) {
        tile_place_cell(app, ordered[index], screenX + index * colWidth, screenY, colWidth, screenHeight, [screenX, screenY, screenWidth, screenHeight]);
    }
};
const tile_app_auto = (app, monitorIndex, focusWindow, animate = true, wsIndex = null) => {
    const Main = imports.ui.main;
    const monitor = Main.layoutManager.monitors[monitorIndex];
    if (!monitor)
        return;
    const ws = wsIndex != null ? wsIndex : global.workspace_manager.get_active_workspace().index();
    const area = getUsableScreenArea(monitor);
    let windows = tile_collect_windows(app, monitor, focusWindow, ws);
    tile_debug_count(app, monitor, focusWindow, windows);
    const focused = focusWindow && !focusWindow.minimized && focusWindow.get_monitor() === monitorIndex
        && !app.excl.isExcluded(focusWindow);
    let n = windows.length + (focused ? 1 : 0);
    if (n < 2 && !tile_single_fill(app.config.settings.getValue('fillSingleWindow'), n))
        return;
    // New windows (opened while automatic tiling is on) append at the end — their spawn
    // position is meaningless for the reading order. Cleared after each tiling.
    let pending = app.auto.pendingTake(monitorIndex);
    let fresh = windows.filter((w) => pending.has(w.get_stable_sequence()));
    let settled = windows.filter((w) => !pending.has(w.get_stable_sequence()));
    // Sort direction follows the layout: column-major for columns, rows for rows.
    // Dragged shapes (lib/model/drop.js) win over the auto grid too: resolve through
    // tile_layout_shape_ws, so the swap landing path (another workspace) also reads
    // the shape stored for that workspace. No tiling when nothing applies.
    const layout = tile_layout_shape_ws(app, monitorIndex, ws, n);
    if (!layout)
        return;
    const columnMajor = layout.kind === 'cols';
    const ordered = tile_sort_reading_order(app, (focused ? [focusWindow] : []).concat(settled), columnMajor)
        .concat(tile_sort_reading_order(app, fresh, columnMajor));
    tile_place_rects(app, ordered, layout, app.split.for(app, monitorIndex, ws, n, layout), area, animate);
};
const tile_preset_retile = (app, monitorIndex, focusWindow, animate = true, wsIndex = null) => {
    const Main = imports.ui.main;
    const monitor = Main.layoutManager.monitors[monitorIndex];
    if (!monitor)
        return;
    const ws = wsIndex != null ? wsIndex : global.workspace_manager.get_active_workspace().index();
    const preset = tile_layout_for(app, monitorIndex, ws).preset;
    if (!preset)
        return;
    const area = getUsableScreenArea(monitor);
    const windows = tile_collect_windows(app, monitor, focusWindow, ws);
    const focused = focusWindow && !focusWindow.minimized && focusWindow.get_monitor() === monitorIndex
        && !app.excl.isExcluded(focusWindow);
    const n = windows.length + (focused ? 1 : 0);
    // the layout belongs to the workspace the windows were collected from, not the
    // active one (explicit wsIndex callers retile workspaces that are not active)
    const layout = tile_layout_shape_ws(app, monitorIndex, ws, n);
    if (!layout)
        return;
    const ordered = tile_sort_reading_order(app, (focused ? [focusWindow] : []).concat(windows), layout.kind === 'cols');
    const split = app.split.for(app, monitorIndex, ws, n, layout);
    tile_place_rects(app, ordered, layout, split, area, animate);
    if (animate)
        global.log('greenTile preset "' + preset.name + '" applied ws' + (ws + 1) + ' mon=' + (app.monitors.keys[monitorIndex] || '?') + ' n=' + n + ' stacks=[' + (layout.rule ? layout.rule.stacks.join(',') : '1') + ']' + (split ? ' split' : ''));
};
// Retiles exactly one monitor: preset layout when (monitor, workspace) has one, else
// the auto grid when automatic tiling is on. Monitors whose entry has automatic tiling
// off are left alone — hotkeys retile directly and do not come through here.
const tile_retile_monitor = (app, monitorIndex, focusWindow, animate = true, wsIndex = null) => {
    const Main = imports.ui.main;
    if (!app.monitors.ready || !Main.layoutManager.monitors[monitorIndex])
        return;
    const ws = wsIndex != null ? wsIndex : global.workspace_manager.get_active_workspace().index();
    const layout = tile_layout_for(app, monitorIndex, ws);
    if (layout.preset)
        tile_preset_retile(app, monitorIndex, focusWindow, animate, ws);
    else if (layout.auto)
        tile_app_auto(app, monitorIndex, focusWindow, animate, ws)
};
// The single-window option takes effect immediately: switching it on retiles every
// monitor and workspace where greenTile tiles (preset or auto), so lone windows fill
// at once. Switching it off just stops greenTile from touching lone windows again.
const tile_single_retile = (app) => {
    const Main = imports.ui.main;
    const monitors = Main.layoutManager.monitors.length;
    const workspaces = global.workspace_manager.get_n_workspaces();
    for (let i = 0; i < monitors; i++) {
        for (let ws = 0; ws < workspaces; ws++) {
            const layout = tile_layout_for(app, i, ws);
            if (layout.preset || layout.auto)
                tile_retile_monitor(app, i, null, true, ws);
        }
    }
};
// Retile every monitor whose layout can place windows: preset layouts directly, auto
// grids debounced (consistent with other debounced retiles).
const tile_excl_retile = (app) => {
    const Main = imports.ui.main;
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    for (let i = 0; i < Main.layoutManager.monitors.length; i++) {
        const layout = tile_layout_for(app, i, wsIndex);
        if (layout.preset)
            tile_retile_monitor(app, i, null);
        else if (layout.auto)
            app.auto.scheduleMonitor(app, i, 150);
    }
};

module.exports = { tile_app_columns, tile_app_auto, tile_preset_retile, tile_retile_monitor, tile_single_retile, tile_excl_retile };

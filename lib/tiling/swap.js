/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * Super+Ctrl+Arrow swap hotkeys: swap the focused tiled window with its
 * neighbour — or, when nothing borders in that direction, push it along the
 * monitor/workspace chain onto the next tiling's edge slot.
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const { getUsableScreenArea, tile_focus_window } = require('./lib/tiling/screen');
const { tile_collect_windows } = require('./lib/tiling/windows');
const { tile_layout_shape } = require('./lib/tiling/layout');
const { tile_sort_reading_order } = require('./lib/tiling/order');
const { tile_retile_monitor } = require('./lib/tiling/retile');
const { tile_split_rects } = require('./lib/model/split');
const { tile_swap_neighbor, tile_swap_landing_cell, tile_swap_chain_step } = require('./lib/model/swap');

const tile_swap_override = (app, metaWindow, rect) => {
    const GLib = imports.gi.GLib;
    app.auto.sortOverride(metaWindow.get_stable_sequence(), rect, GLib.get_monotonic_time() / 1000);
};
// Super+Ctrl+Arrow hotkeys: swap the focused tiled window with its neighbor (both
// windows sort into each other's cell, then the monitor retiles), or — when nothing
// borders in the direction pressed — push it along the monitor chain onto the next
// monitor/workspace, where it lands in the edge slot (insert, not swap). Focus always
// stays on the moved window so repeated presses keep moving the same window.
const tile_swap_hotkey = (app, dir) => {
    const GLib = imports.gi.GLib;
    const Main = imports.ui.main;
    const focusWindow = tile_focus_window();
    if (!focusWindow || focusWindow.minimized || focusWindow.is_on_all_workspaces() || app.excl.isExcluded(focusWindow))
        return;
    const monitorIndex = focusWindow.get_monitor();
    const monitor = Main.layoutManager.monitors[monitorIndex];
    if (!monitor || !app.monitors.ready)
        return;
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    const area = getUsableScreenArea(monitor);
    const frame = focusWindow.get_frame_rect();
    const frameRect = [frame.x, frame.y, frame.width, frame.height];
    const windows = tile_collect_windows(app, monitor, focusWindow);
    const n = windows.length + 1;
    const layout = tile_layout_shape(app, monitorIndex, n);
    let cells = null;
    let ordered = null;
    let selfIdx = -1;
    if (layout) {
        const split = app.split.for(app, monitorIndex, wsIndex, n, layout);
        cells = tile_split_rects(layout.kind, layout.shape, split, area);
        ordered = tile_sort_reading_order(app, [focusWindow].concat(windows), layout.kind === 'cols');
        selfIdx = ordered.indexOf(focusWindow);
    }
    if (layout && selfIdx >= 0) {
        const nb = tile_swap_neighbor(cells, selfIdx, dir);
        if (nb != null) {
            tile_swap_override(app, focusWindow, cells[nb]);
            tile_swap_override(app, ordered[nb], cells[selfIdx]);
            tile_retile_monitor(app, monitorIndex, focusWindow);
            global.log('greenTile swap ' + dir + ' ws' + (wsIndex + 1) + ' mon=' + (app.monitors.keys[monitorIndex] || '?') + ' n=' + n);
            return;
        }
    }
    if (dir === 'up' || dir === 'down')
        return;
    const step = tile_swap_chain_step({
        dir: dir,
        monitorIndex: monitorIndex,
        primaryIndex: Main.layoutManager.primaryIndex,
        onlyPrimary: app.monitors.onlyPrimary(),
        monitors: Main.layoutManager.monitors.map((m, i) => ({ index: i, x: m.x, width: m.width })),
        workspaces: global.screen.get_n_workspaces(),
        wsIndex: wsIndex,
    });
    if (!step)
        return;
    const targetMonitor = Main.layoutManager.monitors[step.monitor];
    if (!targetMonitor)
        return;
    // On a target monitor without active tiling the window lands untiled (move only,
    // size kept): no slot is computed and no retile is triggered on the target.
    if (step.kind === 'monitor') {
        const nTarget = tile_collect_windows(app, targetMonitor, null).length + 1;
        const targetLayout = tile_layout_shape(app, step.monitor, nTarget);
        if (targetLayout) {
            const targetSplit = app.split.for(app, step.monitor, wsIndex, nTarget, targetLayout);
            const targetCells = tile_split_rects(targetLayout.kind, targetLayout.shape, targetSplit, getUsableScreenArea(targetMonitor));
            const slotIdx = tile_swap_landing_cell(targetCells, frameRect, step.slot === 'first' ? 'right' : 'left');
            if (slotIdx != null)
                tile_swap_override(app, focusWindow, targetCells[slotIdx]);
        }
        focusWindow.move_to_monitor(step.monitor);
        tile_retile_monitor(app, step.monitor, focusWindow);
        tile_retile_monitor(app, monitorIndex, null, true, wsIndex);
        global.log('greenTile swap pushed mon=' + (app.monitors.keys[monitorIndex] || '?') + ' -> mon=' + (app.monitors.keys[step.monitor] || '?') + ' ws' + (wsIndex + 1));
        return;
    }
    // Workspace landing: the count of the other windows is read before the switch, the
    // slot is computed AFTER it (tile_layout_shape reads the active workspace). The
    // window is moved to the landing monitor too — a workspace switch alone would leave
    // it on the source monitor. The source workspace retiles with one window less even
    // though it is no longer active.
    const targetWsIndex = wsIndex + step.delta;
    const nTarget = tile_collect_windows(app, targetMonitor, null, targetWsIndex).length + 1;
    // Muffin's signature is (index, append); Cinnamon's main.js passes a third time
    // argument that GJS drops with a "Too many arguments" warning.
    focusWindow.change_workspace_by_index(targetWsIndex, false);
    focusWindow.move_to_monitor(step.monitor);
    global.workspace_manager.get_workspace_by_index(targetWsIndex).activate_with_focus(focusWindow, global.get_current_time());
    const targetLayout = tile_layout_shape(app, step.monitor, nTarget);
    if (targetLayout) {
        const targetSplit = app.split.for(app, step.monitor, targetWsIndex, nTarget, targetLayout);
        const targetCells = tile_split_rects(targetLayout.kind, targetLayout.shape, targetSplit, getUsableScreenArea(targetMonitor));
        const slotIdx = tile_swap_landing_cell(targetCells, frameRect, step.slot === 'first' ? 'right' : 'left');
        if (slotIdx != null)
            tile_swap_override(app, focusWindow, targetCells[slotIdx]);
    }
    tile_retile_monitor(app, step.monitor, focusWindow, true, targetWsIndex);
    tile_retile_monitor(app, monitorIndex, null, true, wsIndex);
    global.log('greenTile swap pushed mon=' + (app.monitors.keys[monitorIndex] || '?') + ' -> ws' + (targetWsIndex + 1) + ' mon=' + (app.monitors.keys[step.monitor] || '?'));
};

module.exports = { tile_swap_hotkey, tile_swap_override };

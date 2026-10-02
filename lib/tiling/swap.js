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

const XLET = imports.extensions['greenTile@carsteneu'];

const { usableArea, focusWindow } = XLET.lib.tiling.screen;
const { collectWindows } = XLET.lib.tiling.windows;
const { layoutFor, layoutShape } = XLET.lib.tiling.layout;
const { sortReadingOrder } = XLET.lib.tiling.order;
const { retileMonitor } = XLET.lib.tiling.retile;
const { splitRects } = XLET.lib.model.split;
const { swapNeighbor, swapLandingCell, swapChainStep } = XLET.lib.model.swap;

/**
 * @param {AppFacade} app
 * @param {CinnamonWindow} metaWindow
 * @param {Rect} rect
 */
var swapOverride = (app, metaWindow, rect) => {
    const GLib = imports.gi.GLib;
    app.auto.sortOverride(metaWindow.get_stable_sequence(), rect, GLib.get_monotonic_time() / 1000);
};
// Super+Ctrl+Arrow hotkeys: swap the focused tiled window with its neighbor (both
// windows sort into each other's cell, then the monitor retiles), or — when nothing
// borders in the direction pressed — push it along the monitor chain onto the next
// monitor/workspace, where it lands in the edge slot (insert, not swap). Focus always
// stays on the moved window so repeated presses keep moving the same window.
/**
 * @param {AppFacade} app
 * @param {'left'|'right'|'up'|'down'} dir
 */
var swapHotkey = (app, dir) => {
    const Main = imports.ui.main;
    const focused = focusWindow();
    if (!focused || focused.minimized || focused.is_on_all_workspaces() || app.excl.isExcluded(focused)) {
        return;
    }
    const monitorIndex = focused.get_monitor();
    const monitor = Main.layoutManager.monitors[monitorIndex];
    if (!monitor || !app.monitors.ready) {
        return;
    }
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    // Paused monitor-workspaces accept no swap intervention at all — neither the
    // local exchange nor the monitor/workspace chain push below. layoutShape only
    // returns null for them (same as for a lone window), which used to fall through
    // into the chain step and moved the window despite auto:false.
    if (!layoutFor(app, monitorIndex, wsIndex).auto) {
        return;
    }
    const area = usableArea(monitor);
    const frame = focused.get_frame_rect();
    /** @type {Rect} */
    const frameRect = [frame.x, frame.y, frame.width, frame.height];
    const windows = collectWindows(app, monitor, focused);
    const n = windows.length + 1;
    const layout = layoutShape(app, monitorIndex, n);
    /** @type {Rect[] | null} */
    let cells = null;
    /** @type {CinnamonWindow[] | null} */
    let ordered = null;
    let selfIdx = -1;
    if (layout) {
        const split = app.split.for(app, monitorIndex, wsIndex, n, layout);
        cells = splitRects(layout.kind, layout.shape, split, area);
        ordered = sortReadingOrder(app, [focused].concat(windows), layout.kind === 'cols');
        selfIdx = /** @type {CinnamonWindow[]} */ (ordered).indexOf(focused);
    }
    if (layout && selfIdx >= 0) {
        // cells/ordered are always filled when layout is non-null (both assignments
        // above ran); the casts restate that invariant for tsc.
        const nb = swapNeighbor(/** @type {Rect[]} */ (cells), selfIdx, dir);
        if (nb != null) {
            swapOverride(app, focused, (/** @type {Rect[]} */ (cells))[nb]);
            swapOverride(app, (/** @type {CinnamonWindow[]} */ (ordered))[nb], (/** @type {Rect[]} */ (cells))[selfIdx]);
            retileMonitor(app, monitorIndex, focused);
            global.log('greenTile swap ' + dir + ' ws' + (wsIndex + 1) + ' mon=' + (app.monitors.keys[monitorIndex] || '?') + ' n=' + n);
            return;
        }
    }
    if (dir === 'up' || dir === 'down') {
        return;
    }
    const step = swapChainStep({
        dir: dir,
        monitorIndex: monitorIndex,
        primaryIndex: Main.layoutManager.primaryIndex,
        onlyPrimary: app.monitors.onlyPrimary(),
        monitors: Main.layoutManager.monitors.map((/** @type {AnyRecord} */ m, /** @type {number} */ i) => ({ index: i, x: m.x, width: m.width })),
        workspaces: global.workspace_manager.get_n_workspaces(),
        wsIndex: wsIndex,
    });
    if (!step) {
        return;
    }
    const targetMonitor = Main.layoutManager.monitors[step.monitor];
    if (!targetMonitor) {
        return;
    }
    // On a target monitor without active tiling the window lands untiled (move only,
    // size kept): no slot is computed and no retile is triggered on the target.
    if (step.kind === 'monitor') {
        const nTarget = collectWindows(app, targetMonitor, null).length + 1;
        const targetLayout = layoutShape(app, step.monitor, nTarget);
        if (targetLayout) {
            const targetSplit = app.split.for(app, step.monitor, wsIndex, nTarget, targetLayout);
            const targetCells = splitRects(targetLayout.kind, targetLayout.shape, targetSplit, usableArea(targetMonitor));
            const slotIdx = swapLandingCell(targetCells, frameRect, step.slot === 'first' ? 'right' : 'left');
            if (slotIdx != null) {
                swapOverride(app, focused, targetCells[slotIdx]);
            }
        }
        focused.move_to_monitor(step.monitor);
        retileMonitor(app, step.monitor, focused);
        retileMonitor(app, monitorIndex, null, true, wsIndex);
        global.log('greenTile swap pushed mon=' + (app.monitors.keys[monitorIndex] || '?') + ' -> mon=' + (app.monitors.keys[step.monitor] || '?') + ' ws' + (wsIndex + 1));
        return;
    }
    // Workspace landing: the count of the other windows is read before the switch, the
    // slot is computed AFTER it (layoutShape reads the active workspace). The
    // window is moved to the landing monitor too — a workspace switch alone would leave
    // it on the source monitor. The source workspace retiles with one window less even
    // though it is no longer active.
    const targetWsIndex = wsIndex + step.delta;
    const nTarget = collectWindows(app, targetMonitor, null, targetWsIndex).length + 1;
    // Muffin's signature is (index, append); Cinnamon's main.js passes a third time
    // argument that GJS drops with a "Too many arguments" warning.
    focused.change_workspace_by_index(targetWsIndex, false);
    focused.move_to_monitor(step.monitor);
    global.workspace_manager.get_workspace_by_index(targetWsIndex).activate_with_focus(focused, global.get_current_time());
    const targetLayout = layoutShape(app, step.monitor, nTarget);
    if (targetLayout) {
        const targetSplit = app.split.for(app, step.monitor, targetWsIndex, nTarget, targetLayout);
        const targetCells = splitRects(targetLayout.kind, targetLayout.shape, targetSplit, usableArea(targetMonitor));
        const slotIdx = swapLandingCell(targetCells, frameRect, step.slot === 'first' ? 'right' : 'left');
        if (slotIdx != null) {
            swapOverride(app, focused, targetCells[slotIdx]);
        }
    }
    retileMonitor(app, step.monitor, focused, true, targetWsIndex);
    retileMonitor(app, monitorIndex, null, true, wsIndex);
    global.log('greenTile swap pushed mon=' + (app.monitors.keys[monitorIndex] || '?') + ' -> ws' + (targetWsIndex + 1) + ' mon=' + (app.monitors.keys[step.monitor] || '?'));
};

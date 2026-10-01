/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * Tiling screen services: the usable work area behind Cinnamon's panels and
 * the focus-window resolution the hotkeys and retiles build on.
 * getPanelHeight/getUsableScreenArea are derived from gTile 2.2.1
 * (src/base/utils.ts).
 *
 * Copyright (C) vibou, shuairan and the gTile contributors
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const getPanelHeight = (panel) => {
    return panel.height
        || panel.actor.get_height();
};
const getUsableScreenArea = (monitor) => {
    const Main = imports.ui.main;
    const Panel = imports.ui.panel;
    let top = monitor.y;
    let bottom = monitor.y + monitor.height;
    let left = monitor.x;
    let right = monitor.x + monitor.width;
    for (let panel of Main.panelManager.getPanelsInMonitor(monitor.index)) {
        if (!panel.isHideable()) {
            switch (panel.panelPosition) {
                case Panel.PanelLoc.top:
                    top += getPanelHeight(panel);
                    break;
                case Panel.PanelLoc.bottom:
                    bottom -= getPanelHeight(panel);
                    break;
                case Panel.PanelLoc.left:
                    left += getPanelHeight(panel);
                    break;
                case Panel.PanelLoc.right:
                    right -= getPanelHeight(panel);
                    break;
            }
        }
    }
    let width = right > left ? right - left : 0;
    let height = bottom > top ? bottom - top : 0;
    return [left, top, width, height];
};
// The real focus may sit on another workspace (e.g. a maximized terminal there);
// muffin ignores resizes on maximized windows, so such a window would claim a slot
// and leave it empty. Accept only visible normal windows of the active workspace,
// otherwise fall back to the first visible window here.
const tile_focus_window = () => {
    const Meta = imports.gi.Meta;
    const Main = imports.ui.main;
    let focus = getFocusApp();
    let active = global.workspace_manager.get_active_workspace();
    if (focus && !focus.minimized && focus.get_window_type() === Meta.WindowType.NORMAL
        && (focus.get_workspace() === active || focus.is_on_all_workspaces()))
        return focus;
    let tabList = Main.getTabList();
    return tabList.length > 0 ? tabList[0] : null;
};
const getFocusApp = () => {
    return global.display.focus_window;
};
// Monitor registry: stable per-monitor keys and display labels — per-App
// component in lib/runtime/monitors.js, owned by the App (monitors-changed
// destroys the App), riding the DisplayConfig DBus call with the epoch guard and
// a cancellable. The fallback-logged flag rides the extension session.
const tile_monitor_index_of = (metaWindow) => metaWindow.get_monitor();
const tile_focus_monitor_index = () => {
    const Main = imports.ui.main;
    const focusWindow = tile_focus_window();
    return focusWindow ? focusWindow.get_monitor() : Main.layoutManager.primaryIndex;
};

module.exports = { getPanelHeight, getUsableScreenArea, tile_focus_window, getFocusApp, tile_monitor_index_of, tile_focus_monitor_index };

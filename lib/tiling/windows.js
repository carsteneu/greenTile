/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * Window collecting and window geometry: the own window collector instead of
 * gTile's GetNotFocusedWindowsOfMonitor, plus the reset / move-resize window
 * operations, derived from gTile 2.2.1 (src/base/utils.ts).
 *
 * Copyright (C) vibou, shuairan and the gTile contributors
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

// Own collector instead of gTile's GetNotFocusedWindowsOfMonitor: that one excludes
// app.focusMetaWindow, which goes stale because gTile tracks focus via the app-level
// 'notify::focus-app' signal (silent on same-app window switches) — visible windows
// get dropped. RULE: active workspace only, never pull windows across workspaces.
const collectWindows = (app, monitor, focusWindow, wsIndex = null) => {
    const Main = imports.ui.main;
    const Meta = imports.gi.Meta;
    const tracker = imports.gi.Cinnamon.WindowTracker.get_default();
    let result = [];
    let tabList = wsIndex == null ? Main.getTabList()
        : global.workspace_manager.get_workspace_by_index(wsIndex).list_windows();
    for (let i = 0; i < tabList.length; i++) {
        let w = tabList[i];
        if (w === focusWindow || w.minimized || w.get_wm_class() == null)
            continue;
        if (w.get_window_type() !== Meta.WindowType.NORMAL)
            continue;
        if (app.excl.isExcluded(w))
            continue;
        if (Main.layoutManager.monitors[w.get_monitor()] !== monitor)
            continue;
        if (tracker.get_window_app(w) == null)
            continue;
        result.push(w);
    }
    return result;
};

// Window reset, derived from gTile 2.2.1 src/base/utils.ts: let go of both
// maximize states before a tile placement, in the order Muffin settles best.
const windowReset = (metaWindow) => {
    const Meta = imports.gi.Meta;
    metaWindow?.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
    metaWindow?.unmaximize(Meta.MaximizeFlags.VERTICAL);
    metaWindow?.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
};

// Move-resize, derived from gTile 2.2.1 src/base/utils.ts: the extra move_frame
// call pins the window onto fractional-scale monitors where move_resize_frame
// alone leaves it one frame short.
const windowMoveResize = (metaWindow, x, y, width, height) => {
    if (!metaWindow)
        return;
    metaWindow.move_resize_frame(true, x, y, width, height);
    metaWindow.move_frame(true, x, y);
};

module.exports = { collectWindows, windowReset, windowMoveResize };

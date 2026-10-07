/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * Retile diagnostics: logs which windows a collect skipped and why — a canary
 * against drift between this reason list and the collector's filters.
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

// Diagnostics: the reason list mirrors the collectWindows filters by design —
// 'UNKNOWN' means the two have drifted apart (canary, should never appear).
/**
 * @param {AppFacade} app
 * @param {CinnamonMonitor} monitor
 * @param {CinnamonWindow | null} focusWindow
 * @param {CinnamonWindow[]} collected
 */
var debugCount = (app, monitor, focusWindow, collected) => {
    const Meta = imports.gi.Meta;
    const Main = imports.ui.main;
    try {
        const all = global.workspace_manager.get_active_workspace().list_windows();
        const missing = [];
        for (let i = 0; i < all.length; i++) {
            const w = all[i];
            if (w === focusWindow || collected.indexOf(w) > -1) {
                continue;
            }
            const reasons = [];
            if (w.minimized) {
                reasons.push('minimized');
            }
            if (w.get_wm_class() == null) {
                reasons.push('wm_class');
            }
            if (app.excl.isExcluded(w)) {
                reasons.push('excluded');
            }
            if (Main.getTabList().indexOf(w) === -1) {
                reasons.push('not-in-tablist');
            }
            if (imports.gi.Cinnamon.WindowTracker.get_default().get_window_app(w) == null) {
                reasons.push('no-app');
            }
            if (Main.layoutManager.monitors[w.get_monitor()] !== monitor) {
                reasons.push('monitor');
            }
            if (w.get_window_type() !== Meta.WindowType.NORMAL) {
                reasons.push('type=' + w.get_window_type());
            }
            if (w.get_transient_for() != null) {
                reasons.push('transient');
            }
            if (!w.allows_resize()) {
                reasons.push('non-resizable');
            }
            missing.push(String(w.get_wm_class()) + ' "' + String(w.get_title()).slice(0, 20) + '": ' + (reasons.join(',') || 'UNKNOWN'));
        }
        if (missing.length > 0) {
            global.log('greenTile skipped ' + missing.length + ' window(s) on active workspace: ' + missing.join(' | '));
        }
    }
    catch (e) {
        global.log('greenTile debugCount error: ' + e);
    }
};

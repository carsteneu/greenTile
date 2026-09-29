/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * This file is a modified version of gTile (UUID gTile@shuairan), version 2.2.1.
 * It is derived from gTile's compiled webpack bundle 5.4/gTile.js:
 *   - gTile was originally developed by vibou for GNOME Shell
 *     https://github.com/vibou/vibou.gTile
 *   - ported to Cinnamon by shuairan
 *     https://github.com/shuairan/gTile
 *   - maintained by the community in the Linux Mint Spices repository
 *     https://github.com/linuxmint/cinnamon-spices-extensions/tree/master/gTile%40shuairan
 *
 * Modified by carsten_eu since 2026-09-04: column hotkeys, auto mode with
 * snap-on-release and animation, own window collector, per-workspace presets
 * and the preset panel. New code lives mainly in the functions and objects
 * prefixed tile_*; the original gTile classes were changed where needed
 * (hotkey registration, settings bindings, UUID, icon path). See README.md.
 *
 * Copyright (C) vibou, shuairan and the gTile contributors
 * Copyright (C) 2026 carsten_eu
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-3.0-only
 */
var gtile;
/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	// The require scope
/******/ 	var __webpack_require__ = {};
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};
// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  disable: () => (/* binding */ disable),
  enable: () => (/* binding */ enable),
  init: () => (/* binding */ init)
});

;// CONCATENATED MODULE: ../base/config.ts

const Settings = imports.ui.settings;
const Main = imports.ui.main;
const Tooltips = imports.ui.tooltips;
class Config {
    constructor(app) {
        this.EnableHotkey = () => {
            this.DisableHotkey();
            Main.keybindingManager.addHotKey('greenTile-auto6', this.autotile6Hotkey, () => tile_app_columns(this.app, 6));
            Main.keybindingManager.addHotKey('greenTile-auto3', this.autotile3Hotkey, () => tile_app_columns(this.app, 3));
            Main.keybindingManager.addHotKey('greenTile-autoN', this.autotileAutoHotkey, () => tile_auto_activate(this.app));
            Main.keybindingManager.addHotKey('greenTile-autoOff', this.autotileOffHotkey, () => tile_auto_deactivate(this.app));
            Main.keybindingManager.addHotKey('greenTile-preset', this.presetHotkey, () => tile_panel_toggle(this.app));
            Main.keybindingManager.addHotKey('greenTile-exclude', this.excludeHotkey, () => tile_excl_toggle_focused(this.app));
            Main.keybindingManager.addHotKey('greenTile-resize-wider', this.resizeWiderHotkey, () => tile_split_hotkey(this.app, 'wider'));
            Main.keybindingManager.addHotKey('greenTile-resize-narrower', this.resizeNarrowerHotkey, () => tile_split_hotkey(this.app, 'narrower'));
            Main.keybindingManager.addHotKey('greenTile-resize-taller', this.resizeTallerHotkey, () => tile_split_hotkey(this.app, 'taller'));
            Main.keybindingManager.addHotKey('greenTile-resize-shorter', this.resizeShorterHotkey, () => tile_split_hotkey(this.app, 'shorter'));
        };
        this.DisableHotkey = () => {
            Main.keybindingManager.removeHotKey('greenTile-auto6');
            Main.keybindingManager.removeHotKey('greenTile-auto3');
            Main.keybindingManager.removeHotKey('greenTile-autoN');
            Main.keybindingManager.removeHotKey('greenTile-autoOff');
            Main.keybindingManager.removeHotKey('greenTile-preset');
            Main.keybindingManager.removeHotKey('greenTile-exclude');
            Main.keybindingManager.removeHotKey('greenTile-resize-wider');
            Main.keybindingManager.removeHotKey('greenTile-resize-narrower');
            Main.keybindingManager.removeHotKey('greenTile-resize-taller');
            Main.keybindingManager.removeHotKey('greenTile-resize-shorter');
        };
        this.destroy = () => {
            this.DisableHotkey();
            // resize hotkey steps not yet written (500 ms debounce) must not get lost
            tile_split_flush(this.app);
            tile_auto_disconnect_all();
            tile_panel_close();
            tile_theme_shutdown();
        };
        this.app = app;
        this.settings = new Settings.ExtensionSettings(this, 'greenTile@carsteneu');
        this.settings.bindProperty(Settings.BindingDirection.IN, 'autotile6hotkey', 'autotile6Hotkey', this.EnableHotkey, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'autotile3hotkey', 'autotile3Hotkey', this.EnableHotkey, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'autotileautohotkey', 'autotileAutoHotkey', this.EnableHotkey, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'autotileoffhotkey', 'autotileOffHotkey', this.EnableHotkey, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'presetHotkey', 'presetHotkey', this.EnableHotkey, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'excludeHotkey', 'excludeHotkey', this.EnableHotkey, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'exclusions', 'exclusions', () => {
            tile_excl_apply(this.settings);
            tile_excl_retile(this.app);
        }, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'resizeWiderHotkey', 'resizeWiderHotkey', this.EnableHotkey, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'resizeNarrowerHotkey', 'resizeNarrowerHotkey', this.EnableHotkey, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'resizeTallerHotkey', 'resizeTallerHotkey', this.EnableHotkey, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'resizeShorterHotkey', 'resizeShorterHotkey', this.EnableHotkey, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'panelTheme', 'panelTheme', () => tile_theme_changed(), null);
        tile_excl_apply(this.settings);
        this.EnableHotkey();
        tile_theme_init(this);
        tile_monitors_refresh(app, () => {
            tile_layouts_migrate_once(app);
            tile_auto_connect_all(app);
            if (tile_settle_pending) {
                tile_settle_pending = false;
                tile_settle_start(app);
            }
        });
    }
}

;// CONCATENATED MODULE: ../base/utils.ts
const Gettext = imports.gettext;
const GLib = imports.gi.GLib;
const Meta = imports.gi.Meta;
const Panel = imports.ui.panel;
const utils_Main = imports.ui.main;
const UUID = 'greenTile@carsteneu';
Gettext.bindtextdomain(UUID, GLib.get_home_dir() + '/.local/share/locale');
function _(str) {
    let customTranslation = Gettext.dgettext(UUID, str);
    if (customTranslation != str) {
        return customTranslation;
    }
    return Gettext.gettext(str);
}
const getPanelHeight = (panel) => {
    return panel.height
        || panel.actor.get_height();
};
const getUsableScreenArea = (monitor) => {
    let top = monitor.y;
    let bottom = monitor.y + monitor.height;
    let left = monitor.x;
    let right = monitor.x + monitor.width;
    for (let panel of utils_Main.panelManager.getPanelsInMonitor(monitor.index)) {
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
// Diagnostics: the reason list mirrors the tile_collect_windows filters by design —
// 'UNKNOWN' means the two have drifted apart (canary, should never appear).
const tile_debug_count = (monitor, focusWindow, collected) => {
    try {
        let all = global.workspace_manager.get_active_workspace().list_windows();
        let missing = [];
        for (let i = 0; i < all.length; i++) {
            let w = all[i];
            if (w === focusWindow || collected.indexOf(w) > -1)
                continue;
            let reasons = [];
            if (w.minimized)
                reasons.push('minimized');
            if (w.get_wm_class() == null)
                reasons.push('wm_class');
            if (tile_excl_is_excluded(w))
                reasons.push('excluded');
            if (utils_Main.getTabList().indexOf(w) === -1)
                reasons.push('not-in-tablist');
            if (imports.gi.Cinnamon.WindowTracker.get_default().get_window_app(w) == null)
                reasons.push('no-app');
            if (utils_Main.layoutManager.monitors[w.get_monitor()] !== monitor)
                reasons.push('monitor');
            if (w.get_window_type() !== Meta.WindowType.NORMAL)
                reasons.push('type=' + w.get_window_type());
            missing.push(String(w.get_wm_class()) + ' "' + String(w.get_title()).slice(0, 20) + '": ' + (reasons.join(',') || 'UNKNOWN'));
        }
        if (missing.length > 0)
            global.log('greenTile skipped ' + missing.length + ' window(s) on active workspace: ' + missing.join(' | '));
    }
    catch (e) {
        global.log('greenTile tile_debug_count error: ' + e);
    }
};
// The real focus may sit on another workspace (e.g. a maximized terminal there);
// muffin ignores resizes on maximized windows, so such a window would claim a slot
// and leave it empty. Accept only visible normal windows of the active workspace,
// otherwise fall back to the first visible window here.
const tile_focus_window = () => {
    let focus = getFocusApp();
    let active = global.workspace_manager.get_active_workspace();
    if (focus && !focus.minimized && focus.get_window_type() === Meta.WindowType.NORMAL
        && (focus.get_workspace() === active || focus.is_on_all_workspaces()))
        return focus;
    let tabList = utils_Main.getTabList();
    return tabList.length > 0 ? tabList[0] : null;
};
// >>> exclude-model (pure functions, no Cinnamon imports; tested by tests/exclude-model.test.js)
// Windows that are never tiled: rows of the "exclusions" list setting
// ({ match: "class" | "title", text }) match by WM_CLASS (equals, the instance variant
// counts too) or window title (contains), case-insensitive; rows with empty text or an
// unknown match are ignored. On top, Super+G toggles the focused window ad hoc —
// in-memory only, per window, forgotten when the window is unmanaged.
const tile_excl_rows_normalize = (rows) => {
    if (!Array.isArray(rows))
        return [];
    const result = [];
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row == null || typeof row !== 'object')
            continue;
        const text = typeof row.text === 'string' ? row.text.trim() : '';
        if ((row.match !== 'class' && row.match !== 'title') || !text)
            continue;
        result.push({ match: row.match, text: text });
    }
    return result;
};
const tile_excl_match = (wmClass, wmInstance, title, rows) => {
    const t = typeof title === 'string' ? title.toLowerCase() : '';
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row.match === 'class') {
            if ((typeof wmClass === 'string' && wmClass.toLowerCase() === row.text.toLowerCase())
                || (typeof wmInstance === 'string' && wmInstance.toLowerCase() === row.text.toLowerCase()))
                return true;
        }
        else if (row.match === 'title' && t && t.indexOf(row.text.toLowerCase()) !== -1)
            return true;
    }
    return false;
};
const tile_excl_toggle_set = (map, seq, on) => {
    if (on)
        map.set(seq, true);
    else
        map.delete(seq);
};
// <<< exclude-model
const tile_excl = { toggled: new Map(), rows: [] };
const tile_excl_is_excluded = (w) => {
    if (w == null)
        return false;
    if (tile_excl.toggled.get(w.get_stable_sequence()))
        return true;
    return tile_excl.rows.length > 0
        && tile_excl_match(w.get_wm_class(), w.get_wm_class_instance(), w.get_title(), tile_excl.rows);
};
const tile_excl_apply = (settings) => {
    tile_excl.rows = tile_excl_rows_normalize(settings.getValue('exclusions'));
};
// Retile every monitor whose layout can place windows: preset layouts directly, auto
// grids debounced (consistent with other debounced retiles).
const tile_excl_retile = (app) => {
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    for (let i = 0; i < utils_Main.layoutManager.monitors.length; i++) {
        const layout = tile_layout_for(app, i, wsIndex);
        if (layout.preset)
            tile_retile_monitor(app, i, null);
        else if (layout.auto)
            tile_auto_schedule_monitor(app, i, 150);
    }
};
const tile_excl_toggle_focused = (app) => {
    const w = tile_focus_window();
    if (!w)
        return;
    const excluded = !tile_excl_is_excluded(w);
    tile_excl_toggle_set(tile_excl.toggled, w.get_stable_sequence(), excluded);
    global.log('greenTile ' + (excluded ? 'never tile on: ' : 'tiling again: ') + String(w.get_wm_class()).replace(/\s+/g, ' ') + ' seq=' + w.get_stable_sequence());
    try {
        Main.osdWindowManager.show(w.get_monitor(), tile_Gio.ThemedIcon.new('window-restore-symbolic'),
            excluded ? _("Window floats") : _("Window tiles again"), null);
    }
    catch (e) {
        // OSD is feedback only — a failing show must not block the retile
    }
    tile_retile_monitor(app, w.get_monitor(), null);
};
// Own collector instead of gTile's GetNotFocusedWindowsOfMonitor: that one excludes
// app.focusMetaWindow, which goes stale because gTile tracks focus via the app-level
// 'notify::focus-app' signal (silent on same-app window switches) — visible windows
// get dropped. RULE: active workspace only, never pull windows across workspaces.
const tile_collect_windows = (monitor, focusWindow) => {
    const tracker = imports.gi.Cinnamon.WindowTracker.get_default();
    let result = [];
    let tabList = utils_Main.getTabList();
    for (let i = 0; i < tabList.length; i++) {
        let w = tabList[i];
        if (w === focusWindow || w.minimized || w.get_wm_class() == null)
            continue;
        if (w.get_window_type() !== Meta.WindowType.NORMAL)
            continue;
        if (tile_excl_is_excluded(w))
            continue;
        if (utils_Main.layoutManager.monitors[w.get_monitor()] !== monitor)
            continue;
        if (tracker.get_window_app(w) == null)
            continue;
        result.push(w);
    }
    return result;
};
// Animated placement: the window gets its final geometry instantly (no stepped
// resizes — those reflow terminal text at every step), while the compositor actor
// is parked at the old rect via translation/scale and eased back to identity.
// Offsets are set BEFORE the move so no intermediate frame shows the final position.
const TILE_ANIMATE_MS = 250;
const Tweener = imports.ui.tweener;
// animate = false: the window jumps (resize hotkeys held down retile ~33 times per second;
// overlapping tweens would make the windows swim). With the setting tileAnimation off
// every placement jumps; read at each placement, so a change applies from the next tiling.
const tile_place = (app, metaWindow, x, y, width, height, animate = true) => {
    app.platform.reset_window(metaWindow);
    const oldRect = metaWindow.get_frame_rect();
    const actor = metaWindow.get_compositor_private();
    if (actor && (!animate || app.config.settings.getValue('tileAnimation') === false)) {
        Tweener.removeTweens(actor);
        actor.translation_x = 0;
        actor.translation_y = 0;
        actor.scale_x = 1;
        actor.scale_y = 1;
        app.platform.move_resize_window(metaWindow, x, y, width, height);
        return;
    }
    if (actor) {
        Tweener.removeTweens(actor);
        actor.translation_x = oldRect.x - x;
        actor.translation_y = oldRect.y - y;
        actor.scale_x = oldRect.width / width;
        actor.scale_y = oldRect.height / height;
    }
    app.platform.move_resize_window(metaWindow, x, y, width, height);
    if (actor) {
        Tweener.addTween(actor, {
            translation_x: 0,
            translation_y: 0,
            scale_x: 1,
            scale_y: 1,
            time: TILE_ANIMATE_MS / 1000,
            transition: 'easeOutQuad',
        });
    }
};
// >>> monitor-model (pure functions, no Cinnamon imports; tested by tests/monitor-model.test.js)
// Stable monitor identity from the DisplayConfig tuple (connector, vendor, product,
// serial): the key survives rearrangements and re-plugging, identical models are
// separated by serial, and panels with a zero serial (typical laptop screens) by
// the connector. Workspace key '*' covers all workspaces of non-primary monitors
// when workspaces-only-on-primary is on.
const tile_monitor_key = (connector, vendor, product, serial) => {
    const base = vendor + '|' + product + '|' + serial;
    return (!serial || /^(0x)?0+$/.test(serial)) ? base + '|' + connector : base;
};
const tile_monitor_fallback_key = (name, width, height) => 'name:' + name + '|' + width + 'x' + height;
const tile_monitor_states = (monitors) => {
    if (!Array.isArray(monitors))
        return [];
    const states = [];
    for (const item of monitors) {
        if (!Array.isArray(item) || !Array.isArray(item[0]) || !item[0][0])
            continue;
        const [connector, vendor, product, serial] = item[0];
        states.push({ connector: connector, key: tile_monitor_key(connector, vendor, product, serial) });
    }
    return states;
};
const tile_monitor_ws_key = (wsIndex, isPrimary, onlyPrimary) => {
    return (onlyPrimary && !isPrimary) ? '*' : String(wsIndex + 1);
};
const tile_monitor_labels = (names, connectors) => {
    const duplicate = (name) => names.indexOf(name) !== names.lastIndexOf(name);
    return names.map((name, i) => {
        if (!duplicate(name))
            return name;
        return name + ' (' + (connectors[i] || i + 1) + ')';
    });
};
// <<< monitor-model
// >>> gap-model (pure functions, no Cinnamon imports; tested by tests/gap-model.test.js)
// Gap between tiled windows (setting "windowGap", set with − / + in the preset panel).
// Every side of a cell that borders another cell moves in by half the gap, so two
// neighbours end up exactly one gap apart; sides on the edge of the usable screen area
// stay flush. Edges are rounded before the insets, so fractional cell widths
// (1920/7) do not make the gaps drift.
const TILE_GAP_MAX = 48;
const TILE_GAP_STEP = 2;
const tile_gap_value = (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v))
        return 0;
    const stepped = Math.floor(v / TILE_GAP_STEP) * TILE_GAP_STEP;
    return Math.min(Math.max(stepped, 0), TILE_GAP_MAX);
};
const tile_gap_cell = (cell, area, gap) => {
    let left = Math.round(cell[0]);
    let top = Math.round(cell[1]);
    let right = Math.round(cell[0] + cell[2]);
    let bottom = Math.round(cell[1] + cell[3]);
    if (gap > 0) {
        const lead = Math.floor(gap / 2);
        const trail = gap - lead;
        const [ax, ay, aw, ah] = area.map(Math.round);
        if (Math.abs(left - ax) >= 1)
            left += lead;
        if (Math.abs(top - ay) >= 1)
            top += lead;
        if (Math.abs(right - (ax + aw)) >= 1)
            right -= trail;
        if (Math.abs(bottom - (ay + ah)) >= 1)
            bottom -= trail;
    }
    return [left, top, Math.max(right - left, 1), Math.max(bottom - top, 1)];
};
// <<< gap-model
const tile_gap = (app) => tile_gap_value(app.config.settings.getValue('windowGap'));
// Places a window into a layout cell of the usable area, minus the window gap.
const tile_place_cell = (app, metaWindow, x, y, width, height, area, animate = true) => {
    const [cx, cy, cw, ch] = tile_gap_cell([x, y, width, height], area, tile_gap(app));
    tile_place(app, metaWindow, cx, cy, cw, ch, animate);
};
const tile_app_columns = (app, cols) => {
    const focusWindow = tile_focus_window();
    if (!focusWindow)
        return;
    let monitor = utils_Main.layoutManager.monitors[focusWindow.get_monitor()];
    let [screenX, screenY, screenWidth, screenHeight] = getUsableScreenArea(monitor);
    let windows = tile_collect_windows(monitor, focusWindow);
    tile_debug_count(monitor, focusWindow, windows);
    if (windows.length === 0)
        return;
    let colWidth = screenWidth / cols;
    // An excluded focused window is not tiled, the others still fill the columns.
    let ordered = tile_sort_reading_order((tile_excl_is_excluded(focusWindow) ? windows : [focusWindow].concat(windows)), false).slice(0, cols);
    for (let index = 0; index < ordered.length; index++) {
        tile_place_cell(app, ordered[index], screenX + index * colWidth, screenY, colWidth, screenHeight, [screenX, screenY, screenWidth, screenHeight]);
    }
};
// Sort direction must match the target layout: column-major for the low-res
// column-stack, row-major for uniform grids — otherwise re-tiles shuffle
// windows between cells and manual arrangements do not survive. Grouping by overlap
// (tile_sort_order) keeps windows in their column/row with unequal borders too.
// tile_sort_rect_override: stable sequence -> frame to sort by instead of the current one
// (set after an edge resize: the dragged window keeps the cell it was tiled into; used up
// by the next retile, ignored after TILE_SORT_OVERRIDE_MS when no retile came).
const tile_sort_rect_override = new Map();
const TILE_SORT_OVERRIDE_MS = 2000;
const tile_sort_reading_order = (windows, columnMajor) => {
    const now = GLib.get_monotonic_time() / 1000;
    const rects = windows.map((w) => {
        const seq = w.get_stable_sequence();
        const o = tile_sort_rect_override.get(seq);
        if (o) {
            tile_sort_rect_override.delete(seq);
            if (now - o.at <= TILE_SORT_OVERRIDE_MS)
                return o.rect;
        }
        const f = w.get_frame_rect();
        return [f.x, f.y, f.width, f.height];
    });
    return tile_sort_order(rects, columnMajor).map((i) => windows[i]);
};
// Layout of the automatic grid for n windows. Below 2100 px monitor width, 4+ uniform
// columns get too narrow: 3 fixed columns with balanced stacks instead (kind "cols",
// tile_auto_narrow_stacks). Otherwise one row with one column per window up to 6, then
// the windows are spread evenly over full-width rows (kind "rows", tile_auto_rows).
const tile_auto_shape = (monitor, n) => (monitor.width < 2100 && n > 3)
    ? { kind: 'cols', shape: tile_auto_narrow_stacks(n) }
    : { kind: 'rows', shape: tile_auto_rows(n) };
// Movable borders (split-model): a split the resize hotkeys have not written yet wins
// over the stored one; a stored split counts only when it fits the layout.
// tile_split_pending: key "mkey\nwskey\nn" -> { mkey, wskey, n, split }, written to the
// settings by tile_split_flush (500 ms after the last hotkey step, at once for the mouse).
const tile_split_pending = new Map();
const tile_split_flush_timer = { id: 0 };
const TILE_SPLIT_FLUSH_MS = 500;
const tile_split_ref = (monitorIndex, wsIndex, n) => {
    const mkey = tile_monitors.keys[monitorIndex];
    if (!mkey)
        return null;
    const wskey = tile_layout_ws_key(monitorIndex, wsIndex);
    return { key: mkey + '\n' + wskey + '\n' + n, mkey: mkey, wskey: wskey, n: String(n) };
};
const tile_split_for = (app, monitorIndex, wsIndex, n, layout) => {
    const ref = tile_split_ref(monitorIndex, wsIndex, n);
    if (!ref)
        return null;
    const pending = tile_split_pending.get(ref.key);
    if (pending)
        return tile_split_valid(layout.kind, layout.shape, pending.split);
    const layouts = tile_layouts_parse(app.config.settings.getValue('layouts') || '');
    return tile_split_valid(layout.kind, layout.shape, tile_layouts_splits(layouts, ref.mkey, ref.wskey)[ref.n]);
};
const tile_split_flush = (app) => {
    if (tile_split_flush_timer.id) {
        tile_Mainloop.source_remove(tile_split_flush_timer.id);
        tile_split_flush_timer.id = 0;
    }
    if (tile_split_pending.size === 0)
        return;
    let layouts = tile_layouts_parse(app.config.settings.getValue('layouts') || '');
    if (layouts === null) {
        // corrupt setting: same rule as tile_layout_set, never overwrite it
        tile_split_pending.clear();
        if (!tile_split_flush_timer.corruptLogged) {
            tile_split_flush_timer.corruptLogged = true;
            global.log('greenTile layouts setting is corrupt, splits not written');
        }
        return;
    }
    tile_split_flush_timer.corruptLogged = false;
    for (const entry of tile_split_pending.values())
        layouts = tile_layouts_set(layouts, entry.mkey, entry.wskey, { splits: { [entry.n]: entry.split } });
    tile_split_pending.clear();
    app.config.settings.setValue('layouts', JSON.stringify(layouts));
};
const tile_split_remember = (app, ref, split, flushNow) => {
    tile_split_pending.set(ref.key, { mkey: ref.mkey, wskey: ref.wskey, n: ref.n, split: split });
    if (flushNow) {
        tile_split_flush(app);
        return;
    }
    if (tile_split_flush_timer.id)
        tile_Mainloop.source_remove(tile_split_flush_timer.id);
    tile_split_flush_timer.id = tile_Mainloop.timeout_add(TILE_SPLIT_FLUSH_MS, () => {
        tile_split_flush_timer.id = 0;
        tile_split_flush(app);
        return false;
    });
};
// true when the monitor + workspace has stored (or pending) splits — shows the reset button
const tile_split_any = (app, monitorIndex, wsIndex) => {
    const ref = tile_split_ref(monitorIndex, wsIndex, 0);
    if (!ref)
        return false;
    const prefix = ref.mkey + '\n' + ref.wskey + '\n';
    for (const key of tile_split_pending.keys()) {
        if (key.indexOf(prefix) === 0)
            return true;
    }
    const layouts = tile_layouts_parse(app.config.settings.getValue('layouts') || '');
    return Object.keys(tile_layouts_splits(layouts, ref.mkey, ref.wskey)).length > 0;
};
const tile_split_reset = (app, monitorIndex, wsIndex) => {
    const ref = tile_split_ref(monitorIndex, wsIndex, 0);
    if (!ref)
        return;
    const prefix = ref.mkey + '\n' + ref.wskey + '\n';
    for (const key of Array.from(tile_split_pending.keys())) {
        if (key.indexOf(prefix) === 0)
            tile_split_pending.delete(key);
    }
    tile_layout_set(app, monitorIndex, wsIndex, { splits: null });
    global.log('greenTile sizes reset ws' + (wsIndex + 1) + ' mon=' + ref.mkey);
};
// Places the ordered windows into the cells of the layout (split or equal division).
const tile_place_rects = (app, ordered, layout, split, area, animate) => {
    const rects = tile_split_rects(layout.kind, layout.shape, split, area);
    for (let i = 0; i < rects.length && i < ordered.length; i++) {
        const [x, y, w, h] = rects[i];
        tile_place_cell(app, ordered[i], x, y, w, h, area, animate);
    }
};
const tile_app_auto = (app, monitorIndex, focusWindow, animate = true) => {
    const monitor = utils_Main.layoutManager.monitors[monitorIndex];
    if (!monitor)
        return;
    const area = getUsableScreenArea(monitor);
    let windows = tile_collect_windows(monitor, focusWindow);
    tile_debug_count(monitor, focusWindow, windows);
    const focused = focusWindow && !focusWindow.minimized && focusWindow.get_monitor() === monitorIndex
        && !tile_excl_is_excluded(focusWindow);
    let n = windows.length + (focused ? 1 : 0);
    if (n < 2)
        return;
    // New windows (opened while automatic tiling is on) append at the end — their spawn
    // position is meaningless for the reading order. Cleared after each tiling.
    let pending = tile_auto.pending.get(monitorIndex) || new Set();
    tile_auto.pending.set(monitorIndex, new Set());
    let fresh = windows.filter((w) => pending.has(w.get_stable_sequence()));
    let settled = windows.filter((w) => !pending.has(w.get_stable_sequence()));
    // Sort direction follows the layout: column-major for columns, rows for rows.
    const layout = tile_auto_shape(monitor, n);
    const columnMajor = layout.kind === 'cols';
    const ordered = tile_sort_reading_order((focused ? [focusWindow] : []).concat(settled), columnMajor)
        .concat(tile_sort_reading_order(fresh, columnMajor));
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    tile_place_rects(app, ordered, layout, tile_split_for(app, monitorIndex, wsIndex, n, layout), area, animate);
};
// Auto-mode observer: re-tiles automatically on workspaces with automatic tiling on
// (Super+Ctrl+A on, Super+Ctrl+D off, per workspace).
// Triggers: window added/removed on the active workspace (debounced 300ms) and
// manual window moves on release (grab-op-end, 250ms) — the moved window snaps
// into the grid slot nearest its drop position, manual arranging stays possible.
// Dialogs/popups never trigger (NORMAL type + wm_class checks, collector
// re-validates at run time). State is global across workspaces by design.
const tile_Mainloop = imports.mainloop;
const tile_auto = {
    timers: new Map(),
    // pending: per monitor, the stable sequences of fresh windows (append at the end).
    // lastMonitor: stable sequence -> monitor the window was last seen on (close path).
    // grabMonitor: stable sequence -> monitor at grab start (manual move across monitors).
    pending: new Map(),
    lastMonitor: new Map(),
    grabMonitor: new Map(),
    // resizeStart: stable sequence -> { rect, monitor } at the start of an edge resize.
    resizeStart: new Map(),
    workspaceSignals: [],
    signals: [],
    tracked: [],
};
const tile_auto_window_ok = (w) => {
    return w != null && !w.minimized && w.get_wm_class() != null
        && w.get_window_type() === Meta.WindowType.NORMAL;
};
// Per-monitor debounce: every monitor has its own pending timer, so a burst on one
// monitor does not delay or cancel a retile on another. The timer re-checks that the
// monitor still exists and that automatic tiling is still on for the active workspace.
const tile_auto_schedule_monitor = (app, monitorIndex, ms) => {
    const existing = tile_auto.timers.get(monitorIndex);
    if (existing) {
        tile_Mainloop.source_remove(existing);
        tile_auto.timers.delete(monitorIndex);
    }
    tile_auto.timers.set(monitorIndex, tile_Mainloop.timeout_add(ms, () => {
        tile_auto.timers.delete(monitorIndex);
        // The App is recreated when monitors change, so indexes never survive a change;
        // a timer for a monitor that is gone (or no longer ready) must do nothing.
        if (!tile_monitors.ready || !utils_Main.layoutManager.monitors[monitorIndex])
            return false;
        if (tile_layout_for(app, monitorIndex, global.workspace_manager.get_active_workspace().index()).auto)
            tile_retile_monitor(app, monitorIndex, null);
        return false;
    }));
};
const tile_auto_schedule_all = (app, ms) => {
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    const count = utils_Main.layoutManager.monitors.length;
    for (let i = 0; i < count; i++) {
        if (tile_layout_for(app, i, wsIndex).auto)
            tile_auto_schedule_monitor(app, i, ms);
    }
};
// Automatic tiling is switched per monitor and workspace (stored in the "layouts"
// setting): Super+Ctrl+A turns it on for the focused monitor and the active workspace
// and tiles right away (with the preset if one is assigned, otherwise with the auto
// grid); pressing it again just tiles again. Super+Ctrl+D turns it off; that also
// pauses a preset, which stays assigned and comes back with Super+Ctrl+A.
const tile_auto_activate = (app) => {
    const focusWindow = tile_focus_window();
    const monitorIndex = focusWindow ? focusWindow.get_monitor() : utils_Main.layoutManager.primaryIndex;
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    if (!tile_layout_for(app, monitorIndex, wsIndex).auto) {
        tile_layout_set(app, monitorIndex, wsIndex, { auto: true });
        global.log('greenTile auto tiling on for ws' + wsIndex);
    }
    tile_auto.pending.delete(monitorIndex);
    tile_retile_monitor(app, monitorIndex, focusWindow);
};
const tile_auto_deactivate = (app) => {
    const monitorIndex = tile_focus_monitor_index();
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    tile_layout_set(app, monitorIndex, wsIndex, { auto: false });
    tile_auto.pending.delete(monitorIndex);
    global.log('greenTile auto tiling off for ws' + wsIndex);
};
const tile_auto_on_window_added = (app, ws, w) => {
    if (ws !== global.workspace_manager.get_active_workspace())
        return;
    if (w == null || w.get_window_type() !== Meta.WindowType.NORMAL)
        return;
    const monitorIndex = w.get_monitor();
    let pending = tile_auto.pending.get(monitorIndex);
    if (!pending) {
        pending = new Set();
        tile_auto.pending.set(monitorIndex, pending);
    }
    pending.add(w.get_stable_sequence());
    tile_auto.lastMonitor.set(w.get_stable_sequence(), monitorIndex);
    tile_auto_schedule_monitor(app, monitorIndex, 300);
};
const tile_auto_on_window_removed = (app, ws, w) => {
    if (ws !== global.workspace_manager.get_active_workspace())
        return;
    if (w == null)
        return;
    // The wrapper may already be destroyed; its stable sequence still maps to the
    // monitor the window was last seen on — without a record there is nothing to retile.
    let seq;
    try {
        seq = w.get_stable_sequence();
    }
    catch (e) {
        return;
    }
    const monitorIndex = tile_auto.lastMonitor.get(seq);
    if (monitorIndex === undefined)
        return;
    tile_auto_schedule_monitor(app, monitorIndex, 300);
};
// Muffin grab op number -> name (RESIZING_E, KEYBOARD_RESIZING_UNKNOWN, ...).
const tile_grab_op_name = (op) => Object.keys(Meta.GrabOp).find((k) => Meta.GrabOp[k] === op) || '';
const tile_grab_is_resize = (op) => /RESIZING/.test(tile_grab_op_name(op));
const tile_auto_on_grab_begin = (app, w, op) => {
    if (!tile_auto_window_ok(w))
        return;
    if (tile_grab_is_resize(op)) {
        // Frame at grab start identifies the cell the window was tiled into.
        const f = w.get_frame_rect();
        tile_auto.resizeStart.set(w.get_stable_sequence(), { rect: [f.x, f.y, f.width, f.height], monitor: w.get_monitor() });
        return;
    }
    if (op !== Meta.GrabOp.MOVING && op !== Meta.GrabOp.KEYBOARD_MOVING)
        return;
    tile_auto.grabMonitor.set(w.get_stable_sequence(), w.get_monitor());
};
// Edge resize of a tiled window (mouse or window menu): the moved edges become the new
// borders of the layout (split-model), stored for this monitor, workspace and window
// count; the neighbours follow in the retile. Edges on the monitor border have no
// neighbour: the window snaps back. With automatic tiling off it stays a free resize.
const tile_split_on_resize_end = (app, w, op) => {
    const seq = w.get_stable_sequence();
    const start = tile_auto.resizeStart.get(seq);
    tile_auto.resizeStart.delete(seq);
    const active = global.workspace_manager.get_active_workspace();
    if (!start || w.get_workspace() !== active)
        return;
    const monitorIndex = w.get_monitor();
    const wsIndex = active.index();
    if (!tile_layout_for(app, monitorIndex, wsIndex).auto)
        return;
    const monitor = utils_Main.layoutManager.monitors[monitorIndex];
    if (!monitor || start.monitor !== monitorIndex) {
        tile_auto_schedule_monitor(app, monitorIndex, 250);
        return;
    }
    const windows = tile_collect_windows(monitor, null);
    if (windows.indexOf(w) === -1)
        return;
    const n = windows.length;
    const layout = tile_layout_shape(app, monitorIndex, n);
    const ref = tile_split_ref(monitorIndex, wsIndex, n);
    if (!layout || !ref)
        return;
    // The retile sorts the dragged window by its frame at grab start, so a moved left or
    // top edge never pushes it into another cell (tile_sort_reading_order).
    tile_sort_rect_override.set(seq, { rect: start.rect, at: GLib.get_monotonic_time() / 1000 });
    const area = getUsableScreenArea(monitor);
    let split = tile_split_for(app, monitorIndex, wsIndex, n, layout);
    const idx = tile_split_cell_at(tile_split_rects(layout.kind, layout.shape, split, area), start.rect);
    const f = w.get_frame_rect();
    const end = [f.x, f.y, f.width, f.height];
    // Only edges that really moved count: a click on the edge without dragging must not
    // store anything (the frame edge never sits exactly on the computed border — rounding,
    // terminals snap their size to character cells).
    const moved = tile_split_frame_edges(start.rect, end);
    const named = tile_split_op_edges(tile_grab_op_name(op));
    const edges = named.length ? named.filter((e) => moved.indexOf(e) !== -1) : moved;
    // The gap sits half on each side of a border (tile_gap_cell): border = frame edge + half gap outward.
    const gap = tile_gap(app);
    const lead = Math.floor(gap / 2);
    const trail = gap - lead;
    const pos = { left: f.x - lead, right: f.x + f.width + trail, top: f.y - lead, bottom: f.y + f.height + trail };
    let changed = false;
    for (const edge of edges) {
        const next = idx < 0 ? null : tile_split_move(layout.kind, layout.shape, split, idx, edge, pos[edge], area, TILE_SPLIT_MIN_PX);
        if (next) {
            split = next;
            changed = true;
        }
    }
    if (changed) {
        tile_split_remember(app, ref, split, true);
        global.log('greenTile split stored ws' + (wsIndex + 1) + ' mon=' + ref.mkey + ' n=' + n + ' edges=' + edges.join('+'));
    }
    tile_auto_schedule_monitor(app, monitorIndex, 250);
};
// Resize hotkeys (Super+Alt+arrows): move a border of the focused window's cell. A tap
// moves 1 px, holding the key accelerates (tile_split_accel). Retiles without animation
// at every step; the split is written 500 ms after the last step.
const tile_split_keys = { state: null };
let tile_keyboard_settings = null;
const tile_split_repeat_threshold = () => {
    try {
        if (!tile_keyboard_settings)
            tile_keyboard_settings = new tile_Gio.Settings({ schema_id: 'org.cinnamon.desktop.peripherals.keyboard' });
        return tile_keyboard_settings.get_uint('delay') + 100;
    }
    catch (e) {
        return 600;
    }
};
const tile_split_hotkey = (app, action) => {
    const w = tile_focus_window();
    if (!w)
        return;
    const monitorIndex = w.get_monitor();
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    if (!tile_layout_for(app, monitorIndex, wsIndex).auto)
        return;
    const monitor = utils_Main.layoutManager.monitors[monitorIndex];
    if (!monitor)
        return;
    const windows = tile_collect_windows(monitor, null);
    // only windows of the layout (tile_focus_window may fall back to another window)
    if (windows.indexOf(w) === -1)
        return;
    const n = windows.length;
    const layout = tile_layout_shape(app, monitorIndex, n);
    const ref = tile_split_ref(monitorIndex, wsIndex, n);
    if (!layout || !ref)
        return;
    const area = getUsableScreenArea(monitor);
    const split = tile_split_for(app, monitorIndex, wsIndex, n, layout);
    const f = w.get_frame_rect();
    const idx = tile_split_cell_at(tile_split_rects(layout.kind, layout.shape, split, area), [f.x, f.y, f.width, f.height]);
    const target = idx < 0 ? null : tile_split_key_target(layout.kind, layout.shape, idx, action);
    if (!target)
        return;
    const accel = tile_split_accel(tile_split_keys.state, action, GLib.get_monotonic_time() / 1000, tile_split_repeat_threshold());
    tile_split_keys.state = accel.state;
    const from = tile_split_border_pos(layout.kind, layout.shape, split, idx, target.edge, area);
    const next = tile_split_move(layout.kind, layout.shape, split, idx, target.edge, from + target.sign * accel.step, area, TILE_SPLIT_MIN_PX);
    // at the minimum size the border stays: no retile and no new flush timer per repeat
    if (!next || (split && JSON.stringify(next) === JSON.stringify(split)))
        return;
    tile_split_remember(app, ref, next, false);
    tile_retile_monitor(app, monitorIndex, null, false);
};
const tile_auto_on_grab_end = (app, w, op) => {
    if (!tile_auto_window_ok(w))
        return;
    if (tile_grab_is_resize(op)) {
        tile_split_on_resize_end(app, w, op);
        return;
    }
    if (op !== Meta.GrabOp.MOVING && op !== Meta.GrabOp.KEYBOARD_MOVING)
        return;
    if (w.get_workspace() !== global.workspace_manager.get_active_workspace())
        return;
    const seq = w.get_stable_sequence();
    const from = tile_auto.grabMonitor.get(seq);
    tile_auto.grabMonitor.delete(seq);
    const to = w.get_monitor();
    // Manual moves can cross monitors: both the monitor at grab start and the one at
    // release may need a retile (one call when equal, per-monitor timers anyway).
    if (from !== undefined && from !== to)
        tile_auto_schedule_monitor(app, from, 250);
    tile_auto_schedule_monitor(app, to, 250);
};
// Minimizing does NOT fire workspace window-removed (the window stays on its
// workspace), and Meta.Display has no 'window-minimize' signal in muffin 6.6 —
// the canonical way (Cinnamon's own windowManager.js:419) is per-window
// 'notify::minimized', wired for every window and new windows via window-created.
const tile_auto_any_window = (args) => {
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a && a.get_wm_class)
            return a;
    }
    return null;
};
const tile_auto_on_minimized_notify = (app, w) => {
    if (w == null || w.get_window_type() !== Meta.WindowType.NORMAL)
        return;
    if (w.get_workspace() !== global.workspace_manager.get_active_workspace())
        return;
    tile_auto_schedule_monitor(app, w.get_monitor(), 300);
};
const tile_auto_untrack = (w) => {
    const idx = tile_auto.tracked.findIndex(([tw]) => tw === w);
    if (idx === -1)
        return;
    const [_, mid, uid, seq] = tile_auto.tracked[idx];
    // the window is gone: its ad-hoc exclusion state must not leak into a new window
    tile_excl.toggled.delete(seq);
    try {
        w.disconnect(mid);
        w.disconnect(uid);
    }
    catch (e) {
        // window already destroyed — wrapper invalid, nothing to clean
    }
    tile_auto.lastMonitor.delete(seq);
    tile_auto.grabMonitor.delete(seq);
    tile_auto.resizeStart.delete(seq);
    tile_auto.tracked.splice(idx, 1);
};
const tile_auto_track_window = (app, w) => {
    if (w == null || w.get_window_type() !== Meta.WindowType.NORMAL)
        return;
    if (tile_auto.tracked.some(([tw]) => tw === w))
        return;
    const mid = w.connect('notify::minimized', () => tile_auto_on_minimized_notify(app, w));
    const uid = w.connect('unmanaged', () => tile_auto_untrack(w));
    const seq = w.get_stable_sequence();
    // Spec: a tracked window records its monitor when it is tracked — the close
    // path needs it because the window is gone when window-removed arrives.
    tile_auto.lastMonitor.set(seq, w.get_monitor());
    tile_auto.tracked.push([w, mid, uid, seq]);
};
const tile_auto_disconnect_workspaces = () => {
    for (const [ws, a, r] of tile_auto.workspaceSignals) {
        ws.disconnect(a);
        ws.disconnect(r);
    }
    tile_auto.workspaceSignals = [];
};
const tile_auto_connect_workspace = (app, ws) => {
    const a = ws.connect('window-added', (ws_, w) => tile_auto_on_window_added(app, ws_, w));
    const r = ws.connect('window-removed', (ws_, w) => tile_auto_on_window_removed(app, ws_, w));
    tile_auto.workspaceSignals.push([ws, a, r]);
};
const tile_auto_on_entered_monitor = (app, monitorIndex, w) => {
    if (w == null)
        return;
    tile_auto.lastMonitor.set(w.get_stable_sequence(), monitorIndex);
    // Muffin moving windows across monitors restarts the settle wait while it runs.
    if (tile_settle_started)
        tile_settle_start(app);
};
const tile_auto_connect_all = (app) => {
    const n = global.screen.get_n_workspaces();
    for (let i = 0; i < n; i++)
        tile_auto_connect_workspace(app, global.screen.get_workspace_by_index(i));
    tile_auto.signals.push([
        global.screen,
        global.screen.connect('notify::n-workspaces', () => {
            // Workspace set changed: drop and reconnect all (old objects may be gone).
            tile_auto_disconnect_workspaces();
            const n2 = global.screen.get_n_workspaces();
            for (let j = 0; j < n2; j++)
                tile_auto_connect_workspace(app, global.screen.get_workspace_by_index(j));
        }),
    ]);
    // Muffin 6.6 emits grab-op-begin/end as (display, display, window, op) — the
    // display is passed twice (legacy screen slot). Verified via live signal probe.
    tile_auto.signals.push([
        global.display,
        global.display.connect('grab-op-begin', (display, display2, w, op) => tile_auto_on_grab_begin(app, w, op)),
    ]);
    tile_auto.signals.push([
        global.display,
        global.display.connect('grab-op-end', (display, display2, w, op) => tile_auto_on_grab_end(app, w, op)),
    ]);
    // Cross-monitor moves: (monitor index, MetaWindow), signature verified live
    // via GObject.signal_query.
    tile_auto.signals.push([
        global.display,
        global.display.connect('window-entered-monitor', (display, monitorIndex, w) => tile_auto_on_entered_monitor(app, monitorIndex, w)),
    ]);
    // Arg scan by duck typing guards against muffin signature quirks (grab-op
    // passes the display twice). window-created wires minimize tracking for
    // new windows; existing ones are tracked below.
    tile_auto.signals.push([
        global.display,
        global.display.connect('window-created', (...args) => tile_auto_track_window(app, tile_auto_any_window(args))),
    ]);
    const wn = global.screen.get_n_workspaces();
    for (let i = 0; i < wn; i++) {
        const wl = global.screen.get_workspace_by_index(i).list_windows();
        for (let j = 0; j < wl.length; j++)
            tile_auto_track_window(app, wl[j]);
    }
    // Switching onto a preset workspace retiles there (Cinnamon's own
    // windowManager.js:358 uses this signal with (wm, from, to, direction)).
    tile_auto.signals.push([
        global.window_manager,
        global.window_manager.connect('switch-workspace', (wm, from, to) => tile_auto_schedule_all(app, 300)),
    ]);
};
const tile_auto_disconnect_all = () => {
    for (const id of tile_auto.timers.values())
        tile_Mainloop.source_remove(id);
    tile_auto.timers.clear();
    tile_auto.pending.clear();
    tile_auto.lastMonitor.clear();
    tile_auto.grabMonitor.clear();
    tile_auto.resizeStart.clear();
    tile_sort_rect_override.clear();
    tile_excl.toggled.clear();
    tile_auto_disconnect_workspaces();
    for (const [obj, id] of tile_auto.signals)
        obj.disconnect(id);
    tile_auto.signals = [];
    for (const [w] of tile_auto.tracked.slice())
        tile_auto_untrack(w);
    if (tile_settle_timer) {
        tile_Mainloop.source_remove(tile_settle_timer);
        tile_settle_timer = 0;
    }
    // A monitor change destroys the App while the settle wait may be running; keep its
    // start time then, so the 15 s limit counts from the first change, not the last.
    if (!tile_settle_pending)
        tile_settle_started = 0;
};

// Settle wait after a monitor change: Muffin can take several seconds to move windows
// to their new monitors. The retile runs once, 2 s after the last monitor change or
// window-entered-monitor event, at the latest 15 s after the first change. The flag
// routes the wait through the App recreation (monitors-changed destroys the App).
let tile_settle_pending = false;
let tile_settle_timer = 0;
let tile_settle_started = 0;
const tile_settle_start = (app) => {
    const now = Date.now();
    if (!tile_settle_started)
        tile_settle_started = now;
    const delay = Math.max(Math.min(2000, 15000 - (now - tile_settle_started)), 1);
    if (tile_settle_timer)
        tile_Mainloop.source_remove(tile_settle_timer);
    tile_settle_timer = tile_Mainloop.timeout_add(delay, () => {
        tile_settle_timer = 0;
        const elapsed = Date.now() - tile_settle_started;
        tile_settle_started = 0;
        tile_auto_schedule_all(app, 0);
        global.log('greenTile monitors settled after ' + elapsed + ' ms');
        return false;
    });
};
// Per-workspace preset tiling: rules by window count, stored in extension settings
// (survives spice reinstalls — settings live in ~/.config/cinnamon/spices).
// Preset = {"id","name","rules":[{"min":2,"stacks":[1,1]},...]}; assignment map
// wsIndex -> preset id. Rule choice: last rule with min <= window count.
const tile_presets_read = (app) => {
    try {
        return JSON.parse(app.config.settings.getValue('presets') || '[]');
    }
    catch (e) {
        return [];
    }
};
// Monitor registry: stable per-monitor keys and display labels, rebuilt at start and
// after every monitor change (enable() recreates the App then, so this module state is
// effectively per App). Keys come from the DisplayConfig tuples via the monitor-model
// block; a monitor that stays unknown (DBus failure) keeps a fallback key, logged once.
const tile_Gio = imports.gi.Gio;
const tile_monitors = { keys: [], labels: [], ready: false };
let tile_monitors_fallback_logged = false;
let tile_muffin_settings = null;
let tile_monitors_epoch = 0;
const tile_monitors_refresh = (app, onReady) => {
    // Monitor changes destroy and recreate the App; a late reply for a refresh that
    // belongs to a destroyed App must not connect observers or write registry state.
    const epoch = ++tile_monitors_epoch;
    tile_monitors.ready = false;
    tile_monitors.keys = [];
    tile_monitors.labels = [];
    tile_Gio.DBus.session.call('org.cinnamon.Muffin.DisplayConfig', '/org/cinnamon/Muffin/DisplayConfig',
        'org.cinnamon.Muffin.DisplayConfig', 'GetCurrentState', null, null,
        tile_Gio.DBusCallFlags.NONE, 3000, null, (source, result) => {
            if (epoch !== tile_monitors_epoch)
                return;
            let states = [];
            try {
                const reply = source.call_finish(result);
                const unpacked = reply.deep_unpack();
                states = tile_monitor_states(Array.isArray(unpacked) ? unpacked[1] : null);
            }
            catch (e) {
                global.log('greenTile DisplayConfig.GetCurrentState failed: ' + e);
            }
            const monitors = utils_Main.layoutManager.monitors;
            const keys = monitors.map(() => '');
            const connectors = monitors.map(() => '');
            for (const state of states) {
                const index = Meta.MonitorManager.get().get_monitor_for_connector(state.connector);
                if (index < 0 || index >= keys.length)
                    continue;
                keys[index] = state.key;
                connectors[index] = state.connector;
            }
            const names = monitors.map((m, i) => global.display.get_monitor_name(i));
            for (let i = 0; i < keys.length; i++) {
                if (!keys[i] && monitors[i]) {
                    keys[i] = tile_monitor_fallback_key(names[i], monitors[i].width, monitors[i].height);
                    if (!tile_monitors_fallback_logged) {
                        tile_monitors_fallback_logged = true;
                        global.log('greenTile monitor key fallback for ' + names[i] + ' (' + keys[i] + ')');
                    }
                }
            }
            tile_monitors.keys = keys;
            tile_monitors.labels = tile_monitor_labels(names, connectors);
            tile_monitors.ready = true;
            global.log('greenTile monitors: ' + keys.map((k, i) => i + '=' + k).join(', '));
            onReady();
        });
};
const tile_monitor_index_of = (metaWindow) => metaWindow.get_monitor();
const tile_focus_monitor_index = () => {
    const focusWindow = tile_focus_window();
    return focusWindow ? focusWindow.get_monitor() : utils_Main.layoutManager.primaryIndex;
};
const tile_layout_only_primary = () => {
    if (!tile_muffin_settings)
        tile_muffin_settings = new tile_Gio.Settings({ schema_id: 'org.cinnamon.muffin' });
    return tile_muffin_settings.get_boolean('workspaces-only-on-primary');
};
// Workspace key for a layout lookup: numbered on the primary monitor (and always when
// workspaces-only-on-primary is off), '*' for every other monitor when the setting is on.
const tile_layout_ws_key = (monitorIndex, wsIndex) => {
    return tile_monitor_ws_key(wsIndex, monitorIndex === utils_Main.layoutManager.primaryIndex, tile_layout_only_primary());
};
const tile_layout_for = (app, monitorIndex, wsIndex) => {
    if (!tile_monitors.ready || !tile_monitors.keys[monitorIndex])
        return { preset: null, auto: false };
    const presets = tile_presets_read(app);
    const layouts = tile_layouts_parse(app.config.settings.getValue('layouts') || '');
    const entry = tile_layouts_entry(layouts, tile_monitors.keys[monitorIndex], tile_layout_ws_key(monitorIndex, wsIndex), presets.map((p) => p.id));
    return {
        preset: entry.preset ? presets.find((p) => p.id === entry.preset) || null : null,
        auto: entry.auto,
    };
};
let tile_layouts_write_guard_logged = false;
const tile_layout_set = (app, monitorIndex, wsIndex, patch) => {
    if (!tile_monitors.ready || !tile_monitors.keys[monitorIndex])
        return;
    const layouts = tile_layouts_parse(app.config.settings.getValue('layouts') || '');
    // Corrupt layouts are treated as empty on read; nothing is written (and the
    // old string is not silently replaced) until the setting itself is fixed.
    if (layouts === null) {
        if (!tile_layouts_write_guard_logged) {
            tile_layouts_write_guard_logged = true;
            global.log('greenTile layouts setting is corrupt, not writing it');
        }
        return;
    }
    const next = tile_layouts_set(layouts, tile_monitors.keys[monitorIndex], tile_layout_ws_key(monitorIndex, wsIndex), patch);
    app.config.settings.setValue('layouts', JSON.stringify(next));
};
// Once: convert the old per-workspace keys into layouts entries of the monitor that is
// primary right now (the 5K monitor). layoutsMigrated keeps deleted layouts from coming
// back on the next start.
const tile_layouts_migrate_once = (app) => {
    if (app.config.settings.getValue('layoutsMigrated'))
        return;
    let wsPresets = {};
    try {
        wsPresets = JSON.parse(app.config.settings.getValue('wsPresets') || '{}');
    }
    catch (e) { /* old key unreadable — treated as empty */ }
    if (!wsPresets || typeof wsPresets !== 'object' || Array.isArray(wsPresets))
        wsPresets = {};
    const autoList = app.config.settings.getValue('autoWorkspaces');
    const hasOld = Object.keys(wsPresets).length > 0 || (Array.isArray(autoList) && autoList.length > 0);
    const layouts = tile_layouts_parse(app.config.settings.getValue('layouts') || '');
    if (layouts && Object.keys(layouts).length === 0 && hasOld) {
        const primaryIndex = utils_Main.layoutManager.primaryIndex;
        const mkey = tile_monitors.keys[primaryIndex] || '';
        if (mkey) {
            const migrated = tile_layouts_migrate(wsPresets, autoList, mkey);
            if (Object.keys(migrated).length > 0) {
                app.config.settings.setValue('layouts', JSON.stringify(migrated));
                global.log('greenTile migrated wsPresets/autoWorkspaces to layouts for monitor ' + mkey);
            }
        }
    }
    app.config.settings.setValue('layoutsMigrated', true);
};
const tile_presets_write = (app, presets) => {
    app.config.settings.setValue('presets', JSON.stringify(presets));
};
const tile_rules_pick = (rules, n) => {
    let match = null;
    for (const rule of rules) {
        if (n >= rule.min)
            match = rule;
    }
    return match;
};
// >>> fill-model (pure functions, no Cinnamon imports; tested by tests/fill-model.test.js)
// 100 % area rule: tiled windows always cover the whole usable area, no cell stays empty.
// Layout of a painted rule for n windows. Surplus windows extend the last column. With
// fewer windows the highest column loses one cell (on a tie the right one) until the
// count fits; below one window per column, columns drop from the right. n < 1 returns
// the painted rule (list thumbnail on an empty workspace).
const tile_fill_stacks = (stacks, n) => {
    const out = stacks.map((s) => Math.max(1, Math.floor(s) || 1));
    if (n < 1 || out.length === 0)
        return out;
    if (n < out.length)
        return out.slice(0, n).map(() => 1);
    let total = out.reduce((a, b) => a + b, 0);
    if (n >= total) {
        out[out.length - 1] += n - total;
        return out;
    }
    while (total > n) {
        let hi = 0;
        for (let c = 1; c < out.length; c++) {
            if (out[c] >= out[hi])
                hi = c;
        }
        out[hi]--;
        total--;
    }
    return out;
};
// Wide automatic grid: up to TILE_AUTO_ROW_MAX windows side by side in one row, more
// are spread evenly over ceil(n / max) rows, the upper rows take the surplus
// (7 = 4+3, 9 = 5+4, 13 = 5+4+4). Every row spans the full width.
const TILE_AUTO_ROW_MAX = 6;
const tile_auto_rows = (n) => {
    const count = Math.max(1, Math.ceil(n / TILE_AUTO_ROW_MAX));
    const base = Math.floor(n / count);
    const rem = n % count;
    const rows = [];
    for (let r = 0; r < count; r++)
        rows.push(base + (r < rem ? 1 : 0));
    return rows;
};
// Narrow automatic grid (below 2100 px, from 4 windows): 3 columns with balanced stacks,
// full-height singles stay left (4 = 1·1·2, 5 = 1·2·2, 6 = 2·2·2, 8 = 2·3·3).
const tile_auto_narrow_stacks = (n) => {
    const base = Math.floor(n / 3);
    const rem = n % 3;
    return [base, base + (rem > 1 ? 1 : 0), base + (rem > 0 ? 1 : 0)];
};
// <<< fill-model
// >>> split-model (pure functions, no Cinnamon imports; tested by tests/split-model.test.js)
// Movable borders of a filled layout, stored as fractions (setting "layouts", field
// "splits", keyed by window count). kind "cols": columns (major, along x) with stacked
// cells (minor, along y) — presets and the narrow auto grid; kind "rows": rows (major,
// along y) with cells side by side (minor, along x) — the wide auto grid. A split is
// { kind, shape, major: [fractions], minor: [[fractions] per column/row] }.
const TILE_SPLIT_MIN_PX = 120;
const TILE_SPLIT_STEP_MAX = 64;
const tile_split_equal = (kind, shape) => ({
    kind: kind,
    shape: shape.slice(),
    major: shape.map(() => 1 / shape.length),
    minor: shape.map((k) => {
        const parts = [];
        for (let i = 0; i < k; i++)
            parts.push(1 / k);
        return parts;
    }),
});
const tile_split_norm = (parts, len) => {
    if (!Array.isArray(parts) || parts.length !== len)
        return null;
    if (!parts.every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0))
        return null;
    const sum = parts.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 1) > 0.02)
        return null;
    return parts.map((v) => v / sum);
};
// Normalised copy of a stored split when it fits (kind, shape), otherwise null.
const tile_split_valid = (kind, shape, split) => {
    if (split == null || typeof split !== 'object' || split.kind !== kind)
        return null;
    if (!Array.isArray(split.shape) || split.shape.length !== shape.length || split.shape.some((v, i) => v !== shape[i]))
        return null;
    const major = tile_split_norm(split.major, shape.length);
    if (!major || !Array.isArray(split.minor) || split.minor.length !== shape.length)
        return null;
    const minor = [];
    for (let i = 0; i < shape.length; i++) {
        const parts = tile_split_norm(split.minor[i], shape[i]);
        if (!parts)
            return null;
        minor.push(parts);
    }
    return { kind: kind, shape: shape.slice(), major: major, minor: minor };
};
// Positions and sizes of n parts along one axis. Without fractions this is exactly the
// equal division of the old code (start + i * len / n), so layouts without a split do
// not move by a pixel.
const tile_split_parts = (fractions, n, start, len) => {
    const out = [];
    if (!fractions) {
        const size = len / n;
        for (let i = 0; i < n; i++)
            out.push([start + i * size, size]);
        return out;
    }
    let acc = 0;
    for (let i = 0; i < n; i++) {
        const from = start + len * acc;
        acc += fractions[i];
        const to = i === n - 1 ? start + len : start + len * acc;
        out.push([from, to - from]);
    }
    return out;
};
// Cell rectangles in placement order: cols column by column, top to bottom; rows row by
// row, left to right.
const tile_split_rects = (kind, shape, split, area) => {
    const [ax, ay, aw, ah] = area;
    const rects = [];
    const cols = kind === 'cols';
    const major = tile_split_parts(split ? split.major : null, shape.length, cols ? ax : ay, cols ? aw : ah);
    for (let i = 0; i < shape.length; i++) {
        const minor = tile_split_parts(split ? split.minor[i] : null, shape[i], cols ? ay : ax, cols ? ah : aw);
        for (const [pos, size] of minor)
            rects.push(cols ? [major[i][0], pos, major[i][1], size] : [pos, major[i][0], size, major[i][1]]);
    }
    return rects;
};
const tile_split_cell_at = (rects, frame) => {
    const cx = frame[0] + frame[2] / 2;
    const cy = frame[1] + frame[3] / 2;
    let best = -1;
    let bestDist = Infinity;
    rects.forEach((r, i) => {
        const dx = r[0] + r[2] / 2 - cx;
        const dy = r[1] + r[3] / 2 - cy;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) {
            bestDist = dist;
            best = i;
        }
    });
    return best;
};
// Which stored border an edge of cell idx is: { list: 'major' | 'minor', i, b } — the
// border between part b and b + 1 of split.major or split.minor[i] — or null when the
// edge lies on the monitor border.
const tile_split_edge_ref = (kind, shape, idx, edge) => {
    let i = 0;
    let j = idx;
    while (i < shape.length && j >= shape[i]) {
        j -= shape[i];
        i++;
    }
    if (idx < 0 || i >= shape.length)
        return null;
    const vertical = edge === 'left' || edge === 'right';
    const after = edge === 'right' || edge === 'bottom';
    if (!vertical && edge !== 'top' && edge !== 'bottom')
        return null;
    const onMajor = (kind === 'cols') === vertical;
    const index = onMajor ? i : j;
    const count = onMajor ? shape.length : shape[i];
    const b = after ? index : index - 1;
    if (b < 0 || b >= count - 1)
        return null;
    return { list: onMajor ? 'major' : 'minor', i: i, b: b };
};
const tile_split_has_edge = (kind, shape, idx, edge) => tile_split_edge_ref(kind, shape, idx, edge) !== null;
const tile_split_axis = (kind, list, area) => {
    const alongX = (kind === 'cols') === (list === 'major');
    return alongX ? [area[0], area[2]] : [area[1], area[3]];
};
const tile_split_border_pos = (kind, shape, split, idx, edge, area) => {
    const ref = tile_split_edge_ref(kind, shape, idx, edge);
    if (!ref)
        return null;
    const s = split || tile_split_equal(kind, shape);
    const parts = ref.list === 'major' ? s.major : s.minor[ref.i];
    const [start, len] = tile_split_axis(kind, ref.list, area);
    const cells = tile_split_parts(split ? parts : null, parts.length, start, len);
    return cells[ref.b][0] + cells[ref.b][1];
};
// New split with the given edge of cell idx moved to pos (screen coordinate). Only the
// two parts next to the border change; both keep at least minPx. null when the edge has
// no neighbour or the two parts have no room for two minimum sizes.
const tile_split_move = (kind, shape, split, idx, edge, pos, area, minPx) => {
    const ref = tile_split_edge_ref(kind, shape, idx, edge);
    if (!ref)
        return null;
    const next = split ? JSON.parse(JSON.stringify(split)) : tile_split_equal(kind, shape);
    const parts = ref.list === 'major' ? next.major : next.minor[ref.i];
    const [start, len] = tile_split_axis(kind, ref.list, area);
    let before = 0;
    for (let k = 0; k < ref.b; k++)
        before += parts[k];
    const p0 = start + len * before;
    const p2 = start + len * (before + parts[ref.b] + parts[ref.b + 1]);
    if (p2 - p0 < 2 * minPx)
        return null;
    const at = Math.min(Math.max(pos, p0 + minPx), p2 - minPx);
    parts[ref.b] = (at - p0) / len;
    parts[ref.b + 1] = (p2 - at) / len;
    return next;
};
// Hotkey action -> the edge to move and the direction (+1 = towards right/bottom).
// The cell grows or shrinks at its right/bottom border; the last cell in that direction
// uses its left/top border instead.
const tile_split_key_target = (kind, shape, idx, action) => {
    const options = {
        wider: [['right', 1], ['left', -1]],
        narrower: [['right', -1], ['left', 1]],
        taller: [['bottom', 1], ['top', -1]],
        shorter: [['bottom', -1], ['top', 1]],
    }[action];
    if (!options)
        return null;
    for (const [edge, sign] of options) {
        if (tile_split_has_edge(kind, shape, idx, edge))
            return { edge: edge, sign: sign };
    }
    return null;
};
// Step size for a resize hotkey. Cinnamon calls the hotkey again on key auto-repeat but
// reports no release: a call of the same action within `threshold` ms (keyboard repeat
// delay + margin) is a repeat and grows the step by 1 px up to TILE_SPLIT_STEP_MAX.
const tile_split_accel = (state, action, now, threshold) => {
    const repeat = state != null && state.action === action && now - state.last <= threshold;
    const step = repeat ? Math.min(TILE_SPLIT_STEP_MAX, state.step + 1) : 1;
    return { step: step, state: { action: action, last: now, step: step } };
};
// Muffin grab op name (e.g. RESIZING_NE) -> window edges that move (corners move two).
const tile_split_op_edges = (name) => {
    const found = /RESIZING_([NS]?)([EW]?)$/.exec(String(name || ''));
    if (!found)
        return [];
    const edges = [];
    if (found[1])
        edges.push(found[1] === 'N' ? 'top' : 'bottom');
    if (found[2])
        edges.push(found[2] === 'W' ? 'left' : 'right');
    return edges;
};
// Edges that moved between the frame at grab start and at release (fallback when the
// grab op does not name a direction, e.g. KEYBOARD_RESIZING_UNKNOWN). 1 px is noise.
const tile_split_frame_edges = (from, to) => {
    const edges = [];
    const moved = (a, b) => Math.abs(a - b) >= 2;
    if (moved(from[1], to[1]))
        edges.push('top');
    if (moved(from[1] + from[3], to[1] + to[3]))
        edges.push('bottom');
    if (moved(from[0], to[0]))
        edges.push('left');
    if (moved(from[0] + from[2], to[0] + to[2]))
        edges.push('right');
    return edges;
};
// Reading order for a retile. rects[i] = [x, y, w, h] of window i; returns the indices in
// placement order. Windows are grouped along the major axis (x for columns, y for rows)
// by overlap: a window joins the current group when it overlaps the group's first window
// by at least half the smaller extent. Groups follow each other by centre, inside a group
// by the other axis. Tiled windows of one column (row) always share a group, whatever the
// borders, so unequal splits and a dragged edge never move a window to another cell.
const tile_sort_order = (rects, columnMajor) => {
    const p = columnMajor ? 0 : 1;
    const s = 1 - p;
    const items = rects.map((r, i) => ({ i: i, r: r, c: r[p] + r[p + 2] / 2 }));
    items.sort((a, b) => (a.c - b.c) || (a.r[s] - b.r[s]) || (a.i - b.i));
    const groups = [];
    for (const it of items) {
        const g = groups[groups.length - 1];
        if (g) {
            const a = g.anchor;
            const overlap = Math.min(a[p] + a[p + 2], it.r[p] + it.r[p + 2]) - Math.max(a[p], it.r[p]);
            if (overlap > 0 && overlap >= 0.5 * Math.min(a[p + 2], it.r[p + 2])) {
                g.items.push(it);
                continue;
            }
        }
        groups.push({ anchor: it.r, items: [it] });
    }
    const order = [];
    for (const g of groups) {
        g.items.sort((a, b) => (a.r[s] - b.r[s]) || (a.r[p] - b.r[p]) || (a.i - b.i));
        for (const it of g.items)
            order.push(it.i);
    }
    return order;
};
// <<< split-model
// Layout greenTile tiles for n windows on this monitor and the active workspace: the
// preset rule filled to n (tile_fill_stacks), or the automatic grid. null when nothing
// is tiled (no rule matches, or no preset and automatic tiling off).
const tile_layout_shape = (app, monitorIndex, n) => {
    const monitor = utils_Main.layoutManager.monitors[monitorIndex];
    if (!monitor || n < 2)
        return null;
    const layoutState = tile_layout_for(app, monitorIndex, global.workspace_manager.get_active_workspace().index());
    if (layoutState.preset) {
        const rule = tile_rules_pick(layoutState.preset.rules, n);
        if (!rule || !rule.stacks || rule.stacks.length === 0)
            return null;
        return { kind: 'cols', shape: tile_fill_stacks(rule.stacks, n), rule: rule, preset: layoutState.preset };
    }
    return layoutState.auto ? tile_auto_shape(monitor, n) : null;
};
const tile_preset_retile = (app, monitorIndex, focusWindow, animate = true) => {
    const monitor = utils_Main.layoutManager.monitors[monitorIndex];
    if (!monitor)
        return;
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    const preset = tile_layout_for(app, monitorIndex, wsIndex).preset;
    if (!preset)
        return;
    const area = getUsableScreenArea(monitor);
    const windows = tile_collect_windows(monitor, focusWindow);
    const focused = focusWindow && !focusWindow.minimized && focusWindow.get_monitor() === monitorIndex
        && !tile_excl_is_excluded(focusWindow);
    const n = windows.length + (focused ? 1 : 0);
    const layout = tile_layout_shape(app, monitorIndex, n);
    if (!layout || !layout.rule)
        return;
    const ordered = tile_sort_reading_order((focused ? [focusWindow] : []).concat(windows), true);
    const split = tile_split_for(app, monitorIndex, wsIndex, n, layout);
    tile_place_rects(app, ordered, layout, split, area, animate);
    if (animate)
        global.log('greenTile preset "' + preset.name + '" applied ws' + (wsIndex + 1) + ' mon=' + (tile_monitors.keys[monitorIndex] || '?') + ' n=' + n + ' stacks=[' + layout.rule.stacks.join(',') + ']' + (split ? ' split' : ''));
};
// >>> auto-model (pure functions, no Cinnamon imports; tested by tests/auto-model.test.js)
// Legacy per-workspace automatic tiling list "autoWorkspaces": rows
// { workspace: <number from 1, as shown in the panel>, auto: true | false }. The
// runtime reads its automatic tiling state from the "layouts" setting now; this block
// survives for the one-time migration, which still parses these rows (invalid rows
// ignored, with duplicates the last row wins).
const tile_auto_row_ok = (row) => row != null && typeof row === 'object'
    && Number.isInteger(row.workspace) && row.workspace >= 1 && typeof row.auto === 'boolean';
const tile_auto_list_map = (list) => {
    const map = {};
    if (!Array.isArray(list))
        return map;
    for (const row of list) {
        if (tile_auto_row_ok(row))
            map[row.workspace - 1] = row.auto;
    }
    return map;
};
const tile_auto_ws_active = (map, wsIndex, hasPreset) => {
    const value = map[wsIndex];
    return typeof value === 'boolean' ? value : hasPreset;
};
const tile_auto_list_set = (list, wsIndex, on) => {
    const rows = (Array.isArray(list) ? list : [])
        .filter((row) => tile_auto_row_ok(row) && row.workspace !== wsIndex + 1)
        .map((row) => ({ workspace: row.workspace, auto: row.auto }));
    rows.push({ workspace: wsIndex + 1, auto: on });
    return rows.sort((a, b) => a.workspace - b.workspace);
};
// <<< auto-model
// >>> layouts-model (pure functions, no Cinnamon imports; tested by tests/layouts-model.test.js)
// Per monitor AND workspace layout assignments, stored in the string setting "layouts":
// { "<monitor key>": { "<workspace number from 1 | *>": { preset?: id, auto?: boolean, splits?: { "<window count>": split } } } }
// (splits: movable borders, see split-model).
// Missing entry/field: no preset, automatic tiling on exactly when a preset is assigned.
// Nothing is inherited from other monitors or workspaces; invalid data is ignored on read.
const tile_layouts_parse = (raw) => {
    if (raw == null || raw === '')
        return {};
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (e) {
        return null;
    }
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : null;
};
const tile_layouts_entry = (layouts, mkey, wskey, presetIds) => {
    const monitor = (layouts && typeof layouts === 'object' && !Array.isArray(layouts) ? layouts[mkey] : null) || {};
    const entry = (entry_ => (entry_ && typeof entry_ === 'object' ? entry_ : null) || {})(monitor[wskey]);
    let preset = null;
    if (typeof entry.preset === 'string' && presetIds.indexOf(entry.preset) !== -1)
        preset = entry.preset;
    const auto = typeof entry.auto === 'boolean' ? entry.auto : preset != null;
    return { preset: preset, auto: auto };
};
// Raw "splits" object of an entry ({ "<window count>": split }), {} when missing.
const tile_layouts_splits = (layouts, mkey, wskey) => {
    const isObject = (v) => Object.prototype.toString.call(v) === '[object Object]';
    const monitor = isObject(layouts) && isObject(layouts[mkey]) ? layouts[mkey] : {};
    const entry = isObject(monitor[wskey]) ? monitor[wskey] : {};
    return isObject(entry.splits) ? entry.splits : {};
};
const tile_layouts_set = (layouts, mkey, wskey, patch) => {
    const next = JSON.parse(JSON.stringify(layouts && typeof layouts === 'object' ? layouts : {}));
    const monitor = Object.prototype.toString.call(next[mkey]) === '[object Object]' ? next[mkey] : {};
    const entry = Object.assign({}, monitor[wskey] || {});
    if (patch && 'preset' in patch) {
        if (patch.preset == null)
            delete entry.preset;
        else if (typeof patch.preset === 'string' && patch.preset)
            entry.preset = patch.preset;
    }
    if (patch && 'auto' in patch) {
        if (patch.auto == null)
            delete entry.auto;
        else if (typeof patch.auto === 'boolean')
            entry.auto = patch.auto;
    }
    // splits: null removes all; { "<window count>": split | null } sets/removes single
    // counts. The split objects are checked on read (tile_split_valid), not here.
    if (patch && 'splits' in patch) {
        const isObject = (v) => Object.prototype.toString.call(v) === '[object Object]';
        if (patch.splits === null)
            delete entry.splits;
        else if (isObject(patch.splits)) {
            const splits = isObject(entry.splits) ? Object.assign({}, entry.splits) : {};
            for (const count of Object.keys(patch.splits)) {
                const value = patch.splits[count];
                if (value === null)
                    delete splits[count];
                else if (isObject(value))
                    splits[count] = JSON.parse(JSON.stringify(value));
            }
            if (Object.keys(splits).length === 0)
                delete entry.splits;
            else
                entry.splits = splits;
        }
    }
    if (Object.keys(entry).length === 0)
        delete monitor[wskey];
    else
        monitor[wskey] = entry;
    if (Object.keys(monitor).length === 0)
        delete next[mkey];
    else
        next[mkey] = monitor;
    return next;
};
const tile_layouts_migrate = (wsPresets, autoList, mkey) => {
    const autoMap = tile_auto_list_map(autoList);
    const presets = (wsPresets && typeof wsPresets === 'object' && !Array.isArray(wsPresets)) ? wsPresets : {};
    const indexes = [];
    for (const key of Object.keys(presets)) {
        const idx = Number(key);
        if (Number.isInteger(idx) && idx >= 0)
            indexes.push(idx);
    }
    for (const key of Object.keys(autoMap)) {
        const idx = Number(key);
        if (indexes.indexOf(idx) === -1)
            indexes.push(idx);
    }
    const migrated = {};
    for (const idx of indexes.sort((a, b) => a - b)) {
        const preset = typeof presets[String(idx)] === 'string' ? presets[String(idx)] : null;
        let auto = null;
        if (typeof autoMap[idx] === 'boolean')
            auto = autoMap[idx];
        if (!preset && !auto)
            continue;
        const entry = {};
        if (preset)
            entry.preset = preset;
        // Implied auto (preset default) stays implicit; only an explicit row value is stored.
        if (auto !== null)
            entry.auto = auto;
        migrated[String(idx + 1)] = entry;
    }
    return Object.keys(migrated).length === 0 ? {} : { [mkey]: migrated };
};
// <<< layouts-model
// Retiles exactly one monitor: preset layout when (monitor, workspace) has one, else
// the auto grid when automatic tiling is on. Monitors whose entry has automatic tiling
// off are left alone — hotkeys retile directly and do not come through here.
const tile_retile_monitor = (app, monitorIndex, focusWindow, animate = true) => {
    if (!tile_monitors.ready || !utils_Main.layoutManager.monitors[monitorIndex])
        return;
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    const layout = tile_layout_for(app, monitorIndex, wsIndex);
    if (layout.preset)
        tile_preset_retile(app, monitorIndex, focusWindow, animate);
    else if (layout.auto)
        tile_app_auto(app, monitorIndex, focusWindow, animate);
};
// >>> editor-model (pure functions, no Cinnamon imports; tested by tests/editor-model.test.js)
// Preset editor model. A rule is {min, stacks}; stacks[i] = windows stacked in column i.
// The painter grid of the approved prototype has 6 columns and 4 rows.
const tile_editor_cols = 6;
const tile_editor_rows = 4;
const tile_editor_min_floor = 2;
const tile_editor_min_ceiling = 50;
const tile_editor_clamp_int = (v, lo, hi) => Math.min(Math.max(Math.floor(v), lo), hi);
const tile_editor_clamp = (stacks) => {
    const next = stacks.slice(0, tile_editor_cols).map((s) => tile_editor_clamp_int(s, 1, tile_editor_rows));
    return next.length ? next : [1];
};
// Column `col` holds `row + 1` windows; missing columns up to `col` get the same value.
const tile_editor_paint = (stacks, col, row) => {
    const c = tile_editor_clamp_int(col, 0, tile_editor_cols - 1);
    const value = tile_editor_clamp_int(row, 0, tile_editor_rows - 1) + 1;
    const next = stacks.slice(0, tile_editor_cols);
    while (next.length < c)
        next.push(value);
    next[c] = value;
    return next;
};
const tile_editor_paint_range = (stacks, from, to, row) => {
    const a = tile_editor_clamp_int(Math.min(from, to), 0, tile_editor_cols - 1);
    const b = tile_editor_clamp_int(Math.max(from, to), 0, tile_editor_cols - 1);
    let next = stacks.slice();
    for (let c = a; c <= b; c++)
        next = tile_editor_paint(next, c, row);
    return next;
};
const tile_editor_remove = (stacks, col) => {
    const next = stacks.slice();
    if (next.length > 1 && col >= 0 && col < next.length)
        next.splice(col, 1);
    return next;
};
const tile_editor_sort = (rules) => rules.slice().sort((a, b) => a.min - b.min);
const tile_editor_add_rule = (rules) => {
    const sorted = tile_editor_sort(rules);
    const last = sorted[sorted.length - 1];
    if (!last)
        return { rules: [{ min: tile_editor_min_floor, stacks: [1, 1] }], index: 0 };
    if (last.min >= tile_editor_min_ceiling)
        return { rules: sorted, index: sorted.length - 1 };
    return { rules: sorted.concat([{ min: last.min + 1, stacks: last.stacks.slice() }]), index: sorted.length };
};
const tile_editor_delete_rule = (rules, index) => {
    if (rules.length <= 1 || index < 0 || index >= rules.length)
        return { rules: rules.slice(), index: tile_editor_clamp_int(index, 0, Math.max(rules.length - 1, 0)) };
    const next = rules.slice();
    next.splice(index, 1);
    return { rules: next, index: Math.min(index, next.length - 1) };
};
// Moves the threshold of rule `index` by delta and skips values used by other rules.
const tile_editor_step_min = (rules, index, delta) => {
    const used = rules.filter((r, i) => i !== index).map((r) => r.min);
    let min = rules[index].min + delta;
    while (used.indexOf(min) !== -1)
        min += delta;
    if (min < tile_editor_min_floor || min > tile_editor_min_ceiling)
        return { rules: rules.slice(), index };
    const edited = { min, stacks: rules[index].stacks.slice() };
    const sorted = tile_editor_sort(rules.map((r, i) => (i === index ? edited : r)));
    return { rules: sorted, index: sorted.indexOf(edited) };
};
const tile_editor_validate = (draft) => (String(draft.name || '').trim() ? null : 'name');
const tile_editor_new_id = (presets) => {
    let max = 0;
    for (const p of presets) {
        const found = /^p(\d+)$/.exec(String(p.id));
        if (found)
            max = Math.max(max, parseInt(found[1], 10));
    }
    return 'p' + (max + 1);
};
const tile_editor_commit = (presets, preset) => {
    const i = presets.findIndex((p) => p.id === preset.id);
    if (i === -1)
        return presets.concat([preset]);
    const next = presets.slice();
    next[i] = preset;
    return next;
};
// <<< editor-model
// Preset panel — view 1 (selection list) and, further below, view 2 (editor);
// design tokens from the approved HTML mockup (docs/superpowers/specs/2026-09-28-preset-ui-design.md).
const tile_St = imports.gi.St;
const tile_Clutter = imports.gi.Clutter;
const tile_Util = imports.misc.util;
const tile_panel = {
    actor: null,
    positioned: false,
    saved: null,
    sig: [],
    dragging: false,
    // 'list' (view 1) or 'editor' (view 2); the draft is the editor's working copy
    view: 'list',
    draft: null,
    // Monotonic time (µs) until which mouse buttons on the panel are ignored: the
    // second click of a double-click must not act in the view it just opened.
    guardUntil: 0,
    // Escape registered as a hotkey while the list is open (it has no modal).
    escBound: false,
};
const TILE_PANEL_SWITCH_GUARD_US = 400 * 1000;
const tile_panel_guard = () => {
    tile_panel.guardUntil = GLib.get_monotonic_time() + TILE_PANEL_SWITCH_GUARD_US;
};
const tile_panel_close = () => {
    if (tile_panel.escBound) {
        tile_panel.escBound = false;
        utils_Main.keybindingManager.removeHotKey('greenTile-panel-esc');
    }
    if (!tile_panel.actor)
        return;
    const actor = tile_panel.actor;
    tile_panel.actor = null;
    tile_panel.dragging = false;
    tile_panel.view = 'list';
    tile_panel.draft = null;
    tile_panel.sig.splice(0).forEach(({ obj, id }) => {
        try {
            obj.disconnect(id);
        } catch (e) {
            // signal was already gone
        }
    });
    try {
        utils_Main.layoutManager.removeChrome(actor);
    }
    catch (e) {
        // not in the chrome — destroy anyway
    }
    actor.destroy();
};
const tile_panel_round_rect = (cr, x, y, w, h, r) => {
    cr.newSubPath();
    cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    cr.arc(x + r, y + r, r, Math.PI, 3 * Math.PI / 2);
    cr.closePath();
    cr.fill();
};
// Mockup: list thumbnails 54x34, gap 2px, radius 2px, fill per tile_theme_cairo.thumb
// (#485064 dark / #b7bdcc light);
// editor rule thumbnails 34x18, gap 2px, 1px between stacked cells, radius 1px.
const tile_panel_thumb = (stacks, opts = {}) => {
    const { width = 54, height = 34, gap = 2, vgap = 2, radius = 2, color = null } = opts;
    const area = new tile_St.DrawingArea({ width, height });
    area.connect('repaint', (a) => {
        const cr = a.get_context();
        const [W, H] = a.get_surface_size();
        const paint = color || tile_theme_cairo_get('thumb');
        cr.setSourceRGB(paint[0] / 255, paint[1] / 255, paint[2] / 255);
        const cw = (W - gap * (stacks.length - 1)) / stacks.length;
        for (let c = 0; c < stacks.length; c++) {
            // Many stacked cells (surplus windows in the filled thumbnail): the gap shrinks
            // so that each cell keeps at least 1px.
            const vg = stacks[c] > 1 ? Math.max(0, Math.min(vgap, (H - stacks[c]) / (stacks[c] - 1))) : 0;
            const ch = (H - vg * (stacks[c] - 1)) / stacks[c];
            for (let r = 0; r < stacks[c]; r++)
                tile_panel_round_rect(cr, c * (cw + gap), r * (ch + vg), cw, ch, Math.min(radius, ch / 2));
        }
        cr.$dispose();
    });
    return area;
};
const tile_panel_middle = () => ({ x_fill: false, y_fill: false, y_align: tile_St.Align.MIDDLE });
// Thumbnail = the rule a click would apply right now (current window count);
// fallback: the smallest rule, so an empty workspace still shows the base layout.
const tile_panel_window_count = () => {
    const focusWindow = tile_focus_window();
    if (!focusWindow)
        return 0;
    const monitor = utils_Main.layoutManager.monitors[focusWindow.get_monitor()];
    return tile_collect_windows(monitor, focusWindow).length + (tile_excl_is_excluded(focusWindow) ? 0 : 1);
};
const tile_panel_row = (app, preset, n) => {
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    const monitorIndex = tile_focus_monitor_index();
    const assignedLayout = tile_layout_for(app, monitorIndex, wsIndex).preset;
    const assignedHere = assignedLayout != null && assignedLayout.id === preset.id;
    // x_fill: St.Button centres its child by default — the row must span the full width
    const row = new tile_St.Button({ style_class: 'gk-row' + (assignedHere ? ' gk-row-assigned' : ''), x_fill: true, y_fill: true, track_hover: true, reactive: true });
    const outer = new tile_St.BoxLayout({ x_expand: true });
    // green left stripe as its own actor — St draws per-side border colours unreliably
    if (assignedHere)
        outer.add(new tile_St.Bin({ style_class: 'gk-row-stripe' }), { x_fill: false, y_fill: true });
    const box = new tile_St.BoxLayout({ style_class: 'gk-row-box', x_expand: true });
    outer.add(box, { expand: true, x_fill: true, y_fill: true });
    const picked = tile_rules_pick(preset.rules, n);
    const rep = picked || preset.rules.reduce((best, rule) => (!best || rule.min < best.min ? rule : best), null);
    // A matching rule is shown filled to the window count, exactly as a click tiles it.
    const thumbStacks = rep && rep.stacks.length ? (picked ? tile_fill_stacks(rep.stacks, n) : rep.stacks) : [1];
    box.add(tile_panel_thumb(thumbStacks), tile_panel_middle());
    const textBox = new tile_St.BoxLayout({ vertical: true, style_class: 'gk-row-text' });
    textBox.add(new tile_St.Label({ text: preset.name, style_class: 'gk-name' }));
    if (assignedHere)
        textBox.add(new tile_St.Label({ text: '✓ ' + _("assigned — workspace %d").format(wsIndex + 1), style_class: 'gk-sub' }));
    box.add(textBox, { expand: true, x_fill: true, y_fill: false, y_align: tile_St.Align.MIDDLE });
    if (assignedHere) {
        const un = new tile_St.Button({ label: '✕', style_class: 'gk-icon-btn', track_hover: true });
        un.connect('clicked', () => {
            tile_layout_set(app, monitorIndex, wsIndex, { preset: null });
            global.log('greenTile preset unassigned ws' + wsIndex);
            tile_panel_rebuild(app);
        });
        box.add(un, tile_panel_middle());
    }
    const edit = new tile_St.Button({ label: '🔧', style_class: 'gk-icon-btn', track_hover: true });
    edit.connect('clicked', () => tile_editor_open(app, preset));
    box.add(edit, tile_panel_middle());
    row.set_child(outer);
    row.connect('clicked', () => {
        tile_layout_set(app, monitorIndex, wsIndex, { preset: preset.id });
        global.log('greenTile preset "' + preset.name + '" assigned ws' + wsIndex);
        // Choosing a preset means "tile this workspace with it": a monitor/workspace
        // whose automatic tiling was switched off (Super+Ctrl+D) is switched on again.
        if (!tile_layout_for(app, monitorIndex, wsIndex).auto)
            tile_layout_set(app, monitorIndex, wsIndex, { auto: true });
        const focusWindow = tile_focus_window();
        tile_retile_monitor(app, monitorIndex, focusWindow);
        // The list stays open so several presets can be tried in a row; only ✕,
        // Escape or the panel hotkey close it. Rebuild shows the new assignment.
        tile_panel_rebuild(app);
    });
    return row;
};
// Preset panel — view 2 (editor): rule list on the left, stepper + painter + name on
// the right (layout and tokens from the approved prototype). The draft
// {id, name, rules (sorted by min), index, isNew} is written to the settings on Save only.
const tile_editor_accent = [255, 150, 64];
const tile_editor_open = (app, preset) => {
    const rules = tile_editor_sort((preset.rules || []).map((r) => ({ min: r.min, stacks: tile_editor_clamp(r.stacks || []) })));
    if (rules.length === 0)
        rules.push({ min: tile_editor_min_floor, stacks: [1, 1] });
    // Start on the rule a click in view 1 would apply right now
    const pick = tile_rules_pick(rules, tile_panel_window_count());
    tile_panel.draft = { id: preset.id, name: preset.name || '', rules, index: Math.max(rules.indexOf(pick), 0), isNew: !!preset.isNew };
    tile_panel.view = 'editor';
    tile_panel_guard();
    tile_panel_rebuild(app);
};
const tile_editor_open_new = (app) => {
    tile_editor_open(app, { id: tile_editor_new_id(tile_presets_read(app)), name: '', rules: [{ min: tile_editor_min_floor, stacks: [1, 1] }], isNew: true });
};
const tile_editor_back = (app) => {
    tile_panel.view = 'list';
    tile_panel.draft = null;
    tile_panel_guard();
    tile_panel_rebuild(app);
};
const tile_editor_save = (app, errorLabel) => {
    const d = tile_panel.draft;
    if (!d)
        return;
    if (tile_editor_validate(d) === 'name') {
        errorLabel.text = _("Please enter a name.");
        return;
    }
    const preset = { id: d.id, name: d.name.trim(), rules: d.rules.map((r) => ({ min: r.min, stacks: r.stacks.slice() })) };
    tile_presets_write(app, tile_editor_commit(tile_presets_read(app), preset));
    global.log('greenTile preset "' + preset.name + '" saved (' + preset.rules.length + ' rules)');
    tile_editor_back(app);
    // Retile only where the preset is in use AND automatic tiling is on; a paused
    // workspace (Super+Ctrl+D) is left alone until Super+Ctrl+A.
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    const layout = tile_layout_for(app, tile_focus_monitor_index(), wsIndex);
    if (layout.preset && layout.preset.id === preset.id && layout.auto)
        tile_retile_monitor(app, tile_focus_monitor_index(), tile_focus_window());
};
const tile_editor_rule_row = (rule, active, last, onSelect) => {
    const row = new tile_St.Button({
        style_class: 'gk-ed-rule' + (active ? ' gk-ed-rule-active' : '') + (last ? ' gk-ed-rule-last' : ''),
        x_fill: true, y_fill: true, track_hover: true, reactive: true,
    });
    const outer = new tile_St.BoxLayout({ x_expand: true });
    if (active)
        outer.add(new tile_St.Bin({ style_class: 'gk-ed-rule-stripe' }), { x_fill: false, y_fill: true });
    const box = new tile_St.BoxLayout({ style_class: 'gk-ed-rule-box', x_expand: true });
    box.add(new tile_St.Label({ text: _("from %d").format(rule.min), style_class: 'gk-ed-rule-label' }), { expand: true, x_fill: true, y_fill: false, y_align: tile_St.Align.MIDDLE });
    box.add(tile_panel_thumb(rule.stacks, { width: 34, height: 18, gap: 2, vgap: 1, radius: 1, color: active ? tile_editor_accent : tile_theme_cairo_get('thumb') }), tile_panel_middle());
    outer.add(box, { expand: true, x_fill: true, y_fill: true });
    row.set_child(outer);
    row.connect('clicked', () => onSelect());
    return row;
};
// Painter: 6 columns x 4 rows. Button 1 paints (row under the pointer = windows in the
// column), dragging paints every column passed; button 3 removes the column.
const tile_editor_painter = (getStacks, onChange) => {
    const frame = new tile_St.Bin({ style_class: 'gk-painter', x_fill: true, y_fill: true });
    const area = new tile_St.DrawingArea({ style_class: 'gk-painter-area', reactive: true, x_expand: true });
    frame.set_child(area);
    area.connect('repaint', (a) => {
        const cr = a.get_context();
        const [W, H] = a.get_surface_size();
        const stacks = getStacks();
        const gap = 3;
        const cw = (W - gap * (tile_editor_cols - 1)) / tile_editor_cols;
        for (let c = 0; c < tile_editor_cols; c++) {
            const x = c * (cw + gap);
            if (c < stacks.length) {
                cr.setSourceRGBA(tile_editor_accent[0] / 255, tile_editor_accent[1] / 255, tile_editor_accent[2] / 255, 0.85);
                const ch = (H - gap * (stacks[c] - 1)) / stacks[c];
                for (let r = 0; r < stacks[c]; r++)
                    tile_panel_round_rect(cr, x, r * (ch + gap), cw, ch, 2);
            }
            else {
                // empty column: dashed outline in the border colour
                const outline = tile_theme_cairo_get('outline');
                cr.setSourceRGB(outline[0] / 255, outline[1] / 255, outline[2] / 255);
                cr.setLineWidth(1);
                cr.setDash([3, 3], 0);
                cr.rectangle(x + 0.5, 0.5, cw - 1, H - 1);
                cr.stroke();
                cr.setDash([], 0);
            }
        }
        cr.$dispose();
    });
    const cellAt = (event) => {
        const [sx, sy] = event.get_coords();
        const [ok, lx, ly] = area.transform_stage_point(sx, sy);
        if (!ok)
            return null;
        const [w, h] = area.get_size();
        if (w <= 0 || h <= 0)
            return null;
        const col = Math.min(Math.max(Math.floor(lx / (w / tile_editor_cols)), 0), tile_editor_cols - 1);
        return { col, row: Math.floor(ly / (h / tile_editor_rows)) };
    };
    let stroke = null;
    const endStroke = () => {
        if (!stroke)
            return;
        const device = stroke.device;
        stroke = null;
        device.ungrab();
        try {
            utils_Main.popModal(area);
        }
        catch (e) {
            // already popped
        }
    };
    area.connect('button-press-event', (a, event) => {
        const pos = cellAt(event);
        if (!pos)
            return tile_Clutter.EVENT_PROPAGATE;
        const button = event.get_button();
        if (button === 3) {
            onChange(tile_editor_remove(getStacks(), pos.col));
            return tile_Clutter.EVENT_STOP;
        }
        if (button !== 1)
            return tile_Clutter.EVENT_PROPAGATE;
        endStroke();
        onChange(tile_editor_paint(getStacks(), pos.col, pos.row));
        // Same recipe as the title-bar drag (pushModal + device.grab): the stroke keeps
        // receiving motion and release when the pointer leaves the painter.
        if (utils_Main.pushModal(area)) {
            const device = event.get_device();
            device.grab(area);
            stroke = { device, col: pos.col };
        }
        return tile_Clutter.EVENT_STOP;
    });
    area.connect('motion-event', (a, event) => {
        if (!stroke)
            return tile_Clutter.EVENT_PROPAGATE;
        const pos = cellAt(event);
        if (!pos)
            return tile_Clutter.EVENT_STOP;
        if (pos.col === stroke.col)
            onChange(tile_editor_paint(getStacks(), pos.col, pos.row));
        else
            onChange(tile_editor_paint_range(getStacks(), stroke.col + Math.sign(pos.col - stroke.col), pos.col, pos.row));
        stroke.col = pos.col;
        return tile_Clutter.EVENT_STOP;
    });
    area.connect('button-release-event', () => {
        if (!stroke)
            return tile_Clutter.EVENT_PROPAGATE;
        endStroke();
        return tile_Clutter.EVENT_STOP;
    });
    // Connected before any pushModal(area), so it runs before main.js' own destroy
    // handler and pops a valid record (popModal on an unknown actor ends ALL modals).
    area.connect('destroy', () => endStroke());
    return { actor: frame, area };
};
const tile_editor_body = (app) => {
    const middle = tile_panel_middle();
    const body = new tile_St.BoxLayout({ style_class: 'gk-ed-body', reactive: true });
    // left column: rules
    const left = new tile_St.BoxLayout({ vertical: true, style_class: 'gk-ed-left' });
    left.add(new tile_St.Label({ text: _("Rules (by window count)").toUpperCase(), style_class: 'gk-ed-label' }));
    const rulesBox = new tile_St.BoxLayout({ vertical: true, style_class: 'gk-ed-rules' });
    left.add(rulesBox);
    const actions = new tile_St.BoxLayout({ style_class: 'gk-ed-actions' });
    const addBtn = new tile_St.Button({ label: '＋ ' + _("Rule"), style_class: 'gk-ed-add', track_hover: true });
    const delBtn = new tile_St.Button({ label: '🗑 ' + _("Delete rule"), style_class: 'gk-ed-del', track_hover: true });
    actions.add(addBtn);
    actions.add(delBtn);
    left.add(actions);
    body.add(left, { x_fill: false, y_fill: false, y_align: tile_St.Align.START });
    // right column: stepper, painter, name, save
    const right = new tile_St.BoxLayout({ vertical: true, style_class: 'gk-ed-right', x_expand: true });
    const stepper = new tile_St.BoxLayout({ style_class: 'gk-stepper' });
    stepper.add(new tile_St.Label({ text: _("Rule applies from").toUpperCase(), style_class: 'gk-ed-label' }), middle);
    const minus = new tile_St.Button({ label: '−', style_class: 'gk-stepper-btn', track_hover: true });
    const value = new tile_St.Label({ style_class: 'gk-stepper-value' });
    const plus = new tile_St.Button({ label: '+', style_class: 'gk-stepper-btn', track_hover: true });
    stepper.add(minus, middle);
    stepper.add(value, middle);
    stepper.add(plus, middle);
    stepper.add(new tile_St.Label({ text: _("windows").toUpperCase(), style_class: 'gk-ed-label' }), middle);
    right.add(stepper);
    right.add(new tile_St.Label({ text: _("Painter").toUpperCase(), style_class: 'gk-ed-label' }));
    let refresh = () => {};
    const painter = tile_editor_painter(
        () => tile_panel.draft.rules[tile_panel.draft.index].stacks,
        (stacks) => {
            const dr = tile_panel.draft;
            const rule = dr.rules[dr.index];
            if (stacks.join(',') === rule.stacks.join(','))
                return;
            dr.rules[dr.index] = { min: rule.min, stacks };
            refresh();
        });
    right.add(painter.actor);
    const result = new tile_St.Label({ style_class: 'gk-ed-faint' });
    right.add(result);
    const hint = new tile_St.Label({ text: _("Click or drag: the row sets how many windows the column holds. Right-click removes a column."), style_class: 'gk-ed-faint' });
    hint.clutter_text.line_wrap = true;
    hint.clutter_text.ellipsize = imports.gi.Pango.EllipsizeMode.NONE;
    right.add(hint);
    const nameRow = new tile_St.BoxLayout({ style_class: 'gk-ed-name-row' });
    nameRow.add(new tile_St.Label({ text: _("Name").toUpperCase(), style_class: 'gk-ed-label' }), middle);
    const entry = new tile_St.Entry({ style_class: 'gk-entry', text: tile_panel.draft.name, hint_text: _("Preset name"), can_focus: true, x_expand: true });
    nameRow.add(entry, { expand: true, x_fill: true, y_fill: false, y_align: tile_St.Align.MIDDLE });
    right.add(nameRow);
    const saveRow = new tile_St.BoxLayout({ style_class: 'gk-ed-save-row' });
    const save = new tile_St.Button({ label: _("Save"), style_class: 'gk-save', track_hover: true });
    const error = new tile_St.Label({ text: '', style_class: 'gk-error' });
    saveRow.add(save, middle);
    saveRow.add(error, middle);
    right.add(saveRow);
    body.add(right, { expand: true, x_fill: true, y_fill: true });
    refresh = () => {
        const dr = tile_panel.draft;
        rulesBox.destroy_all_children();
        dr.rules.forEach((rule, i) => {
            rulesBox.add(tile_editor_rule_row(rule, i === dr.index, i === dr.rules.length - 1, () => {
                dr.index = i;
                refresh();
            }));
        });
        const rule = dr.rules[dr.index];
        value.text = String(rule.min);
        result.text = _("Result: %s").format('[' + rule.stacks.join(',') + ']');
        const canDelete = dr.rules.length > 1;
        delBtn.reactive = canDelete;
        if (canDelete)
            delBtn.remove_style_pseudo_class('insensitive');
        else
            delBtn.add_style_pseudo_class('insensitive');
        painter.area.queue_repaint();
    };
    const apply = (r) => {
        tile_panel.draft.rules = r.rules;
        tile_panel.draft.index = r.index;
        refresh();
    };
    addBtn.connect('clicked', () => apply(tile_editor_add_rule(tile_panel.draft.rules)));
    delBtn.connect('clicked', () => apply(tile_editor_delete_rule(tile_panel.draft.rules, tile_panel.draft.index)));
    minus.connect('clicked', () => apply(tile_editor_step_min(tile_panel.draft.rules, tile_panel.draft.index, -1)));
    plus.connect('clicked', () => apply(tile_editor_step_min(tile_panel.draft.rules, tile_panel.draft.index, 1)));
    entry.clutter_text.connect('text-changed', () => {
        tile_panel.draft.name = entry.get_text();
        error.text = '';
    });
    entry.clutter_text.connect('activate', () => tile_editor_save(app, error));
    save.connect('clicked', () => tile_editor_save(app, error));
    refresh();
    return { actor: body, entry, painter: painter.area };
};
// >>> panel-size-model (pure functions, no Cinnamon imports; tested by tests/panel-size-model.test.js)
// The preset panel can be resized with the grip in its bottom right corner, list and
// editor separately. Setting "panelSize": {"list": {"w", "h"}, "editor": {"w", "h"}};
// w is the panel width, h the height of the part that stretches (list: the preset
// rows, editor: the painter). Without a stored size the panel keeps its natural size.
const TILE_PANEL_MIN = { list: { w: 600, h: 180 }, editor: { w: 600, h: 136 } };
const tile_panel_size_ok = (s) => s != null && typeof s === 'object'
    && typeof s.w === 'number' && Number.isFinite(s.w) && s.w > 0
    && typeof s.h === 'number' && Number.isFinite(s.h) && s.h > 0;
const tile_panel_size_obj = (raw) => {
    try {
        const v = JSON.parse(raw || '{}');
        return v != null && typeof v === 'object' && !Array.isArray(v) ? v : {};
    }
    catch (e) {
        return {};
    }
};
const tile_panel_size_parse = (raw) => {
    const v = tile_panel_size_obj(raw);
    return {
        list: tile_panel_size_ok(v.list) ? { w: v.list.w, h: v.list.h } : null,
        editor: tile_panel_size_ok(v.editor) ? { w: v.editor.w, h: v.editor.h } : null,
    };
};
const tile_panel_size_set = (raw, view, size) => {
    const parsed = tile_panel_size_parse(raw);
    const next = {};
    for (const key of ['list', 'editor']) {
        if (parsed[key])
            next[key] = parsed[key];
    }
    next[view] = { w: Math.round(size.w), h: Math.round(size.h) };
    return JSON.stringify(next);
};
// max = room on the monitor; when it is smaller than the minimum, the minimum wins.
const tile_panel_size_clamp = (size, min, max) => ({
    w: Math.round(Math.max(Math.min(size.w, max.w), min.w)),
    h: Math.round(Math.max(Math.min(size.h, max.h), min.h)),
});
// <<< panel-size-model
// >>> theme-model (pure functions, no Cinnamon imports; tested by tests/theme-model.test.js)
// The preset panel follows the desktop. "system" resolves the x-apps portal color
// scheme ('prefer-dark'/'prefer-light'); 'default' or a missing schema falls back to
// the Cinnamon theme name (Mint's dark themes carry "Dark" in their name), then light.
// "light"/"dark" override the system, whatever it says.
const tile_theme_resolve = (setting, colorScheme, themeName) => {
    if (setting === 'light' || setting === 'dark')
        return setting;
    if (colorScheme === 'prefer-dark')
        return 'dark';
    if (colorScheme === 'prefer-light')
        return 'light';
    return /dark/i.test(String(themeName || '')) ? 'dark' : 'light';
};
// The header toggle switches between light and dark only; the panelTheme setting
// written is the opposite of the theme currently SHOWN, so "system" is overridden
// by a click. "Follow system" is selectable again in the settings dialog.
const tile_theme_toggle_target = (theme) => (theme === 'light' ? 'dark' : 'light');
// <<< theme-model
// Live theme state, set up per App (Config). Reads the panelTheme setting, the x-apps
// portal color scheme and the Cinnamon theme name; under "system" a change of the
// scheme rebuilds the open panel right away. Disconnected in Config.destroy.
// tile_theme_init gets the Config itself, not the app: it runs inside the Config
// constructor, where app.config is not assigned yet.
const tile_theme_state = { theme: 'dark', config: null, portal: null, portalSig: 0, cinnamon: null, cinnamonSig: 0 };
// Cairo colors for the thumbnails and the painter's dashed outline, per theme; the CSS
// classes cover the rest. Thumbs stand somewhat (not dramatically) apart from the panel
// background: #1c1f28 in dark, #f6f7fa in light — thumb contrast 1.70→2.04 (dark,
// lighter) and 1.49→1.76 (light, darker) against the panel. The outline pairs with the
// CSS border tokens (#2a2e39 / #c3c9d6) and stays.
const tile_theme_cairo = {
    dark: { thumb: [72, 80, 100], outline: [42, 46, 57] },
    light: { thumb: [183, 189, 204], outline: [195, 201, 214] },
};
const tile_theme_cairo_get = (key) => tile_theme_cairo[tile_theme_state.theme][key];
const tile_theme_panel_class = () => tile_theme_state.theme === 'light' ? 'gk-panel gk-light' : 'gk-panel';
const tile_theme_changed = () => {
    const config = tile_theme_state.config;
    if (!config)
        return;
    tile_theme_state.theme = tile_theme_resolve(
        config.settings.getValue('panelTheme'),
        tile_theme_state.portal ? tile_theme_state.portal.get_string('color-scheme') : null,
        tile_theme_state.cinnamon ? tile_theme_state.cinnamon.get_string('name') : null
    );
    // An open panel or editor rebuilds itself: restyling in place would leave the
    // Cairo thumbnails and the painter in the old colors.
    if (tile_panel.actor)
        tile_panel_rebuild(config.app);
};
const tile_theme_init = (config) => {
    if (tile_theme_state.portal === null) {
        const source = tile_Gio.SettingsSchemaSource.get_default();
        if (source && source.lookup('org.x.apps.portal', true)) {
            // gjs: the object form must go through the constructor, Settings.new takes the schema id string only
            tile_theme_state.portal = new tile_Gio.Settings({ schema_id: 'org.x.apps.portal' });
            tile_theme_state.portalSig = tile_theme_state.portal.connect('changed::color-scheme', tile_theme_changed);
        }
        if (source && source.lookup('org.cinnamon.theme', true)) {
            tile_theme_state.cinnamon = new tile_Gio.Settings({ schema_id: 'org.cinnamon.theme' });
            tile_theme_state.cinnamonSig = tile_theme_state.cinnamon.connect('changed::name', tile_theme_changed);
        }
    }
    tile_theme_state.config = config;
    tile_theme_changed();
};
const tile_theme_shutdown = () => {
    if (tile_theme_state.portal && tile_theme_state.portalSig) {
        try {
            tile_theme_state.portal.disconnect(tile_theme_state.portalSig);
        } catch (e) {
            // signal was already gone
        }
        tile_theme_state.portal = null;
        tile_theme_state.portalSig = 0;
    }
    if (tile_theme_state.cinnamon && tile_theme_state.cinnamonSig) {
        try {
            tile_theme_state.cinnamon.disconnect(tile_theme_state.cinnamonSig);
        } catch (e) {
            // signal was already gone
        }
        tile_theme_state.cinnamon = null;
        tile_theme_state.cinnamonSig = 0;
    }
    tile_theme_state.config = null;
};
// "Gap between windows  − 8 px +" in the list view. Each click stores the value and,
// when automatic tiling is on for this workspace, retiles it shortly after (debounced,
// so fast repeated clicks tile once), so the new gap shows live.
const tile_panel_gap_row = (app) => {
    const row = new tile_St.BoxLayout({ style_class: 'gk-gap-row' });
    row.add(new tile_St.Label({ text: _("Gap between windows"), style_class: 'gk-gap-label' }), { expand: true, x_fill: true, y_fill: false, y_align: tile_St.Align.MIDDLE });
    const minus = new tile_St.Button({ label: '−', style_class: 'gk-gap-btn', track_hover: true });
    const value = new tile_St.Label({ style_class: 'gk-gap-value' });
    const plus = new tile_St.Button({ label: '+', style_class: 'gk-gap-btn', track_hover: true });
    const show = (gap) => {
        value.text = _("%d px").format(gap);
        minus.reactive = gap > 0;
        minus.opacity = gap > 0 ? 255 : 90;
        plus.reactive = gap < TILE_GAP_MAX;
        plus.opacity = gap < TILE_GAP_MAX ? 255 : 90;
    };
    const change = (delta) => {
        const gap = tile_gap_value(tile_gap(app) + delta);
        app.config.settings.setValue('windowGap', gap);
        show(gap);
        tile_auto_schedule_monitor(app, tile_focus_monitor_index(), 150);
    };
    minus.connect('clicked', () => change(-TILE_GAP_STEP));
    plus.connect('clicked', () => change(TILE_GAP_STEP));
    // "Reset sizes": only when borders were moved on this monitor + workspace (split-model);
    // clears them for every window count and retiles; the rebuild hides the button again.
    const monitorIndex = tile_focus_monitor_index();
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    if (tile_split_any(app, monitorIndex, wsIndex)) {
        const reset = new tile_St.Button({ label: _("Reset sizes"), style_class: 'gk-reset-btn', track_hover: true });
        reset.connect('clicked', () => {
            tile_split_reset(app, monitorIndex, wsIndex);
            if (tile_layout_for(app, monitorIndex, wsIndex).auto)
                tile_retile_monitor(app, monitorIndex, null);
            tile_panel_rebuild(app);
        });
        row.add(reset, { y_fill: false, y_align: tile_St.Align.MIDDLE });
    }
    row.add(minus, { y_fill: false, y_align: tile_St.Align.MIDDLE });
    row.add(value, { y_fill: false, y_align: tile_St.Align.MIDDLE });
    row.add(plus, { y_fill: false, y_align: tile_St.Align.MIDDLE });
    show(tile_gap(app));
    return row;
};
const tile_panel_rebuild = (app) => {
    if (!tile_panel.actor)
        return;
    const view = tile_panel.view;
    const draft = tile_panel.draft;
    tile_panel_close();
    tile_panel.view = view;
    tile_panel.draft = draft;
    tile_panel_open(app);
};
const tile_panel_open = (app) => {
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    const monitorIndex = tile_focus_monitor_index();
    const draft = tile_panel.view === 'editor' ? tile_panel.draft : null;
    const panel = new tile_St.BoxLayout({ vertical: true, style_class: tile_theme_panel_class(), reactive: true, can_focus: true });
    const header = new tile_St.BoxLayout({ style_class: 'gk-panel-header', reactive: true });
    let titleText = _("Presets — workspace %d · %s").format(wsIndex + 1, tile_monitors.labels[monitorIndex] || '');
    if (draft)
        titleText = draft.isNew ? _("Create preset") : _("Edit %s").format(draft.name);
    const title = new tile_St.Label({ text: titleText, style_class: 'gk-title' });
    header.add(title, { expand: true, x_fill: true, y_fill: false, y_align: tile_St.Align.MIDDLE });
    if (draft) {
        const backBtn = new tile_St.Button({ label: '← ' + _("Back"), style_class: 'gk-back', track_hover: true });
        backBtn.connect('clicked', () => tile_editor_back(app));
        header.add(backBtn);
    }
    else {
        // Automatic tiling state of this monitor and workspace (Super+Ctrl+A / Super+Ctrl+D),
        // shown and switchable here; turning it on tiles right away, like Super+Ctrl+A.
        const autoOn = tile_layout_for(app, monitorIndex, wsIndex).auto;
        const autoBtn = new tile_St.Button({
            label: autoOn ? _("Auto: on") : _("Auto: off"),
            style_class: 'gk-auto' + (autoOn ? ' gk-auto-on' : ''),
            track_hover: true,
        });
        autoBtn.connect('clicked', () => {
            if (tile_layout_for(app, monitorIndex, wsIndex).auto)
                tile_auto_deactivate(app);
            else
                tile_auto_activate(app);
            tile_panel_rebuild(app);
        });
        header.add(autoBtn, { y_fill: false, y_align: tile_St.Align.MIDDLE });
        // Theme toggle: one click switches between light and dark; "Follow system" is
        // selectable again in the settings dialog. The glyph shows the theme a click
        // switches TO (moon in light mode, like most desktop apps do).
        const themeShown = tile_theme_state.theme;
        const themeBtn = new tile_St.Button({
            label: themeShown === 'light' ? '☾' : '☀',
            style_class: 'gk-close gk-theme',
            track_hover: true,
        });
        new Tooltips.Tooltip(themeBtn, themeShown === 'light' ? _("Dark theme") : _("Light theme"));
        themeBtn.connect('clicked', () => {
            app.config.settings.setValue('panelTheme', tile_theme_toggle_target(tile_theme_state.theme));
            // Cinnamon's XletSettings.setValue only saves the settings file — the
            // IN bind callback does not fire on programmatic changes, so the panel
            // re-theme and rebuild happen here. The guard swallows stray clicks
            // that follow the rebuild, like the Back button does.
            tile_panel_guard();
            tile_theme_changed();
        });
        header.add(themeBtn);
        // ⚙ opens the extension's settings dialog on its first page; the same dialog
        // Cinnamon opens from the Extensions manager.
        const settingsBtn = new tile_St.Button({ label: '⚙', style_class: 'gk-close gk-settings', track_hover: true });
        settingsBtn.connect('clicked', () => {
            tile_panel_close();
            tile_Util.spawn(['xlet-settings', 'extension', UUID, '-t', '0']);
        });
        header.add(settingsBtn);
        const closeBtn = new tile_St.Button({ label: '✕', style_class: 'gk-close', track_hover: true });
        closeBtn.connect('clicked', () => tile_panel_close());
        header.add(closeBtn);
    }
    panel.add(header);
    // Drag the panel by hand: the WHOLE title bar is a handle (except the button).
    // Recipe from Cinnamon's dnd.js (_grabEvents/_ungrabEvents); it needs BOTH parts:
    //   Main.pushModal(panel)  → X delivers all events to Cinnamon, even over native windows
    //   device.grab(panel)     → Clutter routes them to the panel, not to the actor under the pointer
    // Either one alone loses motion/release as soon as the pointer leaves the panel.
    let drag = null;
    // Resize state (grip in the bottom right corner); set up further below, once the
    // stretching part (list rows or painter) exists. Declared here for the handlers.
    let resize = null;
    let onResizeMotion = () => { };
    let endResize = () => { };
    const endDrag = () => {
        if (!drag)
            return;
        drag.device.ungrab();
        try {
            utils_Main.popModal(panel);
        } catch (e) {
            // modal already popped (main.js pops it on actor destroy)
        }
        drag = null;
        tile_panel.dragging = false;
        const [px, py] = panel.get_position();
        tile_panel.saved = { x: Math.round(px), y: Math.round(py) };
        global.log('greenTile panel moved to ' + Math.round(px) + ',' + Math.round(py));
    };
    const onDragMotion = (a, event) => {
        if (resize) {
            onResizeMotion(event);
            return tile_Clutter.EVENT_STOP;
        }
        if (!drag)
            return tile_Clutter.EVENT_PROPAGATE;
        const [gx, gy] = event.get_coords();
        panel.set_position(Math.round(gx - drag.dx), Math.round(gy - drag.dy));
        return tile_Clutter.EVENT_STOP;
    };
    const onDragRelease = () => {
        if (resize) {
            endResize();
            return tile_Clutter.EVENT_STOP;
        }
        if (!drag)
            return tile_Clutter.EVENT_PROPAGATE;
        endDrag();
        return tile_Clutter.EVENT_STOP;
    };
    header.connect('button-press-event', (a, event) => {
        const src = event.get_source();
        if (src !== header && src !== title)
            return tile_Clutter.EVENT_PROPAGATE;
        const [gx, gy] = event.get_coords();
        const [px, py] = panel.get_position();
        if (isNaN(px) || isNaN(py))
            return tile_Clutter.EVENT_PROPAGATE;
        endDrag();
        if (!utils_Main.pushModal(panel))
            return tile_Clutter.EVENT_PROPAGATE;
        const device = event.get_device();
        device.grab(panel);
        tile_panel.dragging = true;
        drag = { dx: gx - px, dy: gy - py, device };
        return tile_Clutter.EVENT_STOP;
    });
    panel.connect('motion-event', onDragMotion);
    panel.connect('button-release-event', onDragRelease);
    panel.connect('destroy', () => {
        endDrag();
        endResize();
    });
    // Double-click guard: right after a switch between list and editor, mouse buttons
    // on the panel are swallowed in the capture phase, before any button, row or the
    // painter sees them (a double-click on Save would otherwise assign the list row
    // under the pointer; one on 🔧 would paint into the editor).
    panel.connect('captured-event', (a, event) => {
        const type = event.type();
        if ((type === tile_Clutter.EventType.BUTTON_PRESS || type === tile_Clutter.EventType.BUTTON_RELEASE)
            && GLib.get_monotonic_time() < tile_panel.guardUntil)
            return tile_Clutter.EVENT_STOP;
        return tile_Clutter.EVENT_PROPAGATE;
    });
    let rowsBox = null;
    let scroll = null;
    let editor = null;
    // Footer: the list's hint and, in both views, the resize grip in the corner.
    const footer = new tile_St.BoxLayout({ style_class: 'gk-footer' });
    const grip = new tile_St.Label({ text: '◢', style_class: 'gk-grip', reactive: true, track_hover: true });
    if (draft) {
        editor = tile_editor_body(app);
        panel.add(editor.actor);
    }
    else {
        const presets = tile_presets_read(app);
        const n = tile_panel_window_count();
        rowsBox = new tile_St.BoxLayout({ vertical: true, style_class: 'gk-rows' });
        if (presets.length === 0)
            rowsBox.add(new tile_St.Label({ text: _("No presets yet."), style_class: 'gk-muted' }));
        for (const preset of presets)
            rowsBox.add(tile_panel_row(app, preset, n));
        // vscrollbar starts as NEVER: with AUTOMATIC, Cinnamon's St reserves the bar's 21px
        // even when there is nothing to scroll (rows end too far from the right edge). The bar
        // is switched on in the allocation handler once the list exceeds LIST_MAX.
        scroll = new tile_St.ScrollView({
            style_class: 'gk-scroll',
            reactive: true,
            hscrollbar_policy: tile_St.PolicyType.NEVER,
            vscrollbar_policy: tile_St.PolicyType.NEVER,
        });
        scroll.add_actor(rowsBox);
        panel.add(scroll);
        panel.add(tile_panel_gap_row(app));
        const plus = new tile_St.Button({ label: '＋ ' + _("New preset"), style_class: 'gk-plus', x_fill: true, track_hover: true });
        plus.connect('clicked', () => tile_editor_open_new(app));
        panel.add(plus);
        const hint = new tile_St.Label({ text: _("Click a row to apply it to this workspace and tile right away"), style_class: 'gk-hint' });
        footer.add(hint, { expand: true, x_fill: true, y_fill: false, y_align: tile_St.Align.MIDDLE });
    }
    // expand: in the editor there is no hint before the grip, it must still sit right.
    footer.add(grip, { expand: true, x_fill: false, y_fill: false, x_align: tile_St.Align.END, y_align: tile_St.Align.END });
    panel.add(footer);
    utils_Main.layoutManager.addChrome(panel);
    tile_panel.actor = panel;
    // Monitors come and go (external display plugged in or out). A saved position
    // whose title bar is on no current monitor would open the panel off screen, so it
    // is dropped and the panel is centred again. Probe point: title bar at list width.
    const monitors = utils_Main.layoutManager.monitors;
    const monitorAt = (x, y) => monitors.find((m) => x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height) || null;
    const focusMonitor = () => {
        const focusWindow = getFocusApp();
        return (focusWindow && monitors[focusWindow.get_monitor()]) || monitors[utils_Main.layoutManager.primaryIndex] || monitors[0];
    };
    if (tile_panel.saved && !monitorAt(tile_panel.saved.x + 300, tile_panel.saved.y + 20)) {
        global.log('greenTile panel position ' + tile_panel.saved.x + ',' + tile_panel.saved.y + ' is on no monitor, centring again');
        tile_panel.saved = null;
    }
    // Keep the position across rebuilds (workspace switches, focus changes, view changes)
    tile_panel.positioned = tile_panel.saved != null;
    if (tile_panel.saved)
        panel.set_position(tile_panel.saved.x, tile_panel.saved.y);
    // Resize with the grip in the bottom right corner, same grab recipe as the title-bar
    // drag (pushModal + device.grab). Width = panel width, height = the part that
    // stretches (list: preset rows, editor: painter; the rules column stays fixed).
    // Stored per view in "panelSize", limited to the room on the panel's monitor.
    const sizeView = draft ? 'editor' : 'list';
    const stretch = draft ? editor.painter : scroll;
    const sizeMin = TILE_PANEL_MIN[sizeView];
    const storedSize = tile_panel_size_parse(app.config.settings.getValue('panelSize'))[sizeView];
    const panelMonitor = () => {
        const [px, py] = panel.get_position();
        return monitorAt(px + 300, py + 20) || focusMonitor();
    };
    // The list's scrollbar only when the rows do not fit (AUTOMATIC reserves its width
    // even when there is nothing to scroll, see below).
    const fitScroll = () => {
        if (!scroll)
            return;
        const [, natural] = rowsBox.get_preferred_height(-1);
        const policy = natural > scroll.get_height() + 1 ? tile_St.PolicyType.AUTOMATIC : tile_St.PolicyType.NEVER;
        if (scroll.vscrollbar_policy !== policy)
            scroll.vscrollbar_policy = policy;
    };
    if (storedSize) {
        const m = (tile_panel.saved && monitorAt(tile_panel.saved.x + 300, tile_panel.saved.y + 20)) || focusMonitor();
        panel.set_width(Math.max(Math.min(storedSize.w, m.width), sizeMin.w));
        stretch.set_height(Math.max(storedSize.h, sizeMin.h));
    }
    grip.connect('enter-event', () => global.set_cursor(imports.gi.Cinnamon.Cursor.RESIZE_BOTTOM_RIGHT));
    grip.connect('leave-event', () => {
        if (!resize)
            global.unset_cursor();
    });
    grip.connect('button-press-event', (a, event) => {
        if (event.get_button() !== 1)
            return tile_Clutter.EVENT_PROPAGATE;
        const [gx, gy] = event.get_coords();
        const [px, py] = panel.get_position();
        if (isNaN(px) || isNaN(py))
            return tile_Clutter.EVENT_PROPAGATE;
        endDrag();
        endResize();
        if (!utils_Main.pushModal(panel))
            return tile_Clutter.EVENT_PROPAGATE;
        const device = event.get_device();
        device.grab(panel);
        tile_panel.dragging = true;
        // From now on the user sets the list height: LIST_MAX must not cap it (it
        // measures the rows box, which the scroll view stretches to its own height).
        scrollCapped = true;
        const [pw, ph] = panel.get_size();
        const sh = stretch.get_height();
        const m = panelMonitor();
        resize = {
            device, gx, gy, w: pw, h: sh, last: null,
            max: { w: m.x + m.width - px, h: sh + (m.y + m.height - (py + ph)) },
        };
        global.set_cursor(imports.gi.Cinnamon.Cursor.RESIZE_BOTTOM_RIGHT);
        return tile_Clutter.EVENT_STOP;
    });
    onResizeMotion = (event) => {
        const [gx, gy] = event.get_coords();
        const s = tile_panel_size_clamp({ w: resize.w + gx - resize.gx, h: resize.h + gy - resize.gy }, sizeMin, resize.max);
        panel.set_width(s.w);
        stretch.set_height(s.h);
        fitScroll();
        resize.last = s;
    };
    endResize = () => {
        if (!resize)
            return;
        const r = resize;
        resize = null;
        r.device.ungrab();
        try {
            utils_Main.popModal(panel);
        }
        catch (e) {
            // modal already popped (main.js pops it on actor destroy)
        }
        global.unset_cursor();
        tile_panel.dragging = false;
        if (r.last) {
            app.config.settings.setValue('panelSize', tile_panel_size_set(app.config.settings.getValue('panelSize'), sizeView, r.last));
            global.log('greenTile panel ' + sizeView + ' resized to ' + r.last.w + 'x' + r.last.h);
        }
    };
    // LIST_MAX measured live: an assigned row is 60 px, a plain row 59 px, so five
    // rows ≈ 296 px fit without the scrollbar; the sixth row scrolls.
    const LIST_MAX = 320;
    // With a stored size the list height is the user's, not LIST_MAX.
    let scrollCapped = storedSize != null;
    let clamped = false;
    let fitted = storedSize == null;
    panel.connect('notify::allocation', () => {
        // Allocation notifications can still arrive after close (destroy);
        // without this guard the centring would run on a dying actor.
        if (tile_panel.actor !== panel)
            return;
        if (!fitted) {
            // A size stored on a bigger monitor (5K) can be taller than this one
            // (laptop): shrink the stretching part once, the position clamp follows.
            fitted = true;
            const box = panel.get_allocation_box();
            const excess = (box.y2 - box.y1) - panelMonitor().height;
            if (excess > 0)
                stretch.set_height(Math.max(stretch.get_height() - excess, sizeMin.h));
            fitScroll();
        }
        if (!tile_panel.positioned) {
            tile_panel.positioned = true;
            clamped = true;
            const monitor = focusMonitor();
            const box = panel.get_allocation_box();
            const width = box.x2 - box.x1;
            const height = box.y2 - box.y1;
            const cx = monitor.x + Math.max(monitor.width - width, 0) / 2;
            const cy = monitor.y + Math.max(monitor.height - height, 0) / 2.5;
            panel.set_position(Math.round(cx), Math.round(cy));
            tile_panel.saved = { x: Math.round(cx), y: Math.round(cy) };
        }
        if (!clamped && !tile_panel.dragging) {
            // Keep the whole panel inside the monitor its title bar is on: a panel dragged
            // near the right edge would stick out, and a smaller monitor after a display
            // change has the same effect. Both views are 600 px wide; probe at the centre.
            clamped = true;
            const box = panel.get_allocation_box();
            const width = box.x2 - box.x1;
            const height = box.y2 - box.y1;
            const [px, py] = panel.get_position();
            const monitor = monitorAt(px + 300, py + 20) || focusMonitor();
            const nx = Math.min(Math.max(px, monitor.x), monitor.x + Math.max(monitor.width - width, 0));
            const ny = Math.min(Math.max(py, monitor.y), monitor.y + Math.max(monitor.height - height, 0));
            if (nx !== px || ny !== py) {
                panel.set_position(Math.round(nx), Math.round(ny));
                tile_panel.saved = { x: Math.round(nx), y: Math.round(ny) };
                global.log('greenTile panel clamped to ' + Math.round(nx) + ',' + Math.round(ny));
            }
        }
        if (scroll && !scrollCapped) {
            const rb = rowsBox.get_allocation_box();
            if (rb.y2 - rb.y1 > LIST_MAX) {
                scrollCapped = true;
                scroll.vscrollbar_policy = tile_St.PolicyType.AUTOMATIC;
                scroll.set_height(LIST_MAX);
            }
        }
    });
    // The list follows the desktop: workspace and focus changes re-render it
    // (title, assignment, thumbnail window count). The editor is never rebuilt by
    // these signals, it would lose the draft.
    // Meta.WorkspaceManager emits "workspace-switched" (windowManager.js:435).
    // A rebuild during an active drag would kill the grab, so it is skipped then.
    const onDesktopChange = () => {
        if (tile_panel.view === 'editor')
            return;
        if (tile_panel.dragging)
            global.log('greenTile rebuild suppressed (drag)');
        else
            tile_panel_rebuild(app);
    };
    tile_panel.sig.push({ obj: global.workspace_manager, id: global.workspace_manager.connect('workspace-switched', onDesktopChange) });
    tile_panel.sig.push({ obj: global.display, id: global.display.connect('notify::focus-window', onDesktopChange) });
    // No monitors-changed handler here: on a display change enable() recreates the whole
    // App, which closes the panel; the saved-position check above covers the next open.
    panel.connect('key-press-event', (a, event) => {
        if (event.get_key_symbol() === tile_Clutter.KEY_Escape) {
            if (tile_panel.view === 'editor')
                tile_editor_back(app);
            else
                tile_panel_close();
            return tile_Clutter.EVENT_STOP;
        }
        return tile_Clutter.EVENT_PROPAGATE;
    });
    // The list has no modal (it must not block the desktop), so it never gets key
    // events itself. Escape is therefore grabbed as a hotkey while the list is open
    // (same way the classic grid binds its Escape); released in tile_panel_close.
    // Side effect: while the list is open, applications do not receive Escape.
    if (!draft) {
        utils_Main.keybindingManager.addHotKey('greenTile-panel-esc', 'Escape', () => tile_panel_close());
        tile_panel.escBound = true;
    }
    global.log('greenTile panel open' + (draft ? ' (editor)' : ''));
    if (editor) {
        // The name entry needs the keyboard; a chrome actor only gets key events while
        // Cinnamon holds a modal grab. The modal sits on the editor body, NOT on the panel:
        // popModal restores the key focus only for the topmost record, so the drag
        // (pushModal(panel)) and the painter stroke (pushModal(area)) must stay separate
        // records that hand the focus back to the entry. Destroying the panel pops it.
        if (utils_Main.pushModal(editor.actor))
            editor.entry.grab_key_focus();
        else
            global.log('greenTile editor: pushModal failed, the name entry gets no keyboard');
    }
    else
        panel.grab_key_focus();
};
const tile_panel_toggle = (app) => {
    if (tile_panel.actor)
        tile_panel_close();
    else
        tile_panel_open(app);
};
const getFocusApp = () => {
    return global.display.focus_window;
};
;// CONCATENATED MODULE: ../base/app.ts
class App {
    constructor(platform) {
        this.platform = platform;
        this.config = new Config(this);
    }
    destroy() {
        this.config.destroy();
    }
}
;// CONCATENATED MODULE: ./utils.ts
const utils_Meta = imports.gi.Meta;
const utils_Main_0 = imports.ui.main;
const reset_window = (metaWindow) => {
    metaWindow === null || metaWindow === void 0 ? void 0 : metaWindow.unmaximize(utils_Meta.MaximizeFlags.HORIZONTAL);
    metaWindow === null || metaWindow === void 0 ? void 0 : metaWindow.unmaximize(utils_Meta.MaximizeFlags.VERTICAL);
    metaWindow === null || metaWindow === void 0 ? void 0 : metaWindow.unmaximize(utils_Meta.MaximizeFlags.HORIZONTAL | utils_Meta.MaximizeFlags.VERTICAL);
};
const move_resize_window = (metaWindow, x, y, width, height) => {
    if (!metaWindow)
        return;
    metaWindow.move_resize_frame(true, x, y, width, height);
    metaWindow.move_frame(true, x, y);
};

;// CONCATENATED MODULE: ./extension.ts

    let monitorChangedSignal = null;
let app;
const platform = {
    move_resize_window: move_resize_window,
    reset_window: reset_window,
};
const init = () => {};
const enable = () => {
    app = new App(platform);
        monitorChangedSignal = Main.layoutManager.connect('monitors-changed', () => {
            tile_settle_pending = true;
            app.destroy();
            app = new App(platform);
        });
};
const disable = () => {
        // greenTile fix: gTile 2.2.1 left this disconnect commented out. Every
        // disable/enable cycle then kept a handler bound to the OLD module, and each
        // monitor change resurrected a complete old App (hotkeys and tiling
        // observers included) per stale handler: duplicate retiles, zombie bindings.
        if (monitorChangedSignal) {
            Main.layoutManager.disconnect(monitorChangedSignal);
            monitorChangedSignal = null;
        }
    app.destroy();
};

gtile = __webpack_exports__;
/******/ })()
;
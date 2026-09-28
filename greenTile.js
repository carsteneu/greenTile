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

;// CONCATENATED MODULE: ../base/ui/GridSettingsButton.ts
const St = imports.gi.St;
class GridSettingsButton {
    constructor(app, settings, text, cols, rows) {
        this._onButtonPress = () => {
            this.settings.SetGridConfig(this.cols, this.rows);
            this.app.RefreshGrid();
            return false;
        };
        this.app = app;
        this.settings = settings;
        this.cols = cols;
        this.rows = rows;
        this.text = text;
        this.actor = new St.Button({
            style_class: 'settings-button',
            reactive: true,
            can_focus: true,
            track_hover: true
        });
        this.label = new St.Label({
            style_class: 'settings-label',
            reactive: true, can_focus: true,
            track_hover: true,
            text: this.text
        });
        this.actor.add_actor(this.label);
        this.actor.connect('button-press-event', this._onButtonPress);
    }
}

;// CONCATENATED MODULE: ../base/config.ts

const Settings = imports.ui.settings;
const Main = imports.ui.main;
class Config {
    constructor(app) {
        this.gridSettingsButton = [];
        this.EnableHotkey = () => {
            this.DisableHotkey();
            Main.keybindingManager.addHotKey('greenTile', this.hotkey, this.app.ToggleUI);
            Main.keybindingManager.addHotKey('greenTile-auto6', this.autotile6Hotkey, () => tile_app_columns(this.app, 6));
            Main.keybindingManager.addHotKey('greenTile-auto3', this.autotile3Hotkey, () => tile_app_columns(this.app, 3));
            Main.keybindingManager.addHotKey('greenTile-autoN', this.autotileAutoHotkey, () => tile_auto_activate(this.app));
            Main.keybindingManager.addHotKey('greenTile-autoOff', this.autotileOffHotkey, () => tile_auto_deactivate(this.app));
            Main.keybindingManager.addHotKey('greenTile-preset', this.presetHotkey, () => tile_panel_toggle(this.app));
        };
        this.DisableHotkey = () => {
            Main.keybindingManager.removeHotKey('greenTile');
            Main.keybindingManager.removeHotKey('greenTile-auto6');
            Main.keybindingManager.removeHotKey('greenTile-auto3');
            Main.keybindingManager.removeHotKey('greenTile-autoN');
            Main.keybindingManager.removeHotKey('greenTile-autoOff');
            Main.keybindingManager.removeHotKey('greenTile-preset');
        };
        this.updateSettings = () => {
            for (const grid of this.app.Grids) {
                grid.UpdateSettingsButtons();
            }
        };
        this.initGridSettings = () => {
            let basestr = 'grid';
            for (let i = 1; i <= 4; i++) {
                let sgbx = basestr + i + 'x';
                let sgby = basestr + i + 'y';
                let nameOverride = basestr + i + "NameOverride";
                let gbx = this.settings.getValue(sgbx);
                let gby = this.settings.getValue(sgby);
                if (gbx.length == 0 || gby.length == 0)
                    continue;
                let nameOverrideVal = this.settings.getValue(nameOverride);
                this.gridSettingsButton.push(new GridSettingsButton(this.app, this, nameOverrideVal || (gbx.length + 'x' + gby.length), gbx, gby));
            }
        };
        this.updateGridSettings = () => {
            this.gridSettingsButton = [];
            this.initGridSettings();
            for (const grid of this.app.Grids) {
                grid.RebuildGridSettingsButtons();
            }
        };
        this.UpdateGridTableSize = () => {
            for (const grid of this.app.Grids) {
                const [width, height] = grid.GetTableSize();
                grid.AdjustTableSize(width, height);
            }
        };
        this.destroy = () => {
            this.DisableHotkey();
            tile_auto_disconnect_all();
            tile_panel_close();
        };
        this.app = app;
        this.settings = new Settings.ExtensionSettings(this, 'greenTile@carsteneu');
        this.settings.bindProperty(Settings.BindingDirection.IN, 'hotkey', 'hotkey', this.EnableHotkey, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'autotile6hotkey', 'autotile6Hotkey', this.EnableHotkey, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'autotile3hotkey', 'autotile3Hotkey', this.EnableHotkey, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'autotileautohotkey', 'autotileAutoHotkey', this.EnableHotkey, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'autotileoffhotkey', 'autotileOffHotkey', this.EnableHotkey, null);
        this.settings.bindProperty(Settings.BindingDirection.IN, 'presetHotkey', 'presetHotkey', this.EnableHotkey, null);
        this.settings.bindProperty(Settings.BindingDirection.OUT, 'lastGridRows', 'nbCols');
        this.settings.bindProperty(Settings.BindingDirection.OUT, 'lastGridCols', 'nbRows');
        if (this.nbCols == null || !Array.isArray(this.nbCols))
            this.nbCols = this.InitialGridItems();
        if (this.nbRows == null || !Array.isArray(this.nbRows))
            this.nbRows = this.InitialGridItems();
        this.settings.bindProperty(Settings.BindingDirection.BIDIRECTIONAL, 'animation', 'animation', this.updateSettings, null);
        this.settings.bindProperty(Settings.BindingDirection.BIDIRECTIONAL, 'autoclose', 'autoclose', this.updateSettings, null);
        this.settings.bindProperty(Settings.BindingDirection.BIDIRECTIONAL, 'aspect-ratio', 'aspectRatio', this.UpdateGridTableSize, null);
        this.settings.bindProperty(Settings.BindingDirection.BIDIRECTIONAL, 'useMonitorCenter', 'useMonitorCenter', () => this.app.OnCenteredToWindowChanged(), null);
        this.settings.bindProperty(Settings.BindingDirection.BIDIRECTIONAL, 'showGridOnAllMonitors', 'showGridOnAllMonitors', () => this.app.ReInitialize(), null);
        this.settings.bindProperty(Settings.BindingDirection.BIDIRECTIONAL, 'select-using-keyboard', 'selectUsingKeyboard', this.updateSettings, null);
        let basestr = 'grid';
        this.initGridSettings();
        for (let i = 1; i <= 4; i++) {
            let sgbx = basestr + i + 'x';
            let sgby = basestr + i + 'y';
            let nameOverride = basestr + i + "NameOverride";
            this.settings.bindProperty(Settings.BindingDirection.IN, sgbx, sgbx, this.updateGridSettings, null);
            this.settings.bindProperty(Settings.BindingDirection.IN, sgby, sgby, this.updateGridSettings, null);
            this.settings.bindProperty(Settings.BindingDirection.IN, nameOverride, nameOverride, this.updateGridSettings, null);
        }
        this.EnableHotkey();
        tile_monitors_refresh(app, () => {
            tile_layouts_migrate_once(app);
            tile_auto_connect_all(app);
            if (tile_settle_pending) {
                tile_settle_pending = false;
                tile_settle_start(app);
            }
        });
    }
    get AnimationTime() {
        return this.animation ? 0.3 : 0.1;
    }
    SetGridConfig(columns, rows) {
        this.nbRows = rows;
        this.nbCols = columns;
    }
    InitialGridItems() {
        return [
            { span: 1 },
            { span: 1 },
            { span: 1 },
            { span: 1 }
        ];
    }
}

;// CONCATENATED MODULE: ../base/utils.ts
const { Object: utils_Object } = imports.gi.GObject;
const Gettext = imports.gettext;
const GLib = imports.gi.GLib;
const Signals = imports.signals;
const Meta = imports.gi.Meta;
const Panel = imports.ui.panel;
const utils_Main = imports.ui.main;
const UUID = 'greenTile@carsteneu';
const isFinalized = function (obj) {
    return obj && utils_Object.prototype.toString.call(obj).indexOf('FINALIZED') > -1;
};
Gettext.bindtextdomain(UUID, GLib.get_home_dir() + '/.local/share/locale');
function _(str) {
    let customTranslation = Gettext.dgettext(UUID, str);
    if (customTranslation != str) {
        return customTranslation;
    }
    return Gettext.gettext(str);
}
function objHasKey(obj, key) {
    return utils_Object.prototype.hasOwnProperty.call(obj, key);
}
function addSignals(constructor) {
    Signals.addSignalMethods(constructor.prototype);
    return class extends constructor {
    };
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
const tile_place = (app, metaWindow, x, y, width, height) => {
    app.platform.reset_window(metaWindow);
    const oldRect = metaWindow.get_frame_rect();
    const actor = metaWindow.get_compositor_private();
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
const tile_place_cell = (app, metaWindow, x, y, width, height, area) => {
    const [cx, cy, cw, ch] = tile_gap_cell([x, y, width, height], area, tile_gap(app));
    tile_place(app, metaWindow, cx, cy, cw, ch);
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
    let ordered = tile_sort_reading_order([focusWindow].concat(windows), false).slice(0, cols);
    for (let index = 0; index < ordered.length; index++) {
        tile_place_cell(app, ordered[index], screenX + index * colWidth, screenY, colWidth, screenHeight, [screenX, screenY, screenWidth, screenHeight]);
    }
};
// Sort direction must match the target layout: column-major for the low-res
// column-stack, row-quantized for uniform grids — otherwise re-tiles shuffle
// windows between cells and manual arrangements do not survive.
const tile_sort_reading_order = (windows, columnMajor) => {
    return windows.slice().sort((a, b) => {
        const ra = a.get_frame_rect();
        const rb = b.get_frame_rect();
        if (columnMajor) {
            if (ra.x !== rb.x)
                return ra.x - rb.x;
            return ra.y - rb.y;
        }
        const rowA = Math.round(ra.y / (ra.height || 1));
        const rowB = Math.round(rb.y / (rb.height || 1));
        if (rowA !== rowB)
            return rowA - rowB;
        return ra.x - rb.x;
    });
};
const tile_app_auto = (app, monitorIndex, focusWindow) => {
    const monitor = utils_Main.layoutManager.monitors[monitorIndex];
    if (!monitor)
        return;
    let [screenX, screenY, screenWidth, screenHeight] = getUsableScreenArea(monitor);
    let windows = tile_collect_windows(monitor, focusWindow);
    tile_debug_count(monitor, focusWindow, windows);
    const focused = focusWindow && !focusWindow.minimized && focusWindow.get_monitor() === monitorIndex;
    let n = windows.length + (focused ? 1 : 0);
    if (n < 2)
        return;
    // New windows (opened while automatic tiling is on) append at the end — their spawn
    // position is meaningless for the reading order. Cleared after each tiling.
    let pending = tile_auto.pending.get(monitorIndex) || new Set();
    tile_auto.pending.set(monitorIndex, new Set());
    let fresh = windows.filter((w) => pending.has(w.get_stable_sequence()));
    let settled = windows.filter((w) => !pending.has(w.get_stable_sequence()));
    // Below 2100px monitor width, 4+ uniform columns get too narrow: 3 fixed columns
    // with balanced stacks instead (4=1·1·2, 5=1·2·2, 6=2·2·2, 8=2·3·3) — full-height
    // singles stay left, extra windows stack on the right columns. Screen always fills.
    let ordered;
    if (monitor.width < 2100 && n > 3) {
        ordered = tile_sort_reading_order((focused ? [focusWindow] : []).concat(settled), true)
            .concat(tile_sort_reading_order(fresh, true));
        let base = Math.floor(n / 3);
        let rem = n % 3;
        let stacks = [base, base + (rem > 1 ? 1 : 0), base + (rem > 0 ? 1 : 0)];
        let colWidth = screenWidth / 3;
        let idx = 0;
        for (let c = 0; c < 3; c++) {
            let cellHeight = screenHeight / stacks[c];
            for (let r = 0; r < stacks[c]; r++) {
                tile_place_cell(app, ordered[idx], screenX + c * colWidth, screenY + r * cellHeight, colWidth, cellHeight, [screenX, screenY, screenWidth, screenHeight]);
                idx++;
            }
        }
        return;
    }
    // High-res: single row with one column per window up to 6, then wrap into
    // balanced rows (8=4×2, 12=6×2). Single window => no-op (n < 2 guard above).
    let cols;
    let rows;
    if (n <= 6) {
        cols = n;
        rows = 1;
    } else {
        rows = Math.ceil(n / 6);
        cols = Math.ceil(n / rows);
    }
    ordered = tile_sort_reading_order((focused ? [focusWindow] : []).concat(settled), false)
        .concat(tile_sort_reading_order(fresh, false));
    let cellWidth = screenWidth / cols;
    let cellHeight = screenHeight / rows;
    for (let index = 0; index < ordered.length; index++) {
        let col = index % cols;
        let row = Math.floor(index / cols);
        tile_place_cell(app, ordered[index], screenX + col * cellWidth, screenY + row * cellHeight, cellWidth, cellHeight, [screenX, screenY, screenWidth, screenHeight]);
    }
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
    tile_auto.pending.clear();
    tile_retile_monitor(app, monitorIndex, focusWindow);
};
const tile_auto_deactivate = (app) => {
    const monitorIndex = tile_focus_monitor_index();
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    tile_layout_set(app, monitorIndex, wsIndex, { auto: false });
    tile_auto.pending.clear();
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
const tile_auto_on_grab_begin = (app, w, op) => {
    if (op !== Meta.GrabOp.MOVING && op !== Meta.GrabOp.KEYBOARD_MOVING)
        return;
    if (!tile_auto_window_ok(w))
        return;
    tile_auto.grabMonitor.set(w.get_stable_sequence(), w.get_monitor());
};
const tile_auto_on_grab_end = (app, w, op) => {
    if (!tile_auto_window_ok(w))
        return;
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
    try {
        w.disconnect(mid);
        w.disconnect(uid);
    }
    catch (e) {
        // window already destroyed — wrapper invalid, nothing to clean
    }
    tile_auto.lastMonitor.delete(seq);
    tile_auto.grabMonitor.delete(seq);
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
const tile_monitors = { keys: [], connectors: [], labels: [], ready: false };
let tile_monitors_fallback_logged = false;
let tile_muffin_settings = null;
const tile_monitors_refresh = (app, onReady) => {
    tile_monitors.ready = false;
    tile_monitors.keys = [];
    tile_monitors.connectors = [];
    tile_monitors.labels = [];
    tile_Gio.DBus.session.call('org.cinnamon.Muffin.DisplayConfig', '/org/cinnamon/Muffin/DisplayConfig',
        'org.cinnamon.Muffin.DisplayConfig', 'GetCurrentState', null, null,
        tile_Gio.DBusCallFlags.NONE, 3000, null, (source, result) => {
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
            tile_monitors.connectors = connectors;
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
// k columns of equal width, column i gets stacks[i] equal-height cells;
// surplus windows extend the last stack, short layouts leave cells empty.
const tile_place_stacks = (app, ordered, stacks, screenX, screenY, screenWidth, screenHeight) => {
    const last = stacks.slice();
    const surplus = ordered.length - stacks.reduce((a, b) => a + b, 0);
    if (surplus > 0)
        last[last.length - 1] += surplus;
    const colWidth = screenWidth / stacks.length;
    let idx = 0;
    for (let c = 0; c < stacks.length; c++) {
        const cellHeight = screenHeight / last[c];
        for (let r = 0; r < last[c]; r++) {
            tile_place_cell(app, ordered[idx], screenX + c * colWidth, screenY + r * cellHeight, colWidth, cellHeight, [screenX, screenY, screenWidth, screenHeight]);
            idx++;
        }
    }
};
const tile_preset_retile = (app, monitorIndex, focusWindow) => {
    const monitor = utils_Main.layoutManager.monitors[monitorIndex];
    if (!monitor)
        return;
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    const preset = tile_layout_for(app, monitorIndex, wsIndex).preset;
    if (!preset)
        return;
    const [screenX, screenY, screenWidth, screenHeight] = getUsableScreenArea(monitor);
    const windows = tile_collect_windows(monitor, focusWindow);
    const focused = focusWindow && !focusWindow.minimized && focusWindow.get_monitor() === monitorIndex;
    const n = windows.length + (focused ? 1 : 0);
    if (n < 2)
        return;
    const rule = tile_rules_pick(preset.rules, n);
    if (!rule || !rule.stacks || rule.stacks.length === 0)
        return;
    const ordered = tile_sort_reading_order((focused ? [focusWindow] : []).concat(windows), true);
    tile_place_stacks(app, ordered, rule.stacks, screenX, screenY, screenWidth, screenHeight);
    global.log('greenTile preset "' + preset.name + '" applied ws' + (wsIndex + 1) + ' mon=' + (tile_monitors.keys[monitorIndex] || '?') + ' n=' + n + ' stacks=[' + rule.stacks.join(',') + ']');
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
// { "<monitor key>": { "<workspace number from 1 | *>": { preset?: id, auto?: boolean } } }.
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
const tile_retile_monitor = (app, monitorIndex, focusWindow) => {
    if (!tile_monitors.ready || !utils_Main.layoutManager.monitors[monitorIndex])
        return;
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    const layout = tile_layout_for(app, monitorIndex, wsIndex);
    if (layout.preset)
        tile_preset_retile(app, monitorIndex, focusWindow);
    else if (layout.auto)
        tile_app_auto(app, monitorIndex, focusWindow);
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
// Mockup: list thumbnails 54x34, gap 2px, radius 2px, fill #3d4457;
// editor rule thumbnails 34x18, gap 2px, 1px between stacked cells, radius 1px.
const tile_panel_thumb = (stacks, opts = {}) => {
    const { width = 54, height = 34, gap = 2, vgap = 2, radius = 2, color = [61, 68, 87] } = opts;
    const area = new tile_St.DrawingArea({ width, height });
    area.connect('repaint', (a) => {
        const cr = a.get_context();
        const [W, H] = a.get_surface_size();
        cr.setSourceRGB(color[0] / 255, color[1] / 255, color[2] / 255);
        const cw = (W - gap * (stacks.length - 1)) / stacks.length;
        for (let c = 0; c < stacks.length; c++) {
            const ch = (H - vgap * (stacks[c] - 1)) / stacks[c];
            for (let r = 0; r < stacks[c]; r++)
                tile_panel_round_rect(cr, c * (cw + gap), r * (ch + vgap), cw, ch, radius);
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
    return tile_collect_windows(monitor, focusWindow).length + 1;
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
    const rep = tile_rules_pick(preset.rules, n) || preset.rules.reduce((best, rule) => (!best || rule.min < best.min ? rule : best), null);
    box.add(tile_panel_thumb(rep && rep.stacks.length ? rep.stacks : [1]), tile_panel_middle());
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
        tile_panel_close();
        tile_retile_monitor(app, monitorIndex, focusWindow);
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
    box.add(tile_panel_thumb(rule.stacks, { width: 34, height: 18, gap: 2, vgap: 1, radius: 1, color: active ? tile_editor_accent : [61, 68, 87] }), tile_panel_middle());
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
                cr.setSourceRGB(42 / 255, 46 / 255, 57 / 255);
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
    return { actor: body, entry };
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
    const draft = tile_panel.view === 'editor' ? tile_panel.draft : null;
    const panel = new tile_St.BoxLayout({ vertical: true, style_class: 'gk-panel' + (draft ? ' gk-panel-editor' : ''), reactive: true, can_focus: true });
    const header = new tile_St.BoxLayout({ style_class: 'gk-panel-header', reactive: true });
    let titleText = _("Presets — workspace %d").format(wsIndex + 1);
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
          const monitorIndex = tile_focus_monitor_index();
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
        if (!drag)
            return tile_Clutter.EVENT_PROPAGATE;
        const [gx, gy] = event.get_coords();
        panel.set_position(Math.round(gx - drag.dx), Math.round(gy - drag.dy));
        return tile_Clutter.EVENT_STOP;
    };
    const onDragRelease = () => {
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
    panel.connect('destroy', () => endDrag());
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
        panel.add(new tile_St.Label({ text: _("Click a row to apply it to this workspace and tile right away"), style_class: 'gk-hint' }));
    }
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
    if (tile_panel.saved && !monitorAt(tile_panel.saved.x + 225, tile_panel.saved.y + 20)) {
        global.log('greenTile panel position ' + tile_panel.saved.x + ',' + tile_panel.saved.y + ' is on no monitor, centring again');
        tile_panel.saved = null;
    }
    // Keep the position across rebuilds (workspace switches, focus changes, view changes)
    tile_panel.positioned = tile_panel.saved != null;
    if (tile_panel.saved)
        panel.set_position(tile_panel.saved.x, tile_panel.saved.y);
    const LIST_MAX = 320;
    let scrollCapped = false;
    let clamped = false;
    panel.connect('notify::allocation', () => {
        // Allocation notifications can still arrive after close (destroy);
        // without this guard the centring would run on a dying actor.
        if (tile_panel.actor !== panel)
            return;
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
            // Keep the whole panel inside the monitor its title bar is on: the editor is
            // 600px wide, the list 450px, so a list dragged near the right edge would
            // stick out after the view switch; a smaller monitor after a display change
            // has the same effect.
            clamped = true;
            const box = panel.get_allocation_box();
            const width = box.x2 - box.x1;
            const height = box.y2 - box.y1;
            const [px, py] = panel.get_position();
            const monitor = monitorAt(px + 225, py + 20) || focusMonitor();
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
const getMonitorKey = (monitor) => {
    return monitor.x + ':' + monitor.width + ':' + monitor.y + ':' + monitor.height;
};
const getAdjacentMonitor = (monitor, side) => {
    const monitors = utils_Main.layoutManager.monitors;
    const contactsOnSide = [];
    for (const mon of monitors) {
        if (isEqual(mon, monitor))
            continue;
        const verticalContact = rangeToContactSurface([mon.y, mon.y + mon.height], [monitor.y, monitor.y + monitor.height]);
        const horizontalContact = rangeToContactSurface([mon.x, mon.x + mon.width], [monitor.x, monitor.x + monitor.width]);
        switch (side) {
            case Meta.Side.LEFT:
                if (monitor.x == mon.x + mon.width)
                    contactsOnSide.push([mon, verticalContact]);
                break;
            case Meta.Side.RIGHT:
                if (monitor.x + monitor.width == mon.x)
                    contactsOnSide.push([mon, verticalContact]);
                break;
            case Meta.Side.TOP:
                if (monitor.y == mon.y + mon.height)
                    contactsOnSide.push([mon, horizontalContact]);
                break;
            case Meta.Side.BOTTOM:
                if (monitor.y + monitor.height == mon.y)
                    contactsOnSide.push([mon, horizontalContact]);
                break;
        }
    }
    if (contactsOnSide.length == 0)
        return monitor;
    return contactsOnSide.reduce((max, current) => (current[1] > max[1] ? current : max), contactsOnSide[0])[0];
};
function isEqual(monitor1, monitor2) {
    return (monitor1.x == monitor2.x &&
        monitor1.y == monitor2.y &&
        monitor1.height == monitor2.height &&
        monitor1.width == monitor2.width);
}
const getFocusApp = () => {
    return global.display.focus_window;
};
const isPrimaryMonitor = (monitor) => {
    return utils_Main.layoutManager.primaryMonitor === monitor;
};
function intersection(a, b) {
    let min = (a[0] < b[0] ? a : b);
    let max = (min == a ? b : a);
    if (min[1] < max[0])
        return null;
    return [max[0], (min[1] < max[1] ? min[1] : max[1])];
}
function rangeToContactSurface(a, b) {
    const range = intersection(a, b);
    return range ? range[1] - range[0] : 0;
}
const GetMonitorAspectRatio = (monitor) => {
    const aspectRatio = Math.max(monitor.width, monitor.height) / Math.min(monitor.width, monitor.height);
    return {
        ratio: aspectRatio,
        widthIsLonger: monitor.width > monitor.height
    };
};
const GetMonitorCenter = (monitor) => {
    return [monitor.x + monitor.width / 2, monitor.y + monitor.height / 2];
};

;// CONCATENATED MODULE: ../base/constants.ts

const SETTINGS_AUTO_CLOSE = 'autoclose';
const SETTINGS_ANIMATION = 'animation';
const TOOLTIPS = {
    [SETTINGS_AUTO_CLOSE]: _("Auto close"),
    [SETTINGS_ANIMATION]: _("Animations"),
    'action-main-list': _("Auto tile main and list"),
    'action-two-list': _("Auto tile two lists")
};
const KEYCONTROL = {
    'greenTile-k-left': 'Left',
    'greenTile-k-right': 'Right',
    'greenTile-k-up': 'Up',
    'greenTile-k-down': 'Down',
    'greenTile-k-left-meta': '<Shift>Left',
    'greenTile-k-right-meta': '<Shift>Right',
    'greenTile-k-up-meta': '<Shift>Up',
    'greenTile-k-down-meta': '<Shift>Down',
    'greenTile-k-left-monitor-move': '<Alt>Left',
    'greenTile-k-right-monitor-move': '<Alt>Right',
    'greenTile-k-up-monitor-move': '<Alt>Up',
    'greenTile-k-down-monitor-move': '<Alt>Down',
    'greenTile-k-first-grid': '1',
    'greenTile-k-second-grid': '2',
    'greenTile-k-third-grid': '3',
    'greenTile-k-fourth-grid': '4',
};

;// CONCATENATED MODULE: ../base/ui/ActionButton.ts
var __decorate = (undefined && undefined.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};


const Tooltips = imports.ui.tooltips;
const ActionButton_St = imports.gi.St;
let ActionButton = class ActionButton {
    constructor(classname, icon) {
        this._onButtonPress = () => {
            this.emit('button-press-event');
            return false;
        };
        this.actor = new ActionButton_St.Button({
            style_class: "settings-button",
            reactive: true,
            can_focus: true,
            track_hover: true,
            child: new ActionButton_St.Icon({
                reactive: true,
                icon_name: icon,
                icon_size: 36,
                icon_type: ActionButton_St.IconType.SYMBOLIC,
                can_focus: true,
                track_hover: true
            })
        });
        this.actor.connect('button-press-event', this._onButtonPress);
        if (TOOLTIPS[classname]) {
            this._tooltip = new Tooltips.Tooltip(this.actor, TOOLTIPS[classname]);
        }
    }
};
ActionButton = __decorate([
    addSignals
], ActionButton);

;

;// CONCATENATED MODULE: ../base/ui/AutoTileMainAndList.ts
var AutoTileMainAndList_decorate = (undefined && undefined.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};


let AutoTileMainAndList = class AutoTileMainAndList extends ActionButton {
    constructor(app) {
        super('action-main-list', "auto_tile_0-symbolic");
        this._onButtonPress = () => {
            tile_app_columns(this.app, 6);
            this.emit('resize-done');
            return false;
        };
        this.app = app;
        this.classname = 'action-main-list';
        this.connect('button-press-event', this._onButtonPress);
    }
};
AutoTileMainAndList = AutoTileMainAndList_decorate([
    addSignals
], AutoTileMainAndList);

;

;// CONCATENATED MODULE: ../base/ui/AutoTileTwoList.ts
var AutoTileTwoList_decorate = (undefined && undefined.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};


let AutoTileTwoList = class AutoTileTwoList extends ActionButton {
    constructor(app) {
        super('action-two-list', "auto_tile_1-symbolic");
        this._onButtonPress = () => {
            tile_app_columns(this.app, 3);
            this.emit('resize-done');
            return false;
        };
        this.app = app;
        this.classname = 'action-two-list';
        this.connect('button-press-event', this._onButtonPress);
    }
};
AutoTileTwoList = AutoTileTwoList_decorate([
    addSignals
], AutoTileTwoList);

;

;// CONCATENATED MODULE: ../base/ui/GridElement.ts

const GridElement_Main = imports.ui.main;
const GridElement_St = imports.gi.St;
class GridElement {
    constructor(app, monitor, grid, width, height, coordx, coordy, delegate, numCols) {
        this._onButtonPress = (final) => {
            this.delegate._onButtonPress(this, final);
            return false;
        };
        this._onHoverChanged = () => {
            if (!this.actor || isFinalized(this.actor))
                return;
            this.delegate._onHoverChanged(this);
            return false;
        };
        this._activate = () => {
            if (!this.actor || isFinalized(this.actor))
                return;
            this.actor.add_style_pseudo_class('activate');
        };
        this._deactivate = () => {
            if (!this.actor || isFinalized(this.actor))
                return;
            this.actor.remove_style_pseudo_class('activate');
        };
        this._clean = () => {
            GridElement_Main.uiGroup.remove_actor(this.app.area);
        };
        this._destroy = () => {
            this.monitor = null;
            this.coordx = null;
            this.coordy = null;
            this.width = null;
            this.height = null;
            this.active = null;
        };
        this.app = app;
        this.grid = grid;
        this.actor = new GridElement_St.Button({
            style_class: 'table-element',
            width: width,
            height: height,
            reactive: true,
            can_focus: true,
            track_hover: true,
            x_expand: false,
            y_expand: false,
            y_fill: false,
            x_fill: false,
        });
        this.monitor = monitor;
        this.coordx = coordx;
        this.coordy = coordy;
        this.width = width;
        this.height = height;
        this.delegate = delegate;
        this.actor.connect('button-press-event', () => this._onButtonPress(false));
        this.actor.connect('notify::hover', this._onHoverChanged);
        this.active = false;

        // Add label
        if (this.app.config.selectUsingKeyboard) {
            const labelIndex = coordy * numCols + coordx;
            let labelText;
            if (labelIndex < 26) {
                labelText = String.fromCharCode('a'.charCodeAt(0) + labelIndex);
            } else {
                labelText = String.fromCharCode('A'.charCodeAt(0) + labelIndex - 26);
            }
            const label = new GridElement_St.Label({
                style_class: 'tile-label',
                text: labelText,
                x_align: St.Align.MIDDLE,
                y_align: St.Align.MIDDLE
            });
            this.actor.add_actor(label);
        }
    }
}

;// CONCATENATED MODULE: ../base/ui/GridElementDelegate.ts
var GridElementDelegate_decorate = (undefined && undefined.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

const Tweener = imports.ui.tweener;
let GridElementDelegate = class GridElementDelegate {
    constructor(app) {
        this.activated = false;
        this.first = null;
        this.last = null;
        this.currentElement = null;
        this.activatedActors = null;
        this._allSelected = () => {
            var _a;
            return ((_a = this.activatedActors) === null || _a === void 0 ? void 0 : _a.length) === (this.settings.nbCols.length * this.settings.nbRows.length);
        };
        this._resizeDone = () => {
            this.emit('resize-done');
        };
        this.reset = () => {
            this._resetGrid();
            this.activated = false;
            this.first = null;
            this.last = null;
            this.currentElement = null;
        };
        this._resetGrid = () => {
            this._hideArea();
            if (this.currentElement) {
                this.currentElement._deactivate();
            }
            if (this.activatedActors != null) {
                for (let index = 0; index < this.activatedActors.length; index++) {
                    this.activatedActors[index]._deactivate();
                }
            }
            this.activatedActors = [];
        };
        this._getVarFromGridElement = (fromGridElement, toGridElement) => {
            let maxX = fromGridElement.coordx >= toGridElement.coordx ? fromGridElement.coordx : toGridElement.coordx;
            let minX = fromGridElement.coordx <= toGridElement.coordx ? fromGridElement.coordx : toGridElement.coordx;
            let maxY = fromGridElement.coordy >= toGridElement.coordy ? fromGridElement.coordy : toGridElement.coordy;
            let minY = fromGridElement.coordy <= toGridElement.coordy ? fromGridElement.coordy : toGridElement.coordy;
            return [minX, maxX, minY, maxY];
        };
        this.refreshGrid = (fromGridElement, toGridElement) => {
            var _a;
            this._resetGrid();
            let minX, maxX, minY, maxY;
            [minX, maxX, minY, maxY] = this._getVarFromGridElement(fromGridElement, toGridElement);
            let grid = fromGridElement.grid;
            for (let r = minY; r <= maxY; r++) {
                for (let c = minX; c <= maxX; c++) {
                    let element = grid === null || grid === void 0 ? void 0 : grid.elements[r][c];
                    element._activate();
                    (_a = this.activatedActors) === null || _a === void 0 ? void 0 : _a.push(element);
                }
            }
            this._displayArea(fromGridElement, toGridElement);
        };
        this._computeAreaPositionSize = (fromGridElement, toGridElement) => {
            let minX, maxX, minY, maxY;
            [minX, maxX, minY, maxY] = this._getVarFromGridElement(fromGridElement, toGridElement);
            let nbRows = this.settings.nbRows;
            let nbCols = this.settings.nbCols;
            let monitor = fromGridElement.monitor;
            let [screenX, screenY, screenWidth, screenHeight] = getUsableScreenArea(monitor);
            const widthUnit = screenWidth / nbCols.map(r => r.span).reduce((p, c) => p += c);
            const heightUnit = screenHeight / nbRows.map(r => r.span).reduce((p, c) => p += c);
            let areaWidth = 0;
            for (let index = minX; index <= maxX; index++) {
                const element = nbCols[index];
                areaWidth += element.span * widthUnit;
            }
            let areaHeight = 0;
            for (let index = minY; index <= maxY; index++) {
                const element = nbRows[index];
                areaHeight += element.span * heightUnit;
            }
            let areaX = screenX;
            for (let index = 0; index < minX; index++) {
                const element = nbCols[index];
                areaX += element.span * widthUnit;
            }
            let areaY = screenY;
            for (let index = 0; index < minY; index++) {
                const element = nbRows[index];
                areaY += element.span * heightUnit;
            }
            return [areaX, areaY, areaWidth, areaHeight];
        };
        this._displayArea = (fromGridElement, toGridElement) => {
            let areaWidth, areaHeight, areaX, areaY;
            [areaX, areaY, areaWidth, areaHeight] = this._computeAreaPositionSize(fromGridElement, toGridElement);
            this.app.area.add_style_pseudo_class('activate');
            if (this.settings.animation) {
                Tweener.addTween(this.app.area, {
                    time: 0.2,
                    x: areaX,
                    y: areaY,
                    width: areaWidth,
                    height: areaHeight,
                    transition: 'easeOutQuad'
                });
            }
            else {
                this.app.area.width = areaWidth;
                this.app.area.height = areaHeight;
                this.app.area.x = areaX;
                this.app.area.y = areaY;
            }
        };
        this._hideArea = () => {
            this.app.area.remove_style_pseudo_class('activate');
        };
        this._onHoverChanged = (gridElement) => {
            if (this.activated) {
                if (this.first != null)
                    this.refreshGrid(this.first, gridElement);
            }
            else {
                if (this.currentElement)
                    this.currentElement._deactivate();
                this.currentElement = gridElement;
                this._displayArea(this.currentElement, this.currentElement);
                this.currentElement._activate();
            }
        };
        this._destroy = () => {
            this.activated = null;
            this.first = null;
            this.last = null;
            this.currentElement = null;
            this.activatedActors = null;
            this._hideArea();
        };
        this.app = app;
        this.settings = this.app.config;
    }
    _onButtonPress(gridElement, final) {
        if (final) {
            this.activated = true;
            if (this.first == null) {
                this.first = gridElement;
                this.activatedActors = [];
                this.activatedActors.push(gridElement);
                gridElement.actor.add_style_pseudo_class('activate');
                gridElement.active = true;
            }
        }
        if (!this.activated) {
            this.activated = true;
            this.activatedActors = [];
            this.activatedActors.push(gridElement);
            this.first = gridElement;
            gridElement.actor.add_style_pseudo_class('activate');
            gridElement.active = true;
        }
        else {
            this.app.platform.reset_window(this.app.FocusMetaWindow);
            let areaWidth, areaHeight, areaX, areaY;
            [areaX, areaY, areaWidth, areaHeight] = this._computeAreaPositionSize(this.first, gridElement);
            if (this._allSelected()) {
                this.app.platform.move_maximize_window(this.app.FocusMetaWindow, areaX, areaY);
            }
            else {
                this.app.platform.move_resize_window(this.app.FocusMetaWindow, areaX, areaY, areaWidth, areaHeight);
            }
            this._resizeDone();
        }
    }
};
GridElementDelegate = GridElementDelegate_decorate([
    addSignals
], GridElementDelegate);

;

;// CONCATENATED MODULE: ../base/ui/ToggleSettingsButton.ts
var ToggleSettingsButton_decorate = (undefined && undefined.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};


const { Icon, IconType, Button } = imports.gi.St;
const ToggleSettingsButton_Tooltips = imports.ui.tooltips;
const { IconTheme } = imports.gi.Gtk;
let ToggleSettingsButton = class ToggleSettingsButton {
    constructor(setting, text, property, icon) {
        this.active = false;
        this._update = () => {
            this.active = this.settings[this.property];
            if (this.active) {
                this.actor.opacity = 255;
                this.actor.add_style_pseudo_class('activate');
            }
            else {
                this.actor.remove_style_pseudo_class('activate');
            }
        };
        this._onButtonPress = () => {
            if (!objHasKey(this.settings, this.property))
                return false;
            this.settings[this.property] = !this.settings[this.property];
            this.emit('update-toggle');
            return false;
        };
        this.settings = setting;
        this.text = text;
        this.actor = new Button({
            style_class: "settings-button",
            reactive: true,
            can_focus: true,
            track_hover: true,
            child: new Icon({
                icon_name: icon,
                icon_type: IconType.SYMBOLIC,
                icon_size: 24,
            })
        });
        this.property = property;
        this._update();
        this.actor.connect('button-press-event', this._onButtonPress);
        this.connect('update-toggle', this._update);
        if (objHasKey(TOOLTIPS, property)) {
            this._tooltip = new ToggleSettingsButton_Tooltips.Tooltip(this.actor, TOOLTIPS[property]);
        }
    }
};
ToggleSettingsButton = ToggleSettingsButton_decorate([
    addSignals
], ToggleSettingsButton);

;

;// CONCATENATED MODULE: ../base/ui/TopBar.ts
const TopBar_St = imports.gi.St;
class TopBar {
    constructor(app, title) {
        this._onCloseButtonClicked = () => {
            this.app.ToggleUI();
            return false;
        };
        this.app = app;
        this.actor = new TopBar_St.BoxLayout({ style_class: 'top-box' });
        this._title = title;
        this._stlabel = new TopBar_St.Label({ style_class: 'grid-title', text: this._title });
        this._iconBin = new TopBar_St.Bin({ x_fill: false, y_fill: false });
        this._closeButton = new TopBar_St.Button({
            style: "padding:0;",
            opacity: 128,
            child: new TopBar_St.Icon({
                icon_type: TopBar_St.IconType.SYMBOLIC,
                icon_size: 24,
                icon_name: "window-close"
            })
        });
        this._closeButton.connect('notify::hover', () => { this._closeButton.opacity = this._closeButton.hover ? 255 : 128; });
        this._closeButton.connect('button-release-event', this._onCloseButtonClicked);
        this.actor.add(this._iconBin);
        this.actor.add(this._stlabel, { x_fill: true, expand: true, y_align: TopBar_St.Align.MIDDLE, y_fill: true });
        this.actor.add(this._closeButton, { x_fill: false, expand: false });
    }
    _set_title(title) {
        this._title = title;
        this._stlabel.text = this._title;
    }
    _set_app(app, title) {
        this._title = app.get_name() + ' - ' + title;
        this._stlabel.text = this._title;
        this._icon = app.create_icon_texture(24);
        this._iconBin.set_size(24, 24);
        this._iconBin.set_child(this._icon);
    }
}

;// CONCATENATED MODULE: ../base/ui/Grid.ts
var Grid_decorate = (undefined && undefined.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};









const { BoxLayout, Table, Bin } = imports.gi.St;
const Grid_Main = imports.ui.main;
const Grid_Tweener = imports.ui.tweener;
const { Side } = imports.gi.Meta;
const { Color } = imports.gi.Clutter;
let Grid = class Grid {
    constructor(app, monitor, title, cols, rows) {
        this.tableWidth = 220;
        this.tableHeight = 200;
        this.panelBorderOffset = 40;
        this.borderwidth = 2;
        this.rowKey = -1;
        this.colKey = -1;
        this.isEntered = false;
        this.interceptHide = false;
        this.elementsDelegateSignals = [];
        this.toggleSettingButtons = [];
        this.AdjustTableSize = (width, height) => {
            this.tableWidth = width;
            this.tableHeight = height;
            this.panelWidth = (this.tableWidth + this.panelBorderOffset);
            const time = this.app.config.AnimationTime;
            Grid_Tweener.addTween(this.table, {
                time: time,
                width: width,
                height: height,
                transition: 'easeOutQuad',
            });
            Grid_Tweener.addTween(this.actor, {
                time: time,
                width: this.panelWidth,
                transition: 'easeOutQuad',
            });
            const [widthUnit, heightUnit] = this.GetTableUnits(width, height);
            for (let index = 0; index < this.elements.length; index++) {
                const row = this.elements[index];
                for (let j = 0; j < row.length; j++) {
                    const element = row[j];
                    const finalWidth = widthUnit * this.cols[j].span;
                    const finalHeight = heightUnit * this.rows[index].span;
                    Grid_Tweener.addTween(element.actor, {
                        time: time,
                        width: finalWidth,
                        height: finalHeight,
                        transition: 'easeOutQuad',
                    });
                }
            }
        };
        this.RebuildGridSettingsButtons = () => {
            this.bottombar.destroy_children();
            let rowNum = 0;
            let colNum = 0;
            for (let index = 0; index < this.app.config.gridSettingsButton.length; index++) {
                if (colNum >= 4) {
                    colNum = 0;
                    rowNum += 2;
                }
                let button = this.app.config.gridSettingsButton[index];
                button = new GridSettingsButton(this.app, this.app.config, button.text, button.cols, button.rows);
                this.bottombar.add(button.actor, { row: rowNum, col: colNum, x_fill: false, y_fill: false });
                button.actor.connect('notify::hover', () => this.elementsDelegate.reset());
                colNum++;
            }
        };
        this.RefreshGridElements = () => {
            this.table.destroy_all_children();
            this.cols = this.app.config.nbCols;
            this.rows = this.app.config.nbRows;
            if (this.cols.length <= this.colKey || this.rows.length <= this.colKey)
                this.Reset();
            this.RebuildGridElements();
        };
        this.RebuildGridElements = () => {
            var _a;
            this.elements = [];
            const [widthUnit, heightUnit] = this.GetTableUnits(this.tableWidth, this.tableHeight);
            this.elementsDelegateSignals.forEach(element => {
                var _a;
                (_a = this.elementsDelegate) === null || _a === void 0 ? void 0 : _a.disconnect(element);
            });
            (_a = this.elementsDelegate) === null || _a === void 0 ? void 0 : _a._destroy();
            this.elementsDelegate = new GridElementDelegate(this.app);
            this.elementsDelegateSignals = [];
            this.elementsDelegateSignals.push(this.elementsDelegate.connect('resize-done', this.OnResize));
            for (let r = 0; r < this.rows.length; r++) {
                const row = new BoxLayout();
                for (let c = 0; c < this.cols.length; c++) {
                    if (c === 0) {
                        this.elements[r] = [];
                    }
                    const finalWidth = widthUnit * this.cols[c].span;
                    const finalHeight = heightUnit * this.rows[r].span;
                    let element = new GridElement(this.app, this.monitor, this, finalWidth, finalHeight, c, r, this.elementsDelegate, this.cols.length);
                    this.elements[r][c] = element;
                    const bin = new Bin();
                    bin.add_actor(element.actor);
                    row.add(bin, { expand: true });
                }
                this.table.add(row, { expand: true });
            }
        };
        this.OnHideComplete = () => {
            if (!this.interceptHide && this.actor) {
                Grid_Main.layoutManager.removeChrome(this.actor);
            }
            Grid_Main.layoutManager["_chrome"].updateRegions();
        };
        this.OnShowComplete = () => {
            Grid_Main.layoutManager["_chrome"].updateRegions();
        };
        this.OnResize = () => {
            this.app.RefreshGrid();
            if (this.app.config.autoclose) {
                this.emit('hide-tiling');
            }
        };
        this.OnMouseEnter = () => {
            if (!this.isEntered) {
                this.elementsDelegate.reset();
                this.isEntered = true;
            }
            return false;
        };
        this.OnMouseLeave = () => {
            let [x, y, mask] = global.get_pointer();
            if ((this.elementsDelegate && (x <= this.actor.x || x >= this.actor.x + this.actor.width)) || (y <= this.actor.y || y >= this.actor.y + this.tableHeight + this.topbar.actor.height)) {
                this.isEntered = false;
                this.elementsDelegate.reset();
            }
            return false;
        };
        this.OnKeyPressEvent = (type, key) => {
            var _a, _b, _c, _d, _e, _f, _g, _h;
            let modifier = false;
            switch (type) {
                case 'greenTile-k-right-meta':
                case 'greenTile-k-left-meta':
                case 'greenTile-k-up-meta':
                case 'greenTile-k-down-meta':
                case 'greenTile-k-right-monitor-move':
                case 'greenTile-k-left-monitor-move':
                case 'greenTile-k-up-monitor-move':
                case 'greenTile-k-down-monitor-move':
                    modifier = true;
                    break;
            }
            if (modifier && this.keyElement) {
                if (!this.elementsDelegate.activated) {
                    this.keyElement._onButtonPress(false);
                }
            }
            else if (this.keyElement) {
                this.elementsDelegate.reset();
            }
            switch (type) {
                case 'greenTile-k-right':
                case 'greenTile-k-right-meta':
                    this.colKey = Math.min(this.colKey + 1, this.cols.length - 1);
                    this.rowKey = this.rowKey === -1 ? 0 : this.rowKey;
                    break;
                case 'greenTile-k-left':
                case 'greenTile-k-left-meta':
                    if (this.colKey == -1)
                        return;
                    this.colKey = Math.max(0, this.colKey - 1);
                    break;
                case 'greenTile-k-up':
                case 'greenTile-k-up-meta':
                    if (this.rowKey == -1)
                        return;
                    this.rowKey = Math.max(0, this.rowKey - 1);
                    break;
                case 'greenTile-k-down':
                case 'greenTile-k-down-meta':
                    this.rowKey = Math.min(this.rowKey + 1, this.rows.length - 1);
                    this.colKey = this.colKey === -1 ? 0 : this.colKey;
                    break;
                case 'greenTile-k-left-monitor-move':
                    this.MoveToMonitor(getAdjacentMonitor(this.monitor, Side.LEFT));
                    break;
                case 'greenTile-k-right-monitor-move':
                    this.MoveToMonitor(getAdjacentMonitor(this.monitor, Side.RIGHT));
                    break;
                case 'greenTile-k-up-monitor-move':
                    this.MoveToMonitor(getAdjacentMonitor(this.monitor, Side.TOP));
                    break;
                case 'greenTile-k-down-monitor-move':
                    this.MoveToMonitor(getAdjacentMonitor(this.monitor, Side.BOTTOM));
                    break;
                case 'greenTile-k-first-grid':
                    (_b = (_a = this.app.config.gridSettingsButton) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b._onButtonPress();
                    break;
                case 'greenTile-k-second-grid':
                    (_d = (_c = this.app.config.gridSettingsButton) === null || _c === void 0 ? void 0 : _c[1]) === null || _d === void 0 ? void 0 : _d._onButtonPress();
                    break;
                case 'greenTile-k-third-grid':
                    (_f = (_e = this.app.config.gridSettingsButton) === null || _e === void 0 ? void 0 : _e[2]) === null || _f === void 0 ? void 0 : _f._onButtonPress();
                    break;
                case 'greenTile-k-fourth-grid':
                    (_h = (_g = this.app.config.gridSettingsButton) === null || _g === void 0 ? void 0 : _g[3]) === null || _h === void 0 ? void 0 : _h._onButtonPress();
                    break;
            }
            this.keyElement = this.elements[this.rowKey] ? this.elements[this.rowKey][this.colKey] : null;
            if (this.keyElement)
                this.keyElement._onHoverChanged();
        };
        this.BeginTiling = () => {
            if (this.keyElement) {
                this.keyElement._onButtonPress(true);
                this.Reset();
            }
        };
        this.MoveToMonitor = (monitor) => {
            monitor = monitor ? monitor : this.app.CurrentMonitor;
            if (monitor.index == this.app.CurrentMonitor.index)
                return;
            this.app.MoveToMonitor(this.app.CurrentMonitor, monitor !== null && monitor !== void 0 ? monitor : this.app.CurrentMonitor);
        };
        this.destroy = () => {
            for (let r in this.elements) {
                for (let c in this.elements[r]) {
                    this.elements[r][c]._destroy();
                }
            }
            this.elementsDelegate._destroy();
            this.topbar._destroy();
            this.Reset();
            this.monitor = null;
            this.rows = null;
            this.title = null;
            this.cols = null;
        };
        this.app = app;
        this.tableHeight = 200;
        this.tableWidth = 220;
        this.panelBorderOffset = 40;
        this.panelWidth = (this.tableWidth + this.panelBorderOffset);
        this.borderwidth = 2;
        this.actor = new BoxLayout({
            vertical: true,
            style_class: 'grid-panel',
            reactive: true,
            can_focus: true,
            track_hover: true,
            width: this.panelWidth
        });
        this.actor.connect('enter-event', this.OnMouseEnter);
        this.actor.connect('leave-event', this.OnMouseLeave);
        this.topbar = new TopBar(this.app, title);
        this.bottombar = new Table({
            homogeneous: true,
            style_class: 'bottom-box',
            can_focus: true,
            track_hover: true,
            reactive: true,
        });
        this.veryBottomBar = new Table({
            homogeneous: true,
            style_class: 'bottom-box very-bottom-box',
            can_focus: true,
            track_hover: true,
            reactive: true,
        });
        this.RebuildGridSettingsButtons();
        this.table = new BoxLayout({
            style_class: 'table',
            can_focus: true,
            track_hover: true,
            reactive: true,
            vertical: true,
            width: this.tableWidth,
            height: this.tableHeight
        });
        this.actor.add(this.topbar.actor, { x_fill: true });
        this.actor.add(this.table, { x_fill: false });
        this.actor.add(this.bottombar, { x_fill: false });
        this.actor.add(this.veryBottomBar, { x_fill: false });
        this.monitor = monitor;
        this.rows = rows;
        this.title = title;
        this.cols = cols;
        this.isEntered = false;
        let toggle = new ToggleSettingsButton(this.app.config, 'animation', SETTINGS_ANIMATION, "animation_black-symbolic");
        this.veryBottomBar.add(toggle.actor, { row: 0, col: 0, x_fill: false, y_fill: false });
        this.toggleSettingButtons.push(toggle);
        toggle = new ToggleSettingsButton(this.app.config, 'auto-close', SETTINGS_AUTO_CLOSE, "auto_close_black-symbolic");
        this.veryBottomBar.add(toggle.actor, { row: 0, col: 1, x_fill: false, y_fill: false });
        this.toggleSettingButtons.push(toggle);
        let action = new AutoTileMainAndList(this.app);
        this.veryBottomBar.add(action.actor, { row: 0, col: 2, x_fill: false, y_fill: false });
        action.connect('resize-done', this.OnResize);
        let actionTwo = new AutoTileTwoList(this.app);
        this.veryBottomBar.add(actionTwo.actor, { row: 0, col: 3, x_fill: false, y_fill: false });
        actionTwo.connect('resize-done', this.OnResize);
        this.x = 0;
        this.y = 0;
        this.interceptHide = false;
        this.RebuildGridElements();
        this.normalScaleY = this.actor.scale_y;
        this.normalScaleX = this.actor.scale_x;
    }
    ChangeCurrentMonitor(monitor) {
        this.monitor = monitor;
        for (const row of this.elements) {
            for (const element of row) {
                element.monitor = this.monitor;
            }
        }
    }
    GetTableUnits(width, height) {
        const rowSpans = this.rows.map(r => r.span).reduce((p, c) => p += c);
        const colSpans = this.cols.map(r => r.span).reduce((p, c) => p += c);
        const widthUnit = width / colSpans - (2 * this.borderwidth);
        const heightUnit = height / rowSpans - (2 * this.borderwidth);
        return [Math.round(widthUnit), Math.round(heightUnit)];
    }
    GetTableSize() {
        const aspect = GetMonitorAspectRatio(this.monitor);
        if (!this.app.config.aspectRatio)
            return [220, 200];
        const newTableWidth = (aspect.widthIsLonger) ? 200 * aspect.ratio : 200;
        const newTableHeight = (aspect.widthIsLonger) ? 200 : 200 * aspect.ratio;
        return [newTableWidth, newTableHeight];
    }
    UpdateSettingsButtons() {
        for (const button of this.toggleSettingButtons) {
            button["_update"]();
        }
    }
    Reset() {
        this.colKey = -1;
        this.rowKey = -1;
        this.keyElement = null;
        this.elementsDelegate.reset();
    }
    async Show(x, y) {
        if (x != null && y != null)
            this.SetPosition(x, y);
        this.interceptHide = true;
        this.elementsDelegate.reset();
        let time = this.app.config.animation ? 0.3 : 0;
        Grid_Main.layoutManager.removeChrome(this.actor);
        Grid_Main.layoutManager.addChrome(this.actor);
        this.actor.scale_y = 0;
        if (time > 0) {
            await new Promise((resolve) => {
                Grid_Tweener.addTween(this.actor, {
                    time: time,
                    opacity: 255,
                    transition: 'easeOutQuad',
                    scale_y: this.normalScaleY,
                    onStart: () => this.actor.visible = true,
                    onComplete: () => { resolve(); this.OnShowComplete(); }
                });
            });
        }
        else {
            this.actor.opacity = 255;
            this.actor.visible = true;
            this.actor.scale_y = this.normalScaleY;
        }
        this.interceptHide = false;
    }
    Hide(immediate) {
        this.Reset();
        let time = this.app.config.animation && !immediate ? 0.3 : 0;
        if (time > 0) {
            Grid_Tweener.addTween(this.actor, {
                time: time,
                opacity: 0,
                scale_y: 0,
                transition: 'easeOutQuad',
                onComplete: () => { this.actor.visible = false; this.OnHideComplete(); }
            });
        }
        else {
            this.actor.opacity = 0;
            this.actor.visible = false;
            this.actor.scale_y = 0;
        }
    }
    SetPosition(x, y) {
        this.x = x;
        this.y = y;
        this.actor.set_position(x, y);
    }
};
Grid = Grid_decorate([
    addSignals
], Grid);

;

;// CONCATENATED MODULE: ../base/app.ts




const Cinnamon = imports.gi.Cinnamon;
const app_St = imports.gi.St;
const app_Main = imports.ui.main;
const app_Tweener = imports.ui.tweener;
let metadata;
class App {
    constructor(platform) {
        this.visible = false;
        this.tracker = Cinnamon.WindowTracker.get_default();
        this.monitors = app_Main.layoutManager.monitors;
        this.focusMetaWindowConnections = [];
        this.focusMetaWindowPrivateConnections = [];
        this.area = new app_St.BoxLayout({ style_class: 'grid-preview' });
        this.currentMonitor = app_Main.layoutManager.primaryMonitor;
        this.focusMetaWindow = null;
        this.grids = [];
        this.RefreshGrid = () => {
            for (const grid of this.grids) {
                grid.RefreshGridElements();
            }
            app_Main.layoutManager["_chrome"].updateRegions();
        };
        this.GetNotFocusedWindowsOfMonitor = (monitor) => {
            return app_Main.getTabList().filter((w) => {
                let app = this.tracker.get_window_app(w);
                let w_monitor = app_Main.layoutManager.monitors[w.get_monitor()];
                if (app == null) {
                    return false;
                }
                if (w.minimized) {
                    return false;
                }
                if (w_monitor !== monitor) {
                    return false;
                }
                return this.focusMetaWindow !== w && w.get_wm_class() != null;
            });
        };
        this.ToggleUI = () => {
            if (this.visible) {
                this.HideUI();
            }
            else {
                this.ShowUI();
            }
            return this.visible;
        };
        this.MoveToMonitor = async (current, newMonitor) => {
            if (current.index == newMonitor.index)
                return;
            if (!this.config.showGridOnAllMonitors)
                this.CurrentGrid.ChangeCurrentMonitor(newMonitor);
            this.currentMonitor = newMonitor;
            this.MoveUIActor();
        };
        this.ShowUI = () => {
            var _a;
            this.focusMetaWindow = getFocusApp();
            let wm_type = this.focusMetaWindow.get_window_type();
            let layer = this.focusMetaWindow.get_layer();
            this.area.visible = true;
            const window = this.focusMetaWindow;
            if (window != null && wm_type !== 1 && layer > 0) {
                for (const grid of this.grids) {
                    if (!this.config.showGridOnAllMonitors)
                        grid.ChangeCurrentMonitor((_a = this.monitors.find(x => x.index == window.get_monitor())) !== null && _a !== void 0 ? _a : app_Main.layoutManager.primaryMonitor);
                    const [pos_x, pos_y] = (!this.config.useMonitorCenter && grid.monitor.index == this.currentMonitor.index) ? this.platform.get_window_center(window) : GetMonitorCenter(grid.monitor);
                    grid.Show(Math.floor(pos_x - grid.actor.width / 2), Math.floor(pos_y - grid.actor.height / 2));
                    this.OnFocusedWindowChanged();
                    this.visible = true;
                }
            }
            this.MoveUIActor();
            this.BindKeyControls();
        };
        this.HideUI = () => {
            this.RemoveKeyControls();
            for (const grid of this.grids) {
                grid.elementsDelegate.reset();
                grid.Hide(false);
            }
            this.area.visible = false;
            this.ResetFocusedWindow();
            this.visible = false;
            app_Main.layoutManager["_chrome"].updateRegions();
        };
        this.BindKeyControls = () => {
            app_Main.keybindingManager.addHotKey('greenTile-close', 'Escape', this.ToggleUI);
            app_Main.keybindingManager.addHotKey('greenTile-tile1', 'space', () => this.CurrentGrid.BeginTiling());
            app_Main.keybindingManager.addHotKey('greenTile-tile2', 'Return', () => this.CurrentGrid.BeginTiling());
            for (let index in KEYCONTROL) {
                if (objHasKey(KEYCONTROL, index)) {
                    let key = KEYCONTROL[index];
                    let type = index;
                    app_Main.keybindingManager.addHotKey(type, key, () => this.CurrentGrid.OnKeyPressEvent(type, key));
                }
            }
            // Add keybindings for a-z and A-Z
            for (let i = 0; i < 26; i++) {
                const lowerCaseLetter = String.fromCharCode('a'.charCodeAt(0) + i);
                app_Main.keybindingManager.addHotKey(`greenTile-letter-${lowerCaseLetter}`, lowerCaseLetter, () => this.handleLetterInput(lowerCaseLetter));
                const upperCaseLetter = String.fromCharCode('A'.charCodeAt(0) + i);
                app_Main.keybindingManager.addHotKey(`greenTile-letter-${upperCaseLetter}`, '<Shift>' + lowerCaseLetter, () => this.handleLetterInput(upperCaseLetter));
            }
        };
        this.RemoveKeyControls = () => {
            app_Main.keybindingManager.removeHotKey('greenTile-close');
            app_Main.keybindingManager.removeHotKey('greenTile-tile1');
            app_Main.keybindingManager.removeHotKey('greenTile-tile2');
            for (let type in KEYCONTROL) {
                app_Main.keybindingManager.removeHotKey(type);
            }
            // Remove keybindings for a-z and A-Z
            for (let i = 0; i < 26; i++) {
                const lowerCaseLetter = String.fromCharCode('a'.charCodeAt(0) + i);
                app_Main.keybindingManager.removeHotKey(`greenTile-letter-${lowerCaseLetter}`);
                const upperCaseLetter = String.fromCharCode('A'.charCodeAt(0) + i);
                app_Main.keybindingManager.removeHotKey(`greenTile-letter-${upperCaseLetter}`);
            }
        };
        this.ReInitialize = () => {
            this.monitors = app_Main.layoutManager.monitors;
            this.DestroyGrid();
            this.InitGrid();
        };
        this.DestroyGrid = () => {
            this.RemoveKeyControls();
            for (const grid of this.grids) {
                if (typeof grid != 'undefined') {
                    grid.Hide(true);
                    app_Main.layoutManager.removeChrome(grid.actor);
                }
            }
        };
        this.MoveUIActor = () => {
            if (!this.visible) {
                return;
            }
            let window = this.focusMetaWindow;
            if (!window)
                return;
            for (const grid of this.Grids) {
                const [newTableWidth, newTableHeight] = grid.GetTableSize();
                const gridWidth = grid.actor.width + (newTableWidth - grid.table.width);
                const gridHeight = grid.actor.height + (newTableHeight - grid.table.height);
                let pos_x;
                let pos_y;
                let monitor = grid.monitor;
                let isGridMonitor = window.get_monitor() === grid.monitor.index;
                if (isGridMonitor) {
                    [pos_x, pos_y] = (!this.config.useMonitorCenter) ? this.platform.get_window_center(window) : GetMonitorCenter(monitor);
                    pos_x = pos_x < monitor.x ? monitor.x : pos_x;
                    pos_x = pos_x + gridWidth > monitor.width + monitor.x ? monitor.x + monitor.width - gridWidth : pos_x;
                    pos_y = pos_y < monitor.y ? monitor.y : pos_y;
                    pos_y = pos_y + gridHeight > monitor.height + monitor.y ? monitor.y + monitor.height - gridHeight : pos_y;
                }
                else {
                    [pos_x, pos_y] = GetMonitorCenter(monitor);
                }
                pos_x = Math.floor(pos_x - gridWidth / 2);
                pos_y = Math.floor(pos_y - gridHeight / 2);
                grid.AdjustTableSize(newTableWidth, newTableHeight);
                app_Tweener.addTween(grid.actor, {
                    time: this.config.AnimationTime,
                    x: pos_x,
                    y: pos_y,
                    transition: 'easeOutQuad',
                    onComplete: this.updateRegions
                });
            }
        };
        this.updateRegions = () => {
            app_Main.layoutManager["_chrome"].updateRegions();
        };
        this.OnFocusedWindowChanged = () => {
            let window = getFocusApp();
            if (!window) {
                this.ResetFocusedWindow();
                for (const grid of this.grids) {
                    grid.topbar._set_title('greenTile');
                }
                return;
            }
            this.ResetFocusedWindow();
            this.focusMetaWindow = window;
            if (!this.config.showGridOnAllMonitors)
                this.CurrentGrid.ChangeCurrentMonitor(this.monitors[this.focusMetaWindow.get_monitor()]);
            this.currentMonitor = this.monitors[this.focusMetaWindow.get_monitor()];
            this.focusMetaWindowPrivateConnections.push(...this.platform.subscribe_to_focused_window_changes(this.focusMetaWindow, this.MoveUIActor));
            let app = this.tracker.get_window_app(this.focusMetaWindow);
            let title = this.focusMetaWindow.get_title();
            if (app) {
                for (const grid of this.grids) {
                    grid.topbar._set_app(app, title);
                }
            }
            else {
                for (const grid of this.grids) {
                    grid.topbar._set_title(title);
                }
            }
            this.MoveUIActor();
        };
        this.OnCenteredToWindowChanged = () => {
            this.MoveUIActor();
        };
        this.ResetFocusedWindow = () => {
            var _a;
            if (this.focusMetaWindowConnections.length > 0) {
                for (var idx in this.focusMetaWindowConnections) {
                    (_a = this.focusMetaWindow) === null || _a === void 0 ? void 0 : _a.disconnect(this.focusMetaWindowConnections[idx]);
                }
            }
            if (this.focusMetaWindow != null && this.focusMetaWindowPrivateConnections.length > 0) {
                this.platform.unsubscribe_from_focused_window_changes(this.focusMetaWindow, ...this.focusMetaWindowPrivateConnections);
            }
            this.focusMetaWindow = null;
            this.focusMetaWindowConnections = [];
            this.focusMetaWindowPrivateConnections = [];
        };

        this.handleLetterInput = (letter) => {
            if (this.firstLetterSelection === null) {
                this.firstLetterSelection = letter;
                const selectedTile = this.getGridElementFromLetter(letter);
                if (selectedTile) {
                    selectedTile._activate(); // Highlight the first selected tile
                }
            } else {
                const firstTile = this.getGridElementFromLetter(this.firstLetterSelection);
                const secondTile = this.getGridElementFromLetter(letter);

                if (firstTile) {
                    firstTile._deactivate(); // De-highlight the first selected tile
                }

                if (firstTile && secondTile) {
                    // Calculate the combined rectangle
                    const [areaX, areaY, areaWidth, areaHeight] = this.CurrentGrid.elementsDelegate._computeAreaPositionSize(firstTile, secondTile);

                    // Resize and move the focused window
                    if (this.FocusMetaWindow) {
                        this.platform.reset_window(this.FocusMetaWindow);
                        this.platform.move_resize_window(this.FocusMetaWindow, areaX, areaY, areaWidth, areaHeight);
                    }
                }

                // Reset for next selection
                this.firstLetterSelection = null;
                this.HideUI(); // Hide the UI after selection
            }
        };

        this.getGridElementFromLetter = (letter) => {
            const grid = this.CurrentGrid;
            if (!grid || !grid.elements) return null;

            const numCols = grid.cols.length;
            const charCode = letter.charCodeAt(0);
            let labelIndex;

            if (charCode >= 'a'.charCodeAt(0) && charCode <= 'z'.charCodeAt(0)) {
                labelIndex = charCode - 'a'.charCodeAt(0);
            } else if (charCode >= 'A'.charCodeAt(0) && charCode <= 'Z'.charCodeAt(0)) {
                labelIndex = charCode - 'A'.charCodeAt(0) + 26;
            } else {
                return null;
            }

            const r = Math.floor(labelIndex / numCols);
            const c = labelIndex % numCols;

            if (grid.elements[r] && grid.elements[r][c]) {
                return grid.elements[r][c];
            }

            return null;
        };

        this.firstLetterSelection = null; // Added
        this.platform = platform;
        app_Main.uiGroup.add_actor(this.area);
        this.config = new Config(this);
        this.InitGrid();
        this.focusAppSignal = this.tracker.connect("notify::focus-app", this.OnFocusedWindowChanged);
        this.screenMonitorsSignal = global.screen.connect('monitors-changed', this.ReInitialize);
    }
    get CurrentMonitor() {
        return this.currentMonitor;
    }
    get FocusMetaWindow() {
        return this.focusMetaWindow;
    }
    get CurrentGrid() {
        const grid = this.grids.find(x => x.monitor.index == this.currentMonitor.index);
        return grid;
    }
    get Grids() {
        return this.grids;
    }
    destroy() {
        // greenTile fix: gTile never disconnected these two, so destroyed Apps kept
        // reacting to focus and monitor changes.
        if (this.focusAppSignal) {
            this.tracker.disconnect(this.focusAppSignal);
            this.focusAppSignal = 0;
        }
        if (this.screenMonitorsSignal) {
            global.screen.disconnect(this.screenMonitorsSignal);
            this.screenMonitorsSignal = 0;
        }
        this.config.destroy();
        this.DestroyGrid();
        this.ResetFocusedWindow();
    }
    InitGrid() {
        this.currentMonitor = app_Main.layoutManager.primaryMonitor;
        const monitors = this.config.showGridOnAllMonitors ? this.monitors : [this.currentMonitor];
        this.RemoveKeyControls();
        this.grids = [];
        for (const monitor of monitors) {
            const grid = new Grid(this, monitor, 'greenTile', this.config.nbCols, this.config.nbRows);
            app_Main.layoutManager.addChrome(grid.actor, { visibleInFullscreen: true });
            grid.actor.set_opacity(0);
            grid.Hide(true);
            grid.connect('hide-tiling', this.HideUI);
            this.grids.push(grid);
        }
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
const _getInvisibleBorderPadding = (metaWindow) => {
    let outerRect = metaWindow.get_frame_rect();
    let inputRect = metaWindow.get_buffer_rect();
    let [borderX, borderY] = [outerRect.x - inputRect.x, outerRect.y - inputRect.y];
    return [borderX, borderY];
};
const move_maximize_window = (metaWindow, x, y) => {
    if (metaWindow == null)
        return;
    let [borderX, borderY] = _getInvisibleBorderPadding(metaWindow);
    x = x - borderX;
    y = y - borderY;
    metaWindow.move_frame(true, x, y);
    metaWindow.maximize(utils_Meta.MaximizeFlags.HORIZONTAL | utils_Meta.MaximizeFlags.VERTICAL);
};
const move_resize_window = (metaWindow, x, y, width, height) => {
    if (!metaWindow)
        return;
    metaWindow.move_resize_frame(true, x, y, width, height);
    metaWindow.move_frame(true, x, y);
};
const get_window_center = (window) => {
    const pos_x = window.get_frame_rect().width / 2 + window.get_frame_rect().x;
    const pos_y = window.get_frame_rect().height / 2 + window.get_frame_rect().y;
    return [pos_x, pos_y];
};
const subscribe_to_focused_window_changes = (window, callback) => {
    const connections = [];
    let actor = window.get_compositor_private();
    if (actor) {
        connections.push(window.connect('size-changed', callback));
        connections.push(window.connect('position-changed', callback));
    }
    return connections;
};
const unsubscribe_from_focused_window_changes = (window, ...signals) => {
    for (const idx of signals) {
        window.disconnect(idx);
    }
};
const get_tab_list = () => {
    let screen = global.screen;
    let display = screen.get_display();
    let workspace = screen.get_active_workspace();
    let windows = [];
    let allwindows = display.get_tab_list(utils_Meta.TabList.NORMAL_ALL, workspace);
    let registry = {};
    for (let i = 0; i < allwindows.length; ++i) {
        let window = allwindows[i];
        if (utils_Main_0.isInteresting(window)) {
            let seqno = window.get_stable_sequence();
            if (!registry[seqno]) {
                windows.push(window);
                registry[seqno] = true;
            }
        }
    }
    return windows;
};

;// CONCATENATED MODULE: ./extension.ts

    let monitorChangedSignal = null;
let extension_metadata;
let app;
const platform = {
    move_maximize_window: move_maximize_window,
    move_resize_window: move_resize_window,
    reset_window: reset_window,
    get_window_center: get_window_center,
    subscribe_to_focused_window_changes: subscribe_to_focused_window_changes,
    unsubscribe_from_focused_window_changes: unsubscribe_from_focused_window_changes,
    get_tab_list: get_tab_list
};
const init = (meta) => {
    extension_metadata = meta;
    imports.gi.Gtk.IconTheme.get_default().append_search_path(extension_metadata.path + "/icons");
};
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
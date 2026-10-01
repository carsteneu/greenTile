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

// Pure model blocks, extracted to lib/model/. Paths are root-relative on purpose:
// Cinnamon resolves every nested require against the xlet root (fileUtils.js).
const { tile_excl_rows_normalize, tile_excl_match, tile_excl_rows_append, tile_excl_app_options, tile_excl_toggle_set } = require('./lib/model/exclude');
const { TILE_GAP_MAX, TILE_GAP_STEP, tile_gap_value, tile_gap_cell } = require('./lib/model/gap');
const { tile_single_fill, tile_single_layout } = require('./lib/model/single');
const { tile_disconnect_each } = require('./lib/model/teardown');
const { tile_fill_stacks, tile_auto_rows, tile_auto_narrow_stacks } = require('./lib/model/fill');
const { TILE_SPLIT_MIN_PX, tile_split_valid, tile_split_rects, tile_split_cell_at, tile_split_border_pos, tile_split_move, tile_split_key_target, tile_split_accel, tile_split_op_edges, tile_split_frame_edges, tile_sort_order } = require('./lib/model/split');
const { tile_drop_zone, tile_drop_layout, tile_drop_fits } = require('./lib/model/drop');
const { tile_layouts_parse, tile_layouts_entry, tile_layouts_splits, tile_layouts_shapes, tile_layouts_set, tile_layouts_remove_preset, tile_layouts_migrate, tile_layout_resolve } = require('./lib/model/layouts');
const { tile_swap_neighbor, tile_swap_landing_cell, tile_swap_chain_step } = require('./lib/model/swap');
const { tile_focus_monitor_step, tile_focus_monitor_pick } = require('./lib/model/focus');
const { tile_editor_cols, tile_editor_rows, tile_editor_min_floor, tile_editor_clamp, tile_editor_paint, tile_editor_paint_range, tile_editor_remove, tile_editor_sort, tile_editor_add_rule, tile_editor_delete_rule, tile_editor_step_min, tile_editor_validate, tile_editor_new_id, tile_editor_commit, tile_editor_delete_preset } = require('./lib/model/editor');
const { TILE_PANEL_MIN, tile_panel_size_parse, tile_panel_size_set, tile_panel_size_clamp } = require('./lib/model/panel-size');
const { tile_accent_default, tile_accent_parse, tile_accent_is_own, tile_accent_from_probed, tile_accent_probe_first, tile_accent_tones, tile_accent_css } = require('./lib/model/accent');
const { tile_state_default, tile_state_mode, tile_state_tones, tile_state_css } = require('./lib/model/state');
const { tile_theme_resolve, tile_theme_toggle_target } = require('./lib/model/theme');
const { Session } = require('./lib/runtime/session');
const { Monitors } = require('./lib/runtime/monitors');

;// CONCATENATED MODULE: ../base/config.ts

const Settings = imports.ui.settings;
const Main = imports.ui.main;
const Tooltips = imports.ui.tooltips;
const tile_SignalManager = imports.misc.signalManager.SignalManager;
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
            Main.keybindingManager.addHotKey('greenTile-swap-left', this.swapLeftHotkey, () => tile_swap_hotkey(this.app, 'left'));
            Main.keybindingManager.addHotKey('greenTile-swap-right', this.swapRightHotkey, () => tile_swap_hotkey(this.app, 'right'));
            Main.keybindingManager.addHotKey('greenTile-swap-up', this.swapUpHotkey, () => tile_swap_hotkey(this.app, 'up'));
            Main.keybindingManager.addHotKey('greenTile-swap-down', this.swapDownHotkey, () => tile_swap_hotkey(this.app, 'down'));
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
            Main.keybindingManager.removeHotKey('greenTile-swap-left');
            Main.keybindingManager.removeHotKey('greenTile-swap-right');
            Main.keybindingManager.removeHotKey('greenTile-swap-up');
            Main.keybindingManager.removeHotKey('greenTile-swap-down');
        };
        this.destroy = () => {
            this.DisableHotkey();
            if (this.excludeAppSignal) {
                imports.gi.Cinnamon.AppSystem.get_default().disconnect(this.excludeAppSignal);
                this.excludeAppSignal = null;
            }
            // resize hotkey steps not yet written (500 ms debounce) must not get lost
            tile_split_flush(this.app);
            this.app.monitors.destroy();
            tile_auto_disconnect_all();
            // The settle wait lives on the session, not on this App: its timer dies
            // with the App, its start time survives while a change is pending.
            this.app.session.settle.teardown();
            tile_panel_close();
            tile_theme_shutdown();
            tile_focus_disconnect();
            tile_border_shutdown();
            // settings dialog changes must no longer reach the destroyed app;
            // a dialog still open then throws in cinnamonDBus — Cinnamon's behaviour
            // for every finalized xlet
            this.settings.finalize();
        };
        this.app = app;
        this.settings = new Settings.ExtensionSettings(this, 'greenTile@carsteneu');
        this.settings.bind('autotile6hotkey', 'autotile6Hotkey', this.EnableHotkey, null);
        this.settings.bind('autotile3hotkey', 'autotile3Hotkey', this.EnableHotkey, null);
        this.settings.bind('autotileautohotkey', 'autotileAutoHotkey', this.EnableHotkey, null);
        this.settings.bind('autotileoffhotkey', 'autotileOffHotkey', this.EnableHotkey, null);
        this.settings.bind('presetHotkey', 'presetHotkey', this.EnableHotkey, null);
        this.settings.bind('excludeHotkey', 'excludeHotkey', this.EnableHotkey, null);
        this.settings.bind('exclusions', 'exclusions', () => {
            tile_excl_apply(this.settings);
            tile_excl_retile(this.app);
        }, null);
        this.settings.bind('excludeAppPicker', 'excludeAppPickerValue', () => {
            tile_excl_app_picked(this.settings, this.app, this.settings.getValue('excludeAppPicker'));
        }, null);
        this.settings.bind('resizeWiderHotkey', 'resizeWiderHotkey', this.EnableHotkey, null);
        this.settings.bind('resizeNarrowerHotkey', 'resizeNarrowerHotkey', this.EnableHotkey, null);
        this.settings.bind('resizeTallerHotkey', 'resizeTallerHotkey', this.EnableHotkey, null);
        this.settings.bind('resizeShorterHotkey', 'resizeShorterHotkey', this.EnableHotkey, null);
        this.settings.bind('swapLeftHotkey', 'swapLeftHotkey', this.EnableHotkey, null);
        this.settings.bind('swapRightHotkey', 'swapRightHotkey', this.EnableHotkey, null);
        this.settings.bind('swapUpHotkey', 'swapUpHotkey', this.EnableHotkey, null);
        this.settings.bind('swapDownHotkey', 'swapDownHotkey', this.EnableHotkey, null);
        this.settings.bind('panelTheme', 'panelTheme', () => tile_theme_changed(), null);
        this.settings.bind('accentMode', 'accentMode', () => tile_theme_changed(), null);
        this.settings.bind('accentColor', 'accentColor', () => tile_theme_changed(), null);
        this.settings.bind('stateMode', 'stateMode', () => tile_theme_changed(), null);
        this.settings.bind('stateColor', 'stateColor', () => tile_theme_changed(), null);
        this.settings.bind('focusBorder', 'focusBorderValue', () => tile_border_update(), null);
        this.settings.bind('fillSingleWindow', 'fillSingleWindowValue', () => {
            if (this.settings.getValue('fillSingleWindow') === true)
                tile_single_retile(this.app);
        }, null);
        tile_excl_apply(this.settings);
        tile_excl_app_populate(this.settings);
        this.excludeAppSignal = imports.gi.Cinnamon.AppSystem.get_default().connect('installed-changed', () => {
            tile_excl_apply(this.settings);
            tile_excl_app_populate(this.settings);
        });
        this.EnableHotkey();
        tile_theme_init(this);
        tile_focus_connect(this.app);
        tile_border_init(this.app);
        app.monitors.refresh(() => {
            tile_layouts_migrate_once(app);
            tile_auto_connect_all(app);
            app.session.settle.consumePending(app);
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
const tile_excl = { toggled: new Map(), rows: [], classes: Object.create(null) };
const tile_excl_is_excluded = (w) => {
    if (w == null)
        return false;
    if (tile_excl.toggled.get(w.get_stable_sequence()))
        return true;
    if (tile_excl.rows.length === 0)
        return false;
    const app = imports.gi.Cinnamon.WindowTracker.get_default().get_window_app(w);
    return tile_excl_match(w.get_wm_class(), w.get_wm_class_instance(), w.get_title(), tile_excl.rows, app ? app.get_id() : null, tile_excl.classes);
};
// StartupWMClass per app row, resolved once per apply (not per window per retile); the
// value is null when AppSystem cannot resolve the rule text or the app declares no
// StartupWMClass — those rows fall back to the id compare. Rebuilt with the rows
// themselves on installed-changed. Null-prototype object, rule texts must not collide
// with Object.prototype keys (see tile_excl_app_options).
const tile_excl_app_classes = (rows) => {
    const appSystem = imports.gi.Cinnamon.AppSystem.get_default();
    const result = Object.create(null);
    for (let i = 0; i < rows.length; i++) {
        if (rows[i].match !== 'app' || result[rows[i].text] !== undefined)
            continue;
        const app = appSystem.lookup_app(rows[i].text);
        const info = app ? app.get_app_info() : null;
        result[rows[i].text] = info ? info.get_startup_wm_class() : null;
    }
    return result;
};
const tile_excl_apply = (settings) => {
    tile_excl.rows = tile_excl_rows_normalize(settings.getValue('exclusions'));
    tile_excl.classes = tile_excl_app_classes(tile_excl.rows);
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
// The app picker combobox ("excludeAppPicker"): the dialog collects its options from
// the settings file when it opens, so the extension writes them via the official
// setOptions API at enable time and on AppSystem's installed-changed. Picking an app
// appends the exclusion row and resets the combobox; setValue alone would not fire
// the exclusions binding, so apply + retile run explicitly.
const tile_excl_app_populate = (settings) => {
    const apps = imports.gi.Cinnamon.AppSystem.get_default().get_all();
    const list = [];
    for (let i = 0; i < apps.length; i++) {
        const info = apps[i].get_app_info();
        if (!info || !info.should_show())
            continue;
        list.push({ id: apps[i].get_id(), name: apps[i].get_name() });
    }
    settings.setOptions('excludeAppPicker', tile_excl_app_options(list, _("Add application …")));
};
const tile_excl_app_picked = (settings, app, value) => {
    if (typeof value !== 'string' || value === 'picker')
        return;
    settings.setValue('exclusions', tile_excl_rows_append(settings.getValue('exclusions'), value));
    tile_excl_apply(settings);
    tile_excl_retile(app);
    settings.setValue('excludeAppPicker', 'picker');
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
const tile_collect_windows = (monitor, focusWindow, wsIndex = null) => {
    const tracker = imports.gi.Cinnamon.WindowTracker.get_default();
    let result = [];
    let tabList = wsIndex == null ? utils_Main.getTabList()
        : global.workspace_manager.get_workspace_by_index(wsIndex).list_windows();
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
const tile_sort_prune_overrides = (now) => {
    for (const [seq, o] of tile_sort_rect_override)
        if (now - o.at > TILE_SORT_OVERRIDE_MS)
            tile_sort_rect_override.delete(seq);
};
const tile_sort_reading_order = (windows, columnMajor) => {
    const now = GLib.get_monotonic_time() / 1000;
    tile_sort_prune_overrides(now);
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
// Movable borders (lib/model/split.js): a split the resize hotkeys have not written yet wins
// over the stored one; a stored split counts only when it fits the layout.
// tile_split_pending: key "mkey\nwskey\nn" -> { mkey, wskey, n, split }, written to the
// settings by tile_split_flush (500 ms after the last hotkey step, at once for the mouse).
const tile_split_pending = new Map();
const tile_split_flush_timer = { id: 0 };
const TILE_SPLIT_FLUSH_MS = 500;
const tile_split_ref = (app, monitorIndex, wsIndex, n) => {
    const mkey = app.monitors.keys[monitorIndex];
    if (!mkey)
        return null;
    const wskey = app.monitors.wsKey(monitorIndex, wsIndex);
    return { key: mkey + '\n' + wskey + '\n' + n, mkey: mkey, wskey: wskey, n: String(n) };
};
const tile_split_for = (app, monitorIndex, wsIndex, n, layout) => {
    const ref = tile_split_ref(app, monitorIndex, wsIndex, n);
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
// true when the monitor + workspace has stored (or pending) splits or dragged shapes —
// shows the reset button
const tile_split_any = (app, monitorIndex, wsIndex) => {
    const ref = tile_split_ref(app, monitorIndex, wsIndex, 0);
    if (!ref)
        return false;
    const prefix = ref.mkey + '\n' + ref.wskey + '\n';
    for (const key of tile_split_pending.keys()) {
        if (key.indexOf(prefix) === 0)
            return true;
    }
    const layouts = tile_layouts_parse(app.config.settings.getValue('layouts') || '');
    return Object.keys(tile_layouts_splits(layouts, ref.mkey, ref.wskey)).length > 0
        || Object.keys(tile_layouts_shapes(layouts, ref.mkey, ref.wskey)).length > 0;
};
const tile_split_reset = (app, monitorIndex, wsIndex) => {
    const ref = tile_split_ref(app, monitorIndex, wsIndex, 0);
    if (!ref)
        return;
    const prefix = ref.mkey + '\n' + ref.wskey + '\n';
    for (const key of Array.from(tile_split_pending.keys())) {
        if (key.indexOf(prefix) === 0)
            tile_split_pending.delete(key);
    }
    tile_layout_set(app, monitorIndex, wsIndex, { splits: null, shapes: null });
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
// The single-window option takes effect immediately: switching it on retiles every
// monitor and workspace where greenTile tiles (preset or auto), so lone windows fill
// at once. Switching it off just stops greenTile from touching lone windows again.
const tile_single_retile = (app) => {
    const monitors = utils_Main.layoutManager.monitors.length;
    const workspaces = global.workspace_manager.get_n_workspaces();
    for (let i = 0; i < monitors; i++) {
        for (let ws = 0; ws < workspaces; ws++) {
            const layout = tile_layout_for(app, i, ws);
            if (layout.preset || layout.auto)
                tile_retile_monitor(app, i, null, true, ws);
        }
    }
};
const tile_app_auto = (app, monitorIndex, focusWindow, animate = true, wsIndex = null) => {
    const monitor = utils_Main.layoutManager.monitors[monitorIndex];
    if (!monitor)
        return;
    const ws = wsIndex != null ? wsIndex : global.workspace_manager.get_active_workspace().index();
    const area = getUsableScreenArea(monitor);
    let windows = tile_collect_windows(monitor, focusWindow, ws);
    tile_debug_count(monitor, focusWindow, windows);
    const focused = focusWindow && !focusWindow.minimized && focusWindow.get_monitor() === monitorIndex
        && !tile_excl_is_excluded(focusWindow);
    let n = windows.length + (focused ? 1 : 0);
    if (n < 2 && !tile_single_fill(app.config.settings.getValue('fillSingleWindow'), n))
        return;
    // New windows (opened while automatic tiling is on) append at the end — their spawn
    // position is meaningless for the reading order. Cleared after each tiling.
    let pending = tile_auto.pending.get(monitorIndex) || new Set();
    tile_auto.pending.set(monitorIndex, new Set());
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
    const ordered = tile_sort_reading_order((focused ? [focusWindow] : []).concat(settled), columnMajor)
        .concat(tile_sort_reading_order(fresh, columnMajor));
    tile_place_rects(app, ordered, layout, tile_split_for(app, monitorIndex, ws, n, layout), area, animate);
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
        if (!app.monitors.ready || !utils_Main.layoutManager.monitors[monitorIndex])
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
    // no retile follows auto off — the border has no geometry event to hide it,
    // so refresh right here (tile_border_update is defined later in the file but
    // is only ever CALLED at runtime)
    tile_border_update();
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
    tile_drop_begin(app, w, op);
    tile_auto.grabMonitor.set(w.get_stable_sequence(), w.get_monitor());
};
// Edge resize of a tiled window (mouse or window menu): the moved edges become the new
// borders of the layout (lib/model/split.js), stored for this monitor, workspace and window
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
    const ref = tile_split_ref(app, monitorIndex, wsIndex, n);
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
    const ref = tile_split_ref(app, monitorIndex, wsIndex, n);
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
    if (tile_drop_end(app, w, op))
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
    tile_disconnect_each(tile_auto.workspaceSignals);
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
    if (app.session.settle.started)
        app.session.settle.start(app);
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
    tile_drop_stop();
    tile_sort_rect_override.clear();
    tile_excl.toggled.clear();
    tile_auto_disconnect_workspaces();
    tile_disconnect_each(tile_auto.signals);
    tile_auto.signals = [];
    for (const [w] of tile_auto.tracked.slice())
        tile_auto_untrack(w);
};

// Per-workspace preset tiling: rules by window count, stored in extension settings
// (survives spice reinstalls — settings live in ~/.config/cinnamon/spices).
// Preset = {"id","name","rules":[{"min":2,"stacks":[1,1]},...]}; assignment map
// wsIndex -> preset id. Rule choice: last rule with min <= window count.
const tile_presets_read = (app) => {
    try {
        const v = JSON.parse(app.config.settings.getValue('presets') || '[]');
        return Array.isArray(v) ? v : [];
    }
    catch (e) {
        return [];
    }
};
// Monitor registry: stable per-monitor keys and display labels — per-App
// component in lib/runtime/monitors.js, owned by the App (monitors-changed
// destroys the App), riding the DisplayConfig DBus call with the epoch guard and
// a cancellable. The fallback-logged flag rides the extension session.
const tile_Gio = imports.gi.Gio;
const tile_monitor_index_of = (metaWindow) => metaWindow.get_monitor();
const tile_focus_monitor_index = () => {
    const focusWindow = tile_focus_window();
    return focusWindow ? focusWindow.get_monitor() : utils_Main.layoutManager.primaryIndex;
};
const tile_layout_for = (app, monitorIndex, wsIndex) => {
    if (!app.monitors.ready || !app.monitors.keys[monitorIndex])
        return { preset: null, auto: false };
    const presets = tile_presets_read(app);
    const layouts = tile_layouts_parse(app.config.settings.getValue('layouts') || '');
    const entry = tile_layouts_entry(layouts, app.monitors.keys[monitorIndex], app.monitors.wsKey(monitorIndex, wsIndex), presets.map((p) => p.id));
    return {
        preset: entry.preset ? presets.find((p) => p.id === entry.preset) || null : null,
        auto: entry.auto,
    };
};
let tile_layouts_write_guard_logged = false;
const tile_layout_set = (app, monitorIndex, wsIndex, patch) => {
    if (!app.monitors.ready || !app.monitors.keys[monitorIndex])
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
    const next = tile_layouts_set(layouts, app.monitors.keys[monitorIndex], app.monitors.wsKey(monitorIndex, wsIndex), patch);
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
        const mkey = app.monitors.keys[primaryIndex] || '';
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
// Drag tracking for the zone split: while a tiled window is moved (mouse move grab),
// a 50 ms pointer poll shows a preview of the cell a drop would produce; on release
// over a zone of another tiled window the new layout is placed directly and stored
// as a shape (per monitor, workspace and window count). Cancel (Esc), release in the
// centre or outside tiled cells keeps today's snap-on-release behaviour.
const tile_drop = { timer: 0, actor: null, seq: null, from: null, start: null, w: null };
const tile_drop_stop = () => {
    if (tile_drop.timer) {
        tile_Mainloop.source_remove(tile_drop.timer);
        tile_drop.timer = 0;
    }
    if (tile_drop.actor) {
        tile_drop.actor.destroy();
        tile_drop.actor = null;
    }
    tile_drop.seq = null;
    tile_drop.from = null;
    tile_drop.start = null;
    tile_drop.w = null;
};
const tile_drop_begin = (app, w, op) => {
    if (op !== Meta.GrabOp.MOVING || tile_drop.seq !== null)
        return;
    if (w.get_workspace() !== global.workspace_manager.get_active_workspace())
        return;
    const monitorIndex = w.get_monitor();
    const monitor = utils_Main.layoutManager.monitors[monitorIndex];
    if (!monitor || tile_excl_is_excluded(w))
        return;
    const windows = tile_collect_windows(monitor, null);
    if (windows.indexOf(w) === -1)
        return;
    if (!tile_layout_shape(app, monitorIndex, windows.length))
        return;
    const f = w.get_frame_rect();
    tile_drop.seq = w.get_stable_sequence();
    tile_drop.from = monitorIndex;
    tile_drop.start = [f.x, f.y, f.width, f.height];
    tile_drop.w = w;
    const rgb = tile_accent_state.rgb;
    tile_drop.actor = new tile_St.Widget({ reactive: false, style: 'background-color: rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.25); border: 2px solid rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ');' });
    Main.uiGroup.add_child(tile_drop.actor);
    tile_drop.actor.hide();
    tile_drop.timer = tile_Mainloop.timeout_add(50, () => tile_drop_tick(app));
};
// Where a drop at (px, py) would land: the target cell of another tiled window and
// the zone, plus the new layout (lib/model/drop.js). null outside any zone. The target set
// holds all tiled windows of the pointer's monitor with A in it — dragged within its
// own monitor A keeps its reading-order place; from another monitor it is inserted
// fresh (from = -1) and the count there grows by one.
const tile_drop_target = (app, w, px, py, fromMonitor, startFrame) => {
    const monitors = utils_Main.layoutManager.monitors;
    let monitorIndex = -1;
    for (let i = 0; i < monitors.length; i++) {
        const m = monitors[i];
        if (px >= m.x && px < m.x + m.width && py >= m.y && py < m.y + m.height) {
            monitorIndex = i;
            break;
        }
    }
    if (monitorIndex === -1)
        return null;
    const monitor = monitors[monitorIndex];
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    const same = (fromMonitor != null ? fromMonitor : tile_drop.from) === monitorIndex;
    const others = tile_collect_windows(monitor, null, wsIndex).filter((t) => t !== w);
    const windows = same ? others.concat([w]) : others;
    const n = windows.length;
    if (n < (same ? 2 : 1))
        return null;
    const layout = tile_layout_shape(app, monitorIndex, n);
    if (!layout)
        return null;
    // Reading order from the grab-start geometry: A's frame follows the pointer, so
    // its live frame would shuffle the order the stored shape is keyed by.
    const rects = windows.map((t) => {
        if (t === w)
            return startFrame || tile_drop.start;
        const f = t.get_frame_rect();
        return [f.x, f.y, f.width, f.height];
    });
    const ordered = tile_sort_order(rects, layout.kind === 'cols').map((i) => windows[i]);
    const fromIndex = ordered.indexOf(w);
    const area = getUsableScreenArea(monitor);
    const cellRects = tile_split_rects(layout.kind, layout.shape, tile_split_for(app, monitorIndex, wsIndex, n, layout), area);
    let ci = -1;
    for (let i = 0; i < cellRects.length; i++) {
        const [cx, cy, cw, ch] = cellRects[i];
        if (px >= cx && px < cx + cw && py >= cy && py < cy + ch) {
            ci = i;
            break;
        }
    }
    if (ci === -1 || ci >= ordered.length)
        return null;
    // fromIndex -1: cross-monitor drop, A is appended fresh (tile_drop_layout).
    // On the own monitor A's index must exist and the target cell must not be A's.
    if (same && fromIndex === -1)
        return null;
    if (fromIndex === ci)
        return null;
    const zone = tile_drop_zone(cellRects[ci], px, py);
    if (!zone)
        return null;
    const next = zone === 'center' ? null : tile_drop_layout(layout.kind, layout.shape, fromIndex, ci, zone);
    if (next && !tile_drop_fits(next.kind, next.shape, area[2], area[3], tile_gap(app), TILE_SPLIT_MIN_PX))
        return null;
    return { monitorIndex: monitorIndex, n: n, layout: layout, ordered: ordered, fromIndex: fromIndex, toIndex: ci, zone: zone, next: next };
};
const tile_drop_tick = (app) => {
    if (tile_drop.seq === null || global.display.get_grab_op() === Meta.GrabOp.NONE) {
        tile_drop_stop();
        return false;
    }
    const p = global.get_pointer();
    const hit = tile_drop_target(app, tile_drop.w, p[0], p[1]);
    tile_drop.hit = hit;
    if (!hit || !hit.next) {
        tile_drop.actor.hide();
        return true;
    }
    const monitor = utils_Main.layoutManager.monitors[hit.monitorIndex];
    if (!monitor) {
        tile_drop_stop();
        return false;
    }
    const area = getUsableScreenArea(monitor);
    const rects = tile_split_rects(hit.next.kind, hit.next.shape, null, area);
    // A's cell in the new layout; a cross-monitor A sits at the end of the order
    const fresh = hit.ordered.length;
    const at = hit.next.order.indexOf(hit.fromIndex >= 0 ? hit.fromIndex : fresh);
    const cell = tile_gap_cell(rects[at], area, tile_gap(app));
    tile_drop.actor.set_position(cell[0], cell[1]);
    tile_drop.actor.set_size(cell[2], cell[3]);
    tile_drop.actor.show();
    return true;
};
// true = split applied, the grab-end handler must not run the usual snap.
const tile_drop_end = (app, w, op) => {
    if (tile_drop.seq === null)
        return false;
    const start = tile_drop.start;
    const fromMonitor = tile_drop.from;
    tile_drop_stop();
    if (op !== Meta.GrabOp.MOVING)
        return false;
    // Esc cancel (spike 2): Muffin put the frame back at the start rect.
    const f = w.get_frame_rect();
    if (start && Math.abs(f.x - start[0]) <= 2 && Math.abs(f.y - start[1]) <= 2)
        return false;
    const p = global.get_pointer();
    const hit = tile_drop_target(app, w, p[0], p[1], fromMonitor, start);
    if (!hit || !hit.next)
        return false;
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    const layouts = tile_layouts_parse(app.config.settings.getValue('layouts') || '');
    if (layouts === null)
        return false;
    const n = hit.next.order.length;
    const ref = tile_split_ref(app, hit.monitorIndex, wsIndex, n);
    if (!ref)
        return false;
    tile_split_pending.delete(ref.key);
    tile_layout_set(app, hit.monitorIndex, wsIndex, { shapes: { [ref.n]: { kind: hit.next.kind, shape: hit.next.shape } }, splits: { [ref.n]: null } });
    const monitor = utils_Main.layoutManager.monitors[hit.monitorIndex];
    const area = getUsableScreenArea(monitor);
    const orderedByNext = hit.next.order.map((i) => (i === hit.ordered.length ? w : hit.ordered[i]));
    tile_place_rects(app, orderedByNext, { kind: hit.next.kind, shape: hit.next.shape }, null, area, true);
    // Overrides from a recent resize/swap must not re-sort the freshly placed order.
    for (const t of orderedByNext)
        tile_sort_rect_override.delete(t.get_stable_sequence());
    if (fromMonitor !== hit.monitorIndex)
        tile_auto_schedule_monitor(app, fromMonitor, 250);
    global.log('greenTile drag split ws' + (wsIndex + 1) + ' mon=' + ref.mkey + ' n=' + n + ' ' + hit.next.kind + '=[' + hit.next.shape.join(',') + ']');
    return true;
};
// Layout greenTile tiles for n windows on this monitor and the given workspace: the
// preset rule filled to n (tile_fill_stacks), or the automatic grid — with a stored
// dragged shape (lib/model/drop.js) winning over both. null when nothing is tiled.
const tile_layout_shape_ws = (app, monitorIndex, wsIndex, n) => {
    const monitor = utils_Main.layoutManager.monitors[monitorIndex];
    const single = tile_single_fill(app.config.settings.getValue('fillSingleWindow'), n);
    if (!monitor || (n < 2 && !single))
        return null;
    const layoutState = tile_layout_for(app, monitorIndex, wsIndex);
    let base = null;
    if (layoutState.preset) {
        const rule = tile_rules_pick(layoutState.preset.rules, n);
        if (rule && rule.stacks && rule.stacks.length !== 0)
            base = { kind: 'cols', shape: tile_fill_stacks(rule.stacks, n), rule: rule, preset: layoutState.preset };
        else if (single)
            base = tile_single_layout;
        else
            return null;
    } else if (layoutState.auto) {
        base = tile_auto_shape(monitor, n);
    }
    if (!base)
        return null;
    // A dragged shape for this monitor + workspace + window count wins over the
    // preset rule / auto grid; corrupt layouts read as empty ({}), so nothing stored.
    const ref = tile_split_ref(app, monitorIndex, wsIndex, n);
    if (!ref)
        return base;
    const layouts = tile_layouts_parse(app.config.settings.getValue('layouts') || '');
    return tile_layout_resolve(base, tile_layouts_shapes(layouts, ref.mkey, ref.wskey)[ref.n], n);
};
// Layout for the active workspace.
const tile_layout_shape = (app, monitorIndex, n) => tile_layout_shape_ws(app, monitorIndex, global.workspace_manager.get_active_workspace().index(), n);
const tile_preset_retile = (app, monitorIndex, focusWindow, animate = true, wsIndex = null) => {
    const monitor = utils_Main.layoutManager.monitors[monitorIndex];
    if (!monitor)
        return;
    const ws = wsIndex != null ? wsIndex : global.workspace_manager.get_active_workspace().index();
    const preset = tile_layout_for(app, monitorIndex, ws).preset;
    if (!preset)
        return;
    const area = getUsableScreenArea(monitor);
    const windows = tile_collect_windows(monitor, focusWindow, ws);
    const focused = focusWindow && !focusWindow.minimized && focusWindow.get_monitor() === monitorIndex
        && !tile_excl_is_excluded(focusWindow);
    const n = windows.length + (focused ? 1 : 0);
    // the layout belongs to the workspace the windows were collected from, not the
    // active one (explicit wsIndex callers retile workspaces that are not active)
    const layout = tile_layout_shape_ws(app, monitorIndex, ws, n);
    if (!layout)
        return;
    const ordered = tile_sort_reading_order((focused ? [focusWindow] : []).concat(windows), layout.kind === 'cols');
    const split = tile_split_for(app, monitorIndex, ws, n, layout);
    tile_place_rects(app, ordered, layout, split, area, animate);
    if (animate)
        global.log('greenTile preset "' + preset.name + '" applied ws' + (ws + 1) + ' mon=' + (app.monitors.keys[monitorIndex] || '?') + ' n=' + n + ' stacks=[' + (layout.rule ? layout.rule.stacks.join(',') : '1') + ']' + (split ? ' split' : ''));
};
// Retiles exactly one monitor: preset layout when (monitor, workspace) has one, else
// the auto grid when automatic tiling is on. Monitors whose entry has automatic tiling
// off are left alone — hotkeys retile directly and do not come through here.
const tile_retile_monitor = (app, monitorIndex, focusWindow, animate = true, wsIndex = null) => {
    if (!app.monitors.ready || !utils_Main.layoutManager.monitors[monitorIndex])
        return;
    const ws = wsIndex != null ? wsIndex : global.workspace_manager.get_active_workspace().index();
    const layout = tile_layout_for(app, monitorIndex, ws);
    if (layout.preset)
        tile_preset_retile(app, monitorIndex, focusWindow, animate, ws);
    else if (layout.auto)
        tile_app_auto(app, monitorIndex, focusWindow, animate, ws)
};
// Super+Ctrl+Arrow hotkeys: swap the focused tiled window with its neighbor (both
// windows sort into each other's cell, then the monitor retiles), or — when nothing
// borders in the direction pressed — push it along the monitor chain onto the next
// monitor/workspace, where it lands in the edge slot (insert, not swap). Focus always
// stays on the moved window so repeated presses keep moving the same window.
const tile_swap_override = (metaWindow, rect) => {
    tile_sort_rect_override.set(metaWindow.get_stable_sequence(), { rect: rect, at: GLib.get_monotonic_time() / 1000 });
};
const tile_swap_hotkey = (app, dir) => {
    const focusWindow = tile_focus_window();
    if (!focusWindow || focusWindow.minimized || focusWindow.is_on_all_workspaces() || tile_excl_is_excluded(focusWindow))
        return;
    const monitorIndex = focusWindow.get_monitor();
    const monitor = utils_Main.layoutManager.monitors[monitorIndex];
    if (!monitor || !app.monitors.ready)
        return;
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    const area = getUsableScreenArea(monitor);
    const frame = focusWindow.get_frame_rect();
    const frameRect = [frame.x, frame.y, frame.width, frame.height];
    const windows = tile_collect_windows(monitor, focusWindow);
    const n = windows.length + 1;
    const layout = tile_layout_shape(app, monitorIndex, n);
    let cells = null;
    let ordered = null;
    let selfIdx = -1;
    if (layout) {
        const split = tile_split_for(app, monitorIndex, wsIndex, n, layout);
        cells = tile_split_rects(layout.kind, layout.shape, split, area);
        ordered = tile_sort_reading_order([focusWindow].concat(windows), layout.kind === 'cols');
        selfIdx = ordered.indexOf(focusWindow);
    }
    if (layout && selfIdx >= 0) {
        const nb = tile_swap_neighbor(cells, selfIdx, dir);
        if (nb != null) {
            tile_swap_override(focusWindow, cells[nb]);
            tile_swap_override(ordered[nb], cells[selfIdx]);
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
        primaryIndex: utils_Main.layoutManager.primaryIndex,
        onlyPrimary: app.monitors.onlyPrimary(),
        monitors: utils_Main.layoutManager.monitors.map((m, i) => ({ index: i, x: m.x, width: m.width })),
        workspaces: global.screen.get_n_workspaces(),
        wsIndex: wsIndex,
    });
    if (!step)
        return;
    const targetMonitor = utils_Main.layoutManager.monitors[step.monitor];
    if (!targetMonitor)
        return;
    // On a target monitor without active tiling the window lands untiled (move only,
    // size kept): no slot is computed and no retile is triggered on the target.
    if (step.kind === 'monitor') {
        const nTarget = tile_collect_windows(targetMonitor, null).length + 1;
        const targetLayout = tile_layout_shape(app, step.monitor, nTarget);
        if (targetLayout) {
            const targetSplit = tile_split_for(app, step.monitor, wsIndex, nTarget, targetLayout);
            const targetCells = tile_split_rects(targetLayout.kind, targetLayout.shape, targetSplit, getUsableScreenArea(targetMonitor));
            const slotIdx = tile_swap_landing_cell(targetCells, frameRect, step.slot === 'first' ? 'right' : 'left');
            if (slotIdx != null)
                tile_swap_override(focusWindow, targetCells[slotIdx]);
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
    const nTarget = tile_collect_windows(targetMonitor, null, targetWsIndex).length + 1;
    // Muffin's signature is (index, append); Cinnamon's main.js passes a third time
    // argument that GJS drops with a "Too many arguments" warning.
    focusWindow.change_workspace_by_index(targetWsIndex, false);
    focusWindow.move_to_monitor(step.monitor);
    global.workspace_manager.get_workspace_by_index(targetWsIndex).activate_with_focus(focusWindow, global.get_current_time());
    const targetLayout = tile_layout_shape(app, step.monitor, nTarget);
    if (targetLayout) {
        const targetSplit = tile_split_for(app, step.monitor, targetWsIndex, nTarget, targetLayout);
        const targetCells = tile_split_rects(targetLayout.kind, targetLayout.shape, targetSplit, getUsableScreenArea(targetMonitor));
        const slotIdx = tile_swap_landing_cell(targetCells, frameRect, step.slot === 'first' ? 'right' : 'left');
        if (slotIdx != null)
            tile_swap_override(focusWindow, targetCells[slotIdx]);
    }
    tile_retile_monitor(app, step.monitor, focusWindow, true, targetWsIndex);
    tile_retile_monitor(app, monitorIndex, null, true, wsIndex);
    global.log('greenTile swap pushed mon=' + (app.monitors.keys[monitorIndex] || '?') + ' -> ws' + (targetWsIndex + 1) + ' mon=' + (app.monitors.keys[step.monitor] || '?'));
};
// >>> focus-runtime
// Super+Arrow moves the keyboard focus on monitor+workspaces where automatic tiling is
// on: the neighbouring tiled window in that direction is activated, nothing is moved or
// retiled. Cinnamon's own push-tile keybindings are taken over wholesale (the gsettings
// bindings stay in org.cinnamon.desktop.keybindings.wm, so rebinding push-tile keeps
// working). Wherever the tiling has nothing to say — other monitor/workspace states, a
// focused window greenTile does not manage (floating, excluded, dialog) — push_tile runs
// with the received window, the exact native behaviour. Left/right cross over to the
// adjacent monitor at the edge (no wrap); up/down never leave the monitor or workspace.
// (In-layout neighbour: tile_swap_neighbor in lib/model/swap.js — same cells, same semantics.)
const tile_focus_motion = (dir) => ({
    left: Meta.MotionDirection.LEFT,
    right: Meta.MotionDirection.RIGHT,
    up: Meta.MotionDirection.UP,
    down: Meta.MotionDirection.DOWN,
}[dir]);
const tile_focus_push_native = (window, dir) => {
    global.display.push_tile(window, tile_focus_motion(dir));
};
const tile_focus_hotkey = (app, dir) => (display, window) => {
    if (!window)
        return; // native has no window to push either
    if (window.minimized || window.is_on_all_workspaces() || tile_excl_is_excluded(window)) {
        tile_focus_push_native(window, dir);
        return;
    }
    const monitorIndex = window.get_monitor();
    const monitor = utils_Main.layoutManager.monitors[monitorIndex];
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    if (!monitor || !app.monitors.ready || !tile_layout_for(app, monitorIndex, wsIndex).auto) {
        tile_focus_push_native(window, dir);
        return;
    }
    // The focus window sits in the cell the current layout gives it; the neighbour is
    // whatever the tiling would place next to it in that direction.
    const windows = tile_collect_windows(monitor, null, wsIndex);
    let cells = null;
    let ordered = null;
    const n = windows.length;
    const layout = n ? tile_layout_shape(app, monitorIndex, n) : null;
    if (layout) {
        const split = tile_split_for(app, monitorIndex, wsIndex, n, layout);
        cells = tile_split_rects(layout.kind, layout.shape, split, getUsableScreenArea(monitor));
        ordered = tile_sort_reading_order(windows, layout.kind === 'cols');
        const selfIdx = ordered.indexOf(window);
        // a tiling-managed focus window is one of the collected ones; anything else
        // (floating, dialog accidentally focused) keeps the native key behaviour.
        // A cell/window mismatch is a corrupt state — native as well.
        if (selfIdx < 0 || cells.length !== n) {
            tile_focus_push_native(window, dir);
            return;
        }
        const nb = tile_swap_neighbor(cells, selfIdx, dir);
        if (nb != null) {
            ordered[nb].activate(global.get_current_time());
            tile_border_flash(ordered[nb]);
            return;
        }
    }
    if (dir === 'left' || dir === 'right') {
        const step = tile_focus_monitor_step({
            dir: dir,
            monitorIndex: monitorIndex,
            monitors: utils_Main.layoutManager.monitors.map((m, i) => ({ index: i, x: m.x })),
        });
        if (step != null) {
            const frame = window.get_frame_rect();
            const cands = tile_collect_windows(utils_Main.layoutManager.monitors[step], null, wsIndex).map((w, i) => {
                const r = w.get_frame_rect();
                return { index: i, x: r.x, y: r.y, width: r.width, height: r.height, w: w };
            });
            const pick = tile_focus_monitor_pick(cands, dir, { x: frame.x, y: frame.y, width: frame.width, height: frame.height });
            if (pick != null) {
                cands[pick].w.activate(global.get_current_time());
                tile_border_flash(cands[pick].w);
                return;
            }
        }
    }
};
// Registered once per enable cycle; null restores muffin's own handlers (verified:
// Super+Arrow tiles natively again after that).
const tile_focus_binding_names = ['push-tile-left', 'push-tile-right', 'push-tile-up', 'push-tile-down'];
const tile_focus_connect = (app) => {
    for (const name of tile_focus_binding_names)
        Meta.keybindings_set_custom_handler(name, tile_focus_hotkey(app, name.slice('push-tile-'.length)));
};
const tile_focus_disconnect = () => {
    for (const name of tile_focus_binding_names)
        Meta.keybindings_set_custom_handler(name, null);
};
// <<< focus-runtime
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
// Cairo can't read the stylesheet: tile_accent_state (updated by
// tile_theme_changed before any panel exists) supplies the accent here.
const tile_editor_accent = () => tile_accent_state.rgb;
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
const tile_presets_delete = (app) => {
    const d = tile_panel.draft;
    if (!d)
        return;
    tile_presets_write(app, tile_editor_delete_preset(tile_presets_read(app), d.id));
    const layouts = tile_layouts_parse(app.config.settings.getValue('layouts') || '');
    // Corrupt layouts stay untouched until the setting is fixed, like tile_layout_set,
    // which logs the same condition only once.
    if (layouts === null) {
        if (!tile_layouts_write_guard_logged) {
            tile_layouts_write_guard_logged = true;
            global.log('greenTile layouts setting is corrupt, deleting preset without layout cleanup');
        }
    }
    else
        app.config.settings.setValue('layouts', JSON.stringify(tile_layouts_remove_preset(layouts, d.id)));
    global.log('greenTile preset "' + (d.name || d.id) + '" deleted');
    tile_editor_back(app);
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
    box.add(tile_panel_thumb(rule.stacks, { width: 34, height: 18, gap: 2, vgap: 1, radius: 1, color: active ? tile_editor_accent() : tile_theme_cairo_get('thumb') }), tile_panel_middle());
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
        const accent = tile_editor_accent();
        const gap = 3;
        const cw = (W - gap * (tile_editor_cols - 1)) / tile_editor_cols;
        for (let c = 0; c < tile_editor_cols; c++) {
            const x = c * (cw + gap);
            if (c < stacks.length) {
                cr.setSourceRGBA(accent[0] / 255, accent[1] / 255, accent[2] / 255, 0.85);
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
    const delWrap = new tile_St.BoxLayout();
    const presetDelBtn = new tile_St.Button({ label: '🗑 ' + _("Delete preset"), style_class: 'gk-preset-del', track_hover: true });
    delWrap.add(presetDelBtn);
    const confirmWrap = new tile_St.BoxLayout({ style_class: 'gk-preset-del-row' });
    confirmWrap.add(new tile_St.Label({ text: _("Really delete?"), style_class: 'gk-preset-del-question' }), middle);
    const confirmBtn = new tile_St.Button({ label: _("Delete"), style_class: 'gk-preset-del', track_hover: true });
    confirmWrap.add(confirmBtn, middle);
    const cancelBtn = new tile_St.Button({ label: '✕', style_class: 'gk-preset-del-cancel', track_hover: true });
    confirmWrap.add(cancelBtn, middle);
    const save = new tile_St.Button({ label: _("Save"), style_class: 'gk-save', track_hover: true });
    const error = new tile_St.Label({ text: '', style_class: 'gk-error' });
    // A new, never-saved preset has nothing persistent to delete; Back/Esc is its discard.
    // Save sits left, the destructive delete at the outer right; the expanding error
    // label keeps the two apart.
    saveRow.add(save, middle);
    saveRow.add(error, { expand: true, x_fill: true, y_fill: false, y_align: tile_St.Align.MIDDLE });
    if (!tile_panel.draft.isNew) {
        saveRow.add(delWrap, middle);
        saveRow.add(confirmWrap, middle);
    }
    right.add(saveRow);
    confirmWrap.hide();
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
    presetDelBtn.connect('clicked', () => {
        delWrap.hide();
        confirmWrap.show();
    });
    cancelBtn.connect('clicked', () => {
        confirmWrap.hide();
        delWrap.show();
    });
    confirmBtn.connect('clicked', () => tile_presets_delete(app));
    refresh();
    return { actor: body, entry, painter: painter.area };
};
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
const tile_theme_panel_class = () => (tile_theme_state.theme === 'light' ? 'gk-panel gk-light' : 'gk-panel')
    + (tile_accent_state.gen ? ' ' + tile_accent_state.gen : '');
// Accent + state runtime: resolves theme-probed vs. custom colors, writes the
// generated stylesheet — one sheet carrying the accent AND state rules — into
// the user cache dir and loads/unloads it on the current St.Theme — the same
// mechanism Cinnamon uses for extension stylesheets, so hover/focus
// pseudo-classes keep working and an open panel restyles at once.
// Re-load hooks into 'theme-set' because every Cinnamon theme switch replaces
// the whole St.Theme object.
// gen: Cinnamon's St keeps its interned theme nodes across load_stylesheet /
// unload_stylesheet, so a rebuilt panel would get the node computed with the OLD
// sheet (verified live: rebuilt "+ New preset" kept the previous accent). Every
// load therefore gives the panel root a fresh class 'gk-acc<n>'; all descendants
// get new node keys and are matched against the current sheets. Seeded with the
// clock so it never meets nodes left over from an earlier enable.
const tile_accent_state = { rgb: tile_accent_default, css: '', path: null, themeObj: null, themeSig: 0, gen: '', genSeq: Date.now() };
const tile_accent_probe = (className, pseudoClass) => {
    let probe = null;
    try {
        probe = new tile_St.BoxLayout({ style_class: className, opacity: 0 });
        probe.add_style_pseudo_class(pseudoClass);
        Main.uiGroup.add_child(probe);
        const c = probe.get_theme_node().get_background_color();
        return tile_accent_from_probed(c.red, c.green, c.blue, c.alpha);
    } catch (e) {
        return null;
    } finally {
        if (probe)
            probe.destroy();
    }
};
const tile_accent_load = (theme, path) => {
    try {
        theme.load_stylesheet(path);
        tile_accent_state.themeObj = theme;
        tile_accent_state.gen = 'gk-acc' + (++tile_accent_state.genSeq);
    } catch (e) {
        global.logError('greenTile: accent stylesheet: ' + e);
    }
};
const tile_accent_unload = () => {
    if (!tile_accent_state.themeObj)
        return;
    try {
        tile_accent_state.themeObj.unload_stylesheet(tile_accent_state.path);
    } catch (e) {
        // the old theme object is already gone after a Cinnamon theme switch
    }
    tile_accent_state.themeObj = null;
};
const tile_accent_path = () => {
    if (!tile_accent_state.path)
        tile_accent_state.path = GLib.build_filenamev([GLib.get_user_cache_dir(), 'greenTile@carsteneu', 'panel-accent.css']);
    return tile_accent_state.path;
};
const tile_accent_apply = (config) => {
    const own = tile_accent_is_own(config.settings.getValue('accentMode'));
    const stateMode = tile_state_mode(config.settings.getValue('stateMode'));
    // the probe chain serves both "Follow theme" modes — accent, state color
    // or both (first theme node with a usable accent wins, see accent-model)
    const probe = (!own || stateMode === 'theme') ? tile_accent_probe_first(tile_accent_probe) : null;
    const rgb = own ? tile_accent_parse(config.settings.getValue('accentColor')) : probe;
    const stateRgb = stateMode === 'own'
        ? tile_accent_parse(config.settings.getValue('stateColor'))
        : (stateMode === 'theme' ? probe : null);
    const base = rgb || tile_accent_default;
    const stateBase = stateRgb || tile_state_default;
    // one sheet, one load: accent and state rules ride on the same generated file,
    // so ANY color change goes through the css comparison below and bumps the
    // root class again (a state-only change must reload too)
    const css = tile_accent_css(tile_accent_tones(base)) + '\n' + tile_state_css(tile_state_tones(stateBase));
    const path = tile_accent_path();
    if (css !== tile_accent_state.css) {
        GLib.mkdir_with_parents(GLib.path_get_dirname(path), 0o700);
        GLib.file_set_contents(path, css);
        tile_accent_state.css = css;
        tile_accent_unload();
    }
    // set only after a successful persist: a failed write keeps painter and CSS
    // in the SAME (old) color instead of two different ones
    tile_accent_state.rgb = base;
    tile_accent_state.stateRgb = stateBase;
    const theme = tile_St.ThemeContext.get_for_stage(global.stage).get_theme();
    if (tile_accent_state.themeObj && tile_accent_state.themeObj !== theme)
        tile_accent_unload();
    if (!tile_accent_state.themeObj)
        tile_accent_load(theme, path);
    // the focus border is the same color live: a state/theme switch repaints it here
    tile_border_restyle();
};
const tile_theme_changed = () => {
    const config = tile_theme_state.config;
    if (!config)
        return;
    tile_theme_state.theme = tile_theme_resolve(
        config.settings.getValue('panelTheme'),
        tile_theme_state.portal ? tile_theme_state.portal.get_string('color-scheme') : null,
        tile_theme_state.cinnamon ? tile_theme_state.cinnamon.get_string('name') : null
    );
    try {
        tile_accent_apply(config);
    } catch (e) {
        // a failing accent (unusable probe, unwritable file) keeps the old look
        global.logError('greenTile: accent color: ' + e);
    }
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
    if (tile_accent_state.themeSig === 0) {
        // Cinnamon theme switch: loadTheme replaced the St.Theme object — the accent
        // sheet is re-applied and the theme accent re-probed on top of the new theme
        // (synchronously, inside tile_theme_changed).
        tile_accent_state.themeSig = Main.themeManager.connect('theme-set', tile_theme_changed);
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
    if (tile_accent_state.themeSig) {
        try {
            Main.themeManager.disconnect(tile_accent_state.themeSig);
        } catch (e) {
            // signal was already gone
        }
        tile_accent_state.themeSig = 0;
    }
    // the panel is closed here; the accent sheet comes off the theme with it
    tile_accent_unload();
    tile_theme_state.config = null;
};
// >>> focus-border
// A thin border around the newly focused tiled window in the state color, shown for
// three seconds after a Super+Arrow focus move — pure keyboard feedback, never shown
// for mouse or Alt+Tab focus changes. Only on monitor+workspaces with automatic tiling
// on, only for windows the tiling manages; hidden while the window is minimized,
// maximized or fullscreen, the moment focus moves elsewhere, and when the border
// setting is off. One non-reactive actor in the overlay group follows the flashed
// window's geometry; the color updates live with the theme settings
// (tile_accent_apply stores the resolved state rgb).
const tile_border_state = { app: null, actor: null, flashWin: null, winSig: [], sig: [], timer: 0 };
const TILE_BORDER_WIDTH = 3;
const TILE_BORDER_TIMEOUT_MS = 3000;
const tile_border_style = () => {
    const c = tile_accent_state.stateRgb || tile_state_default;
    return 'border: ' + TILE_BORDER_WIDTH + 'px solid rgb(' + Math.round(c[0]) + ', ' + Math.round(c[1]) + ', ' + Math.round(c[2]) + '); background-color: transparent;';
};
// the border is keyboard feedback, not a decoration: only the Super+Arrow focus move
// shows it (tile_border_flash), it switches itself off after a few seconds and any
// event that makes the flashed window focusless or unmanaged hides it again
const tile_border_arm_timer = () => {
    if (tile_border_state.timer)
        GLib.Source.remove(tile_border_state.timer);
    tile_border_state.timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TILE_BORDER_TIMEOUT_MS, () => {
        tile_border_state.timer = 0;
        tile_border_state.flashWin = null;
        if (tile_border_state.actor)
            tile_border_state.actor.hide();
        return GLib.SOURCE_REMOVE;
    });
};
const tile_border_unbind_flash = () => {
    for (const w of tile_border_state.winSig) {
        try {
            w.win.disconnect(w.id);
        } catch (e) {}
    }
    tile_border_state.winSig = [];
};
const tile_border_rebind_flash = () => {
    tile_border_unbind_flash();
    const win = tile_border_state.flashWin;
    if (win) {
        tile_border_state.winSig.push({ win, id: win.connect('position-changed', tile_border_update) });
        tile_border_state.winSig.push({ win, id: win.connect('size-changed', tile_border_update) });
    }
};
const tile_border_setting_on = (app) => app.config.settings.getValue('focusBorder') !== false;
const tile_border_frame = (app, win) => {
    if (win.minimized || win.is_on_all_workspaces()
        || win.get_window_type() !== Meta.WindowType.NORMAL || tile_excl_is_excluded(win))
        return null;
    const monitorIndex = win.get_monitor();
    const monitor = utils_Main.layoutManager.monitors[monitorIndex];
    if (!monitor || !app.monitors.ready)
        return null;
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    if (!tile_layout_for(app, monitorIndex, wsIndex).auto)
        return null;
    if (win.get_maximized() || win.is_fullscreen())
        return null;
    // invisible to the tiling = invisible to the border (floating, excluded, dialog)
    return tile_collect_windows(monitor, null, wsIndex).includes(win) ? win.get_frame_rect() : null;
};
const tile_border_update = () => {
    const app = tile_border_state.app;
    // app.config is missing while the Config constructor is still running: the
    // settings binding fires before the border (and everything else) is set up
    if (!app || !app.config || !tile_border_state.actor)
        return;
    const win = tile_border_state.flashWin;
    const focus = global.display.focus_window;
    // the border belongs to the keyboard-driven focus move only: a focus change to
    // another window (mouse click, Alt+Tab, an app demanding attention) clears it
    if (!win || focus !== win) {
        tile_border_unbind_flash();
        tile_border_state.flashWin = null;
        tile_border_state.actor.hide();
        return;
    }
    const frame = tile_border_setting_on(app) ? tile_border_frame(app, win) : null;
    const actor = tile_border_state.actor;
    if (!frame) {
        actor.hide();
        return;
    }
    actor.set_style(tile_border_style());
    actor.set_position(Math.round(frame.x), Math.round(frame.y));
    actor.set_size(Math.round(frame.width), Math.round(frame.height));
    actor.raise_top();
    actor.show();
    tile_border_arm_timer();
};
// called from the focus hotkey only — this is what makes the border keyboard feedback
const tile_border_flash = (win) => {
    tile_border_state.flashWin = win;
    tile_border_rebind_flash();
    tile_border_update();
};
const tile_border_restyle = () => {
    if (tile_border_state.actor)
        tile_border_state.actor.set_style(tile_border_style());
};
const tile_border_init = (app) => {
    tile_border_state.app = app;
    // runs after tile_theme_init in the Config constructor, so stateRgb is resolved
    // already and the first style is the real state color, not the default green
    if (!tile_border_state.actor) {
        tile_border_state.actor = new tile_St.Bin({ reactive: false, style: tile_border_style() });
        global.overlay_group.add_actor(tile_border_state.actor);
        tile_border_state.actor.hide();
        tile_border_state.sig.push({ obj: global.display, id: global.display.connect('notify::focus-window', tile_border_update) });
        tile_border_state.sig.push({ obj: global.workspace_manager, id: global.workspace_manager.connect('workspace-switched', tile_border_update) });
    }
    tile_border_update();
};
const tile_border_shutdown = () => {
    if (tile_border_state.timer) {
        GLib.Source.remove(tile_border_state.timer);
        tile_border_state.timer = 0;
    }
    for (const s of tile_border_state.sig) {
        try {
            s.obj.disconnect(s.id);
        } catch (e) {}
    }
    tile_border_state.sig = [];
    tile_border_unbind_flash();
    tile_border_state.flashWin = null;
    tile_border_state.app = null;
    if (tile_border_state.actor) {
        tile_border_state.actor.destroy();
        tile_border_state.actor = null;
    }
};
// <<< focus-border
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
    // "Reset sizes": only when borders were moved on this monitor + workspace (lib/model/split.js);
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
    let titleText = _("Presets — workspace %d · %s").format(wsIndex + 1, app.monitors.labels[monitorIndex] || '');
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
    // The list follows the desktop: a workspace switch re-renders it (title,
    // assignment, thumbnail window count). The editor is never rebuilt by these
    // signals, it would lose the draft.
    // Meta.WorkspaceManager emits "workspace-switched" (windowManager.js:435).
    // A rebuild during an active drag would kill the grab, so it is skipped then.
    const onWorkspaceSwitched = () => {
        if (tile_panel.view === 'editor')
            return;
        if (tile_panel.dragging)
            global.log('greenTile rebuild suppressed (drag)');
        else
            tile_panel_rebuild(app);
    };
    tile_panel.sig.push({ obj: global.workspace_manager, id: global.workspace_manager.connect('workspace-switched', onWorkspaceSwitched) });
    // Clicking outside closes the panel, in both views, without a grab: the click
    // still acts on whatever it hit. Chrome surfaces (Cinnamon's panels, menus,
    // other extensions' overlays) deliver Clutter events — close when the pressed
    // actor is not the panel or one of its children. This needs the CAPTURE phase:
    // applet buttons handle their button presses with EVENT_STOP, so a plain
    // stage button-press listener never sees them; captured-event passes every
    // event on its way down, before the actor under the pointer. With the editor's
    // modal active the stage input is FULLSCREEN (main.js pushModal), so EVERY
    // outside click arrives here; in list mode clicks on windows and the desktop
    // go to the clients instead — they close the panel through the focus change
    // below.
    tile_panel.sig.push({
        obj: global.stage,
        id: global.stage.connect('captured-event', (stage, event) => {
            if (event.type() !== tile_Clutter.EventType.BUTTON_PRESS)
                return tile_Clutter.EVENT_PROPAGATE;
            if (tile_panel.dragging)
                return tile_Clutter.EVENT_PROPAGATE;
            const src = event.get_source();
            if (src && tile_panel.actor && tile_panel.actor.contains(src))
                return tile_Clutter.EVENT_PROPAGATE;
            global.log('greenTile panel closed by outside click');
            tile_panel_close();
            return tile_Clutter.EVENT_PROPAGATE;
        }),
    });
    // A click into a window or on the desktop (Nemo) never becomes a stage event
    // in list mode, but it changes the focus: that closes the panel too, the
    // editor included (its draft is dropped, as with Esc and Back). Any other
    // focus change — a window opening, an app demanding attention — closes it as
    // well; that is the price of the passive approach. Suppressed during a drag,
    // which would otherwise lose its grab.
    tile_panel.sig.push({
        obj: global.display,
        id: global.display.connect('notify::focus-window', () => {
            if (tile_panel.dragging) {
                global.log('greenTile close suppressed (drag)');
                return;
            }
            global.log('greenTile panel closed by focus change');
            tile_panel_close();
        }),
    });
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
    constructor(platform, session, cinnamon) {
        this.platform = platform;
        this.session = session;
        this.monitors = new Monitors({
            main: cinnamon.main,
            gio: cinnamon.gio,
            meta: cinnamon.meta,
            global: cinnamon.global,
            session: session,
        });
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

const platform = {
    move_resize_window: move_resize_window,
    reset_window: reset_window,
};
const init = () => {};
const enable = function () {
    // One extension session per enable(): it outlives every App recreation and
    // carries the state that must survive them (settle wait, fallback-logged
    // flag, the monitors-changed handler on its own scope). Cinnamon calls
    // extension.js's exports member-style (extensionSystem.js) and extension.js
    // forwards as gtile.enable()/gtile.disable() member calls — so `this` is
    // the exports object and the session rides it, no module-level state left.
    this.session = new Session({
        signalManager: new tile_SignalManager(),
        layoutManager: Main.layoutManager,
        mainloop: tile_Mainloop,
        gobject: imports.gi.GObject,
        now: Date.now,
        log: (msg) => global.log(msg),
        onSettled: (app) => tile_auto_schedule_all(app, 0),
        createApp: (session) => new App(platform, session, {
            main: utils_Main,
            gio: tile_Gio,
            meta: utils_Meta,
            global: global,
        }),
    });
    this.session.start();
};
const disable = function () {
        // greenTile fix: gTile 2.2.1 left this disconnect commented out. Every
        // disable/enable cycle then kept a handler bound to the OLD module, and each
        // monitor change resurrected a complete old App (hotkeys and tiling
        // observers included) per stale handler: duplicate retiles, zombie bindings.
        // The release rides the session scope: Session.destroy() takes the
        // monitors-changed handler down FIRST, then the App dies — the zombie
        // path stays closed even when app.destroy() throws.
    if (this.session) {
        this.session.destroy();
        this.session = null;
    }
};

module.exports = { init, enable, disable };

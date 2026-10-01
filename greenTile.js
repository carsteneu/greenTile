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
const { TILE_GAP_MAX, TILE_GAP_STEP, tile_gap_value, tile_gap_cell } = require('./lib/model/gap');
const { tile_single_fill, tile_single_layout } = require('./lib/model/single');
const { tile_disconnect_each } = require('./lib/model/teardown');
const { tile_fill_stacks, tile_auto_rows, tile_auto_narrow_stacks } = require('./lib/model/fill');
const { TILE_SPLIT_MIN_PX, tile_split_valid, tile_split_rects, tile_split_cell_at, tile_split_border_pos, tile_split_move, tile_split_key_target, tile_split_accel, tile_split_op_edges, tile_split_frame_edges, tile_sort_order } = require('./lib/model/split');
const { tile_drop_zone, tile_drop_layout, tile_drop_fits } = require('./lib/model/drop');
const { tile_layouts_parse, tile_layouts_entry, tile_layouts_splits, tile_layouts_shapes, tile_layouts_set, tile_layouts_remove_preset, tile_layouts_migrate, tile_layout_resolve } = require('./lib/model/layouts');
const { Split } = require('./lib/runtime/split');
const { Drop } = require('./lib/runtime/drop');
const { Theme } = require('./lib/runtime/theme');
const { Border } = require('./lib/runtime/border');
const { Focus } = require('./lib/runtime/focus');
const { tile_swap_neighbor, tile_swap_landing_cell, tile_swap_chain_step } = require('./lib/model/swap');
const { tile_focus_monitor_step, tile_focus_monitor_pick } = require('./lib/model/focus');
const { tile_editor_cols, tile_editor_rows, tile_editor_min_floor, tile_editor_clamp, tile_editor_paint, tile_editor_paint_range, tile_editor_remove, tile_editor_sort, tile_editor_add_rule, tile_editor_delete_rule, tile_editor_step_min, tile_editor_validate, tile_editor_new_id, tile_editor_commit, tile_editor_delete_preset } = require('./lib/model/editor');
const { TILE_PANEL_MIN, tile_panel_size_parse, tile_panel_size_set, tile_panel_size_clamp } = require('./lib/model/panel-size');
const { tile_theme_toggle_target } = require('./lib/model/theme');
const { Session } = require('./lib/runtime/session');
const { Monitors } = require('./lib/runtime/monitors');
const { Auto } = require('./lib/runtime/auto');
const { Hotkeys, PANEL_ESC_NAME } = require('./lib/runtime/hotkeys');
const { Exclusions } = require('./lib/runtime/exclusions');
const { PanelState } = require('./lib/runtime/panel-state');

;// CONCATENATED MODULE: ../base/config.ts

const Settings = imports.ui.settings;
const Main = imports.ui.main;
const Tooltips = imports.ui.tooltips;
const tile_SignalManager = imports.misc.signalManager.SignalManager;
class Config {
    constructor(app) {
        // The hotkeys component carries the fixed greenTile binding names: register
        // removes every name first, so a binding change re-registers exactly once.
        this.EnableHotkey = () => {
            this.app.hotkeys.register([
                { name: 'greenTile-auto6', bindings: this.autotile6Hotkey, callback: () => tile_app_columns(this.app, 6) },
                { name: 'greenTile-auto3', bindings: this.autotile3Hotkey, callback: () => tile_app_columns(this.app, 3) },
                { name: 'greenTile-autoN', bindings: this.autotileAutoHotkey, callback: () => this.app.auto.activate(this.app) },
                { name: 'greenTile-autoOff', bindings: this.autotileOffHotkey, callback: () => this.app.auto.deactivate(this.app) },
                { name: 'greenTile-preset', bindings: this.presetHotkey, callback: () => tile_panel_toggle(this.app) },
                { name: 'greenTile-exclude', bindings: this.excludeHotkey, callback: () => this.app.excl.toggleFocused(this.app) },
                { name: 'greenTile-resize-wider', bindings: this.resizeWiderHotkey, callback: () => this.app.split.hotkey(this.app, 'wider') },
                { name: 'greenTile-resize-narrower', bindings: this.resizeNarrowerHotkey, callback: () => this.app.split.hotkey(this.app, 'narrower') },
                { name: 'greenTile-resize-taller', bindings: this.resizeTallerHotkey, callback: () => this.app.split.hotkey(this.app, 'taller') },
                { name: 'greenTile-resize-shorter', bindings: this.resizeShorterHotkey, callback: () => this.app.split.hotkey(this.app, 'shorter') },
                { name: 'greenTile-swap-left', bindings: this.swapLeftHotkey, callback: () => tile_swap_hotkey(this.app, 'left') },
                { name: 'greenTile-swap-right', bindings: this.swapRightHotkey, callback: () => tile_swap_hotkey(this.app, 'right') },
                { name: 'greenTile-swap-up', bindings: this.swapUpHotkey, callback: () => tile_swap_hotkey(this.app, 'up') },
                { name: 'greenTile-swap-down', bindings: this.swapDownHotkey, callback: () => tile_swap_hotkey(this.app, 'down') },
            ]);
        };
        this.DisableHotkey = () => {
            this.app.hotkeys.remove();
        };
        this.destroy = () => {
            this.DisableHotkey();
            this.app.excl.destroy();
            // resize hotkey steps not yet written (500 ms debounce) must not get lost
            this.app.split.flush(this.app);
            this.app.monitors.destroy();
            this.app.auto.destroy();
            // both stay teardown-only: they remove timers/actors, they must not
            // write settings (finalize happens below)
            this.app.split.destroy();
            this.app.drop.destroy();
            // The settle wait lives on the session, not on this App: its timer dies
            // with the App, its start time survives while a change is pending.
            this.app.session.settle.teardown();
            this.app.panel.close();
            this.app.theme.destroy();
            this.app.focus.destroy();
            this.app.border.destroy();
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
            this.app.excl.apply(this.settings);
            tile_excl_retile(this.app);
        }, null);
        this.settings.bind('excludeAppPicker', 'excludeAppPickerValue', () => {
            this.app.excl.picked(this.settings, this.app, this.settings.getValue('excludeAppPicker'));
        }, null);
        this.settings.bind('resizeWiderHotkey', 'resizeWiderHotkey', this.EnableHotkey, null);
        this.settings.bind('resizeNarrowerHotkey', 'resizeNarrowerHotkey', this.EnableHotkey, null);
        this.settings.bind('resizeTallerHotkey', 'resizeTallerHotkey', this.EnableHotkey, null);
        this.settings.bind('resizeShorterHotkey', 'resizeShorterHotkey', this.EnableHotkey, null);
        this.settings.bind('swapLeftHotkey', 'swapLeftHotkey', this.EnableHotkey, null);
        this.settings.bind('swapRightHotkey', 'swapRightHotkey', this.EnableHotkey, null);
        this.settings.bind('swapUpHotkey', 'swapUpHotkey', this.EnableHotkey, null);
        this.settings.bind('swapDownHotkey', 'swapDownHotkey', this.EnableHotkey, null);
        this.settings.bind('panelTheme', 'panelTheme', () => this.app.theme.changed(), null);
        this.settings.bind('accentMode', 'accentMode', () => this.app.theme.changed(), null);
        this.settings.bind('accentColor', 'accentColor', () => this.app.theme.changed(), null);
        this.settings.bind('stateMode', 'stateMode', () => this.app.theme.changed(), null);
        this.settings.bind('stateColor', 'stateColor', () => this.app.theme.changed(), null);
        this.settings.bind('focusBorder', 'focusBorderValue', () => this.app.border.update(), null);
        this.settings.bind('fillSingleWindow', 'fillSingleWindowValue', () => {
            if (this.settings.getValue('fillSingleWindow') === true)
                tile_single_retile(this.app);
        }, null);
        this.app.excl.start(this.settings);
        this.EnableHotkey();
        this.app.theme.init(this);
        this.app.focus.connect(this.app);
        this.app.border.init(this.app);
        app.monitors.refresh(() => {
            tile_layouts_migrate_once(app);
            app.auto.connectAll(app);
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
const tile_debug_count = (app, monitor, focusWindow, collected) => {
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
            if (app.excl.isExcluded(w))
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
// Retile every monitor whose layout can place windows: preset layouts directly, auto
// grids debounced (consistent with other debounced retiles).
const tile_excl_retile = (app) => {
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    for (let i = 0; i < utils_Main.layoutManager.monitors.length; i++) {
        const layout = tile_layout_for(app, i, wsIndex);
        if (layout.preset)
            tile_retile_monitor(app, i, null);
        else if (layout.auto)
            app.auto.scheduleMonitor(app, i, 150);
    }
};
// Own collector instead of gTile's GetNotFocusedWindowsOfMonitor: that one excludes
// app.focusMetaWindow, which goes stale because gTile tracks focus via the app-level
// 'notify::focus-app' signal (silent on same-app window switches) — visible windows
// get dropped. RULE: active workspace only, never pull windows across workspaces.
const tile_collect_windows = (app, monitor, focusWindow, wsIndex = null) => {
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
        if (app.excl.isExcluded(w))
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
// Sort direction must match the target layout: column-major for the low-res
// column-stack, row-major for uniform grids — otherwise re-tiles shuffle
// windows between cells and manual arrangements do not survive. Grouping by overlap
// (tile_sort_order) keeps windows in their column/row with unequal borders too.
// app.auto carries the sort-rect overrides: stable sequence -> frame to sort by
// instead of the current one (set after an edge resize: the dragged window keeps
// the cell it was tiled into; used up by the next retile, ignored after 2000 ms
// when no retile came).
const tile_sort_reading_order = (app, windows, columnMajor) => {
    const now = GLib.get_monotonic_time() / 1000;
    app.auto.sortPoll(now);
    const rects = windows.map((w) => {
        const rect = app.auto.sortTake(w.get_stable_sequence(), now);
        if (rect)
            return rect;
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
// Auto-mode observer: re-tiles automatically on workspaces with automatic tiling on
// (Super+Ctrl+A on, Super+Ctrl+D off, per workspace) — with the runtime state as a
// per-App component in lib/runtime/auto.js (app.auto): debounce timers, pending
// sets, monitor maps, the workspace/window observers and the sort-rect overrides.
// Triggers: window added/removed on the active workspace (debounced 300ms) and
// manual window moves on release (grab-op-end, 250ms) — the moved window snaps
// into the grid slot nearest its drop position, manual arranging stays possible.
// Dialogs/popups never trigger (NORMAL type + wm_class checks, collector
// re-validates at run time). State is global across workspaces by design.
const tile_Mainloop = imports.mainloop;
// Muffin grab op number -> name (RESIZING_E, KEYBOARD_RESIZING_UNKNOWN, ...).
const tile_grab_op_name = (op) => Object.keys(Meta.GrabOp).find((k) => Meta.GrabOp[k] === op) || '';
const tile_grab_is_resize = (op) => /RESIZING/.test(tile_grab_op_name(op));

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
const tile_layout_set = (app, monitorIndex, wsIndex, patch) => {
    if (!app.monitors.ready || !app.monitors.keys[monitorIndex])
        return;
    const layouts = tile_layouts_parse(app.config.settings.getValue('layouts') || '');
    // Corrupt layouts are treated as empty on read; nothing is written (and the
    // old string is not silently replaced) until the setting itself is fixed.
    if (layouts === null) {
        if (!app.session.layoutsWriteGuardLogged) {
            app.session.layoutsWriteGuardLogged = true;
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
    const ref = app.split.ref(app, monitorIndex, wsIndex, n);
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
const tile_swap_override = (app, metaWindow, rect) => {
    app.auto.sortOverride(metaWindow.get_stable_sequence(), rect, GLib.get_monotonic_time() / 1000);
};
const tile_swap_hotkey = (app, dir) => {
    const focusWindow = tile_focus_window();
    if (!focusWindow || focusWindow.minimized || focusWindow.is_on_all_workspaces() || app.excl.isExcluded(focusWindow))
        return;
    const monitorIndex = focusWindow.get_monitor();
    const monitor = utils_Main.layoutManager.monitors[monitorIndex];
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
    if (window.minimized || window.is_on_all_workspaces() || app.excl.isExcluded(window)) {
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
    const windows = tile_collect_windows(app, monitor, null, wsIndex);
    let cells = null;
    let ordered = null;
    const n = windows.length;
    const layout = n ? tile_layout_shape(app, monitorIndex, n) : null;
    if (layout) {
        const split = app.split.for(app, monitorIndex, wsIndex, n, layout);
        cells = tile_split_rects(layout.kind, layout.shape, split, getUsableScreenArea(monitor));
        ordered = tile_sort_reading_order(app, windows, layout.kind === 'cols');
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
            app.border.flash(ordered[nb]);
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
            const cands = tile_collect_windows(app, utils_Main.layoutManager.monitors[step], null, wsIndex).map((w, i) => {
                const r = w.get_frame_rect();
                return { index: i, x: r.x, y: r.y, width: r.width, height: r.height, w: w };
            });
            const pick = tile_focus_monitor_pick(cands, dir, { x: frame.x, y: frame.y, width: frame.width, height: frame.height });
            if (pick != null) {
                cands[pick].w.activate(global.get_current_time());
                app.border.flash(cands[pick].w);
                return;
            }
        }
    }
};
// <<< focus-runtime
// Preset panel — view 1 (selection list) and, further below, view 2 (editor);
// design tokens from the approved HTML mockup (docs/superpowers/specs/2026-09-28-preset-ui-design.md).
const tile_St = imports.gi.St;
const tile_Clutter = imports.gi.Clutter;
const tile_Util = imports.misc.util;
const tile_panel_round_rect = (cr, x, y, w, h, r) => {
    cr.newSubPath();
    cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    cr.arc(x + r, y + r, r, Math.PI, 3 * Math.PI / 2);
    cr.closePath();
    cr.fill();
};
// Mockup: list thumbnails 54x34, gap 2px, radius 2px, fill per TILE_THEME_CAIRO dark thumb
// (#485064 dark / #b7bdcc light);
// editor rule thumbnails 34x18, gap 2px, 1px between stacked cells, radius 1px.
const tile_panel_thumb = (app, stacks, opts = {}) => {
    const { width = 54, height = 34, gap = 2, vgap = 2, radius = 2, color = null } = opts;
    const area = new tile_St.DrawingArea({ width, height });
    area.connect('repaint', (a) => {
        const cr = a.get_context();
        const [W, H] = a.get_surface_size();
        const paint = color || app.theme.cairo('thumb');
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
const tile_panel_window_count = (app) => {
    const focusWindow = tile_focus_window();
    if (!focusWindow)
        return 0;
    const monitor = utils_Main.layoutManager.monitors[focusWindow.get_monitor()];
    return tile_collect_windows(app, monitor, focusWindow).length + (app.excl.isExcluded(focusWindow) ? 0 : 1);
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
    box.add(tile_panel_thumb(app, thumbStacks), tile_panel_middle());
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
// Cairo can't read the stylesheet: the theme component's accent state (updated by
// changed() before any panel exists) supplies the accent (app.theme.rgb).
const tile_editor_open = (app, preset) => {
    const rules = tile_editor_sort((preset.rules || []).map((r) => ({ min: r.min, stacks: tile_editor_clamp(r.stacks || []) })));
    if (rules.length === 0)
        rules.push({ min: tile_editor_min_floor, stacks: [1, 1] });
    // Start on the rule a click in view 1 would apply right now
    const pick = tile_rules_pick(rules, tile_panel_window_count(app));
    app.panel.draft = { id: preset.id, name: preset.name || '', rules, index: Math.max(rules.indexOf(pick), 0), isNew: !!preset.isNew };
    app.panel.view = 'editor';
    app.panel.guard();
    tile_panel_rebuild(app);
};
const tile_editor_open_new = (app) => {
    tile_editor_open(app, { id: tile_editor_new_id(tile_presets_read(app)), name: '', rules: [{ min: tile_editor_min_floor, stacks: [1, 1] }], isNew: true });
};
const tile_editor_back = (app) => {
    app.panel.view = 'list';
    app.panel.draft = null;
    app.panel.guard();
    tile_panel_rebuild(app);
};
const tile_editor_save = (app, errorLabel) => {
    const d = app.panel.draft;
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
    const d = app.panel.draft;
    if (!d)
        return;
    tile_presets_write(app, tile_editor_delete_preset(tile_presets_read(app), d.id));
    const layouts = tile_layouts_parse(app.config.settings.getValue('layouts') || '');
    // Corrupt layouts stay untouched until the setting is fixed, like tile_layout_set,
    // which logs the same condition only once.
    if (layouts === null) {
        if (!app.session.layoutsWriteGuardLogged) {
            app.session.layoutsWriteGuardLogged = true;
            global.log('greenTile layouts setting is corrupt, deleting preset without layout cleanup');
        }
    }
    else
        app.config.settings.setValue('layouts', JSON.stringify(tile_layouts_remove_preset(layouts, d.id)));
    global.log('greenTile preset "' + (d.name || d.id) + '" deleted');
    tile_editor_back(app);
};
const tile_editor_rule_row = (app, rule, active, last, onSelect) => {
    const row = new tile_St.Button({
        style_class: 'gk-ed-rule' + (active ? ' gk-ed-rule-active' : '') + (last ? ' gk-ed-rule-last' : ''),
        x_fill: true, y_fill: true, track_hover: true, reactive: true,
    });
    const outer = new tile_St.BoxLayout({ x_expand: true });
    if (active)
        outer.add(new tile_St.Bin({ style_class: 'gk-ed-rule-stripe' }), { x_fill: false, y_fill: true });
    const box = new tile_St.BoxLayout({ style_class: 'gk-ed-rule-box', x_expand: true });
    box.add(new tile_St.Label({ text: _("from %d").format(rule.min), style_class: 'gk-ed-rule-label' }), { expand: true, x_fill: true, y_fill: false, y_align: tile_St.Align.MIDDLE });
    box.add(tile_panel_thumb(app, rule.stacks, { width: 34, height: 18, gap: 2, vgap: 1, radius: 1, color: active ? app.theme.rgb : app.theme.cairo('thumb') }), tile_panel_middle());
    outer.add(box, { expand: true, x_fill: true, y_fill: true });
    row.set_child(outer);
    row.connect('clicked', () => onSelect());
    return row;
};
// Painter: 6 columns x 4 rows. Button 1 paints (row under the pointer = windows in the
// column), dragging paints every column passed; button 3 removes the column.
const tile_editor_painter = (app, getStacks, onChange) => {
    const frame = new tile_St.Bin({ style_class: 'gk-painter', x_fill: true, y_fill: true });
    const area = new tile_St.DrawingArea({ style_class: 'gk-painter-area', reactive: true, x_expand: true });
    frame.set_child(area);
    area.connect('repaint', (a) => {
        const cr = a.get_context();
        const [W, H] = a.get_surface_size();
        const stacks = getStacks();
        const accent = app.theme.rgb;
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
                const outline = app.theme.cairo('outline');
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
        app,
        () => app.panel.draft.rules[app.panel.draft.index].stacks,
        (stacks) => {
            const dr = app.panel.draft;
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
    const entry = new tile_St.Entry({ style_class: 'gk-entry', text: app.panel.draft.name, hint_text: _("Preset name"), can_focus: true, x_expand: true });
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
    if (!app.panel.draft.isNew) {
        saveRow.add(delWrap, middle);
        saveRow.add(confirmWrap, middle);
    }
    right.add(saveRow);
    confirmWrap.hide();
    body.add(right, { expand: true, x_fill: true, y_fill: true });
    refresh = () => {
        const dr = app.panel.draft;
        rulesBox.destroy_all_children();
        dr.rules.forEach((rule, i) => {
            rulesBox.add(tile_editor_rule_row(app, rule, i === dr.index, i === dr.rules.length - 1, () => {
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
        app.panel.draft.rules = r.rules;
        app.panel.draft.index = r.index;
        refresh();
    };
    addBtn.connect('clicked', () => apply(tile_editor_add_rule(app.panel.draft.rules)));
    delBtn.connect('clicked', () => apply(tile_editor_delete_rule(app.panel.draft.rules, app.panel.draft.index)));
    minus.connect('clicked', () => apply(tile_editor_step_min(app.panel.draft.rules, app.panel.draft.index, -1)));
    plus.connect('clicked', () => apply(tile_editor_step_min(app.panel.draft.rules, app.panel.draft.index, 1)));
    entry.clutter_text.connect('text-changed', () => {
        app.panel.draft.name = entry.get_text();
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
        app.auto.scheduleMonitor(app, tile_focus_monitor_index(), 150);
    };
    minus.connect('clicked', () => change(-TILE_GAP_STEP));
    plus.connect('clicked', () => change(TILE_GAP_STEP));
    // "Reset sizes": only when borders were moved on this monitor + workspace (lib/model/split.js);
    // clears them for every window count and retiles; the rebuild hides the button again.
    const monitorIndex = tile_focus_monitor_index();
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    if (app.split.any(app, monitorIndex, wsIndex)) {
        const reset = new tile_St.Button({ label: _("Reset sizes"), style_class: 'gk-reset-btn', track_hover: true });
        reset.connect('clicked', () => {
            app.split.reset(app, monitorIndex, wsIndex);
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
    if (!app.panel.actor)
        return;
    const view = app.panel.view;
    const draft = app.panel.draft;
    app.panel.close();
    app.panel.view = view;
    app.panel.draft = draft;
    tile_panel_open(app);
};
const tile_panel_open = (app) => {
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    const monitorIndex = tile_focus_monitor_index();
    const draft = app.panel.view === 'editor' ? app.panel.draft : null;
    const panel = new tile_St.BoxLayout({ vertical: true, style_class: app.theme.panelClass(), reactive: true, can_focus: true });
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
                app.auto.deactivate(app);
            else
                app.auto.activate(app);
            tile_panel_rebuild(app);
        });
        header.add(autoBtn, { y_fill: false, y_align: tile_St.Align.MIDDLE });
        // Theme toggle: one click switches between light and dark; "Follow system" is
        // selectable again in the settings dialog. The glyph shows the theme a click
        // switches TO (moon in light mode, like most desktop apps do).
        const themeShown = app.theme.theme;
        const themeBtn = new tile_St.Button({
            label: themeShown === 'light' ? '☾' : '☀',
            style_class: 'gk-close gk-theme',
            track_hover: true,
        });
        new Tooltips.Tooltip(themeBtn, themeShown === 'light' ? _("Dark theme") : _("Light theme"));
        themeBtn.connect('clicked', () => {
            app.config.settings.setValue('panelTheme', tile_theme_toggle_target(app.theme.theme));
            // Cinnamon's XletSettings.setValue only saves the settings file — the
            // IN bind callback does not fire on programmatic changes, so the panel
            // re-theme and rebuild happen here. The guard swallows stray clicks
            // that follow the rebuild, like the Back button does.
            app.panel.guard();
            app.theme.changed();
        });
        header.add(themeBtn);
        // ⚙ opens the extension's settings dialog on its first page; the same dialog
        // Cinnamon opens from the Extensions manager.
        const settingsBtn = new tile_St.Button({ label: '⚙', style_class: 'gk-close gk-settings', track_hover: true });
        settingsBtn.connect('clicked', () => {
            app.panel.close();
            tile_Util.spawn(['xlet-settings', 'extension', UUID, '-t', '0']);
        });
        header.add(settingsBtn);
        const closeBtn = new tile_St.Button({ label: '✕', style_class: 'gk-close', track_hover: true });
        closeBtn.connect('clicked', () => app.panel.close());
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
        app.panel.dragging = false;
        const [px, py] = panel.get_position();
        app.panel.saved = { x: Math.round(px), y: Math.round(py) };
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
        app.panel.dragging = true;
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
            && GLib.get_monotonic_time() < app.panel.guardUntil)
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
        const n = tile_panel_window_count(app);
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
    app.panel.actor = panel;
    // Monitors come and go (external display plugged in or out). A saved position
    // whose title bar is on no current monitor would open the panel off screen, so it
    // is dropped and the panel is centred again. Probe point: title bar at list width.
    const monitors = utils_Main.layoutManager.monitors;
    const monitorAt = (x, y) => monitors.find((m) => x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height) || null;
    const focusMonitor = () => {
        const focusWindow = getFocusApp();
        return (focusWindow && monitors[focusWindow.get_monitor()]) || monitors[utils_Main.layoutManager.primaryIndex] || monitors[0];
    };
    if (app.panel.saved && !monitorAt(app.panel.saved.x + 300, app.panel.saved.y + 20)) {
        global.log('greenTile panel position ' + app.panel.saved.x + ',' + app.panel.saved.y + ' is on no monitor, centring again');
        app.panel.saved = null;
    }
    // Keep the position across rebuilds (workspace switches, focus changes, view changes)
    app.panel.positioned = app.panel.saved != null;
    if (app.panel.saved)
        panel.set_position(app.panel.saved.x, app.panel.saved.y);
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
        const m = (app.panel.saved && monitorAt(app.panel.saved.x + 300, app.panel.saved.y + 20)) || focusMonitor();
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
        app.panel.dragging = true;
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
        app.panel.dragging = false;
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
        if (app.panel.actor !== panel)
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
        if (!app.panel.positioned) {
            app.panel.positioned = true;
            clamped = true;
            const monitor = focusMonitor();
            const box = panel.get_allocation_box();
            const width = box.x2 - box.x1;
            const height = box.y2 - box.y1;
            const cx = monitor.x + Math.max(monitor.width - width, 0) / 2;
            const cy = monitor.y + Math.max(monitor.height - height, 0) / 2.5;
            panel.set_position(Math.round(cx), Math.round(cy));
            app.panel.saved = { x: Math.round(cx), y: Math.round(cy) };
        }
        if (!clamped && !app.panel.dragging) {
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
                app.panel.saved = { x: Math.round(nx), y: Math.round(ny) };
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
        if (app.panel.view === 'editor')
            return;
        if (app.panel.dragging)
            global.log('greenTile rebuild suppressed (drag)');
        else
            tile_panel_rebuild(app);
    };
    app.panel.sig.push({ obj: global.workspace_manager, id: global.workspace_manager.connect('workspace-switched', onWorkspaceSwitched) });
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
    app.panel.sig.push({
        obj: global.stage,
        id: global.stage.connect('captured-event', (stage, event) => {
            if (event.type() !== tile_Clutter.EventType.BUTTON_PRESS)
                return tile_Clutter.EVENT_PROPAGATE;
            if (app.panel.dragging)
                return tile_Clutter.EVENT_PROPAGATE;
            const src = event.get_source();
            if (src && app.panel.actor && app.panel.actor.contains(src))
                return tile_Clutter.EVENT_PROPAGATE;
            global.log('greenTile panel closed by outside click');
            app.panel.close();
            return tile_Clutter.EVENT_PROPAGATE;
        }),
    });
    // A click into a window or on the desktop (Nemo) never becomes a stage event
    // in list mode, but it changes the focus: that closes the panel too, the
    // editor included (its draft is dropped, as with Esc and Back). Any other
    // focus change — a window opening, an app demanding attention — closes it as
    // well; that is the price of the passive approach. Suppressed during a drag,
    // which would otherwise lose its grab.
    app.panel.sig.push({
        obj: global.display,
        id: global.display.connect('notify::focus-window', () => {
            if (app.panel.dragging) {
                global.log('greenTile close suppressed (drag)');
                return;
            }
            global.log('greenTile panel closed by focus change');
            app.panel.close();
        }),
    });
    // No monitors-changed handler here: on a display change enable() recreates the whole
    // App, which closes the panel; the saved-position check above covers the next open.
    panel.connect('key-press-event', (a, event) => {
        if (event.get_key_symbol() === tile_Clutter.KEY_Escape) {
            if (app.panel.view === 'editor')
                tile_editor_back(app);
            else
                app.panel.close();
            return tile_Clutter.EVENT_STOP;
        }
        return tile_Clutter.EVENT_PROPAGATE;
    });
    // The list has no modal (it must not block the desktop), so it never gets key
    // events itself. Escape is therefore grabbed as a hotkey while the list is open
    // (same way the classic grid binds its Escape); released in tile_panel_close.
    // Side effect: while the list is open, applications do not receive Escape.
    if (!draft) {
        utils_Main.keybindingManager.addHotKey(PANEL_ESC_NAME, 'Escape', () => app.panel.close());
        app.panel.escBound = true;
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
    if (app.panel.actor)
        app.panel.close();
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
        this.excl = new Exclusions({
            appSystem: cinnamon.cinnamonNs.AppSystem,
            windowTracker: cinnamon.cinnamonNs.WindowTracker,
            gio: cinnamon.gio,
            main: cinnamon.main,
            global: cinnamon.global,
            focusWindow: tile_focus_window,
            retileMonitor: tile_retile_monitor,
            retile: tile_excl_retile,
            translate: _,
        });
        this.hotkeys = new Hotkeys({ keybindingManager: cinnamon.main.keybindingManager });
        this.panel = new PanelState({
            main: cinnamon.main,
            glib: GLib,
            escName: PANEL_ESC_NAME,
        });
        this.monitors = new Monitors({
            main: cinnamon.main,
            gio: cinnamon.gio,
            meta: cinnamon.meta,
            global: cinnamon.global,
            session: session,
        });
        this.split = new Split({
            mainloop: tile_Mainloop,
            glib: GLib,
            gio: tile_Gio,
            global: cinnamon.global,
            main: cinnamon.main,
            focusWindow: tile_focus_window,
            layoutFor: tile_layout_for,
            layoutShape: tile_layout_shape,
            layoutSet: tile_layout_set,
            collectWindows: (monitor, focus, ws) => tile_collect_windows(this, monitor, focus, ws),
            usableArea: getUsableScreenArea,
            gap: tile_gap,
            retileMonitor: tile_retile_monitor,
            grabOpName: tile_grab_op_name,
        });
        this.theme = new Theme({
            st: tile_St,
            gio: tile_Gio,
            main: utils_Main,
            global: cinnamon.global,
            glib: GLib,
            session: session,
            nextAccentGen: () => session.nextAccentGen(),
            panelOpen: () => this.panel.actor,
            panelRebuild: (a) => tile_panel_rebuild(a),
        });
        this.border = new Border({
            st: tile_St,
            glib: GLib,
            meta: cinnamon.meta,
            main: utils_Main,
            global: cinnamon.global,
            stateRgb: () => this.theme.stateRgb,
            exclCheck: (w) => this.excl.isExcluded(w),
            layoutFor: tile_layout_for,
            collectWindows: (monitor, focus, ws) => tile_collect_windows(this, monitor, focus, ws),
        });
        this.focus = new Focus({
            meta: cinnamon.meta,
            hotkey: tile_focus_hotkey,
        });
        this.drop = new Drop({
            meta: cinnamon.meta,
            main: cinnamon.main,
            global: cinnamon.global,
            mainloop: tile_Mainloop,
            st: tile_St,
            collectWindows: (monitor, focus, ws) => tile_collect_windows(this, monitor, focus, ws),
            excludeCheck: (w) => this.excl.isExcluded(w),
            layoutShape: tile_layout_shape,
            layoutSet: tile_layout_set,
            usableArea: getUsableScreenArea,
            gap: tile_gap,
            placeRects: tile_place_rects,
            accentRgb: () => this.theme.rgb,
        });
        this.auto = new Auto({
            mainloop: tile_Mainloop,
            meta: cinnamon.meta,
            main: cinnamon.main,
            global: cinnamon.global,
            signalManager: new tile_SignalManager(),
            gobject: cinnamon.gobject,
            focusWindow: tile_focus_window,
            focusMonitorIndex: tile_focus_monitor_index,
            layoutFor: tile_layout_for,
            layoutSet: tile_layout_set,
            retileMonitor: tile_retile_monitor,
            borderUpdate: () => this.border.update(),
            grabIsResize: tile_grab_is_resize,
            dropBegin: (grabApp, w, op) => grabApp.drop.begin(grabApp, w, op),
            dropEnd: (grabApp, w, op) => grabApp.drop.end(grabApp, w, op),
            dropStop: () => this.drop.stop(),
            resizeEnd: (grabApp, w, op) => grabApp.split.onResizeEnd(grabApp, w, op),
            exclToggleDelete: (seq) => this.excl.removeToggle(seq),
            exclToggleClear: () => this.excl.clearToggles(),
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

const platform = Object.freeze({
    move_resize_window: move_resize_window,
    reset_window: reset_window,
});
const init = () => {};
const enable = function () {
    // One extension session per enable(): it outlives every App recreation and
    // carries the state that must survive them (settle wait, fallback-logged
    // flag, the monitors-changed handler on its own scope). Cinnamon calls
    // extension.js's exports member-style (extensionSystem.js) and extension.js
    // forwards as greenTile.enable()/greenTile.disable() member calls — so
    // `this` is the exports object and the session rides it, no module-level
    // state left.
    this.session = new Session({
        signalManager: new tile_SignalManager(),
        layoutManager: Main.layoutManager,
        mainloop: tile_Mainloop,
        gobject: imports.gi.GObject,
        now: Date.now,
        log: (msg) => global.log(msg),
        onSettled: (app) => app.auto.scheduleAll(app, 0),
        createApp: (session) => new App(platform, session, {
            main: utils_Main,
            gio: tile_Gio,
            meta: utils_Meta,
            global: global,
            gobject: imports.gi.GObject,
            cinnamonNs: imports.gi.Cinnamon,
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

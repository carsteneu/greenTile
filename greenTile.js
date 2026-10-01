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
const { tile_gap_value, tile_gap_cell } = require('./lib/model/gap');
const { tile_single_fill, tile_single_layout } = require('./lib/model/single');
const { tile_disconnect_each } = require('./lib/model/teardown');
const { tile_fill_stacks, tile_auto_rows, tile_auto_narrow_stacks } = require('./lib/model/fill');
const { TILE_SPLIT_MIN_PX, tile_split_valid, tile_split_rects, tile_split_cell_at, tile_split_border_pos, tile_split_move, tile_split_key_target, tile_split_accel, tile_split_op_edges, tile_split_frame_edges, tile_sort_order } = require('./lib/model/split');
const { tile_drop_zone, tile_drop_layout, tile_drop_fits } = require('./lib/model/drop');
const { tile_layouts_parse, tile_layouts_entry, tile_layouts_splits, tile_layouts_shapes, tile_layouts_set, tile_layouts_migrate, tile_layout_resolve } = require('./lib/model/layouts');
const { Split } = require('./lib/runtime/split');
const { Drop } = require('./lib/runtime/drop');
const { Theme } = require('./lib/runtime/theme');
const { Border } = require('./lib/runtime/border');
const { Focus } = require('./lib/runtime/focus');
const { tile_swap_neighbor, tile_swap_landing_cell, tile_swap_chain_step } = require('./lib/model/swap');
const { tile_focus_monitor_step, tile_focus_monitor_pick } = require('./lib/model/focus');
const { Session } = require('./lib/runtime/session');
const { Monitors } = require('./lib/runtime/monitors');
const { Auto } = require('./lib/runtime/auto');
const { Hotkeys, PANEL_ESC_NAME } = require('./lib/runtime/hotkeys');
const { Exclusions } = require('./lib/runtime/exclusions');
const { PanelState } = require('./lib/runtime/panel-state');
const { tile_panel_toggle, tile_panel_rebuild, tile_panel_window_count } = require('./lib/ui/panel');
const { _ } = require('./lib/ui/i18n');

const Settings = imports.ui.settings;
const Main = imports.ui.main;
const SignalManager = imports.misc.signalManager.SignalManager;
const GLib = imports.gi.GLib;
const Meta = imports.gi.Meta;
const Panel = imports.ui.panel;
const St = imports.gi.St;
const Tweener = imports.ui.tweener;
const Mainloop = imports.mainloop;
const Gio = imports.gi.Gio;

// ---- Config (derived from gTile src/base/config.ts) ----
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

// ---- Utils (derived from gTile src/base/utils.ts) ----
const getPanelHeight = (panel) => {
    return panel.height
        || panel.actor.get_height();
};
const getUsableScreenArea = (monitor) => {
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
            if (Main.getTabList().indexOf(w) === -1)
                reasons.push('not-in-tablist');
            if (imports.gi.Cinnamon.WindowTracker.get_default().get_window_app(w) == null)
                reasons.push('no-app');
            if (Main.layoutManager.monitors[w.get_monitor()] !== monitor)
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
    let tabList = Main.getTabList();
    return tabList.length > 0 ? tabList[0] : null;
};
// Retile every monitor whose layout can place windows: preset layouts directly, auto
// grids debounced (consistent with other debounced retiles).
const tile_excl_retile = (app) => {
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    for (let i = 0; i < Main.layoutManager.monitors.length; i++) {
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
// Animated placement: the window gets its final geometry instantly (no stepped
// resizes — those reflow terminal text at every step), while the compositor actor
// is parked at the old rect via translation/scale and eased back to identity.
// Offsets are set BEFORE the move so no intermediate frame shows the final position.
const TILE_ANIMATE_MS = 250;
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
const tile_app_auto = (app, monitorIndex, focusWindow, animate = true, wsIndex = null) => {
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
// Auto-mode observer: re-tiles automatically on workspaces with automatic tiling on
// (Super+Ctrl+A on, Super+Ctrl+D off, per workspace) — with the runtime state as a
// per-App component in lib/runtime/auto.js (app.auto): debounce timers, pending
// sets, monitor maps, the workspace/window observers and the sort-rect overrides.
// Triggers: window added/removed on the active workspace (debounced 300ms) and
// manual window moves on release (grab-op-end, 250ms) — the moved window snaps
// into the grid slot nearest its drop position, manual arranging stays possible.
// Dialogs/popups never trigger (NORMAL type + wm_class checks, collector
// re-validates at run time). State is global across workspaces by design.
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
const tile_monitor_index_of = (metaWindow) => metaWindow.get_monitor();
const tile_focus_monitor_index = () => {
    const focusWindow = tile_focus_window();
    return focusWindow ? focusWindow.get_monitor() : Main.layoutManager.primaryIndex;
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
        const primaryIndex = Main.layoutManager.primaryIndex;
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
    const monitor = Main.layoutManager.monitors[monitorIndex];
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
    if (!app.monitors.ready || !Main.layoutManager.monitors[monitorIndex])
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
    const monitor = Main.layoutManager.monitors[monitorIndex];
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
            monitors: Main.layoutManager.monitors.map((m, i) => ({ index: i, x: m.x })),
        });
        if (step != null) {
            const frame = window.get_frame_rect();
            const cands = tile_collect_windows(app, Main.layoutManager.monitors[step], null, wsIndex).map((w, i) => {
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
const getFocusApp = () => {
    return global.display.focus_window;
};
// ---- App (derived from gTile src/base/app.ts) ----
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
            mainloop: Mainloop,
            glib: GLib,
            gio: Gio,
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
            st: St,
            gio: Gio,
            main: Main,
            global: cinnamon.global,
            glib: GLib,
            session: session,
            nextAccentGen: () => session.nextAccentGen(),
            panelOpen: () => this.panel.actor,
            panelRebuild: (a) => tile_panel_rebuild(a),
        });
        this.border = new Border({
            st: St,
            glib: GLib,
            meta: cinnamon.meta,
            main: Main,
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
            mainloop: Mainloop,
            st: St,
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
            mainloop: Mainloop,
            meta: cinnamon.meta,
            main: cinnamon.main,
            global: cinnamon.global,
            signalManager: new SignalManager(),
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
        // Explicit UI facade (one place): the tiling functions the preset panel
        // (lib/ui) calls — frozen, so nothing beyond these lookups is reachable.
        // Model modules are required by lib/ui directly (no facade needed).
        this.ops = Object.freeze({
            focusWindow: tile_focus_window,
            getFocusApp: getFocusApp,
            focusMonitorIndex: tile_focus_monitor_index,
            collectWindows: tile_collect_windows,
            layoutFor: tile_layout_for,
            layoutSet: tile_layout_set,
            retileMonitor: tile_retile_monitor,
            presetsRead: tile_presets_read,
            presetsWrite: tile_presets_write,
            gap: tile_gap,
            rulesPick: tile_rules_pick,
            windowCount: tile_panel_window_count,
            rebuild: tile_panel_rebuild,
        });
        this.config = new Config(this);
    }
    destroy() {
        this.config.destroy();
    }
}
// ---- Utils (derived from gTile src/utils.ts) ----
const reset_window = (metaWindow) => {
    metaWindow === null || metaWindow === void 0 ? void 0 : metaWindow.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
    metaWindow === null || metaWindow === void 0 ? void 0 : metaWindow.unmaximize(Meta.MaximizeFlags.VERTICAL);
    metaWindow === null || metaWindow === void 0 ? void 0 : metaWindow.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
};
const move_resize_window = (metaWindow, x, y, width, height) => {
    if (!metaWindow)
        return;
    metaWindow.move_resize_frame(true, x, y, width, height);
    metaWindow.move_frame(true, x, y);
};

// ---- Extension (derived from gTile src/extension.ts) ----

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
        signalManager: new SignalManager(),
        layoutManager: Main.layoutManager,
        mainloop: Mainloop,
        gobject: imports.gi.GObject,
        now: Date.now,
        log: (msg) => global.log(msg),
        onSettled: (app) => app.auto.scheduleAll(app, 0),
        createApp: (session) => new App(platform, session, {
            main: Main,
            gio: Gio,
            meta: Meta,
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

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
// Tiling services, extracted to lib/tiling/. Paths are root-relative on purpose:
// Cinnamon resolves every nested require against the xlet root (fileUtils.js).
const { getUsableScreenArea, getFocusApp, tile_focus_window, tile_focus_monitor_index } = require('./lib/tiling/screen');
const { tile_collect_windows } = require('./lib/tiling/windows');
const { tile_gap, tile_place_rects } = require('./lib/tiling/place');
const { tile_presets_read, tile_presets_write, tile_layout_for, tile_layout_set, tile_layout_shape, tile_layouts_migrate_once, tile_rules_pick } = require('./lib/tiling/layout');
const { tile_app_columns, tile_retile_monitor, tile_single_retile, tile_excl_retile } = require('./lib/tiling/retile');
const { tile_swap_hotkey } = require('./lib/tiling/swap');
const { tile_focus_hotkey } = require('./lib/tiling/focus-nav');
const { tile_grab_op_name, tile_grab_is_resize } = require('./lib/tiling/grab');

const Settings = imports.ui.settings;
const Main = imports.ui.main;
const SignalManager = imports.misc.signalManager.SignalManager;
const GLib = imports.gi.GLib;
const Meta = imports.gi.Meta;
const St = imports.gi.St;
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
// getPanelHeight/getUsableScreenArea and every tile_* service moved to
// lib/tiling/ (loop 4c-A); greenTile.js consumes them through the requires above.

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
const tile_window_reset = (metaWindow) => {
    metaWindow?.unmaximize(Meta.MaximizeFlags.HORIZONTAL);
    metaWindow?.unmaximize(Meta.MaximizeFlags.VERTICAL);
    metaWindow?.unmaximize(Meta.MaximizeFlags.HORIZONTAL | Meta.MaximizeFlags.VERTICAL);
};
const tile_window_move_resize = (metaWindow, x, y, width, height) => {
    if (!metaWindow)
        return;
    metaWindow.move_resize_frame(true, x, y, width, height);
    metaWindow.move_frame(true, x, y);
};

// ---- Extension (derived from gTile src/extension.ts) ----

const tile_platform = Object.freeze({
    move_resize_window: tile_window_move_resize,
    reset_window: tile_window_reset,
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
        createApp: (session) => new App(tile_platform, session, {
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

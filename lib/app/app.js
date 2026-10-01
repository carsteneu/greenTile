/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * Composition root per App, derived from gTile 2.2.1 (src/base/app.ts): constructs
 * every per-App component in exactly today's order, hands the Cinnamon access
 * to each one as explicit deps and finishes with the settings Config — the
 * constructor's last step, so the binds fire into a fully wired app.
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

const { Split } = require('./lib/runtime/split');
const { Drop } = require('./lib/runtime/drop');
const { Theme } = require('./lib/runtime/theme');
const { Border } = require('./lib/runtime/border');
const { Focus } = require('./lib/runtime/focus');
const { Monitors } = require('./lib/runtime/monitors');
const { Auto } = require('./lib/runtime/auto');
const { Hotkeys, PANEL_ESC_NAME } = require('./lib/runtime/hotkeys');
const { Exclusions } = require('./lib/runtime/exclusions');
const { PanelState } = require('./lib/runtime/panel-state');
const { _ } = require('./lib/ui/i18n');
const { panelRebuild, panelWindowCount } = require('./lib/ui/panel');
const { usableArea, focusWindow, focusMonitorIndex } = require('./lib/tiling/screen');
const { collectWindows } = require('./lib/tiling/windows');
const { gap, placeRects } = require('./lib/tiling/place');
const { presetsRead, presetsWrite, layoutFor, layoutSet, layoutShape, rulesPick } = require('./lib/tiling/layout');
const { retileMonitor, exclRetile } = require('./lib/tiling/retile');
const { focusHotkey } = require('./lib/tiling/focus-nav');
const { grabOpName, grabIsResize } = require('./lib/tiling/grab');
const { Config } = require('./lib/app/config');

/**
 * @typedef {Object} AppCinnamon
 * @property {AnyRecord} main imports.ui.main
 * @property {AnyRecord} gio imports.gi.Gio
 * @property {AnyRecord} meta imports.gi.Meta
 * @property {AnyRecord} global the Cinnamon global object
 * @property {AnyRecord} gobject imports.gi.GObject
 * @property {AnyRecord} cinnamonNs imports.gi.Cinnamon
 */
class App {
    /**
     * @param {SessionFacade} session
     * @param {AppCinnamon} cinnamon
     */
    constructor(session, cinnamon) {
        const Main = imports.ui.main;
        const SignalManager = imports.misc.signalManager.SignalManager;
        const GLib = imports.gi.GLib;
        const St = imports.gi.St;
        const Mainloop = imports.mainloop;
        const Gio = imports.gi.Gio;

        this.session = session;
        this.excl = new Exclusions({
            appSystem: cinnamon.cinnamonNs.AppSystem,
            windowTracker: cinnamon.cinnamonNs.WindowTracker,
            gio: cinnamon.gio,
            main: cinnamon.main,
            global: cinnamon.global,
            focusWindow,
            retileMonitor,
            retile: exclRetile,
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
            session,
        });
        /** @type {Split} */
        this.split = new Split({
            mainloop: Mainloop,
            glib: GLib,
            gio: Gio,
            global: cinnamon.global,
            main: cinnamon.main,
            focusWindow,
            layoutFor,
            layoutShape,
            layoutSet,
            collectWindows: (monitor, focus, ws) => collectWindows(this, monitor, focus, ws),
            usableArea,
            gap,
            retileMonitor,
            grabOpName,
        });
        this.theme = new Theme({
            st: St,
            gio: Gio,
            main: Main,
            global: cinnamon.global,
            glib: GLib,
            session,
            nextAccentGen: () => session.nextAccentGen(),
            panelOpen: () => this.panel.actor,
            panelRebuild: (a) => panelRebuild(a),
        });
        /** @type {Border} */
        this.border = new Border({
            st: St,
            glib: GLib,
            meta: cinnamon.meta,
            main: Main,
            global: cinnamon.global,
            stateRgb: () => this.theme.stateRgb,
            exclCheck: (/** @type {CinnamonWindow} */ w) => this.excl.isExcluded(w),
            layoutFor,
            collectWindows: (monitor, focus, ws) => collectWindows(this, monitor, focus, ws),
        });
        this.focus = new Focus({
            meta: cinnamon.meta,
            hotkey: focusHotkey,
        });
        /** @type {Drop} */
        this.drop = new Drop({
            meta: cinnamon.meta,
            main: cinnamon.main,
            global: cinnamon.global,
            mainloop: Mainloop,
            st: St,
            collectWindows: (monitor, focus, ws) => collectWindows(this, monitor, focus, ws),
            excludeCheck: (w) => this.excl.isExcluded(w),
            layoutShape,
            layoutSet,
            usableArea,
            gap,
            placeRects,
            accentRgb: () => this.theme.rgb,
        });
        this.auto = new Auto({
            mainloop: Mainloop,
            meta: cinnamon.meta,
            main: cinnamon.main,
            global: cinnamon.global,
            signalManager: new SignalManager(),
            gobject: cinnamon.gobject,
            focusWindow,
            focusMonitorIndex,
            layoutFor,
            layoutSet,
            retileMonitor,
            borderUpdate: () => this.border.update(),
            grabIsResize,
            dropBegin: (/** @type {AppFacade} */ grabApp, /** @type {CinnamonWindow} */ w, /** @type {string} */ op) => grabApp.drop.begin(grabApp, w, op),
            dropEnd: (/** @type {AppFacade} */ grabApp, /** @type {CinnamonWindow} */ w, /** @type {string} */ op) => grabApp.drop.end(grabApp, w, op),
            dropStop: () => this.drop.stop(),
            resizeEnd: (/** @type {AppFacade} */ grabApp, /** @type {CinnamonWindow} */ w, /** @type {string} */ op) => grabApp.split.onResizeEnd(grabApp, w, op),
            exclToggleDelete: (/** @type {number} */ seq) => this.excl.removeToggle(seq),
            exclToggleClear: () => this.excl.clearToggles(),
        });
        // Explicit UI facade (one place): the tiling functions the preset panel
        // (lib/ui) calls — frozen, so nothing beyond these lookups is reachable.
        // Model modules are required by lib/ui directly (no facade needed).
        this.ops = Object.freeze({
            focusWindow,
            focusMonitorIndex,
            collectWindows,
            layoutFor,
            layoutSet,
            retileMonitor,
            presetsRead,
            presetsWrite,
            gap,
            rulesPick,
            windowCount: panelWindowCount,
            rebuild: panelRebuild,
        });
        // The bind callbacks fire into a fully wired App: Config is last.
        /** @type {import('./config').Config} */
        this.config = new Config(this);
    }
    destroy() {
        this.config.destroy();
    }
}

module.exports = { App };

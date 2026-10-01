/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * The single entry: init/enable/disable as Cinnamon requires them
 * (extension.js requiredFunctions check in
 * /usr/share/cinnamon/js/ui/extension.js). Modified version of 5.4/extension.js
 * from gTile (UUID gTile@shuairan), derived from gTile 2.2.1.
 * Modified by carsten_eu, 2026-09-28: loads ./greenTile instead of ./gTile.
 * Modified by carsten_eu, 2026-10-01: the lifecycle lives here — the session
 * is created from lib/app (composition root), greenTile.js is gone.
 *
 * Copyright (C) vibou, shuairan and the gTile contributors
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */
const { App } = require('./lib/app/app');
const { Session } = require('./lib/runtime/session');

// init/enable/disable are called member-style on this exports object
// (extensionSystem.js getModuleByIndex(i).enable()), so `this` is the module
// exports object and the extension session rides it — no module-level state.
// Cinnamon only passes the object as `this` on a member call; destructured or
// re-exported lifecycle functions would lose it.

/**
 * called when extension is loaded
 */
function init(metadata) {
    //extensionMeta holds your metadata.json info
}

/**
 * called when extension gets enabled: one extension session per enable(), it
 * outlives every App recreation and carries the state that must survive them
 * (settle wait, fallback-logged flag, the monitors-changed handler scope).
 */
function enable() {
    const Main = imports.ui.main;
    const Mainloop = imports.mainloop;
    const SignalManager = imports.misc.signalManager.SignalManager;
    const Gio = imports.gi.Gio;
    const Meta = imports.gi.Meta;
    // One extension session per enable(): it outlives every App recreation and
    // carries the state that must survive them (settle wait, fallback-logged
    // flag, the monitors-changed handler on its own scope).
    this.session = new Session({
        signalManager: new SignalManager(),
        layoutManager: Main.layoutManager,
        mainloop: Mainloop,
        gobject: imports.gi.GObject,
        now: Date.now,
        log: (msg) => global.log(msg),
        onSettled: (app) => app.auto.scheduleAll(app, 0),
        createApp: (session) => new App(session, {
            main: Main,
            gio: Gio,
            meta: Meta,
            global: global,
            gobject: imports.gi.GObject,
            cinnamonNs: imports.gi.Cinnamon,
        }),
    });
    this.session.start();
}

/**
 * called when extension gets disabled
 */
function disable() {
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
}

module.exports = { init, enable, disable };

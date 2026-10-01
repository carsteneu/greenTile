/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * The single entry: init/enable/disable as Cinnamon requires them
 * (extension.js requiredFunctions check in
 * /usr/share/cinnamon/js/ui/extension.js). Modified version of 5.4/extension.js
 * from gTile (UUID gTile@shuairan), derived from gTile 2.2.1; the session is
 * created from lib/app, the composition root.
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

function init() {
}

/**
 * One extension session per enable(): it outlives every App recreation and
 * carries the state that must survive them (settle wait, fallback-logged
 * flag, the monitors-changed handler on its own scope).
 *
 * @this {{ session: Session | null }}
 */
function enable() {
    const Main = imports.ui.main;
    const Mainloop = imports.mainloop;
    const SignalManager = imports.misc.signalManager.SignalManager;
    const Gio = imports.gi.Gio;
    const Meta = imports.gi.Meta;
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
 * Disables: destroys the session created by enable().
 *
 * @this {{ session: Session | null }}
 */
function disable() {
    // destroy() takes the monitors-changed handler down FIRST, then the App
    // dies — no monitor change can resurrect an App after disable, even when
    // app.destroy() throws.
    if (this.session) {
        this.session.destroy();
        this.session = null;
    }
}

module.exports = { init, enable, disable };

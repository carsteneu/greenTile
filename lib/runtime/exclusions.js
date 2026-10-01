const { SETTINGS_KEYS } = require('./lib/model/settings-keys');
/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * per-App exclusions runtime: the "never tile on" state — per-window toggles
 * (stable sequence -> excluded), exclusion rows and column classes derived
 * from the exclusions setting including the StartupWMClass resolution per app
 * row — plus the AppSystem 'installed-changed' handler that re-resolves both
 * after app installs, the excludeAppPicker options population and the hotkey
 * toggle for the focused window. Owned by the App (monitors-changed destroys
 * the App): destroy disconnects the handler and clears the state. Exactly one
 * signal, so the handler rides an explicit id (not a scope) and disconnects
 * in its own Config.destroy slot, fault tolerant.
 * All Cinnamon access is injected (deps).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const {
    exclRowsNormalize, exclRowsAppend, exclMatch, exclAppOptions, exclToggleSet,
} = require('./lib/model/exclude');

// deps: appSystem (imports.gi.Cinnamon.AppSystem namespace), windowTracker
// (imports.gi.Cinnamon.WindowTracker namespace), gio (imports.gi.Gio, OSD
// icon), main (imports.ui.main, osdWindowManager), global (the global object),
// focusWindow (focusWindow), retileMonitor (retileMonitor),
// retile (exclRetile), translate (_ gettext)
class Exclusions {
    constructor(deps) {
        this._deps = deps;
        this._appSystem = deps.appSystem;
        this._windowTracker = deps.windowTracker;
        this._main = deps.main;
        this._global = deps.global;
        this.toggled = new Map();
        // Null-prototype object: rule texts must not collide with Object.prototype
        // keys (see exclAppOptions).
        this.rows = [];
        this.classes = Object.create(null);
        this._appSystemHandlerId = 0;
        this._settings = null;
    }

    isExcluded(w) {
        if (w == null)
            return false;
        if (this.toggled.get(w.get_stable_sequence()))
            return true;
        if (this.rows.length === 0)
            return false;
        const app = this._windowTracker.get_default().get_window_app(w);
        return exclMatch(w.get_wm_class(), w.get_wm_class_instance(), w.get_title(), this.rows, app ? app.get_id() : null, this.classes);
    }

    // StartupWMClass per app row, resolved once per apply (not per window per retile);
    // the value is null when AppSystem cannot resolve the rule text or the app declares
    // no StartupWMClass — those rows fall back to the id compare. Rebuilt with the rows
    // themselves on installed-changed.
    _appClasses(rows) {
        const appSystem = this._appSystem.get_default();
        const result = Object.create(null);
        for (let i = 0; i < rows.length; i++) {
            if (rows[i].match !== 'app' || result[rows[i].text] !== undefined)
                continue;
            const app = appSystem.lookup_app(rows[i].text);
            const info = app ? app.get_app_info() : null;
            result[rows[i].text] = info ? info.get_startup_wm_class() : null;
        }
        return result;
    }

    apply(settings) {
        this.rows = exclRowsNormalize(settings.getValue(SETTINGS_KEYS.exclusions));
        this.classes = this._appClasses(this.rows);
    }

    // The app picker combobox (SETTINGS_KEYS.excludeAppPicker): the dialog collects its options from
    // the settings file when it opens, so the extension writes them via the official
    // setOptions API at enable time and on AppSystem's installed-changed.
    populate(settings) {
        const apps = this._appSystem.get_default().get_all();
        const list = [];
        for (let i = 0; i < apps.length; i++) {
            const info = apps[i].get_app_info();
            if (!info || !info.should_show())
                continue;
            list.push({ id: apps[i].get_id(), name: apps[i].get_name() });
        }
        settings.setOptions(SETTINGS_KEYS.excludeAppPicker, exclAppOptions(list, this._deps.translate("Add application …")));
    }

    // Apply + populate up front, then the installed-changed handler that keeps
    // both fresh while this App lives.
    start(settings) {
        this._settings = settings;
        this.apply(settings);
        this.populate(settings);
        this._appSystemHandlerId = this._appSystem.get_default().connect('installed-changed', () => {
            this.apply(this._settings);
            this.populate(this._settings);
        });
    }

    destroy() {
        if (this._appSystemHandlerId) {
            const id = this._appSystemHandlerId;
            this._appSystemHandlerId = 0;
            try {
                this._appSystem.get_default().disconnect(id);
            }
            catch (e) {
                // handler was already gone
            }
        }
        this.toggled.clear();
        this.rows = [];
        this.classes = Object.create(null);
    }

    removeToggle(seq) {
        this.toggled.delete(seq);
    }

    clearToggles() {
        this.toggled.clear();
    }

    // Picking an app appends the exclusion row and resets the combobox; setValue
    // alone would not fire the exclusions binding, so apply + retile run explicitly.
    picked(settings, app, value) {
        if (typeof value !== 'string' || value === 'picker')
            return;
        settings.setValue(SETTINGS_KEYS.exclusions, exclRowsAppend(settings.getValue(SETTINGS_KEYS.exclusions), value));
        this.apply(settings);
        this._deps.retile(app);
        settings.setValue(SETTINGS_KEYS.excludeAppPicker, 'picker');
    }

    toggleFocused(app) {
        const w = this._deps.focusWindow();
        if (!w)
            return;
        const excluded = !this.isExcluded(w);
        exclToggleSet(this.toggled, w.get_stable_sequence(), excluded);
        this._global.log('greenTile ' + (excluded ? 'never tile on: ' : 'tiling again: ') + String(w.get_wm_class()).replace(/\s+/g, ' ') + ' seq=' + w.get_stable_sequence());
        try {
            this._main.osdWindowManager.show(w.get_monitor(), this._deps.gio.ThemedIcon.new('window-restore-symbolic'),
                excluded ? this._deps.translate("Window floats") : this._deps.translate("Window tiles again"), null);
        }
        catch (e) {
            // OSD is feedback only — a failing show must not block the retile
        }
        this._deps.retileMonitor(app, w.get_monitor(), null);
    }
}

module.exports = { Exclusions };

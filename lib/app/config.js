/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * Per-App settings owner, derived from gTile 2.2.1 (src/base/config.ts): binds the
 * persisted settings to the app through two declarative tables (settings
 * bindings, hotkey registrations) and owns the teardown order — the split
 * flush writes before the runtime teardowns die, settings.finalize() runs
 * LAST, after every consumer of bound callbacks is gone.
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

const { SETTINGS_KEYS } = require('./lib/model/settings-keys');
const { appColumns, exclRetile, singleRetile } = require('./lib/tiling/retile');
const { swapHotkey } = require('./lib/tiling/swap');
const { panelToggle } = require('./lib/ui/panel');

// The 14 static hotkeys: settings prop, registered name and the tiling
// command the hotkey runs. register removes every name first, so a binding
// change re-registers exactly once.
const HOTKEYS = Object.freeze([
    { name: 'greenTile-auto6', prop: SETTINGS_KEYS.columns6Hotkey, command: (app) => appColumns(app, 6) },
    { name: 'greenTile-auto3', prop: SETTINGS_KEYS.columns3Hotkey, command: (app) => appColumns(app, 3) },
    { name: 'greenTile-autoN', prop: SETTINGS_KEYS.autoOnHotkey, command: (app) => app.auto.activate(app) },
    { name: 'greenTile-autoOff', prop: SETTINGS_KEYS.autoOffHotkey, command: (app) => app.auto.deactivate(app) },
    { name: 'greenTile-preset', prop: SETTINGS_KEYS.presetHotkey, command: (app) => panelToggle(app) },
    { name: 'greenTile-exclude', prop: SETTINGS_KEYS.excludeHotkey, command: (app) => app.excl.toggleFocused(app) },
    { name: 'greenTile-resize-wider', prop: SETTINGS_KEYS.resizeWiderHotkey, command: (app) => app.split.hotkey(app, 'wider') },
    { name: 'greenTile-resize-narrower', prop: SETTINGS_KEYS.resizeNarrowerHotkey, command: (app) => app.split.hotkey(app, 'narrower') },
    { name: 'greenTile-resize-taller', prop: SETTINGS_KEYS.resizeTallerHotkey, command: (app) => app.split.hotkey(app, 'taller') },
    { name: 'greenTile-resize-shorter', prop: SETTINGS_KEYS.resizeShorterHotkey, command: (app) => app.split.hotkey(app, 'shorter') },
    { name: 'greenTile-swap-left', prop: SETTINGS_KEYS.swapLeftHotkey, command: (app) => swapHotkey(app, 'left') },
    { name: 'greenTile-swap-right', prop: SETTINGS_KEYS.swapRightHotkey, command: (app) => swapHotkey(app, 'right') },
    { name: 'greenTile-swap-up', prop: SETTINGS_KEYS.swapUpHotkey, command: (app) => swapHotkey(app, 'up') },
    { name: 'greenTile-swap-down', prop: SETTINGS_KEYS.swapDownHotkey, command: (app) => swapHotkey(app, 'down') },
]);

// The settings bindings: schema key, instance prop and the handler a dialog
// change fires. Order matters — it is the init order of the binds.
const BINDINGS = Object.freeze([
    { key: SETTINGS_KEYS.columns6Hotkey, prop: SETTINGS_KEYS.columns6Hotkey, changed: (config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.columns3Hotkey, prop: SETTINGS_KEYS.columns3Hotkey, changed: (config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.autoOnHotkey, prop: SETTINGS_KEYS.autoOnHotkey, changed: (config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.autoOffHotkey, prop: SETTINGS_KEYS.autoOffHotkey, changed: (config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.presetHotkey, prop: SETTINGS_KEYS.presetHotkey, changed: (config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.excludeHotkey, prop: SETTINGS_KEYS.excludeHotkey, changed: (config) => config.registerHotkeys() },
    {
        key: SETTINGS_KEYS.exclusions,
        prop: SETTINGS_KEYS.exclusions,
        changed: (config) => {
            config.app.excl.apply(config.settings);
            exclRetile(config.app);
        },
    },
    {
        key: SETTINGS_KEYS.excludeAppPicker,
        prop: 'excludeAppPickerValue',
        changed: (config) => {
            config.app.excl.picked(config.settings, config.app, config.settings.getValue(SETTINGS_KEYS.excludeAppPicker));
        },
    },
    { key: SETTINGS_KEYS.resizeWiderHotkey, prop: SETTINGS_KEYS.resizeWiderHotkey, changed: (config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.resizeNarrowerHotkey, prop: SETTINGS_KEYS.resizeNarrowerHotkey, changed: (config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.resizeTallerHotkey, prop: SETTINGS_KEYS.resizeTallerHotkey, changed: (config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.resizeShorterHotkey, prop: SETTINGS_KEYS.resizeShorterHotkey, changed: (config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.swapLeftHotkey, prop: SETTINGS_KEYS.swapLeftHotkey, changed: (config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.swapRightHotkey, prop: SETTINGS_KEYS.swapRightHotkey, changed: (config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.swapUpHotkey, prop: SETTINGS_KEYS.swapUpHotkey, changed: (config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.swapDownHotkey, prop: SETTINGS_KEYS.swapDownHotkey, changed: (config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.panelTheme, prop: SETTINGS_KEYS.panelTheme, changed: (config) => config.app.theme.changed() },
    { key: SETTINGS_KEYS.accentMode, prop: SETTINGS_KEYS.accentMode, changed: (config) => config.app.theme.changed() },
    { key: SETTINGS_KEYS.accentColor, prop: SETTINGS_KEYS.accentColor, changed: (config) => config.app.theme.changed() },
    { key: SETTINGS_KEYS.stateMode, prop: SETTINGS_KEYS.stateMode, changed: (config) => config.app.theme.changed() },
    { key: SETTINGS_KEYS.stateColor, prop: SETTINGS_KEYS.stateColor, changed: (config) => config.app.theme.changed() },
    { key: SETTINGS_KEYS.focusBorder, prop: 'focusBorderValue', changed: (config) => config.app.border.update() },
    {
        key: SETTINGS_KEYS.fillSingleWindow,
        prop: 'fillSingleWindowValue',
        changed: (config) => {
            if (config.settings.getValue(SETTINGS_KEYS.fillSingleWindow) === true) {
                singleRetile(config.app);
            }
        },
    },
]);

class Config {
    constructor(app) {
        this.app = app;
        const Settings = imports.ui.settings;
        this.settings = new Settings.ExtensionSettings(this, 'greenTile@carsteneu');
        for (const binding of BINDINGS) {
            this.settings.bind(binding.key, binding.prop, () => binding.changed(this), null);
        }
        // The exclusions must exist before the first bound callback can apply
        // a dialog change to them.
        this.app.excl.start(this.settings);
        this.registerHotkeys();
        this.app.theme.init(this);
        this.app.focus.connect(this.app);
        this.app.border.init(this.app);
        app.monitors.refresh(() => {
            app.auto.connectAll(app);
            app.session.settle.consumePending(app);
        });
    }

    registerHotkeys() {
        // The hotkeys component carries the fixed greenTile binding names:
        // register removes every name first, so a binding change re-registers
        // exactly once.
        this.app.hotkeys.register(HOTKEYS.map((hotkey) => ({
            name: hotkey.name,
            bindings: this[hotkey.prop],
            callback: () => hotkey.command(this.app),
        })));
    }

    unregisterHotkeys() {
        this.app.hotkeys.remove();
    }

    destroy() {
        this.unregisterHotkeys();
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
    }
}

module.exports = { Config };

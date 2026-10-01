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

const XLET = imports.extensions['greenTile@carsteneu'];

const { SETTINGS_KEYS } = XLET.lib.model['settings-keys'];
const { appColumns, exclRetile, singleRetile } = XLET.lib.tiling.retile;
const { swapHotkey } = XLET.lib.tiling.swap;
const { panelToggle } = XLET.lib.ui.panel;

// The 14 static hotkeys: settings prop, registered name and the tiling
// command the hotkey runs. register removes every name first, so a binding
// change re-registers exactly once.
const HOTKEYS = Object.freeze([
    { name: 'greenTile-auto6', prop: SETTINGS_KEYS.columns6Hotkey, command: (/** @type {AppFacade} */ app) => appColumns(app, 6) },
    { name: 'greenTile-auto3', prop: SETTINGS_KEYS.columns3Hotkey, command: (/** @type {AppFacade} */ app) => appColumns(app, 3) },
    { name: 'greenTile-autoN', prop: SETTINGS_KEYS.autoOnHotkey, command: (/** @type {AppFacade} */ app) => app.auto.activate(app) },
    { name: 'greenTile-autoOff', prop: SETTINGS_KEYS.autoOffHotkey, command: (/** @type {AppFacade} */ app) => app.auto.deactivate(app) },
    { name: 'greenTile-preset', prop: SETTINGS_KEYS.presetHotkey, command: (/** @type {AppFacade} */ app) => panelToggle(app) },
    { name: 'greenTile-exclude', prop: SETTINGS_KEYS.excludeHotkey, command: (/** @type {AppFacade} */ app) => app.excl.toggleFocused(app) },
    { name: 'greenTile-resize-wider', prop: SETTINGS_KEYS.resizeWiderHotkey, command: (/** @type {AppFacade} */ app) => app.split.hotkey(app, 'wider') },
    { name: 'greenTile-resize-narrower', prop: SETTINGS_KEYS.resizeNarrowerHotkey, command: (/** @type {AppFacade} */ app) => app.split.hotkey(app, 'narrower') },
    { name: 'greenTile-resize-taller', prop: SETTINGS_KEYS.resizeTallerHotkey, command: (/** @type {AppFacade} */ app) => app.split.hotkey(app, 'taller') },
    { name: 'greenTile-resize-shorter', prop: SETTINGS_KEYS.resizeShorterHotkey, command: (/** @type {AppFacade} */ app) => app.split.hotkey(app, 'shorter') },
    { name: 'greenTile-swap-left', prop: SETTINGS_KEYS.swapLeftHotkey, command: (/** @type {AppFacade} */ app) => swapHotkey(app, 'left') },
    { name: 'greenTile-swap-right', prop: SETTINGS_KEYS.swapRightHotkey, command: (/** @type {AppFacade} */ app) => swapHotkey(app, 'right') },
    { name: 'greenTile-swap-up', prop: SETTINGS_KEYS.swapUpHotkey, command: (/** @type {AppFacade} */ app) => swapHotkey(app, 'up') },
    { name: 'greenTile-swap-down', prop: SETTINGS_KEYS.swapDownHotkey, command: (/** @type {AppFacade} */ app) => swapHotkey(app, 'down') },
]);

// The settings bindings: schema key, instance prop and the handler a dialog
// change fires. Order matters — it is the init order of the binds.
const BINDINGS = Object.freeze([
    { key: SETTINGS_KEYS.columns6Hotkey, prop: SETTINGS_KEYS.columns6Hotkey, changed: (/** @type {Config} */ config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.columns3Hotkey, prop: SETTINGS_KEYS.columns3Hotkey, changed: (/** @type {Config} */ config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.autoOnHotkey, prop: SETTINGS_KEYS.autoOnHotkey, changed: (/** @type {Config} */ config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.autoOffHotkey, prop: SETTINGS_KEYS.autoOffHotkey, changed: (/** @type {Config} */ config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.presetHotkey, prop: SETTINGS_KEYS.presetHotkey, changed: (/** @type {Config} */ config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.excludeHotkey, prop: SETTINGS_KEYS.excludeHotkey, changed: (/** @type {Config} */ config) => config.registerHotkeys() },
    {
        key: SETTINGS_KEYS.exclusions,
        prop: SETTINGS_KEYS.exclusions,
        changed: (/** @type {Config} */ config) => {
            config.app.excl.apply(config.settings);
            exclRetile(config.app);
        },
    },
    {
        key: SETTINGS_KEYS.excludeAppPicker,
        prop: 'excludeAppPickerValue',
        changed: (/** @type {Config} */ config) => {
            config.app.excl.picked(config.settings, config.app, config.settings.getValue(SETTINGS_KEYS.excludeAppPicker));
        },
    },
    { key: SETTINGS_KEYS.resizeWiderHotkey, prop: SETTINGS_KEYS.resizeWiderHotkey, changed: (/** @type {Config} */ config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.resizeNarrowerHotkey, prop: SETTINGS_KEYS.resizeNarrowerHotkey, changed: (/** @type {Config} */ config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.resizeTallerHotkey, prop: SETTINGS_KEYS.resizeTallerHotkey, changed: (/** @type {Config} */ config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.resizeShorterHotkey, prop: SETTINGS_KEYS.resizeShorterHotkey, changed: (/** @type {Config} */ config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.swapLeftHotkey, prop: SETTINGS_KEYS.swapLeftHotkey, changed: (/** @type {Config} */ config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.swapRightHotkey, prop: SETTINGS_KEYS.swapRightHotkey, changed: (/** @type {Config} */ config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.swapUpHotkey, prop: SETTINGS_KEYS.swapUpHotkey, changed: (/** @type {Config} */ config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.swapDownHotkey, prop: SETTINGS_KEYS.swapDownHotkey, changed: (/** @type {Config} */ config) => config.registerHotkeys() },
    { key: SETTINGS_KEYS.panelTheme, prop: SETTINGS_KEYS.panelTheme, changed: (/** @type {Config} */ config) => config.app.theme.changed() },
    { key: SETTINGS_KEYS.accentMode, prop: SETTINGS_KEYS.accentMode, changed: (/** @type {Config} */ config) => config.app.theme.changed() },
    { key: SETTINGS_KEYS.accentColor, prop: SETTINGS_KEYS.accentColor, changed: (/** @type {Config} */ config) => config.app.theme.changed() },
    { key: SETTINGS_KEYS.stateMode, prop: SETTINGS_KEYS.stateMode, changed: (/** @type {Config} */ config) => config.app.theme.changed() },
    { key: SETTINGS_KEYS.stateColor, prop: SETTINGS_KEYS.stateColor, changed: (/** @type {Config} */ config) => config.app.theme.changed() },
    { key: SETTINGS_KEYS.focusBorder, prop: 'focusBorderValue', changed: (/** @type {Config} */ config) => config.app.border.update() },
    {
        key: SETTINGS_KEYS.fillSingleWindow,
        prop: 'fillSingleWindowValue',
        changed: (/** @type {Config} */ config) => {
            if (config.settings.getValue(SETTINGS_KEYS.fillSingleWindow) === true) {
                singleRetile(config.app);
            }
        },
    },
]);

var Config = class {
    /**
     * @param {AppFacade} app
     */
    constructor(app) {
        this.app = app;
        const Settings = imports.ui.settings;
        // Rollback on partial initialization: every acquisition below (the
        // settings slot with its binds, the installed-changed handler, the
        // hotkeys, the theme sheet, the focus overrides, the border actor) is
        // released when a later acquisition throws — Cinnamon logs an
        // enable()/recreation failure but never calls disable() for it.
        try {
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
        catch (e) {
            // destroy() tolerates the partial state (per-step isolation) and
            // keeps finalize last, then the error travels to the caller.
            this.destroy();
            throw e;
        }
    }

    registerHotkeys() {
        // The hotkeys component carries the fixed greenTile binding names:
        // register removes every name first, so a binding change re-registers
        // exactly once.
        this.app.hotkeys.register(HOTKEYS.map((hotkey) => ({
            name: hotkey.name,
            bindings: /** @type {any} */ (/** @type {unknown} */ (this[/** @type {keyof Config} */ (hotkey.prop)])),
            callback: () => hotkey.command(this.app),
        })));
    }

    unregisterHotkeys() {
        this.app.hotkeys.remove();
    }

    destroy() {
        // Every step runs on its own: a failing step (settings writes via
        // flush are the realistic throwers — full disk, read-only home) must
        // not release the next component. Failures are collected and reported
        // once, so Cinnamon's extensionSystem does not abort on the first one
        // and unload the module with everything after the throw still live.
        /** @type {string[]} */ const failures = [];
        const step = (/** @type {string} */ label, /** @type {() => void} */ teardown) => {
            try {
                teardown();
            }
            catch (e) {
                failures.push(label + ': ' + (e instanceof Error ? e.message : String(e)));
            }
        };
        step('unregister hotkeys', () => this.unregisterHotkeys());
        step('exclusion rows', () => this.app.excl.destroy());
        // resize hotkey steps not yet written (500 ms debounce) must not get lost
        step('split flush', () => this.app.split.flush(this.app));
        step('monitors', () => this.app.monitors.destroy());
        step('auto', () => this.app.auto.destroy());
        // both stay teardown-only: they remove timers/actors, they must not
        // write settings (finalize happens below)
        step('split', () => this.app.split.destroy());
        step('drop', () => this.app.drop.destroy());
        // The settle wait lives on the session, not on this App: its timer dies
        // with the App, its start time survives while a change is pending.
        step('settle', () => this.app.session.settle.teardown());
        step('panel', () => this.app.panel.close());
        step('theme', () => this.app.theme.destroy());
        step('focus', () => this.app.focus.destroy());
        step('border', () => this.app.border.destroy());
        // settings dialog changes must no longer reach the destroyed app;
        // a dialog still open then throws in cinnamonDBus — Cinnamon's behaviour
        // for every finalized xlet. LAST, after every consumer of the bound
        // callbacks is gone — even when a teardown above failed.
        if (this.settings) {
            step('settings finalize', () => this.settings.finalize());
        }
        if (failures.length) {
            try {
                global.logError('greenTile cleanup completed with errors: ' + failures.join('; '));
            }
            catch (_e) {
                // the cleanup already ran; a failing report must not re-arm
                // the unload-despite-error behaviour this isolation prevents
            }
        }
    }
};


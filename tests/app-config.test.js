'use strict';
// Config behaviour at the composition root: the declarative binding tables of
// lib/app/config.js fire the app's handlers, the 14 hotkeys register with the
// configured settings values and re-register on change, and no App recreation
// loses the wiring. Runs the REAL extension.js (extension.js → lib/app) against
// the fake Cinnamon runtime.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cinnamonLoad, load, ROOT } = require('./cinnamon-loader');
const { createCinnamonEnv } = require('./fakes/cinnamon-env');

const loadExtension = () => {
    const env = createCinnamonEnv();
    globalThis.imports = env.imports;
    globalThis.global = env.global;
    const ext = cinnamonLoad(fs.readFileSync(path.join(ROOT, 'extension.js'), 'utf8'), load, 'extension.js');
    ext.init({ uuid: 'greenTile@carsteneu' });
    return { env, ext };
};

const settingsInstance = (env) => env.settingsInstances.find((s) => s.uuid === 'greenTile@carsteneu');

const BOUND_PROPS = [
    'columns6Hotkey', 'columns3Hotkey', 'autoOnHotkey', 'autoOffHotkey',
    'presetHotkey', 'excludeHotkey',
    'exclusions', 'excludeAppPickerValue',
    'resizeWiderHotkey', 'resizeNarrowerHotkey', 'resizeTallerHotkey', 'resizeShorterHotkey',
    'swapLeftHotkey', 'swapRightHotkey', 'swapUpHotkey', 'swapDownHotkey',
    'panelTheme', 'accentMode', 'accentColor', 'stateMode', 'stateColor',
    'focusBorderValue', 'fillSingleWindowValue',
].sort();

test('enable binds the documented 23 settings properties', () => {
    const { env, ext } = loadExtension();
    ext.enable();
    env.flushDisplayConfigNoReply();
    const bound = settingsInstance(env).bindings.map((b) => b.prop).sort();
    assert.deepEqual(bound, BOUND_PROPS);
    assert.equal(env.settingsInstances.length, 1, 'exactly one ExtensionSettings per enable');
});

test('the 14 hotkeys register with the configured settings values', () => {
    const { env, ext } = loadExtension();
    ext.enable();
    env.flushDisplayConfigNoReply();
    const bindingOf = (name) => env.keybindingManager.hotkeys.get(name).binding;
    assert.deepEqual(env.greenTileHotkeys(), [
        'greenTile-auto3', 'greenTile-auto6', 'greenTile-autoN', 'greenTile-autoOff',
        'greenTile-exclude', 'greenTile-preset',
        'greenTile-resize-narrower', 'greenTile-resize-shorter', 'greenTile-resize-taller', 'greenTile-resize-wider',
        'greenTile-swap-down', 'greenTile-swap-left', 'greenTile-swap-right', 'greenTile-swap-up',
    ]);
    assert.equal(bindingOf('greenTile-auto6'), '<Super>6', 'the columns6Hotkey settings value');
    assert.equal(bindingOf('greenTile-preset'), '<Super>p', 'the presetHotkey settings value');
    assert.equal(bindingOf('greenTile-swap-left'), '<Super>Left');
});

test('a hotkey binding change re-registers the 14 static hotkeys once with the new value', () => {
    const { env, ext } = loadExtension();
    ext.enable();
    env.flushDisplayConfigNoReply();
    const inst = settingsInstance(env);
    inst.setValue('presetHotkey', '<Super><Ctrl>z'); // setValue alone fires no binding
    inst.bindings.find((b) => b.prop === 'presetHotkey').cb();
    assert.equal(env.keybindingManager.hotkeys.get('greenTile-preset').binding, '<Super><Ctrl>z',
        'the changed value is registered');
    assert.equal(env.greenTileHotkeys().length, 14, 'exactly the 14 static hotkeys, once');
});

test('the theme settings controls fire the theme handler (accent sheet reloads)', () => {
    const { env, ext } = loadExtension();
    ext.enable();
    env.flushDisplayConfigNoReply();
    const inst = settingsInstance(env);
    const gen = ext.session.app.theme.gen;
    // a custom accent changes the generated css, so the handler must reload
    // the sheet (an identical look deliberately skips the reload)
    inst.setValue('accentMode', 'own');
    inst.setValue('accentColor', 'rgb(10,20,30)');
    inst.bindings.find((b) => b.prop === 'accentMode').cb();
    assert.equal(env.stTheme.unloads.length, 1, 'theme.changed ran: the old sheet was unloaded');
    assert.equal(env.stTheme.loads.length, 1, 'the reloaded sheet is the single live one');
    assert.notEqual(ext.session.app.theme.gen, gen, 'the reload took a fresh accent generation');
});

test('a monitors-changed App recreation re-derives every binding config without stacking registrations', () => {
    const { env, ext } = loadExtension();
    ext.enable();
    env.flushDisplayConfigNoReply();
    env.layoutManager.emit('monitors-changed');
    env.flushDisplayConfigNoReply();
    assert.deepEqual(settingsInstance(env).bindings.map((b) => b.prop).sort(), BOUND_PROPS,
        'the recreated Config binds the same property set');
    assert.deepEqual(env.greenTileHotkeys().length, 14, 'no duplicated hotkey names');
});

'use strict';
// Fake-strictness contract (todo_fixes issue 13): the runtime-critical Cinnamon
// namespaces (global subobjects, imports.ui.main, tooltips, panel,
// imports.gi namespace list, imports.misc) reject unknown member access with a
// throw, so a typo'd runtime access fails the running test instead of silently
// stubbing along (learned from global.dispaly / Tooltip_typo / overlay_grup /
// Main.getTabLst passing a green suite on the old permissive fakes). Each
// negative case is paired with a counter-probe pinning the legit API twin;
// branch contents stay behavior-identical to the former silent stubs.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCinnamonEnv } = require('../helpers/fakes/cinnamon-env');

const fakeError = /fake (global|imports\.[a-z.]+):/;

test('global rejects unknown subobject access (global.dispaly class)', () => {
    const env = createCinnamonEnv();
    assert.throws(() => env.global.dispaly, fakeError);
    assert.throws(() => env.global.overlay_grup, fakeError);
    assert.throws(() => env.global.somethingNew, fakeError);
});

test('global keeps its documented members', () => {
    const env = createCinnamonEnv();
    env.global.log('hello');
    assert.equal(env.logs.length, 1);
    assert.doesNotThrow(() => env.global.display.focus_window);
    assert.doesNotThrow(() => env.global.overlay_group.add_actor({}));
    assert.doesNotThrow(() => env.global.get_current_time());
    assert.doesNotThrow(() => env.global.set_cursor(''));
});

test('imports.ui.main rejects typos (Main.getTabLst class)', () => {
    const env = createCinnamonEnv();
    assert.throws(() => env.imports.ui.main.getTabLst(), fakeError);
    assert.equal(env.imports.ui.main.getTabList(), env.tabList);
    assert.doesNotThrow(() => env.imports.ui.main.keybindingManager.addHotKey('k', {}, () => {}));
    // screen.js usableArea iterates Main.panelManager.getPanelsInMonitor(): the
    // fake keeps the surrounding-panels list empty exactly like the old silent stub
    assert.deepEqual(env.imports.ui.main.panelManager.getPanelsInMonitor(0), []);
});

test('imports.ui lists exactly the namespaces greenTile uses', () => {
    const env = createCinnamonEnv();
    assert.throws(() => env.imports.ui.tooltip, fakeError);
    assert.doesNotThrow(() => env.imports.ui.settings.BindingDirection);
    assert.doesNotThrow(() => new env.imports.ui.tooltips.Tooltip({}, 'x'));
    assert.throws(() => env.imports.ui.tooltips.Tooltip_typo, fakeError);
    assert.doesNotThrow(() => env.imports.ui.panel.PanelLoc.top);
});

test('imports.gi covers Clutter/Pango/GObject constants and rejects unknown namespaces', () => {
    const env = createCinnamonEnv();
    assert.equal(env.imports.gi.Clutter.EVENT_PROPAGATE, false);
    assert.equal(env.imports.gi.Clutter.EVENT_STOP, true);
    assert.ok(env.imports.gi.Clutter.EventType.BUTTON_PRESS !== undefined);
    assert.ok(env.imports.gi.Clutter.KEY_Escape !== undefined);
    assert.equal(env.imports.gi.Pango.EllipsizeMode.NONE, 'none');
    // used by extension.js wiring + the scope vendor guard
    assert.doesNotThrow(() => env.imports.gi.GObject.signal_handler_is_connected({}, 1));
    assert.throws(() => env.imports.gi.GObjekt, fakeError);
    assert.doesNotThrow(() => env.imports.gi.Meta.MaximizeFlags.HORIZONTAL);
    assert.doesNotThrow(() => env.imports.gi.Cinnamon.Cursor.RESIZE_BOTTOM_RIGHT);
});

test('imports.misc carries util.spawn and rejects namespace typos', () => {
    const env = createCinnamonEnv();
    assert.equal(typeof env.imports.misc.util.spawn, 'function');
    assert.throws(() => env.imports.misc.uti, fakeError);
    assert.equal(env.imports.misc.util.spawn_typo, undefined);
    assert.doesNotThrow(() => env.imports.misc.signalManager.SignalManager);
});

test('strict namespaces are not callable or constructible', () => {
    const env = createCinnamonEnv();
    assert.throws(() => env.imports.ui(), fakeError);
    assert.throws(() => new (env.imports.gi)(), fakeError);
});

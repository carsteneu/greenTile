'use strict';
// Lifecycle baseline: runs the REAL greenTile.js through init/enable, a
// monitors-changed emission (App recreation inside the same "session") and
// disable — against the fake Cinnamon runtime in tests/fakes/cinnamon-env.js.
// It measures the balance after disable: connected handlers, live timers,
// registered greenTile hotkeys, Meta custom bindings and settings finalization.
// Assertions currently failing at the baseline are marked { todo } with the
// loop that fixes them — they must flip to real assertions in later loops.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cinnamonLoad, load, ROOT } = require('./cinnamon-loader');
const { createCinnamonEnv } = require('./fakes/cinnamon-env');

const loadGreenTile = () => {
    const env = createCinnamonEnv();
    globalThis.imports = env.imports;
    globalThis.global = env.global;
    const src = fs.readFileSync(path.join(ROOT, 'greenTile.js'), 'utf8');
    const greenTile = cinnamonLoad(src, load, 'greenTile.js');
    // production lifecycle runs init(metadata) before enable()
    greenTile.init({ uuid: 'greenTile@carsteneu' });
    return { env, greenTile };
};

const HOTKEY_NAMES = [
    'greenTile-auto6', 'greenTile-auto3', 'greenTile-autoN', 'greenTile-autoOff',
    'greenTile-preset', 'greenTile-exclude',
    'greenTile-resize-wider', 'greenTile-resize-narrower', 'greenTile-resize-taller', 'greenTile-resize-shorter',
    'greenTile-swap-left', 'greenTile-swap-right', 'greenTile-swap-up', 'greenTile-swap-down',
].sort();

const FOCUS_BINDINGS = ['push-tile-down', 'push-tile-left', 'push-tile-right', 'push-tile-up'].sort();

// enable() wires: 14 hotkeys, 4 Meta custom bindings, one AppSystem
// 'installed-changed', one themeManager 'theme-set', the monitors-changed
// handler and — after the DisplayConfig reply is flushed — the auto-tiling
// observers (screen n-workspaces, display grab/enter/create x4, one
// switch-workspace) plus the border observers (display focus, workspace switch).
test('enable connects the documented handler set exactly once', () => {
    const { env, greenTile } = loadGreenTile();
    assert.equal(env.totalHandlers(), 0);
    greenTile.enable();
    env.flushDisplayConfigNoReply();
    assert.deepEqual(env.greenTileHotkeys(), HOTKEY_NAMES);
    assert.deepEqual([...env.customBindings.keys()].sort(), FOCUS_BINDINGS);
    assert.equal(env.layoutManager.count('monitors-changed'), 1);
    assert.equal(env.appSystem.count('installed-changed'), 1);
    assert.equal(env.themeManager.count('theme-set'), 1);
    assert.equal(env.display.count('notify::focus-window'), 1);
    assert.equal(env.display.count('grab-op-begin'), 1);
    assert.equal(env.display.count('grab-op-end'), 1);
    assert.equal(env.display.count('window-entered-monitor'), 1);
    assert.equal(env.display.count('window-created'), 1);
    assert.equal(env.screen.count('notify::n-workspaces'), 1);
    assert.equal(env.workspaceManager.count('workspace-switched'), 1);
    assert.equal(env.windowManager.count('switch-workspace'), 1);
    assert.equal(env.liveTimers().length, 0, 'no timer without a pending settle');
    assert.equal(env.settingsSlots.get('greenTile@carsteneu') === null, false);
});

test('monitors-changed recreates the App without stacking duplicate registrations, settle timer runs', () => {
    const { env, greenTile } = loadGreenTile();
    greenTile.enable();
    env.flushDisplayConfigNoReply();
    env.layoutManager.emit('monitors-changed');
    // the destroyed App must not answer the stale DisplayConfig reply
    env.flushDisplayConfigNoReply();
    assert.deepEqual(env.greenTileHotkeys(), HOTKEY_NAMES, 'exactly the 14 hotkeys, once');
    assert.equal(env.layoutManager.count('monitors-changed'), 1);
    assert.equal(env.display.count('grab-op-begin'), 1, 'auto observers reconnected once');
    // the pending settle flag routes a settle wait through the App recreation
    const timers = env.liveTimers();
    assert.equal(timers.length, 1, 'one settle timer after the monitor change');
    assert.equal(timers[0].kind, 'mainloop');
});

test('disable leaves no handlers, timers, hotkeys or bindings behind and finalizes settings', () => {
    const { env, greenTile } = loadGreenTile();
    greenTile.enable();
    env.flushDisplayConfigNoReply();
    env.layoutManager.emit('monitors-changed');
    env.flushDisplayConfigNoReply();
    greenTile.disable();
    assert.deepEqual(env.greenTileHotkeys(), [], 'no greenTile hotkey registered');
    assert.deepEqual([...env.customBindings.keys()], [], 'Meta custom bindings reset');
    assert.equal(env.layoutManager.count(), 0, 'monitors-changed disconnected');
    assert.equal(env.totalHandlers(), 0, 'every Main/global handler disconnected');
    assert.equal(env.liveTimers().length, 0, 'no timer left running');
    const slot = env.settingsSlots.get('greenTile@carsteneu');
    assert.equal(slot, null, 'settings slot finalized (nulled)');
    assert.equal(env.settingsInstances.every((s) => s.finalized), true, 'every settings instance finalized');
});

test('a late DisplayConfig reply for a destroyed App touches nothing (epoch guard)', () => {
    const { env, greenTile } = loadGreenTile();
    greenTile.enable();
    env.flushDisplayConfigNoReply();
    // creates App #2 and queues its DisplayConfig refresh
    env.layoutManager.emit('monitors-changed');
    // destroy both the App and its pending refresh epoch
    greenTile.disable();
    const handlers = env.totalHandlers();
    const timers = env.liveTimers().length;
    env.flushDisplayConfigNoReply();
    assert.equal(env.totalHandlers(), handlers, 'no observers connected by the stale reply');
    assert.equal(env.liveTimers().length, timers, 'no timer scheduled by the stale reply');
});

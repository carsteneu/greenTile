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
    // process-local by design: node:test runs each test file in its own child
    // process, and build-release.sh ships tests/ never — the fake globals
    // cannot reach the desktop or shipped code
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

test('enable twice without disable stacks a second session (documented behaviour, same leak class as the old module vars)', () => {
    const { env, greenTile } = loadGreenTile();
    greenTile.enable();
    greenTile.enable();
    env.flushDisplayConfigNoReply();
    assert.equal(env.layoutManager.count('monitors-changed'), 2, 'each enable wires its own session handler');
    assert.equal(env.display.count('grab-op-begin'), 2, 'the auto observers connect per session: they stack');
    assert.deepEqual(env.greenTileHotkeys(), HOTKEY_NAMES, 'hotkey names overwrite by name, no duplication');
    greenTile.disable();
    assert.equal(env.layoutManager.count('monitors-changed'), 1,
        'disable destroys only the newest session — the leak class of the original `app`/monitorChangedSignal overwrites, left unchanged by mandate');
});

test('disable takes the monitors-changed handler down first: a monitor change cannot resurrect an App', () => {
    const { env, greenTile } = loadGreenTile();
    greenTile.enable();
    env.flushDisplayConfigNoReply();
    greenTile.disable();
    const handlers = env.totalHandlers();
    env.layoutManager.emit('monitors-changed');
    assert.equal(env.totalHandlers(), handlers, 'nothing reconnected by the emission');
    assert.deepEqual(env.greenTileHotkeys(), [], 'no hotkeys came back');
    env.flushDisplayConfigNoReply();
    assert.equal(env.queuedDBus.length, 0, 'no App was recreated: no new DisplayConfig refresh');
    assert.equal(env.liveTimers().length, 0, 'no settle timer scheduled');
});

test('disable/enable on the same loaded module yields exactly one live session set', () => {
    const { env, greenTile } = loadGreenTile();
    greenTile.enable();
    greenTile.disable();
    greenTile.enable();
    env.flushDisplayConfigNoReply();
    assert.equal(env.layoutManager.count('monitors-changed'), 1, 'one session handler, not two');
    assert.deepEqual(env.greenTileHotkeys(), HOTKEY_NAMES, 'exactly the 14 hotkeys, once');
    assert.equal(env.display.count('grab-op-begin'), 1);
    assert.equal(env.liveTimers().length, 0, 'no leftover settle timer across the cycle');
});

// Fake MetaWindow / workspace: signal accounting + just enough geometry for the
// auto-tiling observer paths the real greenTile.js runs against.
const makeWindow = (seq) => {
    const handlers = [];
    let nextId = 1;
    const windowHub = {
        minimized: false,
        connect(sig, cb) {
            handlers.push({ sig, cb, id: nextId });
            return nextId++;
        },
        disconnect(id) {
            const at = handlers.findIndex((h) => h.id === id);
            if (at === -1)
                throw new Error('window: no such signal handler ' + id);
            handlers.splice(at, 1);
        },
        count(sig) {
            return handlers.filter((h) => !sig || h.sig === sig).length;
        },
        emit(sig, ...args) {
            for (const h of handlers.slice())
                if (h.sig === sig)
                    h.cb(...args);
        },
        get_stable_sequence: () => seq,
        get_window_type: () => 6, // Meta.WindowType.NORMAL in the fake Meta
        get_wm_class: () => 'FakeWindow',
        get_monitor: () => 0,
        get_workspace: () => null, // === activeWorkspace (null) in the default env
    };
    return windowHub;
};
const makeWorkspace = () => {
    const handlers = [];
    let nextId = 1;
    return {
        __hub: 'workspace',
        windows: [],
        connect(sig, cb) {
            handlers.push({ sig, cb, id: nextId });
            return nextId++;
        },
        disconnect(id) {
            const at = handlers.findIndex((h) => h.id === id);
            if (at === -1)
                throw new Error('workspace: no such signal handler ' + id);
            handlers.splice(at, 1);
        },
        count(sig) {
            return handlers.filter((h) => !sig || h.sig === sig).length;
        },
        list_windows: () => [],
    };
};

test('auto observer: a tracked window releases both per-window handlers when it is unmanaged', () => {
    const { env, greenTile } = loadGreenTile();
    greenTile.enable();
    env.flushDisplayConfigNoReply();
    const w = makeWindow(11);
    env.display.emit('window-created', w);
    assert.equal(w.count('notify::minimized'), 1, 'minimize tracking connected once');
    assert.equal(w.count('unmanaged'), 1, 'unmanaged cleanup connected once');
    w.emit('unmanaged');
    assert.equal(w.count('notify::minimized'), 0, 'notify::minimized handler released');
    assert.equal(w.count('unmanaged'), 0, 'unmanaged handler released');
    greenTile.disable();
    assert.equal(env.totalHandlers(), 0, 'the release path is destroy-tolerant');
});

test('auto observer: notify::n-workspaces reconnect leaves exactly one window-added/removed pair per workspace', () => {
    const { env, greenTile } = loadGreenTile();
    const ws0 = makeWorkspace();
    env.workspaces.push(ws0);
    greenTile.enable();
    env.flushDisplayConfigNoReply();
    const pairCount = (ws) => ws.count('window-added') + ws.count('window-removed');
    assert.equal(pairCount(ws0), 2, 'initial connect: one added/removed pair');
    const ws1 = makeWorkspace();
    env.workspaces.push(ws1);
    env.screen.emit('notify::n-workspaces');
    assert.equal(pairCount(ws0), 2, 'old workspace dropped and reconnected, not stacked');
    assert.equal(pairCount(ws1), 2, 'new workspace connected exactly once');
    assert.equal(env.screen.count('notify::n-workspaces'), 1, 'the global reconnect handler stays single');
    greenTile.disable();
    assert.equal(pairCount(ws0), 0, 'workspace handlers released on disable');
    assert.equal(pairCount(ws1), 0, 'workspace handlers released on disable');
    assert.equal(env.totalHandlers(), 0);
});

test('auto observer: monitors-changed removes pending per-monitor debounce timers (no stale retile)', () => {
    const { env, greenTile } = loadGreenTile();
    greenTile.enable();
    env.flushDisplayConfigNoReply();
    const w = makeWindow(7);
    env.display.emit('window-created', w);
    w.emit('notify::minimized');
    assert.equal(env.liveTimers().filter((t) => t.ms === 300).length, 1, 'auto debounce timer pending');
    env.layoutManager.emit('monitors-changed');
    env.flushDisplayConfigNoReply();
    assert.equal(env.liveTimers().filter((t) => t.ms === 300).length, 0, 'debounce timer died with the App');
    greenTile.disable();
    assert.equal(env.liveTimers().length, 0, 'disable still leaves 0 timers');
});

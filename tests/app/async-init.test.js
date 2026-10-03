'use strict';
// Asynchronous start-up (todo_fixes item 3) and early pause commands (item 4),
// driven through the REAL extension.js on the fake Cinnamon runtime.
//
// Item 3: the monitor reply arrives after the Config constructor returned, so a
// failure inside the monitor-ready callback is not covered by the constructor's
// catch. Every registration must be owned as it is made (or rolled back locally
// when the next step fails) and connectAll is all-or-nothing — a half-started
// observer set must not survive, and after disable nothing of ours stays behind.
//
// Item 4: the 14 hotkeys exist before the registry is ready, but a layout write
// needs the monitor key. An auto on/off pressed in that window must not be
// dropped while reporting success — it is queued on the session and applied
// before the first retile, in the order it was pressed.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, makeWindow, MONITOR, settingsInstance } = require('../helpers/fakes/cinnamon-harness');

// A workspace hub with real connect/disconnect accounting. `failOn` makes the
// FIRST connect of that signal throw once — a one-shot injected failure, so a
// fresh attempt on the same object afterwards succeeds.
const makeWorkspace = (failOn = null) => {
    const handlers = [];
    let nextId = 1;
    let fail = failOn;
    return {
        connect(sig, cb) {
            if (fail === sig) {
                fail = null;
                throw new Error('injected ' + sig + ' connect failure');
            }
            const id = nextId++;
            handlers.push({ sig, cb, id });
            return id;
        },
        disconnect(id) {
            const at = handlers.findIndex((h) => h.id === id);
            if (at === -1) {
                throw new Error('workspace: no such handler ' + id);
            }
            handlers.splice(at, 1);
        },
        count(sig) {
            return handlers.filter((h) => !sig || h.sig === sig).length;
        },
        list_windows: () => [],
    };
};

const layoutsWrites = (env) => settingsInstance(env).callLog.filter((c) => c.op === 'setValue' && c.key === 'layouts');

// --- Item 3 -----------------------------------------------------------------

test('item 3: a failed second per-window connect releases the first (no leaked notify::minimized)', () => {
    const { env, ext } = makeEnv();
    env.layoutManager.monitors.push(MONITOR);
    ext.enable();
    env.flushDisplayConfigNoReply();
    const app = ext.currentSession().app;
    const w = makeWindow(env, 11, [0, 0, 400, 300]);
    let calls = 0;
    const realConnect = w.connect.bind(w);
    w.connect = (sig, cb) => {
        calls += 1;
        if (calls === 2) {
            throw new Error('injected second connect failure');
        }
        return realConnect(sig, cb);
    };
    assert.throws(() => app.auto.trackWindow(app, w), /injected second connect failure/);
    assert.equal(w.count(), 0, 'the first handler is released, nothing stays on the window');
    assert.equal(app.auto._tracked.length, 0, 'nothing recorded for teardown to miss');
    ext.disable();
    assert.equal(env.totalHandlers(), 0, 'disable stays clean');
});

test('item 3: a destroyed wrapper throws before any handler is connected', () => {
    const { env, ext } = makeEnv();
    env.layoutManager.monitors.push(MONITOR);
    ext.enable();
    env.flushDisplayConfigNoReply();
    const app = ext.currentSession().app;
    const w = makeWindow(env, 12, [0, 0, 400, 300]);
    w.get_stable_sequence = () => {
        throw new Error('destroyed wrapper');
    };
    assert.throws(() => app.auto.trackWindow(app, w), /destroyed wrapper/);
    assert.equal(w.count(), 0, 'no handler was connected before the throw');
    ext.disable();
    assert.equal(env.totalHandlers(), 0);
});

test('item 3: a failed workspace pair connect rolls the whole monitor-ready start back', () => {
    const { env, ext } = makeEnv();
    const ws = makeWorkspace('window-removed');
    env.workspaces.push(ws);
    env.layoutManager.monitors.push(MONITOR);
    ext.enable();
    env.flushDisplayConfigNoReply();
    assert.equal(ws.count('window-added'), 0, 'the first handler was released when the second connect failed');
    assert.equal(ws.count(), 0, 'the workspace carries no handler at all');
    assert.equal(env.workspaceManager.count('notify::n-workspaces'), 0, 'the scope connect never happened');
    assert.equal(env.display.count('grab-op-begin'), 0, 'the global observer connects were rolled back');
    assert.equal(env.display.count('window-created'), 0);
    assert.equal(env.display.count('window-entered-monitor'), 0);
    assert.equal(env.windowManager.count('switch-workspace'), 0);
    assert.equal(env.logErrors.some((l) => l.indexOf('greenTile monitor-ready start failed') === 0), true,
        'the asynchronous failure is reported instead of escaping uncaught');
    ext.disable();
    assert.equal(env.totalHandlers(), 0, 'nothing half-started survived to disable');
    assert.equal(env.liveTimers().length, 0);
});

test('item 3: a fresh start after the failed one registers everything exactly once', () => {
    const { env, ext } = makeEnv();
    const ws = makeWorkspace('window-added');
    env.workspaces.push(ws);
    env.layoutManager.monitors.push(MONITOR);
    ext.enable();
    env.flushDisplayConfigNoReply();
    assert.equal(env.logErrors.some((l) => l.indexOf('greenTile monitor-ready start failed') === 0), true,
        'the first start failed');
    // the failure was one-shot: a monitor change builds a fresh App and a fresh
    // Auto whose connectAll must register the full observer set exactly once
    env.layoutManager.emit('monitors-changed');
    env.flushDisplayConfigNoReply();
    assert.equal(ws.count('window-added'), 1, 'exactly one window-added handler');
    assert.equal(ws.count('window-removed'), 1, 'exactly one window-removed handler');
    assert.equal(env.workspaceManager.count('notify::n-workspaces'), 1);
    assert.equal(env.display.count('grab-op-begin'), 1);
    assert.equal(env.display.count('window-created'), 1);
    assert.equal(env.windowManager.count('switch-workspace'), 1);
    ext.disable();
    assert.equal(env.totalHandlers(), 0, 'the retry leaves nothing behind either');
});

// --- Item 4 -----------------------------------------------------------------

const bootBeforeReply = (env, ext) => {
    env.workspaces.push(makeWorkspace());
    env.activeWorkspace = { index: () => 0 };
    env.layoutManager.monitors.push(MONITOR);
    ext.enable();
    // the DisplayConfig reply is deliberately NOT flushed: the registry is not ready
};

const autoOf = (env, key) => env.keybindingManager.hotkeys.get(key).cb();

test('item 3: a failing workspace reconnect mid-life leaves no partial set and does not throw', () => {
    const { env, ext } = makeEnv();
    const ws = makeWorkspace();
    env.workspaces.push(ws);
    env.layoutManager.monitors.push(MONITOR);
    ext.enable();
    env.flushDisplayConfigNoReply();
    assert.equal(ws.count(), 2, 'both handlers registered');
    // a second workspace whose window-removed connect fails: the reconnect that
    // notify::n-workspaces triggers must not leave a half-connected set behind,
    // and it must not let the throw escape into the signal emission
    env.workspaces.push(makeWorkspace('window-removed'));
    env.workspaceManager.emit('notify::n-workspaces');
    assert.equal(ws.count(), 0, 'the all-or-nothing reconnect dropped the whole set');
    assert.equal(env.logErrors.some((l) => l.indexOf('greenTile workspace reconnect failed') === 0), true,
        'the reconnect failure is reported');
    assert.equal(env.workspaceManager.count('notify::n-workspaces'), 1,
        'the changed-signal observer itself survives');
    ext.disable();
    assert.equal(env.totalHandlers(), 0);
});

test('item 3: a failed start after a recreation still arms the settle wait', () => {
    const { env, ext } = makeEnv();
    env.workspaces.push(makeWorkspace());
    env.layoutManager.monitors.push(MONITOR);
    ext.enable();
    env.flushDisplayConfigNoReply();
    // a monitor change routes the settle wait through a recreation
    env.workspaces.push(makeWorkspace('window-removed'));
    env.layoutManager.emit('monitors-changed');
    env.flushDisplayConfigNoReply();
    assert.equal(env.logErrors.some((l) => l.indexOf('greenTile monitor-ready start failed') === 0), true,
        'the failed start is reported');
    // the settle wait retiles the windows Muffin moved onto the new monitor: it
    // must not be skipped just because the observer registration failed
    assert.ok(env.liveTimers().some((t) => t.kind === 'mainloop'), 'the settle wait was still armed');
    ext.disable();
});

test('item 4: auto-off before the monitor reply is applied at readiness, not dropped', () => {
    const { env, ext } = makeEnv();
    bootBeforeReply(env, ext);
    const app = ext.currentSession().app;
    assert.equal(app.monitors.ready, false, 'the registry is still pending');
    autoOf(env, 'greenTile-autoOff');
    assert.equal(layoutsWrites(env).length, 0, 'nothing can be written before the monitor key exists');
    assert.equal(env.logs.includes('greenTile auto tiling off for ws0'), false,
        'no success is claimed for a change that was not written');
    assert.equal(env.logs.includes('greenTile auto tiling off pending until monitors ready for ws0'), true,
        'the request is reported as pending');
    env.flushDisplayConfigNoReply();
    const writes = layoutsWrites(env);
    assert.equal(writes.length, 1, 'the queued pause is applied once the registry is ready');
    const ref = app.split.ref(app, 0, 0, 2);
    assert.ok(ref, 'monitor key resolved after the reply');
    assert.equal(JSON.parse(writes[0].value)[ref.mkey][ref.wskey].auto, false,
        'the requested pause is in the settings');
    ext.disable();
});

test('item 4: a queued on/off sequence resolves to the last command, one write', () => {
    const { env, ext } = makeEnv();
    bootBeforeReply(env, ext);
    autoOf(env, 'greenTile-autoN');
    autoOf(env, 'greenTile-autoOff');
    autoOf(env, 'greenTile-autoN');
    env.flushDisplayConfigNoReply();
    const app = ext.currentSession().app;
    const ref = app.split.ref(app, 0, 0, 2);
    const writes = layoutsWrites(env);
    assert.equal(writes.length, 1, 'the queued intents collapse to one write per monitor+workspace');
    assert.equal(JSON.parse(writes.at(-1).value)[ref.mkey][ref.wskey].auto, true,
        'the last command (on) is the final state');
    assert.equal(env.logs.includes('greenTile auto tiling on for ws0'), true, 'the surviving intent was applied');
    ext.disable();
});

test('item 4: a queued pause survives a recreation and gates the settle retile', () => {
    const { env, ext } = makeEnv();
    bootBeforeReply(env, ext);
    autoOf(env, 'greenTile-autoOff');
    // a monitor change routes the settle wait through a recreation
    env.layoutManager.emit('monitors-changed');
    env.flushDisplayConfigNoReply();
    const app = ext.currentSession().app;
    const ref = app.split.ref(app, 0, 0, 2);
    const writes = layoutsWrites(env);
    assert.ok(writes.length >= 1, 'the pause survived the recreation and was written');
    assert.equal(JSON.parse(writes.at(-1).value)[ref.mkey][ref.wskey].auto, false,
        'the recreated App applies the queued pause');
    // the settle wait is armed, but its retile reads the layout: the pause holds
    // and no debounced retile is scheduled against it
    assert.ok(env.liveTimers().some((t) => t.kind === 'mainloop'), 'the settle wait was armed');
    assert.equal(app.ops.layoutFor(app, 0, 0).auto, false, 'the effective state is the requested pause');
    assert.equal(env.liveTimers().filter((t) => t.ms === 0 || t.ms === 300).length, 0,
        'no retile timer was scheduled against the pause');
    ext.disable();
});

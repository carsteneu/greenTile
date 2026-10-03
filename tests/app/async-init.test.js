'use strict';
// Asynchronous start-up (todo_fixes item 3) and early pause commands (item 4),
// driven through the REAL extension.js on the fake Cinnamon runtime.
//
// Item 3: the monitor reply arrives after the Config constructor returned, so a
// failure inside the monitor-ready callback is not covered by the constructor's
// catch. The observer set must never be half-started (every acquisition owned as
// it is made, connectAll all-or-nothing with one bounded retry) and a throw in a
// later ready-phase step (the queued auto commands, the settle wait) must be
// reported without escaping and without tearing down what already succeeded.
// After disable nothing of ours stays behind.
//
// Item 4: the 14 hotkeys exist before the registry is ready, but a layout write
// needs the monitor key. An auto on/off pressed in that window must not be
// dropped while reporting success — it is queued on the session and applied
// before the first retile, in the order it was pressed.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, makeWindow, MONITOR, settingsInstance } = require('../helpers/fakes/cinnamon-harness');

// A workspace hub with real connect/disconnect accounting. `failOn` makes the
// first `times` connects of that signal throw — one-shot by default, persistent
// when `times` is Infinity.
const makeWorkspace = (failOn = null, times = 1) => {
    const handlers = [];
    let nextId = 1;
    let remaining = failOn ? times : 0;
    const attempts = [];
    return {
        connect(sig, cb) {
            attempts.push(sig);
            if (remaining > 0 && failOn === sig) {
                remaining -= 1;
                throw new Error('injected ' + sig + ' connect failure');
            }
            const id = nextId++;
            handlers.push({ sig, cb, id });
            return id;
        },
        attempts(sig) {
            return attempts.filter((s) => s === sig).length;
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

const boot = (env, ext) => {
    env.workspaces.push(makeWorkspace());
    env.activeWorkspace = { index: () => 0 };
    env.layoutManager.monitors.push(MONITOR);
    ext.enable();
};

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

test('item 3: a one-shot connect failure is retried once and registers everything exactly once', () => {
    const { env, ext } = makeEnv();
    const ws = makeWorkspace('window-removed');
    env.workspaces.push(ws);
    env.layoutManager.monitors.push(MONITOR);
    ext.enable();
    env.flushDisplayConfigNoReply();
    // the rollback restored the pre-attempt state, so the retry registers the
    // complete observer set — no half-started state and no error reported
    assert.equal(ws.count('window-added'), 1, 'exactly one window-added handler after the retry');
    assert.equal(ws.count('window-removed'), 1, 'exactly one window-removed handler after the retry');
    assert.equal(ws.attempts('window-removed'), 2, 'the failing connect was attempted exactly twice (one retry)');
    assert.equal(env.workspaceManager.count('notify::n-workspaces'), 1);
    assert.equal(env.display.count('grab-op-begin'), 1);
    assert.equal(env.display.count('window-created'), 1);
    assert.equal(env.display.count('window-entered-monitor'), 1);
    assert.equal(env.windowManager.count('switch-workspace'), 1);
    assert.equal(env.logErrors.length, 0, 'a recovered one-shot failure is not reported as a failed start');
    ext.disable();
    assert.equal(env.totalHandlers(), 0, 'the retry leaves nothing behind');
    assert.equal(env.liveTimers().length, 0);
});

test('item 3: a rollback that did not release cleanly is not retried (no duplicate handlers)', () => {
    const { env, ext } = makeEnv();
    const ws = makeWorkspace('window-removed', Infinity);
    env.workspaces.push(ws);
    env.layoutManager.monitors.push(MONITOR);
    ext.enable();
    const app = ext.currentSession().app;
    // Simulate the one precondition that makes a retry unsafe: the scope release
    // left an entry in the signal manager. Retrying would connect a fresh
    // callback next to the surviving handler and double-handle every event, so
    // the failure must propagate instead.
    app.auto._deps.signalManager.getSignals = () => [{ sigName: 'x', obj: {}, cb: null, id: 1 }];
    env.flushDisplayConfigNoReply();
    assert.equal(ws.attempts('window-removed'), 1, 'the failing connect was attempted once — no retry over a dirty slate');
    assert.equal(env.logErrors.some((l) => l.indexOf('greenTile monitor-ready start failed') === 0), true,
        'the failure is reported');
    assert.equal(ws.count(), 0, 'and the partial set was still released');
    ext.disable();
});

test('item 3: a persistent connect failure rolls the whole start back and reports it', () => {
    const { env, ext } = makeEnv();
    const ws = makeWorkspace('window-removed', Infinity);
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

test('item 3: after a persistent failure the app is left consistently empty, not half-started', () => {
    const { env, ext } = makeEnv();
    const ws = makeWorkspace('window-removed', Infinity);
    env.workspaces.push(ws);
    env.layoutManager.monitors.push(MONITOR);
    ext.enable();
    env.flushDisplayConfigNoReply();
    // measured facts on the degraded path: the monitor registry is ready and the
    // config-owned hotkeys exist (they are what item 4's queue rides), while the
    // observer set is consistently EMPTY — no signal of ours stays connected
    assert.equal(ext.currentSession().app.monitors.ready, true, 'the registry itself is not ours to roll back');
    assert.equal(env.greenTileHotkeys().length, 14, 'the hotkeys stay registered');
    // every signal the observer start owns is EMPTY (not half) ...
    assert.equal(ws.count(), 0, 'no per-workspace handler');
    assert.equal(env.workspaceManager.count('notify::n-workspaces'), 0);
    assert.equal(env.display.count('grab-op-begin'), 0);
    assert.equal(env.display.count('grab-op-end'), 0);
    assert.equal(env.display.count('window-created'), 0);
    assert.equal(env.display.count('window-entered-monitor'), 0);
    assert.equal(env.windowManager.count('switch-workspace'), 0);
    // ... while the rest of the extension keeps running (the rollback is scoped
    // to the observer start, it does not tear down the components that are fine)
    assert.ok(env.totalHandlers() > 0, 'the other components stay connected');
    assert.equal(env.liveTimers().length, 0, 'no observer-side timer is left behind');
    // the settle wait is still armed, so the windows Muffin moved are retiled
    assert.equal(env.logErrors.some((l) => l.indexOf('greenTile monitor-ready start failed') === 0), true);
    ext.disable();
    assert.equal(env.greenTileHotkeys().length, 0, 'disable releases the hotkeys');
    assert.equal(env.totalHandlers(), 0);
});

test('item 3: a fresh App after the failed one registers everything exactly once', () => {
    const { env, ext } = makeEnv();
    const bad = makeWorkspace('window-added', Infinity);
    env.workspaces.push(bad);
    env.layoutManager.monitors.push(MONITOR);
    ext.enable();
    env.flushDisplayConfigNoReply();
    assert.equal(env.logErrors.some((l) => l.indexOf('greenTile monitor-ready start failed') === 0), true,
        'the first start failed');
    // the failing workspace is gone with the old workspace set: the recreation
    // builds a fresh App whose connectAll registers the full set exactly once
    env.workspaces = [makeWorkspace()];
    env.layoutManager.emit('monitors-changed');
    env.flushDisplayConfigNoReply();
    const ws2 = env.workspaces[0];
    assert.equal(ws2.count('window-added'), 1, 'exactly one window-added handler');
    assert.equal(ws2.count('window-removed'), 1, 'exactly one window-removed handler');
    assert.equal(env.workspaceManager.count('notify::n-workspaces'), 1);
    assert.equal(env.display.count('grab-op-begin'), 1);
    assert.equal(env.display.count('window-created'), 1);
    assert.equal(env.windowManager.count('switch-workspace'), 1);
    ext.disable();
    assert.equal(env.totalHandlers(), 0, 'the retry leaves nothing behind either');
});

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
    boot(env, ext);
    env.flushDisplayConfigNoReply();
    // a monitor change routes the settle wait through a recreation
    env.workspaces.push(makeWorkspace('window-removed', Infinity));
    env.layoutManager.emit('monitors-changed');
    env.flushDisplayConfigNoReply();
    assert.equal(env.logErrors.some((l) => l.indexOf('greenTile monitor-ready start failed') === 0), true,
        'the failed start is reported');
    // the settle wait retiles the windows Muffin moved onto the new monitor: it
    // must not be skipped just because the observer registration failed
    assert.ok(env.liveTimers().some((t) => t.kind === 'mainloop'), 'the settle wait was still armed');
    ext.disable();
});

test('item 3: a failing queued write keeps its intent queued and the observers intact', () => {
    const { env, ext } = makeEnv();
    env.workspaces.push(makeWorkspace());
    env.activeWorkspace = { index: () => 0 };
    env.layoutManager.monitors.push(MONITOR);
    ext.enable();
    const inst = settingsInstance(env);
    // queue an auto-off before the registry is ready, then make the write fail once
    env.keybindingManager.hotkeys.get('greenTile-autoOff').cb();
    const realSetValue = inst.setValue.bind(inst);
    let failOnce = true;
    inst.setValue = (key, value) => {
        if (failOnce && key === 'layouts') {
            failOnce = false;
            throw new Error('injected settings write failure');
        }
        return realSetValue(key, value);
    };
    env.flushDisplayConfigNoReply();
    const app = ext.currentSession().app;
    assert.equal(env.logErrors.some((l) => l.indexOf('greenTile pending auto command failed') === 0), true,
        'the failing queued write is reported under its own label, not thrown out of the callback');
    assert.equal(app.session.pendingAuto.length, 1, 'the intent stays queued for the next monitor-ready');
    assert.equal(env.greenTileHotkeys().length, 14, 'the hotkeys survive');
    assert.equal(env.workspaceManager.count('notify::n-workspaces'), 1, 'the observer phase that succeeded is intact');
    assert.equal(env.display.count('grab-op-begin'), 1, 'the global observers stay connected');
    // the next ready applies the intent that was kept: it is deferred, not lost
    env.layoutManager.emit('monitors-changed');
    env.flushDisplayConfigNoReply();
    const ref = ext.currentSession().app.split.ref(ext.currentSession().app, 0, 0, 2);
    const writes = layoutsWrites(env);
    assert.equal(writes.length, 1, 'the retained intent was written on the next ready');
    assert.equal(JSON.parse(writes.at(-1).value)[ref.mkey][ref.wskey].auto, false, 'and it is the requested pause');
    assert.equal(ext.currentSession().app.session.pendingAuto.length, 0, 'the queue is empty afterwards');
    ext.disable();
});

test('item 3: a throwing settle step is reported and does not escape the ready callback', () => {
    const { env, ext } = makeEnv();
    boot(env, ext);
    const session = ext.currentSession();
    const real = session.settle.consumePending.bind(session.settle);
    session.settle.consumePending = () => {
        throw new Error('injected settle failure');
    };
    env.layoutManager.emit('monitors-changed');
    env.flushDisplayConfigNoReply();
    assert.equal(env.logErrors.some((l) => l.indexOf('greenTile settle start failed') === 0), true,
        'the settle failure is reported on its own line');
    assert.equal(env.logErrors.some((l) => l.indexOf('greenTile monitor-ready start failed') === 0), false,
        'and not confused with an observer-start failure');
    const app = ext.currentSession().app;
    assert.equal(env.workspaceManager.count('notify::n-workspaces'), 1, 'the observer set is intact');
    assert.equal(env.display.count('grab-op-begin'), 1);
    assert.ok(app, 'the app is usable');
    session.settle.consumePending = real;
    ext.disable();
    assert.equal(env.totalHandlers(), 0);
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

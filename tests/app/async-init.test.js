'use strict';
// Asynchronous start-up (todo_fixes item 3) and early pause commands (item 4),
// driven through the REAL extension.js on the fake Cinnamon runtime.
//
// Item 3: the monitor reply arrives after the Config constructor returned, so a
// failure inside the monitor-ready callback is not covered by the constructor's
// catch. One boundary covers the whole asynchronous start (observers, queued auto
// commands, the settle wait); a failure in any of them means the App never became
// fully started, so the App is rolled back WHOLE — hotkeys, handlers and timers
// released, session dropped — and the next monitor change builds a fresh App that
// registers everything exactly once.
//
// Item 4: the 14 hotkeys exist before the registry is ready, but a layout write
// needs the monitor key. An auto on/off pressed in that window must not be dropped
// while reporting success — it is queued on the session and applied before the
// first retile, in the order it was pressed. A write the layout guard REFUSES (a
// corrupt layouts setting) is neither consumed nor reported as done.
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

test('item 3: a failed asynchronous connect rolls the whole App back at once', () => {
    const { env, ext } = makeEnv();
    const ws = makeWorkspace('window-removed');
    env.workspaces.push(ws);
    env.layoutManager.monitors.push(MONITOR);
    ext.enable();
    env.flushDisplayConfigNoReply();
    assert.equal(env.logErrors.some((l) => l.indexOf('greenTile monitor-ready start failed') === 0), true,
        'the asynchronous failure is reported instead of escaping uncaught');
    const shell = ext.currentSession().app;
    assert.ok(shell, 'the app shell stays referenced until the next recreation');
    assert.equal(shell.monitors.ready, false, 'it no longer reports a usable registry');
    assert.equal(env.greenTileHotkeys().length, 0, 'its hotkeys are released without requiring disable');
    // the session's own monitors-changed handler outlives every App; nothing of
    // the App's remains
    assert.equal(env.totalHandlers() - env.layoutManager.count('monitors-changed'), 0,
        'every App handler of ours is released');
    assert.equal(env.liveTimers().length, 0, 'and no timer of ours is left armed');
    assert.equal(settingsInstance(env).finalized, true, 'the settings were finalized with the App');
    assert.equal(ws.count(), 0, 'the workspace holds nothing');
    ext.disable();
    assert.equal(env.totalHandlers(), 0);
});

test('item 3: the App rollback releases the windows the failed start had tracked', () => {
    const { env, ext } = makeEnv();
    const ws0 = makeWorkspace();
    ws0.list_windows = () => env.tabList;
    env.workspaces.push(ws0);
    const w = makeWindow(env, 71, [0, 0, 400, 300]);
    env.tabList.push(w);
    // the failure is in the LAST connect of the set (switch-workspace), after the
    // existing windows were already tracked: the rollback must release all of it
    const rawConnect = env.windowManager.connect.bind(env.windowManager);
    let fail = true;
    env.windowManager.connect = (sig, cb) => {
        if (sig === 'switch-workspace' && fail) {
            fail = false;
            throw new Error('injected late connect failure');
        }
        return rawConnect(sig, cb);
    };
    env.layoutManager.monitors.push(MONITOR);
    ext.enable();
    env.flushDisplayConfigNoReply();
    assert.equal(w.count('notify::minimized'), 0, 'the tracked window was released');
    assert.equal(w.count('unmanaged'), 0);
    assert.equal(env.display.count('window-created'), 0);
    assert.equal(env.workspaces[0].count(), 0);
    assert.equal(ext.currentSession().app.monitors.ready, false, 'the rolled back shell is not ready');
    // the next monitor change builds a fresh App: exactly one of everything
    env.layoutManager.emit('monitors-changed');
    env.flushDisplayConfigNoReply();
    assert.equal(env.workspaces[0].count(), 2, 'one window-added + one window-removed');
    assert.equal(w.count('notify::minimized'), 1, 'the existing window is tracked once');
    assert.equal(w.count('unmanaged'), 1);
    assert.equal(env.windowManager.count('switch-workspace'), 1, 'the late connect landed exactly once');
    assert.equal(env.display.count('window-created'), 1);
    ext.disable();
    assert.equal(w.count(), 0);
    assert.equal(env.totalHandlers(), 0);
    assert.equal(env.liveTimers().length, 0);
});

test('item 3: a failing queued write rolls the App back at once and keeps the intent on the session', () => {
    const { env, ext } = makeEnv();
    env.workspaces.push(makeWorkspace());
    env.activeWorkspace = { index: () => 0 };
    env.layoutManager.monitors.push(MONITOR);
    ext.enable();
    const inst = settingsInstance(env);
    // queue an auto-off before the registry is ready, owe a settle wait, then make
    // the write fail
    env.keybindingManager.hotkeys.get('greenTile-autoOff').cb();
    ext.currentSession().settle.pending = true;
    const realSetValue = inst.setValue.bind(inst);
    inst.setValue = (key, value) => {
        if (key === 'layouts') {
            throw new Error('injected settings write failure');
        }
        return realSetValue(key, value);
    };
    env.flushDisplayConfigNoReply();
    assert.equal(env.logErrors.some((l) => l.indexOf('greenTile monitor-ready start failed') === 0), true,
        'the failing write is reported, not thrown out of the callback');
    const app = ext.currentSession().app;
    assert.ok(app, 'the app shell stays referenced until the next recreation');
    assert.equal(app.monitors.ready, false, 'but it no longer reports a usable registry');
    assert.equal(env.greenTileHotkeys().length, 0, 'its hotkeys are released');
    // the session's own monitors-changed handler outlives every App
    assert.equal(env.totalHandlers() - env.layoutManager.count('monitors-changed'), 0,
        'and every handler of the App is released');
    assert.equal(app.session.pendingAuto.length, 1, 'the intent stays queued for the next App');
    // the owed wait is no longer settled for a rolled back App: it expires silently
    const wait = env.liveTimers().find((t) => t.kind === 'mainloop');
    assert.ok(wait, 'the settle wait the session owes is still armed');
    const entry = [...env.timers.entries()].find(([id]) => id === wait.id);
    env.timers.delete(wait.id);
    entry[1].cb();
    assert.equal(env.liveTimers().length, 0, 'and it is gone afterwards');
    assert.equal(env.logs.some((l) => l.indexOf('greenTile settle wait for a rolled back app expired') === 0), true,
        'the expiry is reported as an expired wait, not as a settle');
    // the intent survived on the session: the fresh App applies it
    inst.setValue = realSetValue;
    env.layoutManager.emit('monitors-changed');
    env.flushDisplayConfigNoReply();
    const app2 = ext.currentSession().app;
    assert.notEqual(app2, app, 'a fresh App replaced the rolled back shell');
    const ref = app2.split.ref(app2, 0, 0, 2);
    const writes = layoutsWrites(env);
    assert.equal(writes.length, 1, 'the retained intent was written exactly once');
    assert.equal(JSON.parse(writes[0].value)[ref.mkey][ref.wskey].auto, false, 'and it is the requested pause');
    assert.equal(app2.session.pendingAuto.length, 0, 'the queue is empty afterwards');
    ext.disable();
});

test('item 3: a throwing settle step is caught and rolls the App back', () => {
    const { env, ext } = makeEnv();
    boot(env, ext);
    const session = ext.currentSession();
    const real = session.settle.consumePending.bind(session.settle);
    session.settle.consumePending = () => {
        throw new Error('injected settle failure');
    };
    env.layoutManager.emit('monitors-changed');
    env.flushDisplayConfigNoReply(); // must not throw
    assert.equal(env.logErrors.some((l) => l.indexOf('greenTile monitor-ready start failed') === 0), true,
        'the settle failure is reported');
    assert.equal(ext.currentSession().app.monitors.ready, false, 'the App is rolled back');
    assert.equal(env.greenTileHotkeys().length, 0);
    session.settle.consumePending = real;
    ext.disable();
});

test('item 3: the settle wait stays pending for the fresh App after a rollback', () => {
    const { env, ext } = makeEnv();
    boot(env, ext);
    env.flushDisplayConfigNoReply();
    env.workspaces.push(makeWorkspace('window-removed', Infinity));
    env.layoutManager.emit('monitors-changed');
    env.flushDisplayConfigNoReply();
    assert.equal(ext.currentSession().settle.pending, true, 'the wait is still owed');
    assert.equal(ext.currentSession().app.monitors.ready, false, 'the failed App is rolled back');
    // a fresh App (workspaces repaired) arms the wait it inherited
    env.workspaces = [makeWorkspace()];
    env.layoutManager.emit('monitors-changed');
    env.flushDisplayConfigNoReply();
    assert.ok(ext.currentSession().app, 'a fresh App exists');
    assert.ok(env.liveTimers().some((t) => t.kind === 'mainloop'), 'and the settle wait is armed for it');
    ext.disable();
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
    assert.equal(env.totalHandlers(), 0);
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
    assert.ok(env.liveTimers().some((t) => t.kind === 'mainloop'), 'the settle wait was armed');
    assert.equal(app.ops.layoutFor(app, 0, 0).auto, false, 'the effective state is the requested pause');
    assert.equal(env.liveTimers().filter((t) => t.ms === 0 || t.ms === 300).length, 0,
        'no retile timer was scheduled against the pause');
    ext.disable();
});

test('item 4: a corrupt layouts setting makes the guard refuse — not consume or report — the queued pause', () => {
    const { env, ext } = makeEnv({ layouts: '{invalid' });
    bootBeforeReply(env, ext);
    autoOf(env, 'greenTile-autoOff');
    env.flushDisplayConfigNoReply();
    const app = ext.currentSession().app;
    assert.ok(app, 'a refused write is not a start failure: the App stays');
    assert.equal(env.logs.includes('greenTile auto tiling off for ws0'), false,
        'a refused write is never reported as applied');
    assert.equal(env.logs.includes('greenTile layouts setting is corrupt, not writing it'), true,
        'the refusal is reported by the guard itself');
    assert.equal(app.session.pendingAuto.length, 1, 'the intent stays queued for when the setting is repaired');
    assert.equal(instLayouts(env), '{invalid', 'and the corrupt value is not replaced');
    ext.disable();
});

test('item 4: a refused direct pause is not reported as applied either', () => {
    const { env, ext } = makeEnv({ layouts: '{invalid' });
    boot(env, ext);
    env.flushDisplayConfigNoReply();
    autoOf(env, 'greenTile-autoOff');
    assert.equal(env.logs.includes('greenTile auto tiling off for ws0'), false,
        'the guard refused the write, so no success is claimed');
    assert.equal(layoutsWrites(env).length, 0, 'and nothing was written');
    ext.disable();
});

function instLayouts(env) {
    return settingsInstance(env).getValue('layouts');
}

// --- Item 4: a retained intent must not outlive the user's newest command ------
//
// Two orderings the plain "apply the queue at readiness" rule gets wrong:
//  1. a pause the guard REFUSED (corrupt layouts) is repaired later — an
//     automatic retile must apply (or at least honour) that pause, not place
//     windows against it;
//  2. a retained intent must not REPLAY over a later explicit opposite command,
//     which supersedes it (one intent per monitor+workspace, newest wins).

test('item 4: a retained pause is applied before the automatic retile after a repair', () => {
    const { env, ext } = makeEnv({ layouts: '{invalid' });
    const ws = makeWorkspace();
    ws.list_windows = () => env.tabList;
    env.workspaces.push(ws);
    env.activeWorkspace = { index: () => 0 };
    const w = makeWindow(env, 101, [50, 70, 420, 310]);
    const w2 = makeWindow(env, 102, [600, 70, 420, 310]);
    env.tabList.push(w, w2);
    env.layoutManager.monitors.push(MONITOR);
    ext.enable();
    // the pause is refused by the corrupt-layouts guard and retained
    autoOf(env, 'greenTile-autoOff');
    env.flushDisplayConfigNoReply();
    const app = ext.currentSession().app;
    assert.equal(app.session.pendingAuto.length, 1, 'the refused pause is retained');
    assert.equal(env.logs.includes('greenTile auto tiling off for ws0'), false, 'and not reported as applied');
    // the user repairs the setting, with auto ON in it
    const ref = app.split.ref(app, 0, 0, 2);
    settingsInstance(env).setValue('layouts', JSON.stringify({ [ref.mkey]: { [ref.wskey]: { auto: true } } }));
    settingsInstance(env).remoteUpdate();
    // a workspace switch arms the debounced retile; firing it must not place
    // windows against the retained pause
    env.windowManager.emit('switch-workspace');
    const debounce = env.liveTimers().find((t) => t.ms === 300);
    assert.ok(debounce, 'the automatic retile is armed');
    const entry = [...env.timers.entries()].find(([id]) => id === debounce.id);
    env.timers.delete(debounce.id);
    entry[1].cb();
    assert.deepEqual(w.moves, [], 'a retained pause must gate the automatic retile');
    assert.deepEqual(w2.moves, []);
    assert.equal(app.ops.layoutFor(app, 0, 0).auto, false, 'the retained pause was written when it became possible');
    assert.equal(app.session.pendingAuto.length, 0, 'and it left the queue');
    ext.disable();
});

for (const oldAuto of [false, true]) {
    test('item 4: a retained ' + (oldAuto ? 'On' : 'Off') + ' cannot replay over a newer opposite command', () => {
        const { env, ext } = makeEnv({ layouts: '{invalid' });
        bootBeforeReply(env, ext);
        autoOf(env, oldAuto ? 'greenTile-autoN' : 'greenTile-autoOff');
        env.flushDisplayConfigNoReply();
        const app = ext.currentSession().app;
        assert.equal(app.session.pendingAuto.length, 1, 'the refused command is retained');
        // the setting is repaired (carrying the OLD state), then the user presses
        // the opposite command directly: it succeeds and supersedes the retained one
        const ref = app.split.ref(app, 0, 0, 2);
        settingsInstance(env).setValue('layouts', JSON.stringify({ [ref.mkey]: { [ref.wskey]: { auto: oldAuto } } }));
        settingsInstance(env).remoteUpdate();
        autoOf(env, oldAuto ? 'greenTile-autoOff' : 'greenTile-autoN');
        assert.equal(app.ops.layoutFor(app, 0, 0).auto, !oldAuto, 'the newer explicit command took effect');
        assert.equal(app.session.pendingAuto.length, 0, 'and it superseded the retained intent');
        // a recreation must not replay the stale intent
        env.layoutManager.emit('monitors-changed');
        env.flushDisplayConfigNoReply();
        const fresh = ext.currentSession().app;
        assert.equal(fresh.ops.layoutFor(fresh, 0, 0).auto, !oldAuto, 'the last explicit command must win');
        assert.equal(fresh.session.pendingAuto.length, 0);
        ext.disable();
    });
}

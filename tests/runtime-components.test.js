'use strict';
// Unit tests for lib/runtime/session.js and lib/runtime/monitors.js: the
// extension Session owns the monitors-changed handler (via a Scope over an
// injected SignalManager), the App create/recreate/destroy flow and the settle
// wait (pending/timer/started) that outlives every App recreation. Monitors is
// the per-App DisplayConfig registry: epoch guard first, Gio.Cancellable as
// the second line of teardown. Cinnamon surface rides on injected fakes; log
// texts and timings stay byte-identical with the module code they replaced
// (greenTile.js tile_settle_*/tile_monitors_*).
const test = require('node:test');
const assert = require('node:assert/strict');
// Components are loaded through the shared loader: their internal requires are
// root-relative the way Cinnamon's fileUtils resolves them ('./lib/…' from any
// file), which plain Node require cannot resolve from lib/runtime/.
const { load } = require('./cinnamon-loader');
const { Session, Settle } = load('./lib/runtime/session');
const { Monitors } = load('./lib/runtime/monitors');

const fakeMainloop = () => {
    const live = new Map();
    let nextId = 1;
    return {
        live,
        timeout_add(ms, cb) {
            const id = nextId++;
            live.set(id, { ms, cb });
            return id;
        },
        source_remove(id) {
            if (!live.delete(id))
                throw new Error('mainloop: no such source ' + id);
        },
        fire(id) {
            const entry = live.get(id);
            assert.ok(entry, 'timer ' + id + ' is not live');
            live.delete(id);
            const result = entry.cb();
            if (result)
                live.set(id, entry);
            return result;
        },
        pendingMs() {
            return [...live.values()].map((t) => t.ms);
        },
    };
};

const fakeSignalManager = () => {
    const storage = [];
    let nextId = 1;
    return {
        storage,
        connect(obj, sigName, callback) {
            const id = nextId++;
            storage.push([sigName, obj, callback, id]);
            obj.connect(sigName, callback);
            return id;
        },
        getSignals() {
            return storage.slice();
        },
        disconnectAllSignals() {
            storage.length = 0;
        },
    };
};

// Settle ---------------------------------------------------------------------

const clock = () => {
    const state = { now: 100000 };
    return {
        now: () => state.now,
        advance(ms) { state.now += ms; },
    };
};

const makeSettle = () => {
    const ck = clock();
    const ml = fakeMainloop();
    const logs = [];
    const settledApps = [];
    const settle = new Settle({
        mainloop: ml,
        now: ck.now,
        log: (msg) => logs.push(msg),
        onSettled: (app) => settledApps.push(app),
    });
    return { ck, ml, logs, settledApps, settle };
};

test('settle schedules a 2 s wait, fires once, retiles and logs the elapsed time', () => {
    const { ck, ml, logs, settledApps, settle } = makeSettle();
    settle.start('app1');
    assert.deepEqual(ml.pendingMs(), [2000], 'full 2 s wait on the first start');
    assert.deepEqual(settledApps, [], 'nothing fired yet');
    ck.advance(2000);
    ml.fire(ml.live.keys().next().value);
    assert.deepEqual(settledApps, ['app1']);
    assert.deepEqual(ml.pendingMs(), [], 'one-shot timer');
    assert.equal(settle.started, 0, 'started reset after the wait fired');
    assert.deepEqual(logs, ['greenTile monitors settled after 2000 ms']);
});

test('settle restart replaces the running timer and keeps the start time', () => {
    const { ck, ml, logs, settledApps, settle } = makeSettle();
    settle.start('app1');
    ck.advance(1000);
    settle.start('app2');
    const ids = [...ml.live.keys()];
    assert.equal(ids.length, 1, 'exactly one wait is live after the restart');
    ck.advance(2000);
    ml.fire(ids[0]);
    assert.deepEqual(settledApps, ['app2'], 'the replaced app wins');
    assert.equal(logs[0], 'greenTile monitors settled after 3000 ms');
});

test('settle teardown removes the timer and keeps started while pending', () => {
    const { ck, ml, settle } = makeSettle();
    settle.start('app1');
    settle.pending = true;
    ck.advance(500);
    settle.teardown();
    assert.deepEqual(ml.pendingMs(), [], 'timer gone');
    assert.equal(settle.started, 100000, 'start time survives (15 s cap from the first change)');
    ck.advance(1000);
    settle.start('app2');
    assert.deepEqual(ml.pendingMs(), [2000]);
});

test('settle teardown resets started when nothing is pending', () => {
    const { ck, ml, settle } = makeSettle();
    settle.start('app1');
    ck.advance(500);
    settle.teardown();
    assert.equal(settle.started, 0, 'no pending change: the next wait starts fresh');
    settle.start('app2');
    assert.deepEqual(ml.pendingMs(), [2000]);
});

test('a monitor change 14 s after the first stays inside the 15 s cap', () => {
    const { ck, ml, logs, settle } = makeSettle();
    settle.start('app1');
    ck.advance(14000);
    settle.pending = true;
    settle.teardown();
    settle.start('app2');
    assert.deepEqual(ml.pendingMs(), [1000], 'capped at 15 s from the FIRST start');
    ck.advance(1000);
    ml.fire(ml.live.keys().next().value);
    assert.deepEqual(logs, ['greenTile monitors settled after 15000 ms']);
});

test('settle consumePending starts the wait exactly once', () => {
    const { ml, settle } = makeSettle();
    settle.consumePending('app1');
    assert.deepEqual(ml.pendingMs(), [], 'no pending flag: nothing scheduled');
    settle.pending = true;
    settle.consumePending('app2');
    assert.deepEqual(ml.pendingMs(), [2000]);
    settle.consumePending('app3');
    assert.deepEqual(ml.pendingMs(), [2000], 'flag cleared: a second consume is a no-op');
});

test('settle destroy removes a running wait and resets all state', () => {
    const { ml, settle } = makeSettle();
    settle.start('app1');
    settle.pending = true;
    settle.destroy();
    assert.deepEqual(ml.pendingMs(), []);
    assert.equal(settle.pending, false);
    assert.equal(settle.started, 0);
    settle.destroy();
    assert.deepEqual(ml.pendingMs(), [], 'destroy is idempotent');
});

// Monitors -------------------------------------------------------------------

const fakeGlobal = () => {
    const logs = [];
    return {
        logs,
        display: { get_monitor_name: (i) => 'Screen-' + i },
        log: (msg) => logs.push(msg),
    };
};

// DisplayConfig reply: unpacked[1] = [ [[connector, vendor, product, serial], ...modes], ... ]
const makeGio = (env) => ({
    DBusCallFlags: { NONE: 'none' },
    Settings: class {
        constructor(props) {
            this.props = props;
            env.settings.push(this);
        }
        get_boolean() {
            return false;
        }
    },
    Cancellable: class {
        constructor() {
            this.cancelled = false;
            env.cancellables.push(this);
        }
        cancel() {
            this.cancelled = true;
        }
        is_cancelled() {
            return this.cancelled;
        }
    },
    DBus: {
        session: {
            call(bus, path, iface, method, params, reply, flags, timeout, cancellable, cb) {
                env.calls.push({ method, timeout, cancellable, cb });
            },
        },
    },
});

const displayReply = (monitors, throwError) => ({
    call_finish(result) {
        if (throwError)
            throw throwError;
        return { deep_unpack: () => [[], monitors.map((m) => [[m[0], m[1], m[2], m[3]], []])] };
    },
});

const makeMonitors = (monitorMap) => {
    const env = { calls: [], cancellables: [], settings: [] };
    const gio = makeGio(env);
    const session = { monitorFallbackLogged: false };
    const g = fakeGlobal();
    const monitors = new Monitors({
        main: { layoutManager: { monitors: [{ width: 1920, height: 1080 }, { width: 1280, height: 1024 }] } },
        gio,
        meta: { MonitorManager: { get: () => ({ get_monitor_for_connector: (c) => (monitorMap || { 'HDMI-0': 0, 'DP-1': 1 })[c] ?? -1 }) } },
        global: g,
        session,
    });
    return { env, session, g, monitors, logs: g.logs };
};

const withReply = (env, monitors, throwError) => {
    env.calls[env.calls.length - 1].cb(displayReply(monitors, throwError), null);
};

test('monitors refresh reads DisplayConfig with the cancellable and fires onReady once', () => {
    const { env, monitors, logs } = makeMonitors();
    const ready = [];
    monitors.refresh(() => ready.push(1));
    assert.equal(env.calls.length, 1);
    assert.equal(env.calls[0].method, 'GetCurrentState');
    assert.equal(env.calls[0].timeout, 3000);
    assert.ok(env.calls[0].cancellable, 'a cancellable rides the call');
    withReply(env, [['HDMI-0', 'VND', 'PRD', '0x1a2b'], ['DP-1', 'VND', 'PRD', '0x9f']]);
    assert.deepEqual(monitors.keys, ['VND|PRD|0x1a2b', 'VND|PRD|0x9f']);
    assert.deepEqual(monitors.labels, ['Screen-0', 'Screen-1']);
    assert.equal(monitors.ready, true);
    assert.deepEqual(ready, [1], 'onReady fired exactly once');
    assert.deepEqual(logs, ['greenTile monitors: 0=VND|PRD|0x1a2b, 1=VND|PRD|0x9f']);
});

test('monitors without a DisplayConfig state fall back per monitor, logged once per session', () => {
    const { env, session, monitors, logs } = makeMonitors({ 'DP-1': 1 });
    monitors.refresh(() => {});
    withReply(env, [['DP-1', 'VND', 'PRD', '0x9f']]);
    assert.deepEqual(monitors.keys, ['name:Screen-0|1920x1080', 'VND|PRD|0x9f']);
    assert.equal(session.monitorFallbackLogged, true);
    assert.equal(logs.filter((l) => l.startsWith('greenTile monitor key fallback for ')).length, 1);
    monitors.refresh(() => {});
    withReply(env, [['DP-1', 'VND', 'PRD', '0x9f']]);
    assert.equal(logs.filter((l) => l.startsWith('greenTile monitor key fallback for ')).length, 1,
        'the fallback line is logged once per session, not once per refresh');
});

test('a stale reply for a destroyed registry touches nothing and stays silent', () => {
    const { env, monitors, logs } = makeMonitors();
    let ready = 0;
    monitors.refresh(() => { ready += 1; });
    const firstCall = env.calls[0];
    monitors.refresh(() => { ready += 1; });
    assert.equal(env.calls.length, 2);
    monitors.destroy();
    firstCall.cb(displayReply([['HDMI-0', 'VND', 'PRD', '0x1a2b']]), null);
    assert.equal(ready, 0, 'no onReady for the destroyed refresh');
    assert.equal(monitors.ready, false);
    assert.deepEqual(logs, [], 'no failed log for the epoch-dropped reply');
    assert.equal(env.calls[1].cancellable.cancelled, true, 'in-flight call cancelled');
});

test('destroy cancels the current in-flight call (second line after the epoch guard)', () => {
    const { env, monitors } = makeMonitors();
    monitors.refresh(() => {});
    const inFlight = env.calls[0].cancellable;
    assert.equal(inFlight.cancelled, false);
    monitors.destroy();
    assert.equal(inFlight.cancelled, true);
    monitors.destroy();
    assert.equal(inFlight.cancelled, true, 'destroy is idempotent');
});

test('onlyPrimary lazily creates the muffin settings exactly once', () => {
    const { env, monitors } = makeMonitors();
    assert.deepEqual(env.settings, []);
    monitors.onlyPrimary();
    monitors.onlyPrimary();
    assert.equal(env.settings.length, 1);
    assert.deepEqual(env.settings[0].props, { schema_id: 'org.cinnamon.muffin' });
});

test('a failed GetCurrentState reply is logged, refresh still completes with fallbacks', () => {
    const { env, monitors, logs } = makeMonitors({ 'DP-1': 1 });
    monitors.refresh(() => {});
    let caught = null;
    withReply(env, [], new Error('boom'));
    assert.equal(monitors.ready, true, 'the fallback path still publishes the registry');
    assert.deepEqual(monitors.keys, ['name:Screen-0|1920x1080', 'name:Screen-1|1280x1024']);
    assert.match(logs[0], /^greenTile DisplayConfig\.GetCurrentState failed: Error: boom$/);
});

// Session --------------------------------------------------------------------

const fakeLayoutHub = () => {
    const handlers = [];
    let nextId = 1;
    return {
        handlers,
        connect(sigName, cb) {
            const id = nextId++;
            handlers.push({ sigName, cb, id });
            return id;
        },
        disconnect(id) {
            const at = handlers.findIndex((h) => h.id === id);
            if (at !== -1)
                handlers.splice(at, 1);
        },
        emit(sigName) {
            for (const h of handlers.slice())
                if (h.sigName === sigName)
                    h.cb();
        },
    };
};

const makeSession = () => {
    const layoutManager = fakeLayoutHub();
    const signalManager = fakeSignalManager();
    const created = [];
    const destroyed = [];
    const session = new Session({
        signalManager,
        layoutManager,
        mainloop: fakeMainloop(),
        now: () => 0,
        log: () => {},
        onSettled: () => {},
        createApp: (s) => {
            const app = { session: s, destroyed: 0, destroy() { this.destroyed += 1; destroyed.push(this); } };
            created.push(app);
            return app;
        },
    });
    return { layoutManager, signalManager, created, destroyed, session };
};

test('session wires exactly one monitors-changed handler and recreates the app on change', () => {
    const { layoutManager, created, destroyed, session } = makeSession();
    session.start();
    assert.deepEqual(created.length, 1, 'the first app is created at start');
    assert.equal(layoutManager.handlers.length, 1);
    assert.equal(created[0].session, session, 'apps know their session');
    layoutManager.emit('monitors-changed');
    assert.deepEqual(destroyed, [created[0]], 'the old app dies first');
    assert.equal(created.length, 2);
    layoutManager.emit('monitors-changed');
    assert.deepEqual(destroyed, [created[0], created[1]]);
    assert.equal(created.length, 3);
    assert.equal(session.app, created[2]);
});

test('monitors-changed flags pending without consuming it (settle rides the recreation)', () => {
    const { layoutManager, session } = makeSession();
    session.start();
    layoutManager.emit('monitors-changed');
    assert.equal(session.settle.pending, true);
});

test('session destroy stops the app, resets the settle wait and releases the handler', () => {
    const { layoutManager, created, destroyed, session } = makeSession();
    session.start();
    layoutManager.emit('monitors-changed');
    const app2 = created[1];
    session.settle.pending = true;
    session.destroy();
    assert.deepEqual(destroyed, [created[0], app2], 'the live app is destroyed');
    assert.equal(session.app, null);
    assert.deepEqual(layoutManager.handlers, [], 'monitors-changed released via the scope');
    assert.equal(session.settle.pending, false, 'settle state is reset with the session');
    layoutManager.emit('monitors-changed');
    assert.equal(created.length, 2, 'a released handler cannot recreate the app');
});

test('session destroy is safe on a never-started session', () => {
    const { session } = makeSession();
    session.destroy();
    assert.equal(session.app, null);
});

test('session destroy releases the handler before the app dies: a throwing app.destroy cannot resurrect', () => {
    const layoutManager = fakeLayoutHub();
    const events = [];
    let appDestroyed = null;
    const session = new Session({
        signalManager: fakeSignalManager(),
        layoutManager,
        mainloop: fakeMainloop(),
        now: () => 0,
        log: () => {},
        onSettled: () => {},
        createApp: (s) => {
            const app = {
                session: s,
                destroy() {
                    events.push('app.destroy with ' + layoutManager.handlers.length + ' handlers left');
                    appDestroyed = true;
                    throw new Error('boom during teardown');
                },
            };
            return app;
        },
    });
    session.start();
    assert.throws(() => session.destroy(), /boom during teardown/, 'the throw surfaces');
    assert.equal(appDestroyed, true, 'app.destroy ran');
    assert.deepEqual(events, ['app.destroy with 0 handlers left'],
        'the monitors-changed handler was released before the app died');
    assert.deepEqual(layoutManager.handlers, [], 'no handler survives a throwing teardown');
    assert.equal(session.app, null, 'cleared in the finally');
    assert.equal(session.settle.pending, false, 'settle state reset in the finally');
    layoutManager.emit('monitors-changed');
    session.destroy();
    assert.equal(session.settle.pending, false, 'second destroy is a no-op');
});

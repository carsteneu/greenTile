'use strict';
// Unit tests for lib/runtime/scope.js: a scope connects signals through an
// injected SignalManager-compatible object, tracks mainloop and GLib timers
// plus extra cleanup callbacks, and releases everything in destroy() —
// idempotent and per-entry fault tolerant (a throwing entry must not skip
// the rest, mirroring disconnectEach semantics).
const test = require('node:test');
const assert = require('node:assert/strict');
const { Scope, createScope } = require('../../lib/runtime/scope');

// Fake SignalManager mirroring /usr/share/cinnamon/js/misc/signalManager.js:
// storage entries [sigName, obj, callback, id], _signalIsConnected skips plain
// JS objects without signalHandlerIsConnected (returns false), disconnect/
// disconnectAllSignals release through obj.disconnect(id) in ONE throw-
// propagating loop and update the storage only afterwards.
const fakeSignalManager = () => {
    const storage = [];
    let nextId = 1;
    const isConnected = (obj, id) => 'signalHandlerIsConnected' in obj ? obj.signalHandlerIsConnected(id) : false;
    return {
        storage,
        connectCalls: [],
        disconnectAllCalls: 0,
        connect(obj, sigName, callback) {
            const id = nextId++;
            this.connectCalls.push([obj, sigName, callback, id]);
            storage.push([sigName, obj, callback, id]);
            return id;
        },
        getSignals(sigName, obj, callback) {
            return storage.filter((x) => (!sigName || x[0] === sigName)
                && (!obj || x[1] === obj)
                && (!callback || x[2] === callback));
        },
        disconnect(sigName, obj, callback) {
            const doomed = this.getSignals(sigName, obj, callback).filter(([, o, , id]) => isConnected(o, id));
            for (const [, o, , id] of doomed)
                o.disconnect(id);
            for (const entry of doomed) {
                const at = storage.indexOf(entry);
                if (at !== -1)
                    storage.splice(at, 1);
            }
        },
        disconnectAllSignals() {
            this.disconnectAllCalls += 1;
            const doomed = storage.filter(([, o, , id]) => isConnected(o, id));
            for (const [, o, , id] of doomed)
                o.disconnect(id);
            storage.length = 0;
        },
    };
};

const fakeMainloop = () => {
    const live = new Map();
    let nextId = 1;
    return {
        live,
        removed: [],
        timeout_add(ms, cb) {
            const id = nextId++;
            live.set(id, { ms, cb });
            return id;
        },
        source_remove(id) {
            this.removed.push(id);
            live.delete(id);
        },
        fire(id) {
            const entry = live.get(id);
            assert.ok(entry, 'timer ' + id + ' is not live');
            live.delete(id);
            const result = entry.cb();
            // GJS mainloop semantics: truthy return keeps the source scheduled
            if (result)
                live.set(id, entry);
            return result;
        },
    };
};

const makeGlib = () => {
    const state = { live: new Map(), removed: [], next: 1 };
    return {
        state,
        timeout_add(priority, ms, cb) {
            const id = state.next++;
            state.live.set(id, { priority, ms, cb });
            return id;
        },
        Source: {
            remove(id) {
                state.removed.push(id);
                state.live.delete(id);
            },
        },
    };
};

const makeScope = () => {
    const signalManager = fakeSignalManager();
    const mainloop = fakeMainloop();
    const glib = makeGlib();
    const scope = new Scope({ signalManager, mainloop, glib });
    return { scope, signalManager, mainloop, glib };
};

test('connect delegates to the signal manager and destroy disconnects all signals', () => {
    const { scope, signalManager } = makeScope();
    const target = { name: 'layoutManager' };
    const cb = () => {};
    scope.connect(target, 'monitors-changed', cb);
    assert.equal(signalManager.connectCalls.length, 1);
    assert.equal(signalManager.connectCalls[0][0], target);
    assert.equal(signalManager.connectCalls[0][1], 'monitors-changed');
    assert.equal(signalManager.connectCalls[0][2], cb);
    assert.equal(signalManager.disconnectAllCalls, 0);
    scope.destroy();
    assert.equal(signalManager.disconnectAllCalls, 1);
});

test('connect passes bind and force through to the signal manager', () => {
    const { scope, signalManager } = makeScope();
    let seen = null;
    signalManager.connect = (...args) => { seen = args; return 1; };
    const bindTo = {};
    scope.connect({}, 'sig', () => {}, bindTo, true);
    assert.deepEqual(seen.slice(0, 4), [{}, 'sig', seen[2], bindTo]);
    assert.equal(seen[4], true);
    scope.destroy();
});

test('timeout tracks a mainloop timer and destroy removes it without running it', () => {
    const { scope, mainloop } = makeScope();
    let ran = false;
    const id = scope.timeout(10, () => { ran = true; });
    assert.equal(mainloop.live.size, 1);
    assert.equal(mainloop.live.get(id).ms, 10);
    scope.destroy();
    assert.equal(mainloop.live.size, 0);
    assert.deepEqual(mainloop.removed, [id]);
    assert.equal(ran, false);
});

test('a stopped timer untracks itself and one-shot return values pass through', () => {
    const { scope, mainloop } = makeScope();
    const id = scope.timeout(10, () => false);
    assert.equal(mainloop.fire(id), false);
    scope.destroy();
    assert.equal(mainloop.removed.includes(id), false, 'stopped timer must not be removed again');
});

test('a repeating timer stays tracked while it keeps returning truthy', () => {
    const { scope, mainloop } = makeScope();
    const id = scope.timeout(10, () => true);
    assert.equal(mainloop.fire(id), true);
    assert.equal(mainloop.live.has(id), true, 'still live after one repeat');
    scope.destroy();
    assert.deepEqual(mainloop.removed, [id]);
});

test('timeoutGL tracks a GLib timer and destroy removes it via Source.remove', () => {
    const { scope, glib } = makeScope();
    let ran = false;
    const id = scope.timeoutGL(0, 20, () => { ran = true; });
    assert.equal(glib.state.live.size, 1);
    assert.equal(glib.state.live.get(id).priority, 0);
    scope.destroy();
    assert.equal(glib.state.live.size, 0);
    assert.deepEqual(glib.state.removed, [id]);
    assert.equal(ran, false);
});

test('cleanups run in reverse registration order on destroy', () => {
    const { scope } = makeScope();
    const order = [];
    scope.cleanup(() => order.push('first'));
    scope.cleanup(() => order.push('second'));
    scope.cleanup(() => order.push('third'));
    scope.destroy();
    assert.deepEqual(order, ['third', 'second', 'first']);
});

test('one throwing cleanup does not stop the others', () => {
    const { scope } = makeScope();
    const order = [];
    scope.cleanup(() => order.push('first'));
    scope.cleanup(() => { throw new Error('boom'); });
    scope.cleanup(() => order.push('third'));
    scope.destroy();
    assert.deepEqual(order, ['third', 'first'], 'all cleanups attempted in reverse order');
});

test('one throwing timer removal does not stop removing the remaining timers', () => {
    const { scope, mainloop } = makeScope();
    scope.timeout(10, () => {});
    scope.timeout(20, () => {});
    let attempts = 0;
    mainloop.source_remove = () => { attempts += 1; throw new Error('source already gone'); };
    // must not throw despite every removal failing
    scope.destroy();
    assert.equal(attempts, 2, 'every timer removal attempted');
});

test('destroy is idempotent', () => {
    const { scope, signalManager, mainloop } = makeScope();
    scope.cleanup(() => {});
    scope.connect({}, 'sig', () => {});
    scope.timeout(10, () => {});
    scope.destroy();
    scope.destroy();
    assert.equal(signalManager.disconnectAllCalls, 1, 'signals disconnected once');
    assert.equal(mainloop.removed.length, 1, 'timer removed once');
});

test('destroy works on an empty scope', () => {
    const { scope } = makeScope();
    scope.destroy();
    scope.destroy();
});

test('one throwing signal disconnect must not skip the remaining signals (disconnectEach semantics)', () => {
    const sm = fakeSignalManager();
    const scope = new Scope({ signalManager: sm, mainloop: fakeMainloop(), glib: makeGlib() });
    const released = [];
    const healthy = (name) => {
        let connected = true;
        return {
            signalHandlerIsConnected: () => connected,
            disconnect(id) {
                connected = false;
                released.push(name + ':' + id);
            },
        };
    };
    const broken = {
        signalHandlerIsConnected: () => true,
        disconnect() { throw new Error('handler already gone'); },
    };
    scope.connect(healthy('first'), 'a', () => {});
    scope.connect(broken, 'b', () => {});
    scope.connect(healthy('third'), 'c', () => {});
    scope.destroy();
    assert.equal(released.length, 2, 'both healthy signals released');
    assert.equal(sm.storage.length, 3, 'storage only resets via a successful disconnectAllSignals');
});

test('plain JS targets are released directly even when the SignalManager would skip them', () => {
    const sm = fakeSignalManager();
    const scope = new Scope({ signalManager: sm, mainloop: fakeMainloop(), glib: makeGlib() });
    const released = [];
    const mk = (name) => ({
        disconnect(id) { released.push(name + ':' + id); },
    });
    scope.connect(mk('a'), 'sig-a', () => {});
    scope.connect(mk('b'), 'sig-b', () => {});
    scope.destroy();
    assert.equal(released.length, 2, 'released via direct obj.disconnect, not via the filtered SM path');
    assert.deepEqual(sm.storage, [], 'storage resets cleanly when nothing is connected anymore');
});

test('mutation methods throw after destroy (stale reentry must surface)', () => {
    const { scope } = makeScope();
    scope.destroy();
    const target = {};
    assert.throws(() => scope.connect(target, 'sig', () => {}), /scope destroyed/);
    assert.throws(() => scope.timeout(10, () => {}), /scope destroyed/);
    assert.throws(() => scope.timeoutGL(0, 10, () => {}), /scope destroyed/);
    assert.throws(() => scope.cleanup(() => {}), /scope destroyed/);
});

test('a throwing timer callback untracks the source and rethrows', () => {
    const { scope, mainloop } = makeScope();
    const id = scope.timeout(10, () => {
        throw new Error('callback blew up');
    });
    assert.throws(() => mainloop.fire(id), /callback blew up/);
    scope.destroy();
    assert.equal(mainloop.removed.includes(id), false, 'dead source must not be removed again');
});

test('finalized fake GObjects are skipped, other signals still released (vendor _signalIsConnected semantics)', () => {
    const sm = fakeSignalManager();
    const scope = new Scope({ signalManager: sm, mainloop: fakeMainloop(), glib: makeGlib() });
    const released = [];
    const finalized = {
        is_finalized: () => true,
        disconnect() { released.push('finalized'); },
    };
    const healthy = mkDisconnectingTarget('healthy', released);
    scope.connect(healthy, 'a', () => {});
    scope.connect(finalized, 'b', () => {});
    const another = mkDisconnectingTarget('another', released);
    scope.connect(another, 'c', () => {});
    scope.destroy();
    assert.deepEqual(released, ['healthy:1', 'another:3'], 'finalized GObject untouched, others released');
});

test('already-released GObject ids are skipped when gobject is injected, connected ones released', () => {
    const sm = fakeSignalManager();
    const gobject = { signal_handler_is_connected: () => false };
    const scope = new Scope({ signalManager: sm, mainloop: fakeMainloop(), glib: makeGlib(), gobject });
    const released = [];
    const window = {
        is_finalized: () => false,
        disconnect(id) { released.push('g:' + id); },
    };
    scope.connect(window, 'position-changed', () => {});
    scope.destroy();
    assert.deepEqual(released, [], 'released id must not be disconnected again');

    const gobjectConnected = { signal_handler_is_connected: () => true };
    const scope2 = new Scope({ signalManager: fakeSignalManager(), mainloop: fakeMainloop(), glib: makeGlib(), gobject: gobjectConnected });
    scope2.connect(window, 'position-changed', () => {});
    scope2.destroy();
    assert.equal(released.length, 1, 'connected GObject id released');
});

const mkDisconnectingTarget = (name, released) => ({
    disconnect(id) { released.push(name + ':' + id); },
});

test('createScope returns a Scope with the same behaviour', () => {
    const signalManager = fakeSignalManager();
    const scope = createScope({ signalManager, mainloop: fakeMainloop(), glib: makeGlib() });
    assert.ok(scope instanceof Scope);
    scope.destroy();
    assert.equal(signalManager.disconnectAllCalls, 1);
});

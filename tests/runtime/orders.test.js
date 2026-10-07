'use strict';
// Unit tests for lib/runtime/orders.js: the file-backed per-surface window-order
// store the startup retile reads and every placement writes. All Cinnamon access
// is injected, so the file lives in an in-memory fake here. The file is untrusted
// input and the writes must never break tiling: read failures, corrupt content
// and write failures are all tolerated and logged, never thrown.
const test = require('node:test');
const assert = require('node:assert/strict');

const { Orders } = require('../helpers/cinnamon-loader').load('./lib/runtime/orders.js');
const orderModel = require('../helpers/cinnamon-loader').load('./lib/model/window-order.js');

const RUNTIME_DIR = '/run/user/1000';
const CACHE_DIR = '/home/fake/.cache';
const PATH = RUNTIME_DIR + '/greenTile@carsteneu/order.json';

const makeDeps = (initial = {}, opts = {}) => {
    const files = new Map(Object.entries(initial));
    const writes = [];
    const mkdirs = [];
    const logs = [];
    const timers = new Map();
    let nextTimer = 1;
    const deps = {
        files,
        writes,
        mkdirs,
        logs,
        timers,
        glib: {
            get_user_runtime_dir: () => (opts.runtimeFallback ? CACHE_DIR : RUNTIME_DIR),
            get_user_cache_dir: () => CACHE_DIR,
            get_home_dir: () => '/home/fake',
            build_filenamev: (parts) => parts.join('/'),
            mkdir_with_parents: (path, mode) => {
                if (opts.mkdirFails) {
                    return -1;
                }
                mkdirs.push([path, mode]);
                return 0;
            },
        },
        gio: {
            FileCreateFlags: { NONE: 0, PRIVATE: 1, REPLACE_DESTINATION: 2 },
            File: {
                new_for_path: (path) => ({
                    load_contents: () => {
                        if (opts.readThrows) {
                            throw new Error('injected read failure');
                        }
                        if (!files.has(path)) {
                            return [false, null];
                        }
                        return [true, new TextEncoder().encode(files.get(path))];
                    },
                    replace_contents: (bytes, _etag, _backup, flags) => {
                        if (opts.writeThrows) {
                            throw new Error('injected write failure');
                        }
                        const text = new TextDecoder().decode(bytes);
                        files.set(path, text);
                        writes.push({ path, text, flags });
                        return [true, 'etag'];
                    },
                }),
            },
        },
        byteArray: {
            fromString: (s) => new TextEncoder().encode(s),
            toString: (u8) => new TextDecoder().decode(u8),
        },
        mainloop: {
            timeout_add: (ms, cb) => {
                const id = nextTimer++;
                timers.set(id, { ms, cb });
                return id;
            },
            source_remove: (id) => {
                if (!timers.delete(id)) {
                    throw new Error('no such source ' + id);
                }
            },
        },
        global: { log: (m) => logs.push(m), logError: (m) => logs.push(m) },
        log: (m) => logs.push(m),
    };
    deps.fireTimers = () => {
        for (const [id, t] of [...timers]) {
            timers.delete(id);
            t.cb();
        }
    };
    return deps;
};

const makeApp = (keys = ['MK0', 'MK1']) => ({
    monitors: { keys, wsKey: (_m, ws) => String(ws) },
    session: { orderUsed: new Set() },
});

const win = (description) => ({ get_description: () => description });

const stored = (surfaces) => JSON.stringify({ v: 1, s: surfaces });

test('restore resolves the monitor+workspace surface and returns the stored ids once', () => {
    const deps = makeDeps({ [PATH]: stored({ 'MK0\n2': ['0xa', '0xb'] }) });
    const app = makeApp();
    const orders = new Orders(deps);
    assert.deepEqual(orders.restore(app, 0, 2), ['0xa', '0xb']);
    assert.deepEqual(orders.restore(app, 0, 2), null, 'the surface is consumed after its first use');
    assert.deepEqual(orders.restore(app, 1, 2), null, 'a surface without a record restores nothing');
    assert.deepEqual(orders.restore(app, 0, 0), null);
    assert.deepEqual(app.session.orderUsed.size, 3, 'each surface is marked used exactly once');
});

test('restore ignores a monitor that has no key and stays silent on a missing file', () => {
    const deps = makeDeps();
    const app = makeApp(['MK0', undefined]);
    const orders = new Orders(deps);
    assert.equal(orders.restore(app, 1, 0), null);
    assert.equal(app.session.orderUsed.size, 0, 'no key: the surface is not consumed');
    assert.equal(orders.restore(app, 0, 0), null);
});

test('an order a run records is restored by the NEXT run, never by the one that wrote it', () => {
    // session 1: no store yet, a placement writes one
    const deps = makeDeps();
    const app = makeApp();
    const first = new Orders(deps);
    first.record(app, 0, 0, [win('0x1'), win('0x2')], true);
    deps.fireTimers();
    assert.deepEqual(JSON.parse(deps.writes[0].text).s['MK0\n0'], ['0x1', '0x2']);
    // session 1 never treats its own placement as a restored order: its snapshot
    // was taken before that write and the arrangement it just made is its own
    assert.equal(first.restore(app, 0, 0), null);
    // session 2 (the restart): a new store reads the file session 1 wrote
    const second = new Orders(deps);
    assert.deepEqual(second.restore(makeApp(), 0, 0), ['0x1', '0x2']);
});

test('record stores the placed order of the identifiable windows, debounced and private', () => {
    const deps = makeDeps();
    const orders = new Orders(deps);
    const app = makeApp();
    orders.record(app, 0, 1, [win('0x1'), win('0x2'), win('0x3')], true);
    assert.equal(deps.timers.size, 1, 'the write is debounced, not immediate');
    assert.equal(deps.writes.length, 0, 'nothing written before the debounce fires');
    deps.fireTimers();
    assert.deepEqual(deps.mkdirs, [[RUNTIME_DIR + '/greenTile@carsteneu', 0o700]]);
    assert.equal(deps.writes.length, 1);
    assert.equal(deps.writes[0].path, PATH);
    assert.equal(deps.writes[0].flags, deps.gio.FileCreateFlags.PRIVATE | deps.gio.FileCreateFlags.REPLACE_DESTINATION);
    assert.deepEqual(JSON.parse(deps.writes[0].text), { v: 1, s: { 'MK0\n1': ['0x1', '0x2', '0x3'] } });
});

test('record ignores surfaces with fewer than two identifiable windows', () => {
    const deps = makeDeps();
    const orders = new Orders(deps);
    const app = makeApp();
    orders.record(app, 0, 0, [win('0x1')], true);
    orders.record(app, 0, 1, [win(null), win(undefined)], true);
    orders.record(app, 0, 2, [win('not-hex'), win('0x5')], true);
    assert.equal(deps.timers.size, 0, 'nothing to store, nothing scheduled');
    assert.equal(deps.writes.length, 0);
});

test('record with no monitor key stores nothing', () => {
    const deps = makeDeps();
    const orders = new Orders(deps);
    orders.record(makeApp([undefined]), 0, 0, [win('0x1'), win('0x2')], true);
    assert.equal(deps.timers.size, 0);
});

test('repeated placement of the same order writes once, a changed order writes the whole store', () => {
    const deps = makeDeps();
    const orders = new Orders(deps);
    const app = makeApp();
    orders.record(app, 0, 0, [win('0x1'), win('0x2')], true);
    orders.record(app, 0, 1, [win('0x3'), win('0x4')], true);
    assert.equal(deps.timers.size, 1, 'one pending write for both placements');
    deps.fireTimers();
    assert.equal(deps.writes.length, 1);
    assert.deepEqual(JSON.parse(deps.writes[0].text).s, { 'MK0\n0': ['0x1', '0x2'], 'MK0\n1': ['0x3', '0x4'] });
    // the same order again: nothing changed, nothing scheduled
    orders.record(app, 0, 0, [win('0x1'), win('0x2')], true);
    assert.equal(deps.timers.size, 0, 'an unchanged order is not written again');
});

test('a placement that drops a surface removes its record', () => {
    const deps = makeDeps();
    const orders = new Orders(deps);
    const app = makeApp();
    orders.record(app, 0, 0, [win('0x1'), win('0x2')], true);
    deps.fireTimers();
    orders.record(app, 0, 0, [win('0x1')], true);
    deps.fireTimers();
    assert.deepEqual(JSON.parse(deps.writes.at(-1).text).s, {});
});

test('a corrupt file is ignored and logged once, and the next record overwrites it', () => {
    const deps = makeDeps({ [PATH]: 'not greenTile data' });
    const app = makeApp();
    const orders = new Orders(deps);
    assert.equal(orders.restore(app, 0, 0), null);
    assert.equal(deps.logs.filter((l) => l.includes('order')).length, 1, 'a single log line');
    orders.record(app, 0, 0, [win('0x1'), win('0x2')]);
    deps.fireTimers();
    assert.equal(deps.writes.length, 1);
    assert.deepEqual(JSON.parse(deps.writes[0].text).s, { 'MK0\n0': ['0x1', '0x2'] });
});

test('a read failure is tolerated and logged, never thrown', () => {
    const deps = makeDeps({ [PATH]: stored({}) }, { readThrows: true });
    const app = makeApp();
    const orders = new Orders(deps);
    assert.equal(orders.restore(app, 0, 0), null);
    assert.ok(deps.logs.some((l) => l.includes('read')));
});

test('a write failure is tolerated and logged, never thrown', () => {
    const deps = makeDeps({}, { writeThrows: true });
    const orders = new Orders(deps);
    const app = makeApp();
    assert.doesNotThrow(() => {
        orders.record(app, 0, 0, [win('0x1'), win('0x2')], true);
        deps.fireTimers();
    });
    assert.ok(deps.logs.some((l) => l.includes('write')));
});

test('a failing mkdir is tolerated and logged', () => {
    const deps = makeDeps({}, { mkdirFails: true });
    const orders = new Orders(deps);
    const app = makeApp();
    orders.record(app, 0, 0, [win('0x1'), win('0x2')], true);
    deps.fireTimers();
    assert.equal(deps.writes.length, 0);
    assert.ok(deps.logs.some((l) => l.includes('write') || l.includes('dir')));
});

test('destroy flushes the pending write and is idempotent; later records do nothing', () => {
    const deps = makeDeps();
    const orders = new Orders(deps);
    const app = makeApp();
    orders.record(app, 0, 0, [win('0x1'), win('0x2')], true);
    orders.destroy();
    assert.equal(deps.writes.length, 1, 'the last placement is not lost');
    assert.equal(deps.timers.size, 0, 'the debounce timer is gone');
    orders.destroy();
    assert.equal(deps.writes.length, 1, 'a second destroy writes nothing');
    orders.record(app, 0, 0, [win('0x5'), win('0x6')], true);
    assert.equal(deps.timers.size, 0, 'a destroyed store records nothing');
});

test('restore marks the surface used even when the snapshot has no ids for it', () => {
    const deps = makeDeps({ [PATH]: stored({ 'MK0\n0': ['0xa', '0xb'] }) });
    const orders = new Orders(deps);
    const app = makeApp();
    assert.equal(orders.restore(app, 0, 1), null);
    assert.equal(app.session.orderUsed.has('MK0\n1'), true, 'the first-use gate is per surface, not per record');
});

test('a placement of a surface whose stored order is still pending is not learned', () => {
    // Only the ACTIVE workspace restores, so a background workspace retiled by a
    // toggle places windows by the positions Muffin scrambled them into. Recording
    // that would destroy the very order the restart is waiting to restore, so the
    // retile paths pass explicit=false and nothing is written.
    const deps = makeDeps({ [PATH]: stored({ 'MK0\n0': ['0xa', '0xb'] }) });
    const orders = new Orders(deps);
    const app = makeApp();
    orders.record(app, 0, 1, [win('0x1'), win('0x2')]);
    orders.record(app, 0, 0, [win('0x9'), win('0x8')]);
    assert.equal(deps.timers.size, 0, 'nothing scheduled');
    assert.equal(deps.writes.length, 0);
    assert.deepEqual(orders.restore(app, 0, 0), ['0xa', '0xb'], 'the pending order survived');
});

test('an explicit arrangement is recorded and closes the surface restore', () => {
    const deps = makeDeps({ [PATH]: stored({ 'MK0\n0': ['0xa', '0xb'] }) });
    const orders = new Orders(deps);
    const app = makeApp();
    orders.record(app, 0, 0, [win('0x5'), win('0x6')], true);
    assert.equal(deps.timers.size, 1, 'a swap or drop is the user\'s order: it is written');
    deps.fireTimers();
    assert.deepEqual(JSON.parse(deps.writes[0].text).s, { 'MK0\n0': ['0x5', '0x6'] });
    assert.equal(orders.restore(app, 0, 0), null, 'no later retile undoes the user\'s arrangement');
});

test('a surface whose restore was resolved records normally from then on', () => {
    const deps = makeDeps();
    const orders = new Orders(deps);
    const app = makeApp();
    assert.equal(orders.restore(app, 0, 0), null, 'no store: the restore still resolves the surface');
    orders.record(app, 0, 0, [win('0x1'), win('0x2')]);
    assert.equal(deps.timers.size, 1);
    deps.fireTimers();
    assert.deepEqual(JSON.parse(deps.writes[0].text).s, { 'MK0\n0': ['0x1', '0x2'] });
});

test('without a session runtime dir there is no store at all', () => {
    // GLib falls back to the cache dir when XDG_RUNTIME_DIR is unset; a store there
    // would outlive the session it describes and snap a NEW session into an old
    // arrangement. No session runtime dir therefore means no store.
    const deps = makeDeps({ [PATH]: stored({ 'MK0\n0': ['0xa', '0xb'] }) }, { runtimeFallback: true });
    const orders = new Orders(deps);
    const app = makeApp();
    assert.equal(orders.restore(app, 0, 0), null, 'nothing is restored');
    orders.record(app, 0, 0, [win('0x1'), win('0x2')], true);
    orders.record(app, 0, 0, [win('0x3'), win('0x4')]);
    assert.equal(deps.timers.size, 0, 'nothing scheduled');
    assert.equal(deps.writes.length, 0, 'nothing written');
    assert.equal(deps.mkdirs.length, 0, 'no directory is created either');
});

test('an oversized file is ignored and logged instead of parsed', () => {
    const pad = 'x'.repeat(orderModel.ORDER_MAX_BYTES + 16);
    const deps = makeDeps({ [PATH]: stored({ 'MK0\n0': ['0xa', '0xb'] }).replace('{', '{"pad":"' + pad + '",') });
    const app = makeApp();
    const orders = new Orders(deps);
    assert.equal(orders.restore(app, 0, 0), null, 'the content is not trusted at any size');
    assert.ok(deps.logs.some((l) => l.includes('order')), 'and the rejection is logged');
});

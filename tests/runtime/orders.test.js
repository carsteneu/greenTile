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
    const fileType = { UNKNOWN: 0, REGULAR: 1, DIRECTORY: 2, SPECIAL: 3, SHORTCUT: 4, MOUNTABLE: 5 };
    const writes = [];
    const mkdirs = [];
    const modes = [];
    const dirs = new Set();
    const logs = [];
    const reads = [];
    const queries = [];
    const ops = [];
    const timers = new Map();
    let nextTimer = 1;
    // Completion queue: with opts.deferReads every file callback is held until
    // deps.releaseReads() runs it. That is the whole point — the store is read
    // asynchronously now, so the gap between "the App exists" and "the store is
    // loaded" must be testable, and a fake that always completes inline would hide it.
    let held = [];
    const settle = (work) => {
        if (opts.deferReads) {
            held.push(work);
            return;
        }
        work();
    };
    const deps = {
        files,
        writes,
        mkdirs,
        modes,
        dirs,
        logs,
        reads,
        queries,
        ops,
        timers,
        releaseReads: () => {
            // The read is a CHAIN (query, then content): draining once would stop after
            // the query, so the queue is drained until it stays empty.
            for (let round = 0; round < 10 && held.length; round++) {
                const queued = held;
                held = [];
                for (const work of queued) {
                    work();
                }
            }
        },
        // Deliberately NO synchronous file API: query_info, load_contents,
        // replace_contents and mkdir_with_parents do not exist here, so a single
        // surviving synchronous call fails this suite with a TypeError.
        glib: {
            get_user_runtime_dir: () => (opts.runtimeFallback ? CACHE_DIR : RUNTIME_DIR),
            get_user_cache_dir: () => CACHE_DIR,
            get_home_dir: () => '/home/fake',
            build_filenamev: (parts) => parts.join('/'),
            PRIORITY_DEFAULT: 0,
            Bytes: class {
                constructor(contents) {
                    this.contents = contents;
                }
            },
        },
        gio: {
            FileCreateFlags: { NONE: 0, PRIVATE: 1, REPLACE_DESTINATION: 2 },
            FileQueryInfoFlags: { NONE: 0, NOFOLLOW_SYMLINKS: 4 },
            FileType: fileType,
            IOErrorEnum: { EXISTS: 17 },
            io_error_quark: () => 1,
            // Gio.FileInfo.new() + set_attribute_uint32('unix::mode', …): the only way
            // to give make_directory_async's directory a mode, since that call takes none
            FileInfo: {
                new: () => {
                    const attrs = {};
                    return {
                        attrs,
                        set_attribute_uint32: (name, value) => { attrs[name] = value; },
                        get_attribute_uint32: (name) => attrs[name],
                    };
                },
            },
            File: {
                new_for_path: (path) => ({
                    get_path: () => path,
                    // modelled like the real Gio.File: the size/type is known before
                    // the content is read, which is what the guard relies on — the
                    // check just moved into the query callback
                    query_info_async: (attrs, flags, _priority, _cancellable, cb) => {
                        ops.push('query_info_async');
                        queries.push({ path, attrs, flags });
                        if (opts.queryThrows) {
                            throw new Error('injected query failure');
                        }
                        const info = {
                            get_file_type: () => (opts.fileType !== undefined ? opts.fileType : fileType.REGULAR),
                            get_size: () => (opts.fileSize !== undefined ? opts.fileSize : (files.get(path) || '').length),
                        };
                        settle(() => cb({ path }, { info }));
                    },
                    query_info_finish: (res) => res.info,
                    load_contents_async: (_cancellable, cb) => {
                        ops.push('load_contents_async');
                        reads.push(path);
                        if (opts.readThrows) {
                            throw new Error('injected read failure');
                        }
                        const value = files.has(path) ? [true, new TextEncoder().encode(files.get(path))] : [false, null];
                        settle(() => cb({ path }, { value }));
                    },
                    load_contents_finish: (res) => res.value,
                    replace_contents_bytes_async: (bytes, _etag, _backup, flags, _cancellable, cb) => {
                        ops.push('replace_contents_bytes_async');
                        if (opts.writeThrows) {
                            throw new Error('injected write failure');
                        }
                        const text = new TextDecoder().decode(bytes.contents);
                        files.set(path, text);
                        writes.push({ path, text, flags });
                        settle(() => cb({ path }, { value: [true, 'etag'] }));
                    },
                    replace_contents_finish: () => [true, 'etag'],
                    // The real make_directory_finish reports an EXISTING directory as an
                    // error — the normal case for every start after the first — and any
                    // other error as a genuine failure. The fake models both.
                    make_directory_async: (_priority, _cancellable, cb) => {
                        ops.push('make_directory_async');
                        if (opts.mkdirThrows) {
                            throw new Error('injected mkdir dispatch failure');
                        }
                        let error = null;
                        if (opts.mkdirFails) {
                            error = new Error('injected mkdir failure');
                        }
                        else if (dirs.has(path)) {
                            error = { matches: (_q, code) => code === 17 };
                        }
                        else {
                            dirs.add(path);
                        }
                        mkdirs.push({ path });
                        settle(() => cb({ path }, { error }));
                    },
                    make_directory_finish: (res) => {
                        if (res && res.error) {
                            throw res.error;
                        }
                        return true;
                    },
                    set_attributes_async: (info, _flags, _priority, _cancellable, cb) => {
                        ops.push('set_attributes_async');
                        if (opts.setAttributesThrows) {
                            throw new Error('injected set-attributes dispatch failure');
                        }
                        modes.push({ path, mode: info ? info.get_attribute_uint32('unix::mode') : null });
                        settle(() => cb({ path }, { error: opts.setAttributesFails ? new Error('injected set-attributes failure') : null }));
                    },
                    set_attributes_finish: (res) => {
                        if (res && res.error) {
                            throw res.error;
                        }
                        return true;
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
    assert.deepEqual(deps.mkdirs, [{ path: RUNTIME_DIR + '/greenTile@carsteneu' }]);
    assert.deepEqual(deps.modes.map((m) => m.mode), [0o700], 'the private 0700 mode');
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

test('a directory that cannot be created skips the write and is reported', () => {
    const deps = makeDeps({}, { mkdirFails: true });
    const orders = new Orders(deps);
    orders.record(makeApp(), 0, 0, [win('0x1'), win('0x2')], true);
    deps.fireTimers();
    assert.deepEqual(deps.mkdirs, [{ path: RUNTIME_DIR + '/greenTile@carsteneu' }], 'creation was attempted');
    assert.deepEqual(deps.writes, [], 'nothing is written into a directory that is not there');
    assert.ok(deps.logs.some((l) => l.includes('dir could not be created')), 'and the failure is reported');
});

test('an already existing directory is the normal case, neither a skipped write nor an error', () => {
    // make_directory_finish reports an existing directory as an error, and that is
    // what every start after the first sees. Treating it as a failure would silently
    // stop recording the order forever.
    const deps = makeDeps();
    deps.dirs.add(RUNTIME_DIR + '/greenTile@carsteneu');
    const orders = new Orders(deps);
    orders.record(makeApp(), 0, 0, [win('0x1'), win('0x2')], true);
    deps.fireTimers();
    assert.equal(deps.writes.length, 1, 'the write still goes out');
    assert.deepEqual(deps.logs, [], 'and nothing at all is reported as a failure');
    assert.deepEqual(deps.modes.map((m) => m.mode), [0o700], 'the private mode is still enforced');
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

test('a file that is not a small regular file is rejected BEFORE it is read', () => {
    // A FIFO, a symlink to /dev/zero or a multi-GB file at the store path would
    // block or exhaust the compositor's main thread inside load_contents, so the
    // type and size are checked first and the content is never read.
    for (const opts of [{ fileType: 3 /* SPECIAL: FIFO */ }, { fileType: 4 /* SHORTCUT: symlink */ }, { fileSize: orderModel.ORDER_MAX_BYTES + 1 }]) {
        const deps = makeDeps({ [PATH]: stored({ 'MK0\n0': ['0xa', '0xb'] }) }, opts);
        const orders = new Orders(deps);
        assert.deepEqual(deps.reads, [], 'load_contents was not called for ' + JSON.stringify(opts));
        assert.equal(deps.queries.length, 1, 'the type/size was queried');
        assert.equal(deps.queries[0].flags, deps.gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, 'without following a symlink');
        assert.equal(orders.restore(makeApp(), 0, 0), null);
    }
});

test('a query failure is tolerated and logged, never thrown', () => {
    const deps = makeDeps({ [PATH]: stored({ 'MK0\n0': ['0xa', '0xb'] }) }, { queryThrows: true });
    const orders = new Orders(deps);
    assert.equal(orders.restore(makeApp(), 0, 0), null);
    assert.deepEqual(deps.reads, [], 'nothing was read');
    assert.ok(deps.logs.some((l) => l.includes('order')));
});

test('a surface key can never reach Object.prototype', () => {
    // The file is untrusted: a "__proto__" key must become an ordinary property of
    // the parsed map, not the map's prototype. (Built as a raw string — in an object
    // literal "__proto__" would set the prototype and never reach the JSON.)
    const raw = '{"v":1,"s":{"__proto__":["0x1","0x2"],"MK0\\n0":["0x3","0x4"]}}';
    const parsed = orderModel.orderParse(raw);
    assert.equal(Object.getPrototypeOf(parsed.s), null, 'the map has no inherited prototype');
    assert.deepEqual(Object.keys(parsed.s).sort(), ['MK0\n0', '__proto__'].sort());
    assert.deepEqual(orderModel.orderGet(parsed, 'MK0\n0'), ['0x3', '0x4']);
    assert.equal({}.foo, undefined, 'Object.prototype itself is untouched');
});

// --- Asynchronous file access -------------------------------------------------
//
// Every file operation is asynchronous: the synchronous query_info, load_contents,
// replace_contents and mkdir_with_parents this store used block the compositor's
// main thread and are rejected by the Spices pattern checker. The store is read in
// the App constructor, so the read may not have landed when the settle retile asks
// for the recorded order — that restore must then stay OWED instead of being spent
// on nothing. The fake in this file has no synchronous file API at all, so the
// tests below fail with a TypeError if one call survives.

test('the store is read asynchronously, and only through async file APIs', () => {
    const deps = makeDeps({ [PATH]: stored({ 'MK0\n0': ['0xa', '0xb'] }) });
    const orders = new Orders(deps);
    assert.equal(orders.ready, true, 'a read that already landed leaves the store ready');
    assert.deepEqual(deps.ops, ['query_info_async', 'load_contents_async'], 'no synchronous call is made');
    assert.deepEqual(deps.reads, [PATH]);
    assert.equal(deps.queries[0].flags, deps.gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS, 'still without following a symlink');
});

test('restore() before the store is ready spends nothing: the restore stays owed', () => {
    const deps = makeDeps({ [PATH]: stored({ 'MK0\n0': ['0xa', '0xb'] }) }, { deferReads: true });
    const orders = new Orders(deps);
    const app = makeApp();
    assert.equal(orders.ready, false, 'the read has not landed yet');
    assert.equal(orders.restore(app, 0, 0), null, 'there is nothing to restore yet');
    assert.equal(app.session.orderUsed.size, 0, 'the surface is NOT spent — a later retile can still restore it');
    assert.ok(deps.logs.some((l) => l.includes('before the store was ready')), 'the early ask is reported');
    deps.releaseReads();
    assert.equal(orders.ready, true);
    assert.deepEqual(orders.restore(app, 0, 0), ['0xa', '0xb'], 'the owed restore is answered once the read landed');
    assert.equal(app.session.orderUsed.size, 1, 'and only now is the surface spent');
});

test('a placement recorded while the store is still loading survives the merge', () => {
    const deps = makeDeps({ [PATH]: stored({ 'MK0\n0': ['0xa', '0xb'] }) }, { deferReads: true });
    const orders = new Orders(deps);
    orders.record(makeApp(), 0, 1, [win('0x5'), win('0x6')], true);
    assert.equal(deps.timers.size, 0, 'nothing is written while the store is not known');
    deps.releaseReads();
    assert.equal(deps.timers.size, 1, 'the recorded change is written once the store landed');
    deps.fireTimers();
    deps.releaseReads();
    const s = JSON.parse(deps.writes[0].text).s;
    assert.deepEqual(s['MK0\n0'], ['0xa', '0xb'], 'the surface the file held is kept');
    assert.deepEqual(s['MK0\n1'], ['0x5', '0x6'], 'and the recorded one is added');
});

test('a store that is not loaded yet is never written', () => {
    // Writing the half-known store would drop every surface the file still holds.
    const deps = makeDeps({ [PATH]: stored({ 'MK0\n0': ['0xa', '0xb'] }) }, { deferReads: true });
    const orders = new Orders(deps);
    orders.destroy();
    assert.deepEqual(deps.writes, [], 'the flush of a store that is still loading writes nothing');
});

test('a read failure still resolves the store, so the settle is never held up', () => {
    const deps = makeDeps({ [PATH]: stored({ 'MK0\n0': ['0xa', '0xb'] }) }, { queryThrows: true });
    const orders = new Orders(deps);
    assert.equal(orders.ready, true, 'a failing read resolves the store as empty');
    assert.equal(orders.restore(makeApp(), 0, 0), null);
    assert.ok(deps.logs.some((l) => l.includes('read failed')));
});

test('destroy() during an in-flight read touches nothing and never throws', () => {
    const deps = makeDeps({ [PATH]: stored({ 'MK0\n0': ['0xa', '0xb'] }) }, { deferReads: true });
    const orders = new Orders(deps);
    orders.destroy();
    deps.releaseReads();
    assert.equal(orders.restore(makeApp(), 0, 0), null, 'a destroyed store restores nothing');
    assert.equal(deps.logs.filter((l) => l.includes('failed')).length, 0, 'and reports no error');
});

test('the write goes out asynchronously, chained after an asynchronous directory creation', () => {
    const deps = makeDeps();
    const orders = new Orders(deps);
    orders.record(makeApp(), 0, 0, [win('0x1'), win('0x2')], true);
    deps.fireTimers();
    assert.deepEqual(deps.ops.filter((o) => !o.startsWith('query_') && !o.startsWith('load_')),
        ['make_directory_async', 'set_attributes_async', 'replace_contents_bytes_async'],
        'the directory, its mode, then the file — all asynchronous');
    assert.deepEqual(deps.mkdirs, [{ path: RUNTIME_DIR + '/greenTile@carsteneu' }], 'the store directory');
    assert.deepEqual(deps.modes, [{ path: RUNTIME_DIR + '/greenTile@carsteneu', mode: 0o700 }],
        'make_directory_async takes no mode, so the private 0700 mode is applied right after');
    assert.equal(deps.writes[0].flags, deps.gio.FileCreateFlags.PRIVATE | deps.gio.FileCreateFlags.REPLACE_DESTINATION,
        'still private and replacing the destination');
    assert.deepEqual(JSON.parse(deps.writes[0].text).s, { 'MK0\n0': ['0x1', '0x2'] });
});

'use strict';
// Behavioral tests for the asynchronous accent-stylesheet persist in
// lib/runtime/theme.js. The generated sheet is written through the real async
// Gio API (Gio.File.replace_contents_bytes_async over GLib.Bytes) into a PRIVATE,
// per-Theme cache file; the resolved look (theme class, colors, sheet load,
// border, panel) is committed only once that write succeeded, so a slow or
// failed write leaves the whole previous look in place. A deterministic fake
// Gio queues its async ops and completes them on demand (env.flush(): FIFO,
// env.flushLast(): newest first) so delayed completion, rapid changes (latest
// wins), the warm A-B-A request, write failures and an out-of-order old/new
// owner completion are all reproducible. The real engine truncates the
// destination when an in-flight replace is cancelled (probe on cjs 115.1 /
// Gio 2.x), so the writer is never cancelled — a per-Theme file keeps an old
// owner's late write away from a new owner's file.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('../helpers/cinnamon-loader');

const { Theme } = load('./lib/runtime/theme');

const CACHE_DIR = '/home/fake/.cache';
const ACCENT_DEFAULT = [255, 150, 64];

// A delayed fake Gio: the directory creation, its mode, the bytes write and the
// teardown delete are all queued and completed by env.flush()/env.flushLast().
// Nothing synchronous is left to call — the runtime has no synchronous file API any
// more — and the mode is applied through a separate set_attributes_async, because
// make_directory_async takes no mode. Every async dispatch records the Cancellable
// it was handed (always null here).
const makeEnv = () => {
    const env = {
        ops: [],
        dispatched: [],
        writes: [],
        // successful creations and the mode applications, plus every mkdir ATTEMPT
        // (a failed attempt is not remembered as success, so it is retried)
        mkdirs: [],
        mkdirAttempts: [],
        modes: [],
        dirs: new Set(),
        deletes: [],
        loads: [],
        unloads: [],
        logs: [],
        restyles: 0,
        rebuilds: 0,
        panelActor: null,
          failWrite: false,
          failBytes: false,
          failMkdir: false,
          failSetAttr: false,
        gen: 100,
        // St.Theme.load_stylesheet returns a boolean; a test flips loadOk to false
        // to drive a failed load (native: missing file -> false, no throw)
        loadOk: true,
    };

    const makeFile = (p) => ({
        get_path: () => p,
        make_directory_async(_priority, cancellable, cb) {
            env.dispatched.push({ type: 'mkdir', cancellable });
            env.mkdirAttempts.push({ path: p });
            env.ops.push({ type: 'mkdir', path: p, cb });
        },
        make_directory_finish(res) {
            if (res && res.error) {
                throw res.error;
            }
            return true;
        },
        set_attributes_async(info, _flags, _priority, cancellable, cb) {
            env.dispatched.push({ type: 'setattr', cancellable });
            env.ops.push({ type: 'setattr', path: p, mode: info ? info.get_attribute_uint32('unix::mode') : null, cb });
        },
        set_attributes_finish(res) {
            if (res && res.error) {
                throw res.error;
            }
            return true;
        },
        replace_contents_bytes_async(bytes, _etag, _backup, flags, cancellable, cb) {
            env.dispatched.push({ type: 'write', cancellable });
            env.ops.push({ type: 'write', path: p, bytes, flags, cb });
        },
        replace_contents_finish(res) {
            if (res && res.error) {
                throw res.error;
            }
            return [true, 'fake-etag'];
        },
        delete_async(_priority, cancellable, cb) {
            env.dispatched.push({ type: 'delete', cancellable });
            env.ops.push({ type: 'delete', path: p, cb });
        },
        delete_finish(res) {
            if (res && res.error) {
                throw res.error;
            }
        },
    });

    env.gio = {
        FileCreateFlags: { NONE: 0, PRIVATE: 1, REPLACE_DESTINATION: 2 },
        FileQueryInfoFlags: { NONE: 0, NOFOLLOW_SYMLINKS: 4 },
        IOErrorEnum: { EXISTS: 17 },
        io_error_quark: () => 1,
        FileInfo: {
            new: () => {
                const attrs = {};
                return {
                    set_attribute_uint32: (name, value) => { attrs[name] = value; },
                    get_attribute_uint32: (name) => attrs[name],
                };
            },
        },
        File: { new_for_path: (p) => makeFile(p) },
        SettingsSchemaSource: { get_default: () => ({ lookup: () => null }) },
    };
    env.glib = {
        PRIORITY_DEFAULT: 0,
        path_get_dirname: (p) => p.slice(0, p.lastIndexOf('/')),
        build_filenamev: (parts) => parts.join('/'),
        get_user_cache_dir: () => CACHE_DIR,
        Bytes: class {
            constructor(contents) {
                if (env.failBytes) {
                    throw new TypeError('fake: byte encoding failed');
                }
                if (!(contents instanceof Uint8Array)) {
                    throw new TypeError('GLib.Bytes: expected a ByteArray (Uint8Array)');
                }
                this.contents = contents;
            }
        },
    };
    env.byteArray = { fromString: (s) => new TextEncoder().encode(s) };
    env.stTheme = {
        load_stylesheet: (p) => { env.loads.push(p); return env.loadOk; },
        unload_stylesheet: (p) => env.unloads.push(p),
    };
    env.st = {
        ThemeContext: { get_for_stage: () => ({ get_theme: () => env.stTheme }) },
        BoxLayout: class {
            constructor() {
                throw new Error('the probe cannot run in this fake');
            }
        },
    };

    const complete = (op) => {
        let res = {};
        if (op.type === 'write') {
            if (env.failWrite) {
                res = { error: new Error('fake write failure') };
            }
            else {
                env.writes.push({ path: op.path, flags: op.flags, text: Buffer.from(op.bytes.contents).toString('utf8') });
            }
        }
        else if (op.type === 'delete') {
            env.deletes.push(op.path);
        }
        else if (op.type === 'mkdir') {
            if (env.failMkdir) {
                res = { error: new Error('fake mkdir failure') };
            }
            else if (env.dirs.has(op.path)) {
                // the real finish reports an existing directory as EXISTS
                res = { error: { matches: (_quark, code) => code === env.gio.IOErrorEnum.EXISTS } };
            }
            else {
                env.dirs.add(op.path);
                env.mkdirs.push({ path: op.path });
            }
        }
        else {
            if (env.failSetAttr) {
                res = { error: new Error('fake set-attributes failure') };
            }
            else {
                env.modes.push({ path: op.path, mode: op.mode });
            }
        }
        op.cb(null, res);
    };
    // How many WRITES are in flight — the directory ops sit in the same queue now.
    env.pendingWrites = () => env.ops.filter((op) => op.type === 'write').length;
    // Completes the queued directory ops (creation, then mode) so the in-flight
    // request reaches its write — the directory work precedes the write now.
    env.flushDirectory = () => {
        while (env.ops.length && env.ops[0].type !== 'write') {
            env.flushOne();
        }
    };
    env.flushOne = () => {
        const op = env.ops.shift();
        if (!op) {
            return false;
        }
        complete(op);
        return true;
    };
    env.flushLast = () => {
        const op = env.ops.pop();
        if (!op) {
            return false;
        }
        complete(op);
        return true;
    };
    env.flush = () => {
        let n = 0;
        while (env.flushOne()) {
            n++;
            if (n > 100) {
                throw new Error('fake flush did not settle');
            }
        }
        return n;
    };
    return env;
};

const settings = (overrides = {}) => ({
    getValue: (key) => Object.assign({
        panelTheme: 'dark',
        accentMode: 'own',
        accentColor: 'rgb(200, 10, 20)',
        stateMode: '',
        stateColor: '',
    }, overrides)[key],
});

const makeTheme = (env, options = {}) => {
    const config = {
        settings: settings(options.values),
        app: { border: { restyle: () => { env.restyles++; } } },
    };
    const theme = new Theme({
        st: env.st,
        gio: env.gio,
        main: { uiGroup: { add_child() {}, remove_child() {} }, themeManager: { connect: () => 1, disconnect() {} } },
        global: { logError: (m) => env.logs.push(String(m)), stage: {} },
        glib: env.glib,
        byteArray: env.byteArray,
        nextAccentGen: () => 'gk-acc' + (++env.gen),
        panelOpen: () => env.panelActor,
        panelRebuild: () => { env.rebuilds++; },
    });
    return { theme, config };
};

test('the sheet is written asynchronously and the look is applied only after the write settled', () => {
    const env = makeEnv();
    const { theme, config } = makeTheme(env);
    theme.init(config);
    assert.equal(env.writes.length, 0, 'no synchronous file write');
    assert.equal(env.loads.length, 0, 'no sheet loaded before the write settled');
    assert.equal(env.restyles, 0, 'the border is not restyled before the write settled');
    assert.equal(theme.gen, '', 'no generation before the write settled');
    assert.deepEqual(env.mkdirs, [], 'the directory is not created synchronously');
    assert.equal(env.pendingWrites(), 0, 'the write waits for the directory');
    assert.equal(env.ops.length, 1, 'the directory creation is in flight');
    env.flush();
    assert.deepEqual(env.mkdirs.length, 1, 'the private directory is created');
    assert.deepEqual(env.modes.map((m) => m.mode), [0o700], 'and given the private mode in a second asynchronous step');
    assert.equal(env.writes.length, 1, 'exactly one write');
    assert.equal(env.loads.length, 1, 'the sheet loaded after the write');
    assert.equal(env.unloads.length, 0, 'nothing unloaded on the first load');
    assert.match(theme.gen, /^gk-acc\d+$/, 'a generation class was taken');
    assert.equal(env.restyles, 1, 'the border restyled after the write');
});

test('an unchanged accent performs no second write but still restyles', () => {
    const env = makeEnv();
    const { theme, config } = makeTheme(env);
    theme.init(config);
    env.flush();
    theme.changed();
    assert.equal(env.writes.length, 1, 'unchanged accent: no second write');
    assert.equal(env.loads.length, 1, 'still a single load');
    assert.equal(env.pendingWrites(), 0, 'no file op dispatched for the unchanged accent');
    assert.equal(env.restyles, 2, 'the border is repainted');
});

test('the private directory is prepared only once across distinct writes and a failed write', () => {
    const env = makeEnv();
    const { theme, config } = makeTheme(env);
    theme.init(config);
    env.flush();
    config.settings = settings({ accentColor: 'rgb(30, 40, 50)' });
    theme.changed();
    env.flush();
    env.failWrite = true;
    config.settings = settings({ accentColor: 'rgb(60, 70, 80)' });
    theme.changed();
    env.flush();
    env.failWrite = false;
    theme.changed();
    env.flush();
    assert.equal(env.writes.length, 3, 'three different looks were successfully written');
    assert.equal(env.mkdirAttempts.length, 1, 'the directory is prepared once per Theme');
    assert.deepEqual(env.modes.map((m) => m.mode), [0o700], 'one successful 0700 preparation per Theme');
    assert.equal(theme.rgb[0], 60, 'a failed write can be retried without another mkdir');
});

test('a failed directory preparation is reported and retried before the first write', () => {
    const env = makeEnv();
    env.failMkdir = true;
    const { theme, config } = makeTheme(env);
    theme.init(config);
    assert.equal(env.pendingWrites(), 0, 'the write waits for the directory');
    env.flush();
    assert.equal(env.writes.length, 0, 'no file write after mkdir failed');
    assert.equal(env.logs.length, 1, 'directory failure is reported');
    env.failMkdir = false;
    theme.changed();
    env.flush();
    assert.equal(env.mkdirAttempts.length, 2, 'failed preparation was not remembered as success');
    assert.equal(env.writes.length, 1);
    assert.deepEqual(env.modes.map((m) => m.mode), [0o700], 'the mode is applied after the directory exists');
    config.settings = settings({ accentColor: 'rgb(30, 40, 50)' });
    theme.changed();
    env.flush();
    assert.equal(env.mkdirAttempts.length, 2, 'successful preparation is reused');
});

test('an already existing directory is the normal case, not a failure', () => {
    // Every start after the first finds the cache directory in place, and the finish
    // reports that as EXISTS. Treating it as an error would skip the sheet entirely.
    const env = makeEnv();
    env.dirs.add(CACHE_DIR + '/greenTile@carsteneu');
    const { theme, config } = makeTheme(env);
    theme.init(config);
    env.flush();
    assert.equal(env.writes.length, 1, 'the sheet is still written');
    assert.deepEqual(env.logs, [], 'and nothing is reported as a failure');
    assert.deepEqual(env.modes.map((m) => m.mode), [0o700], 'the mode is still enforced on the existing directory');
    assert.equal(theme.gen, 'gk-acc101', 'the look is applied');
});

test('rapid changes: only the latest content is written, loaded and applied', () => {
    const env = makeEnv();
    const { theme, config } = makeTheme(env);
    theme.init(config);
    assert.equal(env.ops.length, 1, 'the first request is still in flight');
    config.settings = settings({ accentColor: 'rgb(30, 40, 50)' });
    theme.changed();
    env.flush();
    assert.equal(env.writes[env.writes.length - 1].text.includes('30, 40, 50'), true, 'the latest content is the one on disk');
    assert.equal(env.loads.length, 1, 'exactly one load — the superseded request never loaded');
    assert.equal(env.restyles, 1, 'the superseded apply never ran');
    assert.equal(theme.rgb[0], 30, 'the latest colors are the applied ones');
});

test('a warm request arriving after a newer one still wins and does not bypass the in-flight write (A, B, A)', () => {
    const env = makeEnv();
    const { theme, config } = makeTheme(env);
    theme.init(config);
    env.flush(); // A is warm: written, loaded and applied
    const warm = env.writes.length;
    // B starts a write that stays in flight…
    config.settings = settings({ accentColor: 'rgb(30, 40, 50)' });
    theme.changed();
    assert.equal(env.pendingWrites(), 1, 'B is writing');
    // …when A is requested again; it must queue behind B and win
    config.settings = settings();
    theme.changed();
    env.flush();
    assert.equal(env.writes.length - warm, 2, 'the superseded B and the winning A were both written, A last');
    assert.equal(env.writes[env.writes.length - 1].text.includes('200, 10, 20'), true, 'the file ends at the latest (A) content');
    assert.equal(theme.rgb[0], 200, 'the latest colors are applied');
    assert.equal(theme.theme, 'dark');
});

test('a failed write keeps the whole old look and a later change recovers', () => {
    const env = makeEnv();
    env.failWrite = true;
    const { theme, config } = makeTheme(env);
    theme.init(config);
    env.flush();
    assert.equal(env.loads.length, 0, 'no sheet loaded after a failed write');
    assert.equal(theme.gen, '', 'no generation after a failed write');
    assert.deepEqual(theme.rgb, ACCENT_DEFAULT, 'the resolved accent stays the default (old look)');
    assert.equal(env.restyles, 0, 'no repaint after a failed write');
    assert.equal(env.logs.some((l) => l.startsWith('greenTile: accent color: ')), true, 'the failure is logged');
    env.failWrite = false;
    theme.changed();
    env.flush();
    assert.equal(env.loads.length, 1, 'the retry loads');
    assert.equal(theme.rgb[0], 200, 'the retry applies the configured accent');
});

test('a write failure with a newer request pending does not wedge the queue: the newer request wins', () => {
    const env = makeEnv();
    env.failWrite = true;
    const { theme, config } = makeTheme(env);
    theme.init(config); // A is writing
    config.settings = settings({ accentColor: 'rgb(30, 40, 50)' });
    theme.changed(); // B queues behind A
    env.flushDirectory(); // A's directory is ready, so its write is the op in flight
    assert.equal(env.pendingWrites(), 1, 'only A is in flight; B is pending');
    env.flushOne(); // A fails
    env.failWrite = false;
    env.flush(); // B is written and applied
    assert.equal(theme.rgb[0], 30, 'the newer request is applied after the failure');
    assert.equal(env.loads.length, 1, 'exactly one load — B');
    assert.equal(env.logs.some((l) => l.startsWith('greenTile: accent color: ')), true, 'the failure is logged');
});

test('a theme switch is committed only with the applied look: a delayed write keeps the whole old theme', () => {
    const env = makeEnv();
    const { theme, config } = makeTheme(env);
    theme.init(config);
    env.flush();
    assert.equal(theme.theme, 'dark');
    config.settings = settings({ panelTheme: 'light', accentColor: 'rgb(30, 40, 50)' });
    theme.changed();
    assert.equal(theme.theme, 'dark', 'the light theme is not committed while the write is in flight');
    assert.equal(theme.panelClass().includes('gk-light'), false, 'no light class over the dark sheet');
    assert.equal(env.loads.length, 1, 'the old sheet is still the loaded one');
    env.flush();
    assert.equal(theme.theme, 'light', 'committed once the write landed');
    assert.equal(theme.panelClass().includes('gk-light'), true);
});

test('a replaced live St.Theme object forces a sheet reload even for unchanged content', () => {
    const env = makeEnv();
    const { theme, config } = makeTheme(env);
    theme.init(config);
    env.flush();
    assert.equal(env.loads.length, 1);
    // Cinnamon theme switch: loadTheme installed a NEW St.Theme object
    env.stTheme = {
        load_stylesheet: (p) => { env.loads.push(p); return env.loadOk; },
        unload_stylesheet: (p) => env.unloads.push(p),
    };
    theme.changed();
    env.flush();
    assert.equal(env.pendingWrites(), 0, 'unchanged content: no write on the theme switch');
    assert.equal(env.unloads.length, 1, 'the sheet is unloaded off the replaced theme object');
    assert.equal(env.loads.length, 2, 'the sheet is loaded again on the new theme object');
});

test('an open panel is rebuilt only after the write settled', () => {
    const env = makeEnv();
    env.panelActor = { name: 'panel' };
    const { theme, config } = makeTheme(env);
    theme.init(config);
    assert.equal(env.rebuilds, 0, 'nothing rebuilt before the write settled');
    env.flush();
    assert.equal(env.rebuilds, 1, 'the open panel rebuilt after the write');
});

test('the sheet is written user-only (PRIVATE | REPLACE_DESTINATION)', () => {
    const env = makeEnv();
    const { theme, config } = makeTheme(env);
    theme.init(config);
    env.flush();
    assert.notEqual(env.writes[0].flags & env.gio.FileCreateFlags.PRIVATE, 0, 'PRIVATE is set');
    assert.notEqual(env.writes[0].flags & env.gio.FileCreateFlags.REPLACE_DESTINATION, 0, 'REPLACE_DESTINATION is set');
    assert.equal(env.dispatched.every((op) => op.cancellable === null), true, 'no Cancellable is ever passed');
});

test('destroy while a write is pending: the completion neither loads nor repaints, and removes this owner file', () => {
    const env = makeEnv();
    const { theme, config } = makeTheme(env);
    theme.init(config);
    const path = theme._path;
    assert.equal(env.ops.length, 1, 'a request is in flight (its directory is being prepared)');
    theme.destroy();
    env.flush();
    assert.equal(env.loads.length, 0, 'a completion after destroy does not load');
    assert.equal(env.restyles, 0, 'a completion after destroy does not repaint');
    assert.equal(theme.gen, '', 'no generation after destroy');
    assert.deepEqual(env.deletes, [path], 'this owner file is removed once the in-flight write settled');
});

test('destroy after the write settled removes the file and unloads the sheet immediately', () => {
    const env = makeEnv();
    const { theme, config } = makeTheme(env);
    theme.init(config);
    env.flush();
    const path = theme._path;
    theme.destroy();
    env.flush();
    assert.equal(env.unloads.length, 1, 'the sheet is unloaded');
    assert.deepEqual(env.deletes, [path]);
});

test('out-of-order completion: an old owner late write lands on its own file, never the new owner file', () => {
    const env = makeEnv();
    const a = makeTheme(env);
    a.theme.init(a.config);
    const oldPath = a.theme._path;
    a.theme.destroy(); // the old write is still in flight; its file is removed once it settled
    const b = makeTheme(env, { values: { accentColor: 'rgb(30, 40, 50)' } });
    b.theme.init(b.config);
    const newPath = b.theme._path;
    assert.notEqual(oldPath, newPath, 'the owners do not share a stylesheet file');
    // complete the new owner chain first (its three ops are the newest), then let the
    // old owner's chain — and with it its write — land last
    env.flushLast();
    env.flushLast();
    env.flushLast();
    env.flush();
    assert.equal(env.writes.find((w) => w.path === newPath).text.includes('30, 40, 50'), true, 'the new owner file holds its content');
    assert.equal(env.writes.find((w) => w.path === oldPath).text.includes('200, 10, 20'), true, 'the old write landed on its own file');
    assert.equal(env.loads.includes(newPath), true, 'the new owner loaded its own file');
    assert.equal(env.loads.includes(oldPath), false, 'the old owner file is never loaded by the new owner');
});

test('a failed load_stylesheet is not counted as a loaded look and retries on the next change', () => {
    const env = makeEnv();
    env.loadOk = false;
    const { theme, config } = makeTheme(env);
    theme.init(config);
    env.flush();
    assert.equal(env.loads.length, 1, 'the load was attempted');
    assert.equal(theme._themeObj, null, 'a failed load records no live theme object');
    assert.equal(theme._loaded, '', 'no content is recorded as loaded');
    assert.equal(theme.gen, '', 'no generation class is taken for a failed load');
    assert.equal(env.logs.some((l) => l.startsWith('greenTile: accent stylesheet: ')), true,
        'the failed load is reported');
    env.loadOk = true;
    theme.changed();
    env.flush();
    assert.equal(env.loads.length, 2, 'a later change retries the load');
    assert.match(theme.gen, /^gk-acc\d+$/, 'the successful retry takes a generation class');
    assert.equal(theme._loaded !== '', true, 'the retry records the loaded content');
});

test('a load that fails after a successful load keeps the previous colors and retries', () => {
    const env = makeEnv();
    const { theme, config } = makeTheme(env);
    theme.init(config);
    env.flush();
    assert.match(theme.gen, /^gk-acc\d+$/, 'A: a generation class was taken');
    assert.equal(theme._loaded !== '', true, 'A: content was recorded as loaded');
    assert.equal(env.restyles, 1, 'A: the border restyled');
    const firstGen = theme.gen;
    // B: different colors, but the live theme refuses to load the sheet
    env.loadOk = false;
    config.settings = settings({ accentColor: 'rgb(30, 40, 50)' });
    theme.changed();
    env.flush();
    assert.equal(env.loads.length, 2, 'B: the load was attempted');
    assert.equal(env.unloads.length, 1, 'B: the same-path reload has already dropped A\'s sheet');
    assert.equal(theme._themeObj, null, 'B: no live theme object is recorded');
    assert.equal(theme._loaded, '', 'B: nothing is recorded as loaded');
    assert.equal(theme.gen, '', 'B: no generation class for a sheet that is not there');
    assert.equal(theme.rgb[0], 200, 'B: the refused look is not committed (colors stay A)');
    assert.equal(env.restyles, 1, 'B: no repaint for a look whose sheet did not load');
    // the next change retries; once the theme accepts the sheet, the look commits
    env.loadOk = true;
    theme.changed();
    env.flush();
    assert.equal(env.loads.length, 3, 'the retry attempts the load again');
    assert.match(theme.gen, /^gk-acc\d+$/, 'the retry takes a fresh generation class');
    assert.notEqual(theme.gen, firstGen, 'the generation class is never reused');
    assert.equal(theme.rgb[0], 30, 'the retry commits the configured accent');
    assert.equal(env.restyles, 2, 'the retry repaints');
});

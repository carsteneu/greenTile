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

// A delayed fake Gio: mkdir is the one synchronous GLib call; the bytes write
// and the teardown delete are queued and completed by env.flush()/env.flushLast().
// Every async dispatch records the Cancellable it was handed (always null here).
const makeEnv = () => {
    const env = {
        ops: [],
        dispatched: [],
        writes: [],
        mkdirs: [],
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
        gen: 100,
    };

    const makeFile = (p) => ({
        get_path: () => p,
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
        File: { new_for_path: (p) => makeFile(p) },
        SettingsSchemaSource: { get_default: () => ({ lookup: () => null }) },
    };
    env.glib = {
        PRIORITY_DEFAULT: 0,
        path_get_dirname: (p) => p.slice(0, p.lastIndexOf('/')),
        build_filenamev: (parts) => parts.join('/'),
        get_user_cache_dir: () => CACHE_DIR,
          mkdir_with_parents: (path, mode) => {
              env.mkdirs.push({ path, mode });
              return env.failMkdir ? -1 : 0;
        },
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
        load_stylesheet: (p) => env.loads.push(p),
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
        else {
            env.deletes.push(op.path);
        }
        op.cb(null, res);
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
    assert.deepEqual(env.mkdirs.map((m) => m.mode), [0o700], 'the private directory is made once, 0700');
    assert.equal(env.ops.length, 1, 'one write is in flight');
    env.flush();
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
    assert.equal(env.ops.length, 0, 'no file op dispatched for the unchanged accent');
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
    assert.deepEqual(env.mkdirs.map((m) => m.mode), [0o700], 'one successful preparation per Theme');
    assert.equal(theme.rgb[0], 60, 'a failed write can be retried without another mkdir');
});

test('a failed directory preparation is reported and retried before the first write', () => {
    const env = makeEnv();
    env.failMkdir = true;
    const { theme, config } = makeTheme(env);
    theme.init(config);
    assert.equal(env.ops.length, 0, 'no file write after mkdir failed');
    assert.equal(env.logs.length, 1, 'directory failure is reported');
    env.failMkdir = false;
    theme.changed();
    env.flush();
    assert.equal(env.mkdirs.length, 2, 'failed preparation was not remembered as success');
    assert.equal(env.writes.length, 1);
    config.settings = settings({ accentColor: 'rgb(30, 40, 50)' });
    theme.changed();
    env.flush();
    assert.equal(env.mkdirs.length, 2, 'successful preparation is reused');
});

test('rapid changes: only the latest content is written, loaded and applied', () => {
    const env = makeEnv();
    const { theme, config } = makeTheme(env);
    theme.init(config);
    assert.equal(env.ops.length, 1, 'the first write is still in flight');
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
    assert.equal(env.ops.length, 1, 'B is writing');
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
    assert.equal(env.ops.length, 1, 'only A is in flight; B is pending');
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
        load_stylesheet: (p) => env.loads.push(p),
        unload_stylesheet: (p) => env.unloads.push(p),
    };
    theme.changed();
    env.flush();
    assert.equal(env.ops.length, 0, 'unchanged content: no write on the theme switch');
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
    assert.equal(env.ops.length, 1, 'a write is in flight');
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
    // complete the new owner chain first, then let the old owner's write land last
    env.flushLast();
    env.flushLast();
    env.flushLast();
    assert.equal(env.writes.find((w) => w.path === newPath).text.includes('30, 40, 50'), true, 'the new owner file holds its content');
    assert.equal(env.writes.find((w) => w.path === oldPath).text.includes('200, 10, 20'), true, 'the old write landed on its own file');
    assert.equal(env.loads.includes(newPath), true, 'the new owner loaded its own file');
    assert.equal(env.loads.includes(oldPath), false, 'the old owner file is never loaded by the new owner');
});

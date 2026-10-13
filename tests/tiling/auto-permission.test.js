'use strict';
// The consolidated automatic-tiling permission query (lib/tiling/layout.autoAllowed):
// ONE decision — may automatic tiling run for this monitor+workspace? — reached by
// both the retile (lib/tiling/retile.retileMonitor) and the swap
// (lib/tiling/swap.swapHotkey). It answers NO when the monitor registry cannot
// address the monitor or when a RETAINED pause outranks the stored setting, and it
// is observational: it reads the stored layout and the retained queue, never writes.
const test = require('node:test');
const assert = require('node:assert/strict');

const { load } = require('../helpers/cinnamon-loader');
const { makeEnv, makeWindow, makeWorkspace, settingsInstance, enableOnMonitor } = require('../helpers/fakes/cinnamon-harness');

// autoAllowed reads `imports.ui.main.layoutManager.monitors`, so the module must be
// loaded through the fake env that installed `globalThis.imports`; the real app from
// that env then gives the ref (monitor key + effective workspace key) the stubs key on.
const loadWithEnv = () => {
    const { env, ext } = makeEnv();
    enableOnMonitor(env, ext);
    const app = ext.currentSession().app;
    const ref = app.split.ref(app, 0, 0, 2);
    return { env, ext, app, ref, autoAllowed: load('./lib/tiling/layout.js').autoAllowed };
};

// A minimal app: only the surfaces autoAllowed/layoutFor read. `onWrite` defaults to
// a hard failure so any settings write proves the query is not observational.
const appFor = (ref, { ready = true, auto = true, pause = false, onWrite } = {}) => ({
    monitors: { ready: ready, keys: [ref.mkey], wsKey: () => ref.wskey },
    session: { holdsPause: () => pause },
    config: {
        settings: {
            getValue: (k) => (k === 'layouts'
                ? JSON.stringify({ [ref.mkey]: { [ref.wskey]: { auto: auto } } })
                : k === 'presets' ? '[]' : undefined),
            setValue: onWrite || (() => assert.fail('the permission query must not write settings')),
        },
    },
});

test('autoAllowed: NO while the monitor registry is not ready', () => {
    const { ref, autoAllowed } = loadWithEnv();
    assert.equal(autoAllowed(appFor(ref, { ready: false }), 0, 0), false);
});

test('autoAllowed: NO for a monitor that does not exist', () => {
    const { ref, autoAllowed } = loadWithEnv();
    assert.equal(autoAllowed(appFor(ref, { auto: true }), 99, 0), false);
});

test('autoAllowed: NO when the stored layout has auto off', () => {
    const { ref, autoAllowed } = loadWithEnv();
    assert.equal(autoAllowed(appFor(ref, { auto: false }), 0, 0), false);
});

test('autoAllowed: YES when the monitor is ready, stored auto is on and no pause is retained', () => {
    const { ref, autoAllowed } = loadWithEnv();
    assert.equal(autoAllowed(appFor(ref, { auto: true }), 0, 0), true);
});

test('autoAllowed: a retained pause outranks the stored setting, and the query never writes', () => {
    const { ref, autoAllowed } = loadWithEnv();
    let writes = 0;
    const stub = appFor(ref, { auto: true, pause: true, onWrite: () => { writes += 1; } });
    assert.equal(autoAllowed(stub, 0, 0), false, 'stored auto on + retained pause off -> NO');
    assert.equal(writes, 0, 'observational: no settings write');
});

test('autoAllowed: the real app agrees with its own stored state and retained queue', () => {
    const { ext, app, autoAllowed } = loadWithEnv();
    app.ops.layoutSet(app, 0, 0, { auto: false });
    assert.equal(autoAllowed(app, 0, 0), false, 'stored off');
    app.ops.layoutSet(app, 0, 0, { auto: true });
    assert.equal(autoAllowed(app, 0, 0), true, 'stored on');
    app.session.pendingAuto.push({ monitorIndex: 0, wsIndex: 0, auto: false });
    assert.equal(app.session.holdsPause(app, 0, 0), true, 'the pause is retained');
    assert.equal(autoAllowed(app, 0, 0), false, 'a retained pause wins over stored on');
    ext.disable();
});

// A stored preset id the preset list no longer contains counts as assigned: the
// automatic grid takes over, and the fallback is reported exactly once.
const appStale = (ref) => ({
    monitors: { ready: true, keys: [ref.mkey], wsKey: () => ref.wskey },
    session: { holdsPause: () => false },
    config: {
        settings: {
            getValue: (k) => (k === 'layouts'
                ? JSON.stringify({ [ref.mkey]: { [ref.wskey]: { preset: 'gone' } } })
                : k === 'presets' ? '[]' : undefined),
            setValue: () => assert.fail('the fallback must not write settings'),
        },
    },
});

test('autoAllowed: a vanished preset id falls back to the automatic grid', () => {
    const { ref, autoAllowed } = loadWithEnv();
    assert.equal(autoAllowed(appStale(ref), 0, 0), true, 'the fallback turns automatic tiling on');
});

test('a vanished preset id is logged once per session, the read never writes', () => {
    // Through the real app: `load()` caches ONE importer per process, so a module
    // loaded that way keeps the `global` of the first environment in this file and
    // its log would land in another test's env. The harness gives every env its own
    // module tree, so the line is asserted where the product actually writes it.
    const { env, ext } = makeEnv();
    enableOnMonitor(env, ext);
    const app = ext.currentSession().app;
    assert.equal(app.ops.layoutSet(app, 0, 0, { preset: 'gone' }), true, 'the stale assignment is stored');
    const first = app.ops.layoutFor(app, 0, 0);
    assert.deepEqual({ preset: first.preset, auto: first.auto }, { preset: null, auto: true }, 'the automatic grid takes over');
    app.ops.layoutFor(app, 0, 0);
    const lines = env.logs.filter((l) => l.indexOf('greenTile preset "gone" no longer exists') === 0);
    assert.equal(lines.length, 1, 'the fallback is reported exactly once per session');
    ext.disable();
});

test('a paused slot with a vanished preset id is not reported as using the grid', () => {
    // An explicitly stored pause outranks the fallback, so no grid runs there and the
    // message would be a lie — consumed once per session, it would also swallow the
    // report of a slot where the grid really did take over.
    const { env, ext } = makeEnv();
    enableOnMonitor(env, ext);
    const app = ext.currentSession().app;
    assert.equal(app.ops.layoutSet(app, 0, 0, { preset: 'gone' }), true);
    assert.equal(app.ops.layoutSet(app, 0, 0, { auto: false }), true, 'the user paused the slot');
    const layout = app.ops.layoutFor(app, 0, 0);
    assert.deepEqual({ preset: layout.preset, auto: layout.auto }, { preset: null, auto: false }, 'the pause wins');
    assert.deepEqual(env.logs.filter((l) => l.indexOf('greenTile preset "gone"') === 0), [], 'nothing claims a grid ran');
    ext.disable();
});

test('the reported preset id is echoed without line breaks or control characters', () => {
    // The id comes out of the stored settings string. This pins the SHAPE of the echo —
    // what a reader of the log file gets — not a line count: the harness keeps one entry
    // per global.log call, so a smuggled LF could never show up as a second entry.
    const { env, ext } = makeEnv();
    enableOnMonitor(env, ext);
    const app = ext.currentSession().app;
    assert.equal(app.ops.layoutSet(app, 0, 0, { preset: 'go"ne\r\nforged\u2028x\u0000\u001b[31m\u0085y' }), true);
    app.ops.layoutFor(app, 0, 0);
    const line = env.logs.filter((l) => l.indexOf('greenTile preset "') === 0)[0];
    assert.ok(line, 'the fallback is reported');
    for (const bad of ['\n', '\r', '\u2028', '\u0085', '\u0000', '\u001b']) {
        assert.equal(line.includes(bad), false, 'the echo carries no ' + JSON.stringify(bad));
    }
    assert.equal((line.match(/"/g) || []).length, 2, 'the two delimiters only — the id cannot forge message text');
    assert.equal(line.includes('forged'), true, 'the id stays recognisable, only collapsed');
    ext.disable();
});

test('a very long stored preset id cannot stretch the report line', () => {
    const { env, ext } = makeEnv();
    enableOnMonitor(env, ext);
    const app = ext.currentSession().app;
    assert.equal(app.ops.layoutSet(app, 0, 0, { preset: 'g' + 'x'.repeat(4000) }), true);
    app.ops.layoutFor(app, 0, 0);
    const line = env.logs.filter((l) => l.indexOf('greenTile preset "') === 0)[0];
    assert.ok(line, 'the fallback is reported');
    assert.equal((line.match(/x/g) || []).length, 64, 'the echoed id is capped at 64 characters');
    ext.disable();
});

test('corrupt layouts report nothing and still leave the slot untiled', () => {
    // Review Focus 4: unreadable data must behave exactly as before — no fallback, and
    // no line claiming one.
    const { env, ext } = makeEnv();
    enableOnMonitor(env, ext);
    const app = ext.currentSession().app;
    settingsInstance(env).setValue('layouts', '{not json');
    const layout = app.ops.layoutFor(app, 0, 0);
    assert.deepEqual({ preset: layout.preset, auto: layout.auto }, { preset: null, auto: false }, 'unreadable data is no assignment');
    assert.deepEqual(env.logs.filter((l) => l.indexOf('greenTile preset "') === 0), [], 'and no fallback is claimed');
    ext.disable();
});

// The retile reaches the same decision through the shared query: with the stored
// setting on but a pause retained, an automatic retile places nothing.
test('autoAllowed gates the retile: a retained pause leaves the windows unmoved', () => {
    const { env, ext } = makeEnv();
    enableOnMonitor(env, ext);
    const app = ext.currentSession().app;
    const ws = makeWorkspace(env);
    ws.index = () => 0;
    env.activeWorkspace = ws;
    const w1 = makeWindow(env, 1, [0, 0, 1000, 1100], 0);
    const w2 = makeWindow(env, 2, [1000, 0, 1000, 1100], 0);
    env.tabList.push(w1, w2);
    app.ops.layoutSet(app, 0, 0, { auto: true });
    app.ops.retileMonitor(app, 0, null, false);
    assert.ok(w1.moves.length + w2.moves.length > 0, 'an allowed retile places the windows');
    w1.moves.length = 0;
    w2.moves.length = 0;
    app.session.pendingAuto.push({ monitorIndex: 0, wsIndex: 0, auto: false });
    app.ops.retileMonitor(app, 0, null, false);
    assert.equal(w1.moves.length + w2.moves.length, 0, 'a retained pause gates the retile');
    ext.disable();
});

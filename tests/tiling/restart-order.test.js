'use strict';
// Integration tests for the restart-order feature, driven through the REAL
// extension.js on the fake Cinnamon runtime. A Cinnamon restart on X11 keeps the
// X11 window descriptions but Muffin moves the windows before greenTile loads, so
// the startup retile would re-derive the order from the scrambled positions.
// These tests record the placed order, then simulate the restart (a fresh env,
// new Muffin stable sequences, the SAME descriptions, scrambled positions, the
// recorded file) and demand the stored order back.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    MONITOR, makeEnv, makeWindow, makeWorkspace, settingsInstance, enableOnMonitor,
} = require('../helpers/fakes/cinnamon-harness');

const PATH = '/run/user/1000/greenTile@carsteneu/order.json';
const surfaceKey = (app) => app.monitors.keys[0] + '\n' + app.monitors.wsKey(0, 0);
const storedFile = (key, ids) => JSON.stringify({ v: 1, s: { [key]: ids } });

// The two preset halves of the 2000 px monitor (gap 0).
const LEFT = [0, 0, 1000, 1100];
const RIGHT = [1000, 0, 1000, 1100];

// One env with the monitor, one workspace, an active ws and the Halves preset
// assigned — the state every scenario starts from.
const scene = (fileText) => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    // the App reads the store once, when it is constructed by enable()
    if (fileText !== undefined) {
        env.files.set(PATH, fileText);
    }
    enableOnMonitor(env, ext);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const app = ext.currentSession().app;
    app.ops.presetsWrite(app, [{ id: 'p1', name: 'Halves', rules: [{ min: 2, stacks: [1, 1] }] }]);
    app.ops.layoutSet(app, 0, 0, { preset: 'p1' });
    return { env, ext, app };
};

// Fires the settle wait (the startup fan-out) and then the 0 ms retile it arms:
// the exact path a Cinnamon restart takes.
const startupRetile = (env, ext) => {
    const settle = ext.currentSession().settle;
    const id = settle._timer;
    const armed = env.timers.get(id);
    assert.ok(armed, 'the settle wait is armed after enable');
    env.timers.delete(id);
    armed.cb();
    const retile = [...env.timers.entries()].find(([, t]) => t.ms === 0);
    assert.ok(retile, 'the settle fan-out armed the immediate retile');
    env.timers.delete(retile[0]);
    retile[1].cb();
};

const fireMs = (env, ms) => {
    const entry = [...env.timers.entries()].find(([, t]) => t.ms === ms);
    assert.ok(entry, 'no timer of ' + ms + ' ms');
    env.timers.delete(entry[0]);
    entry[1].cb();
};

test('a placement records the placed order of the surface, debounced into the runtime file', () => {
    const { env, ext, app } = scene();
    const w1 = makeWindow(env, 11, [10, 10, 400, 300], 0, null, { description: '0x1' });
    const w2 = makeWindow(env, 12, [500, 0, 400, 300], 0, null, { description: '0x2' });
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    app.ops.retileMonitor(app, 0);
    assert.deepEqual(w1.rect, LEFT);
    assert.equal(env.files.has(PATH), false, 'the write is debounced');
    fireMs(env, 1000);
    assert.deepEqual(JSON.parse(env.files.get(PATH)), { v: 1, s: { [surfaceKey(app)]: ['0x1', '0x2'] } });
});

test('a restart restores the recorded order instead of re-deriving it from the scrambled positions', () => {
    // run 1: windows tiled in the order 0x1 0x2
    const first = scene();
    const a1 = makeWindow(first.env, 11, [10, 10, 400, 300], 0, null, { description: '0x1' });
    const a2 = makeWindow(first.env, 12, [500, 0, 400, 300], 0, null, { description: '0x2' });
    first.env.tabList.push(a1, a2);
    first.env.display.focus_window = a1;
    first.app.ops.retileMonitor(first.app, 0);
    fireMs(first.env, 1000);
    const recorded = first.env.files.get(PATH);

    // run 2: a fresh process — new Muffin stable sequences, the SAME descriptions,
    // but Muffin pushed 0x2 to the left edge before greenTile loaded
    const { env, ext, app } = scene(recorded);
    const b2 = makeWindow(env, 91, [0, 0, 400, 300], 0, null, { description: '0x2' });
    const b1 = makeWindow(env, 92, [500, 0, 400, 300], 0, null, { description: '0x1' });
    env.tabList.push(b2, b1);
    env.display.focus_window = b2;
    startupRetile(env, ext);
    assert.deepEqual(b1.rect, LEFT, '0x1 back in the first cell, as recorded');
    assert.deepEqual(b2.rect, RIGHT, '0x2 back in the second cell although Muffin moved it left');
});

test('windows that are not in the stored order keep the reading order and come after', () => {
    // the recorded order knows only 0x1 and 0x2; 0x9 (a window opened after the
    // file was written) sorts by position and lands after them. The surface key
    // is monitor-derived and identical across envs, so probe it once.
    const key = surfaceKey(scene().app);
    const { env, ext, app } = scene(storedFile(key, ['0x1', '0x2']));
    const c1 = makeWindow(env, 91, [1500, 0, 400, 300], 0, null, { description: '0x9' });
    const c2 = makeWindow(env, 92, [0, 0, 400, 300], 0, null, { description: '0x2' });
    const c3 = makeWindow(env, 93, [500, 0, 400, 300], 0, null, { description: '0x1' });
    env.tabList.push(c1, c2, c3);
    env.display.focus_window = c2;
    startupRetile(env, ext);
    // the Halves preset extends the last column for three windows: [1, 2]
    assert.deepEqual(c3.rect, [0, 0, 1000, 1100], '0x1 first, as stored');
    assert.deepEqual(c2.rect, [1000, 0, 1000, 550], '0x2 second, as stored');
    assert.deepEqual(c1.rect, [1000, 550, 1000, 550], 'the unknown window follows by position');
});

test('without a stored order the reading order of the current positions is used (today\'s behaviour)', () => {
    const { env, ext, app } = scene();
    const w2 = makeWindow(env, 91, [0, 0, 400, 300], 0, null, { description: '0x2' });
    const w1 = makeWindow(env, 92, [500, 0, 400, 300], 0, null, { description: '0x1' });
    env.tabList.push(w2, w1);
    env.display.focus_window = w2;
    startupRetile(env, ext);
    assert.deepEqual(w2.rect, LEFT, 'the left window keeps the left cell');
    assert.deepEqual(w1.rect, RIGHT);
});

test('a corrupt store is ignored (logged) and the reading order is used', () => {
    const { env, ext } = scene('not greenTile data');
    const w2 = makeWindow(env, 91, [0, 0, 400, 300], 0, null, { description: '0x2' });
    const w1 = makeWindow(env, 92, [500, 0, 400, 300], 0, null, { description: '0x1' });
    env.tabList.push(w2, w1);
    env.display.focus_window = w2;
    startupRetile(env, ext);
    assert.deepEqual(w2.rect, LEFT);
    assert.ok(env.logs.some((l) => l.includes('window-order')), 'the ignored file is logged');
});

test('windows without an X11 description (Wayland) are never recorded', () => {
    const { env, ext, app } = scene();
    const w1 = makeWindow(env, 11, [10, 10, 400, 300]);
    const w2 = makeWindow(env, 12, [500, 0, 400, 300]);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    app.ops.retileMonitor(app, 0);
    assert.equal([...env.timers.values()].filter((t) => t.ms === 1000).length, 0, 'nothing scheduled');
    assert.equal(env.fileWrites.length, 0, 'nothing written');
});

test('a surface with a single identifiable window records nothing', () => {
    const { env, ext, app } = scene();
    const w1 = makeWindow(env, 11, [10, 10, 400, 300], 0, null, { description: '0x1' });
    const w2 = makeWindow(env, 12, [500, 0, 400, 300]);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    app.ops.retileMonitor(app, 0);
    assert.equal(env.fileWrites.length, 0);
});

test('only the FIRST retile of a surface uses the stored order', () => {
    const first = scene();
    const a1 = makeWindow(first.env, 11, [10, 10, 400, 300], 0, null, { description: '0x1' });
    const a2 = makeWindow(first.env, 12, [500, 0, 400, 300], 0, null, { description: '0x2' });
    first.env.tabList.push(a1, a2);
    first.env.display.focus_window = a1;
    first.app.ops.retileMonitor(first.app, 0);
    fireMs(first.env, 1000);
    const recorded = first.env.files.get(PATH);

    const { env, ext, app } = scene(recorded);
    const w2 = makeWindow(env, 91, [0, 0, 400, 300], 0, null, { description: '0x2' });
    const w1 = makeWindow(env, 92, [500, 0, 400, 300], 0, null, { description: '0x1' });
    env.tabList.push(w2, w1);
    env.display.focus_window = w2;
    startupRetile(env, ext);
    assert.deepEqual(w1.rect, LEFT, 'the stored order was restored');
    assert.equal(app.session.orderUsed.has(surfaceKey(app)), true, 'the surface is consumed');
    // the user rearranges: 0x2 to the left; the next retile must keep THAT order,
    // not snap back to the stored one
    w1.rect = [1000, 0, 1000, 1100];
    w2.rect = [0, 0, 1000, 1100];
    app.ops.retileMonitor(app, 0);
    assert.deepEqual(w2.rect, LEFT, 'the second retile follows the current geometry');
    assert.deepEqual(w1.rect, RIGHT);
});

test('the store never touches the settings', () => {
    const { env, ext, app } = scene();
    const layouts = settingsInstance(env).getValue('layouts');
    const w1 = makeWindow(env, 11, [10, 10, 400, 300], 0, null, { description: '0x1' });
    const w2 = makeWindow(env, 12, [500, 0, 400, 300], 0, null, { description: '0x2' });
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    app.ops.retileMonitor(app, 0);
    fireMs(env, 1000);
    assert.equal(settingsInstance(env).getValue('layouts'), layouts, 'no settings churn');
});

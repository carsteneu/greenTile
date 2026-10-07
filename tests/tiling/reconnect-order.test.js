'use strict';
// Integration tests for the reconnect-order feature: after a MONITOR CHANGE
// (an external monitor unplugged and plugged back in) greenTile must restore
// every workspace's window ORDER and geometry — not only after a Cinnamon
// restart. Muffin moves the windows of EVERY workspace to the remaining monitor
// and back, so the settle retile re-derives their order from scrambled
// positions unless the recorded restart order (lib/runtime/orders.js) is used
// again. The store was consumed once per surface per enable, so a monitor
// change left every surface unrestored and only the active workspace retiled.
//
// These tests drive the REAL extension.js on the fake Cinnamon runtime: record
// the placed order, scramble the positions, emit monitors-changed (the App is
// recreated), flush the DisplayConfig reply and fire the settle wait —
// the exact path a monitor change takes.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    makeEnv, makeWindow, makeWorkspace, enableOnMonitor,
} = require('../helpers/fakes/cinnamon-harness');

const PATH = '/run/user/1000/greenTile@carsteneu/order.json';
const surfaceKey = (app) => app.monitors.keys[0] + '\n' + app.monitors.wsKey(0, 0);

// The two preset halves of the 2000 px monitor (gap 0).
const LEFT = [0, 0, 1000, 1100];
const RIGHT = [1000, 0, 1000, 1100];

const fireMs = (env, ms) => {
    const entry = [...env.timers.entries()].find(([, t]) => t.ms === ms);
    assert.ok(entry, 'no timer of ' + ms + ' ms');
    env.timers.delete(entry[0]);
    entry[1].cb();
};

// Fires the settle wait (the fan-out) and then the 0 ms retile it arms: the path
// a Cinnamon restart and a monitor change take.
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

// One env with the 2000 px monitor, one workspace, an active ws and the Halves
// preset assigned.
const scene = () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitor(env, ext);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const app = ext.currentSession().app;
    app.ops.presetsWrite(app, [{ id: 'p1', name: 'Halves', rules: [{ min: 2, stacks: [1, 1] }] }]);
    app.ops.layoutSet(app, 0, 0, { preset: 'p1' });
    return { env, ext, app };
};

// Recreates the App the way the session does on monitors-changed and arms the
// settle wait for the fresh App.
const reconnect = (env, ext) => {
    env.layoutManager.emit('monitors-changed');
    env.flushDisplayConfigNoReply();
    return ext.currentSession().app;
};

const surfaceKeyWs = (app, ws) => app.monitors.keys[0] + '\n' + app.monitors.wsKey(0, ws);

// Two workspaces on the one monitor: ws0 active, ws1 background; both assigned
// the Halves preset. `ws1wins` is the background workspace's window list.
const sceneTwoWs = () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitor(env, ext);
    makeWorkspace(env);
    const ws1wins = [];
    makeWorkspace(env).list_windows = () => ws1wins;
    env.activeWorkspace = { index: () => 0 };
    const app = ext.currentSession().app;
    app.ops.presetsWrite(app, [{ id: 'p1', name: 'Halves', rules: [{ min: 2, stacks: [1, 1] }] }]);
    app.ops.layoutSet(app, 0, 0, { preset: 'p1' });
    app.ops.layoutSet(app, 0, 1, { preset: 'p1' });
    return { env, ext, app, ws1wins };
};

test('a monitor change re-arms the restore: the recreated app restores the surface again', () => {
    const { env, ext, app } = scene();
    const w1 = makeWindow(env, 11, [10, 10, 400, 300], 0, null, { description: '0x1' });
    const w2 = makeWindow(env, 12, [500, 0, 400, 300], 0, null, { description: '0x2' });
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;

    // the startup settle places the surface in the reading order and records it
    startupRetile(env, ext);
    fireMs(env, 1000);
    assert.deepEqual(w1.rect, LEFT, '0x1 in the first cell');
    assert.deepEqual(w2.rect, RIGHT, '0x2 in the second cell');
    assert.equal(app.session.orderUsed.has(surfaceKey(app)), true,
        'the surface restore was spent at startup');

    // a monitor change: Muffin moved the windows around while it parked them
    w1.rect = [500, 0, 400, 300];
    w2.rect = [0, 0, 400, 300];
    const fresh = reconnect(env, ext);

    startupRetile(env, ext);
    assert.deepEqual(w1.rect, LEFT, '0x1 back in the first cell after the monitor change');
    assert.deepEqual(w2.rect, RIGHT, '0x2 back in the second cell after the monitor change');
    assert.equal(fresh.session.orderUsed.has(surfaceKey(fresh)), true,
        'the fresh surface restore was spent again');
});

test('the settle places a background workspace too, not only the active one', () => {
    const { env, ext, app, ws1wins } = sceneTwoWs();
    // the active workspace
    const w1 = makeWindow(env, 11, [10, 10, 400, 300], 0, null, { description: '0x1' });
    const w2 = makeWindow(env, 12, [500, 0, 400, 300], 0, null, { description: '0x2' });
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    // the background workspace: 0x4 left, 0x3 right at spawn
    const w4 = makeWindow(env, 14, [10, 10, 300, 200], 0, null, { description: '0x4' });
    const w3 = makeWindow(env, 13, [400, 0, 300, 200], 0, null, { description: '0x3' });
    ws1wins.push(w4, w3);

    startupRetile(env, ext);
    assert.deepEqual(w4.rect, LEFT, 'the background workspace was placed, not left at its spawn');
    assert.deepEqual(w3.rect, RIGHT, 'the background workspace was placed, not left at its spawn');
    fireMs(env, 1000);
    const file = JSON.parse(env.files.get(PATH));
    assert.deepEqual(file.s[surfaceKeyWs(app, 1)], ['0x4', '0x3'],
        'the background workspace order was recorded');
});

test('a monitor change restores a background workspace order without visiting it', () => {
    const { env, ext, app, ws1wins } = sceneTwoWs();
    const w1 = makeWindow(env, 11, [10, 10, 400, 300], 0, null, { description: '0x1' });
    const w2 = makeWindow(env, 12, [500, 0, 400, 300], 0, null, { description: '0x2' });
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    const w4 = makeWindow(env, 14, [10, 10, 300, 200], 0, null, { description: '0x4' });
    const w3 = makeWindow(env, 13, [400, 0, 300, 200], 0, null, { description: '0x3' });
    ws1wins.push(w4, w3);

    // the startup settle records the background order (0x4 left, 0x3 right)
    startupRetile(env, ext);
    fireMs(env, 1000);
    assert.deepEqual(JSON.parse(env.files.get(PATH)).s[surfaceKeyWs(app, 1)], ['0x4', '0x3']);

    // the monitor change scrambles the background positions too
    w4.rect = [400, 0, 300, 200];
    w3.rect = [10, 10, 300, 200];
    reconnect(env, ext);
    startupRetile(env, ext);
    assert.deepEqual(w4.rect, LEFT, '0x4 back on the left after the reconnect');
    assert.deepEqual(w3.rect, RIGHT, '0x3 back on the right after the reconnect');
});

test('a paused background workspace stays untouched by the settle', () => {
    const { env, ext, app, ws1wins } = sceneTwoWs();
    // pause ws1: the stored auto is off (retileMonitor's autoAllowed gate)
    app.ops.layoutSet(app, 0, 1, { auto: false });
    const w4 = makeWindow(env, 14, [10, 10, 300, 200], 0, null, { description: '0x4' });
    const w3 = makeWindow(env, 13, [400, 0, 300, 200], 0, null, { description: '0x3' });
    ws1wins.push(w4, w3);
    const before = [w4.rect.slice(), w3.rect.slice()];

    startupRetile(env, ext);
    assert.deepEqual(w4.rect, before[0], 'a paused background workspace is not placed');
    assert.deepEqual(w3.rect, before[1], 'a paused background workspace is not placed');
});

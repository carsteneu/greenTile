'use strict';
// Issue 12 — valid geometry under extreme space shortage, driven through the REAL
// extension (extension.js -> lib/app) on the fake Cinnamon runtime. The split
// read-time correction feeds placeRects -> gapCell -> place; a geometrically
// impossible budget must never reach a window as non-finite or zero/negative
// geometry, and a gap-overloaded layout must still place every frame inside the
// usable area. Complements tests/model/split-extreme.test.js (the model contract).
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    MONITOR, makeEnv, makeWindow, makeWorkspace, settingsInstance, enableOnMonitors,
} = require('../helpers/fakes/cinnamon-harness');

const finite = (w) => w.rect.every(Number.isFinite);
const insideArea = (w, mon) => w.rect[0] >= mon.x - 1e-6 && w.rect[1] >= mon.y - 1e-6
    && w.rect[0] + w.rect[2] <= mon.x + mon.width + 1e-6 && w.rect[1] + w.rect[3] <= mon.y + mon.height + 1e-6;

const enableAuto = (env, ext, ref) => {
    settingsInstance(env).setValue('layouts', JSON.stringify({ [ref.mkey]: { [ref.wskey]: { auto: true } } }));
};

test('issue 12: a zero-height usable area never places non-finite geometry', () => {
    const { env, ext } = makeEnv({ windowGap: 48 });
    enableOnMonitors(env, ext, [{ x: 0, y: 0, width: 600, height: 0 }]);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    // the narrow auto grid for 4 windows is [1,1,2]: the last column stacks two
    // cells along the zero-height axis, the case that turned non-finite before
    const wins = [1, 2, 3, 4].map((s) => makeWindow(env, s, [s * 50, 10, 100, 10]));
    env.tabList.push(...wins);
    env.display.focus_window = wins[0];
    const app = ext.currentSession().app;
    const ref = app.split.ref(app, 0, 0, 4);
    enableAuto(env, ext, ref);
    app.ops.retileMonitor(app, 0);
    for (const w of wins) {
        assert.ok(finite(w), 'placed geometry is finite: ' + JSON.stringify(w.rect));
        assert.ok(w.rect[2] >= 1 && w.rect[3] >= 1, 'no zero/negative frame: ' + JSON.stringify(w.rect));
    }
});

test('issue 12: a gap-overloaded layout keeps every placed frame finite and inside the usable area', () => {
    const mon = { x: 0, y: 0, width: 600, height: 100 };
    const { env, ext } = makeEnv({ windowGap: 48 });
    enableOnMonitors(env, ext, [mon]);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const app = ext.currentSession().app;
    // one column holding four stacked cells on a 100 px height: 4*120 px of cells
    // plus the gap shares cannot fit — the impossible-budget path
    app.ops.presetsWrite(app, [{ id: 'p1', name: 'Stack4', rules: [{ min: 2, stacks: [4] }] }]);
    app.ops.layoutSet(app, 0, 0, { preset: 'p1' });
    const wins = [1, 2, 3, 4].map((s) => makeWindow(env, s, [10, 10, 300, 20]));
    env.tabList.push(...wins);
    env.display.focus_window = wins[0];
    app.ops.retileMonitor(app, 0);
    for (const w of wins) {
        assert.ok(finite(w), 'finite: ' + JSON.stringify(w.rect));
        assert.ok(insideArea(w, mon), 'inside the usable area: ' + JSON.stringify(w.rect));
    }
});

test('issue 12: the extreme layouts leave the layouts setting untouched (no storage rewrite)', () => {
    const mon = { x: 0, y: 0, width: 600, height: 100 };
    const { env, ext } = makeEnv({ windowGap: 48 });
    enableOnMonitors(env, ext, [mon]);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const app = ext.currentSession().app;
    app.ops.presetsWrite(app, [{ id: 'p1', name: 'Stack4', rules: [{ min: 2, stacks: [4] }] }]);
    app.ops.layoutSet(app, 0, 0, { preset: 'p1' });
    const before = settingsInstance(env).getValue('layouts');
    const wins = [1, 2, 3, 4].map((s) => makeWindow(env, s, [10, 10, 300, 20]));
    env.tabList.push(...wins);
    env.display.focus_window = wins[0];
    app.ops.retileMonitor(app, 0);
    assert.equal(settingsInstance(env).getValue('layouts'), before, 'the read-time correction never writes the layouts');
});

test('issue 12: a feasible ordinary layout is placed unchanged (no regression)', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitors(env, ext, [MONITOR]);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const w1 = makeWindow(env, 1, [10, 10, 400, 300]);
    const w2 = makeWindow(env, 2, [500, 0, 400, 300]);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    const app = ext.currentSession().app;
    const ref = app.split.ref(app, 0, 0, 2);
    enableAuto(env, ext, ref);
    app.ops.retileMonitor(app, 0);
    assert.deepEqual(w1.rect, [0, 0, 1000, 1100]);
    assert.deepEqual(w2.rect, [1000, 0, 1000, 1100]);
});

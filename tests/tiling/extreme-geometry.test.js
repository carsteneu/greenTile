'use strict';
// Issue 12 — valid geometry under extreme space shortage, driven through the REAL
// extension (extension.js -> lib/app) on the fake Cinnamon runtime.
//
// The acceptance is: for tiny/zero usable areas and gap-overloaded cells, every
// FINAL frame either lies INSIDE the usable area, or the window is left completely
// untouched — no move, no resize, no animation (zero side effects). Windows carry a
// real ease actor here, so a placement that went through would leave moves and
// eases behind. Complements tests/model/{split-extreme,gap}.test.js (the pure model).
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    MONITOR, makeEnv, makeWindow, makeWorkspace, settingsInstance, enableOnMonitors,
} = require('../helpers/fakes/cinnamon-harness');
const { makeEaseActor } = require('../helpers/fakes/ease-actor');

const inArea = (rect, mon) => rect[0] >= mon.x - 1e-9 && rect[1] >= mon.y - 1e-9
    && rect[0] + rect[2] <= mon.x + mon.width + 1e-9 && rect[1] + rect[3] <= mon.y + mon.height + 1e-9;
const untouched = (w, actor) => w.moves.length === 0 && actor.eases.length === 0 && actor.transitions.size === 0;

// Enable auto on a monitor, add `n` windows each with its own ease actor, retile.
const autoRetile = (mon, n, gap = 48) => {
    const { env, ext } = makeEnv({ windowGap: gap });
    enableOnMonitors(env, ext, [mon]);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const actors = [];
    const wins = [];
    for (let s = 1; s <= n; s++) {
        const a = makeEaseActor();
        actors.push(a);
        wins.push(makeWindow(env, s, [s * 5, 5, 3, 3], 0, a));
    }
    env.tabList.push(...wins);
    env.display.focus_window = wins[0];
    const app = ext.currentSession().app;
    const ref = app.split.ref(app, 0, 0, n);
    settingsInstance(env).setValue('layouts', JSON.stringify({ [ref.mkey]: { [ref.wskey]: { auto: true } } }));
    app.ops.retileMonitor(app, 0);
    return { env, ext, app, wins, actors };
};

const assertContainedOrUntouched = (label, mon, n) => {
    const { wins, actors } = autoRetile(mon, n);
    wins.forEach((w, i) => {
        const actor = actors[i];
        if (inArea(w.rect, mon)) {
            assert.ok(w.rect[2] >= 1 && w.rect[3] >= 1, `${label} w${i}: a placed frame is at least 1px: ${w.rect}`);
            assert.ok(w.moves.length > 0, `${label} w${i}: a placed window was moved`);
            return;
        }
        assert.ok(untouched(w, actor),
            `${label} w${i}: a frame outside the area must leave the window untouched, got rect=${JSON.stringify(w.rect)} moves=${JSON.stringify(w.moves)} eases=${actor.eases.length}`);
        assert.deepEqual(w.rect, [5 * (i + 1), 5, 3, 3], `${label} w${i}: the window keeps its original rect`);
    });
};

for (const [label, mon, n] of [
    ['tiny 10x10', { x: 0, y: 0, width: 10, height: 10 }, 4],
    ['narrow 50x50', { x: 0, y: 0, width: 50, height: 50 }, 6],
    ['offset 12x12', { x: 100, y: 200, width: 12, height: 12 }, 5],
    ['short 400x20', { x: 0, y: 0, width: 400, height: 20 }, 4],
]) {
    test(`issue 12: on a ${label} monitor every final frame is inside the area, or the window is untouched`, () => {
        assertContainedOrUntouched(label, mon, n);
    });
}

for (const [label, mon] of [
    ['zero-height', { x: 0, y: 0, width: 600, height: 0 }],
    ['zero-width', { x: 0, y: 0, width: 0, height: 600 }],
    ['zero-area', { x: 0, y: 0, width: 0, height: 0 }],
]) {
    test(`issue 12: a ${label} usable area leaves every window untouched (zero side effects)`, () => {
        const { wins, actors } = autoRetile(mon, 4);
        wins.forEach((w, i) => {
            assert.ok(untouched(w, actors[i]),
                `w${i}: no move/ease on a degenerate area, got rect=${JSON.stringify(w.rect)} moves=${JSON.stringify(w.moves)}`);
        });
    });
}

test('issue 12: a non-finite usable area is declined at the placement guard (zero side effects)', () => {
    const { env, ext } = makeEnv({ windowGap: 48 });
    enableOnMonitors(env, ext, [MONITOR]);
    const place = require('../helpers/cinnamon-loader').load('./lib/tiling/place.js');
    const app = ext.currentSession().app;
    const actor = makeEaseActor();
    const w = makeWindow(env, 1, [10, 10, 100, 100], 0, actor);
    for (const area of [[NaN, 0, 10, 10], [0, NaN, 10, 10], [0, 0, NaN, 10], [0, 0, 10, NaN]]) {
        place.placeCell(app, w, 0, 0, 5, 5, area, true);
    }
    assert.equal(w.moves.length, 0, 'no move on a non-finite area');
    assert.equal(actor.eases.length, 0, 'no ease on a non-finite area');
});

test('issue 12: the extreme layouts leave the layouts setting untouched (no storage rewrite)', () => {
    const { env, ext } = makeEnv({ windowGap: 48 });
    enableOnMonitors(env, ext, [{ x: 0, y: 0, width: 10, height: 10 }]);
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
    settingsInstance(env).setValue('layouts', JSON.stringify({ [ref.mkey]: { [ref.wskey]: { auto: true } } }));
    app.ops.retileMonitor(app, 0);
    assert.deepEqual(w1.rect, [0, 0, 1000, 1100]);
    assert.deepEqual(w2.rect, [1000, 0, 1000, 1100]);
});

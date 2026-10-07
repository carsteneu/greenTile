'use strict';
// Column spans in presets (spec: docs/superpowers/specs/2026-10-07-column-spans-design.md).
// A rule's optional `spans` are the starting widths of the painted columns — painted
// columns stretch to 100 %, so [1, 2, 1] over three columns is 25 / 50 / 25. A border
// dragged for that window count (or a dragged shape) still wins. The read-time
// validation is exercised on the pure module, the geometry and the consumers through
// the REAL extension.js on the fake Cinnamon runtime.
const test = require('node:test');
const assert = require('node:assert/strict');

const { load } = require('../helpers/cinnamon-loader');
const {
    makeEnv, makeWindow, makeWorkspace, settingsInstance, enableOnMonitors,
} = require('../helpers/fakes/cinnamon-harness');

const WIDE = { x: 0, y: 0, width: 2400, height: 1100 };

// ---------------- read-time validation (ruleClean through presetsRead) ----------------

const layoutModule = load('./lib/tiling/layout.js');
const RAW = (value) => ({
    config: { settings: { getValue: (k) => (k === 'presets' ? value : undefined), setValue: () => assert.fail('presetsRead must not write') } },
});
const readRaw = (raw) => layoutModule.presetsRead(RAW(raw))[0].rules;
const readRules = (rules) => readRaw(JSON.stringify([{ id: 'p1', name: 'A', rules }]));

test('a valid spans field survives the read byte-identically', () => {
    assert.deepEqual(readRules([{ min: 2, stacks: [1, 2, 1], spans: [1, 2, 1] }]),
        [{ min: 2, stacks: [1, 2, 1], spans: [1, 2, 1] }]);
});

test('a rule without spans reads without the field', () => {
    assert.deepEqual(readRules([{ min: 2, stacks: [1, 1] }]), [{ min: 2, stacks: [1, 1] }]);
});

test('spans of the wrong length or beyond the painter grid are ignored', () => {
    assert.deepEqual(readRules([{ min: 2, stacks: [1, 1], spans: [1, 1, 1] }]), [{ min: 2, stacks: [1, 1] }]);
    assert.deepEqual(readRules([{ min: 2, stacks: [1, 1], spans: [4, 4] }]), [{ min: 2, stacks: [1, 1] }]);
    assert.deepEqual(readRules([{ min: 2, stacks: [1, 1], spans: [1, 6] }]), [{ min: 2, stacks: [1, 1] }]);
    assert.deepEqual(readRules([{ min: 2, stacks: [1, 1], spans: 'no' }]), [{ min: 2, stacks: [1, 1] }]);
    assert.deepEqual(readRules([{ min: 2, stacks: [], spans: [1] }]), [{ min: 2, stacks: [] }]);
    assert.deepEqual(readRules([{ min: 2, stacks: [], spans: [] }]), [{ min: 2, stacks: [] }]);
});

test('corrupt span values clamp to one, a full span sum still reads', () => {
    // JSON "1e999" parses back as Infinity, exactly what a corrupt settings file carries.
    assert.deepEqual(readRaw('[{"id":"p1","name":"A","rules":[{"min":2,"stacks":[1,1,1,1],"spans":[1e999,-3,"2",2.9]}]}]'),
        [{ min: 2, stacks: [1, 1, 1, 1], spans: [1, 1, 2, 2] }]);
    assert.deepEqual(readRules([{ min: 2, stacks: [1, 1], spans: [3, 3] }]),
        [{ min: 2, stacks: [1, 1], spans: [3, 3] }]);
});

// ---------------- geometry through the real extension ----------------

// Enable auto on the wide monitor, place `n` windows and retile a spans preset once.
const spansRun = (rules, n) => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitors(env, ext, [WIDE]);
    const ws = makeWorkspace(env);
    ws.index = () => 0;
    env.activeWorkspace = ws;
    const wins = [];
    for (let i = 1; i <= n; i++) {
        wins.push(makeWindow(env, i, [i * 20, 0, 300, 300], 0));
    }
    env.tabList.push(...wins);
    env.display.focus_window = wins[0];
    const app = ext.currentSession().app;
    app.ops.presetsWrite(app, [{ id: 'p1', name: 'Spans', rules }]);
    app.ops.layoutSet(app, 0, 0, { preset: 'p1' });
    app.ops.retileMonitor(app, 0);
    return { env, ext, app, wins };
};

const THREE = [{ min: 2, stacks: [1, 1, 1], spans: [1, 2, 1] }];
const rects = (wins) => wins.map((w) => w.rect);

test('a preset with spans tiles the weighted widths', () => {
    const { wins } = spansRun(THREE, 3);
    assert.deepEqual(rects(wins), [[0, 0, 600, 1100], [600, 0, 1200, 1100], [1800, 0, 600, 1100]]);
});

test('a rule without spans keeps the equal division', () => {
    const { wins } = spansRun([{ min: 2, stacks: [1, 1, 1] }], 3);
    assert.deepEqual(rects(wins), [[0, 0, 800, 1100], [800, 0, 800, 1100], [1600, 0, 800, 1100]]);
    const allOne = spansRun([{ min: 2, stacks: [1, 1, 1], spans: [1, 1, 1] }], 3);
    assert.deepEqual(rects(allOne.wins), rects(wins), 'all-one spans are the equal division');
});

test('fewer windows than painted columns: the spans are cut from the right', () => {
    const { wins } = spansRun(THREE, 2);
    assert.deepEqual(rects(wins), [[0, 0, 800, 1100], [800, 0, 1600, 1100]]);
});

test('a split dragged for this window count wins over the spans', () => {
    const { app, wins } = spansRun(THREE, 3);
    app.ops.layoutSet(app, 0, 0, {
        splits: { '3': { kind: 'cols', shape: [1, 1, 1], major: [0.5, 0.25, 0.25], minor: [[1], [1], [1]] } },
    });
    app.ops.retileMonitor(app, 0);
    assert.deepEqual(rects(wins), [[0, 0, 1200, 1100], [1200, 0, 600, 1100], [1800, 0, 600, 1100]]);
});

test('a stored dragged shape replaces the preset shape and drops the spans', () => {
    const { app, wins } = spansRun(THREE, 3);
    // The very same column counts, still dragged: the preset's spans describe the
    // preset's own shape, a dragged shape starts from the equal division again.
    app.ops.layoutSet(app, 0, 0, { shapes: { '3': { kind: 'cols', shape: [1, 1, 1] } } });
    app.ops.retileMonitor(app, 0);
    assert.deepEqual(rects(wins), [[0, 0, 800, 1100], [800, 0, 800, 1100], [1600, 0, 800, 1100]]);
});

test('the drop target resolves the weighted middle cell', () => {
    const { env, app, wins } = spansRun(THREE, 3);
    const [w1, w2] = wins;
    app.drop.begin(app, w1, env.gi.Meta.GrabOp.MOVING);
    // (700, 550) sits in the wide middle column (600..1800) — the equal division
    // would put it in w1's own 800 px cell and resolve to no target at all.
    const hit = app.drop.target(app, w1, 700, 550);
    assert.ok(hit, 'the pointer resolved to a drop target');
    assert.equal(hit.ordered[hit.toIndex], w2, 'the wide middle column holds w2');
    assert.equal(hit.zone, 'left');
});

test('a swap lands in the weighted cells', () => {
    const { env, wins } = spansRun(THREE, 3);
    const [w1, w2, w3] = wins;
    env.display.focus_window = w2;
    env.keybindingManager.hotkeys.get('greenTile-swap-right').cb();
    assert.deepEqual(w2.rect, [1800, 0, 600, 1100], 'the focused window took the right 600 px column');
    assert.deepEqual(w3.rect, [600, 0, 1200, 1100], 'its neighbour took the wide middle column');
    assert.deepEqual(w1.rect, [0, 0, 600, 1100], 'the left column stayed');
});

test('a border drag starts from the widths the user sees', () => {
    const { env, app, wins } = spansRun(THREE, 3);
    const [w1, w2] = wins;
    env.display.focus_window = w2;
    env.keybindingManager.hotkeys.get('greenTile-resize-narrower').cb();
    app.split.flush(app);
    assert.equal(w1.rect[2], 600, 'the left column is untouched');
    assert.ok(w2.rect[2] >= 1198 && w2.rect[2] < 1200,
        'the middle column shrank by the 1 px step from its weighted 1200, not from an equal 800: ' + w2.rect[2]);
    const stored = JSON.parse(settingsInstance(env).getValue('layouts'))[app.monitors.keys[0]]['1'].splits['3'];
    assert.ok(Math.abs(stored.major[0] - 0.25) < 1e-9, 'the stored split kept the weighted first column');
    assert.ok(stored.major[1] > 0.49 && stored.major[1] < 0.5, 'and the wide middle one: ' + stored.major[1]);
});

test('a minimum fit that regroups the same number of columns starts nominally again', () => {
    const { app } = spansRun([{ min: 2, stacks: [1, 3], spans: [1, 2] }], 4);
    const layout = { kind: 'cols', shape: [1, 3], weights: [1, 2] };
    const area = [0, 0, 2400, 1100];
    const mins = (h) => [1, 2, 3, 4].map(() => ({ w: 300, h: h }));
    // Four windows fit as painted (two columns, the right one stacked three deep):
    // the spans are the widths of exactly this shape.
    const painted = app.split.fit(app, 0, 0, 4, layout, mins(250), area, 0);
    assert.deepEqual(painted.shape, [1, 3]);
    assert.ok(Math.abs(painted.split.major[0] - 1 / 3) < 1e-9,
        'the weighted first column: ' + painted.split.major[0]);
    // The three stacked windows no longer fit their minima: splitFitShape regroups to
    // [2, 2] — the SAME column count, another grouping. The spans of [1, 3] are not the
    // widths of [2, 2], so the fit is equal again.
    const regrouped = app.split.fit(app, 0, 0, 4, layout, mins(400), area, 0);
    assert.deepEqual(regrouped.shape, [2, 2]);
    assert.deepEqual(regrouped.split.major, [0.5, 0.5]);
});

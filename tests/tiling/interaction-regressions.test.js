'use strict';
// Interaction-cluster regressions (todo_fixes_2 issues 8-11), driven through the
// REAL extension.js on the fake Cinnamon runtime: pause vs. swap chain, focus
// navigation vs. the resize sort override, Drop vs. fresh-pending, and focus
// fallback vs. the collector's window eligibility.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    makeEnv, makeWindow, makeWorkspace, enableOnMonitor, enableOnMonitors,
} = require('../helpers/fakes/cinnamon-harness');

// Wide enough for the row grids the drop tests key on (>= 2100 px keeps autoRows
// for 4+ windows instead of autoNarrowStacks).
const WIDE = { x: 0, y: 0, width: 2400, height: 1100 };

const leftToRight = (wins) => wins.slice().sort((a, b) => a.rect[0] - b.rect[0]).map((w) => w.seq);

// ---------------- issue 8: pause beats the swap chain ----------------

test('issue 8: a paused source is never pushed onto the adjacent monitor by the swap hotkey', () => {
    const mon2 = { x: 2000, y: 0, width: 2000, height: 1100 };
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitors(env, ext, [{ x: 0, y: 0, width: 2000, height: 1100 }, mon2]);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const w1 = makeWindow(env, 1, [0, 0, 1000, 1100], 0);
    const w2 = makeWindow(env, 2, [1000, 0, 1000, 1100], 0);
    const w3 = makeWindow(env, 3, [2000, 0, 1000, 1100], 1);
    const w4 = makeWindow(env, 4, [3000, 0, 1000, 1100], 1);
    env.tabList.push(w1, w2, w3, w4);
    const app = ext.currentSession().app;
    // monitor 1 tiles, monitor 0 stays paused (default auto:false)
    app.ops.layoutSet(app, 1, 0, { auto: true });
    env.display.focus_window = w1;
    const before = [w1.rect.slice(), w2.rect.slice()];
    env.keybindingManager.hotkeys.get('greenTile-swap-right').cb();
    assert.equal(w1.get_monitor(), 0, 'the paused source window stayed on its monitor');
    assert.deepEqual(w1.rect, before[0], 'the paused source window was not re-placed');
    assert.deepEqual(w2.rect, before[1], 'the paused neighbour stayed put');
    assert.equal(env.logs.some((l) => l.indexOf('greenTile swap pushed') === 0), false,
        'the paused swap never entered the chain push');
});

test('issue 8 regression: an active source still pushes along the monitor chain', () => {
    const mon2 = { x: 2000, y: 0, width: 2000, height: 1100 };
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitors(env, ext, [{ x: 0, y: 0, width: 2000, height: 1100 }, mon2]);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const w1 = makeWindow(env, 1, [0, 0, 1000, 1100], 0);
    const w3 = makeWindow(env, 3, [2000, 0, 1000, 1100], 1);
    env.tabList.push(w1, w3);
    const app = ext.currentSession().app;
    app.ops.layoutSet(app, 0, 0, { auto: true });
    env.display.focus_window = w1;
    env.keybindingManager.hotkeys.get('greenTile-swap-right').cb();
    assert.equal(w1.get_monitor(), 1, 'the active source was pushed onto the next monitor');
    assert.equal(env.logs.some((l) => l.indexOf('greenTile swap pushed') === 0), true, 'the chain push ran');
});

// ---------------- issue 9: focus navigation must not consume the resize override ----------------

test('issue 9: focus navigation leaves the resize sort override for the retile', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitor(env, ext);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const w1 = makeWindow(env, 1, [0, 0, 1000, 1100], 0);
    const w2 = makeWindow(env, 2, [1000, 0, 1000, 1100], 0);
    env.tabList.push(w1, w2);
    env.display.focus_window = w2;
    const app = ext.currentSession().app;
    app.ops.layoutSet(app, 0, 0, { auto: true });
    app.ops.retileMonitor(app, 0);
    // drag w2's left edge far past w1: the override protects its original cell
    env.display.emit('grab-op-begin', env.display, env.display, w2, env.gi.Meta.GrabOp.RESIZING_E);
    w2.rect = [-100, 0, 2100, 1100];
    env.display.emit('grab-op-end', env.display, env.display, w2, env.gi.Meta.GrabOp.RESIZING_E);
    // focus navigation runs in between; it places nothing and must not consume the override
    env.customBindings.get('push-tile-left')(env.display, w2);
    env.display.focus_window = null;
    app.ops.retileMonitor(app, 0, null, false);
    assert.deepEqual(leftToRight([w1, w2]), [1, 2], 'the dragged window kept its original cell order');
});

test('issue 9 regression: the actual retile still consumes the sort override', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitor(env, ext);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const w1 = makeWindow(env, 1, [0, 0, 1000, 1100], 0);
    const w2 = makeWindow(env, 2, [1000, 0, 1000, 1100], 0);
    env.tabList.push(w1, w2);
    env.display.focus_window = w2;
    const app = ext.currentSession().app;
    app.ops.layoutSet(app, 0, 0, { auto: true });
    app.ops.retileMonitor(app, 0);
    env.display.emit('grab-op-begin', env.display, env.display, w2, env.gi.Meta.GrabOp.RESIZING_E);
    w2.rect = [-100, 0, 2100, 1100];
    env.display.emit('grab-op-end', env.display, env.display, w2, env.gi.Meta.GrabOp.RESIZING_E);
    assert.notEqual(app.auto.sortPeek(2, 0), null, 'the resize armed the override');
    env.display.focus_window = null;
    app.ops.retileMonitor(app, 0, null, false);
    assert.equal(app.auto.sortTake(2, 0), null, 'the retile consumed the override');
    assert.deepEqual(leftToRight([w1, w2]), [1, 2]);
});

// ---------------- issue 10: a successful drop wins over the fresh-pending list ----------------

test('issue 10: a successful drop survives the debounced retile', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitors(env, ext, [WIDE]);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const w1 = makeWindow(env, 1, [0, 0, 1000, 1100], 0);
    const w2 = makeWindow(env, 2, [1000, 0, 1000, 1100], 0);
    env.tabList.push(w1, w2);
    const app = ext.currentSession().app;
    app.ops.layoutSet(app, 0, 0, { auto: true });
    app.ops.retileMonitor(app, 0);
    // the third window opens fresh: it is pending until the debounce fires
    const w3 = makeWindow(env, 3, [1500, 0, 300, 1100], 0);
    env.tabList.push(w3);
    app.auto.onWindowAdded(app, env.activeWorkspace, w3);
    // drag it onto the left edge of the first cell and drop
    app.drop.begin(app, w3, env.gi.Meta.GrabOp.MOVING);
    w3.rect = [0, 0, 400, 1100];
    assert.equal(app.drop.end(app, w3, env.gi.Meta.GrabOp.MOVING), true, 'the drop applied');
    assert.deepEqual(leftToRight([w1, w2, w3]), [3, 1, 2], 'the drop placed w3 in front');
    app.ops.retileMonitor(app, 0, null, false);
    assert.deepEqual(leftToRight([w1, w2, w3]), [3, 1, 2],
        'the debounced retile kept the explicit drop placement');
});

test('issue 10: only the dropped window loses its fresh record', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitors(env, ext, [WIDE]);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const w1 = makeWindow(env, 1, [0, 0, 1000, 1100], 0);
    const w2 = makeWindow(env, 2, [1000, 0, 1000, 1100], 0);
    env.tabList.push(w1, w2);
    const app = ext.currentSession().app;
    app.ops.layoutSet(app, 0, 0, { auto: true });
    app.ops.retileMonitor(app, 0);
    // two fresh windows; only w3 is dropped
    const w4 = makeWindow(env, 4, [1500, 0, 300, 1100], 0);
    const w3 = makeWindow(env, 3, [1800, 0, 300, 1100], 0);
    env.tabList.push(w4, w3);
    app.auto.onWindowAdded(app, env.activeWorkspace, w4);
    app.auto.onWindowAdded(app, env.activeWorkspace, w3);
    app.drop.begin(app, w3, env.gi.Meta.GrabOp.MOVING);
    w3.rect = [0, 0, 400, 1100];
    assert.equal(app.drop.end(app, w3, env.gi.Meta.GrabOp.MOVING), true, 'the drop applied');
    app.ops.retileMonitor(app, 0, null, false);
    const order = leftToRight([w1, w2, w3, w4]);
    assert.equal(order[0], 3, 'the dropped window kept the cell it was dropped into');
    assert.equal(order[3], 4, 'the untouched fresh window still appends last');
});

test('issue 10: an aborted drop leaves the fresh record alone', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitors(env, ext, [WIDE]);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const w1 = makeWindow(env, 1, [0, 0, 1000, 1100], 0);
    const w2 = makeWindow(env, 2, [1000, 0, 1000, 1100], 0);
    env.tabList.push(w1, w2);
    const app = ext.currentSession().app;
    app.ops.layoutSet(app, 0, 0, { auto: true });
    app.ops.retileMonitor(app, 0);
    const w3 = makeWindow(env, 3, [-300, 0, 200, 200], 0);
    env.tabList.push(w3);
    app.auto.onWindowAdded(app, env.activeWorkspace, w3);
    // grab and release at the start frame: muffin restored it, drop aborts
    app.drop.begin(app, w3, env.gi.Meta.GrabOp.MOVING);
    assert.equal(app.drop.end(app, w3, env.gi.Meta.GrabOp.MOVING), false, 'the drop aborted');
    app.ops.retileMonitor(app, 0, null, false);
    assert.deepEqual(leftToRight([w1, w2, w3]), [1, 2, 3],
        'the fresh record survived the aborted drop and still appends last');
});

// ---------------- issue 11: focus fallback and collector share the eligibility ----------------

test('issue 11: a dialog focus never claims a cell and does not break the normal windows', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitor(env, ext);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const dialog = makeWindow(env, 1, [0, 0, 300, 300], 0, null, { windowType: env.gi.Meta.WindowType.DIALOG });
    const w1 = makeWindow(env, 2, [400, 0, 400, 300], 0);
    const w2 = makeWindow(env, 3, [900, 0, 400, 300], 0);
    env.tabList.push(dialog, w1, w2);
    env.display.focus_window = dialog;
    const app = ext.currentSession().app;
    app.ops.layoutSet(app, 0, 0, { auto: true });
    app.auto.activate(app);
    assert.deepEqual(dialog.rect, [0, 0, 300, 300], 'the dialog kept its own geometry');
    assert.equal(dialog.moves.length, 0, 'no placement ran on the dialog');
    assert.deepEqual(w1.rect, [0, 0, 1000, 1100], 'the normal window filled the first cell');
    assert.deepEqual(w2.rect, [1000, 0, 1000, 1100], 'the normal window filled the second cell');
});

test('issue 11: the focus fallback skips a minimized first entry from another monitor', () => {
    const mon2 = { x: 2000, y: 0, width: 2000, height: 1100 };
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitors(env, ext, [{ x: 0, y: 0, width: 2000, height: 1100 }, mon2]);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const dialog = makeWindow(env, 1, [0, 0, 300, 300], 0, null, { windowType: env.gi.Meta.WindowType.DIALOG });
    const minimized = makeWindow(env, 4, [2000, 0, 400, 300], 1);
    minimized.minimized = true;
    const w1 = makeWindow(env, 2, [400, 0, 400, 300], 0);
    const w2 = makeWindow(env, 3, [900, 0, 400, 300], 0);
    // tab list order: dialog first, then the minimized neighbour-monitor window
    env.tabList.push(dialog, minimized, w1, w2);
    env.display.focus_window = dialog;
    const app = ext.currentSession().app;
    app.ops.layoutSet(app, 0, 0, { auto: true });
    app.auto.activate(app);
    assert.deepEqual(w1.rect, [0, 0, 1000, 1100], 'the focused monitor still tiled its normal windows');
    assert.deepEqual(w2.rect, [1000, 0, 1000, 1100]);
    assert.deepEqual(minimized.rect, [2000, 0, 400, 300], 'the minimized window stayed untouched');
});

test('issue 11 regression: an excluded focused window is counted by nobody and the rest still tiles', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitor(env, ext);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const w1 = makeWindow(env, 1, [0, 0, 400, 300], 0);
    const w2 = makeWindow(env, 2, [500, 0, 400, 300], 0);
    const w3 = makeWindow(env, 3, [1000, 0, 400, 300], 0);
    env.tabList.push(w1, w2, w3);
    const app = ext.currentSession().app;
    env.display.focus_window = w3;
    app.excl.toggleFocused(app);
    assert.equal(app.excl.isExcluded(w3), true, 'w3 is excluded');
    app.ops.layoutSet(app, 0, 0, { auto: true });
    env.display.focus_window = w3;
    const before = w3.rect.slice();
    app.auto.activate(app);
    assert.deepEqual(w3.rect, before, 'the excluded window was not placed');
    assert.deepEqual(w1.rect, [0, 0, 1000, 1100], 'the remaining normal windows still tile');
    assert.deepEqual(w2.rect, [1000, 0, 1000, 1100]);
});

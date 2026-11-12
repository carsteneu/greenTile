'use strict';
// A lone window that the user MOVES or RESIZES stays where he puts it: the
// single-window mode lets go of it (a marker per window on the auto observer,
// memory only) and takes it back at the next real placement — a second window,
// a column hotkey, a preset click, Super+Ctrl+A. Driven through the REAL
// extension on the fake Cinnamon runtime, like tests/tiling/single-window.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    makeEnv, makeWindow, makeWorkspace, settingsInstance, enableOnMonitors,
} = require('../helpers/fakes/cinnamon-harness');

const MONITOR = { x: 0, y: 0, width: 2000, height: 1100 };
const LEFT = { x: 0, y: 0, width: 2000, height: 1100 };
const RIGHT = { x: 2000, y: 0, width: 2000, height: 1100 };
const SPAWN = [20, 0, 300, 300];
const CENTER = [444, 55, 1112, 990];
const CENTER_R = [2444, 55, 1112, 990];

const GRAB_MOVING = 'moving';
const GRAB_RESIZING_E = 'resizing-e';

/** A session with `count` lone windows on monitor 0, automatic tiling on. */
const scene = (mode, count, monitors = [MONITOR]) => {
    const { env, ext } = makeEnv({ windowGap: 0, singleWindowMode: mode, singleWindowMigrated: true });
    const ws = makeWorkspace(env);
    ws.index = () => 0;
    env.activeWorkspace = ws;
    const wins = [];
    for (let i = 0; i < count; i++) {
        const w = makeWindow(env, i + 1, [SPAWN[0] + i * 20, SPAWN[1], SPAWN[2], SPAWN[3]], 0);
        wins.push(w);
        env.tabList.push(w);
    }
    enableOnMonitors(env, ext, monitors);
    env.display.focus_window = wins[0] || null;
    const app = ext.currentSession().app;
    for (let i = 0; i < monitors.length; i++) {
        app.ops.layoutSet(app, i, 0, { preset: null, auto: true });
    }
    app.ops.retileMonitor(app, 0);
    return { env, ext, app, ws, wins };
};

/** Every pending timer of `ms`, fired (and removed) in insertion order. */
const fireAll = (env, ms) => {
    const entries = [...env.timers.entries()].filter(([, t]) => t && t.ms === ms);
    for (const [id] of entries) {
        env.timers.delete(id);
    }
    for (const [, t] of entries) {
        t.cb();
    }
    return entries.length;
};
const pending = (env, ms) => [...env.timers.values()].filter((t) => t && t.ms === ms).length;

/** A mouse move grab: begin at the current frame, land on `rect`, release. */
const drag = (env, w, rect) => {
    env.display.emit('grab-op-begin', env.display, env.display, w, GRAB_MOVING);
    w.rect = rect.slice();
    w.rehome();
    env.display.emit('grab-op-end', env.display, env.display, w, GRAB_MOVING);
};

/** A mouse edge resize: begin at the current frame, settle on `rect`, release. */
const resize = (env, w, rect) => {
    env.display.emit('grab-op-begin', env.display, env.display, w, GRAB_RESIZING_E);
    w.rect = rect.slice();
    w.rehome();
    env.display.emit('grab-op-end', env.display, env.display, w, GRAB_RESIZING_E);
};

const DROPPED = [300, 200, 1112, 990];
const RESIZED = [444, 55, 1300, 990];

test('a dragged lone window stays where the user put it', () => {
    const { env, app, wins } = scene('center', 1);
    const w = wins[0];
    assert.deepEqual(w.rect, CENTER, 'the lone window starts centered');
    drag(env, w, DROPPED);
    assert.equal(pending(env, 250), 0, 'no snap retile is scheduled for a released lone window');
    assert.deepEqual(w.rect, DROPPED, 'the window keeps the frame the user dropped it at');
    app.ops.retileMonitor(app, 0);
    assert.deepEqual(w.rect, DROPPED, 'a later retile leaves the released window alone');
});

test('a resized lone window keeps its new size', () => {
    const { env, app, wins } = scene('center', 1);
    const w = wins[0];
    resize(env, w, RESIZED);
    assert.equal(pending(env, 250), 0, 'a resize of a lone window schedules no reset retile');
    assert.deepEqual(w.rect, RESIZED, 'the window keeps the size the user dragged');
    app.ops.retileMonitor(app, 0);
    assert.deepEqual(w.rect, RESIZED, 'a later retile does not reset the size');
});

test('a click on the title bar without motion does not release the window', () => {
    const { env, app, wins } = scene('center', 1);
    const w = wins[0];
    drag(env, w, [CENTER[0] + 2, CENTER[1], CENTER[2], CENTER[3]]);
    assert.equal(pending(env, 250), 0, 'a click inside the slack is not a placement');
    // No marker: the very next placement still owns the window.
    w.rect = DROPPED.slice();
    app.ops.retileMonitor(app, 0);
    assert.deepEqual(w.rect, CENTER, 'an unmarked lone window is placed again');
});

test('a released window in fill mode keeps the frame too', () => {
    const { env, app, wins } = scene('fill', 1);
    const w = wins[0];
    assert.deepEqual(w.rect, [0, 0, 2000, 1100], 'fill starts with the whole area');
    drag(env, w, DROPPED);
    app.ops.retileMonitor(app, 0);
    assert.deepEqual(w.rect, DROPPED, 'fill mode releases the window the same way');
});

// The column hotkey places NOTHING for a lone focused window: appColumns returns
// when the collector finds no second window (lib/tiling/retile.js). That no-op is
// pre-existing and stays; the release therefore survives it, and Super+Ctrl+A
// remains the way back.
test('a column hotkey with a lone window places nothing and keeps the release', () => {
    const { env, app, wins } = scene('center', 1);
    const w = wins[0];
    drag(env, w, DROPPED);
    env.keybindingManager.hotkeys.get('greenTile-auto3').cb();
    assert.deepEqual(w.rect, DROPPED, 'a lone focused window is not placed by the column hotkey');
    app.ops.retileMonitor(app, 0);
    assert.deepEqual(w.rect, DROPPED, 'the release survives the no-op hotkey');
});


// Decision pin (docs/local/plan-single-window-detach.md, A2: the mark falls on a
// placement, on auto on and on a preset click — the select is none of them). The
// same settings binding the mode tests drive.
test('changing the single-window select does not take a released window back', () => {
    const { env, wins } = scene('center', 1);
    const w = wins[0];
    drag(env, w, DROPPED);
    const inst = settingsInstance(env);
    inst.setValue('singleWindowMode', 'fill');
    inst.bindings.find((b) => b.prop === 'singleWindowModeValue').cb();
    assert.deepEqual(w.rect, DROPPED, 'the place the user gave the window stands');
});

test('Super+Ctrl+A takes a released window back', () => {
    const { env, wins } = scene('center', 1);
    const w = wins[0];
    drag(env, w, DROPPED);
    env.keybindingManager.hotkeys.get('greenTile-autoN').cb();
    assert.deepEqual(w.rect, CENTER, 'the auto-on hotkey resets the layout of the focused monitor');
});

test('Super+Ctrl+A does not unmaximize a window the user maximized', () => {
    const { env, wins } = scene('center', 1);
    const w = wins[0];
    // The user maximized it, then dragged it (Muffin unmaximizes on the drag; the
    // fixture keeps the mask so the guard is what the test sees).
    w.maximize(6);
    drag(env, w, DROPPED);
    const moves = w.moves.length;
    env.keybindingManager.hotkeys.get('greenTile-autoN').cb();
    assert.deepEqual(w.maximizes, [6], 'the hotkey does not maximize or unmaximize');
    assert.deepEqual(w.rect, DROPPED, 'a maximized lone window keeps its frame');
    assert.equal(w.moves.length, moves, 'and it is not placed at all');
});

test('a second window takes the released one back into the grid', () => {
    const { env, ws, wins } = scene('center', 1);
    const a = wins[0];
    drag(env, a, DROPPED);
    const b = makeWindow(env, 2, SPAWN.slice(), 0);
    env.tabList.push(b);
    ws.emit('window-added', ws, b);
    fireAll(env, 300);
    assert.deepEqual([a.rect, b.rect], [[0, 0, 1000, 1100], [1000, 0, 1000, 1100]],
        'two windows tile again, the released one included');
});

test('the release does not survive the detour through two windows', () => {
    const { env, ws, wins } = scene('center', 1);
    const a = wins[0];
    drag(env, a, DROPPED);
    const b = makeWindow(env, 2, SPAWN.slice(), 0);
    env.tabList.push(b);
    ws.emit('window-added', ws, b);
    fireAll(env, 300);
    env.tabList.splice(env.tabList.indexOf(b), 1);
    ws.emit('window-removed', ws, b);
    fireAll(env, 100);
    assert.deepEqual(a.rect, CENTER, 'the remaining window is centered again: the release does not survive');
});

test('minimizing and restoring keeps a released window released', () => {
    const { env, wins } = scene('center', 1);
    const w = wins[0];
    drag(env, w, DROPPED);
    w.minimized = true;
    w.emit('notify::minimized');
    fireAll(env, 100);
    w.minimized = false;
    w.emit('notify::minimized');
    fireAll(env, 300);
    assert.deepEqual(w.rect, DROPPED, 'restoring does not place the window again');
});

// A border click without a drag is not a resize: pressing on the border is how a
// window gets the focus, and it must not release the window (the move path guards
// the same click with GRAB_MOVE_TOLERANCE).
test('a border click without a drag does not release the lone window', () => {
    const { env, app, wins } = scene('center', 1);
    const w = wins[0];
    resize(env, w, CENTER.slice());
    w.rect = DROPPED.slice();
    app.ops.retileMonitor(app, 0);
    assert.deepEqual(w.rect, CENTER, 'an unmarked lone window is placed again');
});

// A swap push is an explicit placement command: the window is sent to the target
// monitor and the tiling places it there. It must not stay unplaced.
test('a swap push places a released lone window on the target monitor', () => {
    const { env, wins } = scene('center', 1, [LEFT, RIGHT]);
    const w = wins[0];
    drag(env, w, DROPPED);
    env.keybindingManager.hotkeys.get('greenTile-swap-right').cb();
    fireAll(env, 250);
    assert.deepEqual(w.rect, CENTER_R, 'the pushed window is placed on the other monitor');
});

test('a lone window dragged onto an empty monitor keeps the frame it was dropped at', () => {
    const { env, app, wins } = scene('center', 1, [LEFT, RIGHT]);
    const w = wins[0];
    assert.deepEqual(w.rect, CENTER, 'the lone window starts centered');
    drag(env, w, [2300, 100, 1112, 990]);
    // The monitor the window left still retiles: it is empty now and has to be.
    fireAll(env, 250);
    assert.deepEqual(w.rect, [2300, 100, 1112, 990], 'the target monitor leaves the window where it was dropped');
    app.ops.retileMonitor(app, 1);
    assert.deepEqual(w.rect, [2300, 100, 1112, 990], 'and a later retile there honours it');
});

test('a fresh App forgets the release (memory only)', () => {
    const { env, ext, wins } = scene('center', 1);
    const w = wins[0];
    drag(env, w, DROPPED);
    // monitors-changed rebuilds the App: the marker lives in memory and is gone with it.
    env.layoutManager.emit('monitors-changed');
    env.flushDisplayConfigNoReply();
    const app = ext.currentSession().app;
    env.display.focus_window = w;
    app.ops.retileMonitor(app, 0);
    assert.deepEqual(w.rect, CENTER, 'the new session centers the window again');
});

test('Super+Ctrl+A clears only the focused monitor', () => {
    const { env, app } = scene('center', 0, [LEFT, RIGHT]);
    const w0 = makeWindow(env, 11, [SPAWN[0], SPAWN[1], SPAWN[2], SPAWN[3]], 0);
    const w1 = makeWindow(env, 12, [SPAWN[0], SPAWN[1], SPAWN[2], SPAWN[3]], 1);
    env.tabList.push(w0, w1);
    env.display.focus_window = w0;
    app.ops.retileMonitor(app, 0);
    app.ops.retileMonitor(app, 1);
    assert.deepEqual(w0.rect, CENTER, 'monitor 0 starts centered');
    assert.deepEqual(w1.rect, CENTER_R, 'monitor 1 starts centered');
    drag(env, w1, [2300, 100, 1112, 990]);
    assert.deepEqual(w1.rect, [2300, 100, 1112, 990], 'the monitor-1 window is released');
    // The hotkey acts on the monitor the focus is on, which is monitor 0.
    env.keybindingManager.hotkeys.get('greenTile-autoN').cb();
    assert.deepEqual(w0.rect, CENTER, 'monitor 0 is retiled by the hotkey');
    assert.deepEqual(w1.rect, [2300, 100, 1112, 990], 'the marker on monitor 1 survives the hotkey');
    app.ops.retileMonitor(app, 1);
    assert.deepEqual(w1.rect, [2300, 100, 1112, 990], 'and an automatic retile still honours it');
    // With the focus on monitor 1 the same hotkey takes that window back.
    env.display.focus_window = w1;
    env.keybindingManager.hotkeys.get('greenTile-autoN').cb();
    assert.deepEqual(w1.rect, CENTER_R, 'the hotkey on monitor 1 releases the marker there');
});

// A preset card click is an explicit command: the panel clears this monitor's
// release markers before it retiles, otherwise the retile would hang on the skip
// and the click would land nowhere.
test('a preset card click places a released window and drops the marker', () => {
    const PRESETS = [{ id: 'p-two', name: 'Two columns', rules: [{ min: 1, stacks: [1, 1] }] }];
    const { env, ext } = makeEnv({ windowGap: 0, singleWindowMode: 'center', singleWindowMigrated: true, presets: JSON.stringify(PRESETS) });
    const ws = makeWorkspace(env);
    ws.index = () => 0;
    env.activeWorkspace = ws;
    const w = makeWindow(env, 1, SPAWN.slice(), 0);
    env.tabList.push(w);
    enableOnMonitors(env, ext, [MONITOR]);
    env.display.focus_window = w;
    const app = ext.currentSession().app;
    app.ops.presetsWrite(app, PRESETS);
    app.ops.layoutSet(app, 0, 0, { preset: null, auto: true });
    app.ops.retileMonitor(app, 0);
    assert.deepEqual(w.rect, CENTER, 'the lone window starts centered');
    drag(env, w, DROPPED);
    env.keybindingManager.hotkeys.get('greenTile-preset').cb();
    const cards = findAll(app.panel.actor, (a) => /^gk-card(?: |$)/.test(a.style_class || ''));
    const card = cards.find((c) => (findAll(c, (a) => /^gk-name(?: |$)/.test(a.style_class || ''))[0] || {}).text === 'Two columns');
    assert.ok(card, 'the preset card is in the panel');
    card.emit('clicked');
    assert.notDeepEqual(w.rect, DROPPED, 'the click placed the window');
    app.ops.retileMonitor(app, 0);
    assert.equal(app.ops.layoutFor(app, 0, 0).preset.id, 'p-two', 'the preset stays assigned');
});

// The open question of the plan (docs/local/plan-single-window-detach.md, A5.5): the
// column hotkey stores a placement record with shape [1] and a split. It must not
// bring the lone window back into a column on a later retile. The record is created
// through the real hotkey — with a dialog focused, only the one tileable window is
// placed, which is exactly the one-cell record the plan flagged.
test('a stored one-cell column placement does not re-grid the lone window', () => {
    const { env, app, wins } = scene('center', 1);
    const w = wins[0];
    const dialog = makeWindow(env, 9, [100, 100, 300, 200], 0, null, { noApp: true });
    env.tabList.push(dialog);
    env.display.focus_window = dialog;
    env.keybindingManager.hotkeys.get('greenTile-auto3').cb();
    assert.deepEqual(w.rect, [0, 0, 667, 1100], 'the hotkey placed the only tileable window in a column');
    assert.ok(app.split.placementFor(app, 0, 0, 1, [w]), 'the one-cell cols placement is stored');
    env.display.focus_window = w;
    app.ops.retileMonitor(app, 0);
    assert.deepEqual(w.rect, CENTER, 'the stored one-cell column record does not re-grid the lone window');
});

const findAll = (root, pred) => {
    const out = [];
    const seen = new Set();
    const visit = (actor) => {
        if (!actor || seen.has(actor)) {
            return;
        }
        seen.add(actor);
        if (pred(actor)) {
            out.push(actor);
        }
        for (const child of actor.children || []) {
            visit(child);
        }
        visit(actor.child);
    };
    visit(root);
    return out;
};

'use strict';
// Interaction-cluster regressions (todo_fixes_2 issues 8-11), driven through the
// REAL extension.js on the fake Cinnamon runtime: pause vs. swap chain, focus
// navigation vs. the resize sort override, Drop vs. fresh-pending, and focus
// fallback vs. the collector's window eligibility.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    makeEnv, makeWindow, makeWorkspace, settingsInstance, enableOnMonitor, enableOnMonitors,
} = require('../helpers/fakes/cinnamon-harness');
const { makeEaseActor } = require('../helpers/fakes/ease-actor');

// Wide enough for the row grids the drop tests key on (>= 2100 px keeps autoRows
// for 4+ windows instead of autoNarrowStacks).
const WIDE = { x: 0, y: 0, width: 2400, height: 1100 };
const LEFT = { x: 0, y: 0, width: 2000, height: 1100 };
const RIGHT = { x: 2000, y: 0, width: 2000, height: 1100 };

const leftToRight = (wins) => wins.slice().sort((a, b) => a.rect[0] - b.rect[0]).map((w) => w.seq);

// A real active workspace (makeWorkspace carries list_windows): the collector reads
// it by index, the focus resolution and the debug canary compare against it.
const activeWorkspace = (env) => {
    const ws = makeWorkspace(env);
    ws.index = () => 0;
    env.activeWorkspace = ws;
    return ws;
};

// ---------------- issue 8: an untiled/paused source rearranges nothing ----------------
// Superseded in part by the user decision of 2026-10-08: a source without active
// tiling still SENDS the focus away along the chain (Left/Right), it only never
// rearranges what stays on it. Up/Down and the edge without a chain stay no-ops.

test('issue 8: an untiled source never rearranges itself; only Right sends the window along the chain', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitors(env, ext, [LEFT, RIGHT]);
    activeWorkspace(env);
    const w1 = makeWindow(env, 1, [0, 0, 1000, 1100], 0);
    const w2 = makeWindow(env, 2, [1000, 0, 1000, 1100], 0);
    const w3 = makeWindow(env, 3, [2000, 0, 1000, 1100], 1);
    const w4 = makeWindow(env, 4, [3000, 0, 1000, 1100], 1);
    env.tabList.push(w1, w2, w3, w4);
    const app = ext.currentSession().app;
    // monitor 1 tiles, monitor 0 has no tiling (default auto:false)
    app.ops.layoutSet(app, 1, 0, { auto: true });
    env.display.focus_window = w1;
    const before = [w1, w2, w3, w4].map((w) => ({ rect: w.rect.slice(), monitor: w.get_monitor() }));
    for (const dir of ['left', 'up', 'down']) {
        env.keybindingManager.hotkeys.get('greenTile-swap-' + dir).cb();
    }
    assert.deepEqual([w1, w2, w3, w4].map((w) => ({ rect: w.rect, monitor: w.get_monitor() })), before,
        'Left (no chain to the left), Up and Down left everything untouched');
    assert.deepEqual(env.logs.filter((l) => l.indexOf('greenTile swap') === 0), [],
        'no local exchange and no push');
    env.keybindingManager.hotkeys.get('greenTile-swap-right').cb();
    assert.equal(w1.get_monitor(), 1, 'Right pushed the window onto the tiled monitor');
    assert.deepEqual(w2.rect, before[1].rect, 'the window left on the untiled source was not rearranged');
    assert.deepEqual(env.logs.filter((l) => l.indexOf('greenTile swap') === 0).map((l) => l.split(' mon=')[0]),
        ['greenTile swap pushed'], 'one chain push, no local exchange');
});

test('issue 8 regression: an active source still pushes along the monitor chain', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitors(env, ext, [LEFT, RIGHT]);
    activeWorkspace(env);
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

// The early Off was refused by corrupt storage, then an external repair restored
// auto:true. Only an explicit reactivation may supersede the retained source pause.
const retainedSwap = ({ monitorIndex = 0, wsIndex = 0, local = false, onlyPrimary = false } = {}) => {
    const preset = { id: 'grid', name: 'Grid', rules: [{ min: 2, stacks: [2, 2] }] };
    const { env, ext } = makeEnv({ layouts: '{bad', windowGap: 0, presets: JSON.stringify([preset]) });
    env.gi.Gio.Settings.prototype.get_boolean = () => onlyPrimary;
    const crossings = [];
    for (let i = 0; i < 3; i++) {
        const ws = makeWorkspace(env);
        const handlers = new Map();
        let nextId = 1;
        ws.connect = (signal, callback) => {
            const id = nextId++;
            handlers.set(id, { signal, callback });
            return id;
        };
        ws.disconnect = (id) => handlers.delete(id);
        ws.index = () => i;
        ws.list_windows = () => env.tabList.filter((w) => w.get_workspace() === ws);
        ws.activate_with_focus = (w) => {
            crossings.push(['activate-workspace', i]);
            env.activeWorkspace = ws;
            env.display.focus_window = w;
        };
    }
    env.activeWorkspace = env.workspaces[wsIndex];
    env.layoutManager.monitors.push(LEFT, RIGHT);
    const actors = [];
    const resets = [];
    const rects = local ? [[0, 0, 1000, 550], [0, 550, 1000, 550], [1000, 0, 1000, 550], [1000, 550, 1000, 550]]
        : [[monitorIndex * 2000 + 50, 70, 400, 300]];
    const windows = rects.map((rect, i) => {
        const actor = makeEaseActor();
        actors.push(actor);
        const w = makeWindow(env, i + 1, rect, monitorIndex, actor);
        let workspace = env.activeWorkspace;
        w.get_workspace = () => workspace;
        w.change_workspace_by_index = (index) => {
            crossings.push(['move-workspace', index]);
            workspace = env.workspaces[index];
        };
        const moveMonitor = w.move_to_monitor;
        w.move_to_monitor = (index) => {
            crossings.push(['move-monitor', index]);
            moveMonitor(index);
        };
        w.unmaximize = (flag) => resets.push([w.seq, flag]);
        return w;
    });
    env.tabList.push(...windows);
    env.display.focus_window = windows[0];
    ext.enable();
    env.keybindingManager.hotkeys.get('greenTile-autoOff').cb();
    env.flushDisplayConfigNoReply();
    const app = ext.currentSession().app;
    assert.equal(app.monitors.ready, true, 'the asynchronous App start completed');
    const ref = app.split.ref(app, monitorIndex, wsIndex, 2);
    assert.equal(ref.wskey, onlyPrimary && monitorIndex !== 0 ? '*' : String(wsIndex + 1));
    assert.equal(app.session.pendingAuto.length, 1, 'the refused early Off remains retained');
    const repaired = JSON.stringify({ [ref.mkey]: { [ref.wskey]: { auto: true, ...(local ? { preset: 'grid' } : {}) } } });
    env.settingsWriteFile('greenTile@carsteneu', 'layouts', repaired);
    settingsInstance(env).remoteUpdate();
    assert.equal(app.ops.layoutFor(app, monitorIndex, wsIndex).auto, true, 'the external repair restored stored auto');
    assert.equal(app.session.holdsPause(app, monitorIndex, wsIndex), true, 'the repair did not reactivate the source');
    const state = () => ({
        windows: windows.map((w) => ({ rect: w.rect.slice(), monitor: w.get_monitor(), ws: w.get_workspace().index(), moves: w.moves.slice() })),
        eases: actors.map((a) => a.eases.length), crossings: crossings.slice(), resets: resets.slice(),
        overrides: windows.map((w) => app.auto.sortPeek(w.seq, 0)),
        pending: JSON.stringify(app.session.pendingAuto), layouts: settingsInstance(env).getValue('layouts'),
        timers: env.liveTimers(), swapLogs: env.logs.filter((l) => l.startsWith('greenTile swap')),
    });
    return { env, ext, app, windows, crossings, state };
};

for (const dir of ['left', 'up', 'down']) {
    test('issues 4/8: retained pause prevents local swap effects after external repair: ' + dir, () => {
        const f = retainedSwap({ local: true });
        try {
            f.env.display.focus_window = f.windows[dir === 'left' ? 2 : dir === 'up' ? 1 : 0];
            const before = f.state();
            f.env.keybindingManager.hotkeys.get('greenTile-swap-' + dir).cb();
            assert.deepEqual(f.state(), before, 'no swap override, placement, animation, timer, write or intent consumption');
        } finally { f.ext.disable(); }
    });
}

// The retained pause still rearranges nothing on the source; sending the focus away
// along the chain is allowed (user decision 2026-10-08).
const sourceUntouched = (before, after, moved) => {
    assert.equal(after.pending, before.pending, 'the retained intent was not consumed');
    assert.equal(after.layouts, before.layouts, 'no layouts write');
    assert.deepEqual(after.eases, before.eases, 'no animation');
    assert.deepEqual(after.overrides, before.overrides, 'no swap override');
    assert.deepEqual(after.resets, before.resets, 'no unmaximize');
    assert.deepEqual(after.timers, before.timers, 'no timer armed');
    after.windows.forEach((w, i) => {
        if (i !== moved) {
            assert.deepEqual(w, before.windows[i], 'window ' + (i + 1) + ' on the paused source kept its place');
        }
    });
};

test('issues 4/8: under a retained pause Right skips the local exchange and sends the focus along the chain', () => {
    const f = retainedSwap({ local: true });
    try {
        f.env.display.focus_window = f.windows[0]; // has a right neighbour on the paused surface
        const before = f.state();
        f.env.keybindingManager.hotkeys.get('greenTile-swap-right').cb();
        const after = f.state();
        assert.deepEqual(after.crossings, [['move-monitor', 1]], 'straight to the next monitor, no local swap');
        assert.deepEqual(after.swapLogs.map((l) => l.split(' mon=')[0]), ['greenTile swap pushed']);
        sourceUntouched(before, after, 0);
    } finally { f.ext.disable(); }
});

for (const c of [
    { name: 'monitor right', dir: 'right', monitorIndex: 0, wsIndex: 0, crossings: [['move-monitor', 1]] },
    { name: 'monitor left', dir: 'left', monitorIndex: 1, wsIndex: 0, crossings: [['move-monitor', 0]] },
    { name: 'workspace right', dir: 'right', monitorIndex: 1, wsIndex: 0,
        crossings: [['move-workspace', 1], ['move-monitor', 0], ['activate-workspace', 1]] },
    { name: 'workspace left', dir: 'left', monitorIndex: 0, wsIndex: 1,
        crossings: [['move-workspace', 0], ['move-monitor', 1], ['activate-workspace', 0]] },
    { name: 'secondary shared slot', dir: 'left', monitorIndex: 1, wsIndex: 1, onlyPrimary: true,
        crossings: [['move-monitor', 0]] },
]) {
    test('issues 4/8: a retained pause sends the window along the ' + c.name + ' chain without touching the source', () => {
        const f = retainedSwap(c);
        try {
            const before = f.state();
            f.env.keybindingManager.hotkeys.get('greenTile-swap-' + c.dir).cb();
            const after = f.state();
            assert.deepEqual(after.crossings, c.crossings, 'the chain push ran');
            assert.equal(after.swapLogs.length, 1);
            sourceUntouched(before, after, 0);
        } finally { f.ext.disable(); }
    });
}

// A retained pause on the TARGET must be honoured like on the source: the window
// only moves there, no slot override is armed that the gated retile never consumes
// (it would sort the window on the next retile after an explicit resume).
test('issues 4/8: a push INTO a surface with a retained pause moves only and arms no override', () => {
    const f = retainedSwap();
    try {
        const visitor = makeWindow(f.env, 9, [2100, 100, 500, 400], 1);
        f.env.tabList.push(visitor);
        f.env.display.focus_window = visitor;
        const before = f.state();
        f.env.keybindingManager.hotkeys.get('greenTile-swap-left').cb();
        const after = f.state();
        assert.equal(visitor.get_monitor(), 0, 'the window was pushed onto the paused monitor');
        assert.deepEqual(visitor.rect, [2100, 100, 500, 400], 'move only, no slot');
        assert.equal(f.app.auto.sortPeek(9, 0), null, 'no override armed on the paused target');
        sourceUntouched(before, after, -1);
    } finally { f.ext.disable(); }
});

test('issues 4/8: a workspace push INTO a surface with a retained pause moves only and arms no override', () => {
    const f = retainedSwap({ monitorIndex: 0, wsIndex: 1 });
    try {
        const visitor = makeWindow(f.env, 9, [2100, 100, 500, 400], 1);
        let workspace = f.env.workspaces[0];
        visitor.get_workspace = () => workspace;
        visitor.change_workspace_by_index = (index) => { workspace = f.env.workspaces[index]; };
        f.env.tabList.push(visitor);
        f.env.activeWorkspace = f.env.workspaces[0];
        f.env.display.focus_window = visitor;
        f.env.keybindingManager.hotkeys.get('greenTile-swap-right').cb();
        assert.deepEqual([visitor.get_workspace().index(), visitor.get_monitor()], [1, 0],
            'the window crossed onto the paused monitor-workspace');
        assert.deepEqual(visitor.rect, [2100, 100, 500, 400], 'move only, no slot');
        assert.equal(f.app.auto.sortPeek(9, 0), null, 'no override armed on the paused target');
    } finally { f.ext.disable(); }
});

for (const control of ['auto-on', 'preset-card']) {
    test('issues 4/8: explicit ' + control + ' reactivation permits the monitor chain again', () => {
        const f = retainedSwap();
        try {
            if (control === 'auto-on') {
                f.env.keybindingManager.hotkeys.get('greenTile-autoN').cb();
            } else {
                f.env.keybindingManager.hotkeys.get('greenTile-preset').cb();
                const visit = (actor) => {
                    if (!actor) { return null; }
                    if (/^gk-card(?: |$)/.test(actor.style_class || '')) { return actor; }
                    for (const child of actor.children || []) {
                        const found = visit(child);
                        if (found) { return found; }
                    }
                    return visit(actor.child);
                };
                const row = visit(f.app.panel.actor);
                assert.ok(row, 'the real preset card actor exists');
                row.emit('clicked');
            }
            assert.equal(f.app.session.holdsPause(f.app, 0, 0), false);
            f.env.keybindingManager.hotkeys.get('greenTile-swap-right').cb();
            assert.equal(f.windows[0].get_monitor(), 1, 'explicit reactivation enables the active chain');
            assert.deepEqual(f.crossings, [['move-monitor', 1]]);
        } finally { f.ext.disable(); }
    });
}

// ---------------- issue 9: focus navigation must not consume the resize override ----------------

test('issue 9: focus navigation leaves the resize sort override for the retile', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitor(env, ext);
    activeWorkspace(env);
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
    activeWorkspace(env);
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

test('issue 9: the read-only peek neither consumes nor keeps expired entries', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitor(env, ext);
    const app = ext.currentSession().app;
    app.auto.sortOverride(5, [1, 2, 3, 4], 1000);
    assert.deepEqual(app.auto.sortPeek(5, 1500), [1, 2, 3, 4], 'a fresh override is readable');
    assert.deepEqual(app.auto.sortPeek(5, 1500), [1, 2, 3, 4], 'reading it again does not consume it');
    assert.deepEqual(app.auto.sortTake(5, 1500), [1, 2, 3, 4], 'the later placement still gets it');
    app.auto.sortOverride(6, [9, 9, 9, 9], 1000);
    assert.equal(app.auto.sortPeek(6, 3001), null, 'beyond 2000 ms the peek ignores the entry');
    app.auto.sortOverride(7, [7, 7, 7, 7], 1000);
    app.auto.sortPoll(3001);
    assert.equal(app.auto.sortPeek(7, 1500), null,
        'sortPoll pruned what a fresh-looking peek would still have seen');
});

// ---------------- issue 10: a successful drop wins over the fresh-pending list ----------------

test('issue 10: a successful drop survives the debounced retile', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitors(env, ext, [WIDE]);
    activeWorkspace(env);
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
    activeWorkspace(env);
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
    activeWorkspace(env);
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

test('issue 10: a cross-monitor drop clears the record on the spawn monitor', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitors(env, ext, [LEFT, RIGHT]);
    activeWorkspace(env);
    const w1 = makeWindow(env, 1, [0, 0, 1000, 1100], 0);
    const w2 = makeWindow(env, 2, [1000, 0, 1000, 1100], 0);
    const w5 = makeWindow(env, 5, [2000, 0, 1000, 1100], 1);
    const w6 = makeWindow(env, 6, [3000, 0, 1000, 1100], 1);
    env.tabList.push(w1, w2, w5, w6);
    const app = ext.currentSession().app;
    app.ops.layoutSet(app, 0, 0, { auto: true });
    app.ops.layoutSet(app, 1, 0, { auto: true });
    app.ops.retileMonitor(app, 0);
    app.ops.retileMonitor(app, 1);
    // the window opens on monitor 1 (its fresh record lives there), the drag ends on monitor 0
    const w7 = makeWindow(env, 7, [2400, 0, 300, 1100], 1);
    env.tabList.push(w7);
    app.auto.onWindowAdded(app, env.activeWorkspace, w7);
    app.drop.begin(app, w7, env.gi.Meta.GrabOp.MOVING);
    // muffin moves the frame to the monitor under the pointer during the drag
    w7.move_to_monitor(0);
    w7.rect = [0, 0, 400, 1100];
    assert.equal(app.drop.end(app, w7, env.gi.Meta.GrabOp.MOVING), true, 'the cross-monitor drop applied');
    app.ops.retileMonitor(app, 0, null, false);
    assert.deepEqual(leftToRight([w1, w2, w7]), [7, 1, 2], 'the drop placement survived on the target monitor');
    // back on its spawn monitor without another drop: a stale record would re-append
    // the window last, the cleared one lets the position order decide
    w7.move_to_monitor(1);
    w7.rect = [2400, 0, 300, 1100];
    app.ops.retileMonitor(app, 1, null, false);
    assert.deepEqual(leftToRight([w5, w6, w7]), [5, 7, 6],
        'the spawn monitor sorted by position instead of re-appending the dropped window');
});

// ---------------- issue 11: focus fallback and collector share the eligibility ----------------

test('issue 11: a dialog focus never claims a cell and does not break the normal windows', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitor(env, ext);
    activeWorkspace(env);
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

test('issue 11: the focus fallback never resolves a minimized tab-list entry', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitors(env, ext, [LEFT, RIGHT]);
    activeWorkspace(env);
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

test('issue 11: a focused window without a wm_class claims no cell', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitor(env, ext);
    activeWorkspace(env);
    const headless = makeWindow(env, 1, [0, 0, 300, 300], 0, null, { wmClass: null });
    const w1 = makeWindow(env, 2, [400, 0, 400, 300], 0);
    const w2 = makeWindow(env, 3, [900, 0, 400, 300], 0);
    env.tabList.push(headless, w1, w2);
    env.display.focus_window = headless;
    const app = ext.currentSession().app;
    app.ops.layoutSet(app, 0, 0, { auto: true });
    app.auto.activate(app);
    assert.deepEqual(headless.rect, [0, 0, 300, 300], 'the classless window kept its own geometry');
    assert.deepEqual(w1.rect, [0, 0, 1000, 1100], 'the admissible windows still tiled');
    assert.deepEqual(w2.rect, [1000, 0, 1000, 1100]);
});

test('issue 11: a focused window without an owning app claims no cell', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitor(env, ext);
    activeWorkspace(env);
    const orphan = makeWindow(env, 1, [0, 0, 300, 300], 0, null, { noApp: true });
    const w1 = makeWindow(env, 2, [400, 0, 400, 300], 0);
    const w2 = makeWindow(env, 3, [900, 0, 400, 300], 0);
    env.tabList.push(orphan, w1, w2);
    env.display.focus_window = orphan;
    const app = ext.currentSession().app;
    app.ops.layoutSet(app, 0, 0, { auto: true });
    app.auto.activate(app);
    assert.deepEqual(orphan.rect, [0, 0, 300, 300], 'the app-less window kept its own geometry');
    assert.deepEqual(w1.rect, [0, 0, 1000, 1100], 'the admissible windows still tiled');
    assert.deepEqual(w2.rect, [1000, 0, 1000, 1100]);
});

test('issue 11 regression: an excluded focused window is counted by nobody and the rest still tiles', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitor(env, ext);
    activeWorkspace(env);
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

test('issue 10: a closed window leaves no fresh record behind', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitor(env, ext);
    const ws = activeWorkspace(env);
    const app = ext.currentSession().app;
    // monitor 0 stays paused, so no retile ever drains the pending sets here
    const closed = makeWindow(env, 1, [0, 0, 300, 300], 0);
    env.tabList.push(closed);
    app.auto.onWindowAdded(app, ws, closed);
    const kept = makeWindow(env, 2, [400, 0, 300, 300], 0);
    env.tabList.push(kept);
    app.auto.onWindowAdded(app, ws, kept);
    app.auto.onWindowRemoved(app, ws, closed);
    const pending = app.auto.pendingTake(0);
    assert.equal(pending.has(2), true, 'the live fresh window keeps its record');
    assert.equal(pending.has(1), false, 'the closed window left no record behind');
});

test('issue 11: the swap hotkey does not act on an inadmissible focus', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitors(env, ext, [LEFT, RIGHT]);
    activeWorkspace(env);
    const orphan = makeWindow(env, 1, [0, 0, 1000, 1100], 0, null, { noApp: true });
    const w2 = makeWindow(env, 2, [1000, 0, 1000, 1100], 0);
    const w3 = makeWindow(env, 3, [2000, 0, 1000, 1100], 1);
    env.tabList.push(orphan, w2, w3);
    const app = ext.currentSession().app;
    app.ops.layoutSet(app, 0, 0, { auto: true });
    app.ops.layoutSet(app, 1, 0, { auto: true });
    env.display.focus_window = orphan;
    const before = [orphan.rect.slice(), w2.rect.slice(), w3.rect.slice()];
    env.keybindingManager.hotkeys.get('greenTile-swap-right').cb();
    assert.deepEqual([orphan.rect, w2.rect, w3.rect], before, 'nothing moved for an inadmissible focus');
    assert.deepEqual(env.logs.filter((l) => l.indexOf('greenTile swap') === 0), [], 'no swap ran');
});

test('issue 11 regression: the exclude hotkey follows the real focus, not the retile fallback', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitors(env, ext, [LEFT, RIGHT]);
    activeWorkspace(env);
    const dialog = makeWindow(env, 1, [0, 0, 300, 300], 0, null, { windowType: env.gi.Meta.WindowType.DIALOG });
    const bystander = makeWindow(env, 2, [2000, 0, 400, 300], 1);
    // the tileable window first: an unfiltered fallback would return it
    env.tabList.push(bystander, dialog);
    env.display.focus_window = dialog;
    const app = ext.currentSession().app;
    app.excl.toggleFocused(app);
    assert.equal(app.excl.isExcluded(dialog), true, 'the focused window itself was toggled');
    assert.equal(app.excl.isExcluded(bystander), false,
        'no unrelated window was excluded in place of the focus');
});

test('issue 11 regression: the exclude hotkey does nothing without focus', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitor(env, ext);
    activeWorkspace(env);
    const w1 = makeWindow(env, 1, [0, 0, 1000, 1100], 0);
    env.tabList.push(w1);
    env.display.focus_window = null;
    const app = ext.currentSession().app;
    app.excl.toggleFocused(app);
    assert.equal(app.excl.isExcluded(w1), false,
        'a table-top focus must not exclude the first tileable window');
});

test('issue 11: the columns hotkey gives a focused app-less window no column', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitor(env, ext);
    activeWorkspace(env);
    const orphan = makeWindow(env, 1, [0, 0, 300, 300], 0, null, { noApp: true });
    const w1 = makeWindow(env, 2, [400, 0, 400, 300], 0);
    const w2 = makeWindow(env, 3, [900, 0, 400, 300], 0);
    env.tabList.push(orphan, w1, w2);
    env.display.focus_window = orphan;
    env.keybindingManager.hotkeys.get('greenTile-auto3').cb();
    assert.equal(orphan.moves.length, 0, 'the app-less focused window claimed no column');
    assert.equal(w1.rect[0], 0, 'the first admissible window starts at column 0');
    assert.ok(w2.rect[0] > w1.rect[0], 'the second admissible window sits to its right');
});

test('issue 11: the focus fallback routes to the first admissible tab-list entry', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitors(env, ext, [LEFT, RIGHT]);
    activeWorkspace(env);
    // the dialog is the first tab-list entry on the other monitor: an unfiltered
    // fallback would resolve it and retile its (empty) monitor
    const dialog = makeWindow(env, 1, [0, 0, 300, 300], 0, null, { windowType: env.gi.Meta.WindowType.DIALOG });
    const w1 = makeWindow(env, 2, [2000, 0, 400, 300], 1);
    const w2 = makeWindow(env, 3, [2500, 0, 400, 300], 1);
    env.tabList.push(dialog, w1, w2);
    env.display.focus_window = dialog;
    const app = ext.currentSession().app;
    app.auto.activate(app);
    assert.deepEqual(w1.rect, [2000, 0, 1000, 1100], 'the admissible fallback window tiled its own monitor');
    assert.deepEqual(w2.rect, [3000, 0, 1000, 1100], 'the second admissible window filled the next cell');
    assert.deepEqual(dialog.rect, [0, 0, 300, 300], 'the dialog itself stayed untouched');
});

test('issue 11: the panel window count follows the same admissibility as the retile', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitor(env, ext);
    activeWorkspace(env);
    const orphan = makeWindow(env, 1, [0, 0, 300, 300], 0, null, { noApp: true });
    const w1 = makeWindow(env, 2, [400, 0, 400, 300], 0);
    const w2 = makeWindow(env, 3, [900, 0, 400, 300], 0);
    env.tabList.push(orphan, w1, w2);
    env.display.focus_window = orphan;
    const app = ext.currentSession().app;
    app.ops.layoutSet(app, 0, 0, { auto: true });
    assert.equal(app.ops.windowCount(app), 2, 'the inadmissible focus is not counted');
    app.auto.activate(app);
    assert.deepEqual(w1.rect, [0, 0, 1000, 1100], 'the retile placed exactly the two admissible windows');
    assert.deepEqual(w2.rect, [1000, 0, 1000, 1100]);
});

test('issue 10: the close path alone clears a fresh record on a paused monitor', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitor(env, ext);
    const ws = activeWorkspace(env);
    const app = ext.currentSession().app;
    // monitor 0 stays paused, so no retile ever drains the pending sets here
    const closed = makeWindow(env, 1, [0, 0, 300, 300], 0);
    env.tabList.push(closed);
    app.auto.trackWindow(app, closed);
    app.auto.onWindowAdded(app, ws, closed);
    const kept = makeWindow(env, 2, [400, 0, 300, 300], 0);
    env.tabList.push(kept);
    app.auto.onWindowAdded(app, ws, kept);
    // the guaranteed close path: the window's unmanaged fires whether or not
    // window-removed follows (and even when it arrives on an inactive workspace)
    closed.emit('unmanaged');
    const pending = app.auto.pendingTake(0);
    assert.equal(pending.has(2), true, 'the live fresh window keeps its record');
    assert.equal(pending.has(1), false, 'the closed window left no record on the close path');
});

// ---------------- transient and non-resizable windows are never tiled ----------------

// A window that is transient for another (a preference/properties dialog typed
// NORMAL) and a window that cannot be resized float where they are, like an
// excluded window: they are neither counted nor moved, and they do not change the
// count the other windows tile by.
test('a transient NORMAL window is never tiled and does not change the others\' count', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitor(env, ext);
    activeWorkspace(env);
    const parent = makeWindow(env, 1, [400, 0, 400, 300], 0);
    const child = makeWindow(env, 2, [0, 0, 300, 300], 0, null, { transientFor: parent });
    const other = makeWindow(env, 3, [900, 0, 400, 300], 0);
    env.tabList.push(parent, child, other);
    env.display.focus_window = child;
    const app = ext.currentSession().app;
    app.ops.layoutSet(app, 0, 0, { auto: true });
    assert.equal(app.ops.windowCount(app), 2, 'the transient window is counted by nobody');
    app.auto.activate(app);
    assert.deepEqual(child.rect, [0, 0, 300, 300], 'the transient window kept its own geometry');
    assert.equal(child.moves.length, 0, 'no placement ran on the transient window');
    assert.deepEqual(parent.rect, [0, 0, 1000, 1100], 'the parent filled the first of two cells');
    assert.deepEqual(other.rect, [1000, 0, 1000, 1100], 'the other window filled the second cell');
});

test('a non-resizable window is never tiled and does not change the others\' count', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitor(env, ext);
    activeWorkspace(env);
    const fixed = makeWindow(env, 1, [0, 0, 300, 300], 0, null, { allowsResize: false });
    const w1 = makeWindow(env, 2, [400, 0, 400, 300], 0);
    const w2 = makeWindow(env, 3, [900, 0, 400, 300], 0);
    env.tabList.push(fixed, w1, w2);
    env.display.focus_window = fixed;
    const app = ext.currentSession().app;
    app.ops.layoutSet(app, 0, 0, { auto: true });
    assert.equal(app.ops.windowCount(app), 2, 'the fixed-size window is counted by nobody');
    app.auto.activate(app);
    assert.deepEqual(fixed.rect, [0, 0, 300, 300], 'the fixed-size window kept its own geometry');
    assert.equal(fixed.moves.length, 0, 'no placement ran on the fixed-size window');
    assert.deepEqual(w1.rect, [0, 0, 1000, 1100]);
    assert.deepEqual(w2.rect, [1000, 0, 1000, 1100]);
});

// Positive control for the pair above: an ordinary focused window (not transient,
// resizable — the harness defaults) is still counted and tiled.
test('positive control: an ordinary focused window is still tiled', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitor(env, ext);
    activeWorkspace(env);
    const w1 = makeWindow(env, 1, [0, 0, 300, 300], 0);
    const w2 = makeWindow(env, 2, [400, 0, 400, 300], 0);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    const app = ext.currentSession().app;
    app.ops.layoutSet(app, 0, 0, { auto: true });
    assert.equal(app.ops.windowCount(app), 2, 'both ordinary windows count');
    app.auto.activate(app);
    assert.deepEqual(w1.rect, [0, 0, 1000, 1100], 'the focused window was tiled');
    assert.deepEqual(w2.rect, [1000, 0, 1000, 1100]);
});

// The skip canary (lib/tiling/debug.js) logs a reason for every window the
// collector skipped; 'UNKNOWN' means its reason list drifted from the filters.
// The transient and non-resizable filters must name themselves.
test('the skip canary names the transient and non-resizable reasons, never UNKNOWN', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitor(env, ext);
    activeWorkspace(env);
    const kept = makeWindow(env, 1, [0, 0, 300, 300], 0);
    const child = makeWindow(env, 2, [400, 0, 300, 300], 0, null, { transientFor: kept });
    const fixed = makeWindow(env, 3, [800, 0, 300, 300], 0, null, { allowsResize: false });
    env.tabList.push(kept, child, fixed);
    env.display.focus_window = kept;
    const app = ext.currentSession().app;
    app.ops.layoutSet(app, 0, 0, { auto: true });
    env.logs.length = 0;
    app.ops.retileMonitor(app, 0);
    const skipped = env.logs.filter((line) => line.indexOf('greenTile skipped') === 0);
    assert.equal(skipped.length, 1, 'exactly one skip line');
    assert.match(skipped[0], /transient/, 'the transient window names its reason');
    assert.match(skipped[0], /non-resizable/, 'the fixed-size window names its reason');
    assert.equal(/UNKNOWN/.test(skipped[0]), false, 'no skipped window fell through the reason list');
});

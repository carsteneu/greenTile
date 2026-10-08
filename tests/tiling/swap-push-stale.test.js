'use strict';
// A cross-workspace swap chain (Super+Ctrl+Left, ws14 -> ws13 -> ws12) must leave
// the surface it passed through on its preset again. The surface's hand-made size
// intent is keyed by window count alone, so the push round trip (count 4 -> 5 -> 4)
// silently re-exposed the shape stored for count 4 and every later retile —
// Super+Ctrl+A included — reproduced it forever. Only the panel's binding click
// (app.split.reset) recovered, because that is the only caller that drops the
// stored sizes.
//
// Host evidence (2026-10-08, build 2.2.4): five "preset ... applied ws13 n=4
// stacks=[1,1,1,1]" between 10:03:12 and 10:04:03 with no visible change (and no
// " split" suffix), then "sizes reset ws13" from a card click -> fixed.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    makeEnv, makeWindow, makeWorkspace, settingsInstance, enableOnMonitors,
} = require('../helpers/fakes/cinnamon-harness');

const WIDE = { x: 0, y: 0, width: 5120, height: 1440, index: 0 };

const PRESET = {
    id: 'p2',
    name: 'Terminal Reihen',
    rules: [
        { min: 2, stacks: [1, 1] },
        { min: 3, stacks: [1, 1, 1] },
        { min: 4, stacks: [1, 1, 1, 1] },
        { min: 5, stacks: [1, 1, 1, 1, 1] },
    ],
};

const COLUMNS4 = [[0, 0, 1280, 1440], [1280, 0, 1280, 1440], [2560, 0, 1280, 1440], [3840, 0, 1280, 1440]];
// The arrangement a dragged border left behind for four windows on this surface.
const DRAGGED4 = { kind: 'cols', shape: [2, 2] };

const rectsOf = (wins) => wins.map((w) => w.rect.slice());
const sorted = (rows) => rows.map((r) => r.join(',')).sort();
const overlaps = (wins) => {
    const out = [];
    for (let i = 0; i < wins.length; i++) {
        for (let j = i + 1; j < wins.length; j++) {
            const a = wins[i].rect; const b = wins[j].rect;
            const ox = Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]);
            const oy = Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]);
            if (ox > 0 && oy > 0) { out.push(`${wins[i].seq}x${wins[j].seq}`); }
        }
    }
    return out;
};

const fireMs = (env, ms) => {
    const entry = [...env.timers.entries()].find(([, t]) => t.ms === ms);
    if (!entry) {
        return false;
    }
    env.timers.delete(entry[0]);
    entry[1].cb();
    return true;
};

// Three workspaces that carry the surface the swap chain reads: index(),
// list_windows() over an own registry, activate_with_focus() and the
// window-added/window-removed signals the Auto observer rides.
const buildWorkspaces = (env, all, count) => {
    for (let i = 0; i < count; i++) {
        const ws = makeWorkspace(env);
        const handlers = new Map();
        let nextId = 1;
        ws.connect = (signal, callback) => {
            const id = nextId++;
            handlers.set(id, { signal, callback });
            return id;
        };
        ws.disconnect = (id) => handlers.delete(id);
        ws.emit = (signal, ...args) => {
            for (const h of [...handlers.values()]) {
                if (h.signal === signal) {
                    h.callback(...args);
                }
            }
        };
        ws.index = () => i;
        ws.list_windows = () => all.filter((w) => w.get_workspace() === ws);
        ws.activate_with_focus = (w) => {
            env.activeWorkspace = ws;
            env.display.focus_window = w;
        };
    }
    return env.workspaces;
};

const setup = (opts = {}) => {
    const { env, ext } = makeEnv({ windowGap: 0, presets: JSON.stringify([PRESET]) });
    // Real Cinnamon's Main.getTabList() lists the ACTIVE workspace's windows
    // (lib/tiling/windows.js); the shared fake returns the whole tab list.
    const all = [];
    Object.defineProperty(env, 'tabList', {
        configurable: true,
        get: () => (env.activeWorkspace ? all.filter((w) => w.get_workspace() === env.activeWorkspace) : all),
    });
    const workspaces = buildWorkspaces(env, all, 3);
    env.activeWorkspace = workspaces[2];
    enableOnMonitors(env, ext, [WIDE]);
    const app = ext.currentSession().app;
    // A window that knows its workspace: change_workspace_by_index moves it and
    // emits the workspace signals Muffin emits.
    const place = (w, ws) => {
        let workspace = ws;
        w.get_workspace = () => workspace;
        w.change_workspace_by_index = (index) => {
            const from = workspace;
            workspace = env.workspaces[index];
            from.emit('window-removed', from, w);
            workspace.emit('window-added', workspace, w);
        };
        return w;
    };
    const big = opts.residentMin ? { minSize: [opts.residentMin, 400] } : {};
    const ws13 = workspaces[1];
    const w1 = place(makeWindow(env, 1, [0, 0, 1280, 1440], 0), ws13);
    const w2 = place(makeWindow(env, 2, [1280, 0, 1280, 1440], 0), ws13);
    const w3 = place(makeWindow(env, 3, [2560, 0, 1280, 1440], 0), ws13);
    const w4 = place(makeWindow(env, 4, [3840, 0, 1280, 1440], 0, null, big), ws13);
    const brave = place(makeWindow(env, 5, [2560, 0, 1280, 1440], 0, null, big), workspaces[2]);
    all.push(w1, w2, w3, w4, brave);
    app.ops.layoutSet(app, 0, 0, { auto: true });
    app.ops.layoutSet(app, 0, 1, { auto: true, preset: 'p2' });
    app.ops.layoutSet(app, 0, 2, { auto: true });
    return { env, ext, app, all, w1, w2, w3, w4, brave, ws12: workspaces[0], ws13, ws14: workspaces[2] };
};

const swapLeft = (env) => {
    env.keybindingManager.hotkeys.get('greenTile-swap-left').cb();
};

test('a push chain through a surface re-arms its preset instead of re-using the stored sizes', () => {
    const f = setup();
    const { env, app, brave } = f;
    // The surface carries hand-made sizes for four windows (a dragged border).
    app.ops.layoutSet(app, 0, 1, { shapes: { 4: DRAGGED4 }, splits: { 4: null } });
    const four = [f.w1, f.w2, f.w3, f.w4];

    // Push the window in from ws14 (counts 4 -> 5) ...
    env.activeWorkspace = f.ws14;
    env.display.focus_window = brave;
    swapLeft(env);
    fireMs(env, 300);
    assert.equal(brave.get_workspace(), f.ws13, 'the push landed in the middle workspace');
    assert.equal(env.tabList.length, 5, 'the middle surface carries five windows');

    // ... walk it to the edge slot with local swaps (the host's four presses) ...
    for (let i = 0; i < 4; i++) {
        env.activeWorkspace = f.ws13;
        env.display.focus_window = brave;
        swapLeft(env);
        fireMs(env, 300);
    }
    assert.equal(brave.get_workspace(), f.ws13, 'four local swaps did not push it out');

    // ... and push it out to ws12 (counts 5 -> 4 again).
    env.activeWorkspace = f.ws13;
    env.display.focus_window = brave;
    swapLeft(env);
    fireMs(env, 300);
    assert.equal(brave.get_workspace(), f.ws12, 'the push left the middle workspace');

    // The surface is back at four windows and must be on its preset again.
    env.activeWorkspace = f.ws13;
    env.display.focus_window = f.w1;
    app.auto.activate(app); // Super+Ctrl+A
    assert.deepEqual(sorted(rectsOf(four)), sorted(COLUMNS4),
        'Super+Ctrl+A restores the preset after the push chain');
});

test('the pass-through of a second large-minimum window leaves the surface on its preset', () => {
    const f = setup({ residentMin: 2600 });
    const { env, app, brave } = f;
    app.ops.layoutSet(app, 0, 1, { shapes: { 4: DRAGGED4 }, splits: { 4: null } });
    const four = [f.w1, f.w2, f.w3, f.w4];
    const surface = () => [...four, brave].filter((w) => w.get_workspace() === f.ws13);
    const noOverlap = (label) => {
        assert.deepEqual(overlaps(surface()), [], 'overlapping windows after ' + label);
        for (const w of surface()) {
            assert.ok(w.rect[0] >= 0 && w.rect[0] + w.rect[2] <= WIDE.width, 'left the monitor after ' + label);
        }
    };
    env.activeWorkspace = f.ws13;
    env.display.focus_window = f.w1;
    app.ops.retileMonitor(app, 0, f.w1, true, 1);
    noOverlap('the initial retile');
    env.activeWorkspace = f.ws14;
    env.display.focus_window = brave;
    swapLeft(env);
    fireMs(env, 300);
    noOverlap('the push in');
    // Walk the arriving window to the far edge with local swaps; the press that finds no
    // neighbour left pushes it out to ws12 (the host's four "swap left ws13 n=5" then one
    // more). The count differs with the minima, so the loop follows the window instead of
    // a fixed number of presses.
    let guard = 0;
    while (brave.get_workspace() === f.ws13 && guard++ < 8) {
        env.activeWorkspace = f.ws13;
        env.display.focus_window = brave;
        swapLeft(env);
        fireMs(env, 300);
        noOverlap('local swap ' + guard);
    }
    assert.equal(brave.get_workspace(), f.ws12, 'the push left the middle workspace');
    noOverlap('the push out');

    // The card click's repair must have nothing left to do: the surface is already
    // where a reset would put it. Both halves of the user's gesture — the click that
    // assigns the preset and split.reset that clears the sizes — are a no-op.
    const settled = JSON.stringify(rectsOf(four));
    app.split.reset(app, 0, 1);
    app.ops.retileMonitor(app, 0, f.w1, true, 1);
    assert.equal(JSON.stringify(rectsOf(four)), settled, 'Reset sizes still changed the surface');
    // and the resident large-minimum window was not squeezed under the terminals
    assert.ok(four.some((w) => w.rect[2] >= 2600), 'the resident window lost its minimum');
});

test('a local swap on an unchanged surface keeps the hand-made sizes', () => {
    const f = setup();
    const { env, app } = f;
    app.ops.layoutSet(app, 0, 1, { shapes: { 4: DRAGGED4 }, splits: { 4: null } });
    const four = [f.w1, f.w2, f.w3, f.w4];
    env.activeWorkspace = f.ws13;
    env.display.focus_window = f.w1;
    app.ops.retileMonitor(app, 0, f.w1, true, 1);
    const before = JSON.stringify(rectsOf(four));
    const n = env.logs.length;
    // f.w1 sits in the leftmost cell, so a swap left would be a push; swap right exchanges.
    env.keybindingManager.hotkeys.get('greenTile-swap-right').cb();
    assert.match(env.logs.slice(n).join(' | '), /swap right ws2 /, 'the local exchange ran');
    assert.equal(env.logs.slice(n).join(' | ').indexOf('pushed'), -1, 'no surface was left');
    assert.notEqual(JSON.stringify(rectsOf(four)), before, 'the neighbour exchange happened');
    const stored = JSON.parse(settingsInstance(env).getValue('layouts'));
    const entry = stored[app.monitors.keys[0]][app.monitors.wsKey(0, 1)];
    assert.equal(entry.shapes['4'].shape.join(), DRAGGED4.shape.join(),
        'the swap left the stored sizes alone');
    assert.equal(entry.shapes['4'].kind, DRAGGED4.kind);
});

test('a push-out forgets both counts it displaced, so neither can re-expose later', () => {
    const f = setup();
    const { env, app } = f;
    // The surface was arranged by hand at both counts before the push: a 2x2 for four
    // windows, three strips for three.
    app.ops.layoutSet(app, 0, 1, {
        shapes: { 4: DRAGGED4, 3: { kind: 'rows', shape: [1, 1, 1] } },
        splits: { 4: null, 3: null },
    });
    const three = [f.w2, f.w3, f.w4];
    env.activeWorkspace = f.ws13;
    env.display.focus_window = f.w1; // leftmost cell: nothing borders left, so this pushes
    swapLeft(env);
    fireMs(env, 300);
    assert.equal(f.w1.get_workspace(), f.ws12, 'the leftmost window was pushed out');
    // The count the surface fell back to is on the preset, not on the stored three strips.
    assert.ok(three.every((w) => w.rect[3] === WIDE.height && w.rect[2] < WIDE.width),
        'the three-window arrangement is the preset columns, not the stored strips');
    // The count the pushed window sat on is forgotten too: a later fourth window tiles to
    // the preset instead of re-exposing the dragged shape it replaced.
    const w5 = makeWindow(env, 6, [0, 0, 1280, 1440], 0);
    f.all.push(w5);
    env.display.focus_window = w5;
    app.ops.retileMonitor(app, 0, w5, true, 1);
    assert.deepEqual(sorted(rectsOf([...three, w5])), sorted(COLUMNS4),
        'the fourth window tiles to the preset');
    const stored = JSON.parse(settingsInstance(env).getValue('layouts'));
    const entry = stored[app.monitors.keys[0]][app.monitors.wsKey(0, 1)] || {};
    assert.equal(JSON.stringify(entry.shapes), undefined, 'no dragged shapes were left behind');
});

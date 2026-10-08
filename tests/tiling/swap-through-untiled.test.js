'use strict';
// Super+Ctrl+Left/Right pushes a window THROUGH surfaces without active tiling
// (user decision 2026-10-08): on a source monitor-workspace without tiling (no auto,
// no preset) or with tiling explicitly paused (preset kept, auto off) the window
// moves straight along the chain — next monitor, then previous/next workspace —
// exactly like the edge push of a tiled surface. On the target it is slotted in when
// tiling is active there, otherwise it only moves (size kept). Up/Down stay no-ops
// there, and nothing on the untiled/paused source is retiled.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    makeEnv, makeWindow, makeWorkspace, enableOnMonitors,
} = require('../helpers/fakes/cinnamon-harness');

const WIDE = { x: 0, y: 0, width: 3000, height: 1000, index: 0 };
const LEFT_MON = { x: 0, y: 0, width: 2000, height: 1000, index: 0 };
const RIGHT_MON = { x: 2000, y: 0, width: 2000, height: 1000, index: 1 };

const PRESET = { id: 'p2', name: 'Halves', rules: [{ min: 2, stacks: [1, 1] }, { min: 3, stacks: [1, 1, 1] }] };

// n workspaces, each with its own window list; windows move between them like Muffin.
const setup = (monitors, wsCount = 3) => {
    const { env, ext } = makeEnv({
        windowGap: 0, presets: JSON.stringify([PRESET]), singleWindowMode: 'leave', singleWindowMigrated: true,
    });
    const all = [];
    Object.defineProperty(env, 'tabList', {
        configurable: true,
        get: () => all.filter((w) => w.get_workspace() === env.activeWorkspace),
    });
    for (let i = 0; i < wsCount; i++) {
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
    env.activeWorkspace = env.workspaces[0];
    enableOnMonitors(env, ext, monitors);
    const app = ext.currentSession().app;
    const win = (seq, rect, wsIndex, monitor = 0) => {
        const w = makeWindow(env, seq, rect, monitor);
        let workspace = env.workspaces[wsIndex];
        w.get_workspace = () => workspace;
        w.change_workspace_by_index = (index) => {
            const from = workspace;
            workspace = env.workspaces[index];
            from.emit('window-removed', from, w);
            workspace.emit('window-added', workspace, w);
        };
        all.push(w);
        return w;
    };
    const press = (dir, w) => {
        env.activeWorkspace = w.get_workspace();
        env.display.focus_window = w;
        env.keybindingManager.hotkeys.get('greenTile-swap-' + dir).cb();
    };
    const pushedLogs = () => env.logs.filter((l) => l.indexOf('greenTile swap') === 0);
    return { env, ext, app, win, press, pushedLogs };
};

test('a window on an untiled workspace travels through another untiled workspace onto a tiled one', () => {
    const f = setup([WIDE]);
    const a = f.win(1, [100, 100, 600, 400], 0);
    const b = f.win(2, [0, 0, 1500, 1000], 2);
    const c = f.win(3, [1500, 0, 1500, 1000], 2);
    f.app.ops.layoutSet(f.app, 0, 2, { auto: true });
    f.press('right', a);
    assert.equal(a.get_workspace().index(), 1, 'the window left the untiled workspace for the next one');
    assert.deepEqual(a.rect, [100, 100, 600, 400], 'on the untiled target it only moved, its size is kept');
    f.press('right', a);
    assert.equal(a.get_workspace().index(), 2, 'and went on to the tiled workspace');
    assert.deepEqual(a.rect, [0, 0, 1000, 1000], 'where it was slotted into the edge cell it came in through');
    assert.deepEqual([b.rect, c.rect], [[1000, 0, 1000, 1000], [2000, 0, 1000, 1000]], 'the residents moved over');
    assert.equal(f.pushedLogs().filter((l) => l.indexOf('greenTile swap pushed') === 0).length, 2);
});

test('the paused source keeps the sizes stored for its window counts', () => {
    const f = setup([WIDE]);
    const a = f.win(1, [0, 0, 1500, 1000], 0);
    f.win(2, [1500, 0, 1500, 1000], 0);
    const shapes = { 2: { kind: 'cols', shape: [1, 1] }, 1: { kind: 'cols', shape: [1] } };
    f.app.ops.layoutSet(f.app, 0, 0, { preset: 'p2', auto: false, shapes: shapes });
    const stored = () => {
        const layouts = JSON.parse(f.app.config.settings.getValue('layouts'));
        const ref = f.app.split.ref(f.app, 0, 0, 2);
        return layouts[ref.mkey][ref.wskey].shapes;
    };
    const before = JSON.stringify(stored());
    assert.ok(before.indexOf('"2"') >= 0, 'the stored shape for two windows is there');
    f.press('right', a);
    assert.equal(a.get_workspace().index(), 1, 'the window was pushed');
    assert.equal(JSON.stringify(stored()), before, 'the push did not forget the paused surface\'s stored sizes');
});

test('a paused surface sends a window away without rearranging what stays on it', () => {
    const f = setup([WIDE]);
    const a = f.win(1, [0, 0, 1500, 1000], 0);
    const b = f.win(2, [1500, 0, 1500, 1000], 0);
    const c = f.win(3, [0, 0, 3000, 1000], 1);
    const d = f.win(4, [500, 500, 300, 200], 1);
    f.app.ops.layoutSet(f.app, 0, 0, { preset: 'p2', auto: false }); // paused
    f.app.ops.layoutSet(f.app, 0, 1, { auto: true });
    f.app.ops.retileMonitor(f.app, 0, null, false, 1);
    f.press('right', b);
    assert.equal(b.get_workspace().index(), 1, 'the window left the paused surface');
    assert.deepEqual(a.rect, [0, 0, 1500, 1000], 'the window staying on the paused surface was not retiled');
    assert.equal(b.rect[0], 0, 'on the tiled target it took the left edge cell');
    assert.equal([b, c, d].map((w) => w.rect[2]).every((width) => width === 1000), true, 'the target is three columns');
});

test('the paused surface\'s own neighbours are not exchanged: the push goes straight along the chain', () => {
    const f = setup([WIDE]);
    const a = f.win(1, [0, 0, 1500, 1000], 0);
    const b = f.win(2, [1500, 0, 1500, 1000], 0);
    f.app.ops.layoutSet(f.app, 0, 0, { preset: 'p2', auto: false });
    f.press('right', a); // a has a right neighbour on the paused surface
    assert.equal(a.get_workspace().index(), 1, 'no local swap: the window went to the next workspace');
    assert.deepEqual(b.rect, [1500, 0, 1500, 1000], 'the neighbour kept its place');
    assert.deepEqual(a.rect, [0, 0, 1500, 1000], 'untiled target: move only');
});

test('an untiled monitor pushes onto the tiled monitor next to it', () => {
    const f = setup([LEFT_MON, RIGHT_MON], 1);
    const a = f.win(1, [100, 100, 600, 400], 0, 0);
    const b = f.win(2, [2200, 100, 500, 500], 0, 0);
    const keep = f.win(3, [300, 600, 400, 300], 0, 0);
    b.get_monitor = () => 1;
    f.app.ops.layoutSet(f.app, 1, 0, { auto: true });
    f.press('right', a);
    assert.equal(a.get_monitor(), 1, 'the window moved onto the tiled monitor');
    assert.deepEqual(keep.rect, [300, 600, 400, 300], 'the untiled source was not rearranged');
    assert.deepEqual(f.pushedLogs().filter((l) => l.indexOf('greenTile swap pushed') === 0).length, 1);
});

for (const dir of ['up', 'down']) {
    test('Up/Down stay no-ops on an untiled surface: ' + dir, () => {
        const f = setup([WIDE]);
        const a = f.win(1, [100, 100, 600, 400], 0);
        f.win(2, [100, 600, 600, 300], 0);
        f.press(dir, a);
        assert.equal(a.get_workspace().index(), 0);
        assert.deepEqual(a.rect, [100, 100, 600, 400]);
        assert.deepEqual(f.pushedLogs(), []);
    });
}

test('no wrap: an untiled window at the first workspace of the only monitor stays put on Left', () => {
    const f = setup([WIDE]);
    const a = f.win(1, [100, 100, 600, 400], 0);
    f.press('left', a);
    assert.equal(a.get_workspace().index(), 0);
    assert.deepEqual(f.pushedLogs(), []);
});

test('an excluded window is still not pushed from an untiled surface (line-90 guard kept)', () => {
    const f = setup([WIDE]);
    const a = f.win(1, [100, 100, 600, 400], 0);
    f.env.display.focus_window = a;
    f.app.excl.toggleFocused(f.app);
    f.press('right', a);
    assert.equal(a.get_workspace().index(), 0);
    assert.deepEqual(f.pushedLogs(), []);
});

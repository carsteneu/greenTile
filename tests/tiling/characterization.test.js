'use strict';
// Characterization tests for the tiling services, driven through the REAL
// extension.js (extension.js → lib/app) on the fake Cinnamon runtime: the
// extension is enabled and the behaviour is pinned at the surfaces a user
// reaches — hotkey callbacks, the Meta custom bindings and the App's ops
// facade. The file never imports lib internals, so it stays green across the
// composition-root move and pins exactly what the move must not change.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cinnamonLoad, load, ROOT } = require('../helpers/cinnamon-loader');
const { createCinnamonEnv } = require('../helpers/fakes/cinnamon-env');

const MONITOR = { x: 0, y: 0, width: 2000, height: 1100 };

// Recording fake Tweener: pins the animated placement (ANIMATE_MS and the
// offset parking) without touching the frozen fake env.
const makeTweenerRecorder = () => {
    const tweens = [];
    return {
        tweens,
        removeTweens() {},
        addTween(actor, params) {
            tweens.push(params);
        },
    };
};

const makeEnv = (tweener, extraSettings = {}) => {
    const env = createCinnamonEnv({ settingsDefaults: Object.assign({ tileAnimation: true }, extraSettings) });
    // test-local instance augmentations: push_tile (native push is not part of
    // the shared fake) and the MotionDirection names push-tile reads
    const pushes = [];
    env.display.push_tile = (window, dir) => pushes.push([window, dir]);
    env.gi.Meta.MotionDirection = { LEFT: 1, RIGHT: 2, UP: 3, DOWN: 4 };
    const imports = new Proxy(env.imports, {
        get(target, prop) {
            if (prop !== 'ui')
                {return target[prop];}
            const ui = target[prop];
            return new Proxy(ui, {
                get(u, p) {
                    if (p === 'tweener')
                        {return tweener;}
                    if (p === 'main') {
                        // no panels on the monitor: usableArea sees the
                        // full monitor rect
                        const main = u[p];
                        return new Proxy(main, {
                            get(m, mp) {
                                if (mp === 'panelManager')
                                    {return { getPanelsInMonitor: () => [] };}
                                return m[mp];
                            },
                        });
                    }
                    return u[p];
                },
            });
        },
    });
    globalThis.imports = imports;
    globalThis.global = env.global;
    const src = fs.readFileSync(path.join(ROOT, 'extension.js'), 'utf8');
    const ext = cinnamonLoad(src, load, 'extension.js');
    ext.init({ uuid: 'greenTile@carsteneu' });
    return { env, ext, pushes };
};

// Fake MetaWindow recording move_resize_frame / move_frame with enough signal
// hub surface for the auto/border observers that ride along.
const makeWindow = (env, seq, rect, monitor = 0, withActor = null) => {
    const handlers = [];
    let nextId = 1;
    const window = {
        seq,
        minimized: false,
        moves: [],
        rect: rect.slice(),
        connect(sig, cb) {
            const id = nextId++;
            handlers.push({ sig, cb, id });
            return id;
        },
        disconnect(id) {
            const at = handlers.findIndex((h) => h.id === id);
            if (at === -1)
                {throw new Error('window: no such handler ' + id);}
            handlers.splice(at, 1);
        },
        count(sig) {
            return handlers.filter((h) => !sig || h.sig === sig).length;
        },
        emit(sig, ...args) {
            for (const h of handlers.slice())
                {if (h.sig === sig)
                    {h.cb(...args);}}
        },
        get_stable_sequence: () => seq,
        get_window_type: () => 6,
        get_wm_class: () => 'FakeWindow',
        get_title: () => 'FakeWindow' + seq,
        get_monitor: () => monitor,
        get_workspace: () => env.activeWorkspace,
        is_on_all_workspaces: () => false,
        get_frame_rect: () => ({ x: window.rect[0], y: window.rect[1], width: window.rect[2], height: window.rect[3] }),
        get_compositor_private: () => withActor,
        move_resize_frame(anim, x, y, w, h) {
            window.moves.push(['resize', x, y, w, h]);
            window.rect = [x, y, w, h];
        },
        move_frame(anim, x, y) {
            window.moves.push(['move', x, y]);
            window.rect = [x, y, window.rect[2], window.rect[3]];
        },
        unmaximize() {},
        activate() {
            env.display.focus_window = window;
        },
        change_workspace_by_index() {},
        move_to_monitor() {},
    };
    return window;
};

const makeWorkspace = (env) => {
    const ws = { list_windows: () => env.tabList };
    env.workspaces.push(ws);
    return ws;
};

const settingsInstance = (env) => env.settingsInstances.at(-1);

// enable + one DisplayConfig flush; monitor 0 is the 2000x1100 work area.
const enableOnMonitor = (env, ext) => {
    env.layoutManager.monitors.push(MONITOR);
    ext.enable();
    env.flushDisplayConfigNoReply();
};

// ---------------- columns hotkey (appColumns) ----------------

test('auto-columns divides the usable area into 6 columns, reading order kept, gap flush at screen edges', () => {
    const tweener = makeTweenerRecorder();
    const { env, ext } = makeEnv(tweener);
    enableOnMonitor(env, ext);
    const w1 = makeWindow(env, 1, [10, 10, 400, 300]);
    const w2 = makeWindow(env, 2, [500, 0, 400, 300]);
    const w3 = makeWindow(env, 3, [900, 0, 400, 300]);
    env.tabList.push(w1, w2, w3);
    env.display.focus_window = w1;
    env.activeWorkspace = { index: () => 0 };
    env.keybindingManager.hotkeys.get('greenTile-auto6').cb();
    // left edge flush, every interior side inset by half of the 8 px gap
    assert.deepEqual(w1.moves[0], ['resize', 0, 0, 329, 1100]);
    assert.deepEqual(w2.moves[0], ['resize', 337, 0, 326, 1100]);
    assert.deepEqual(w3.moves[0], ['resize', 671, 0, 325, 1100]);
    for (const w of [w1, w2, w3])
        {assert.deepEqual(w.moves[1], ['move', w.moves[1][1], w.moves[1][2]], 'move_frame follows the resize at the final geometry');}
});

test('animated placement parks the compositor actor at the old rect with the old scale and tweens back over 250 ms', () => {
    const tweener = makeTweenerRecorder();
    const { env, ext } = makeEnv(tweener);
    enableOnMonitor(env, ext);
    const actor = { id: 'actor' };
    const w1 = makeWindow(env, 1, [10, 10, 400, 300], 0, actor);
    const w2 = makeWindow(env, 2, [500, 0, 400, 300]);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    env.activeWorkspace = { index: () => 0 };
    env.keybindingManager.hotkeys.get('greenTile-auto6').cb();
    assert.deepEqual(w1.moves[0], ['resize', 0, 0, 329, 1100]);
    // the offsets park the ACTOR at the old rect before the move; the tween
    // runs back to identity — its duration pins ANIMATE_MS
    assert.equal(actor.translation_x, 10 - 0);
    assert.equal(actor.translation_y, 10 - 0);
    assert.equal(actor.scale_x, 400 / 329);
    assert.equal(actor.scale_y, 300 / 1100);
    assert.deepEqual(tweener.tweens, [{
        translation_x: 0,
        translation_y: 0,
        scale_x: 1,
        scale_y: 1,
        time: 0.25,
        transition: 'easeOutQuad',
    }]);
});

// ---------------- automatic tiling (appAuto) ----------------

test('automatic tiling places focus plus collected windows into the uniform grid of the monitor', () => {
    const tweener = makeTweenerRecorder();
    const { env, ext } = makeEnv(tweener);
    enableOnMonitor(env, ext);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const app = ext.session.app;
    const ref = app.split.ref(app, 0, 0, 2);
    const layouts = { [ref.mkey]: { [ref.wskey]: { auto: true } } };
    settingsInstance(env).setValue('layouts', JSON.stringify(layouts));
    const w1 = makeWindow(env, 11, [10, 10, 400, 300]);
    const w2 = makeWindow(env, 12, [500, 0, 400, 300]);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    env.display.emit('window-created', w1);
    w1.emit('notify::minimized');
    const timer = [...env.timers.entries()].map(([, t]) => t).find((t) => t.ms === 300);
    assert.ok(timer, 'the auto observer armed the 300 ms debounce');
    timer.cb();
    assert.deepEqual(w1.rect, [0, 0, 996, 1100]);
    assert.deepEqual(w2.rect, [1004, 0, 996, 1100]);
});

// ---------------- fixes: fresh windows append at the end (issue 6) ----------------

// enable with the given monitor rects (indexes in push order)
const enableOnMonitors = (env, ext, monitors) => {
    for (const m of monitors) {
        env.layoutManager.monitors.push(m);
    }
    ext.enable();
    env.flushDisplayConfigNoReply();
};

// drive a fresh window through the real observer path: window-added -> pending -> 300 ms debounce
const addWindow = (env, app, w) => {
    app.auto.onWindowAdded(app, env.activeWorkspace, w);
    const timer = [...env.timers.entries()].map(([, t]) => t).find((t) => t.ms === 300);
    assert.ok(timer, 'the auto observer armed the 300 ms debounce');
    timer.cb();
};

test('preset retile appends a new window at the end regardless of its start position and consumes the pending record', () => {
    const tweener = makeTweenerRecorder();
    const { env, ext } = makeEnv(tweener, { windowGap: 0 });
    enableOnMonitor(env, ext);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const w1 = makeWindow(env, 21, [10, 10, 400, 300]);
    const w2 = makeWindow(env, 22, [500, 0, 400, 300]);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    const app = ext.session.app;
    app.ops.presetsWrite(app, [{ id: 'p1', name: 'Halves', rules: [{ min: 2, stacks: [1, 1] }] }]);
    app.ops.layoutSet(app, 0, 0, { preset: 'p1' });
    app.ops.retileMonitor(app, 0);
    assert.deepEqual(w1.rect, [0, 0, 1000, 1100]);
    assert.deepEqual(w2.rect, [1000, 0, 1000, 1100]);
    // the new window spawns inside w1's cell (top-left) — it must land at the END.
    // fillStacks([1,1], 3) extends the last column: shape [1,2].
    const w3 = makeWindow(env, 23, [10, 10, 400, 300]);
    env.tabList.push(w3);
    addWindow(env, app, w3);
    assert.deepEqual(w1.rect, [0, 0, 1000, 1100], 'w1 keeps the first cell');
    assert.deepEqual(w2.rect, [1000, 0, 1000, 550], 'w2 keeps its relative order');
    assert.deepEqual(w3.rect, [1000, 550, 1000, 550], 'w3 appended at the end');
    assert.equal(app.auto.pendingTake(0).size, 0, 'the consumed pending record is gone');
});

test('preset retile appends several new windows in opening order, whatever their spawn positions', () => {
    const tweener = makeTweenerRecorder();
    const { env, ext } = makeEnv(tweener, { windowGap: 0 });
    enableOnMonitor(env, ext);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const w1 = makeWindow(env, 21, [10, 10, 400, 300]);
    const w2 = makeWindow(env, 22, [500, 0, 400, 300]);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    const app = ext.session.app;
    app.ops.presetsWrite(app, [{ id: 'p4', name: 'Quarters', rules: [{ min: 2, stacks: [1, 1, 1, 1] }] }]);
    app.ops.layoutSet(app, 0, 0, { preset: 'p4' });
    app.ops.retileMonitor(app, 0);
    // below 4 windows the painted [1,1,1,1] drops columns from the right: [1,1]
    assert.deepEqual(w1.rect, [0, 0, 1000, 1100]);
    assert.deepEqual(w2.rect, [1000, 0, 1000, 1100]);
    // opened in this order: first the right-spawned, then the left-spawned window
    const w3 = makeWindow(env, 23, [1700, 10, 300, 200]);
    const w4 = makeWindow(env, 24, [10, 10, 300, 200]);
    env.tabList.push(w3, w4);
    addWindow(env, app, w3);
    addWindow(env, app, w4);
    assert.deepEqual(w1.rect, [0, 0, 500, 1100], 'w1 keeps the first cell');
    assert.deepEqual(w2.rect, [500, 0, 500, 1100], 'w2 keeps its relative order');
    assert.deepEqual(w3.rect, [1000, 0, 500, 1100], 'the first-opened fresh window is third');
    assert.deepEqual(w4.rect, [1500, 0, 500, 1100], 'the second-opened fresh window is last');
    assert.equal(app.auto.pendingTake(0).size, 0, 'no pending record stranded');
});

test('automatic grid appends fresh windows in opening order too and keeps the settled order', () => {
    const tweener = makeTweenerRecorder();
    const { env, ext } = makeEnv(tweener, { windowGap: 0 });
    enableOnMonitor(env, ext);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const w1 = makeWindow(env, 31, [10, 10, 400, 300]);
    const w2 = makeWindow(env, 32, [500, 0, 400, 300]);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    const app = ext.session.app;
    const ref = app.split.ref(app, 0, 0, 2);
    const layouts = { [ref.mkey]: { [ref.wskey]: { auto: true } } };
    settingsInstance(env).setValue('layouts', JSON.stringify(layouts));
    app.ops.retileMonitor(app, 0);
    assert.deepEqual(w1.rect, [0, 0, 1000, 1100]);
    assert.deepEqual(w2.rect, [1000, 0, 1000, 1100]);
    // opened right first, left second: the opening order wins over the positions.
    // Both additions ride ONE debounce: the retile sees both fresh windows together.
    const w3 = makeWindow(env, 33, [1700, 10, 300, 200]);
    const w4 = makeWindow(env, 34, [10, 10, 300, 200]);
    env.tabList.push(w3, w4);
    app.auto.onWindowAdded(app, env.activeWorkspace, w3);
    app.auto.onWindowAdded(app, env.activeWorkspace, w4);
    const timer = [...env.timers.entries()].map(([, t]) => t).find((t) => t.ms === 300);
    assert.ok(timer, 'the auto observer armed the 300 ms debounce');
    timer.cb();
    // the narrow auto grid for 4 windows is [1,1,2] (two full-height columns left)
    assert.deepEqual(w1.rect, [0, 0, 667, 1100], 'settled windows fill the first column');
    assert.deepEqual(w2.rect, [667, 0, 666, 1100], 'settled relative order kept');
    assert.deepEqual(w3.rect, [1333, 0, 667, 550], 'first-opened fresh window next');
    assert.deepEqual(w4.rect, [1333, 550, 667, 550], 'last-opened fresh window last');
    assert.equal(app.auto.pendingTake(0).size, 0, 'no pending record stranded');
});

test('a fresh window on another monitor appends at that monitor\'s end without touching the first', () => {
    const tweener = makeTweenerRecorder();
    const { env, ext } = makeEnv(tweener, { windowGap: 0 });
    const mon2 = { x: 2000, y: 0, width: 1000, height: 1100 };
    enableOnMonitors(env, ext, [MONITOR, mon2]);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const w1 = makeWindow(env, 41, [10, 10, 400, 300], 0);
    const w2 = makeWindow(env, 42, [1000, 0, 400, 300], 0);
    const w3 = makeWindow(env, 43, [2000 + 10, 10, 400, 300], 1);
    const w4 = makeWindow(env, 44, [2000 + 500, 0, 400, 300], 1);
    env.tabList.push(w1, w2, w3, w4);
    env.display.focus_window = w1;
    const app = ext.session.app;
    app.ops.presetsWrite(app, [{ id: 'p1', name: 'Halves', rules: [{ min: 2, stacks: [1, 1] }] }]);
    app.ops.layoutSet(app, 0, 0, { preset: 'p1' });
    app.ops.layoutSet(app, 1, 0, { preset: 'p1' });
    app.ops.retileMonitor(app, 0);
    app.ops.retileMonitor(app, 1);
    assert.deepEqual(w1.rect, [0, 0, 1000, 1100]);
    assert.deepEqual(w2.rect, [1000, 0, 1000, 1100]);
    assert.deepEqual(w3.rect, [2000, 0, 500, 1100]);
    assert.deepEqual(w4.rect, [2500, 0, 500, 1100]);
    // new window spawns on monitor 1 inside w3's half
    const w5 = makeWindow(env, 45, [2000 + 10, 10, 300, 200], 1);
    env.tabList.push(w5);
    addWindow(env, app, w5);
    assert.deepEqual(w1.rect, [0, 0, 1000, 1100], 'monitor 0 untouched');
    assert.deepEqual(w2.rect, [1000, 0, 1000, 1100], 'monitor 0 keeps its split');
    // fillStacks([1,1], 3) extends the last column: [1,2] on monitor 1
    assert.deepEqual(w3.rect, [2000, 0, 500, 1100], 'w3 keeps the first cell of monitor 1');
    assert.deepEqual(w4.rect, [2500, 0, 500, 550], 'w4 keeps its relative order');
    assert.deepEqual(w5.rect, [2500, 550, 500, 550], 'w5 appended at the end of monitor 1');
    assert.equal(app.auto.pendingTake(0).size, 0, 'monitor 0 pending untouched');
    assert.equal(app.auto.pendingTake(1).size, 0, 'monitor 1 pending consumed');
});

// ---------------- fixes: preset save retiles every active monitor-workspace (issue 7) ----------------

// drive the real editor: open the draft, apply the changed rules, click Save
const savePresetWithRules = (ext, presetId, rules) => {
    const { editorOpen, editorBody } = load('./lib/ui/editor.js');
    const app = ext.session.app;
    editorOpen(app, app.ops.presetsRead(app).find((p) => p.id === presetId));
    app.panel.draft.rules = rules;
    const body = editorBody(app);
    const findSave = (actor) => {
        for (const child of actor.children || []) {
            if (child.style_class === 'gk-save') {
                return child;
            }
            const found = findSave(child);
            if (found) {
                return found;
            }
        }
        return null;
    };
    const save = findSave(body.actor);
    assert.ok(save, 'the editor body exposes the save button');
    save.emit('clicked');
};

const appliedLogs = (env, name) => env.logs.filter((l) => l.indexOf('greenTile preset "' + name + '" applied') === 0);

test('saving a shared preset retiles every monitor-workspace where it is active, not just the focused one', () => {
    const tweener = makeTweenerRecorder();
    const { env, ext } = makeEnv(tweener, { windowGap: 0 });
    const mon2 = { x: 2000, y: 0, width: 1000, height: 1100 };
    enableOnMonitors(env, ext, [MONITOR, mon2]);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const w1 = makeWindow(env, 51, [10, 10, 400, 300], 0);
    const w2 = makeWindow(env, 52, [500, 0, 400, 300], 0);
    const w3 = makeWindow(env, 53, [2000 + 10, 10, 300, 300], 1);
    const w4 = makeWindow(env, 54, [2000 + 340, 0, 300, 300], 1);
    const w5 = makeWindow(env, 55, [2000 + 670, 0, 300, 300], 1);
    env.tabList.push(w1, w2, w3, w4, w5);
    env.display.focus_window = w1;
    const app = ext.session.app;
    app.ops.presetsWrite(app, [{ id: 'p1', name: 'Halves', rules: [{ min: 2, stacks: [1, 1] }] }]);
    app.ops.layoutSet(app, 0, 0, { preset: 'p1' });
    app.ops.layoutSet(app, 1, 0, { preset: 'p1' });
    app.ops.retileMonitor(app, 0);
    app.ops.retileMonitor(app, 1);
    assert.equal(appliedLogs(env, 'Halves').length, 2, 'both monitors applied the preset once');
    assert.deepEqual(w3.rect, [2000, 0, 500, 1100]);
    // save a 3-column rule: both monitor-workspaces adopt it immediately
    const before = appliedLogs(env, 'Halves').length;
    savePresetWithRules(ext, 'p1', [{ min: 2, stacks: [1, 1] }, { min: 3, stacks: [1, 1, 1] }]);
    const after = appliedLogs(env, 'Halves').slice(before);
    assert.equal(after.length, 2, 'both monitors retiled on the save');
    assert.equal(after.filter((l) => l.indexOf('FakeMonitor-0') !== -1).length, 1,
        'the focused monitor retiled');
    assert.equal(after.filter((l) => l.indexOf('FakeMonitor-1') !== -1).length, 1,
        'the unfocused monitor retiled too');
    // monitor 1 (n=3) picked the new min-3 rule and spreads three columns
    assert.deepEqual(w3.rect, [2000, 0, 333, 1100], 'monitor 1 adopted the new rule');
    assert.deepEqual(w4.rect, [2333, 0, 334, 1100]);
    assert.deepEqual(w5.rect, [2667, 0, 333, 1100]);
    assert.deepEqual(w1.rect, [0, 0, 1000, 1100], 'monitor 0 keeps the min-2 halves');
});

test('a paused focused monitor does not block the save on other active monitor-workspaces', () => {
    const tweener = makeTweenerRecorder();
    const { env, ext } = makeEnv(tweener, { windowGap: 0 });
    const mon2 = { x: 2000, y: 0, width: 1000, height: 1100 };
    enableOnMonitors(env, ext, [MONITOR, mon2]);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const w1 = makeWindow(env, 51, [10, 10, 400, 300], 0);
    const w2 = makeWindow(env, 52, [500, 0, 400, 300], 0);
    const w3 = makeWindow(env, 53, [2000 + 10, 10, 300, 300], 1);
    const w4 = makeWindow(env, 54, [2000 + 340, 0, 300, 300], 1);
    const w5 = makeWindow(env, 55, [2000 + 670, 0, 300, 300], 1);
    env.tabList.push(w1, w2, w3, w4, w5);
    env.display.focus_window = w1;
    const app = ext.session.app;
    app.ops.presetsWrite(app, [{ id: 'p1', name: 'Halves', rules: [{ min: 2, stacks: [1, 1] }] }]);
    app.ops.layoutSet(app, 0, 0, { preset: 'p1' });
    app.ops.layoutSet(app, 1, 0, { preset: 'p1' });
    app.ops.retileMonitor(app, 0);
    app.ops.retileMonitor(app, 1);
    // Super+Ctrl+D pauses monitor 0 (the focused one)
    app.ops.layoutSet(app, 0, 0, { auto: false });
    const before = appliedLogs(env, 'Halves').length;
    savePresetWithRules(ext, 'p1', [{ min: 2, stacks: [1, 1] }, { min: 3, stacks: [1, 1, 1] }]);
    const after = appliedLogs(env, 'Halves').slice(before);
    assert.equal(after.length, 1, 'only the active monitor retiled after the save');
    assert.equal(after.filter((l) => l.indexOf('FakeMonitor-0') !== -1).length, 0,
        'the paused monitor stayed untouched');
    assert.equal(after.filter((l) => l.indexOf('FakeMonitor-1') !== -1).length, 1,
        'the active monitor retiled although focus sits on the paused one');
    assert.deepEqual(w1.rect, [0, 0, 1000, 1100], 'paused monitor 0 keeps its tiling');
    assert.deepEqual(w3.rect, [2000, 0, 333, 1100], 'monitor 1 adopted the new rule');
});

// ---------------- fixes: minimum size on the final frame incl. gap (issue 8) ----------------

const pressResize = (env, action, times) => {
    const cb = env.keybindingManager.hotkeys.get('greenTile-resize-' + action).cb;
    for (let i = 0; i < times; i++) {
        cb();
    }
};

test('keyboard resize clamps the border so the final frames stay at the minimum (gap 48)', () => {
    const tweener = makeTweenerRecorder();
    const { env, ext } = makeEnv(tweener, { windowGap: 48 });
    enableOnMonitor(env, ext);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const w1 = makeWindow(env, 61, [10, 10, 400, 300]);
    const w2 = makeWindow(env, 62, [500, 0, 400, 300]);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    const app = ext.session.app;
    const ref = app.split.ref(app, 0, 0, 2);
    const layouts = { [ref.mkey]: { [ref.wskey]: { auto: true } } };
    settingsInstance(env).setValue('layouts', JSON.stringify(layouts));
    app.ops.retileMonitor(app, 0);
    assert.deepEqual(w1.rect, [0, 0, 976, 1100]);
    // narrow w1 down to the clamp: the border stops where the FINAL frame (cell minus
    // gap share) still keeps the promised 120 px — cell >= 120 + 48
    pressResize(env, 'narrower', 100);
    assert.ok(w1.rect[2] >= 120, 'left window final width ' + w1.rect[2] + ' below the minimum');
    assert.ok(w2.rect[2] >= 120, 'right window final width ' + w2.rect[2] + ' below the minimum');
    assert.equal(w1.rect[2], 144, 'the clamp sits exactly one gap share above 120');
    assert.equal(w1.rect[0], 0, 'the screen edge stays flush');
});

test('vertical keyboard resize clamps the final frame between two borders (inner cell, gap 48)', () => {
    const tweener = makeTweenerRecorder();
    const { env, ext } = makeEnv(tweener, { windowGap: 48 });
    enableOnMonitor(env, ext);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const wins = [61, 62, 63, 64, 65, 66].map((seq, i) => makeWindow(env, seq, [i * 500 + 10, 10, 400, 300]));
    env.tabList.push(...wins);
    env.display.focus_window = wins[1];
    const app = ext.session.app;
    app.ops.presetsWrite(app, [{ id: 'p23', name: 'Stacks', rules: [{ min: 6, stacks: [2, 3] }] }]);
    app.ops.layoutSet(app, 0, 0, { preset: 'p23' });
    app.ops.retileMonitor(app, 0);
    assert.ok(wins[0].rect[0] === 0 && wins[0].rect[2] === 976, 'two full-height columns, gap applied');
    // narrow the middle cell of the 3-stack: it borders above and below, so the
    // clamp must keep its FINAL height (cell minus a full gap) at 120 px
    pressResize(env, 'shorter', 100);
    for (const w of wins) {
        assert.ok(w.rect[3] >= 120, 'window final height ' + w.rect[3] + ' below the minimum');
    }
});

test('mouse resize clamps the stored border so both final frames stay at the minimum (gap 48)', () => {
    const tweener = makeTweenerRecorder();
    const { env, ext } = makeEnv(tweener, { windowGap: 48 });
    enableOnMonitor(env, ext);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const w1 = makeWindow(env, 61, [10, 10, 400, 300]);
    const w2 = makeWindow(env, 62, [500, 0, 400, 300]);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    const app = ext.session.app;
    const ref = app.split.ref(app, 0, 0, 2);
    const layouts = { [ref.mkey]: { [ref.wskey]: { auto: true } } };
    settingsInstance(env).setValue('layouts', JSON.stringify(layouts));
    app.ops.retileMonitor(app, 0);
    // drag w1's right edge far left of the minimum and release
    env.display.emit('grab-op-begin', env.display, env.display, w1, env.gi.Meta.GrabOp.RESIZING_E);
    w1.rect = [0, 0, 50, 1100];
    env.display.emit('grab-op-end', env.display, env.display, w1, env.gi.Meta.GrabOp.RESIZING_E);
    const timer = [...env.timers.entries()].map(([, t]) => t).find((t) => t.ms === 250);
    assert.ok(timer, 'the resize end armed the retile');
    timer.cb();
    assert.ok(w1.rect[2] >= 120, 'left window final width ' + w1.rect[2] + ' below the minimum');
    assert.ok(w2.rect[2] >= 120, 'right window final width ' + w2.rect[2] + ' below the minimum');
    assert.equal(w1.rect[2], 144, 'the stored border sits exactly one gap share above 120');
});

test('infeasible space: a resize just stops instead of storing an undersized arrangement', () => {
    const tweener = makeTweenerRecorder();
    const { env, ext } = makeEnv(tweener, { windowGap: 48 });
    const mon2 = { x: 2000, y: 0, width: 300, height: 1100 };
    enableOnMonitors(env, ext, [MONITOR, mon2]);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const w1 = makeWindow(env, 61, [10, 10, 400, 300], 0);
    const w2 = makeWindow(env, 62, [2000 + 10, 10, 100, 300], 1);
    const w3 = makeWindow(env, 63, [2000 + 150, 0, 100, 300], 1);
    env.tabList.push(w1, w2, w3);
    env.display.focus_window = w2;
    const app = ext.session.app;
    const ref = app.split.ref(app, 1, 0, 2);
    const layouts = { [ref.mkey]: { [ref.wskey]: { auto: true } } };
    settingsInstance(env).setValue('layouts', JSON.stringify(layouts));
    app.ops.retileMonitor(app, 0);
    app.ops.retileMonitor(app, 1);
    const before = w2.rect.slice();
    // 300 px cannot host two cells of 120 + 48: the splitMove returns null and the
    // hotkey must leave the layout alone (no split write, no flush timer)
    pressResize(env, 'narrower', 3);
    assert.equal(app.split.for(app, 1, 0, 2, { kind: 'rows', shape: [2] }), null, 'no split stored for the infeasible space');
    assert.equal(env.liveTimers().filter((t) => t.ms === 500).length, 0, 'no flush timer armed');
    assert.deepEqual(w2.rect, before, 'no retile fired');
    assert.deepEqual(env.logErrors, [], 'no errors');
});

test('saving a shared preset retiles each monitor\'s ACTIVE workspace only; inactive ones adopt on switch', () => {
    const tweener = makeTweenerRecorder();
    const { env, ext } = makeEnv(tweener, { windowGap: 0 });
    enableOnMonitor(env, ext);
    makeWorkspace(env);
    const ws1wins = [];
    makeWorkspace(env).list_windows = () => ws1wins;
    env.activeWorkspace = { index: () => 0 };
    const w1 = makeWindow(env, 51, [10, 10, 400, 300], 0);
    const w2 = makeWindow(env, 52, [500, 0, 400, 300], 0);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    const app = ext.session.app;
    app.ops.presetsWrite(app, [{ id: 'p1', name: 'Halves', rules: [{ min: 2, stacks: [1, 1] }] }]);
    app.ops.layoutSet(app, 0, 0, { preset: 'p1' });
    app.ops.layoutSet(app, 0, 1, { preset: 'p1' });
    app.ops.retileMonitor(app, 0);
    assert.deepEqual(w1.rect, [0, 0, 1000, 1100]);
    // two windows sitting on the inactive workspace 1, assigned the same preset
    const w3 = makeWindow(env, 53, [10, 10, 300, 200], 0);
    const w4 = makeWindow(env, 54, [400, 0, 300, 200], 0);
    ws1wins.push(w3, w4);
    // save a one-stack-of-two rule: the active workspace adopts it immediately
    const before = appliedLogs(env, 'Halves').length;
    savePresetWithRules(ext, 'p1', [{ min: 2, stacks: [2] }]);
    assert.equal(appliedLogs(env, 'Halves').slice(before).length, 1, 'exactly the active workspace retiled');
    assert.deepEqual(w1.rect, [0, 0, 2000, 550], 'active workspace stacked');
    assert.deepEqual(w2.rect, [0, 550, 2000, 550]);
    assert.deepEqual(w3.rect, [10, 10, 300, 200], 'inactive workspace untouched by the save');
    assert.deepEqual(w4.rect, [400, 0, 300, 200]);
    // adopting happens on the next retile of that workspace after switching
    env.activeWorkspace = { index: () => 1 };
    app.ops.retileMonitor(app, 0, null, false, 1);
    assert.deepEqual(w3.rect, [0, 0, 2000, 550], 'inactive workspace adopted the rule on switch');
    assert.deepEqual(w4.rect, [0, 550, 2000, 550]);
});

test('retiles of inactive workspaces leave the pending records for the active workspace', () => {
    const tweener = makeTweenerRecorder();
    const { env, ext } = makeEnv(tweener, { windowGap: 0 });
    enableOnMonitor(env, ext);
    makeWorkspace(env);
    const ws1wins = [];
    makeWorkspace(env).list_windows = () => ws1wins;
    env.activeWorkspace = { index: () => 0 };
    const w1 = makeWindow(env, 71, [10, 10, 400, 300], 0);
    const w2 = makeWindow(env, 72, [500, 0, 400, 300], 0);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    const app = ext.session.app;
    app.ops.presetsWrite(app, [{ id: 'p1', name: 'Halves', rules: [{ min: 2, stacks: [1, 1] }] }]);
    app.ops.layoutSet(app, 0, 0, { preset: 'p1' });
    app.ops.layoutSet(app, 0, 1, { preset: 'p1' });
    app.ops.retileMonitor(app, 0);
    // a fresh window opens on the ACTIVE workspace: the debounce has not fired yet
    const fresh = makeWindow(env, 73, [10, 10, 300, 200], 0);
    env.tabList.push(fresh);
    app.auto.onWindowAdded(app, env.workspaceManager.get_active_workspace(), fresh);
    // an unrelated retile of the inactive workspace 1 must not consume the record
    const w3 = makeWindow(env, 74, [10, 10, 300, 200], 0);
    const w4 = makeWindow(env, 74, [400, 0, 300, 200], 0);
    ws1wins.push(w3, w4);
    app.ops.retileMonitor(app, 0, null, false, 1);
    assert.equal(app.auto.pendingTake(0).size, 1, 'the pending record survived the inactive retile');
});

test('a focused fresh window appends last too (panel preset row click, swap)', () => {
    const tweener = makeTweenerRecorder();
    const { env, ext } = makeEnv(tweener, { windowGap: 0 });
    enableOnMonitor(env, ext);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const w1 = makeWindow(env, 81, [10, 10, 400, 300]);
    const w2 = makeWindow(env, 82, [500, 0, 400, 300]);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    const app = ext.session.app;
    app.ops.presetsWrite(app, [{ id: 'p1', name: 'Halves', rules: [{ min: 2, stacks: [1, 1] }] }]);
    app.ops.layoutSet(app, 0, 0, { preset: 'p1' });
    app.ops.retileMonitor(app, 0);
    assert.deepEqual(w1.rect, [0, 0, 1000, 1100]);
    // the fresh window keeps focus (like a preset row click right after opening):
    // fillStacks([1,1], 3) is [1,2] — the fresh window ends up in the LAST stack
    const fresh = makeWindow(env, 73, [10, 10, 400, 300]);
    env.tabList.push(fresh);
    app.auto.onWindowAdded(app, env.workspaceManager.get_active_workspace(), fresh);
    env.display.focus_window = fresh;
    app.ops.retileMonitor(app, 0, fresh);
    assert.deepEqual(w1.rect, [0, 0, 1000, 1100], 'settled window keeps the first cell');
    assert.deepEqual(w2.rect, [1000, 0, 1000, 550], 'second settled window follows in reading order');
    assert.deepEqual(fresh.rect, [1000, 550, 1000, 550], 'the focused fresh window appends last');
    assert.equal(app.auto.pendingTake(0).size, 0, 'pending consumed');
});

test('PINNED GAP (todo_fixes follow-up): a legacy narrow stored split + later gap increase still renders final frames below the minimum', () => {
    const tweener = makeTweenerRecorder();
    const { env, ext } = makeEnv(tweener, { windowGap: 0 });
    enableOnMonitor(env, ext);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const w1 = makeWindow(env, 91, [10, 10, 400, 300]);
    const w2 = makeWindow(env, 92, [500, 0, 400, 300]);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    const app = ext.session.app;
    const ref = app.split.ref(app, 0, 0, 2);
    const layouts = { [ref.mkey]: { [ref.wskey]: { auto: true } } };
    settingsInstance(env).setValue('layouts', JSON.stringify(layouts));
    app.ops.retileMonitor(app, 0);
    // narrow the border to the gap-0 clamp: the stored cell is 120 px
    pressResize(env, 'narrower', 200);
    assert.equal(w1.rect[2], 120, 'the border sits at the gap-0 clamp');
    // the user raises the gap afterwards: borders are stored at the OLD semantics
    // (cell 120 incl. gap), so placement now yields frames below the promised
    // minimum. Not fixed in this round — the bounded correction is a read-time
    // border clamp in split.for (see the review report), which needs area context
    // threaded through the split facade and a decision on infeasible spans.
    settingsInstance(env).setValue('windowGap', 48);
    app.ops.retileMonitor(app, 0);
    assert.equal(w1.rect[2], 96, 'pinned: the edge frame keeps only half a gap share, 96 px not 120');
});

// ---------------- fixes: pause blocks every retile action (issue 4) ----------------

// enable + 2 windows + preset p1 tiled + paused with Super+Ctrl+D
const enableTiledPaused = (env, ext) => {
    enableOnMonitor(env, ext);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const w1 = makeWindow(env, 101, [10, 10, 400, 300], 0);
    const w2 = makeWindow(env, 102, [500, 0, 400, 300], 0);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    const app = ext.session.app;
    app.ops.presetsWrite(app, [{ id: 'p1', name: 'Halves', rules: [{ min: 2, stacks: [1, 1] }] }]);
    app.ops.layoutSet(app, 0, 0, { preset: 'p1' });
    app.ops.retileMonitor(app, 0);
    app.ops.layoutSet(app, 0, 0, { auto: false });
    return { app, w1, w2 };
};

test('a paused monitor-workspace accepts no retile until reactivation', () => {
    const tweener = makeTweenerRecorder();
    const { env, ext } = makeEnv(tweener, { windowGap: 0 });
    const { app, w1, w2 } = enableTiledPaused(env, ext);
    const before = appliedLogs(env, 'Halves').length;
    assert.deepEqual([w1.rect, w2.rect], [[0, 0, 1000, 1100], [1000, 0, 1000, 1100]]);
    // debounced window-added retiles, manual retileMonitor calls, exclRetile: all skip
    app.ops.retileMonitor(app, 0);
    assert.equal(appliedLogs(env, 'Halves').length, before, 'no retile while paused');
    assert.deepEqual(w1.rect, [0, 0, 1000, 1100], 'paused windows stay put');
});

test('a paused surface: Super+G persists the exclusion flag without rearranging', () => {
    const tweener = makeTweenerRecorder();
    const { env, ext } = makeEnv(tweener, { windowGap: 0 });
    const { app, w2 } = enableTiledPaused(env, ext);
    env.display.focus_window = w2;
    const before = appliedLogs(env, 'Halves').length;
    app.excl.toggleFocused(app);
    assert.equal(app.excl.isExcluded(w2), true, 'the exclusion flag state stays correct');
    assert.equal(appliedLogs(env, 'Halves').length, before, 'no rearrangement while paused');
});

test('a paused surface: swap hotkey must not rearrange and dnd must not snap', () => {
    const tweener = makeTweenerRecorder();
    const { env, ext } = makeEnv(tweener, { windowGap: 0 });
    const { app, w1, w2 } = enableTiledPaused(env, ext);
    const rects = [w1.rect.slice(), w2.rect.slice()];
    env.display.focus_window = w1;
    env.keybindingManager.hotkeys.get('greenTile-swap-right').cb();
    assert.deepEqual([w1.rect, w2.rect], rects, 'swap did not exchange the cells');
    assert.equal(env.logs.some((l) => l.indexOf('greenTile swap right ws1') === 0), false, 'no swap log');
    // dnd: no preview while paused, and the free drag position survives the drop
    env.display.focus_window = w1;
    app.drop.begin(app, w2, env.gi.Meta.GrabOp.MOVING);
    assert.equal(env.uiGroupChildren.length, 0, 'no drop preview on a paused surface');
    w2.rect = [300, 300, 400, 300];
    app.drop.end(app, w2, env.gi.Meta.GrabOp.MOVING);
    assert.deepEqual(w2.rect, [300, 300, 400, 300], 'the drop left the window at the free position');
    assert.deepEqual(w1.rect, rects[0], 'the paused tiling is untouched by the drop');
});

test('a paused auto-grid surface behaves like a paused preset surface (no preview, no snap)', () => {
    const tweener = makeTweenerRecorder();
    const { env, ext } = makeEnv(tweener, { windowGap: 0 });
    enableOnMonitor(env, ext);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const w1 = makeWindow(env, 111, [10, 10, 400, 300], 0);
    const w2 = makeWindow(env, 112, [500, 0, 400, 300], 0);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    const app = ext.session.app;
    const ref = app.split.ref(app, 0, 0, 2);
    settingsInstance(env).setValue('layouts', JSON.stringify({ [ref.mkey]: { [ref.wskey]: { auto: true } } }));
    app.ops.retileMonitor(app, 0);
    app.ops.layoutSet(app, 0, 0, { auto: false });
    env.display.focus_window = w1;
    app.drop.begin(app, w2, env.gi.Meta.GrabOp.MOVING);
    assert.equal(env.uiGroupChildren.length, 0, 'no drop preview on a paused auto grid');
    w2.rect = [300, 300, 400, 300];
    app.drop.end(app, w2, env.gi.Meta.GrabOp.MOVING);
    assert.deepEqual(w2.rect, [300, 300, 400, 300], 'the drop left the window at the free position');
});

test('explicit reactivation retiles again (Super+Ctrl+A first, then the retile)', () => {
    const tweener = makeTweenerRecorder();
    const { env, ext } = makeEnv(tweener, { windowGap: 0 });
    const { app, w1, w2 } = enableTiledPaused(env, ext);
    const before = appliedLogs(env, 'Halves').length;
    env.display.focus_window = w1;
    app.auto.activate(app);
    assert.equal(app.ops.layoutFor(app, 0, 0).auto, true, 'activation switched auto back on');
    assert.equal(appliedLogs(env, 'Halves').length, before + 1, 'the reactivated surface retiled');
    assert.deepEqual(w1.rect, [0, 0, 1000, 1100], 'the preset tiles again');
    assert.deepEqual(w2.rect, [1000, 0, 1000, 1100]);
    // the panel preset row click path (assign + auto on + retile) also still retiles
    app.ops.layoutSet(app, 0, 0, { auto: false });
    app.ops.layoutSet(app, 0, 0, { preset: 'p1', auto: true });
    app.ops.retileMonitor(app, 0);
    assert.equal(appliedLogs(env, 'Halves').length, before + 2, 'assigning a preset retiles again');
});

// ---------------- presets + layouts through the ops facade ----------------

test('preset writing, layout assignment and monitor retile round-trip through the ops facade', () => {
    const tweener = makeTweenerRecorder();
    const { env, ext } = makeEnv(tweener);
    enableOnMonitor(env, ext);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const w1 = makeWindow(env, 21, [10, 10, 400, 300]);
    const w2 = makeWindow(env, 22, [500, 0, 400, 300]);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    const app = ext.session.app;
    app.ops.presetsWrite(app, [{ id: 'p1', name: 'Halves', rules: [{ min: 2, stacks: [1, 1] }] }]);
    assert.equal(settingsInstance(env).callLog.filter((c) => c.op === 'setValue' && c.key === 'presets').length, 1,
        'the preset list is written into the settings');
    assert.deepEqual(app.ops.presetsRead(app), [{ id: 'p1', name: 'Halves', rules: [{ min: 2, stacks: [1, 1] }] }]);
    app.ops.layoutSet(app, 0, 0, { preset: 'p1' });
    const layout = app.ops.layoutFor(app, 0, 0);
    assert.equal(layout.preset.id, 'p1');
    assert.equal(layout.auto, true, 'a preset assignment implies active tiling');
    app.ops.retileMonitor(app, 0);
    assert.deepEqual(w1.rect, [0, 0, 996, 1100]);
    assert.deepEqual(w2.rect, [1004, 0, 996, 1100]);
    assert.equal(env.logs.filter((l) => l.indexOf('greenTile preset "Halves" applied ws1') === 0).length, 1,
        'the applied preset is logged');
});

// ---------------- swap hotkeys ----------------

test('swap-right exchanges the cells of the two tiled windows and keeps the log line', () => {
    const tweener = makeTweenerRecorder();
    const { env, ext } = makeEnv(tweener);
    enableOnMonitor(env, ext);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const w1 = makeWindow(env, 31, [10, 10, 400, 300]);
    const w2 = makeWindow(env, 32, [500, 0, 400, 300]);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    const app = ext.session.app;
    app.ops.presetsWrite(app, [{ id: 'p1', name: 'Halves', rules: [{ min: 2, stacks: [1, 1] }] }]);
    app.ops.layoutSet(app, 0, 0, { preset: 'p1' });
    app.ops.retileMonitor(app, 0);
    assert.deepEqual(w1.rect, [0, 0, 996, 1100]);
    assert.deepEqual(w2.rect, [1004, 0, 996, 1100]);
    env.display.focus_window = w1;
    env.keybindingManager.hotkeys.get('greenTile-swap-right').cb();
    assert.deepEqual(w1.rect, [1004, 0, 996, 1100], 'w1 moved into the right cell');
    assert.deepEqual(w2.rect, [0, 0, 996, 1100], 'w2 moved into the left cell');
    assert.equal(env.logs.filter((l) => l.indexOf('greenTile swap right ws1 mon=') === 0).length, 1);
});

// ---------------- focus push (Super+Arrow) ----------------

test('push-tile with no tiling on the monitor falls back to the native push_tile', () => {
    const tweener = makeTweenerRecorder();
    const { env, ext, pushes } = makeEnv(tweener);
    enableOnMonitor(env, ext);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const w1 = makeWindow(env, 41, [10, 10, 400, 300]);
    env.tabList.push(w1);
    env.display.focus_window = w1;
    env.customBindings.get('push-tile-right')(env.display, w1);
    assert.deepEqual(pushes, [[w1, env.gi.Meta.MotionDirection.RIGHT]], 'native push with the mapped motion direction');
    assert.equal(env.display.focus_window, w1, 'focus unchanged by the native fallback');
});

test('push-tile inside the active layout activates the neighbour cell and never reaches push_tile', () => {
    const tweener = makeTweenerRecorder();
    const { env, ext, pushes } = makeEnv(tweener);
    enableOnMonitor(env, ext);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const w1 = makeWindow(env, 51, [10, 10, 400, 300]);
    const w2 = makeWindow(env, 52, [500, 0, 400, 300]);
    env.tabList.push(w1, w2);
    const app = ext.session.app;
    app.ops.presetsWrite(app, [{ id: 'p1', name: 'Halves', rules: [{ min: 2, stacks: [1, 1] }] }]);
    app.ops.layoutSet(app, 0, 0, { preset: 'p1' });
    env.display.focus_window = w1;
    app.ops.retileMonitor(app, 0);
    env.display.focus_window = w1;
    env.customBindings.get('push-tile-right')(env.display, w1);
    assert.equal(env.display.focus_window, w2, 'the right-hand neighbour gained focus');
    assert.deepEqual(w2.rect, [1004, 0, 996, 1100], 'the neighbour sits in its cell');
    assert.deepEqual(pushes, [], 'no native push inside the layout');
});

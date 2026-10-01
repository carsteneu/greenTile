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
                return target[prop];
            const ui = target[prop];
            return new Proxy(ui, {
                get(u, p) {
                    if (p === 'tweener')
                        return tweener;
                    if (p === 'main') {
                        // no panels on the monitor: usableArea sees the
                        // full monitor rect
                        const main = u[p];
                        return new Proxy(main, {
                            get(m, mp) {
                                if (mp === 'panelManager')
                                    return { getPanelsInMonitor: () => [] };
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
                throw new Error('window: no such handler ' + id);
            handlers.splice(at, 1);
        },
        count(sig) {
            return handlers.filter((h) => !sig || h.sig === sig).length;
        },
        emit(sig, ...args) {
            for (const h of handlers.slice())
                if (h.sig === sig)
                    h.cb(...args);
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
        assert.deepEqual(w.moves[1], ['move', w.moves[1][1], w.moves[1][2]], 'move_frame follows the resize at the final geometry');
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

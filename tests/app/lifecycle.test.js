'use strict';
// Lifecycle baseline: runs the REAL extension.js (extension.js → lib/app) the
// way Cinnamon loads it — member-style init/enable/disable calls on the
// exports object — through init/enable, a monitors-changed emission (App
// recreation inside the same "session") and disable — against the fake
// Cinnamon runtime in tests/fakes/cinnamon-env.js. It measures the balance
// after disable: connected handlers, live timers, registered greenTile hotkeys,
// Meta custom bindings and settings finalization.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cinnamonLoad, load, ROOT } = require('../helpers/cinnamon-loader');
const { createCinnamonEnv } = require('../helpers/fakes/cinnamon-env');

const loadExtension = () => {
    // process-local by design: node:test runs each test file in its own child
    // process, and build-release.sh ships tests/ never — the fake globals
    // cannot reach the desktop or shipped code
    const env = createCinnamonEnv();
    globalThis.imports = env.imports;
    globalThis.global = env.global;
    const src = fs.readFileSync(path.join(ROOT, 'extension.js'), 'utf8');
    const ext = cinnamonLoad(src, load, 'extension.js');
    // production lifecycle runs init(metadata) before enable(), as member calls
    ext.init({ uuid: 'greenTile@carsteneu' });
    return { env, ext };
};

const HOTKEY_NAMES = [
    'greenTile-auto6', 'greenTile-auto3', 'greenTile-autoN', 'greenTile-autoOff',
    'greenTile-preset', 'greenTile-exclude',
    'greenTile-resize-wider', 'greenTile-resize-narrower', 'greenTile-resize-taller', 'greenTile-resize-shorter',
    'greenTile-swap-left', 'greenTile-swap-right', 'greenTile-swap-up', 'greenTile-swap-down',
].sort();

const FOCUS_BINDINGS = ['push-tile-down', 'push-tile-left', 'push-tile-right', 'push-tile-up'].sort();

// enable() wires: 14 hotkeys, 4 Meta custom bindings, one AppSystem
// 'installed-changed', one themeManager 'theme-set', the monitors-changed
// handler and — after the DisplayConfig reply is flushed — the auto-tiling
// observers (screen n-workspaces, display grab/enter/create x4, one
// switch-workspace) plus the border observers (display focus, workspace switch).
test('enable connects the documented handler set exactly once', () => {
    const { env, ext } = loadExtension();
    assert.equal(env.totalHandlers(), 0);
    ext.enable();
    env.flushDisplayConfigNoReply();
    assert.deepEqual(env.greenTileHotkeys(), HOTKEY_NAMES);
    assert.deepEqual([...env.customBindings.keys()].sort(), FOCUS_BINDINGS);
    assert.equal(env.layoutManager.count('monitors-changed'), 1);
    assert.equal(env.appSystem.count('installed-changed'), 1);
    assert.equal(env.themeManager.count('theme-set'), 1);
    assert.equal(env.display.count('notify::focus-window'), 1);
    assert.equal(env.display.count('grab-op-begin'), 1);
    assert.equal(env.display.count('grab-op-end'), 1);
    assert.equal(env.display.count('window-entered-monitor'), 1);
    assert.equal(env.display.count('window-created'), 1);
    assert.equal(env.workspaceManager.count('notify::n-workspaces'), 1);
    assert.equal(env.workspaceManager.count('workspace-switched'), 1);
    assert.equal(env.windowManager.count('switch-workspace'), 1);    assert.equal(env.liveTimers().length, 0, 'no timer without a pending settle');
    assert.equal(env.settingsSlots.get('greenTile@carsteneu') === null, false);
});

test('6.8-style manager: push-tile registers through setBuiltinHandler and restores the dispatcher entry', () => {
    const { env, ext } = loadExtension();
    // 6.8 surface: the keybinding manager carries setBuiltinHandler and a
    // bindings map (upstream js/ui/keybindings.js); 6.6 has neither
    const builtinCalls = [];
    env.keybindingManager.setBuiltinHandler = (name, actionId, cb) => {
        builtinCalls.push([name, actionId]);
        env.keybindingManager.bindings.set(actionId, { name, callback: cb });
    };
    env.keybindingManager.bindings = new Map();
    ext.enable();
    env.flushDisplayConfigNoReply();
    assert.deepEqual(builtinCalls, [
        ['push-tile-left', 71],
        ['push-tile-right', 72],
        ['push-tile-up', 73],
        ['push-tile-down', 74],
    ], 'all four builtins registered through the manager, action ids resolved from Meta.KeyBindingAction');
    assert.deepEqual([...env.customBindings.keys()], [],
        'the direct Meta route is not used when the manager route is available');
    assert.equal(env.keybindingManager.bindings.size, 4, 'dispatcher entries tracked');
    ext.disable();
    assert.equal(env.keybindingManager.bindings.size, 0, 'destroy removes our dispatcher entries');
    assert.deepEqual(builtinCalls.length, 4, 'no re-registration during destroy');
});

test('manager without the builtin enum members falls back to the direct Meta handler', () => {
    const { env, ext } = loadExtension();
    env.keybindingManager.setBuiltinHandler = (_name, _actionId, _cb) => {
        throw new Error('must not be reached');
    };
    // muffin without PUSH_TILE_* action ids: the manager route is unusable
    env.gi.Meta.KeyBindingAction = {};
    ext.enable();
    env.flushDisplayConfigNoReply();
    assert.deepEqual([...env.customBindings.keys()].sort(), FOCUS_BINDINGS,
        'the direct Meta path registers all four bindings');
    ext.disable();
    assert.deepEqual([...env.customBindings.keys()], [], 'Meta custom bindings reset');
});

test('monitors-changed recreates the App without stacking duplicate registrations, settle timer runs', () => {
    const { env, ext } = loadExtension();
    ext.enable();
    env.flushDisplayConfigNoReply();
    env.layoutManager.emit('monitors-changed');
    // the destroyed App must not answer the stale DisplayConfig reply
    env.flushDisplayConfigNoReply();
    assert.deepEqual(env.greenTileHotkeys(), HOTKEY_NAMES, 'exactly the 14 hotkeys, once');
    assert.equal(env.layoutManager.count('monitors-changed'), 1);
    assert.equal(env.display.count('grab-op-begin'), 1, 'auto observers reconnected once');
    // the pending settle flag routes a settle wait through the App recreation
    const timers = env.liveTimers();
    assert.equal(timers.length, 1, 'one settle timer after the monitor change');
    assert.equal(timers[0].kind, 'mainloop');
});

test('disable leaves no handlers, timers, hotkeys or bindings behind and finalizes settings', () => {
    const { env, ext } = loadExtension();
    ext.enable();
    env.flushDisplayConfigNoReply();
    env.layoutManager.emit('monitors-changed');
    env.flushDisplayConfigNoReply();
    ext.disable();
    assert.deepEqual(env.greenTileHotkeys(), [], 'no greenTile hotkey registered');
    assert.deepEqual([...env.customBindings.keys()], [], 'Meta custom bindings reset');
    assert.equal(env.layoutManager.count(), 0, 'monitors-changed disconnected');
    assert.equal(env.totalHandlers(), 0, 'every Main/global handler disconnected');
    assert.equal(env.liveTimers().length, 0, 'no timer left running');
    const slot = env.settingsSlots.get('greenTile@carsteneu');
    assert.equal(slot, null, 'settings slot finalized (nulled)');
    assert.equal(env.settingsInstances.every((s) => s.finalized), true, 'every settings instance finalized');
});

test('a late DisplayConfig reply for a destroyed App touches nothing (epoch guard)', () => {
    const { env, ext } = loadExtension();
    ext.enable();
    env.flushDisplayConfigNoReply();
    // creates App #2 and queues its DisplayConfig refresh
    env.layoutManager.emit('monitors-changed');
    // destroy both the App and its pending refresh epoch
    ext.disable();
    const handlers = env.totalHandlers();
    const timers = env.liveTimers().length;
    env.flushDisplayConfigNoReply();
    assert.equal(env.totalHandlers(), handlers, 'no observers connected by the stale reply');
    assert.equal(env.liveTimers().length, timers, 'no timer scheduled by the stale reply');
});

test('enable twice without disable stacks a second session (documented, unguarded behaviour)', () => {
    const { env, ext } = loadExtension();
    ext.enable();
    ext.enable();
    env.flushDisplayConfigNoReply();
    assert.equal(env.layoutManager.count('monitors-changed'), 2, 'each enable wires its own session handler');
    assert.equal(env.display.count('grab-op-begin'), 2, 'the auto observers connect per session: they stack');
    assert.deepEqual(env.greenTileHotkeys(), HOTKEY_NAMES, 'hotkey names overwrite by name, no duplication');
    ext.disable();
    assert.equal(env.layoutManager.count('monitors-changed'), 1,
        'disable destroys only the newest session — a second enable without disable is not guarded against');
});

test('disable takes the monitors-changed handler down first: a monitor change cannot resurrect an App', () => {
    const { env, ext } = loadExtension();
    ext.enable();
    env.flushDisplayConfigNoReply();
    ext.disable();
    const handlers = env.totalHandlers();
    env.layoutManager.emit('monitors-changed');
    assert.equal(env.totalHandlers(), handlers, 'nothing reconnected by the emission');
    assert.deepEqual(env.greenTileHotkeys(), [], 'no hotkeys came back');
    env.flushDisplayConfigNoReply();
    assert.equal(env.queuedDBus.length, 0, 'no App was recreated: no new DisplayConfig refresh');
    assert.equal(env.liveTimers().length, 0, 'no settle timer scheduled');
});

test('disable/enable on the same loaded module yields exactly one live session set', () => {
    const { env, ext } = loadExtension();
    ext.enable();
    ext.disable();
    ext.enable();
    env.flushDisplayConfigNoReply();
    assert.equal(env.layoutManager.count('monitors-changed'), 1, 'one session handler, not two');
    assert.deepEqual(env.greenTileHotkeys(), HOTKEY_NAMES, 'exactly the 14 hotkeys, once');
    assert.equal(env.display.count('grab-op-begin'), 1);
    assert.equal(env.liveTimers().length, 0, 'no leftover settle timer across the cycle');
});

// Fake MetaWindow / workspace: signal accounting + just enough geometry for the
// auto-tiling observer paths the real extension runs against.
const makeWindow = (seq) => {
    const handlers = [];
    let nextId = 1;
    const windowHub = {
        minimized: false,
        connect(sig, cb) {
            handlers.push({ sig, cb, id: nextId });
            return nextId++;
        },
        disconnect(id) {
            const at = handlers.findIndex((h) => h.id === id);
            if (at === -1)
                {throw new Error('window: no such signal handler ' + id);}
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
        get_window_type: () => 6, // Meta.WindowType.NORMAL in the fake Meta
        get_wm_class: () => 'FakeWindow',
        get_monitor: () => 0,
        get_workspace: () => null, // === activeWorkspace (null) in the default env
        is_on_all_workspaces: () => false,
    };
    return windowHub;
};
const makeWorkspace = () => {
    const handlers = [];
    let nextId = 1;
    return {
        __hub: 'workspace',
        windows: [],
        connect(sig, cb) {
            handlers.push({ sig, cb, id: nextId });
            return nextId++;
        },
        disconnect(id) {
            const at = handlers.findIndex((h) => h.id === id);
            if (at === -1)
                {throw new Error('workspace: no such signal handler ' + id);}
            handlers.splice(at, 1);
        },
        count(sig) {
            return handlers.filter((h) => !sig || h.sig === sig).length;
        },
        list_windows: () => [],
    };
};

test('auto observer: a tracked window releases both per-window handlers when it is unmanaged', () => {
    const { env, ext } = loadExtension();
    ext.enable();
    env.flushDisplayConfigNoReply();
    const w = makeWindow(11);
    env.display.emit('window-created', w);
    assert.equal(w.count('notify::minimized'), 1, 'minimize tracking connected once');
    assert.equal(w.count('unmanaged'), 1, 'unmanaged cleanup connected once');
    w.emit('unmanaged');
    assert.equal(w.count('notify::minimized'), 0, 'notify::minimized handler released');
    assert.equal(w.count('unmanaged'), 0, 'unmanaged handler released');
    ext.disable();
    assert.equal(env.totalHandlers(), 0, 'the release path is destroy-tolerant');
});

test('auto observer: notify::n-workspaces reconnect leaves exactly one window-added/removed pair per workspace', () => {
    const { env, ext } = loadExtension();
    const ws0 = makeWorkspace();
    env.workspaces.push(ws0);
    ext.enable();
    env.flushDisplayConfigNoReply();
    const pairCount = (ws) => ws.count('window-added') + ws.count('window-removed');
    assert.equal(pairCount(ws0), 2, 'initial connect: one added/removed pair');
    const ws1 = makeWorkspace();
    env.workspaces.push(ws1);
    env.workspaceManager.emit('notify::n-workspaces');
    assert.equal(pairCount(ws0), 2, 'old workspace dropped and reconnected, not stacked');
    assert.equal(pairCount(ws1), 2, 'new workspace connected exactly once');
    assert.equal(env.workspaceManager.count('notify::n-workspaces'), 1, 'the global reconnect handler stays single');
    ext.disable();
    assert.equal(pairCount(ws0), 0, 'workspace handlers released on disable');
    assert.equal(pairCount(ws1), 0, 'workspace handlers released on disable');
    assert.equal(env.totalHandlers(), 0);
});

test('auto observer: monitors-changed removes pending per-monitor debounce timers (no stale retile)', () => {
    const { env, ext } = loadExtension();
    ext.enable();
    env.flushDisplayConfigNoReply();
    const w = makeWindow(7);
    env.display.emit('window-created', w);
    w.emit('notify::minimized');
    assert.equal(env.liveTimers().filter((t) => t.ms === 300).length, 1, 'auto debounce timer pending');
    env.layoutManager.emit('monitors-changed');
    env.flushDisplayConfigNoReply();
    assert.equal(env.liveTimers().filter((t) => t.ms === 300).length, 0, 'debounce timer died with the App');
    ext.disable();
    assert.equal(env.liveTimers().length, 0, 'disable still leaves 0 timers');
});

// Split/drop runtime (lib/runtime/split.js, lib/runtime/drop.js): the pending
// split state is per App and rides the Config.destroy flush; the corrupt-
// layouts log-once flag rides the session. A remember() with flushNow=false is
// exactly what one resize-hotkey step produces.
const enableWithMonitor = (env, ext) => {
    ext.enable();
    env.layoutManager.monitors.push({ x: 0, y: 0, width: 2000, height: 1100 });
    env.flushDisplayConfigNoReply();
};

const settingsInstance = (env) => env.settingsInstances.find((s) => s.uuid === 'greenTile@carsteneu');

test('split: a pending hotkey-step split leaves the 500 ms flush timer; disable flushes it into the settings before finalize', () => {
    const { env, ext } = loadExtension();
    enableWithMonitor(env, ext);
    const app = ext.currentSession().app;
    const ref = app.split.ref(app, 0, 0, 2);
    assert.ok(ref, 'monitor key resolved from the fake DisplayConfig reply');
    // split values are { <border index>: fraction } objects (splitMove output)
    app.split.remember(app, ref, { 0: 0.5, 1: 1 }, false);
    assert.equal(env.liveTimers().filter((t) => t.ms === 500).length, 1, 'the 500 ms flush timer is pending');
    ext.disable();
    const inst = settingsInstance(env);
    const layoutsWrites = inst.callLog.filter((c) => c.op === 'setValue' && c.key === 'layouts' && !c.finalized);
    assert.equal(layoutsWrites.length, 1, 'the pending split was flushed into the settings');
    assert.ok(layoutsWrites[0].value.indexOf(ref.mkey) !== -1, 'written under the monitor key');
    assert.equal(inst.callLog.findIndex((c) => c.op === 'finalize'), inst.callLog.length - 1, 'finalize runs last');
    assert.ok(inst.callLog.indexOf(layoutsWrites[0]) < inst.callLog.findIndex((c) => c.op === 'finalize'),
        'setValue(layouts) observed BEFORE finalize');
    assert.equal(env.liveTimers().length, 0, 'no timers left after disable');
});

test('split: monitors-changed flushes a pending split into the OLD App settings; the new App starts with an empty pending map', () => {
    const { env, ext } = loadExtension();
    enableWithMonitor(env, ext);
    const app = ext.currentSession().app;
    const ref = app.split.ref(app, 0, 0, 2);
    app.split.remember(app, ref, { 0: 0.5, 1: 1 }, false);
    env.layoutManager.emit('monitors-changed');
    env.flushDisplayConfigNoReply();
    const app2 = ext.currentSession().app;
    assert.notEqual(app2, app, 'the App was recreated');
    const writes = settingsInstance(env).callLog.filter((c) => c.op === 'setValue' && c.key === 'layouts');
    assert.equal(writes.length, 1, 'the pending split reached the settings during the recreation');
    assert.ok(writes[0].finalized === false, 'written before finalize');
    ext.disable();
    const writesAfter = settingsInstance(env).callLog.filter((c) => c.op === 'setValue' && c.key === 'layouts');
    assert.equal(writesAfter.length, 1, 'no second flush on disable: the new App had a pending-free map');
});

test('split: a corrupt layouts setting logs the corrupt line once across an App recreation', () => {
    const { env, ext } = loadExtension();
    enableWithMonitor(env, ext);
    const app = ext.currentSession().app;
    const ref = app.split.ref(app, 0, 0, 2);
    const corruptLines = () => env.logs.filter((l) => l === 'greenTile layouts setting is corrupt, splits not written').length;
    settingsInstance(env).setValue('layouts', '{"mkey": broken');
    app.split.remember(app, ref, [0.5], false);
    app.split.flush(app);
    assert.equal(corruptLines(), 1, 'logged once for the first corrupt flush');
    app.split.remember(app, ref, [0.6], false);
    app.split.flush(app);
    assert.equal(corruptLines(), 1, 'still once inside the same App');
    env.layoutManager.emit('monitors-changed');
    env.flushDisplayConfigNoReply();
    const app2 = ext.currentSession().app;
    const ref2 = app2.split.ref(app2, 0, 0, 2);
    app2.split.remember(app2, ref2, [0.7], false);
    app2.split.flush(app2);
    assert.equal(corruptLines(), 1, 'log-once across the App recreation (session flag)');
});

test('split: a pending split that a drop replaces expires from the pending map (forget)', () => {
    const { env, ext } = loadExtension();
    enableWithMonitor(env, ext);
    const app = ext.currentSession().app;
    const ref = app.split.ref(app, 0, 0, 2);
    app.split.remember(app, ref, { 0: 0.4, 1: 1 }, false);
    assert.equal(env.liveTimers().filter((t) => t.ms === 500).length, 1, 'flush timer pending');
    app.split.forget(ref.key);
    ext.disable();
    const layoutsWrites = settingsInstance(env).callLog.filter((c) => c.op === 'setValue' && c.key === 'layouts');
    assert.equal(layoutsWrites.length, 0, 'the forgotten split is not written anywhere');
    assert.equal(env.liveTimers().length, 0, 'no timers left');
});

test('drop: disable during an active drag destroys the preview actor and removes the 50 ms tick timer', () => {
    const { env, ext } = loadExtension();
    enableWithMonitor(env, ext);
    const app = ext.currentSession().app;
    // automatic tiling on, keyed exactly the way the extension itself writes it
    const ref0 = app.split.ref(app, 0, 0, 2);
    const layouts = {};
    layouts[ref0.mkey] = {};
    layouts[ref0.mkey][ref0.wskey] = { auto: true };
    settingsInstance(env).setValue('layouts', JSON.stringify(layouts));
    const makeDragWindow = (seq, rect) => ({
        get_stable_sequence: () => seq,
        get_window_type: () => 6,
        get_wm_class: () => 'FakeWindow',
        get_monitor: () => 0,
        get_workspace: () => env.activeWorkspace,
        minimized: false,
        get_frame_rect: () => ({ x: rect[0], y: rect[1], width: rect[2], height: rect[3] }),
        unmaximize() {},
        move_resize_frame() {},
        move_frame() {},
        get_compositor_private: () => null,
    });
    env.activeWorkspace = { index: () => 0 };
    env.tabList.push(makeDragWindow(11, [10, 10, 400, 300]), makeDragWindow(12, [500, 10, 400, 300]));
    app.drop.begin(app, env.tabList[0], env.gi.Meta.GrabOp.MOVING);
    const preview = env.uiGroupChildren[0];
    assert.ok(preview, 'preview actor added to the ui group');
    assert.equal(env.liveTimers().filter((t) => t.ms === 50).length, 1, '50 ms tick timer running');
    ext.disable();
    assert.equal(env.uiGroupChildren.includes(preview), false, 'destroy removed the preview from the ui group');
    assert.equal(preview.destroyed, true, 'preview actor destroyed');
    assert.equal(env.liveTimers().filter((t) => t.ms === 50).length, 0, '50 ms tick timer removed');
    assert.equal(env.liveTimers().length, 0, 'nothing left running');
});

// Theme/accent/border/focus runtime (lib/runtime/{theme,border,focus}.js): the
// accent stylesheet, the border actor, the theme sources and the Meta bindings
// are per App and must be fully released by disable; every App recreation takes
// a strictly greater accent generation (the sequence is seeded on the session).
const enableWithLayouts = (env, ext) => {
    ext.enable();
    env.layoutManager.monitors.push({ x: 0, y: 0, width: 2000, height: 1100 });
    env.flushDisplayConfigNoReply();
    // automatic tiling on for monitor 0 / active workspace 0, keyed exactly the
    // way the extension itself writes it
    const app = ext.currentSession().app;
    const ref0 = app.split.ref(app, 0, 0, 2);
    const layouts = {};
    layouts[ref0.mkey] = {};
    layouts[ref0.mkey][ref0.wskey] = { auto: true };
    settingsInstance(env).setValue('layouts', JSON.stringify(layouts));
};

test('disable unloads the accent stylesheet, releases the theme sources and destroys the border actor', () => {
    const { env, ext } = loadExtension();
    enableWithMonitor(env, ext);
    const app = ext.currentSession().app;
    assert.match(app.theme.gen, /^gk-acc\d+$/, 'enable loaded the accent sheet with a generation class');
    assert.equal(env.stTheme.loads.length, 1, 'one generated stylesheet loaded on the live theme');
    ext.disable();
    assert.equal(env.stTheme.loads.length, 0, 'the accent stylesheet is unloaded');
    assert.equal(env.stTheme.unloads.length, 1, 'the sheet went through unload_stylesheet');
    const portal = env.gioSettings.find((s) => s.schema_id === 'org.x.apps.portal');
    const cinnamon = env.gioSettings.find((s) => s.schema_id === 'org.cinnamon.theme');
    assert.ok(portal && cinnamon, 'portal and cinnamon settings were created per App');
    assert.equal(portal.count('changed::color-scheme'), 0, 'portal handler released');
    assert.equal(cinnamon.count('changed::name'), 0, 'cinnamon handler released');
    assert.equal(env.themeManager.count('theme-set'), 0, 'themeManager handler released');
    assert.equal(env.overlayChildren.length, 1, 'the border actor sits in the overlay group');
    assert.equal(env.overlayChildren[0].destroyed, true, 'the border actor was destroyed');
    assert.deepEqual([...env.customBindings.keys()], [], 'the 4 Meta custom bindings are reset to null');
});

// Flash window with its own handler accounting: the border binds position- and
// size-changed on the flashed window per flash and releases the previous pair
// as soon as another window is flashed.
const makeFlashWindow = (seq) => {
    const handlers = [];
    let nextId = 1;
    const window = {
        minimized: false,
        connect(sig, cb) {
            handlers.push({ sig, cb, id: nextId });
            return nextId++;
        },
        disconnect(id) {
            const at = handlers.findIndex((h) => h.id === id);
            if (at === -1)
                {throw new Error('flash window: no such signal handler ' + id);}
            handlers.splice(at, 1);
        },
        count(sig) {
            return handlers.filter((h) => !sig || h.sig === sig).length;
        },
        get_stable_sequence: () => seq,
        get_window_type: () => 6,
        get_wm_class: () => 'FakeWindow',
        get_monitor: () => 0,
        get_workspace: () => null,
        is_on_all_workspaces: () => false,
        get_maximized: () => 0,
        is_fullscreen: () => false,
        get_frame_rect: () => ({ x: 10, y: 10, width: 400, height: 300 }),
    };
    return window;
};

test('a focus flash binds exactly two handlers on the flashed window, a second flash releases the first pair, disable removes timer and actor', () => {
    const { env, ext } = loadExtension();
    const w1 = makeFlashWindow(21);
    const w2 = makeFlashWindow(22);
    const ws0 = makeWorkspace();
    ws0.list_windows = () => [w1, w2];
    env.workspaces.push(ws0);
    env.activeWorkspace = { index: () => 0 };
    enableWithLayouts(env, ext);
    settingsInstance(env).setValue('focusBorder', true); // setValue alone fires no binding
    const app = ext.currentSession().app;
    env.display.focus_window = w1;
    app.border.flash(w1);
    assert.equal(w1.count('position-changed'), 1, 'first flash binds position-changed');
    assert.equal(w1.count('size-changed'), 1, 'first flash binds size-changed');
    // the auto-tiling observer's own per-window tracking may coexist on the hub;
    // the flash itself adds exactly the two border handlers
    assert.equal(w1.count('position-changed') + w1.count('size-changed'), 2,
        'the flash binds exactly the two border handlers');
    assert.equal(env.liveTimers().filter((t) => t.ms === 3000).length, 1, 'the 3 s hide timer is armed');
    // flashing another window releases the first pair
    env.display.focus_window = w2;
    app.border.flash(w2);
    assert.equal(w1.count('position-changed'), 0, 'the first pair was released');
    assert.equal(w1.count('size-changed'), 0);
    assert.equal(w2.count('position-changed'), 1, 'second flash binds its own pair');
    assert.equal(w2.count('size-changed'), 1);
    ext.disable();
    assert.equal(w2.count('position-changed'), 0, 'the remaining pair is released on disable');
    assert.equal(w2.count('size-changed'), 0);
    assert.equal(env.liveTimers().filter((t) => t.ms === 3000).length, 0, 'the border timer is removed');
    assert.equal(env.overlayChildren.every((a) => a.destroyed), true, 'the border actor is destroyed');
});

test('monitors-changed: the recreated App loads the accent sheet with a strictly greater generation', () => {
    const { env, ext } = loadExtension();
    ext.enable();
    env.flushDisplayConfigNoReply();
    const gen1 = ext.currentSession().app.theme.gen;
    env.layoutManager.emit('monitors-changed');
    env.flushDisplayConfigNoReply();
    const gen2 = ext.currentSession().app.theme.gen;
    const n1 = Number(gen1.slice('gk-acc'.length));
    const n2 = Number(gen2.slice('gk-acc'.length));
    assert.ok(Number.isFinite(n1) && Number.isFinite(n2), 'both generations are gk-acc<n> classes');
    assert.ok(n2 > n1, 'the new App must take a greater generation than the old one (session-seeded sequence)');
});

test('re-enable seeds the accent sequence from the clock: the new session never reuses the previous session classes', () => {
    const { env, ext } = loadExtension();
    // enable passes Date.now into the session; stub the global around the cycle
    // (restored in finally) so the seed can be advanced deterministically
    const realNow = Date.now;
    let fakeClock = 1000000;
    Date.now = () => fakeClock;
    try {
        ext.enable();
        env.flushDisplayConfigNoReply();
        const first = ext.currentSession().app.theme.gen;
        ext.disable();
        const nFirst = Number(first.slice('gk-acc'.length));
        assert.ok(Number.isFinite(nFirst) && nFirst > fakeClock, 'the first session seeded from the clock (one load: clock+1)');
        fakeClock = 5000000;
        ext.enable();
        env.flushDisplayConfigNoReply();
        const second = ext.currentSession().app.theme.gen;
        const nSecond = Number(second.slice('gk-acc'.length));
        assert.ok(Number.isFinite(nSecond), 'the second session took a gk-acc<n> class');
        assert.ok(nSecond > nFirst, 'the new session\'s first generation differs from and is greater than every class of the earlier session (clock seed, no interned-node clash)');
    }
    finally {
        Date.now = realNow;
    }
});

test('theme/border settings bindings firing mid-Config and after disable stay guarded no-ops', () => {
    const { env, ext } = loadExtension();
    ext.enable();
    env.flushDisplayConfigNoReply();
    const inst = settingsInstance(env);
    const fire = (key) => inst.bindings.find((b) => b.key === key).cb();
    // the settings dialog path (remoteUpdate) can deliver a changed:: at any
    // moment — including inside the Config construction window, where the
    // components still answer unchanged with their guard no-ops. The window's
    // exact state (config/app not yet assigned) is poked directly here; the
    // fields are the guards theme.changed()/border.update() read.
    const app = ext.currentSession().app;
    const savedConfig = app.theme._config;
    app.theme._config = null;
    assert.doesNotThrow(() => ['panelTheme', 'accentMode', 'accentColor', 'stateMode', 'stateColor'].forEach(fire),
        'the theme bindings with no config set do not throw');
    const savedApp = app.border._app;
    app.border._app = null;
    assert.doesNotThrow(() => fire('focusBorder'), 'the border binding with no app set does not throw');
    app.theme._config = savedConfig;
    app.border._app = savedApp;
    assert.doesNotThrow(() => fire('panelTheme'), 'the resolved path does not throw either');
    assert.doesNotThrow(() => fire('focusBorder'));
    ext.disable();
    assert.doesNotThrow(() => fire('panelTheme'), 'a theme binding after disable stays silent');
    assert.doesNotThrow(() => fire('focusBorder'), 'a border binding after disable stays silent');
});

// Panel state runtime (lib/runtime/panel-state.js): opening the list binds the
// Escape hotkey and connects workspace/stage/display handlers; close() and the
// destroy slot in Config.destroy release exactly those again.
test('panel: opening the list binds Escape and connects its handlers; disable closes and destroys the panel', () => {
    const { env, ext } = loadExtension();
    enableWithMonitor(env, ext);
    env.activeWorkspace = { index: () => 0 };
    const displaysBefore = env.display.count('notify::focus-window');
    const workspaceSwitchedBefore = env.workspaceManager.count('workspace-switched');
    env.keybindingManager.hotkeys.get('greenTile-preset').cb();
    assert.equal(env.chromeChildren.length, 1, 'the panel actor is in the chrome');
    const panelActor = env.chromeChildren[0];
    assert.equal(env.keybindingManager.hotkeys.get('greenTile-panel-esc') !== undefined, true,
        'Escape is bound while the list is open');
    assert.equal(env.workspaceManager.count('workspace-switched'), workspaceSwitchedBefore + 1,
        'panel re-renders on workspace switches');
    assert.equal(env.display.count('notify::focus-window'), displaysBefore + 1, 'outside-click/focus close handler connected');
    ext.disable();
    assert.deepEqual(env.greenTileHotkeys(), [], 'the Escape hotkey is released with everything else');
    assert.equal(env.workspaceManager.count('workspace-switched'), 0, 'panel sig handlers released');
    assert.equal(env.display.count('notify::focus-window'), 0, 'no display handler left');
    assert.equal(env.chromeChildren.length, 0, 'the panel actor left the chrome');
    assert.equal(panelActor.destroyed, true, 'the panel actor was destroyed');
    assert.equal(ext.currentSession(), null, 'the session is gone');
});

test('panel: hotkey re-registration while the list is open keeps the Escape binding intact', () => {
    const { env, ext } = loadExtension();
    enableWithMonitor(env, ext);
    env.activeWorkspace = { index: () => 0 };
    env.keybindingManager.hotkeys.get('greenTile-preset').cb();
    assert.ok(env.keybindingManager.hotkeys.get('greenTile-panel-esc'), 'Escape bound while the list is open');
    // the settings dialog path: any hotkey setting change re-runs registerHotkeys
    settingsInstance(env).bindings.find((b) => b.key === 'presetHotkey').cb();
    assert.ok(env.keybindingManager.hotkeys.get('greenTile-panel-esc'),
        'registerHotkeys must not drop the Escape binding (panel owner binds/unbinds it per open/close)');
    assert.deepEqual(env.greenTileHotkeys().filter((n) => n !== 'greenTile-panel-esc').sort(), HOTKEY_NAMES,
        'the 14 static hotkeys are re-registered exactly once');
    // Escape still closes the panel
    env.keybindingManager.hotkeys.get('greenTile-panel-esc').cb();
    assert.equal(env.chromeChildren.length, 0, 'the panel closed through Escape');
    assert.equal(ext.currentSession().app.panel.actor, null, 'panel state actor reset');
    ext.disable();
    assert.deepEqual(env.greenTileHotkeys(), []);
});

test('panel: the saved position rides the session across an App recreation and resets per enable', () => {
    const { env, ext } = loadExtension();
    enableWithMonitor(env, ext);
    env.activeWorkspace = { index: () => 0 };
    env.keybindingManager.hotkeys.get('greenTile-preset').cb();
    let panelActor = env.chromeChildren[0];
    panelActor.emit('notify::allocation'); // first allocation centres the panel and saves the position
    const saved = ext.currentSession().panelSaved;
    assert.ok(saved && saved.x === 700 && saved.y === 280, 'the centred position is saved on the session');
    env.layoutManager.emit('monitors-changed');
    env.flushDisplayConfigNoReply();
    env.keybindingManager.hotkeys.get('greenTile-preset').cb();
    panelActor = env.chromeChildren[0];
    assert.ok(panelActor, 'the panel reopened after the recreation');
    assert.equal(panelActor.px, saved.x, 'the new panel restores the saved x');
    assert.equal(panelActor.py, saved.y, 'the new panel restores the saved y');
    ext.disable();
    assert.equal(env.chromeChildren.length, 0, 'the panel was closed by disable');
    ext.enable();
    env.flushDisplayConfigNoReply();
    assert.equal(ext.currentSession().panelSaved, null, 'a new enable starts without a saved position');
    ext.disable();
});

// Exclusions runtime (lib/runtime/exclusions.js): the ad-hoc Super+G toggles
// live on the extension session (todo_fixes.md #5, GATE2 decision: the
// documented lifetime is preserved) — they survive an App recreation and end
// when the user toggles again or the window closes. A disable starts a fresh
// session without them (no disk persistence), while the exclusion ROWS stay
// re-derived from the (unchanged) settings.
test('an ad-hoc exclusion survives monitors-changed (session lifetime) and resets on disable/enable', () => {
    const { env, ext } = loadExtension();
    enableWithMonitor(env, ext);
    env.activeWorkspace = { index: () => 0 };
    const w = makeWindow(31);
    env.display.focus_window = w;
    env.tabList.push(w);
    env.keybindingManager.hotkeys.get('greenTile-exclude').cb();
    let app = ext.currentSession().app;
    assert.equal(app.excl.isExcluded(w), true, 'the focused window is excluded');
    assert.equal(env.logs.filter((l) => l.startsWith('greenTile never tile on:')).length, 1, 'toggle logged');
    env.layoutManager.emit('monitors-changed');
    env.flushDisplayConfigNoReply();
    app = ext.currentSession().app;
    assert.notEqual(app, null);
    assert.equal(app.excl.isExcluded(w), true, 'the exclusion rides the App recreation (session state)');
    ext.disable();
    ext.enable();
    env.flushDisplayConfigNoReply();
    assert.equal(ext.currentSession().app.excl.isExcluded(makeWindow(31)), false,
        'a re-enabled extension starts without per-window toggles (fresh session)');
    ext.disable();
    assert.equal(env.totalHandlers(), 0, 'the exclusions installed-changed handler is released');
});

test('a Super+G exclusion is cleaned up when the window closes, even without the auto path tracking it', () => {
    const { env, ext } = loadExtension();
    enableWithMonitor(env, ext);
    env.activeWorkspace = { index: () => 0 };
    const w = makeWindow(33);
    env.display.focus_window = w;
    env.tabList.push(w);
    const hotkey = () => env.keybindingManager.hotkeys.get('greenTile-exclude').cb();
    hotkey();
    const app = ext.currentSession().app;
    assert.equal(app.excl.isExcluded(w), true, 'excluded by the first toggle');
    assert.equal(ext.currentSession().exclWatches.size, 1, 'the close watch is connected while the exclusion is set');
    env.keybindingManager.hotkeys.get('greenTile-exclude').cb();
    assert.equal(app.excl.isExcluded(w), false, 'the second toggle un-excludes the window');
    assert.equal(ext.currentSession().exclWatches.size, 0, 'the close watch was disconnected on toggle-off');
    w.emit('unmanaged');
    assert.equal(app.excl.isExcluded(w), false, 'a closed window leaves no exclusion');
    assert.equal(ext.currentSession().exclWatches.size, 0, 'the close watch never leaks');
    ext.disable();
    assert.equal(env.totalHandlers(), 0, 'disable stays clean');
});

test('a window excluded on a paused, never-auto-tracked workspace is released when it closes', () => {
    const { env, ext } = loadExtension();
    enableWithMonitor(env, ext);
    env.activeWorkspace = { index: () => 0 };
    const w = makeWindow(53);
    env.display.focus_window = w;
    env.tabList.push(w);
    env.keybindingManager.hotkeys.get('greenTile-exclude').cb();
    const app = ext.currentSession().app;
    assert.equal(app.excl.isExcluded(w), true, 'excluded without any preset or auto state');
    w.emit('unmanaged');
    assert.equal(app.excl.isExcluded(w), false, 'the close released the exclusion beyond the auto-tracked set');
    assert.equal(ext.currentSession().exclToggles.size, 0, 'no exclusion leaked for later windows');
    ext.disable();
    assert.equal(env.totalHandlers(), 0);
});

// Session write-guard flag: the "layouts corrupt" log-once pair shares one
// session flag — once per session across App recreations, again after re-enable.
// Each App recreation builds a fresh Config/ExtensionSettings, so the corrupt
// value (still in the settings file in reality) is re-applied per instance.
test('the layouts write-guard logs once per session across an App recreation and again after a new enable', () => {
    const { env, ext } = loadExtension();
    enableWithMonitor(env, ext);
    env.activeWorkspace = { index: () => 0 };
    const corruptLines = () => env.logs.filter((l) => l === 'greenTile layouts setting is corrupt, not writing it').length;
    const corruptValue = '{"mkey": broken';
    env.settingsInstances.at(-1).setValue('layouts', corruptValue);
    let app = ext.currentSession().app;
    app.auto.activate(app);
    assert.equal(corruptLines(), 1, 'logged once for the first corrupt write');
    env.layoutManager.emit('monitors-changed');
    env.flushDisplayConfigNoReply();
    env.settingsInstances.at(-1).setValue('layouts', corruptValue);
    app = ext.currentSession().app;
    app.auto.activate(app);
    assert.equal(corruptLines(), 1, 'still once across the App recreation (session flag)');
    ext.disable();
    ext.enable();
    env.flushDisplayConfigNoReply();
    env.settingsInstances.at(-1).setValue('layouts', corruptValue);
    app = ext.currentSession().app;
    app.auto.activate(app);
    assert.equal(corruptLines(), 2, 'a new session starts with a fresh flag');
    ext.disable();
});

// Step-3 isolation: two enable/disable cycles on the SAME loaded module share no
// state — per-App components (exclusion toggles, panel state) reset, and the
// write-guard flag rides the new session.
test('two enable/disable cycles on the same loaded module share no state', () => {
    const { env, ext } = loadExtension();
    enableWithMonitor(env, ext);
    env.activeWorkspace = { index: () => 0 };
    const w = makeWindow(41);
    env.display.focus_window = w;
    env.tabList.push(w);
    env.keybindingManager.hotkeys.get('greenTile-preset').cb();
    env.keybindingManager.hotkeys.get('greenTile-exclude').cb();
    const firstApp = ext.currentSession().app;
    assert.equal(firstApp.excl.isExcluded(w), true, 'cycle 1 excluded the window');
    assert.ok(firstApp.panel.actor, 'cycle 1 has an open panel');
    firstApp.panel.guard();
    ext.disable();
    assert.equal(firstApp.panel.actor, null, 'disable closed the panel');
    assert.deepEqual(firstApp.excl.toggled.size, 0, 'disable cleared the toggles');
    assert.deepEqual(env.greenTileHotkeys(), [], 'no hotkeys after disable');

    ext.enable();
    env.flushDisplayConfigNoReply();
    const secondApp = ext.currentSession().app;
    assert.notEqual(secondApp, firstApp, 'a new App was created');
    assert.equal(secondApp.panel.actor, null, 'cycle 2 starts with a closed panel');
    assert.equal(secondApp.panel.guardUntil, 0, 'cycle 2 starts with a clean guard');
    assert.equal(secondApp.excl.toggled.size, 0, 'cycle 2 starts without toggles');
    assert.equal(secondApp.excl.isExcluded(makeWindow(41)), false, 'the exclusion did not leak into cycle 2');
    ext.disable();
    assert.equal(env.totalHandlers(), 0);
    assert.equal(env.liveTimers().length, 0);
});

// Exception-safe cleanup (todo_fixes.md #2): Config.destroy runs every teardown
// step independently — a failing step must not skip the ones after it, the
// collected failures surface in one report and settings.finalize stays last.
const reportContains = (env, label) => env.logErrors.some((l) => l.indexOf('greenTile cleanup') === 0 && l.indexOf(label) !== -1);

test('a throwing split.flush does not skip the remaining cleanup: handlers, actors, stylesheets and finalize all complete', () => {
    const { env, ext } = loadExtension();
    ext.enable();
    env.flushDisplayConfigNoReply();
    ext.currentSession().app.split.flush = () => { throw new Error('injected flush failure'); };
    assert.doesNotThrow(() => ext.disable(), 'disable must not abort on a failing step');
    assert.deepEqual(env.greenTileHotkeys(), [], 'no hotkey left');
    assert.deepEqual([...env.customBindings.keys()], [], 'Meta custom bindings reset');
    assert.equal(env.layoutManager.count(), 0, 'monitors-changed disconnected');
    assert.equal(env.totalHandlers(), 0, 'every Main/global handler disconnected');
    assert.equal(env.liveTimers().length, 0, 'no timer left running');
    assert.equal(env.overlayChildren.every((a) => a.destroyed), true, 'border actor destroyed');
    assert.equal(env.stTheme.loads.length, 0, 'accent stylesheet unloaded');
    assert.equal(env.settingsSlots.get('greenTile@carsteneu'), null, 'settings finalized despite the flush failure');
    assert.equal(reportContains(env, 'injected flush failure'), true, 'the collected failure is reported');
    ext.disable();
    assert.equal(env.totalHandlers(), 0, 'repeated disable stays safe');
});

test('a throwing panel.close skips only its own step: theme, focus, border and finalize still complete', () => {
    const { env, ext } = loadExtension();
    enableWithMonitor(env, ext);
    ext.currentSession().app.panel.close = () => { throw new Error('injected panel failure'); };
    ext.disable();
    assert.equal(env.stTheme.loads.length, 0, 'accent stylesheet unloaded by the later theme step');
    assert.deepEqual([...env.customBindings.keys()], [], 'Meta custom bindings reset by the later focus step');
    assert.equal(env.overlayChildren.every((a) => a.destroyed), true, 'border actor destroyed by the later border step');
    assert.equal(env.settingsSlots.get('greenTile@carsteneu'), null, 'settings finalized last');
    assert.equal(reportContains(env, 'injected panel failure'), true, 'the collected failure is reported');
});

test('a throwing theme.destroy releases focus, border and settings regardless', () => {
    const { env, ext } = loadExtension();
    enableWithMonitor(env, ext);
    ext.currentSession().app.theme.destroy = () => { throw new Error('injected theme failure'); };
    ext.disable();
    assert.deepEqual([...env.customBindings.keys(), ...env.customBindings.values()], [], 'focus overrides reset');
    assert.equal(env.overlayChildren.every((a) => a.destroyed), true, 'border actor destroyed');
    assert.equal(env.settingsSlots.get('greenTile@carsteneu'), null, 'settings finalized');
    assert.equal(reportContains(env, 'injected theme failure'), true, 'the collected failure is reported');
});

test('a throwing border.destroy still finalizes the settings and reports', () => {
    const { env, ext } = loadExtension();
    enableWithMonitor(env, ext);
    ext.currentSession().app.border.destroy = () => { throw new Error('injected border failure'); };
    ext.disable();
    assert.equal(env.settingsSlots.get('greenTile@carsteneu'), null, 'settings finalized after the failing border step');
    assert.equal(reportContains(env, 'injected border failure'), true, 'the collected failure is reported');
    const handlersAfterFailure = env.totalHandlers();
    ext.disable();
    assert.equal(env.totalHandlers(), handlersAfterFailure, 'repeated disable adds nothing new');
});

test('a throwing settings.finalize is reported and does not rerun on a second disable', () => {
    const { env, ext } = loadExtension();
    ext.enable();
    env.flushDisplayConfigNoReply();
    settingsInstance(env).finalize = () => { throw new Error('injected finalize failure'); };
    assert.doesNotThrow(() => ext.disable());
    assert.deepEqual(env.greenTileHotkeys(), [], 'no hotkey left');
    assert.equal(env.totalHandlers(), 0, 'no handler left');
    assert.equal(reportContains(env, 'injected finalize failure'), true, 'the collected failure is reported');
});

test('a throwing flush during monitors-changed does not abort the recreation: the new App takes over exactly once', () => {
    const { env, ext } = loadExtension();
    enableWithMonitor(env, ext);
    const oldApp = ext.currentSession().app;
    oldApp.split.flush = () => { throw new Error('injected flush failure'); };
    env.layoutManager.emit('monitors-changed');
    env.flushDisplayConfigNoReply();
    const app2 = ext.currentSession().app;
    assert.notEqual(app2, oldApp, 'the recreation still happened');
    assert.notEqual(app2, null, 'the session no longer points at the half-destroyed App');
    assert.deepEqual(env.greenTileHotkeys(), HOTKEY_NAMES, 'exactly the 14 hotkeys, once');
    assert.equal(env.appSystem.count('installed-changed'), 1, 'no double-connected installed-changed');
    assert.equal(env.settingsInstances[0].finalized, true, 'the old settings were finalized');
    assert.equal(env.settingsInstances[1].finalized, false, 'the new settings are live');
    assert.equal(reportContains(env, 'injected flush failure'), true, 'the flush failure is reported');
    ext.disable();
    assert.equal(env.totalHandlers(), 0);
    ext.disable();
    assert.equal(env.totalHandlers(), 0, 'repeated disable after a failed recreation stays safe');
});

test('multiple failing steps produce exactly one aggregated report', () => {
    const { env, ext } = loadExtension();
    ext.enable();
    env.flushDisplayConfigNoReply();
    ext.currentSession().app.split.flush = () => { throw new Error('injected flush failure'); };
    settingsInstance(env).finalize = () => { throw new Error('injected finalize failure'); };
    assert.doesNotThrow(() => ext.disable());
    const reports = env.logErrors.filter((l) => l.indexOf('greenTile cleanup') === 0);
    assert.equal(reports.length, 1, 'exactly one aggregated report for both failures');
    assert.equal(reports[0].indexOf('injected flush failure') !== -1, true, 'the flush failure is in the report');
    assert.equal(reports[0].indexOf('injected finalize failure') !== -1, true, 'the finalize failure is in the same report');
});

test('a settings slot construction failure before any acquisition is tolerated by the rollback', () => {
    const { env, ext } = loadExtension();
    env.imports.ui.settings.ExtensionSettings = class {
        constructor() { throw new Error('injected settings failure'); }
    };
    assert.throws(() => ext.enable(), /injected settings failure/, 'the enable fails at the settings slot');
    assert.equal(ext.currentSession().app, null, 'no App was assigned');
    assert.deepEqual(env.greenTileHotkeys(), [], 'no hotkeys were registered');
    assert.equal(env.totalHandlers(), 0, 'nothing stays connected');
    assert.doesNotThrow(() => ext.disable(), 'disable survives the never-created App');
    assert.equal(env.totalHandlers(), 0, 'disable after a failed enable stays clean');
});

// Rollback on partial initialization (todo_fixes.md #3): a Config constructor
// failing mid-way must release everything it already acquired — on the first
// start and on an App recreation after a monitor change.
const failAddHotKey = (env, name) => {
    const real = env.keybindingManager.addHotKey;
    env.keybindingManager.addHotKey = function (bindingName, ...rest) {
        if (bindingName === name) {
            throw new Error('injected hotkey failure');
        }
        return real.call(this, bindingName, ...rest);
    };
    return () => { env.keybindingManager.addHotKey = real; };
};

test('an enable failing at the 3rd hotkey rolls back hotkeys, installed-changed and settings; a later enable registers exactly once', () => {
    const { env, ext } = loadExtension();
    const restore = failAddHotKey(env, 'greenTile-autoN');
    assert.throws(() => ext.enable(), /injected hotkey failure/, 'the enable fails at the injected hotkey');
    assert.deepEqual(env.greenTileHotkeys(), [], 'the earlier hotkeys are rolled back');
    assert.equal(env.appSystem.count('installed-changed'), 0, 'the installed-changed handler is released');
    assert.equal(env.settingsSlots.get('greenTile@carsteneu'), null, 'the settings slot is finalized');
    assert.equal(env.totalHandlers(), 0, 'no handler left');
    assert.deepEqual([...env.customBindings.keys()], [], 'no Meta bindings');
    restore();
    ext.enable();
    env.flushDisplayConfigNoReply();
    assert.deepEqual(env.greenTileHotkeys(), HOTKEY_NAMES, 'exactly the 14 hotkeys, once');
    assert.equal(env.appSystem.count('installed-changed'), 1, 'exactly one installed-changed');
    assert.equal(env.settingsInstances[0].finalized, true, 'the rolled-back instance stays finalized');
    ext.disable();
    assert.equal(env.totalHandlers(), 0);
});

test('a failure at focus.connect rolls back hotkeys, installed-changed, theme sheet and settings', () => {
    const { env, ext } = loadExtension();
    const realSet = env.gi.Meta.keybindings_set_custom_handler;
    env.gi.Meta.keybindings_set_custom_handler = function (name, fn) {
        if (name === 'push-tile-down') {
            throw new Error('injected focus failure');
        }
        return realSet(name, fn);
    };
    env.layoutManager.monitors.push({ x: 0, y: 0, width: 2000, height: 1100 });
    assert.throws(() => ext.enable(), /injected focus failure/, 'the enable fails at the injected focus connect');
    env.layoutManager.monitors.pop();
    env.gi.Meta.keybindings_set_custom_handler = realSet;
    assert.deepEqual(env.greenTileHotkeys(), [], 'hotkeys rolled back');
    assert.equal(env.appSystem.count('installed-changed'), 0, 'installed-changed rolled back');
    assert.equal(env.stTheme.loads.length, 0, 'the accent sheet was unloaded by the rollback');
    assert.equal(env.themeManager.count('theme-set'), 0, 'the theme-set handler was released');
    assert.equal(env.settingsSlots.get('greenTile@carsteneu'), null, 'settings finalized');
    assert.equal(env.totalHandlers(), 0, 'nothing else stays connected');
    ext.enable();
    env.flushDisplayConfigNoReply();
    assert.deepEqual(env.greenTileHotkeys(), HOTKEY_NAMES, 'the retry registers exactly once');
    assert.equal(env.appSystem.count('installed-changed'), 1);
    ext.disable();
    assert.equal(env.totalHandlers(), 0);
});

test('a failed App recreation leaves no App and no resources; the next monitor change succeeds exactly once', () => {
    const { env, ext } = loadExtension();
    ext.enable();
    env.flushDisplayConfigNoReply();
    const firstSettings = env.settingsInstances[0];
    const restore = failAddHotKey(env, 'greenTile-auto3');
    assert.throws(() => env.layoutManager.emit('monitors-changed'), /injected hotkey failure/, 'the recreation fails at the injected hotkey');
    restore();
    assert.equal(ext.currentSession().app, null, 'the session keeps no half-destroyed App');
    assert.deepEqual(env.greenTileHotkeys(), [], 'no hotkeys left');
    assert.equal(env.appSystem.count('installed-changed'), 0, 'the recreation rolled back its handler');
    assert.equal(env.layoutManager.count('monitors-changed'), 1,
        'the session handler stays armed: the next monitor change retries');
    assert.equal(env.totalHandlers(), 1, 'old App destroyed, new one rolled back: only the session handler remains');
    assert.equal(firstSettings.finalized, true, 'the old settings are finalized');
    env.layoutManager.emit('monitors-changed');
    env.flushDisplayConfigNoReply();
    assert.equal(ext.currentSession().app !== null, true, 'the next monitor change recreates the App');
    assert.deepEqual(env.greenTileHotkeys(), HOTKEY_NAMES, 'exactly the 14 hotkeys, once');
    assert.equal(env.appSystem.count('installed-changed'), 1, 'exactly one installed-changed, not two');
    ext.disable();
    assert.equal(env.totalHandlers(), 0);
    ext.disable();
    assert.equal(env.totalHandlers(), 0, 'repeated disable after a failed recreation stays safe');
});

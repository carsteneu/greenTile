'use strict';
// A cross-workspace push (Super+Ctrl+Left/Right at the edge of a surface) switches the
// workspace and places windows on BOTH surfaces. Cinnamon animates that switch on the
// window ACTORS (/usr/share/cinnamon/js/ui/windowManager.js _switchWorkspace, Cinnamon
// 6.6.9 lines 1133-1290): on the 'switch-workspace' signal it records every from/to
// actor's x/y as origX/origY, eases x/y for WORKSPACE_ANIMATION_TIME (150 ms) times the
// effect-speed multiplier, and on completion runs cleanup_window_effect:
// remove_all_transitions() + set_position(origX, origY). Any frame move greenTile makes
// between the switch start and that cleanup is therefore undone on the actor: Muffin
// synced the actor to the new frame, the cleanup writes the PRE-PUSH position back. The
// frame is right, the actor is drawn where the window was before the push (size follows
// the frame) — the host's "moved window hangs over the others", the empty cells, and the
// centred lone window that sticks out on the right after a round trip.
//
// Host evidence (2026-10-08 16:02, 5120x1400 usable): a hidden ws12 Brave window had
// frame x=0 but actor x=962 = 978 - 16, i.e. exactly the centred-lone x (5120 * 0.618 ->
// 3164 wide, floor((5120 - 3164) / 2) = 978) minus Brave's 16 px CSD extent: the actor
// kept the position it had before it was pushed.
//
// Model: Muffin re-syncs the actor on every frame change (and not on a request that
// leaves the frame unchanged — re-applying the same rect is a no-op, live-proven); the
// switch effect is the Cinnamon code above, completed explicitly by the test at its
// 150 ms point, before the auto observer's 300 ms retile and the 320 ms actor check.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    makeEnv, makeWindow, makeWorkspace, enableOnMonitors,
} = require('../helpers/fakes/cinnamon-harness');
const { makeEaseActor } = require('../helpers/fakes/ease-actor');

const WIDE = { x: 0, y: 0, width: 5120, height: 1440, index: 0 };
// Brave's client-side decoration: the actor is the frame grown by the GTK frame extents.
const EXT = [-16, -10, 32, 42];
const LEFT = 1;
const RIGHT = 2;

const PRESET = {
    id: 'p2',
    name: 'Terminal Reihen',
    rules: [
        { min: 2, stacks: [1, 1] },
        { min: 3, stacks: [1, 1, 1] },
        { min: 4, stacks: [1, 1, 1, 1] },
    ],
};

// Fire every pending timer of one delay, like the main loop reaching it.
const fire = (env, ms) => {
    let fired = 0;
    for (;;) {
        const entry = [...env.timers.entries()].find(([, t]) => t.ms === ms);
        if (!entry) {
            return fired;
        }
        env.timers.delete(entry[0]);
        entry[1].cb();
        fired++;
    }
};

// Cinnamon's workspace-switch effect, transcribed from windowManager.js _switchWorkspace.
// Connected before the extension, as the shell's WindowManager is.
const installSwitchEffect = (env, all) => {
    /** actors the running effect owns */
    const owned = new Set();
    env.windowManager.connect('switch-workspace', (_wm, from, to, direction) => {
        const xDest = direction === LEFT ? WIDE.width : direction === RIGHT ? -WIDE.width : 0;
        for (const w of all) {
            const a = w.get_compositor_private();
            const idx = w.get_workspace().index();
            if (!a || (idx !== from && idx !== to)) {
                continue;
            }
            if (a.origX === undefined) {
                a.origX = a.x;
                a.origY = a.y;
                if (idx === to) {
                    a.x = a.origX - xDest;
                }
            }
            // the running x/y ease (its value is driven per frame; only its existence
            // matters to greenTile, which stands down while it runs)
            const start = a.x;
            a.foreignTransition('x', idx === to ? a.origX : a.origX + xDest);
            a.x = start;
            owned.add(a);
        }
    });
    // the effect's completion (150 ms after the switch): cleanup_window_effect
    return () => {
        for (const a of owned) {
            a.removeAllTransitions();
            a.x = a.origX;
            a.y = a.origY;
            a.origX = undefined;
            a.origY = undefined;
        }
        owned.clear();
    };
};

const setup = () => {
    const { env, ext } = makeEnv({
        windowGap: 0, presets: JSON.stringify([PRESET]), singleWindowMode: 'center', singleWindowMigrated: true,
    });
    const all = [];
    Object.defineProperty(env, 'tabList', {
        configurable: true,
        get: () => all.filter((w) => w.get_workspace() === env.activeWorkspace),
    });
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
        ws.emit = (signal, ...args) => {
            for (const h of [...handlers.values()]) {
                if (h.signal === signal) {
                    h.callback(...args);
                }
            }
        };
        ws.index = () => i;
        ws.list_windows = () => all.filter((w) => w.get_workspace() === ws);
        // Muffin: activate, then the compositor's synchronous 'switch-workspace'
        ws.activate_with_focus = (w) => {
            const from = env.activeWorkspace;
            env.activeWorkspace = ws;
            env.display.focus_window = w;
            if (from !== ws) {
                env.windowManager.emit('switch-workspace', env.windowManager, from.index(), i, i < from.index() ? LEFT : RIGHT);
            }
        };
    }
    const [ws12, ws13, ws14] = env.workspaces;
    const finishSwitch = installSwitchEffect(env, all);
    env.activeWorkspace = ws14;
    enableOnMonitors(env, ext, [WIDE]);
    const app = ext.currentSession().app;
    // A window whose actor Muffin keeps in sync with its frame, on its own workspace.
    const win = (seq, rect, ws) => {
        const actor = makeEaseActor();
        actor.origX = undefined;
        actor.origY = undefined;
        const w = makeWindow(env, seq, rect, 0, actor);
        const sync = (before) => {
            if (w.rect.join() === before.join()) {
                return; // an unchanged frame is a no-op in Muffin: the actor is not touched
            }
            actor.x = w.rect[0] + EXT[0];
            actor.y = w.rect[1] + EXT[1];
            actor.width = w.rect[2] + EXT[2];
            actor.height = w.rect[3] + EXT[3];
        };
        const resize = w.move_resize_frame.bind(w);
        const move = w.move_frame.bind(w);
        w.move_resize_frame = (userOp, x, y, width, height) => {
            const before = w.rect.slice();
            resize(userOp, x, y, width, height);
            sync(before);
        };
        w.move_frame = (userOp, x, y) => {
            const before = w.rect.slice();
            move(userOp, x, y);
            sync(before);
        };
        sync([NaN]);
        let workspace = ws;
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
    const a = win(1, [0, 0, 2560, 1440], ws12);
    const b = win(2, [2560, 0, 2560, 1440], ws12);
    const c = win(3, [0, 0, 2560, 1440], ws13);
    const d = win(4, [2560, 0, 2560, 1440], ws13);
    const lone = win(5, [978, 72, 3164, 1296], ws14);
    app.ops.layoutSet(app, 0, 0, { auto: true });
    app.ops.layoutSet(app, 0, 1, { auto: true, preset: 'p2' });
    app.ops.layoutSet(app, 0, 2, { auto: true });
    return { env, ext, app, all, finishSwitch, a, b, c, d, lone, ws12, ws13, ws14 };
};

// Lets the main loop run: every pending timer up to `limit` ms fires, shortest delay
// first, including the ones a fired timer arms (the actor check a retile re-arms).
const advance = (env, limit = 400) => {
    for (;;) {
        const due = [...env.timers.values()].filter((t) => t.ms <= limit).map((t) => t.ms);
        if (due.length === 0) {
            return;
        }
        fire(env, Math.min(...due));
    }
};

// One key press and the time after it: the switch effect completes (150 ms, before any
// greenTile timer), then greenTile's timers run in delay order — the auto observer's
// debounced retile (300 ms) and the actor check (320 ms) among them.
const press = (f, dir, w) => {
    f.env.activeWorkspace = w.get_workspace();
    f.env.display.focus_window = w;
    f.env.keybindingManager.hotkeys.get('greenTile-swap-' + dir).cb();
    f.finishSwitch();
    advance(f.env);
};

// Follows the window until it left its surface (local swaps first, then the push).
const pushOut = (f, dir, w) => {
    const from = w.get_workspace();
    let guard = 0;
    while (w.get_workspace() === from && guard++ < 6) {
        press(f, dir, w);
    }
    assert.notEqual(w.get_workspace(), from, 'the window left its workspace');
};

const desynced = (all) => all.filter((w) => {
    const a = w.get_compositor_private();
    const r = w.get_frame_rect();
    return a.x - r.x !== EXT[0] || a.y - r.y !== EXT[1];
}).map((w) => {
    const a = w.get_compositor_private();
    return `win${w.seq}@ws${w.get_workspace().index() + 12} frame=${w.rect.join(',')} actor=${a.x},${a.y}`;
});

test('a push into a workspace leaves every actor on its frame once the switch effect ended', () => {
    const f = setup();
    // ws13 (two windows) is the active surface; its left window is pushed to ws12.
    f.env.activeWorkspace = f.ws13;
    f.app.ops.retileMonitor(f.app, 0, f.c, true, 1);
    pushOut(f, 'left', f.c);
    assert.equal(f.c.get_workspace(), f.ws12, 'the window landed on ws12');
    assert.deepEqual(desynced(f.all), [], 'an actor kept its pre-push position');
});

test('a round trip of the centred lone window ws14 -> ws12 -> ws14 leaves no stale actor', () => {
    const f = setup();
    pushOut(f, 'left', f.lone);
    assert.equal(f.lone.get_workspace(), f.ws13);
    pushOut(f, 'left', f.lone);
    assert.equal(f.lone.get_workspace(), f.ws12);
    pushOut(f, 'right', f.lone);
    assert.equal(f.lone.get_workspace(), f.ws13);
    pushOut(f, 'right', f.lone);
    assert.equal(f.lone.get_workspace(), f.ws14, 'the window is home again');
    assert.deepEqual(f.lone.rect, [978, 72, 3164, 1296], 'the frame is the centred lone cell');
    assert.deepEqual(desynced(f.all), [], 'an actor kept a position from before a push');
    const a = f.lone.get_compositor_private();
    assert.ok(a.x + a.width <= WIDE.width + EXT[2], 'the lone window is drawn inside the monitor');
});

const frames = (wins) => wins.map((w) => w.rect.join(','));
const heldLines = (env) => env.logs.filter((l) => l.indexOf('greenTile retile after workspace switch') === 0);

test('the push moves no frame while the switch effect runs; both surfaces are placed after it', () => {
    const f = setup();
    f.env.activeWorkspace = f.ws13;
    f.app.ops.retileMonitor(f.app, 0, f.c, true, 1);
    const before = frames(f.all);
    f.env.display.focus_window = f.c;
    f.env.keybindingManager.hotkeys.get('greenTile-swap-left').cb();
    assert.equal(f.c.get_workspace(), f.ws12, 'the window changed workspace at once');
    assert.equal(f.env.activeWorkspace, f.ws12, 'and the view followed');
    assert.deepEqual(frames(f.all), before, 'no frame moved while the effect owns the actors');
    f.finishSwitch();
    advance(f.env);
    assert.deepEqual(heldLines(f.env), ['greenTile retile after workspace switch n=2'],
        'target and source were placed once, after the effect');
    assert.deepEqual(f.c.rect, [3413, 0, 1707, 1440], 'the pushed window took the edge slot it came in through');
    assert.deepEqual(frames([f.a, f.b]), ['0,0,1707,1440', '1707,0,1706,1440'], 'the residents moved over');
    assert.deepEqual(f.d.rect, [978, 72, 3164, 1296], 'ws13 kept one window, centred');
    assert.deepEqual(desynced(f.all), []);
});

test('a press during the effect is held too, and the surface ends in sync and without overlap', () => {
    const f = setup();
    f.env.activeWorkspace = f.ws13;
    f.app.ops.retileMonitor(f.app, 0, f.c, true, 1);
    f.env.display.focus_window = f.c;
    f.env.keybindingManager.hotkeys.get('greenTile-swap-left').cb();
    // the user presses again before the effect ended: a local swap on the new workspace
    f.env.display.focus_window = f.c;
    f.env.keybindingManager.hotkeys.get('greenTile-swap-left').cb();
    assert.equal(f.c.get_workspace(), f.ws12, 'the second press was a local swap, no further push');
    f.finishSwitch();
    advance(f.env);
    const ws12 = [f.a, f.b, f.c];
    for (let i = 0; i < ws12.length; i++) {
        for (let j = i + 1; j < ws12.length; j++) {
            const p = ws12[i].rect;
            const q = ws12[j].rect;
            assert.ok(Math.min(p[0] + p[2], q[0] + q[2]) <= Math.max(p[0], q[0]), 'frames overlap');
        }
    }
    assert.deepEqual(desynced(f.all), []);
});

test('a second switch inside the effect extends the hold to the last effect', () => {
    const f = setup();
    f.env.windowManager.emit('switch-workspace', f.env.windowManager, 2, 1, LEFT);
    f.env.windowManager.emit('switch-workspace', f.env.windowManager, 1, 0, LEFT);
    assert.equal(f.env.liveTimers().filter((t) => t.ms === 250).length, 1, 'one effect window, not two');
    assert.equal(f.app.auto.switching(), true);
    fire(f.env, 250);
    assert.equal(f.app.auto.switching(), false, 'the window closed with the last effect');
    f.finishSwitch();
});

test('disable while a retile is held leaves no timer and places nothing afterwards', () => {
    const f = setup();
    f.env.activeWorkspace = f.ws13;
    f.app.ops.retileMonitor(f.app, 0, f.c, true, 1);
    const before = frames(f.all);
    f.env.display.focus_window = f.c;
    f.env.keybindingManager.hotkeys.get('greenTile-swap-left').cb();
    assert.ok(f.env.liveTimers().some((t) => t.ms === 250), 'the effect window is open');
    f.ext.disable();
    assert.deepEqual(f.env.liveTimers(), [], 'no timer survives disable');
    f.finishSwitch();
    assert.deepEqual(frames(f.all), before, 'the held retile died with the App, nothing was placed');
});

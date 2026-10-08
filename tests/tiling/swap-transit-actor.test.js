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
    // global.get_window_actors(): the hold reads the effect's origX mark on them
    env.windowActors = () => all.map((w) => w.get_compositor_private()).filter(Boolean);
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
            if (env.moveProbe) {
                env.moveProbe(w);
            }
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

// Fire exactly one pending timer of that delay (a poll that re-arms itself must be
// stepped, not drained).
const fireOnce = (env, ms) => {
    const entry = [...env.timers.entries()].find(([, t]) => t.ms === ms);
    assert.ok(entry, 'a ' + ms + ' ms timer is pending');
    env.timers.delete(entry[0]);
    entry[1].cb();
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
    const first = f.env.liveTimers().find((t) => t.ms === 250).id;
    f.env.windowManager.emit('switch-workspace', f.env.windowManager, 1, 0, LEFT);
    const live = f.env.liveTimers().filter((t) => t.ms === 250);
    assert.equal(live.length, 1, 'one effect window, not two');
    assert.notEqual(live[0].id, first, 'the first window was replaced by a new one');
    assert.equal(f.app.auto.switching(), true);
    f.finishSwitch();
    fire(f.env, 250);
    assert.equal(f.app.auto.switching(), false, 'the window closed with the last effect');
});

test('an effect that outlasts 250 ms keeps the hold until its cleanup ran', () => {
    const f = setup();
    f.env.activeWorkspace = f.ws13;
    f.app.ops.retileMonitor(f.app, 0, f.c, true, 1);
    const before = frames(f.all);
    f.env.display.focus_window = f.c;
    f.env.keybindingManager.hotkeys.get('greenTile-swap-left').cb();
    fire(f.env, 250); // a busy compositor frame: the effect is not done yet
    assert.equal(f.app.auto.switching(), true, 'the hold is still on');
    fireOnce(f.env, 20);
    fireOnce(f.env, 20);
    assert.deepEqual(frames(f.all), before, 'nothing was placed while the effect still ran');
    f.finishSwitch();
    advance(f.env);
    assert.equal(f.app.auto.switching(), false);
    assert.deepEqual(heldLines(f.env), ['greenTile retile after workspace switch n=2']);
    assert.deepEqual(desynced(f.all), [], 'placed after the cleanup, in sync');
});

test('a hold whose effect never reports its end gives up after a second', () => {
    const f = setup();
    f.env.windowManager.emit('switch-workspace', f.env.windowManager, 2, 1, LEFT);
    let polls = 0;
    fire(f.env, 250);
    while (f.app.auto.switching() && polls < 100) {
        fireOnce(f.env, 20);
        polls++;
    }
    assert.equal(f.app.auto.switching(), false, 'the hold ended without the cleanup');
    assert.equal(polls, 38, '250 ms + 38 polls of 20 ms = the 1000 ms cap');
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

test('held runs replay in the order of their newest request, a replaced settle survives', () => {
    const f = setup();
    f.env.windowManager.emit('switch-workspace', f.env.windowManager, 2, 1, LEFT);
    const order = [];
    f.app.auto.afterSwitch('active', (o) => order.push('active-old ' + o.settle));
    f.app.auto.afterSwitch('background', (o) => order.push('background ' + o.settle + ' ' + o.layout), { settle: true, layout: 'L' });
    f.app.auto.afterSwitch('active', (o) => order.push('active-new ' + o.settle), { settle: false });
    f.app.auto.afterSwitch('background', (o) => order.push('background-user ' + o.settle + ' ' + o.layout), { settle: false, layout: null });
    assert.deepEqual(order, [], 'nothing ran inside the effect');
    f.finishSwitch();
    fire(f.env, 250);
    assert.deepEqual(order, ['active-new false', 'background-user true L'],
        'a replaced run moves to the end, the old one is gone, its settle and layout are kept');
});

for (const [label, patch] of [['animations are off', { animations_enabled: false }], ['a modal is pushed', { modalCount: 1 }]]) {
    test('no hold when ' + label + ': the shell runs no switch effect then', () => {
        const f = setup();
        const main = f.env.mainBranch;
        Object.assign(main, patch);
        f.env.windowManager.emit('switch-workspace', f.env.windowManager, 2, 1, LEFT);
        assert.equal(f.app.auto.switching(), false, 'no effect window was opened');
        let ran = false;
        f.app.auto.afterSwitch('k', () => {
            ran = true;
        });
        assert.equal(ran, true, 'the retile runs at once');
        Object.assign(main, { animations_enabled: true, modalCount: 0 });
        f.finishSwitch();
    });
}

test('a second press inside the effect acts on the settled surface, not on the frames before it', () => {
    const f = setup();
    // ws12 and ws13 carry their placements, so a stale read has a record to go wrong on
    f.app.ops.retileMonitor(f.app, 0, null, false, 0);
    f.app.ops.retileMonitor(f.app, 0, null, false, 1);
    f.env.display.focus_window = f.lone;
    f.env.keybindingManager.hotkeys.get('greenTile-swap-left').cb(); // push ws14 -> ws13
    assert.equal(f.lone.get_workspace(), f.ws13);
    f.env.display.focus_window = f.lone;
    f.env.keybindingManager.hotkeys.get('greenTile-swap-left').cb(); // pressed again at once
    f.finishSwitch();
    advance(f.env);
    assert.equal(f.lone.get_workspace(), f.ws13, 'the second press was a local swap');
    assert.deepEqual(f.lone.rect, [1707, 0, 1706, 1440], 'it swapped from the edge slot into the middle cell');
    assert.deepEqual(desynced(f.all), []);
});

test('an origX left behind by a cancelled effect does not hold the next switch', () => {
    const f = setup();
    f.env.windowManager.emit('switch-workspace', f.env.windowManager, 2, 1, LEFT);
    f.finishSwitch();
    f.a.get_compositor_private().origX = 7; // another shell effect cancelled the ease
    fire(f.env, 250);
    assert.equal(f.app.auto.switching(), false, 'no running ease: the hold ended at the first look');
});

test('a long hold does not let the swap landing override expire', () => {
    const f = setup();
    let now = 0;
    f.env.gi.GLib.get_monotonic_time = () => now * 1000;
    f.env.activeWorkspace = f.ws13;
    f.app.ops.retileMonitor(f.app, 0, f.c, true, 1);
    f.env.display.focus_window = f.d;
    f.env.keybindingManager.hotkeys.get('greenTile-swap-right').cb(); // push d ws13 -> ws14 (left slot)
    assert.equal(f.d.get_workspace(), f.ws14);
    now = 2500; // the main loop stalled: the override's 2 s freshness window has passed
    f.finishSwitch();
    advance(f.env);
    assert.deepEqual(f.d.rect, [0, 0, 2560, 1440], 'the pushed window took the edge slot it came in through');
});

test('an App created while a switch effect still runs holds from the start', () => {
    const f = setup();
    f.ext.disable();
    const a = f.a.get_compositor_private();
    a.origX = a.x;
    a.foreignTransition('x', a.x + 100);
    f.ext.enable();
    f.env.flushDisplayConfigNoReply();
    const app = f.ext.currentSession().app;
    assert.equal(app.auto.switching(), true, 'the new App holds');
    a.removeAllTransitions();
    a.origX = undefined;
    fire(f.env, 20);
    assert.equal(app.auto.switching(), false, 'and lets go once the effect ended');
    f.ext.disable();
});

test('a focus window finalized during the hold does not drop the surface placement', () => {
    const f = setup();
    f.env.activeWorkspace = f.ws13;
    f.app.ops.retileMonitor(f.app, 0, f.c, true, 1);
    f.env.windowManager.emit('switch-workspace', f.env.windowManager, 2, 1, LEFT);
    f.app.ops.retileMonitor(f.app, 0, f.c, true, 0);
    f.finishSwitch();
    const errors = f.env.logErrors.length;
    f.c.get_compositor_private = () => {
        throw new Error('finalized wrapper');
    };
    f.c.get_workspace = () => f.ws13; // gone from ws12
    fire(f.env, 250);
    assert.equal(f.env.logErrors.length, errors, 'no error escaped the held run');
    assert.deepEqual(heldLines(f.env), ['greenTile retile after workspace switch n=1'], 'the surface was still placed');
});

// The two ways a held focus window can leave the surface it was held for. The checks
// run right after the hold ended, before the auto observer's own 300 ms retile.
const leaveDuringHold = (leave) => {
    const f = setup();
    f.env.activeWorkspace = f.ws13;
    f.app.ops.retileMonitor(f.app, 0, f.c, true, 1);
    f.env.display.focus_window = f.c;
    f.env.keybindingManager.hotkeys.get('greenTile-swap-left').cb();
    assert.equal(f.c.get_workspace(), f.ws12);
    leave(f);
    f.finishSwitch();
    fire(f.env, 250);
    return f;
};

test('a focus window closed during the hold claims no cell on the surface it was pushed to', () => {
    const f = leaveDuringHold((g) => {
        g.c.get_compositor_private = () => null; // Muffin cleared the actor: unmanaged
        g.all.splice(g.all.indexOf(g.c), 1);
    });
    assert.deepEqual(frames([f.a, f.b]), ['0,0,2560,1440', '2560,0,2560,1440'], 'ws12 is two halves, no empty cell');
});

test('a focus window moved on during the hold claims no cell on the surface it left', () => {
    const f = leaveDuringHold((g) => {
        g.c.change_workspace_by_index(1); // back to ws13 before the effect ended
    });
    assert.deepEqual(frames([f.a, f.b]), ['0,0,2560,1440', '2560,0,2560,1440'], 'ws12 is two halves, no empty cell');
    assert.notDeepEqual(f.c.rect, [3413, 0, 1707, 1440], 'the window was not placed into a ws12 cell');
});

// A virtual clock: every timer fires at its due time, and the switch effect ends 150 ms
// after the LAST switch (Cinnamon keeps the first origX across a switch inside the
// effect and finishes on the new animation). Moves of a frame while an actor still
// carries the effect's origX are recorded: those are the moves the cleanup undoes.
const runClock = (f) => {
    const { env } = f;
    let now = 0;
    let effectEnd = null;
    const due = new Map();
    const dueOf = (id, t) => {
        if (!due.has(id)) {
            due.set(id, now + t.ms);
        }
        return due.get(id);
    };
    env.windowManager.connect('switch-workspace', () => {
        effectEnd = now + 150;
    });
    const bad = [];
    env.moveProbe = (w) => {
        if (f.all.some((x) => x.get_compositor_private().origX !== undefined)) {
            bad.push('win' + w.seq + '@' + now);
        }
    };
    const until = (limit) => {
        for (;;) {
            const timers = [...env.timers.entries()].filter(([, t]) => t.ms < 2000);
            let next = null;
            for (const [id, t] of timers) {
                const at = dueOf(id, t);
                if (next === null || at < next[1]) {
                    next = [id, at];
                }
            }
            const effectFirst = effectEnd !== null && (next === null || effectEnd <= next[1]);
            const at = effectFirst ? effectEnd : next ? next[1] : null;
            if (at === null || at > limit) {
                now = limit;
                return;
            }
            now = at;
            if (effectFirst) {
                effectEnd = null;
                f.finishSwitch();
                continue;
            }
            const t = env.timers.get(next[0]);
            env.timers.delete(next[0]);
            due.delete(next[0]);
            t.cb();
        }
    };
    return { until: (ms) => until(now + ms), bad: bad };
};

const keyRepeat = (spacing) => {
    const f = setup();
    // every surface carries its placement, as on the host
    f.app.ops.retileMonitor(f.app, 0, null, false, 0);
    f.app.ops.retileMonitor(f.app, 0, null, false, 1);
    const clock = runClock(f);
    const keys = ['greenTile-swap-left', 'greenTile-swap-left', 'greenTile-swap-left', 'greenTile-swap-left', 'greenTile-auto3'];
    for (const key of keys) {
        f.env.display.focus_window = f.lone;
        f.env.keybindingManager.hotkeys.get(key).cb();
        clock.until(spacing);
    }
    clock.until(3000);
    return { f, bad: clock.bad };
};

test('held key repeat (pushes and a column hotkey inside the effect) ends like the same keys with pauses', () => {
    const fast = keyRepeat(30);
    const slow = keyRepeat(1500);
    assert.deepEqual(fast.bad, [], 'no frame moved while the switch effect still owned the actors');
    assert.deepEqual(desynced(fast.f.all), [], 'every actor is on its frame');
    const where = (r) => r.f.all.map((w) => 'win' + w.seq + '@ws' + (w.get_workspace().index() + 12) + ' ' + w.rect.join(','));
    assert.deepEqual(where(fast), where(slow), 'the fast sequence ended like the paused one');
});

test('runs left after a replayed switch wait behind the new hold; a shared key keeps the newer run', () => {
    const f = setup();
    f.env.windowManager.emit('switch-workspace', f.env.windowManager, 2, 1, LEFT);
    const order = [];
    // the replayed run switches again and parks the surface retile it causes
    f.app.auto.afterSwitch('push', () => {
        order.push('push');
        f.env.windowManager.emit('switch-workspace', f.env.windowManager, 1, 0, LEFT);
        f.app.auto.afterSwitch('surface', (o) => order.push('surface-new settle=' + o.settle + ' layout=' + o.layout), { settle: false, layout: null });
    });
    f.app.auto.afterSwitch('surface', (o) => order.push('surface-old ' + o.settle), { settle: true, layout: 'L' });
    f.app.auto.afterSwitch('press', () => order.push('press'));
    f.finishSwitch();
    fire(f.env, 250);
    assert.deepEqual(order, ['push'], 'the rest did not run inside the new effect');
    f.finishSwitch();
    advance(f.env);
    assert.deepEqual(order, ['push', 'surface-new settle=true layout=L', 'press'],
        'the newer surface run kept its place before the press and took the older settle and layout');
});

test('an explicit arrangement kept from an older request is dropped when the window count changed', () => {
    const f = setup();
    f.env.activeWorkspace = f.ws13;
    f.app.ops.retileMonitor(f.app, 0, f.c, true, 1);
    f.env.windowManager.emit('switch-workspace', f.env.windowManager, 2, 1, LEFT);
    // a swap's explicit fit for the two windows of ws13 ...
    const twoCols = { kind: 'cols', shape: [1, 1], split: null, area: [0, 0, 5120, 1440] };
    f.app.ops.retileMonitor(f.app, 0, f.c, true, 1, twoCols);
    // ... and a third window arrives on ws13 before the hold ends
    const e = makeWindow(f.env, 9, [100, 100, 500, 500], 0, null);
    e.get_workspace = () => f.ws13;
    f.all.push(e);
    f.app.ops.retileMonitor(f.app, 0, null, true, 1);
    f.finishSwitch();
    fire(f.env, 250);
    assert.deepEqual(frames([f.c, f.d, e]).sort(), ['0,0,1707,1440', '1707,0,1706,1440', '3413,0,1707,1440'].sort(),
        'the three windows share the surface instead of two fitted into an old two-column arrangement');
});

// ---- the remaining held paths and the bounds of the hold ----

const openHold = (f) => f.env.windowManager.emit('switch-workspace', f.env.windowManager, 2, 1, LEFT);

test('focus navigation inside the effect waits for the held retiles; a press whose window lost the focus is dropped', () => {
    const f = setup();
    f.env.activeWorkspace = f.ws12;
    f.app.ops.retileMonitor(f.app, 0, null, false, 0);
    openHold(f);
    f.env.display.focus_window = f.b;
    f.env.customBindings.get('push-tile-left')(f.env.display, f.b);
    assert.equal(f.env.display.focus_window, f.b, 'nothing moved the focus inside the effect');
    f.finishSwitch();
    advance(f.env);
    assert.equal(f.env.display.focus_window, f.a, 'after the hold the press moved the focus to the left neighbour');

    openHold(f);
    f.env.display.focus_window = f.b;
    f.env.customBindings.get('push-tile-left')(f.env.display, f.b);
    f.env.display.focus_window = f.c; // the user clicked another window meanwhile
    f.finishSwitch();
    advance(f.env);
    assert.equal(f.env.display.focus_window, f.c, 'the stale press did not take the focus back');
});

test('the settle fan-out inside a hold places today\'s active surface even if the user switched on meanwhile', () => {
    const f = setup();
    f.env.activeWorkspace = f.ws12;
    // Muffin left the ws12 windows somewhere (a restart, a monitor change)
    f.a.rect = [100, 100, 500, 500];
    f.b.rect = [700, 100, 500, 500];
    openHold(f);
    f.app.auto.settleAll(f.app);
    f.env.activeWorkspace = f.ws14; // the user switched on before the hold ended
    f.finishSwitch();
    advance(f.env);
    assert.deepEqual(frames([f.a, f.b]), ['0,0,2560,1440', '2560,0,2560,1440'],
        'ws12, the active workspace at the settle, was placed although ws14 is active at the replay');
});

test('a drop that lands inside the effect is placed after it, and a closed window turns it into a plain retile', () => {
    for (const closeOne of [false, true]) {
        const f = setup();
        f.env.activeWorkspace = f.ws12;
        f.app.ops.retileMonitor(f.app, 0, null, false, 0);
        const before = frames([f.a, f.b]);
        f.app.drop.begin(f.app, f.b, f.env.gi.Meta.GrabOp.MOVING);
        f.b.rect = [0, 0, 400, 1440];
        openHold(f);
        f.env.pointer = [50, 700];
        assert.equal(f.app.drop.end(f.app, f.b, f.env.gi.Meta.GrabOp.MOVING), true, 'the drop applied');
        assert.deepEqual(frames([f.a]), [before[0]], 'no frame of the surface moved inside the effect');
        if (closeOne) {
            f.a.get_compositor_private = () => null; // closed during the hold
            f.all.splice(f.all.indexOf(f.a), 1);
        }
        f.finishSwitch();
        // checked right when the hold ends: the auto observer's own 300 ms retile
        // would re-place the surface anyway and hide what the held drop did
        fire(f.env, 250);
        if (closeOne) {
            assert.deepEqual(f.b.rect, [978, 72, 3164, 1296], 'the remaining window was retiled alone (centred)');
            assert.deepEqual(f.a.rect, before[0].split(',').map(Number), 'the closed window was not placed');
        }
        else {
            assert.notDeepEqual(f.b.rect, [0, 0, 400, 1440], 'the dropped window was placed after the hold');
            assert.ok(f.b.rect[1] <= f.a.rect[1] && f.b.rect[0] <= f.a.rect[0], 'the dropped window took the first cell');
        }
        advance(f.env);
        assert.deepEqual(desynced(f.all), []);
    }
});

test('a chain of switches does not extend the hold past three seconds', () => {
    const f = setup();
    let now = 0;
    f.env.gi.GLib.get_monotonic_time = () => now * 1000;
    openHold(f);
    const first = f.env.liveTimers().find((t) => t.ms === 250).id;
    now = 3100;
    openHold(f);
    assert.equal(f.env.liveTimers().find((t) => t.ms === 250).id, first, 'the running look was not restarted');
    f.finishSwitch();
});

test('a focus chain from an earlier hold does not carry a press over a click in the next hold', () => {
    const f = setup();
    f.env.activeWorkspace = f.ws12;
    f.c.get_workspace = () => f.ws12; // three windows in a row on ws12
    f.app.ops.retileMonitor(f.app, 0, null, false, 0);
    const [x0, x1, x2] = [f.a, f.b, f.c].sort((p, q) => p.rect[0] - q.rect[0]);
    // hold 1: focus left from x2 ends on x1 (chain: origin x2, after x1)
    openHold(f);
    f.env.display.focus_window = x2;
    f.env.customBindings.get('push-tile-left')(f.env.display, x2);
    f.finishSwitch();
    advance(f.env);
    assert.equal(f.env.display.focus_window, x1);
    // the user clicks x2, switches again and presses focus left (Muffin hands x2) ...
    f.env.display.focus_window = x2;
    openHold(f);
    f.env.customBindings.get('push-tile-left')(f.env.display, x2);
    // ... and clicks x1 while the effect still runs
    f.env.display.focus_window = x1;
    f.finishSwitch();
    advance(f.env);
    assert.equal(f.env.display.focus_window, x1, 'the stale press was dropped, the clicked window keeps the focus');
    assert.notEqual(f.env.display.focus_window, x0);
});

test('push, focus, focus inside one hold still moves two cells', () => {
    const f = setup();
    f.env.activeWorkspace = f.ws12;
    f.c.get_workspace = () => f.ws12;
    f.app.ops.retileMonitor(f.app, 0, null, false, 0);
    const [x0, , x2] = [f.a, f.b, f.c].sort((p, q) => p.rect[0] - q.rect[0]);
    openHold(f);
    f.env.display.focus_window = x2;
    f.app.auto.afterSwitch('push', () => f.env.windowManager.emit('switch-workspace', f.env.windowManager, 1, 0, LEFT));
    f.env.customBindings.get('push-tile-left')(f.env.display, x2);
    f.env.customBindings.get('push-tile-left')(f.env.display, x2);
    f.finishSwitch();
    fire(f.env, 250); // the push opens a new hold; both presses are re-held into it
    f.finishSwitch();
    advance(f.env);
    assert.equal(f.env.display.focus_window, x0, 'both presses moved the focus, two cells');
});

test('focus, push, focus inside one hold still moves two cells', () => {
    const f = setup();
    f.env.activeWorkspace = f.ws12;
    f.c.get_workspace = () => f.ws12;
    f.app.ops.retileMonitor(f.app, 0, null, false, 0);
    const [x0, , x2] = [f.a, f.b, f.c].sort((p, q) => p.rect[0] - q.rect[0]);
    openHold(f);
    f.env.display.focus_window = x2;
    f.env.customBindings.get('push-tile-left')(f.env.display, x2);
    f.app.auto.afterSwitch('push', () => f.env.windowManager.emit('switch-workspace', f.env.windowManager, 1, 0, LEFT));
    f.env.customBindings.get('push-tile-left')(f.env.display, x2);
    f.finishSwitch();
    fire(f.env, 250); // the first press runs, the push opens a new hold, the second is re-held
    f.finishSwitch();
    advance(f.env);
    assert.equal(f.env.display.focus_window, x0, 'both presses moved the focus, two cells');
});

test('a focus press re-held behind a replayed push still continues the chain of the press before it', () => {
    const f = setup();
    f.env.activeWorkspace = f.ws12;
    f.c.get_workspace = () => f.ws12;
    f.app.ops.retileMonitor(f.app, 0, null, false, 0);
    const [x0, , x2] = [f.a, f.b, f.c].sort((p, q) => p.rect[0] - q.rect[0]);
    openHold(f);
    f.env.display.focus_window = x2;
    // a held run that switches again (a held push), then the first focus press
    f.app.auto.afterSwitch('push', () => f.env.windowManager.emit('switch-workspace', f.env.windowManager, 1, 0, LEFT));
    f.env.customBindings.get('push-tile-left')(f.env.display, x2);
    f.finishSwitch();
    fire(f.env, 250); // the push replays and opens a new hold; the press is re-held into it
    assert.equal(f.app.auto.switching(), true);
    // the second press arrives during the new hold (Muffin still hands x2)
    f.env.customBindings.get('push-tile-left')(f.env.display, x2);
    f.finishSwitch();
    advance(f.env);
    assert.equal(f.env.display.focus_window, x0, 'both presses moved the focus, two cells');
});

test('two focus presses inside one effect move two cells, as without the hold', () => {
    const f = setup();
    f.env.activeWorkspace = f.ws13;
    // three windows on ws13 in a row: c | d | e
    const e = f.d;
    f.a.get_workspace = () => f.ws13;
    f.app.ops.retileMonitor(f.app, 0, null, false, 1);
    const row = [f.a, f.c, e].sort((p, q) => p.rect[0] - q.rect[0]);
    openHold(f);
    f.env.display.focus_window = row[2];
    // Muffin hands both presses the window focused at the press: the right one
    f.env.customBindings.get('push-tile-left')(f.env.display, row[2]);
    f.env.customBindings.get('push-tile-left')(f.env.display, row[2]);
    f.finishSwitch();
    advance(f.env);
    assert.equal(f.env.display.focus_window, row[0], 'the focus walked two cells to the left');
});

test('a newer request without animation decides over an older animated one', () => {
    const f = setup();
    f.env.activeWorkspace = f.ws12;
    openHold(f);
    const seen = [];
    f.app.auto.afterSwitch('k', (o) => seen.push(o.animate), { animate: 'on' });
    f.app.auto.afterSwitch('k', (o) => seen.push(o.animate), { animate: 'off' });
    f.finishSwitch();
    fire(f.env, 250);
    assert.deepEqual(seen, ['off']);
});

test('a held retile without animation keeps that choice over an older animated request', () => {
    const f = setup();
    openHold(f);
    f.app.ops.retileMonitor(f.app, 0, null, true, 0);
    f.app.ops.retileMonitor(f.app, 0, null, false, 0);
    const held = f.app.auto._afterSwitch.get('0\n0');
    assert.ok(held, 'the surface retile is held');
    assert.equal(held.opts.animate, 'off', 'the newest request decides');
    f.finishSwitch();
    advance(f.env);
});

test('after the total bound the running hold still ends', () => {
    const f = setup();
    let now = 0;
    f.env.gi.GLib.get_monotonic_time = () => now * 1000;
    openHold(f);
    now = 3100;
    openHold(f); // not extended any more
    // the chain's effect keeps running (origX + live ease) — the hold still ends at its cap
    const a = f.a.get_compositor_private();
    a.origX = a.x;
    a.foreignTransition('x', a.x + 10);
    fire(f.env, 250);
    let polls = 0;
    while (f.app.auto.switching() && polls < 100) {
        fireOnce(f.env, 20);
        polls++;
    }
    assert.equal(f.app.auto.switching(), false, 'the hold ended');
    assert.ok(polls <= 38, 'within the 1000 ms cap of the running look');
    a.removeAllTransitions();
    a.origX = undefined;
    f.finishSwitch();
});

test('a held drop whose dragged window still lies mostly on another monitor is placed, not lost', () => {
    const f = setup();
    f.env.activeWorkspace = f.ws12;
    f.app.ops.retileMonitor(f.app, 0, null, false, 0);
    f.app.drop.begin(f.app, f.b, f.env.gi.Meta.GrabOp.MOVING);
    f.b.rect = [0, 0, 400, 1440];
    openHold(f);
    f.env.pointer = [50, 700];
    assert.equal(f.app.drop.end(f.app, f.b, f.env.gi.Meta.GrabOp.MOVING), true);
    f.b.get_monitor = () => 1; // the frame's larger part is still on the source monitor
    f.finishSwitch();
    fire(f.env, 250);
    assert.notDeepEqual(f.b.rect, [0, 0, 400, 1440], 'the dropped window was placed after the hold');
    assert.ok(f.b.rect[0] <= f.a.rect[0] && f.b.rect[1] <= f.a.rect[1], 'into the first cell, as dropped');
    assert.notDeepEqual(f.a.rect, [978, 72, 3164, 1296], 'the resident was not retiled alone');
});

test('a held drop whose neighbour moved to another workspace becomes a plain retile', () => {
    const f = setup();
    f.env.activeWorkspace = f.ws12;
    f.app.ops.retileMonitor(f.app, 0, null, false, 0);
    f.app.drop.begin(f.app, f.b, f.env.gi.Meta.GrabOp.MOVING);
    f.b.rect = [0, 0, 400, 1440];
    openHold(f);
    f.env.pointer = [50, 700];
    assert.equal(f.app.drop.end(f.app, f.b, f.env.gi.Meta.GrabOp.MOVING), true);
    f.a.change_workspace_by_index(2); // moved to ws14 during the hold
    f.finishSwitch();
    fire(f.env, 250);
    assert.deepEqual(f.b.rect, [978, 72, 3164, 1296], 'the remaining window was retiled alone (centred)');
});

test('at most 32 presses wait in one hold', () => {
    const f = setup();
    openHold(f);
    let ran = 0;
    for (let i = 0; i < 40; i++) {
        f.app.auto.afterSwitchPress(() => {
            ran += 1;
        });
    }
    assert.equal(f.env.logs.filter((l) => /dropping the rest/.test(l)).length, 1, 'the flood was reported once');
    f.finishSwitch();
    advance(f.env);
    assert.equal(ran, 32);
});

test('only the time an override spent inside the hold is added to it', () => {
    const f = setup();
    let now = 1000;
    f.env.gi.GLib.get_monotonic_time = () => now * 1000;
    f.app.auto.sortOverride(77, [0, 0, 1, 1], 500); // set 500 ms before the hold
    openHold(f);
    now = 1200;
    f.app.auto.sortOverride(78, [0, 0, 1, 1], 1200); // set inside the hold
    now = 1900;
    f.finishSwitch();
    advance(f.env);
    assert.equal(f.app.auto._overrides.get(77).at, 1400, 'the old override gained exactly the 900 ms of the hold');
    assert.equal(f.app.auto._overrides.get(78).at, 1900, 'the new one gained its own 700 ms, never more than now');
});

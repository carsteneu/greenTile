'use strict';
// A retile places the FRAME rect; the compositor actor normally follows it. After rapid
// successive placements Muffin's actor of a client-decorated (CSD, sync-request) window
// can stay stuck at an intermediate position/size while the frame rect AND the X server
// are already correct — measured live on the host after a Super+Ctrl+Left push chain
// (frame at cell 3, actor still at cell 4, so cell 3 looked empty and the cell-4 window
// was covered; the frame measured 1711 while the actor sat at 2548). Re-issuing the SAME
// rect is a no-op in Muffin; a DIFFERENT rect and then the target rect makes the actor
// follow (live-proven).
//
// greenTile must therefore verify once after a placement that every placed window's actor
// followed, and nudge exactly once when it did not.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    makeEnv, makeWindow, makeWorkspace, enableOnMonitors,
} = require('../helpers/fakes/cinnamon-harness');
const { makeEaseActor } = require('../helpers/fakes/ease-actor');

const MONITOR = { x: 0, y: 0, width: 2000, height: 1100, index: 0 };
const SYNC_MS = 320;
// A client-decorated (CSD) window draws its frame inside a larger buffer: the actor sits
// left of and above the frame rect by the GTK frame extents (16,10 left/top, 16,32
// right/bottom on the host's Brave). The resync must preserve that offset.
const CSD_OFFSET = [-16, -10, -32, -42];

// Fire every timer of one delay, like the main loop reaching them.
const fireAll = (env, ms) => {
    for (const [id, timer] of [...env.timers]) {
        if (timer.ms === ms) {
            env.timers.delete(id);
            timer.cb();
        }
    }
};
const liveAt = (env, ms) => env.liveTimers().filter((t) => t.ms === ms).length;

// The shell's own actor geometry on top of the shared ease-actor fake: Muffin writes
// x/y/width/height from the frame rect. `stale` models the measured defect — the sync is
// stuck, so the first request after it is lost and a repeat of a request is a no-op, while
// a request that DIFFERS from the last one seen makes the actor follow again.
const actorFor = (stale, rect, off = [0, 0, 0, 0]) => {
    const actor = makeEaseActor();
    actor.x = rect[0] + off[0];
    actor.y = rect[1] + off[1];
    actor.width = rect[2] + off[2];
    actor.height = rect[3] + off[3];
    actor.lastReq = rect.slice();
    actor.stuck = stale;
    actor.sync = (x, y, w, h) => {
        const same = actor.lastReq && actor.lastReq.join() === [x, y, w, h].join();
        actor.lastReq = [x, y, w, h];
        if (actor.stuck) {
            if (!same) {
                actor.stuck = false; // a differing request unsticks the sync —
            }
            return; // ... but this one is still lost: the actor does not follow it
        }
        actor.x = x + off[0];
        actor.y = y + off[1];
        actor.width = w + off[2];
        actor.height = h + off[3];
    };
    return actor;
};
// Wire the actor into the window the way Muffin does: every frame move re-syncs it. The
// user-op flag of each move is recorded so a test can tell a repair from a placement.
const withActor = (env, seq, rect, actor) => {
    const w = makeWindow(env, seq, rect, 0, actor);
    const native = w.move_resize_frame.bind(w);
    w.userOps = [];
    w.move_resize_frame = (userOp, x, y, width, height) => {
        w.userOps.push(userOp);
        native(userOp, x, y, width, height);
        actor.sync(x, y, width, height);
    };
    return w;
};
const offset = (actor, w) => {
    const f = w.get_frame_rect();
    return [actor.x - f.x, actor.y - f.y, actor.width - f.width, actor.height - f.height];
};
const resizeCalls = (w) => w.moves.filter((m) => m[0] === 'resize').length;
const resyncs = (env) => env.logs.filter((l) => l.indexOf('greenTile actor resync') === 0).length;

const setup = (staleFirst) => {
    const { env, ext } = makeEnv();
    enableOnMonitors(env, ext, [MONITOR]);
    const app = ext.currentSession().app;
    const ws = makeWorkspace(env);
    ws.index = () => 0;
    ws.list_windows = () => env.tabList;
    env.activeWorkspace = ws;
    app.ops.layoutSet(app, 0, 0, { auto: true });
    const a = actorFor(staleFirst, [500, 0, 700, 600], CSD_OFFSET);
    const b = actorFor(false, [900, 0, 900, 1100]);
    const w1 = withActor(env, 1, [500, 0, 700, 600], a);
    const w2 = withActor(env, 2, [900, 0, 900, 1100], b);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    return { env, ext, app, w1, w2, a, b };
};

test('a stuck compositor actor is re-synced after the placement that displaced it', () => {
    const f = setup(true);
    const { env, app, w1, w2, a, b } = f;
    const before = offset(a, w1);
    const bBefore = offset(b, w2);
    app.ops.retileMonitor(app, 0, w1, true, 0);
    assert.notDeepEqual(offset(a, w1), before, 'the model reproduces the host defect: the frame moved, the actor did not');
    fireAll(env, SYNC_MS);
    assert.deepEqual(offset(a, w1), before, 'the actor ended up in sync with its frame');
    assert.deepEqual(offset(a, w1), CSD_OFFSET, 'the CSD decoration offset was preserved, not equalized');
    assert.deepEqual(offset(b, w2), bBefore, 'the window that followed keeps its own offsets');
    assert.equal(resizeCalls(w1), 3, 'the placement plus exactly one nudge pair');
    assert.deepEqual(w1.userOps.slice(-2), [false, false], 'the repair is marked as not a user move');
    assert.equal(resizeCalls(w2), 1, 'an actor that followed is never nudged');
    assert.equal(resyncs(env), 1, 'the repair is reported once');
});

test('an actor that followed needs no nudge', () => {
    const f = setup(false);
    const { env, app, w1, w2, a } = f;
    const before = offset(a, w1);
    app.ops.retileMonitor(app, 0, w1, true, 0);
    assert.deepEqual(offset(a, w1), before, 'the actor followed the placement');
    fireAll(env, SYNC_MS);
    assert.deepEqual(offset(a, w1), before, 'the actor still matches its frame');
    assert.equal(resizeCalls(w1), 1, 'only the placement move');
    assert.equal(resizeCalls(w2), 1, 'only the placement move');
    assert.equal(resyncs(env), 0, 'nothing to report');
});

test('a newer placement on the same surface supersedes the pending check', () => {
    const f = setup(true);
    const { env, app, w1, a } = f;
    app.ops.retileMonitor(app, 0, w1, true, 0);
    // a third window makes the next placement move the frame again
    const w3 = withActor(env, 3, [1800, 0, 200, 400], actorFor(false, [1800, 0, 200, 400]));
    env.tabList.push(w3);
    app.ops.retileMonitor(app, 0, w1, true, 0);
    assert.equal(liveAt(env, SYNC_MS), 1, 'one pending check per surface, not one per placement');
    fireAll(env, SYNC_MS);
    assert.deepEqual(offset(a, w1), CSD_OFFSET, 'the actor is in sync with its frame');
    assert.equal(resizeCalls(w1), 4, 'two placements and exactly one nudge pair');
    assert.equal(resyncs(env), 1, 'the superseded check did not fire a second repair');
});

test('a window without an actor and a minimized window are never nudged', () => {
    const f = setup(true);
    const { env, app, w1, a } = f;
    const bare = withActor(env, 4, [0, 0, 300, 300], actorFor(true, [0, 0, 300, 300]));
    bare.get_compositor_private = () => null;
    const min = withActor(env, 5, [1800, 0, 200, 300], actorFor(true, [1800, 0, 200, 300]));
    min.minimized = true;
    env.tabList.push(bare, min);
    env.display.focus_window = w1;
    app.ops.retileMonitor(app, 0, w1, true, 0);
    fireAll(env, SYNC_MS);
    const lines = env.logs.filter((l) => l.indexOf('greenTile actor resync') === 0);
    assert.equal(lines.length, 1, 'one repair line');
    assert.match(lines[0], /n=1$/, 'only the window that has an actor was nudged');
    assert.equal(resizeCalls(bare), 1, 'an actor-less window is placed but never nudged');
    assert.equal(resizeCalls(min), 0, 'a minimized window is not placed and not nudged');
    assert.deepEqual(offset(a, w1), CSD_OFFSET, 'the stuck actor was repaired');
});

test('a maximized or fullscreen window is never nudged', () => {
    const f = setup(true);
    const { env, app, w1 } = f;
    const maxed = withActor(env, 6, [0, 0, 600, 600], actorFor(true, [0, 0, 600, 600]));
    maxed.get_maximized = () => 3;
    const full = withActor(env, 7, [1400, 0, 600, 600], actorFor(true, [1400, 0, 600, 600]));
    full.is_fullscreen = () => true;
    env.tabList.push(maxed, full);
    env.display.focus_window = w1;
    app.ops.retileMonitor(app, 0, w1, true, 0);
    const placed = [resizeCalls(maxed), resizeCalls(full)];
    fireAll(env, SYNC_MS);
    assert.deepEqual([resizeCalls(maxed), resizeCalls(full)], placed, 'neither mode was disturbed');
    const lines = env.logs.filter((l) => l.indexOf('greenTile actor resync') === 0);
    assert.equal(lines.length, 1, 'only the tiled window was repaired');
    assert.match(lines[0], /n=1$/, 'the maximized and the fullscreen window were skipped');
});

test('a window that dies before the check leaves the others repaired and throws nothing', () => {
    const f = setup(true);
    const { env, app, w1, a } = f;
    const dead = withActor(env, 8, [1500, 0, 400, 400], actorFor(true, [1500, 0, 400, 400]));
    env.tabList.push(dead);
    env.display.focus_window = w1;
    app.ops.retileMonitor(app, 0, w1, true, 0);
    // closed while the check is pending: the wrapper is finalized, so only
    // get_compositor_private still reads (null) and the state getters throw
    dead.get_compositor_private = () => null;
    dead.get_maximized = () => {
        throw new Error('finalized wrapper');
    };
    dead.is_fullscreen = () => {
        throw new Error('finalized wrapper');
    };
    fireAll(env, SYNC_MS);
    assert.deepEqual(offset(a, w1), CSD_OFFSET, 'the other windows of the surface were still repaired');
    assert.equal(resyncs(env), 1, 'one repair line, no error escaped the timer');
});

test('disable leaves no pending check behind', () => {
    const f = setup(true);
    const { env, app, w1 } = f;
    app.ops.retileMonitor(app, 0, w1, true, 0);
    assert.equal(liveAt(env, SYNC_MS), 1, 'the check is armed');
    f.ext.disable();
    assert.equal(env.liveTimers().length, 0, 'no timer left running');
});

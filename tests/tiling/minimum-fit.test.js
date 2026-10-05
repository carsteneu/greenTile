'use strict';
// Application-enforced minimum frames, driven through the REAL extension.js on the
// fake Cinnamon runtime. A window whose application refuses a smaller size model
// (the `minSize` option on the fake MetaWindow) keeps its minimum, so a nominal cell
// below it makes the settled frame overflow its cell. greenTile must widen the
// affected column and shift the right-hand columns; when the widths no longer fit it
// must use fewer columns / more vertical stacking. The settled ACTUAL rectangles are
// asserted (no positive overlap, contained in the usable area, intended order), and
// focus / swap / drag-and-drop must operate on that effective geometry — not on the
// nominal cells the naive placement asked for.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    makeEnv, makeWindow, makeWorkspace, settingsInstance, enableOnMonitors,
} = require('../helpers/fakes/cinnamon-harness');

const WIDE = { x: 0, y: 0, width: 2400, height: 1100 };
const WIDE_MON = { x: 0, y: 0, width: 2400, height: 1100 };
const MON = { x: 0, y: 0, width: 2000, height: 1100 };

// A real active workspace: the collector reads it by index, the retile's
// fresh-append gate compares against it, the reading order reads its index.
const activeWorkspace = (env) => {
    const ws = makeWorkspace(env);
    ws.index = () => 0;
    env.activeWorkspace = ws;
    return ws;
};

const overlap = (a, b) => Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]))
    * Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));

const assertNoOverlap = (wins, label) => {
    for (let i = 0; i < wins.length; i++) {
        for (let j = i + 1; j < wins.length; j++) {
            assert.equal(overlap(wins[i].rect, wins[j].rect), 0,
                `${label}: w${wins[i].seq} ${JSON.stringify(wins[i].rect)} overlaps w${wins[j].seq} ${JSON.stringify(wins[j].rect)}`);
        }
    }
};

const assertContained = (wins, mon, label) => {
    for (const w of wins) {
        assert.ok(w.rect[0] >= mon.x && w.rect[1] >= mon.y
            && w.rect[0] + w.rect[2] <= mon.x + mon.width && w.rect[1] + w.rect[3] <= mon.y + mon.height,
            `${label}: w${w.seq} ${JSON.stringify(w.rect)} left the usable area`);
    }
};

// Enable auto on monitor 0, build the windows from specs and retile once.
// A spec is [seq, rect, minSize?].
const autoRetile = (mon, specs, gap = 0) => {
    const { env, ext } = makeEnv({ windowGap: gap });
    enableOnMonitors(env, ext, [mon]);
    activeWorkspace(env);
    const wins = specs.map(([seq, rect, minSize]) => makeWindow(env, seq, rect, 0, null, { minSize: minSize || null }));
    env.tabList.push(...wins);
    env.display.focus_window = wins[0];
    const app = ext.currentSession().app;
    app.ops.layoutSet(app, 0, 0, { auto: true });
    app.ops.retileMonitor(app, 0);
    return { env, ext, app, wins };
};

// ---------------- invariant: nothing changes without an observed minimum ----------------

test('minimum-fit: no application minimum leaves the nominal grid byte-identical', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitors(env, ext, [WIDE]);
    activeWorkspace(env);
    const w1 = makeWindow(env, 1, [0, 0, 300, 300], 0);
    const w2 = makeWindow(env, 2, [400, 0, 300, 300], 0);
    const w3 = makeWindow(env, 3, [800, 0, 300, 300], 0);
    env.tabList.push(w1, w2, w3);
    env.display.focus_window = w1;
    const app = ext.currentSession().app;
    app.ops.layoutSet(app, 0, 0, { auto: true });
    const before = settingsInstance(env).getValue('layouts');
    app.ops.retileMonitor(app, 0);
    assert.deepEqual([w1.rect, w2.rect, w3.rect],
        [[0, 0, 800, 1100], [800, 0, 800, 1100], [1600, 0, 800, 1100]],
        'the unconstrained wide grid is unchanged');
    assert.equal(settingsInstance(env).getValue('layouts'), before, 'no settings write for a plain retile');
});

// ---------------- 1: widen the affected column, shift the right-hand one ----------------

test('minimum-fit: a refused column widens and shifts its right-hand neighbour', () => {
    const { wins } = autoRetile(MON, [
        [1, [0, 0, 400, 300], [1400, 0]],
        [2, [500, 0, 400, 300], [500, 0]],
    ]);
    const [w1, w2] = wins;
    assert.deepEqual(w1.rect, [0, 0, 1400, 1100], 'the refused column holds its minimum');
    assert.deepEqual(w2.rect, [1400, 0, 600, 1100], 'the right-hand column is shifted and keeps the rest');
    assertNoOverlap(wins, 'widening');
    assertContained(wins, MON, 'widening');
});

// ---------------- 2: horizontal shortage -> vertical stacking ----------------

test('minimum-fit: two minima that do not fit side by side stack vertically', () => {
    const { app, wins } = autoRetile(MON, [
        [1, [0, 0, 400, 300], [1100, 0]],
        [2, [500, 0, 400, 300], [950, 0]],
    ]);
    const [w1, w2] = wins;
    assert.deepEqual(w1.rect, [0, 0, 2000, 550], 'the first window takes the top row');
    assert.deepEqual(w2.rect, [0, 550, 2000, 550], 'the second stacks below it');
    assertNoOverlap(wins, 'stack');
    assertContained(wins, MON, 'stack');
    assert.deepEqual([w1.get_monitor(), w2.get_monitor()], [0, 0], 'both stay on the same monitor');
    assert.equal(app.ops.layoutFor(app, 0, 0).auto, true, 'the workspace was not paused or moved');
});

// ---------------- 3: a stack that a window refuses in height ----------------

test('minimum-fit: a height a stacked row refuses is honoured from the readback', () => {
      // Three 800 px widths cannot share a 2000 px row; the third window also needs
      // 700 px of height. A full-width row above a two-cell row is feasible.
      const { env, app, wins } = autoRetile(MON, [
        [1, [0, 0, 300, 300], [800, 0]],
        [2, [400, 0, 300, 300], [800, 0]],
        [3, [800, 0, 300, 300], [800, 700]],
    ]);
    const [a, b, c] = wins;
    assert.equal(c.rect[3], 700, 'the refused height is honoured from the readback');
    assert.ok(a.rect[2] >= 800 && b.rect[2] >= 800 && c.rect[2] >= 800, 'every width minimum holds');
      assertNoOverlap(wins, 'height');
      assertContained(wins, MON, 'height');
      assert.ok(a.rect[1] < b.rect[1] && b.rect[1] === c.rect[1] && b.rect[0] < c.rect[0],
          'the fitted reading order stays A, B, C');
      const before = settingsInstance(env).getValue('layouts');
      assert.deepEqual(JSON.parse(before)[app.monitors.keys[0]]['1'], { auto: true },
          'the feasible adaptation stores neither shapes nor splits');
    // stability: a second retile on the settled arrangement reproduces it
    const settled = wins.map((w) => w.rect.slice());
    app.ops.retileMonitor(app, 0, null, false);
      assert.deepEqual(wins.map((w) => w.rect), settled, 'the arrangement is stable across retiles');
      assert.equal(settingsInstance(env).getValue('layouts'), before, 'retile does not rewrite settings');
});

// ---------------- 4: focus / swap / DnD follow the effective cells ----------------

const stacked = () => autoRetile(MON, [
    [1, [0, 0, 400, 300], [1100, 0]],
    [2, [500, 0, 400, 300], [950, 0]],
]);

test('minimum-fit: focus-down follows the effective stacked neighbour', () => {
    const { env, wins } = stacked();
    const [w1, w2] = wins;
    env.display.focus_window = w1;
    const pushed = [];
    env.display.push_tile = (w, dir) => pushed.push([w, dir]);
    env.customBindings.get('push-tile-down')(env.display, w1);
    assert.deepEqual(pushed, [], 'the native push-tile was not used');
    assert.equal(env.display.focus_window, w2, 'focus moved to the stacked window below');
});

test('minimum-fit: swap-down exchanges the effective stacked cells', () => {
    const { env, wins } = stacked();
    const [w1, w2] = wins;
    env.display.focus_window = w1;
    env.keybindingManager.hotkeys.get('greenTile-swap-down').cb();
    assert.deepEqual(w1.rect, [0, 550, 2000, 550], 'the focused window landed in the lower cell');
    assert.deepEqual(w2.rect, [0, 0, 2000, 550], 'the neighbour landed in the upper cell');
    assertNoOverlap(wins, 'swap');
});

test('minimum-fit: a drop targets the effective cell under the pointer', () => {
    const { env, app, wins } = stacked();
    const [w1, w2] = wins;
    // w2 sits in the lower 550. A pointer in the upper effective cell must resolve to
    // w1; the nominal side-by-side grid would have put (1000, 200) in its right cell.
    env.pointer = [1000, 200];
    app.drop.begin(app, w2, env.gi.Meta.GrabOp.MOVING);
    const hit = app.drop.target(app, w2, 1000, 200);
    assert.ok(hit, 'the pointer resolved to a target');
    assert.equal(hit.ordered[hit.toIndex], w1, 'the upper stacked window is the drop target');
});

// ---------------- 5: column hotkey, fewer windows than requested columns ----------------

test('minimum-fit: the column hotkey widens within the real usable area', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitors(env, ext, [WIDE]);
    activeWorkspace(env);
    const w1 = makeWindow(env, 1, [0, 0, 300, 300], 0, null, { minSize: [1000, 0] });
    const w2 = makeWindow(env, 2, [400, 0, 300, 300], 0, null, { minSize: [400, 0] });
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    // three columns of the 2400 px area are 800 px each; the first refused 800, so the
    // arrangement is refitted over the REAL usable width and both columns share it
    env.keybindingManager.hotkeys.get('greenTile-auto3').cb();
    assert.deepEqual([w1.rect, w2.rect], [[0, 0, 1200, 1100], [1200, 0, 1200, 1100]],
        'both minima hold within the real usable width');
    assertNoOverlap([w1, w2], 'columns');
    assertContained([w1, w2], WIDE, 'columns');
});

// ---------------- 6: no permanent squeeze once the constraint is gone ----------------

test('minimum-fit: the nominal grid returns once the constrained window is gone', () => {
    const { env, app, wins } = autoRetile(MON, [
        [1, [0, 0, 400, 300], [1400, 0]],
        [2, [500, 0, 400, 300], [0, 0]],
    ]);
    const [w1, w2] = wins;
    assert.deepEqual(w2.rect, [1400, 0, 600, 1100], 'precondition: the neighbour was shifted');
    // w1 closes, an unconstrained window takes the slot: the stale minimum must not
    // keep squeezing the new window
    w1.emit('unmanaged');
    env.tabList.splice(env.tabList.indexOf(w1), 1);
    const w3 = makeWindow(env, 3, [0, 0, 400, 300], 0, null, { minSize: [0, 0] });
    env.tabList.push(w3);
    app.ops.retileMonitor(app, 0, null, false);
    assert.deepEqual([w3.rect, w2.rect],
        [[0, 0, 1000, 1100], [1000, 0, 1000, 1100]],
        'the nominal side-by-side grid is restored');
});

test('minimum-fit: an automatic adaptation never rewrites the stored layouts', () => {
    const { app, env } = autoRetile(MON, [
        [1, [0, 0, 400, 300], [1400, 0]],
        [2, [500, 0, 400, 300], [500, 0]],
    ]);
    const stored = JSON.parse(settingsInstance(env).getValue('layouts'));
    assert.deepEqual(stored[app.monitors.keys[0]]['1'], { auto: true },
        'no shape or split was persisted for the runtime fit');
});

// ---------------- byte-identity on a tight monitor: the greenTile floor is not an app minimum ----------------

test('minimum-fit: cells below the greenTile floor but above every app minimum keep the legacy grid', () => {
    // 3 columns of a 300 px area are 100 px each — below SPLIT_MIN_PX (120) but no
    // application refuses anything. The greenTile floor only ever shrank an equal
    // division; it must never be read as an application minimum and regroup the shape.
    const { wins } = autoRetile({ x: 0, y: 0, width: 300, height: 1100 }, [
        [1, [0, 0, 80, 300]],
        [2, [100, 0, 80, 300]],
        [3, [200, 0, 80, 300]],
    ]);
    assert.deepEqual(wins.map((w) => w.rect),
        [[0, 0, 100, 1100], [100, 0, 100, 1100], [200, 0, 100, 1100]],
        'the legacy equal shrink is unchanged where no application refused');
});

test('minimum-fit: the greenTile floor alone never regroups the shape', () => {
    const { wins } = autoRetile({ x: 0, y: 0, width: 340, height: 1100 }, [
        [1, [0, 0, 80, 300]],
        [2, [100, 0, 80, 300]],
        [3, [200, 0, 80, 300]],
    ]);
    assert.deepEqual(wins.map((w) => w.rect[3]), [1100, 1100, 1100],
        'nothing was stacked — the shape did not regroup');
    assert.deepEqual(wins.map((w) => Math.round(w.rect[0])), [0, 114, 227],
        'three columns stay side by side, spanning the area');
    assertNoOverlap(wins, 'tight grid');
    assertContained(wins, { x: 0, y: 0, width: 340, height: 1100 }, 'tight grid');
});

// ---------------- convergence with minima on both axes and a reshape in between ----------------

test('minimum-fit: a reshape in one pass, a refused row height in the next, still settles without overlap', () => {
    // 4 nominal columns cannot hold three 900 px minima: the shape regroups to 2+1+1,
    // which stacks two windows — and only then does the first window's *height*
    // minimum (800) become visible, because the side-by-side grid always gave it the
    // full height. The refit has to run past the first reveal to settle.
    const { wins } = autoRetile(MON, [
        [1, [0, 0, 400, 300], [900, 800]],
        [2, [500, 0, 400, 300], [900, 0]],
        [3, [900, 0, 400, 300], [900, 0]],
        [4, [1300, 0, 400, 300], [0, 0]],
    ]);
    assertNoOverlap(wins, 'both-axis chain');
    assertContained(wins, MON, 'both-axis chain');
    const [w1] = wins;
    assert.ok(w1.rect[2] >= 900, 'the refused width is honoured');
    assert.ok(w1.rect[3] >= 800, 'the refused height is honoured after the reshape');
});

// ---------------- a manual resize must stay persistable on a regrouped arrangement ----------------

test('minimum-fit: a resize on a regrouped arrangement sticks and does not destroy the stored split', () => {
    const { env, app, wins } = stacked();
    const [w1, w2] = wins;
    assert.equal(w1.rect[3], 550, 'precondition: the two windows are stacked');
    env.display.focus_window = w1;
    env.keybindingManager.hotkeys.get('greenTile-resize-taller').cb();
    assert.notEqual(w1.rect[3], 550, 'the resize took effect on the effective arrangement');
    assert.equal(w2.rect[1], w1.rect[3], 'the neighbour follows, still no overlap');
    assertNoOverlap(wins, 'resize');
    // The user's resize must survive a plain retile: the stored split has to be
    // readable against the arrangement the fit actually produces.
    const after = wins.map((w) => w.rect.slice());
    app.ops.retileMonitor(app, 0, null, false);
    assert.deepEqual(wins.map((w) => w.rect), after, 'the stored resize is read back, not silently dropped');
});

// Splits persisted in the layouts setting, across every monitor/workspace entry.
const storedSplits = (env) => {
    const stored = JSON.parse(settingsInstance(env).getValue('layouts') || '{}');
    /** @type {any[]} */
    const splits = [];
    for (const mon of Object.values(stored)) {
        for (const wsEntry of Object.values(mon)) {
            if (wsEntry && wsEntry.splits) {
                splits.push(...Object.values(wsEntry.splits));
            }
        }
    }
    return splits;
};

test('minimum-fit: a regrouped resize persists the effective shape and survives a retile', () => {
    const { env, app, wins } = stacked();
    env.display.focus_window = wins[0];
    env.keybindingManager.hotkeys.get('greenTile-resize-taller').cb();
    const resized = wins.map((w) => w.rect.slice());
    // the hotkey debounces its settings write, so flush before reading them
    app.split.flush(app);
    const splits = storedSplits(env);
    assert.ok(splits.length > 0, 'the resize reached the settings');
    for (const split of splits) {
        assert.deepEqual(split.shape, [1, 1],
            'a persisted split describes the effective shape, not the nominal one');
    }
    // read back from the settings alone: the pending map is empty after flush
    app.ops.retileMonitor(app, 0, null, false);
    assert.deepEqual(wins.map((w) => w.rect), resized, 'the persisted resize is read back, not dropped');
});

test('minimum-fit: the latest resize for a window count wins, whatever shape it was made in', () => {
    // The stored border preference is keyed by window count (the settings schema only
    // allows numeric keys), exactly as before this change: a newer resize supersedes an
    // older one for the same count. The adaptation does not add a second store.
    const { env, app, wins } = stacked();
    assert.equal(storedSplits(env).length, 0, 'the adaptation itself writes nothing');
    env.display.focus_window = wins[0];
    env.keybindingManager.hotkeys.get('greenTile-resize-taller').cb();
    app.split.flush(app);
    assert.equal(storedSplits(env).length, 1, 'the manual resize is the only writer');
});

// ---------------- the column hotkey when the minima exhaust the width ----------------

test('minimum-fit: the column hotkey reserves the gap in its widened budget', () => {
    // The minima exactly fill the width: with a gap the shifted columns would poke past
    // the right edge, so the arranged columns have to become the fallback instead.
    const { env, ext } = makeEnv({ windowGap: 12 });
    enableOnMonitors(env, ext, [WIDE_MON]);
    activeWorkspace(env);
    const w1 = makeWindow(env, 1, [0, 0, 300, 300], 0, null, { minSize: [1200, 0] });
    const w2 = makeWindow(env, 2, [400, 0, 300, 300], 0, null, { minSize: [1200, 0] });
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    env.keybindingManager.hotkeys.get('greenTile-auto3').cb();
    assertContained([w1, w2], WIDE_MON, 'gap budget');
    assertNoOverlap([w1, w2], 'gap budget');
});

test('minimum-fit: the column hotkey stacks when the minima exhaust the width', () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitors(env, ext, [WIDE_MON]);
    activeWorkspace(env);
    const w1 = makeWindow(env, 1, [0, 0, 300, 300], 0, null, { minSize: [2000, 0] });
    const w2 = makeWindow(env, 2, [400, 0, 300, 300], 0, null, { minSize: [500, 0] });
    const w3 = makeWindow(env, 3, [800, 0, 300, 300], 0, null, { minSize: [500, 0] });
    env.tabList.push(w1, w2, w3);
    env.display.focus_window = w1;
    env.keybindingManager.hotkeys.get('greenTile-auto3').cb();
    assertNoOverlap([w1, w2, w3], 'exhausted columns');
    assertContained([w1, w2, w3], WIDE_MON, 'exhausted columns');
    assert.ok(w1.rect[2] >= 2000, 'the widest minimum is honoured');
});

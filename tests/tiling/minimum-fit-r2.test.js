'use strict';
// R2 acceptance fixtures — the five defects the orchestrator reproduced independently.
// Exact scenarios, driven through the REAL extension.js on the fake Cinnamon runtime,
// asserting settled ACTUAL rectangles and the persisted settings. These are the RED
// regression fixtures for the R2 rework; the earlier file covers the surrounding
// behaviour (byte-identity, focus/swap, gap budget).
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    makeEnv, makeWindow, makeWorkspace, settingsInstance, enableOnMonitors,
} = require('../helpers/fakes/cinnamon-harness');

const overlap = (a, b) => Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]))
    * Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
const assertNoOverlap = (wins, label) => {
    for (let i = 0; i < wins.length; i++) {
        for (let j = i + 1; j < wins.length; j++) {
            assert.equal(overlap(wins[i].rect, wins[j].rect), 0, `${label}: overlap`);
        }
    }
};
const assertContained = (wins, mon, label) => {
    for (const w of wins) {
        assert.ok(w.rect[0] >= mon.x && w.rect[1] >= mon.y
            && w.rect[0] + w.rect[2] <= mon.x + mon.width && w.rect[1] + w.rect[3] <= mon.y + mon.height,
            `${label}: ${JSON.stringify(w.rect)} left the usable area`);
    }
};
const activeWs = (env) => {
    const ws = makeWorkspace(env);
    ws.index = () => 0;
    env.activeWorkspace = ws;
};
const setup = (mon, gap, specs) => {
    const { env, ext } = makeEnv({ windowGap: gap });
    enableOnMonitors(env, ext, [mon]);
    activeWs(env);
    const wins = specs.map(([seq, rect, min]) => makeWindow(env, seq, rect, 0, null, { minSize: min || null }));
    env.tabList.push(...wins);
    env.display.focus_window = wins[0];
    return { env, ext, app: ext.currentSession().app, wins };
};

// 1 — uneven grouping: the balanced 2+1 needs 1300 px of height in one column and the
// three-wide needs 2700 px of width, so only the UNEVEN 1+2 fits.
test('R2-1: an uneven feasible grouping is used instead of overlapping', () => {
    const MON = { x: 0, y: 0, width: 2000, height: 1100 };
    const { env, wins } = setup(MON, 12, [
        [1, [0, 0, 300, 300], [1050, 800]],
        [2, [400, 0, 300, 300], [750, 500]],
        [3, [800, 0, 300, 300], [900, 300]],
    ]);
    env.keybindingManager.hotkeys.get('greenTile-auto3').cb();
    assert.deepEqual(wins.map((w) => w.rect),
        [[0, 0, 1050, 1100], [1062, 0, 938, 544], [1062, 556, 938, 544]],
        'the feasible uneven [1,2] grouping');
    assertNoOverlap(wins, 'uneven');
    assertContained(wins, MON, 'uneven');
});

// 2 — drag&drop must transform the EFFECTIVE shape, not the nominal one, and the result
// must be stored and survive the retile.
test('R2-2: a drop uses the effective shape end to end and persists it', () => {
    const MON = { x: 0, y: 0, width: 2400, height: 1100 };
    const { env, app, wins } = setup(MON, 0, [
        [1, [0, 0, 300, 300], [1300, 0]],
        [2, [400, 0, 300, 300], [500, 0]],
        [3, [800, 0, 300, 300], [1300, 0]],
        [4, [1200, 0, 300, 300], [500, 0]],
    ]);
    app.ops.layoutSet(app, 0, 0, { auto: true });
    app.ops.retileMonitor(app, 0);
    // the minima regroup the four side-by-side cells into two rows of two
    assert.deepEqual(wins.map((w) => w.rect),
        [[0, 0, 1300, 550], [1300, 0, 1100, 550], [0, 550, 1300, 550], [1300, 550, 1100, 550]],
        'precondition: effective rows [2,2]');
    const D = wins[3];
    env.pointer = [600, 540];
    app.drop.begin(app, D, env.gi.Meta.GrabOp.MOVING);
    D.move_frame(false, 600, 530);
    assert.equal(app.drop.end(app, D, env.gi.Meta.GrabOp.MOVING), true, 'the drop applied');
    app.ops.retileMonitor(app, 0, null, false);
    // dropping D under A's cell opens a new row for D at the effective shape: [2,2]
    // becomes [2,1,1] with D in the new row (order 0,1,3,2) — not the [4]-nominal
    // derivative, which dropped the window somewhere the preview never showed
    assert.deepEqual(wins.map((w) => w.rect),
        [[0, 0, 1300, 367], [1300, 0, 1100, 367], [0, 733, 2400, 367], [0, 367, 2400, 366]],
        'the effective-shape drop result');
    assertNoOverlap(wins, 'drop');
    assertContained(wins, MON, 'drop');
    const shapes = JSON.parse(settingsInstance(env).getValue('layouts'));
    const monitor = Object.values(shapes)[0];
    const entry = Object.values(monitor)[0];
    assert.ok(entry.shapes, 'the drop stored its shape');
    const stored = Object.values(entry.shapes)[0];
    assert.deepEqual(stored, { kind: 'rows', shape: [2, 1, 1] },
        'the stored shape is the effective-shape transform');
});

// 3 — at a window's real minimum, "narrower" changes nothing and writes nothing.
test('R2-3: narrowing a window already at its minimum is a no-op with no settings write', () => {
    const MON = { x: 0, y: 0, width: 2000, height: 1100 };
    const { env, app, wins } = setup(MON, 12, [
        [1, [0, 0, 300, 300], [1400, 0]],
        [2, [400, 0, 300, 300], [500, 0]],
    ]);
    app.ops.layoutSet(app, 0, 0, { auto: true });
    const ref = app.split.ref(app, 0, 0, 2);
    app.split.remember(app, ref, { kind: 'rows', shape: [2], major: [1], minor: [[0.6, 0.4]] }, true);
    app.ops.retileMonitor(app, 0, null, false);
    assert.deepEqual(wins.map((w) => w.rect), [[0, 0, 1400, 1100], [1412, 0, 588, 1100]],
        'precondition: the refused column holds its minimum');
    env.display.focus_window = wins[0];
    const before = settingsInstance(env).getValue('layouts');
    env.keybindingManager.hotkeys.get('greenTile-resize-narrower').cb();
    app.split.flush(app);
    assert.deepEqual(wins.map((w) => w.rect), [[0, 0, 1400, 1100], [1412, 0, 588, 1100]],
        'the frames do not move');
    assert.equal(settingsInstance(env).getValue('layouts'), before,
        'the settings are untouched (no split written for a no-op resize)');
});

// 4 — the column hotkey keeps the gap exact, once.
test('R2-4: the column hotkey produces exactly one gap between refused columns', () => {
    const MON = { x: 0, y: 0, width: 2400, height: 1100 };
    const { env, wins } = setup(MON, 12, [
        [1, [0, 0, 300, 300], [1000, 0]],
        [2, [400, 0, 300, 300], [800, 0]],
    ]);
    env.keybindingManager.hotkeys.get('greenTile-auto3').cb();
    assert.deepEqual(wins.map((w) => w.rect), [[0, 0, 1194, 1100], [1206, 0, 1194, 1100]],
        'the columns share the real usable width');
    assert.equal(wins[1].rect[0] - (wins[0].rect[0] + wins[0].rect[2]), 12, 'gap is 12, not 6');
    assert.ok(wins[0].rect[2] >= 1000 && wins[1].rect[2] >= 800, 'both minima hold');
    assertContained(wins, MON, 'gap');
});

// 5 — a minimum the SAME live window relaxes must restore the nominal arrangement.
// 6 — the soft 120 px floor must never defeat hard application minima (cold review HIGH).
test('R2-6: two large minima in one row keep their width instead of overlapping', () => {
    const MON = { x: 0, y: 0, width: 1920, height: 1000 };
    const { env, wins } = setup(MON, 12, [
        [1, [0, 0, 300, 300], [900, 0]],
        [2, [400, 0, 300, 300], [900, 0]],
        [3, [800, 0, 300, 300], [0, 0]],
    ]);
    env.keybindingManager.hotkeys.get('greenTile-auto3').cb();
    assertNoOverlap(wins, 'floor vs minima');
    assertContained(wins, MON, 'floor vs minima');
    assert.ok(wins[0].rect[2] >= 900 && wins[1].rect[2] >= 900, 'both hard minima hold');
});

// 7 — the column hotkey publishes its evidence, so the resize floor is not stale (cold review MEDIUM).
test('R2-7: a resize after the column hotkey still no-ops at the real minimum', () => {
    const MON = { x: 0, y: 0, width: 2400, height: 1100 };
    const { env, app, wins } = setup(MON, 0, [
        [1, [0, 0, 300, 300], [1400, 0]],
        [2, [400, 0, 300, 300], [0, 0]],
    ]);
    app.ops.layoutSet(app, 0, 0, { auto: true });
    env.keybindingManager.hotkeys.get('greenTile-auto3').cb();
    assert.equal(wins[0].rect[2], 1400, 'precondition: the refused column holds its minimum');
    env.display.focus_window = wins[0];
    const before = settingsInstance(env).getValue('layouts');
    env.keybindingManager.hotkeys.get('greenTile-resize-narrower').cb();
    app.split.flush(app);
    assert.equal(wins[0].rect[2], 1400, 'the column hotkey published its evidence');
    assert.equal(settingsInstance(env).getValue('layouts'), before, 'and nothing was written');
});

// 8 — with no refusal at all, even a tight minor axis keeps the nominal shape.
test('R2-8: no observed minimum keeps the nominal shape on a tight axis', () => {
    const m = require('../helpers/cinnamon-loader').load('./lib/model/split.js');
    const zeros = [{ w: 0, h: 0 }, { w: 0, h: 0 }, { w: 0, h: 0 }];
    assert.deepEqual(m.splitFitShape('rows', [3], zeros, 90, 1100, 48), [3],
        'the gap budget alone must not regroup a shape nobody objected to');
});

// 9 — the consumers must read the arrangement that was ACTUALLY placed. The column
// hotkey falls back to a different layout than the automatic one, so a consumer that
// re-derives from its own nominal layout sees geometry that is not on screen (cold
// review / parent reproduction: focus, swap, drop and resize all misfired).
test('R2-9: consumers read the placed arrangement, not a re-derived one', () => {
    const MON = { x: 0, y: 0, width: 2000, height: 1100 };
    const { env, app, wins } = setup(MON, 12, [
        [1, [0, 0, 300, 300], [1050, 800]],
        [2, [400, 0, 300, 300], [750, 500]],
        [3, [800, 0, 300, 300], [900, 300]],
    ]);
    app.ops.layoutSet(app, 0, 0, { auto: true });
    env.keybindingManager.hotkeys.get('greenTile-auto3').cb();
    const placed = wins.map((w) => w.rect.slice());
    assert.deepEqual(placed, [[0, 0, 1050, 1100], [1062, 0, 938, 544], [1062, 556, 938, 544]],
        'precondition: the placed arrangement (uneven [1,2])');
    // the consumer asks with a layout that is NOT what was placed — the geometry must
    // still be the one on screen, because the record carries it
    const fit = app.split.effective(app, 0, 0, 3, { kind: 'rows', shape: [3] }, wins);
    const cells = require('../helpers/cinnamon-loader').load('./lib/model/split.js')
        .splitRects(fit.kind, fit.shape, fit.split, [0, 0, 2000, 1100]);
    assert.deepEqual([fit.kind, fit.shape], ['cols', [1, 2]],
        'the consumer sees the grouping that was placed, not the one its own layout implies');
    // and the cells are the placed ones (a cell is its final frame plus the gap inset)
    const gap = 12;
    for (let i = 0; i < wins.length; i++) {
        assert.ok(Math.abs(cells[i][0] - placed[i][0]) <= gap, `consumer cell ${i} sits where the frame does`);
        assert.ok(Math.abs(cells[i][2] - placed[i][2]) <= gap, `consumer cell ${i} has the placed width`);
    }
});

// 10 — a window closed and replaced at the SAME window count must not inherit the
// closed window's minimum. The record is matched by IDENTITY, and the consumer reads it
// before any retile has run for the new window set (a retile would refresh it).
test('R2-10: a replacement window at the same count is not blocked by the closed one', () => {
    const MON = { x: 0, y: 0, width: 2000, height: 1100 };
    const { env, app, wins } = setup(MON, 0, [
        [1, [0, 0, 300, 300], [1400, 0]],
        [2, [400, 0, 300, 300], [0, 0]],
    ]);
    app.ops.layoutSet(app, 0, 0, { auto: true });
    app.ops.retileMonitor(app, 0);
    assert.deepEqual(wins[0].rect, [0, 0, 1400, 1100], 'precondition: the refused column');
    wins[0].emit('unmanaged');
    env.tabList.splice(env.tabList.indexOf(wins[0]), 1);
    const c = makeWindow(env, 13, [0, 0, 300, 300], 0, null, { minSize: [0, 0] });
    env.tabList.push(c);
    // NO retile: the consumer reads the record for a window set that has changed at the
    // same count. With the closed window's 1400 as the floor this resize could not move.
    // The discriminating observable is a SHRINK: a stale wide minimum only raises the
    // floor on one side, so pressing "wider" still moves the border and writes. Narrowing
    // is blocked when the closed window's 1400 is (wrongly) still the floor.
    env.display.focus_window = c;
    const before = settingsInstance(env).getValue('layouts');
    env.keybindingManager.hotkeys.get('greenTile-resize-narrower').cb();
    app.split.flush(app);
    assert.notEqual(settingsInstance(env).getValue('layouts'), before,
        'the replacement window can shrink — it did not inherit the closed minimum');
});

// 11 — the drop PREVIEW must fit the PROPOSED arrangement from the minima of those very
// windows, mapped by IDENTITY (a reorder must not discard them), and the drop that
// follows must land where the preview showed. Parent reproduction: mon 2000/gap0,
// minima A 1400 / B 500 / C 500, drag A onto C's right edge.
test('R2-11: the drop preview uses the reordered minima and the end matches it', () => {
    const MON = { x: 0, y: 0, width: 2000, height: 1100 };
    const { env, app, wins } = setup(MON, 0, [
        [1, [0, 0, 300, 300], [1400, 0]],
        [2, [400, 0, 300, 300], [500, 0]],
        [3, [800, 0, 300, 300], [500, 0]],
    ]);
    app.ops.layoutSet(app, 0, 0, { auto: true });
    env.keybindingManager.hotkeys.get('greenTile-auto3').cb();
    const A = wins[0];
    const before = A.rect.slice();
    env.pointer = [1995, 800];
    app.drop.begin(app, A, env.gi.Meta.GrabOp.MOVING);
    A.move_frame(false, 1975, 780);
    const hit = app.drop.target(app, A, 1995, 800);
    assert.ok(hit && hit.next, 'the drop proposed an arrangement');
    // the evidence for those windows survives the reorder — mapped by seq, not position
    const mapped = app.split.minsFor(app, 0, 0, 3, wins);
    assert.ok(mapped[wins.indexOf(A)].w >= 1400, 'the dragged window kept its refusal after the reorder');
    assert.equal(mapped[wins.indexOf(wins[2])].w, 500, 'the other windows keep theirs');
    const proposed = app.split.fit(app, 0, 0, 3, { kind: hit.next.kind, shape: hit.next.shape },
        mapped, [0, 0, 2000, 1100], 0);
    assert.equal(proposed.shape.reduce((a, b) => a + b, 0), 3, 'the proposal covers all three windows');
    assert.ok(proposed.split.major.concat(...proposed.split.minor).every((f) => Number.isFinite(f)),
        'the proposal is a usable arrangement');
    app.drop.end(app, A, env.gi.Meta.GrabOp.MOVING);
    app.ops.retileMonitor(app, 0, null, false);
    assert.notDeepEqual(A.rect, before, 'the drop moved the window');
    assertNoOverlap(wins, 'drop chain');
    assertContained(wins, MON, 'drop chain');
    assert.ok(A.rect[2] >= 1400, 'the dragged window keeps its own minimum after the reorder');
});

for (const saved of [true, false]) {
    test(`R2-13: drop preview discards the ${saved ? 'saved' : 'pending'} same-shape resize just like landing`, () => {
        const MON = { x: 0, y: 0, width: 2000, height: 1060 };
        const { env, app, wins: [A, B] } = setup(MON, 0, [
            [6, [0, 0, 300, 300], [1100, 100]],
            [7, [400, 0, 300, 300], [950, 100]],
        ]);
        const settings = settingsInstance(env);
        settings.setValue('tileAnimation', false);
        app.ops.layoutSet(app, 0, 0, { auto: true });
        app.ops.retileMonitor(app, 0, null, false);
        env.display.focus_window = A;
        env.keybindingManager.hotkeys.get('greenTile-swap-down').cb();
        env.display.focus_window = B;
        env.keybindingManager.hotkeys.get('greenTile-resize-taller').cb();
        if (saved) {
            app.split.flush(app);
        }
        app.ops.retileMonitor(app, 0, null, false);
        assert.deepEqual([A.rect, B.rect], [[0, 531, 2000, 529], [0, 0, 2000, 531]],
            'precondition: the swap and one-pixel resize established the uneven rows');
        const manual = app.split.manual(app, 0, 0, 2);
        assert.deepEqual([manual.kind, manual.shape, manual.major],
            ['rows', [1, 1], [531 / 1060, 529 / 1060]]);
        assert.equal(app.split._pending.size, saved ? 0 : 1);
        const beforeSettings = settings.getValue('layouts');
        const beforePending = JSON.stringify([...app.split._pending]);
        env.pointer = [1000, 30];
        env.display.get_grab_op = () => env.gi.Meta.GrabOp.MOVING;
        app.drop.begin(app, A, env.gi.Meta.GrabOp.MOVING);
        const preview = [];
        const actor = app.drop._drop.actor;
        actor.set_position = (x, y) => { preview[0] = x; preview[1] = y; };
        actor.set_size = (w, h) => { preview[2] = w; preview[3] = h; };
        A.move_frame(false, 1000, 30);
        assert.equal(app.drop.tick(app), true);
        const next = app.drop._drop.hit.next;
        assert.deepEqual([next.kind, next.shape, next.order], ['rows', [1, 1], [1, 0]],
            'the proposal reorders windows without changing shape');
        assert.equal(settings.getValue('layouts'), beforeSettings, 'preview never writes settings');
        assert.equal(JSON.stringify([...app.split._pending]), beforePending, 'preview leaves pending intent intact');
        assert.equal(app.drop.end(app, A, env.gi.Meta.GrabOp.MOVING), true);
        assert.deepEqual(A.rect, [0, 0, 2000, 530], 'landing clears the old resize');
        assert.deepEqual(preview, A.rect, 'preview must match landing exactly, not be one pixel taller');
        app.ops.retileMonitor(app, 0, null, false);
        assert.deepEqual(A.rect, [0, 0, 2000, 530], 'the preview frame survives plain retile');
        assert.deepEqual(preview, A.rect);
        assertNoOverlap([A, B], 'same-shape drop');
        assertContained([A, B], MON, 'same-shape drop');
    });
}

const columnStack = () => {
    const MON = { x: 0, y: 0, width: 2400, height: 1100 };
    const state = setup(MON, 0, [
        [1, [0, 0, 300, 300], [2000, 0]],
        [2, [400, 0, 300, 300], [500, 0]],
        [3, [800, 0, 300, 300], [500, 0]],
    ]);
    state.app.ops.layoutSet(state.app, 0, 0, { auto: true });
    state.env.keybindingManager.hotkeys.get('greenTile-auto3').cb();
    assert.deepEqual(state.wins.map((w) => w.rect),
        [[0, 0, 2400, 367], [0, 367, 2400, 366], [0, 733, 2400, 367]],
        'precondition: the one-off column command placed cols [3]');
    return { ...state, MON };
};

test('R2-12: a one-pixel resize, flush, retile and swap execute the actual vertical cells', () => {
    const { env, app, wins, MON } = columnStack();
    const settings = settingsInstance(env);
    const presets = settings.getValue('presets');
    env.keybindingManager.hotkeys.get('greenTile-resize-taller').cb();
    const resized = [[0, 0, 2400, 368], [0, 368, 2400, 365], [0, 733, 2400, 367]];
    assert.deepEqual(wins.map((w) => w.rect), resized, '367 becomes 368, not 550');
    app.split.flush(app);
    const ref = app.split.ref(app, 0, 0, 3);
    const entry = JSON.parse(settings.getValue('layouts'))[ref.mkey][ref.wskey];
    assert.deepEqual(Object.keys(entry).sort(), ['auto', 'splits'], 'only manual size intent is stored');
    assert.deepEqual([entry.splits['3'].kind, entry.splits['3'].shape], ['cols', [3]]);
    const stored = settings.getValue('layouts');
    app.ops.retileMonitor(app, 0, null, false);
    assert.deepEqual(wins.map((w) => w.rect), resized, 'the flushed manual border survives a plain retile');
    env.display.focus_window = wins[1];
    env.customBindings.get('push-tile-down')(env.display, wins[1]);
    assert.equal(env.display.focus_window, wins[2], 'focus-down follows the vertical neighbour');
    env.display.focus_window = wins[1];
    env.keybindingManager.hotkeys.get('greenTile-swap-down').cb();
    const swapped = [[0, 0, 2400, 368], [0, 733, 2400, 367], [0, 368, 2400, 365]];
    assert.deepEqual(wins.map((w) => w.rect), swapped, 'only B and C exchange actual cells');
    assert.equal(env.display.focus_window, wins[1], 'swap retains focus on B');
    app.ops.retileMonitor(app, 0, null, false);
    assert.deepEqual(wins.map((w) => w.rect), swapped, 'the swap survives the next plain retile');
    env.customBindings.get('push-tile-down')(env.display, wins[2]);
    assert.equal(env.display.focus_window, wins[1], 'C now focuses down to B');
    assertNoOverlap(wins, 'resize/swap chain');
    assertContained(wins, MON, 'resize/swap chain');
    assert.equal(settings.getValue('layouts'), stored, 'retiles and swap write no shapes or preset assignment');
    assert.equal(settings.getValue('presets'), presets, 'preset definitions stay untouched');
});

test('R2-12: standalone swap-down executes the actual column-command stack without saving it', () => {
    const { env, app, wins, MON } = columnStack();
    const before = settingsInstance(env).getValue('layouts');
    env.display.focus_window = wins[1];
    env.keybindingManager.hotkeys.get('greenTile-swap-down').cb();
    assert.deepEqual(wins.map((w) => w.rect),
        [[0, 0, 2400, 367], [0, 733, 2400, 367], [0, 367, 2400, 366]],
        'the swap follows cols [3], not nominal rows [1,2]');
    assert.equal(env.display.focus_window, wins[1]);
    assertNoOverlap(wins, 'standalone swap');
    assertContained(wins, MON, 'standalone swap');
    assert.equal(settingsInstance(env).getValue('layouts'), before, 'swap alone creates no manual size intent');
    // The column command remains one-off until a resize explicitly establishes size intent.
    app.ops.retileMonitor(app, 0, null, false);
    assert.deepEqual(wins.map((w) => w.rect),
        [[0, 0, 2400, 550], [1200, 550, 1200, 550], [0, 550, 1200, 550]]);
    wins[0].minSize[0] = 0;
    app.ops.retileMonitor(app, 0, null, false);
    assert.deepEqual(wins.map((w) => w.rect),
        [[0, 0, 800, 1100], [1600, 0, 800, 1100], [800, 0, 800, 1100]],
        'relaxed minima restore nominal geometry without a manual resize');
});

test('R2-12: mouse border resize preserves the actual stack through scheduled and plain retiles', () => {
    const { env, app, wins, MON } = columnStack();
    const A = wins[0];
    env.gi.Meta.GrabOp.RESIZING_S = 'resizing-s';
    env.display.emit('grab-op-begin', env.display, env.display, A, env.gi.Meta.GrabOp.RESIZING_S);
    A.move_resize_frame(false, 0, 0, 2400, 377);
    env.display.emit('grab-op-end', env.display, env.display, A, env.gi.Meta.GrabOp.RESIZING_S);
    const timer = [...env.timers.values()].find((t) => t.ms === 250);
    assert.ok(timer, 'mouse resize schedules the retile');
    timer.cb();
    const resized = [[0, 0, 2400, 377], [0, 377, 2400, 356], [0, 733, 2400, 367]];
    assert.deepEqual(wins.map((w) => w.rect), resized, 'the moved mouse border and its neighbours are honoured');
    app.ops.retileMonitor(app, 0, null, false);
    assert.deepEqual(wins.map((w) => w.rect), resized, 'mouse size intent survives the next retile');
    assertNoOverlap(wins, 'mouse chain');
    assertContained(wins, MON, 'mouse chain');
    app.split.reset(app, 0, 0);
    app.ops.retileMonitor(app, 0, null, false);
    assert.deepEqual(wins.map((w) => w.rect),
        [[0, 0, 2400, 550], [0, 550, 1200, 550], [1200, 550, 1200, 550]],
        'reset restores the nominal automatic fit');
});

test('R2-12: manual size intent adapts to gap and count changes and yields to a preset', () => {
    const { env, app, wins, MON } = columnStack();
    env.keybindingManager.hotkeys.get('greenTile-resize-taller').cb();
    app.split.flush(app);
    const settings = settingsInstance(env);
    const stored = settings.getValue('layouts');
    settings.setValue('windowGap', 12);
    app.ops.retileMonitor(app, 0, null, false);
    assert.deepEqual(wins.map((w) => w.rect),
        [[0, 0, 2400, 362], [0, 374, 2400, 353], [0, 739, 2400, 361]],
        'new gap is applied to the manual border fractions, not stale rectangles');
    assertNoOverlap(wins, 'gap change');
    assertContained(wins, MON, 'gap change');
    assert.equal(settings.getValue('layouts'), stored);
    settings.setValue('windowGap', 0);
    env.tabList.splice(env.tabList.indexOf(wins[2]), 1);
    app.ops.retileMonitor(app, 0, null, false);
    assert.deepEqual(wins.slice(0, 2).map((w) => w.rect),
        [[0, 0, 2400, 550], [0, 550, 2400, 550]], 'a different count uses its own nominal fit');
    env.tabList.push(wins[2]);
    app.ops.presetsWrite(app, [{ id: 'p1', name: 'Explicit', rules: [{ min: 3, stacks: [1, 2] }] }]);
    app.ops.layoutSet(app, 0, 0, { preset: 'p1' });
    wins[0].minSize[0] = 0;
    app.ops.retileMonitor(app, 0, null, false);
    assert.deepEqual(wins.map((w) => w.rect),
        [[0, 0, 1200, 1100], [1200, 0, 1200, 550], [1200, 550, 1200, 550]],
        'an explicit preset overrides the automatic-grid manual orientation');
});

test('R2-5: relaxing a minimum on the same window restores the nominal grid', () => {
    const MON = { x: 0, y: 0, width: 2000, height: 1100 };
    const { app, wins } = setup(MON, 0, [
        [1, [0, 0, 300, 300], [1400, 0]],
        [2, [400, 0, 300, 300], [0, 0]],
    ]);
    app.ops.layoutSet(app, 0, 0, { auto: true });
    app.ops.retileMonitor(app, 0);
    assert.deepEqual(wins.map((w) => w.rect), [[0, 0, 1400, 1100], [1400, 0, 600, 1100]],
        'precondition: the wider column');
    wins[0].minSize[0] = 0;
    app.ops.retileMonitor(app, 0, null, false);
    assert.deepEqual(wins.map((w) => w.rect), [[0, 0, 1000, 1100], [1000, 0, 1000, 1100]],
        'the nominal grid is back');
});

'use strict';
// The optional "Space to the screen edge" (setting edgeGap) through the REAL
// extension on the fake Cinnamon runtime. The value insets every cell side that
// lies on the edge of the usable area, independently of the window gap: a lone
// window in fill mode finally gets a margin (issue 4), two windows keep their
// seam and gain an outer margin, center mode stays untouched, and the drag
// preview shows the frame the drop then produces.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    MONITOR, makeEnv, makeWindow, makeWorkspace, enableOnMonitors,
} = require('../helpers/fakes/cinnamon-harness');

const AREA = [0, 0, 2000, 1100];
const SPAWN = [20, 0, 300, 300];
const CENTER = [382, 55, 1236, 990];

// Retile `n` windows on monitor 0 (automatic tiling) with the given settings.
const run = (settings, n) => {
    const { env, ext } = makeEnv(settings);
    enableOnMonitors(env, ext, [MONITOR]);
    const ws = makeWorkspace(env);
    ws.index = () => 0;
    env.activeWorkspace = ws;
    const wins = [];
    for (let i = 1; i <= n; i++) {
        wins.push(makeWindow(env, i, [SPAWN[0] + (i - 1) * 20, SPAWN[1], SPAWN[2], SPAWN[3]], 0));
    }
    env.tabList.push(...wins);
    env.display.focus_window = wins[0] || null;
    const app = ext.currentSession().app;
    app.ops.layoutSet(app, 0, 0, { preset: null, auto: true });
    app.ops.retileMonitor(app, 0);
    return { env, ext, app, wins, rects: wins.map((w) => w.rect.slice()) };
};

test('a lone window in fill mode keeps the edge distance on all four sides', () => {
    // issue 4: fill used to be the whole usable area because a lone window has no
    // neighbour and only neighbouring sides ever moved in
    const filled = run({ windowGap: 0, edgeGap: 12, singleWindowMode: 'fill', singleWindowMigrated: true }, 1);
    assert.deepEqual(filled.rects[0], [12, 12, 1976, 1076], 'all four sides inset by the edge value');
    filled.ext.disable();

    const flush = run({ windowGap: 0, edgeGap: 0, singleWindowMode: 'fill', singleWindowMigrated: true }, 1);
    assert.deepEqual(flush.rects[0], AREA, 'the default 0 keeps the full area, exactly as before');
    flush.ext.disable();
});

test('two windows keep their seam and gain the outer margin', () => {
    const { rects, ext } = run({ windowGap: 12, edgeGap: 12 }, 2);
    assert.deepEqual(rects[0], [12, 12, 982, 1076], 'left window: edge on the three outer sides, half gap on its right');
    assert.deepEqual(rects[1], [1006, 12, 982, 1076], 'right window: half gap on its left, edge on the other three');
    assert.equal(rects[1][0] - (rects[0][0] + rects[0][2]), 12, 'the seam between the windows is the gap, unchanged');
    assert.equal(rects[0][0] - AREA[0], 12, 'left margin is the edge value');
    assert.equal(AREA[0] + AREA[2] - (rects[1][0] + rects[1][2]), 12, 'right margin is the edge value');
    ext.disable();
});

test('the window gap keeps its own geometry when the edge value is set', () => {
    const plain = run({ windowGap: 12, edgeGap: 0 }, 2);
    const edged = run({ windowGap: 12, edgeGap: 12 }, 2);
    for (const i of [0, 1]) {
        assert.equal(edged.rects[i][2], plain.rects[i][2] - 12,
            'each window gives the edge away from its own width, the gap is not re-applied');
    }
    assert.equal(edged.rects[1][0] - (edged.rects[0][0] + edged.rects[0][2]),
        plain.rects[1][0] - (plain.rects[0][0] + plain.rects[0][2]), 'the seam is identical with and without the edge');
    plain.ext.disable();
    edged.ext.disable();
});

test('center mode is untouched: its frame never lies on the area edge', () => {
    // the pinned chain of tests/model/single.test.js:102 stays valid because the
    // centered frame sits far from the edge, so the edge rule cannot reach it
    for (const gap of [0, 8]) {
        const { rects, ext } = run({ windowGap: gap, edgeGap: 12, singleWindowMode: 'center', singleWindowMigrated: true }, 1);
        assert.deepEqual(rects[0], CENTER, 'gap ' + gap + ': the golden frame is placed unchanged');
        ext.disable();
    }
});

test('the drag preview shows the frame the drop produces', () => {
    const { env, ext, app, wins } = run({ windowGap: 0, edgeGap: 12 }, 2);
    const [w1, w2] = wins;
    env.display.get_grab_op = () => env.gi.Meta.GrabOp.MOVING;
    app.drop.begin(app, w2, env.gi.Meta.GrabOp.MOVING);
    // muffin moves the dragged frame during the grab; the drop is not an Esc cancel
    w2.rect = [0, 0, 400, 1100];
    env.pointer = [100, 550];
    assert.equal(app.drop.tick(app), true, 'the pointer over the left third of w1 previews a drop');
    const preview = /** @type {any} */ (env.uiGroupChildren[env.uiGroupChildren.length - 1]);
    assert.deepEqual([preview.px, preview.py, preview.allocSize[0], preview.allocSize[1]], [12, 12, 988, 1076],
        'the preview already carries the edge inset');
    assert.equal(app.drop.end(app, w2, env.gi.Meta.GrabOp.MOVING), true, 'the drop applied');
    assert.deepEqual(w2.rect.slice(), [preview.px, preview.py, preview.allocSize[0], preview.allocSize[1]],
        'the placed window lands exactly where the preview showed it');
    assert.deepEqual(w1.rect.slice(), [1000, 12, 988, 1076], 'the other window keeps its cell, its outside now inset');
    ext.disable();
});

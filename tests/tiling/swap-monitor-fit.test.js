'use strict';
// A push (Super+Ctrl+Left/Right) onto a monitor whose work area cannot hold the
// window used to leave the window on its source monitor: Meta.Window.move_to_monitor()
// silently keeps such a window where it is, and both retiles then still addressed
// the source surface — the target's retile never counted the incoming window (its
// monitor had not changed), the source's placed it back into its old cell. The
// window could not be pushed onto that monitor at all.
//
// Host evidence (2026-10-14, Cinnamon 6.6/X11, two 3440x1440 monitors, the left one
// behind a panel -> 1400 px work area): a full-height tile of the panel-less monitor
// (1716x1440, frame at 3440,0) did not move with the key, while the same window
// shrunk to 1390 px moved with the same key. Measured thresholds: 1401 px and 1440 px
// tall -> no move, 1400 px (exactly the target work area) and 1390 px -> moved. Width
// does not matter (a 4000 px wide window moved). The asymmetry between the two
// directions (only the push INTO the tighter work area fails) is what the user's
// report "kann ein Fenster nicht auf den benachbarten verschieben, wenn da noch keine
// Fenster sind" describes: pushes the other way worked.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    makeEnv, makeWindow, makeWorkspace, settingsInstance, enableOnMonitors,
} = require('../helpers/fakes/cinnamon-harness');

// The user's setup: the monitor without a panel is 1440 px tall, the one behind the
// 40 px panel 1400 px. The layout only ever places the work-area height, so every
// full-height tile of the panel-less monitor is 41+ px too tall for the other one.
const TALL_H = 1440;
const SHORT_H = 1400;
const WIDTH = 3440;
const MON = (x, height) => ({ x: x, y: 0, width: WIDTH, height: height });

// Two side-by-side tiles on monitor 0, the RIGHT one focused: a swap right finds no
// neighbour there and pushes along the monitor chain (the user's gesture).
const setup = (heights, targetAuto) => {
    const { env, ext } = makeEnv({ windowGap: 0, singleWindowMode: 'center' });
    const [sourceH, targetH] = heights;
    const monitors = [MON(0, sourceH), MON(WIDTH, targetH)];
    enableOnMonitors(env, ext, monitors);
    const ws = makeWorkspace(env);
    ws.index = () => 0;
    env.activeWorkspace = ws;
    const app = ext.currentSession().app;
    app.ops.layoutSet(app, 0, 0, { auto: true });
    if (targetAuto) {
        app.ops.layoutSet(app, 1, 0, { auto: true });
    }
    const w1 = makeWindow(env, 1, [0, 0, WIDTH / 2, sourceH], 0);
    const w2 = makeWindow(env, 2, [WIDTH / 2, 0, WIDTH / 2, sourceH], 0);
    env.tabList.push(w1, w2);
    env.display.focus_window = w2;
    app.ops.retileMonitor(app, 0, w2, true, 0);
    return { env, app, w1, w2, source: monitors[0], target: monitors[1] };
};

const swap = (env, dir) => env.keybindingManager.hotkeys.get('greenTile-swap-' + dir).cb();

const inside = (rect, monitor) => rect[0] >= monitor.x && rect[0] + rect[2] <= monitor.x + monitor.width
    && rect[1] >= monitor.y && rect[1] + rect[3] <= monitor.y + monitor.height;

test('a window too tall for the target work area is pushed onto that monitor anyway', () => {
    const { env, w1, w2, source, target } = setup([TALL_H, SHORT_H], true);
    assert.deepEqual([w1.rect, w2.rect], [[0, 0, WIDTH / 2, TALL_H], [WIDTH / 2, 0, WIDTH / 2, TALL_H]],
        'the source surface starts out as two full-height columns');
    swap(env, 'right');
    assert.match(env.logs.join(' | '), /greenTile swap pushed/, 'the chain push ran');
    assert.equal(w2.get_monitor(), 1, 'the pushed window reached the target monitor');
    assert.ok(inside(w2.rect, target), 'the pushed window lies inside the target work area: ' + w2.rect.join(','));
    assert.ok(w2.rect[3] <= SHORT_H, 'the pushed window was clamped to the target work area height');
    // The source surface lost it and retiled to its lone-window mode.
    assert.equal(w1.get_monitor(), 0, 'the window left behind stayed on the source monitor');
    assert.ok(inside(w1.rect, source), 'the source surface is placed inside its own work area: ' + w1.rect.join(','));
});

test('a window that fits the target work area is pushed as before', () => {
    // The mirror direction of the user's setup: the panel-less monitor is the target,
    // so a full-height tile of the 1400 px work area fits (1400 <= 1440) and Muffin
    // performs the move itself.
    const { env, w1, w2, target } = setup([SHORT_H, TALL_H], true);
    assert.equal(w2.rect[3], SHORT_H, 'the source surface tiles the 1400 px work area');
    swap(env, 'right');
    assert.equal(w2.get_monitor(), 1, 'the push onto the roomier monitor works');
    assert.ok(inside(w2.rect, target), 'the pushed window lies inside the target work area');
    assert.equal(w1.get_monitor(), 0, 'the window left behind stayed on the source monitor');
});

test('onto a monitor without tiling the too-tall window is only moved over, clamped', () => {
    // Documented behaviour of the untiled target: the window keeps its frame as far as
    // the move allows — Muffin refuses it entirely, so the push places it itself: same
    // size clamped into the target work area, at the same relative position.
    const { env, w2, target } = setup([TALL_H, SHORT_H], false);
    swap(env, 'right');
    assert.equal(w2.get_monitor(), 1, 'the pushed window reached the untiled monitor');
    assert.deepEqual(w2.rect, [target.x + WIDTH / 2, 0, WIDTH / 2, SHORT_H],
        'the window kept its size and relative position, clamped into the target work area');
});

test('the push writes no size intent for the target surface', () => {
    const { env, app, w2 } = setup([TALL_H, SHORT_H], true);
    swap(env, 'right');
    const ref = app.split.ref(app, 1, 0, 1);
    const stored = JSON.parse(settingsInstance(env).getValue('layouts') || '{}');
    const entry = (stored[ref.mkey] || {})[ref.wskey] || {};
    assert.equal(JSON.stringify(entry.shapes), undefined, 'a push stores no dragged shape');
    assert.equal(w2.get_monitor(), 1);
});

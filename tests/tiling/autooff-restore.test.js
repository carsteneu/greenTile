'use strict';
// Super+Ctrl+D (autoOffHotkey) hands the windows of that monitor+workspace back the
// state they had before greenTile placed them: the frame recorded at the first
// placement, or the maximize mask the placement took away. There is no WM default to
// fall back on — Muffin keeps none — so the record IS the original, also when the
// user moved the window himself after the retile (user decision 2026-10-14).
const test = require('node:test');
const assert = require('node:assert/strict');
const {
    makeEnv, makeWindow, makeWorkspace, enableOnMonitors,
} = require('../helpers/fakes/cinnamon-harness');

const MON = { x: 0, y: 0, width: 2000, height: 1100 };
const SPAWN1 = [40, 60, 900, 700];
const SPAWN2 = [120, 140, 800, 600];

const boot = () => {
    const { env, ext } = makeEnv({ windowGap: 0 });
    enableOnMonitors(env, ext, [MON]);
    const ws = makeWorkspace(env);
    ws.index = () => 0;
    env.activeWorkspace = ws;
    const app = ext.currentSession().app;
    return {
        env, ext, app,
        /** The auto-on hotkey: writes the state and retiles right away. */
        tile: () => env.keybindingManager.hotkeys.get('greenTile-autoN').cb(),
        off: () => env.keybindingManager.hotkeys.get('greenTile-autoOff').cb(),
        /** Tiling on for the surface; the hotkey does the placing. */
        start(windows) {
            env.tabList.push(...windows);
            env.display.focus_window = windows[0];
            app.ops.layoutSet(app, 0, 0, { auto: true });
        },
        win: (seq, rect, options) => makeWindow(env, seq, rect, 0, null, options),
    };
};

test('auto off hands every tiled window back its pre-tiling frame', () => {
    const b = boot();
    const w1 = b.win(1, SPAWN1);
    const w2 = b.win(2, SPAWN2);
    b.start([w1, w2]);
    b.tile();
    assert.notDeepEqual(w1.rect, SPAWN1, 'precondition: the retile moved the first window');
    assert.notDeepEqual(w2.rect, SPAWN2, 'precondition: and the second one');
    b.off();
    assert.deepEqual(w1.rect, SPAWN1, 'w1 is back at the frame it had before the placement');
    assert.deepEqual(w2.rect, SPAWN2, 'w2 too');
    b.ext.disable();
});

test('the restore wins over a move the user made after the retile', () => {
    const b = boot();
    const w1 = b.win(1, SPAWN1);
    const w2 = b.win(2, SPAWN2);
    b.start([w1, w2]);
    b.tile();
    w1.move_resize_frame(true, 300, 300, 400, 300);
    assert.deepEqual(w1.rect, [300, 300, 400, 300], 'precondition: the manual move landed');
    b.off();
    assert.deepEqual(w1.rect, SPAWN1, 'the recorded frame wins over the later manual move');
    b.ext.disable();
});

test('a maximize mask the window had before the tiling is handed back', () => {
    const b = boot();
    const w1 = b.win(1, SPAWN1, { maximized: 6 });
    const w2 = b.win(2, SPAWN2);
    b.start([w1, w2]);
    b.tile();
    const movesAfterTile = w1.moves.length;
    assert.deepEqual(w1.maximizes, [], 'precondition: the placement maximizes nothing');
    b.off();
    assert.deepEqual(w1.maximizes, [6], 'the mask recorded before the placement is handed back');
    assert.equal(w1.moves.length, movesAfterTile, 'maximizing is the whole restore — the frame is not written again');
    b.ext.disable();
});

test('a second auto off moves nothing — the record is spent on the first', () => {
    const b = boot();
    const w1 = b.win(1, SPAWN1);
    const w2 = b.win(2, SPAWN2);
    b.start([w1, w2]);
    b.tile();
    b.off();
    const restored = [w1.rect.slice(), w2.rect.slice()];
    w1.move_resize_frame(true, 10, 10, 200, 200);
    b.off();
    assert.deepEqual(w1.rect, [10, 10, 200, 200], 'nothing is restored a second time');
    assert.deepEqual(w2.rect, restored[1], 'and the other window stays where the first restore put it');
    b.ext.disable();
});

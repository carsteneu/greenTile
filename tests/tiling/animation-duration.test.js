'use strict';
// The animation duration setting (tileAnimationDuration): one number drives the
// ease of every placement. Read at each placement, not cached at enable, and
// clamped here so a hand-edited settings file cannot animate for ever or not at
// all — the bounds mirror the spinbutton in settings-schema.json.
//
// Driven through the REAL extension.js on the fake Cinnamon runtime (the
// animation-ownership pattern).
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEaseActor } = require('../helpers/fakes/ease-actor');
const { makeEnv, makeWindow, enableOnMonitor, settingsInstance } = require('../helpers/fakes/cinnamon-harness');

const columnsHotkey = (env, key) => env.keybindingManager.hotkeys.get(key).cb();

// One monitor, two tiled windows; window 1 starts as a small floating window so
// the six-column placement grows it into the first cell — a real placement, which
// is what reads the setting.
const setup = (extraSettings = {}) => {
    const { env, ext } = makeEnv(extraSettings);
    enableOnMonitor(env, ext);
    const actor = makeEaseActor();
    const w1 = makeWindow(env, 1, [10, 10, 400, 300], 0, actor);
    const w2 = makeWindow(env, 2, [500, 0, 400, 300]);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    env.activeWorkspace = { index: () => 0 };
    return { env, ext, actor };
};

test('the placement ease follows the stored duration', () => {
    const { env, actor } = setup({ tileAnimationDuration: 500 });
    columnsHotkey(env, 'greenTile-auto6');
    assert.equal(actor.eases.at(-1).duration, 500, 'the ease uses the stored duration');
});

test('the default duration applies when the setting was never written', () => {
    const { env, actor } = setup();
    columnsHotkey(env, 'greenTile-auto6');
    assert.equal(actor.eases.at(-1).duration, 250, 'the schema default is 250 ms');
});

test('a stored duration outside the bounds is clamped, a non-number falls back to the default', () => {
    // lower bound, upper bound, and three shapes of garbage
    const cases = [[10, 50], [5000, 1000], ['fast', 250], [null, 250], [Number.NaN, 250]];
    for (const [stored, expected] of cases) {
        const { env, actor } = setup();
        settingsInstance(env).setValue('tileAnimationDuration', stored);
        columnsHotkey(env, 'greenTile-auto6');
        assert.equal(actor.eases.at(-1).duration, expected,
            'stored ' + String(stored) + ' animates for ' + expected + ' ms');
    }
});

test('the duration is read at each placement, not cached at enable', () => {
    const { env, actor } = setup();
    columnsHotkey(env, 'greenTile-auto6');
    assert.equal(actor.eases.at(-1).duration, 250, 'first placement uses the current value');
    settingsInstance(env).setValue('tileAnimationDuration', 800);
    columnsHotkey(env, 'greenTile-auto6');
    assert.equal(actor.eases.at(-1).duration, 800, 'the changed setting applies from the next tiling');
});

test('a placement with the animation switched off does not ease at all', () => {
    const { env, actor } = setup({ tileAnimation: false, tileAnimationDuration: 900 });
    columnsHotkey(env, 'greenTile-auto6');
    assert.equal(actor.eases.length, 0, 'tileAnimation off still means a jump, whatever the duration says');
    assert.equal(actor.transitions.size, 0);
});

'use strict';
// The single-window select (setting singleWindowMode) through the REAL
// extension on the fake Cinnamon runtime. Three modes:
//   leave  — a lone window is not placed at all (today's off);
//   fill   — it fills the whole usable area (today's on);
//   center — it is placed centered, golden-ratio wide and 90 % high.
// leave/fill must stay byte-identical to the boolean they replaced; the mode
// only ever changes the n = 1 case. Harness style follows the 16-preset
// regression pattern (learning #98409): every starter × window count, plus a
// positive control that the harness really exercises the mode.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../helpers/cinnamon-loader');
const {
    MONITOR, makeEnv, makeWindow, makeWorkspace, settingsInstance, enableOnMonitors,
} = require('../helpers/fakes/cinnamon-harness');

const SCHEMA = JSON.parse(fs.readFileSync(path.join(ROOT, 'settings-schema.json'), 'utf8'));
const STARTERS = JSON.parse(SCHEMA.presets.default);
const AREA = [0, 0, 2000, 1100];
const SPAWN = [20, 0, 300, 300];
const CENTER = [382, 55, 1236, 990];

// Retile `n` windows on monitor 0 under the given mode. `preset` null uses
// automatic tiling instead of an assigned preset. Returns the windows' frames.
const run = (mode, preset, n, gap = 0) => {
    const { env, ext } = makeEnv({ windowGap: gap, singleWindowMode: mode, singleWindowMigrated: true });
    enableOnMonitors(env, ext, [MONITOR]);
    const ws = makeWorkspace(env);
    ws.index = () => 0;
    env.activeWorkspace = ws;
    const wins = [];
    for (let i = 1; i <= n; i++) {
        wins.push(makeWindow(env, i, [SPAWN[0] + (i - 1) * 20, SPAWN[1], SPAWN[2], SPAWN[3]], 0));
    }
    env.tabList.push(...wins);
    env.display.focus_window = n > 0 ? wins[0] : null;
    const app = ext.currentSession().app;
    app.ops.presetsWrite(app, STARTERS);
    app.ops.layoutSet(app, 0, 0, preset ? { preset: preset.id } : { preset: null, auto: true });
    app.ops.retileMonitor(app, 0);
    return { env, ext, app, wins, rects: wins.map((w) => w.rect) };
};

test('regression: leave and fill agree for every count, and differ only at a lone window (144 cases)', () => {
    const fails = [];
    for (const preset of STARTERS) {
        for (let n = 0; n <= 8; n++) {
            const leave = run('leave', preset, n).rects;
            const fill = run('fill', preset, n).rects;
            if (n === 1) {
                if (JSON.stringify(leave) !== JSON.stringify([SPAWN.slice()])) {
                    fails.push(`${preset.name} n=1 leave moved the lone window: ${JSON.stringify(leave)}`);
                }
                if (JSON.stringify(fill) !== JSON.stringify([AREA.slice()])) {
                    fails.push(`${preset.name} n=1 fill: ${JSON.stringify(fill)}`);
                }
            } else if (JSON.stringify(leave) !== JSON.stringify(fill)) {
                fails.push(`${preset.name} n=${n}: leave=${JSON.stringify(leave)} fill=${JSON.stringify(fill)}`);
            }
        }
    }
    assert.deepEqual(fails, []);
});

test('positive control: the harness really reads the mode (fill moves the lone window)', () => {
    const preset = STARTERS.find((p) => p.name === 'Center main');
    assert.deepEqual(run('leave', preset, 1).rects, [SPAWN.slice()], 'leave does not touch it');
    assert.deepEqual(run('fill', preset, 1).rects, [AREA.slice()], 'fill takes the whole area');
});

test('automatic tiling without a preset: a lone window is centered too, several keep the grid', () => {
    assert.deepEqual(run('center', null, 1).rects, [CENTER], 'auto + a lone window centers');
    const one = run('fill', null, 1).rects;
    assert.deepEqual(one, [AREA.slice()], 'auto + fill still fills');
    for (const n of [2, 3]) {
        assert.deepEqual(run('center', null, n).rects, run('leave', null, n).rects, 'n=' + n + ' ignores the mode');
    }
});

test('center: every starter centers its lone window at 2000x1100, gap 0 and 8 alike', () => {
    for (const preset of STARTERS) {
        assert.deepEqual(run('center', preset, 1, 0).rects, [CENTER], `${preset.name} gap 0`);
        assert.deepEqual(run('center', preset, 1, 8).rects, [CENTER], `${preset.name} gap 8`);
    }
});

test('center: the mode never changes a count of two or more', () => {
    for (const preset of STARTERS) {
        for (let n = 2; n <= 6; n++) {
            assert.deepEqual(run('center', preset, n).rects, run('leave', preset, n).rects,
                `${preset.name} n=${n}`);
        }
    }
});

test('changing the select retiles the surfaces greenTile tiles', () => {
    const { env, wins } = run('leave', STARTERS.find((p) => p.name === 'Center main'), 1);
    assert.deepEqual(wins.map((w) => w.rect), [SPAWN.slice()], 'leave first');
    const inst = settingsInstance(env);
    inst.setValue('singleWindowMode', 'center'); // setValue alone fires no binding
    inst.bindings.find((b) => b.prop === 'singleWindowModeValue').cb();
    assert.deepEqual(wins.map((w) => w.rect), [CENTER], 'the change retiled into the centered layout');
});

// The centered layout carries an `area`, which also lands in the placement record
// (placeFit). A second retile must not re-apply anything: no split can be stored
// for a one-cell shape, so every retile has to reproduce the same frame.
test('a retile never moves a lone window again, in every mode and gap', () => {
    for (const mode of ['center', 'fill', 'leave']) {
        for (const gap of [0, 8, 48]) {
            const { app, wins } = run(mode, null, 1, gap);
            const first = wins[0].rect.slice();
            const want = mode === 'center' ? CENTER : (mode === 'fill' ? AREA.slice() : SPAWN.slice());
            assert.deepEqual(first, want, `${mode} gap ${gap} frame`);
            for (let i = 0; i < 2; i++) {
                app.ops.retileMonitor(app, 0);
                assert.deepEqual(wins[0].rect, first, `${mode} gap ${gap} moved on retile ${i + 2}`);
            }
        }
    }
});

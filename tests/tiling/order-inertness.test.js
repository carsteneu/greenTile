'use strict';
// Identity sweep over the shipped starters (learning #98409 pattern): the
// restart-order feature must be INERT when a surface's stored order equals the
// order the retile derives anyway, and the comparison must be able to fail (the
// positive control feeds the REVERSED order and demands a different result).
//
// Ground truth is the feature's own record: run A retiles with no store, the
// debounced write records the placed order; run B starts from that exact store
// and must reproduce run A's rects byte for byte. Run C (control) starts from
// the reversed store and must differ — otherwise the sweep proves nothing.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../helpers/cinnamon-loader');
const {
    makeEnv, makeWindow, makeWorkspace, enableOnMonitor,
} = require('../helpers/fakes/cinnamon-harness');

const PATH = '/run/user/1000/greenTile@carsteneu/order.json';
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'settings-schema.json'), 'utf8'));
const starters = JSON.parse(schema.presets.default);
const COUNTS = [2, 3, 4, 5, 6, 7];
const GAPS = [0, 8];

// One full cycle: enable, place n windows at distinct positions (descriptions
// 0x1..), assign the preset, retile, then fire the debounced write so the
// recorded order is readable. Returns the settled rects and the recorded order.
const run = (preset, n, gap, store) => {
    const { env, ext } = makeEnv({ windowGap: gap });
    if (store) {
        env.files.set(PATH, JSON.stringify({ v: 1, s: store }));
    }
    enableOnMonitor(env, ext);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const wins = [];
    for (let i = 0; i < n; i++) {
        wins.push(makeWindow(env, 100 + i, [i * 300 + 10, 10, 250, 200], 0, null, { description: '0x' + (i + 1) }));
    }
    env.tabList.push(...wins);
    env.display.focus_window = wins[0];
    const app = ext.currentSession().app;
    app.ops.presetsWrite(app, [preset]);
    app.ops.layoutSet(app, 0, 0, { preset: preset.id });
    app.ops.retileMonitor(app, 0);
    const rects = wins.map((w) => w.rect.slice());
    const key = app.monitors.keys[0] + '\n' + app.monitors.wsKey(0, 0);
    const timer = [...env.timers.entries()].find(([, t]) => t.ms === 1000);
    if (timer) {
        env.timers.delete(timer[0]);
        timer[1].cb();
    }
    const written = env.files.get(PATH);
    ext.disable();
    return { rects, key, order: written ? JSON.parse(written).s[key] : null };
};

const cases = [];
for (const preset of starters) {
    for (const n of COUNTS) {
        for (const gap of GAPS) {
            cases.push({ preset, n, gap });
        }
    }
}

test(`the recorded order fed back reproduces the arrangement in all ${cases.length} starter cases, and the reversed order differs`, () => {
    let differing = 0;
    let controlDiffering = 0;
    let noOrder = 0;
    for (const { preset, n, gap } of cases) {
        const base = run(preset, n, gap, null);
        assert.equal(base.rects.length, n);
        if (!base.order) {
            // nothing to restore (fewer than two identifiable windows): the
            // inertness claim must then hold trivially in the next two runs too
            noOrder++;
        }
        const same = run(preset, n, gap, { [base.key]: base.order || ['0x1', '0x2'] });
        if (JSON.stringify(same.rects) !== JSON.stringify(base.rects)) {
            differing++;
        }
        const reversed = run(preset, n, gap, { [base.key]: (base.order || ['0x1', '0x2']).slice().reverse() });
        if (JSON.stringify(reversed.rects) !== JSON.stringify(base.rects)) {
            controlDiffering++;
        }
    }
    assert.equal(noOrder, 0, 'every case must place at least two identifiable windows');
    assert.equal(differing, 0, 'a stored order equal to the derived order changed the result');
    assert.equal(controlDiffering, cases.length, 'the reversed order must differ in every case — otherwise the sweep proves nothing');
    assert.ok(cases.length >= 144, 'the sweep covers the starter set (' + cases.length + ' cases)');
});

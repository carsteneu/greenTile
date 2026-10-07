'use strict';
// The preset editor's spans round trip through the REAL extension.js on the fake
// Cinnamon runtime: a rule without spans is saved byte-identically (the field only
// reaches the settings when a column really spans several grid columns), a stored spans
// rule survives an open/save cycle, and a merge in the painter is what gets saved.
const test = require('node:test');
const assert = require('node:assert/strict');

const {
    makeEnv, makeWindow, makeWorkspace, settingsInstance, enableOnMonitors, MONITOR,
} = require('../helpers/fakes/cinnamon-harness');

const STEP = (600 - 3 * 5) / 6 + 3;

const findAll = (root, pred) => {
    const out = [];
    const seen = new Set();
    const visit = (actor) => {
        if (!actor || seen.has(actor)) {
            return;
        }
        seen.add(actor);
        if (pred(actor)) {
            out.push(actor);
        }
        for (const child of actor.children || []) {
            visit(child);
        }
        visit(actor.child);
    };
    visit(root);
    return out;
};
const byClass = (root, re) => findAll(root, (a) => re.test(a.style_class || ''));

/** Boots the extension on one monitor, seeds the presets and opens the editor of p1. */
const openEditor = (presets) => {
    const { env, ext } = makeEnv({ presets: JSON.stringify(presets) });
    enableOnMonitors(env, ext, [MONITOR]);
    const ws = makeWorkspace(env);
    ws.index = () => 0;
    env.activeWorkspace = ws;
    const w1 = makeWindow(env, 11, [10, 10, 400, 300]);
    const w2 = makeWindow(env, 12, [500, 0, 400, 300]);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    const app = ext.currentSession().app;
    app.ops.presetsWrite(app, presets);
    env.keybindingManager.hotkeys.get('greenTile-preset').cb();
    const card = byClass(app.panel.actor, /gk-card(?: |$)/)[0];
    assert.ok(card, 'the first card exists');
    byClass(card, /gk-card-edit/)[0].emit('clicked');
    assert.equal(app.panel.view, 'editor', 'the editor is open');
    return { env, ext, app };
};

const stored = (env) => JSON.parse(settingsInstance(env).getValue('presets'));

test('saving an untouched rule adds no spans field', () => {
    const presets = [{ id: 'p1', name: 'Alpha', rules: [{ min: 2, stacks: [1, 1] }] }];
    const { env, app } = openEditor(presets);
    byClass(app.panel.actor, /gk-save/)[0].emit('clicked');
    assert.deepEqual(stored(env), presets, 'the stored preset is byte-identical');
    assert.equal(app.panel.view, 'list', 'the editor closed on save');
});

test('a stored spans rule survives the open and save cycle', () => {
    const presets = [{ id: 'p1', name: 'Alpha', rules: [{ min: 2, stacks: [1, 2, 1], spans: [1, 2, 1] }] }];
    const { env, app } = openEditor(presets);
    assert.deepEqual(app.panel.draft.rules[0].spans, [1, 2, 1], 'the draft carries the spans');
    byClass(app.panel.actor, /gk-save/)[0].emit('clicked');
    assert.deepEqual(stored(env), presets);
});

test('a merge in the painter is what gets saved', () => {
    const presets = [{ id: 'p1', name: 'Alpha', rules: [{ min: 2, stacks: [1, 1] }] }];
    const { env, app } = openEditor(presets);
    const area = byClass(app.panel.actor, /gk-painter-area/)[0];
    assert.ok(area, 'the painter is built');
    area.transform_stage_point = (sx, sy) => [true, sx, sy];
    // The merge handle sits on the grid line between the two painted columns.
    area.emit('button-press-event', area, {
        get_coords: () => [STEP - 1.5, 200],
        get_button: () => 1,
        get_device: () => ({ grab() {}, ungrab() {} }),
    });
    assert.deepEqual(app.panel.draft.rules[0].spans, [2], 'the merge reached the draft');
    byClass(app.panel.actor, /gk-save/)[0].emit('clicked');
    assert.deepEqual(stored(env), [{ id: 'p1', name: 'Alpha', rules: [{ min: 2, stacks: [1], spans: [2] }] }]);
});

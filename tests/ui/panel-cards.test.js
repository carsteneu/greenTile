'use strict';
// The responsive preset card grid (lib/ui/panel.js + lib/model/grid.js) driven
// through the REAL extension.js on the fake Cinnamon runtime: the list view
// builds one card per preset in as many columns as the panel width holds, the
// assigned card is marked independently of Auto, and the card's own actions
// (apply / edit / unassign) do exactly one thing each. The fake St has no
// allocation, so geometry lives in lib/model/grid.js (unit-tested separately)
// and this file asserts the actor tree the panel actually builds.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, makeWindow, MONITOR } = require('../helpers/fakes/cinnamon-harness');
const { load } = require('../helpers/cinnamon-loader');

// A workspace hub with real connect/disconnect accounting, like the panel and
// the extension connect to it.
const makeWorkspace = (wsIndex = 0) => {
    const handlers = [];
    let nextId = 1;
    return {
        index: () => wsIndex,
        connect(sig, cb) {
            const id = nextId++;
            handlers.push({ sig, cb, id });
            return id;
        },
        disconnect(id) {
            const at = handlers.findIndex((h) => h.id === id);
            if (at === -1) {
                throw new Error('workspace: no such handler ' + id);
            }
            handlers.splice(at, 1);
        },
        count() {
            return handlers.length;
        },
        list_windows: () => [],
    };
};

const PRESETS = [
    { id: 'a', name: 'Alpha', rules: [{ min: 1, stacks: [1] }] },
    { id: 'b', name: 'Beta', rules: [{ min: 1, stacks: [1, 1] }] },
    { id: 'c', name: 'Gamma', rules: [{ min: 1, stacks: [1, 1, 1] }] },
    { id: 'd', name: 'Delta', rules: [{ min: 1, stacks: [2, 2] }] },
];

/** Opens the panel on a booted extension and returns the live App. */
const openPanel = (env, ext, presets = PRESETS, extra = {}) => {
    const ws0 = makeWorkspace(0);
    ws0.list_windows = () => env.tabList;
    env.workspaces.push(ws0);
    env.activeWorkspace = ws0;
    const w = makeWindow(env, 801, [50, 70, 320, 200]);
    const w2 = makeWindow(env, 802, [450, 70, 320, 200]);
    env.tabList.push(w, w2);
    env.layoutManager.monitors.push(MONITOR);
    ext.enable();
    env.flushDisplayConfigNoReply();
    // Focus is set AFTER the start-up retile so the panel's window count (and the
    // "no window" case) is what this test means, not a leftover of enable().
    env.display.focus_window = extra.focus === undefined ? w : extra.focus;
    const app = ext.currentSession().app;
    app.ops.presetsWrite(app, presets);
    if (extra.assign) {
        assert.equal(app.ops.layoutSet(app, 0, 0, { preset: extra.assign }), true, 'preset assigned before opening');
    }
    if (extra.autoOff) {
        app.ops.layoutSet(app, 0, 0, { auto: false });
    }
    env.keybindingManager.hotkeys.get('greenTile-preset').cb();
    assert.ok(app.panel.actor, 'the panel is open');
    return { app, window: w };
};

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
const cards = (app) => byClass(app.panel.actor, /^gk-card(?: |$)/);
const cardOf = (app, name) => cards(app).find((c) => {
    const label = byClass(c, /^gk-name(?: |$)/)[0];
    return label && label.text === name;
});

test('the list builds one card per preset with a preview, name and both actions', () => {
    const { env, ext } = makeEnv({ presets: JSON.stringify(PRESETS) });
    const { app } = openPanel(env, ext);
    const panel = app.panel.actor;
    assert.equal(byClass(panel, /^gk-cards(?: |$)/).length, 1, 'the card grid container is present');
    assert.equal(cards(app).length, PRESETS.length, 'one card per preset');
    for (const preset of PRESETS) {
        const card = cardOf(app, preset.name);
        assert.ok(card, `card for ${preset.name}`);
        assert.equal(byClass(card, /^gk-name(?: |$)/)[0].text, preset.name, 'name below the preview');
        assert.ok(byClass(card, /gk-card-edit/).length === 1, 'edit action exists');
        assert.ok(byClass(card, /gk-card-unassign/).length === 1, 'unassign action exists');
        assert.ok(byClass(card, /^gk-card-state/).length === 1, 'assigned row exists');
    }
    ext.disable();
});

test('cards flow into columns of the panel width: three at 600, five at 1000', () => {
    const { env, ext } = makeEnv({ presets: JSON.stringify(PRESETS) });
    const { app } = openPanel(env, ext);
    const rows = byClass(app.panel.actor, /^gk-card-row(?: |$)/);
    assert.equal(rows.length, 2, 'four cards over three columns = two rows');
    assert.equal(rows[0].children.length, 3, 'first row full');
    assert.equal(rows[1].children.length, 1, 'short final row holds the rest');
    ext.disable();

    const wide = makeEnv({ presets: JSON.stringify(PRESETS), panelSize: JSON.stringify({ list: { w: 1000, h: 400 } }) });
    const { app: wideApp } = openPanel(wide.env, wide.ext);
    const wideRows = byClass(wideApp.panel.actor, /^gk-card-row(?: |$)/);
    assert.equal(wideRows.length, 1, 'a wider panel fits all four in one row');
    assert.equal(wideRows[0].children.length, 4);
    wide.ext.disable();
});

test('the assigned card is marked in place and independent of Auto', () => {
    const { env, ext } = makeEnv({ presets: JSON.stringify(PRESETS) });
    const { app } = openPanel(env, ext, PRESETS, { assign: 'b', autoOff: true });
    assert.equal(app.ops.layoutFor(app, 0, 0).auto, false, 'Auto is off');
    const beta = cardOf(app, 'Beta');
    assert.ok(/gk-card-assigned/.test(beta.style_class), 'assigned card carries the state class');
    assert.equal(byClass(beta, /^gk-card-state(?: |$)/)[0].visible, true, 'assigned row is shown');
    const alpha = cardOf(app, 'Alpha');
    assert.equal(/gk-card-assigned/.test(alpha.style_class), false, 'others stay plain');
    assert.equal(byClass(alpha, /^gk-card-state(?: |$)/)[0].visible, false, 'others keep the row hidden');
    ext.disable();
});

test('clicking a card assigns it, turns Auto on, tiles and moves the mark in place', () => {
    const { env, ext } = makeEnv({ presets: JSON.stringify(PRESETS) });
    const { app, window } = openPanel(env, ext, PRESETS, { assign: 'a' });
    const panelBefore = app.panel.actor;
    cardOf(app, 'Beta').emit('clicked');
    assert.equal(app.ops.layoutFor(app, 0, 0).preset.id, 'b', 'the clicked preset is assigned');
    assert.equal(app.ops.layoutFor(app, 0, 0).auto, true, 'choosing a preset turns automatic tiling on');
    assert.ok(window.moves.length > 0, 'the workspace was retiled');
    assert.equal(/gk-card-assigned/.test(cardOf(app, 'Beta').style_class), true, 'the mark moved to Beta');
    assert.equal(/gk-card-assigned/.test(cardOf(app, 'Alpha').style_class), false, 'Alpha lost it');
    assert.equal(app.panel.actor, panelBefore, 'the panel was not rebuilt (scroll/focus stay put)');
    ext.disable();
});

test('the unassign action clears only the assignment, never the preset', () => {
    const { env, ext } = makeEnv({ presets: JSON.stringify(PRESETS) });
    const { app } = openPanel(env, ext, PRESETS, { assign: 'a' });
    const unassigns = byClass(cardOf(app, 'Alpha'), /gk-card-unassign/);
    assert.equal(unassigns.length, 1);
    unassigns[0].emit('clicked');
    assert.equal(app.ops.layoutFor(app, 0, 0).preset, null, 'the assignment is gone');
    assert.equal(app.ops.presetsRead(app).length, PRESETS.length, 'the preset itself survives');
    assert.equal(/gk-card-assigned/.test(cardOf(app, 'Alpha').style_class), false, 'the mark is cleared');
    ext.disable();
});

test('the edit action opens the editor instead of applying the preset', () => {
    const { env, ext } = makeEnv({ presets: JSON.stringify(PRESETS) });
    const { app, window } = openPanel(env, ext, PRESETS, { assign: 'a' });
    const before = window.moves.length;
    byClass(cardOf(app, 'Gamma'), /gk-card-edit/)[0].emit('clicked');
    assert.equal(app.panel.view, 'editor', 'the editor view is shown');
    assert.equal(app.ops.layoutFor(app, 0, 0).preset.id, 'a', 'the assignment did not change');
    assert.equal(window.moves.length, before, 'edit did not retile');
    ext.disable();
});

test('an empty preset list shows the placeholder and the truthful no-window preview', () => {
    const { env, ext } = makeEnv({ presets: '[]' });
    const { app } = openPanel(env, ext, []);
    // no windows anywhere: focusWindow() falls back to the tab list, so both must be empty
    env.tabList.length = 0;
    env.display.focus_window = null;
    app.panel.close();
    env.keybindingManager.hotkeys.get('greenTile-preset').cb();
    assert.equal(cards(app).length, 0, 'no cards');
    assert.equal(byClass(app.panel.actor, /^gk-muted/).length, 1, 'the placeholder is shown');
    const preview = byClass(app.panel.actor, /^gk-preview/)[0];
    assert.equal(preview.text, 'No windows open — base layout', 'the empty workspace is not counted as 0 windows');
    ext.disable();
});

test('the preview line names the current window count', () => {
    const { env, ext } = makeEnv({ presets: JSON.stringify(PRESETS) });
    const { app } = openPanel(env, ext);
    // two windows, one focused: the panel counts the focused monitor/workspace
    const preview = byClass(app.panel.actor, /^gk-preview/)[0];
    assert.equal(preview.text, 'Preview for 2 windows');
    ext.disable();
});

test('a single window reads in the singular', () => {
    const { env, ext } = makeEnv({ presets: JSON.stringify(PRESETS) });
    // drop the second window before the panel opens
    const panel = openPanel(env, ext);
    env.tabList.pop();
    panel.app.panel.close();
    env.keybindingManager.hotkeys.get('greenTile-preset').cb();
    const preview = byClass(panel.app.panel.actor, /^gk-preview/)[0];
    assert.equal(preview.text, 'Preview for 1 window');
    ext.disable();
});

test('the model is loaded through the shipped namespace', () => {
    // guard against a silent divergence between the pure model and the panel wiring
    const grid = load('./lib/model/grid.js');
    assert.equal(typeof grid.gridColumns, 'function');
    assert.equal(grid.gridColumns(grid.gridAvailable(600)), 3);
});

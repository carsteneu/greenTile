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
    if (extra.seedPresets !== false) {
        app.ops.presetsWrite(app, presets);
    }
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

test('the panel opens when BoxLayout rejects native-invalid fill constructor properties', () => {
    // Cinnamon 6.6.9 rejects x_fill on St.BoxLayout: it is child packing,
    // not an actor constructor property. The loose shared fake misses this.
    const { env, ext } = makeEnv({ presets: JSON.stringify(PRESETS) });
    const St = env.gi.St;
    const BoxLayout = St.BoxLayout;
    St.BoxLayout = class extends BoxLayout {
        constructor(props = {}) {
            for (const prop of ['x_fill', 'y_fill']) {
                if (Object.prototype.hasOwnProperty.call(props, prop)) {
                    throw new Error(`No property ${prop} on StBoxLayout`);
                }
            }
            super(props);
        }
    };
    try {
        const { app } = openPanel(env, ext);
        assert.equal(cards(app).length, PRESETS.length, 'all cards open through the actual hotkey');
    }
    finally {
        ext.disable();
    }
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

test('unassigning lets the Auto button follow the stored state again', () => {
    // A first card click leaves an entry with only `preset` (auto is derived from
    // it), so dropping the preset drops Auto with it — the header must say so
    // instead of keeping the stale "Auto: on".
    const { env, ext } = makeEnv({ presets: JSON.stringify(PRESETS) });
    const { app } = openPanel(env, ext, PRESETS);
    const autoBtn = () => byClass(app.panel.actor, /^gk-auto(?: |$)/)[0];
    assert.equal(autoBtn().label, 'Auto: off', 'Auto starts off');
    cardOf(app, 'Alpha').emit('clicked');
    assert.equal(autoBtn().label, 'Auto: on', 'applying a preset turns Auto on');
    byClass(cardOf(app, 'Alpha'), /gk-card-unassign/)[0].emit('clicked');
    assert.equal(app.ops.layoutFor(app, 0, 0).auto, false, 'Auto is off again in the layout');
    assert.equal(autoBtn().label, 'Auto: off', 'and the header follows it');
    ext.disable();
});

test('a stored width clamped to the monitor sizes the cards for the width really used', () => {
    // Open with a width wider than the monitor: the panel clamps it, and the two
    // refills (raw stored width, then clamped) land in the same column band — the
    // second must move the card width instead of returning early on the columns.
    const grid = load('./lib/model/grid.js');
    const { env, ext } = makeEnv({
        presets: JSON.stringify(PRESETS),
        panelSize: JSON.stringify({ list: { w: MONITOR.width + 50, h: 400 } }),
    });
    const { app } = openPanel(env, ext);
    const avail = grid.gridAvailable(MONITOR.width);
    const wide = grid.gridAvailable(MONITOR.width + 50);
    assert.equal(grid.gridColumns(avail), grid.gridColumns(wide), 'both widths stay in the same column band');
    const expected = grid.gridCardWidth(avail, grid.gridColumns(avail));
    assert.notEqual(expected, grid.gridCardWidth(wide, grid.gridColumns(wide)), 'the card width really differs between the two bands');
    const built = cards(app);
    assert.equal(built.length, PRESETS.length);
    for (const card of built) {
        assert.equal(card.width, expected, 'the card follows the clamped panel width');
    }
    ext.disable();
});

test('the panel lays the starter presets out at the theme scale factor (HiDPI regression)', () => {
    // Round-1 VM finding: at St theme scale 2 the real .gk-card-row spacing is 28
    // while the grid constants stayed 14, so the card row's minimum grew past the
    // panel's allocation and St laid every child out wider than the panel's own
    // background (measured live: 1476 px of row in a 1429 px panel). The panel must
    // ask the model for the layout at the session's theme scale factor.
    const fs = require('node:fs');
    const path = require('node:path');
    const { ROOT } = require('../helpers/cinnamon-loader');
    const grid = load('./lib/model/grid.js');
    const presets = JSON.parse(JSON.parse(fs.readFileSync(path.join(ROOT, 'settings-schema.json'), 'utf8')).presets.default);
    const width = 1429;
    const { env, ext } = makeEnv({
        presets: JSON.stringify(presets),
        panelSize: JSON.stringify({ list: { w: width, h: 480 } }),
    });
    env.themeScale = 2;
    try {
        const { app } = openPanel(env, ext, presets, { seedPresets: false });
        const expected = grid.gridLayout(width, 2);
        const built = cards(app);
        assert.equal(built.length, presets.length, 'every preset still gets a card');
        const rows = byClass(app.panel.actor, /^gk-card-row(?: |$)/);
        assert.equal(rows[0].children.length, expected.columns, 'the first row holds the scaled column count');
        for (const card of built) {
            assert.equal(card.width, expected.cardWidth, 'the card follows the scaled layout');
        }
        const rowWidth = expected.columns * expected.cardWidth + (expected.columns - 1) * expected.gap;
        assert.ok(rowWidth <= expected.available, `the card row (${rowWidth}) must fit the card area (${expected.available})`);
        assert.notEqual(expected.columns, grid.gridLayout(width, 1).columns, 'scale 2 really changes the column count');
        // The panel's PRESET_CARD_CHROME_W mirror is pinned by the preview width
        // below: it is what the panel actually subtracted from the card.
        const thumb = findAll(cardOf(app, presets[0].name), (actor) => actor instanceof env.gi.St.DrawingArea)[0];
        assert.equal(thumb.width, expected.cardWidth - expected.cardChrome, 'the preview is sized beside the scaled chrome');
    }
    finally {
        ext.disable();
    }
});

test('a card is a keyboard stop with a focus look of its own', () => {
    // St.Button activates on Enter/Space once focused, so can_focus is the keyboard
    // path to a preset and the focus look must stay separate from hover.
    const fs = require('node:fs');
    const path = require('node:path');
    const { ROOT } = require('../helpers/cinnamon-loader');
    const { env, ext } = makeEnv({ presets: JSON.stringify(PRESETS) });
    const { app } = openPanel(env, ext);
    assert.equal(cardOf(app, 'Alpha').can_focus, true, 'the card takes the keyboard focus');
    const css = fs.readFileSync(path.join(ROOT, 'stylesheet.css'), 'utf8');
    assert.match(css, /\.gk-card:focus \{/, 'the card carries a focus rule');
    ext.disable();
});

test('a single preset builds one card in one row', () => {
    const only = [PRESETS[0]];
    const { env, ext } = makeEnv({ presets: JSON.stringify(only) });
    const { app } = openPanel(env, ext, only);
    assert.equal(cards(app).length, 1, 'one card');
    const rows = byClass(app.panel.actor, /^gk-card-row(?: |$)/);
    assert.equal(rows.length, 1, 'one row');
    assert.equal(rows[0].children.length, 1, 'holding the only card');
    ext.disable();
});

test('a long preset name is ellipsized inside the card instead of growing it', () => {
    const long = { id: 'z', name: 'Ultrawide 49 inch left stack right stack', rules: [{ min: 1, stacks: [1] }] };
    const { env, ext } = makeEnv({ presets: JSON.stringify([long]) });
    const { app } = openPanel(env, ext, [long]);
    const label = byClass(cardOf(app, long.name), /^gk-name(?: |$)/)[0];
    assert.equal(label.text, long.name, 'the full name is kept as the label text');
    assert.equal(label.clutter_text.ellipsize, 'end', 'the label truncates with an ellipsis');
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

test('fresh install panel chunks all sixteen starter cards into four rows of four', () => {
    // The row chunking and the grid width are what this fake CAN check; the card height and
    // therefore the vertical fit come from the theme's text metrics, which the fake stubs,
    // so how much of the fourth row is visible on the default panel height is only
    // verifiable on a live desktop.
    const fs = require('node:fs');
    const path = require('node:path');
    const { ROOT } = require('../helpers/cinnamon-loader');
    const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'settings-schema.json'), 'utf8'));
    const presets = JSON.parse(schema.presets.default);
    const { env, ext } = makeEnv({ presets: schema.presets.default, panelSize: schema.panelSize.default });
    try {
        const { app } = openPanel(env, ext, presets, { seedPresets: false });
        assert.equal(cards(app).length, 16);
        const rows = byClass(app.panel.actor, /^gk-card-row(?: |$)/);
        assert.deepEqual(rows.map(r => r.children.length), [4, 4, 4, 4]);
        assert.equal(app.panel.actor.width, 800);
        assert.equal(byClass(app.panel.actor, /^gk-scroll(?: |$)/)[0].height, 560);
        assert.match(app.panel.actor.style_class, /\bgk-panel-list\b/);
        // Font reduction belongs to view 1 only; opening the editor keeps its typography.
        byClass(cards(app)[0], /gk-card-edit/)[0].emit('clicked');
        assert.doesNotMatch(app.panel.actor.style_class, /\bgk-panel-list\b/);
    }
    finally {
        ext.disable();
    }
});

test('selection typography is one pixel smaller without changing the editor', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const { ROOT } = require('../helpers/cinnamon-loader');
    const css = fs.readFileSync(path.join(ROOT, 'stylesheet.css'), 'utf8');
    assert.match(css, /\.gk-panel-list\s*\{[^}]*font-size:\s*15px;/);
    assert.match(css, /\.gk-panel-list \.gk-name\s*\{[^}]*font-size:\s*13px;/);
    assert.match(css, /\.gk-panel-list \.gk-title\s*\{[^}]*font-size:\s*15px;/);
    assert.match(css, /\.gk-panel-list \.gk-plus\s*\{[^}]*font-size:\s*15px;/);
    assert.match(css, /\.gk-panel\s*\{[^}]*font-size:\s*16px;/);
});

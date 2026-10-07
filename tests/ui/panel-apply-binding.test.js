'use strict';
// A preset card click is BINDING: it is the user's latest input, so it clears this monitor
// + workspace's dragged sizes (moved borders and dropped layouts) exactly like Reset sizes
// does, and then applies + retiles once. Driven through the real panel on the fake runtime;
// the assertions read the stored `layouts` setting and the real window rects, because the
// fake St has no allocation.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, makeWindow, settingsInstance, MONITOR } = require('../helpers/fakes/cinnamon-harness');

// A workspace hub with real connect/disconnect accounting, like the panel and the
// extension connect to it (the shared fake's bare makeWorkspace has no connect).
const makeWs = (wsIndex = 0) => {
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
    { id: 'p-cols', name: 'Cols', rules: [{ min: 2, stacks: [1, 1, 1] }] },
    { id: 'p-wide', name: 'Wide', rules: [{ min: 2, stacks: [1, 1, 1], spans: [1, 4, 1] }] },
];

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
/** Left edges of the columns the windows actually landed in. */
const columns = (wins) => [...new Set(wins.map((w) => w.rect[0]))].sort((a, b) => a - b);
/** Placement calls: one resize per window per retile, so one retile keeps this at one per
 *  window and a second one doubles it. (Windows that enforce a minimum can be placed more
 *  than once inside a single retile, so keep fixture minima out of these cases.) */
const places = (wins) => wins.reduce((sum, w) => sum + w.moves.filter((m) => m[0] === 'resize').length, 0);
const entryOf = (env) => {
    const layouts = JSON.parse(settingsInstance(env).getValue('layouts'));
    const ref = JSON.parse(settingsInstance(env).getValue('__r3ref'));
    return layouts[ref.mkey][ref.wskey];
};

/**
 * Six windows on monitor 0, a preset assigned, optional dragged sizes stored, panel open.
 * The ref used to key the store is remembered in the settings fake so the assertions can
 * read the same entry back.
 */
const setup = ({ n = 6, assign = 'p-cols', sizes = true, extra = null } = {}) => {
    const { env, ext } = makeEnv({ presets: JSON.stringify(PRESETS) });
    const ws = makeWs(0);
    ws.list_windows = () => env.tabList;
    env.workspaces.push(ws);
    env.activeWorkspace = ws;
    const wins = [];
    for (let i = 0; i < n; i++) {
        const w = makeWindow(env, 100 + i, [i * 300, 0, 300, 300]);
        wins.push(w);
        env.tabList.push(w);
    }
    env.layoutManager.monitors.push(MONITOR);
    ext.enable();
    env.flushDisplayConfigNoReply();
    env.display.focus_window = wins[0];
    const app = ext.currentSession().app;
    app.ops.presetsWrite(app, PRESETS);
    if (assign) {
        app.ops.layoutSet(app, 0, 0, { preset: assign });
    }
    const ref = app.split.ref(app, 0, 0, n);
    settingsInstance(env).setValue('__r3ref', JSON.stringify({ mkey: ref.mkey, wskey: ref.wskey }));
    if (sizes) {
        // The user's stored intent: a dropped 5-column layout AND a moved border for the
        // current window count (what his live workspace held when the panel stopped applying).
        const layouts = {};
        layouts[ref.mkey] = {};
        layouts[ref.mkey][ref.wskey] = {
            preset: assign || null,
            shapes: { [String(n)]: { kind: 'cols', shape: [1, 1, 2, 1, 1] } },
            splits: {
                [String(n)]: { kind: 'cols', shape: [1, 1, 2, 1, 1], major: [0.2, 0.2, 0.2, 0.2, 0.2], minor: [[1], [1], [0.5, 0.5], [1], [1]] },
            },
        };
        for (const [key, value] of Object.entries(extra || {})) {
            layouts[key] = value;
        }
        settingsInstance(env).setValue('layouts', JSON.stringify(layouts));
        app.ops.retileMonitor(app, 0, null, false);
    }
    env.keybindingManager.hotkeys.get('greenTile-preset').cb();
    assert.ok(app.panel.actor, 'the panel is open');
    return { env, ext, app, wins };
};

test('a card click clears this workspace dragged sizes and applies the clicked preset', () => {
    const { env, ext, app, wins } = setup();
    // The dragged layout wins before the click: five columns.
    assert.equal(columns(wins).length, 5, 'the stored dragged shape is in effect');
    assert.equal(byClass(app.panel.actor, /^gk-reset-btn/).length, 1, 'Reset sizes is offered');
    const panel = app.panel.actor;
    for (const w of wins) {
        w.moves.length = 0;
    }
    cardOf(app, 'Wide').emit('clicked');
    // The clicked preset's own layout: three columns at 1/6, 4/6, 1/6 (its spans).
    const cols = columns(wins);
    assert.equal(cols.length, 3, 'three columns after the click, got ' + JSON.stringify(cols));
    const widths = cols.map((x) => wins.find((w) => w.rect[0] === x).rect[2]);
    assert.ok(widths[1] > widths[0] * 3.5, 'the middle column carries the spans, got ' + JSON.stringify(widths));
    assert.ok(Math.abs(widths[2] - widths[0]) <= 2, 'the outer columns stay equal, got ' + JSON.stringify(widths));
    // One retile: a second placement of the same preset layout would double this. The
    // column positions above are what pins the ORDER (a reset after the retile leaves the
    // dragged shape in place for the retile and shows five columns).
    assert.equal(places(wins), wins.length, 'one retile placed every window once');
    // The stored dragged sizes are gone for this monitor + workspace only.
    const entry = entryOf(env);
    assert.equal('shapes' in entry, false, 'dragged shapes cleared');
    assert.equal('splits' in entry, false, 'moved borders cleared');
    assert.equal(entry.preset, 'p-wide', 'the clicked preset is assigned');
    // Auto is derived from the assignment, so a click turns it on even without its own key.
    assert.equal(app.ops.layoutFor(app, 0, 0).auto, true, 'a click turns Auto on');
    // The Reset-sizes button has nothing left to reset and left the tree without a rebuild.
    assert.equal(byClass(app.panel.actor, /^gk-reset-btn/).length, 0, 'Reset sizes is gone');
    assert.equal(app.panel.actor, panel, 'no panel rebuild (same actor)');
    ext.disable();
});

test('clicking the card that is already assigned also binds and retiles once', () => {
    const { env, ext, app, wins } = setup({ assign: 'p-cols' });
    assert.equal(columns(wins).length, 5, 'the dragged shape is in effect before the click');
    for (const w of wins) {
        w.moves.length = 0;
    }
    cardOf(app, 'Cols').emit('clicked');
    assert.equal(columns(wins).length, 3, 'the assigned preset now binds');
    assert.equal(places(wins), wins.length, 'one retile');
    const entry = entryOf(env);
    assert.equal('shapes' in entry, false);
    assert.equal('splits' in entry, false);
    ext.disable();
});

test('other workspaces and other monitors keep their dragged sizes', () => {
    const otherWs = { shapes: { 6: { kind: 'cols', shape: [1, 1, 1, 1, 1, 1] } }, splits: { 3: { kind: 'cols', shape: [1, 1, 1] } } };
    const otherMonitor = { '1': { preset: 'p-cols', shapes: { 6: { kind: 'rows', shape: [3, 3] } } } };
    const { env, ext, app } = setup({ extra: { 'second-workspace': { '2': otherWs }, 'other-monitor': otherMonitor } });
    cardOf(app, 'Wide').emit('clicked');
    const layouts = JSON.parse(settingsInstance(env).getValue('layouts'));
    assert.deepEqual(layouts['second-workspace']['2'], otherWs, 'another workspace of the same monitor');
    assert.deepEqual(layouts['other-monitor'], otherMonitor, 'another monitor');
    ext.disable();
});

test('a refused assignment leaves the dragged sizes untouched', () => {
    const { env, ext, app, wins } = setup();
    // The reset must not run at all here. Spying on the instance is what binds it: with
    // only the store/no-log assertions the test also passed when the reset ran
    // unconditionally, because a corrupt store refuses both writes on its own.
    let resets = 0;
    const original = app.split.reset;
    app.split.reset = (...args) => {
        resets += 1;
        return original.apply(app.split, args);
    };
    // A corrupt store makes every layoutSet refuse: nothing may be cleared then. The
    // store's own "is corrupt, not writing it" warning is expected; an assignment is not.
    settingsInstance(env).setValue('layouts', '{"broken"');
    cardOf(app, 'Wide').emit('clicked');
    assert.equal(resets, 0, 'no reset ran when the assignment was refused');
    assert.equal(settingsInstance(env).getValue('layouts'), '{"broken"', 'the corrupt store is not rewritten');
    assert.ok(!env.logs.some((line) => /assigned/.test(line)), 'nothing was logged as assigned');
    assert.equal(columns(wins).length, 5, 'the windows keep their dragged layout');
    ext.disable();
});

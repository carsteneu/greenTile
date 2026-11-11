'use strict';
// The "Space to the screen edge" stepper in the preset panel (lib/ui/panel.js
// with lib/model/gap.js): its own row directly below "Gap between windows",
// − / value / + in 1 px steps clamped to 0..48, each click storing the value and
// scheduling the debounced retile that makes the margin show live. It writes its
// own key, never windowGap.
const test = require('node:test');
const assert = require('node:assert/strict');
const { MONITOR, makeEnv, makeWindow, settingsInstance } = require('../helpers/fakes/cinnamon-harness');

// A workspace hub with real connect/disconnect accounting, like the panel connects.
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

/** Boots the extension on one monitor with one tiled lone window and opens the panel. */
const openPanel = (settings = {}) => {
    const { env, ext } = makeEnv(Object.assign({ singleWindowMode: 'fill', singleWindowMigrated: true }, settings));
    const ws = makeWorkspace(0);
    const w = makeWindow(env, 801, [50, 70, 320, 200]);
    ws.list_windows = () => env.tabList;
    env.workspaces.push(ws);
    env.activeWorkspace = ws;
    env.tabList.push(w);
    env.layoutManager.monitors.push(MONITOR);
    ext.enable();
    env.flushDisplayConfigNoReply();
    env.display.focus_window = w;
    const app = ext.currentSession().app;
    app.ops.layoutSet(app, 0, 0, { preset: null, auto: true });
    app.ops.retileMonitor(app, 0);
    env.keybindingManager.hotkeys.get('greenTile-preset').cb();
    assert.ok(app.panel.actor, 'the panel is open');
    return { env, ext, app, window: w };
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
const edgeRow = (app) => byClass(app.panel.actor, /^gk-gap-row(?: |$)/).find((r) => /gk-edge-row/.test(r.style_class));
const labelOf = (row) => byClass(row, /^gk-gap-label(?: |$)/)[0].text;
const valueOf = (row) => byClass(row, /^gk-gap-value(?: |$)/)[0].text;
const buttonsOf = (row) => byClass(row, /^gk-gap-btn(?: |$)/);

/** Runs the pending 150 ms retile timer the row schedules. */
const runRetile = (env) => {
    const timer = [...env.timers.entries()].find(([, t]) => t.ms === 150);
    assert.ok(timer, 'the row scheduled the debounced retile');
    timer[1].cb();
};

test('the edge stepper sits in its own row directly below the gap row', () => {
    const { env, ext, app } = openPanel({ edgeGap: 12 });
    const rows = byClass(app.panel.actor, /^gk-gap-row(?: |$)/);
    assert.equal(rows.length, 2, 'two spacing rows');
    assert.equal(labelOf(rows[0]), 'Gap between windows', 'the window gap keeps the first row');
    assert.equal(labelOf(rows[1]), 'Space to the screen edge', 'the edge stepper follows in its own row');
    assert.equal(/gk-edge-row/.test(rows[0].style_class), false, 'the gap row is unchanged');
    assert.equal(valueOf(rows[1]), '12 px', 'the row shows the stored value');
    assert.deepEqual(buttonsOf(rows[1]).map((b) => b.label), ['−', '+'], 'minus and plus, like the gap row');
    ext.disable();
});

test('a click stores the value and schedules the debounced retile that shows it', () => {
    const { env, ext, app, window } = openPanel();
    const row = edgeRow(app);
    assert.equal(valueOf(row), '0 px', 'default is 0');
    assert.deepEqual(window.rect.slice(), [0, 0, 2000, 1100], 'default: the lone window fills the area, flush');
    buttonsOf(row)[1].emit('clicked');
    assert.equal(settingsInstance(env).getValue('edgeGap'), 1, 'the click stored 1 px');
    assert.equal(settingsInstance(env).getValue('windowGap'), 8, 'the window gap is untouched');
    assert.equal(valueOf(row), '1 px', 'the row follows without a rebuild');
    runRetile(env);
    assert.deepEqual(window.rect.slice(), [1, 1, 1998, 1098], 'the retile applied the margin');
    ext.disable();
});

test('minus stops at 0 and plus stops at 48', () => {
    const zero = openPanel();
    const zeroRow = edgeRow(zero.app);
    buttonsOf(zeroRow)[0].emit('clicked');
    assert.equal(settingsInstance(zero.env).getValue('edgeGap'), 0, 'minus at 0 stores 0');
    assert.equal(buttonsOf(zeroRow)[0].reactive, false, 'and is inert');
    zero.ext.disable();

    const top = openPanel({ edgeGap: 47 });
    const topRow = edgeRow(top.app);
    buttonsOf(topRow)[1].emit('clicked');
    assert.equal(settingsInstance(top.env).getValue('edgeGap'), 48, 'one step below the maximum reaches it');
    assert.equal(valueOf(topRow), '48 px');
    assert.equal(buttonsOf(topRow)[1].reactive, false, 'plus is inert at the maximum');
    buttonsOf(topRow)[1].emit('clicked');
    assert.equal(settingsInstance(top.env).getValue('edgeGap'), 48, 'and cannot go past it');
    top.ext.disable();
});

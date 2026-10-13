'use strict';
// The preset editor's assignment list (lib/ui/editor.js): the right column names
// every monitor+workspace slot the edited preset hangs on, read-only. It exists
// because a stored assignment is keyed by the preset id alone — the user has to
// see WHERE a save would land before saving, and which slots a rename or a rule
// change would reshape.
const test = require('node:test');
const assert = require('node:assert/strict');

const {
    makeEnv, makeWindow, makeWorkspace, settingsInstance, enableOnMonitors, MONITOR,
} = require('../helpers/fakes/cinnamon-harness');

// A NAMED monitor: the panel label comes from the monitor name, the stored key from
// the fallback key built out of that name (the fake DisplayConfig never replies).
const NAMED = Object.assign({}, MONITOR, { name: 'AOC 49"' });
const PRESETS = [{ id: 'p1', name: 'Alpha', rules: [{ min: 1, stacks: [1, 1] }] }];

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
/** Text of every actor whose style_class starts with `styleClass`. */
const texts = (root, styleClass) => findAll(root, (a) => (a.style_class || '').indexOf(styleClass) === 0).map((a) => a.text);

/** Boots the extension on one named monitor with the preset list seeded. */
const boot = () => {
    const { env, ext } = makeEnv({ presets: JSON.stringify(PRESETS) });
    enableOnMonitors(env, ext, [NAMED]);
    const ws = makeWorkspace(env);
    ws.index = () => 0;
    env.activeWorkspace = ws;
    env.tabList.push(makeWindow(env, 11, [10, 10, 400, 300]));
    const app = ext.currentSession().app;
    app.ops.presetsWrite(app, PRESETS);
    return { env, ext, app };
};

const storeLayouts = (env, layouts) => settingsInstance(env).setValue('layouts', JSON.stringify(layouts));

/** Opens the panel through the real hotkey and edits its first preset. */
const openEditor = (ctx) => {
    const { env, app } = ctx;
    env.keybindingManager.hotkeys.get('greenTile-preset').cb();
    const card = byClass(app.panel.actor, /gk-card(?: |$)/)[0];
    assert.ok(card, 'the first card exists');
    byClass(card, /gk-card-edit/)[0].emit('clicked');
    assert.equal(app.panel.view, 'editor', 'the editor is open');
    return app.panel.actor;
};

test('two assignments are listed with their monitor label and workspace number', () => {
    const ctx = boot();
    storeLayouts(ctx.env, { [ctx.app.monitors.keys[0]]: { '3': { preset: 'p1' }, '5': { preset: 'p1' } } });
    const panel = openEditor(ctx);
    assert.deepEqual(texts(panel, 'gk-ed-used'), ['AOC 49" · workspace 3', 'AOC 49" · workspace 5']);
    ctx.ext.disable();
});

test('a preset nobody assigned says so instead of listing nothing', () => {
    const ctx = boot();
    storeLayouts(ctx.env, {});
    const panel = openEditor(ctx);
    assert.deepEqual(texts(panel, 'gk-ed-used'), [], 'no slot line');
    assert.equal(texts(panel, 'gk-ed-faint').includes('Not assigned anywhere.'), true, 'the empty state is named');
    ctx.ext.disable();
});

test('a slot on a monitor that is not connected is named by its raw key', () => {
    const ctx = boot();
    storeLayouts(ctx.env, { 'SAM|C34H89x|HTOMA00566': { '1': { preset: 'p1' } } });
    const panel = openEditor(ctx);
    assert.deepEqual(texts(panel, 'gk-ed-used'), ['SAM|C34H89x|HTOMA00566 · workspace 1']);
    ctx.ext.disable();
});

test('an all-workspaces assignment is named as such', () => {
    const ctx = boot();
    storeLayouts(ctx.env, { [ctx.app.monitors.keys[0]]: { '*': { preset: 'p1' } } });
    const panel = openEditor(ctx);
    assert.deepEqual(texts(panel, 'gk-ed-used'), ['AOC 49" · all workspaces']);
    ctx.ext.disable();
});

test('more than six assignments collapse into five lines and a count', () => {
    const ctx = boot();
    const entries = {};
    for (let ws = 1; ws <= 8; ws++) {
        entries[String(ws)] = { preset: 'p1' };
    }
    storeLayouts(ctx.env, { [ctx.app.monitors.keys[0]]: entries });
    const panel = openEditor(ctx);
    const lines = texts(panel, 'gk-ed-used');
    assert.deepEqual(lines.slice(0, 5), [
        'AOC 49" · workspace 1', 'AOC 49" · workspace 2', 'AOC 49" · workspace 3',
        'AOC 49" · workspace 4', 'AOC 49" · workspace 5',
    ]);
    assert.equal(lines.at(-1), '+3 more', 'the rest is counted, not silently dropped');
    assert.equal(lines.length, 6, 'five slots plus the count line');
    ctx.ext.disable();
});

test('an unreadable workspace key is shown raw instead of as a number', () => {
    // greenTile only ever writes "<n>" or "*", but a hand-edited or restored store can
    // carry anything. The layout lookup keys on the canonical string, so a non-canonical
    // key must not be dressed up as a workspace number the lookup would never match.
    const ctx = boot();
    storeLayouts(ctx.env, {
        [ctx.app.monitors.keys[0]]: {
            abc: { preset: 'p1' }, '01': { preset: 'p1' }, '1e3': { preset: 'p1' },
            '1.5': { preset: 'p1' }, Infinity: { preset: 'p1' },
        },
    });
    const panel = openEditor(ctx);
    assert.deepEqual(texts(panel, 'gk-ed-used'), [
        'AOC 49" · abc', 'AOC 49" · 01', 'AOC 49" · 1e3', 'AOC 49" · 1.5', 'AOC 49" · Infinity',
    ]);
    ctx.ext.disable();
});

test('the assignment lines carry a stylesheet rule of the column', () => {
    // The lines are text, not a hook: without a rule they render in St's default look
    // next to the 11px tokens of this column.
    const fs = require('node:fs');
    const path = require('node:path');
    const { ROOT } = require('../helpers/cinnamon-loader');
    const css = fs.readFileSync(path.join(ROOT, 'stylesheet.css'), 'utf8');
    assert.match(css, /\.gk-ed-used \{[^}]*font-size:\s*11px;/);
    assert.match(css, /\.gk-ed-used \{[^}]*color:\s*#8b91a0;/);
    assert.match(css, /\.gk-light \.gk-ed-used \{[^}]*color:\s*#5f6672;/);
});

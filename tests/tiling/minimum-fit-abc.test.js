'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { load, cinnamonLoad, ROOT } = require('../helpers/cinnamon-loader');
const { makeEnv, makeWindow, makeWorkspace, settingsInstance, enableOnMonitors } = require('../helpers/fakes/cinnamon-harness');

const LEFT = { x: 0, y: 0, width: 2000, height: 1100 };
const RIGHT = { ...LEFT, x: 2000 };
const setup = (monitors, specs, gap = 0) => {
    const { env, ext } = makeEnv({ windowGap: gap, tileAnimation: false });
    enableOnMonitors(env, ext, monitors);
    const ws = makeWorkspace(env);
    ws.index = () => 0;
    env.activeWorkspace = ws;
    const wins = specs.map(([monitor, min], i) => makeWindow(env, i + 1,
        [monitors[monitor].x + i * 400, 0, 300, 300], monitor, null, { minSize: min }));
    env.tabList.push(...wins);
    env.display.focus_window = wins[0];
    const app = ext.currentSession().app;
    monitors.forEach((_m, i) => app.ops.layoutSet(app, i, 0, { auto: true }));
    return { env, ext, app, wins, settings: settingsInstance(env) };
};
const retile = (app, monitor = 0, ws = 0) => app.ops.retileMonitor(app, monitor, null, false, ws);
const focusRight = (env, w) => env.customBindings.get('push-tile-right')(env.display, w);
const narrower = (env, app) => {
    env.keybindingManager.hotkeys.get('greenTile-resize-narrower').cb();
    app.split.flush(app);
};

test('ABC: four tall applications use the previously unexamined fourth column', () => {
    const f = setup([{ x: 0, y: 0, width: 1300, height: 1000 }],
        Array.from({ length: 4 }, () => [0, [300, 600]]), 12);
    retile(f.app);
    assert.deepEqual(f.wins.map((w) => w.rect),
        [[0, 0, 319, 1000], [331, 0, 313, 1000], [656, 0, 313, 1000], [981, 0, 319, 1000]]);
    retile(f.app);
    assert.deepEqual(f.wins.map((w) => w.rect[3]), [1000, 1000, 1000, 1000]);
});

const countCycle = () => {
    const f = setup([{ ...LEFT, width: 2400 }], [[0, [1400, 0]], [0, [1400, 0]], [0, [500, 0]]]);
    const [A, B, C] = f.wins;
    retile(f.app);
    assert.deepEqual(f.wins.map((w) => w.rect),
        [[0, 0, 2400, 550], [0, 550, 1400, 550], [1400, 550, 1000, 550]]);
    f.wins.forEach((w) => f.app.auto.trackWindow(f.app, w));
    A.minSize[0] = 0;
    B.minSize[0] = 0;
    C.minimized = true;
    C.emit('notify::minimized');
    const timer = f.env.timers.get(f.app.auto._timers.get(0));
    assert.equal(timer.ms, 300);
    timer.cb();
    assert.deepEqual([A.rect, B.rect], [[0, 0, 1200, 1100], [1200, 0, 1200, 1100]]);
    C.minimized = false;
    C.emit('notify::minimized');
    return f;
};

test('ABC: 3 → 2 → 3 before debounce reads current cells, not historical three-window geometry', () => {
    const { env, app, wins: [A, B] } = countCycle();
    focusRight(env, A);
    assert.equal(env.display.focus_window, B, 'focus follows the actually placed neighbour');
    env.pointer = [1800, 100];
    app.drop.begin(app, A, env.gi.Meta.GrabOp.MOVING);
    const hit = app.drop.target(app, A, ...env.pointer);
    assert.ok(hit, 'the actually placed B is hit before the restore timer');
    assert.equal(hit.ordered[hit.toIndex], B);
});

test('ABC: count cycles replace one surface record and re-evaluate relaxed minima', () => {
    const { app, wins } = countCycle();
    assert.equal(app.split._mins.size, 1, 'one last placement per monitor/effective workspace');
    assert.deepEqual(app.split.minsFor(app, 0, 0, 3, wins),
        [{ w: 0, h: 0 }, { w: 0, h: 0 }, { w: 0, h: 0 }]);
    retile(app);
    assert.equal(app.split._mins.size, 1);
    assert.deepEqual(wins.map((w) => w.rect),
        [[0, 0, 800, 1100], [800, 0, 800, 1100], [1600, 0, 800, 1100]]);
});

for (const reset of ['external', 'own']) {
    test(`ABC: ${reset} reset is authoritative before the next resize/retile`, () => {
        const { env, app, settings, wins } = setup([LEFT], [[0, null], [0, null]]);
        const ref = app.split.ref(app, 0, 0, 2);
        app.split.remember(app, ref, { kind: 'rows', shape: [2], major: [1], minor: [[0.7, 0.3]] }, true);
        retile(app);
        assert.deepEqual(wins.map((w) => w.rect[2]), [1400, 600]);
        if (reset === 'external') {
            settings.remoteUpdate({ layouts: JSON.stringify({ [ref.mkey]: { [ref.wskey]: { auto: true } } }) });
        } else {
            app.split.reset(app, 0, 0);
        }
        narrower(env, app);
        assert.deepEqual(wins.map((w) => w.rect), [[0, 0, 999, 1100], [999, 0, 1001, 1100]]);
        assert.deepEqual(app.split.manual(app, 0, 0, 2).minor, [[999 / 2000, 1001 / 2000]]);
    });
}

test('ABC: unrefused two-of-three columns retain exact cells for focus and drop', () => {
    const { env, app, wins: [A, B] } = setup([{ ...LEFT, width: 2400 }], [[0, null], [0, null]]);
    env.keybindingManager.hotkeys.get('greenTile-auto3').cb();
    assert.deepEqual([A.rect, B.rect], [[0, 0, 800, 1100], [800, 0, 800, 1100]]);
    focusRight(env, A);
    assert.equal(env.display.focus_window, B);
    env.pointer = [900, 500];
    app.drop.begin(app, A, env.gi.Meta.GrabOp.MOVING);
    const hit = app.drop.target(app, A, ...env.pointer);
    assert.ok(hit, '900 is in B, not in a guessed 1200-pixel A');
    assert.equal(hit.ordered[hit.toIndex], B);
    assert.deepEqual(app.split.minsFor(app, 0, 0, 2, [A, B]), [{ w: 0, h: 0 }, { w: 0, h: 0 }]);
});

for (const action of ['resize', 'swap']) {
    test(`ABC: ${action} addresses underfilled columns without filling the spare column`, () => {
        const { env, app, wins: [A, B] } = setup([{ ...LEFT, width: 2400 }], [[0, null], [0, null]]);
        env.keybindingManager.hotkeys.get('greenTile-auto3').cb();
        if (action === 'resize') {
            narrower(env, app);
            assert.deepEqual([A.rect, B.rect], [[0, 0, 799, 1100], [799, 0, 801, 1100]]);
            env.pointer = [900, 500];
            app.drop.begin(app, A, env.gi.Meta.GrabOp.MOVING);
            const hit = app.drop.target(app, A, ...env.pointer);
            assert.ok(hit, 'the resized occupied extent is retained by consumers');
            assert.equal(hit.ordered[hit.toIndex], B);
        } else {
            env.keybindingManager.hotkeys.get('greenTile-swap-right').cb();
            assert.deepEqual([A.rect, B.rect], [[800, 0, 800, 1100], [0, 0, 800, 1100]]);
        }
    });
}

test('ABC: cross-monitor preview combines source and target refusal identities at future count', () => {
    const { env, app, settings, wins: [A, D, B, C] } = setup([LEFT, RIGHT],
        [[0, [1400, 0]], [0, [0, 0]], [1, [1400, 0]], [1, [500, 0]]]);
    retile(app, 0);
    retile(app, 1);
    assert.deepEqual([A.rect, D.rect, B.rect, C.rect],
        [[0, 0, 1400, 1100], [1400, 0, 600, 1100], [2000, 0, 1400, 1100], [3400, 0, 600, 1100]]);
    const before = settings.getValue('layouts');
    env.pointer = [3995, 800];
    env.display.get_grab_op = () => env.gi.Meta.GrabOp.MOVING;
    env.display.emit('grab-op-begin', env.display, env.display, A, env.gi.Meta.GrabOp.MOVING);
    A.move_to_monitor(1);
    A.move_frame(false, 3980, 780);
    const preview = [];
    const actor = app.drop._drop.actor;
    actor.set_position = (x, y) => { preview[0] = x; preview[1] = y; };
    actor.set_size = (w, h) => { preview[2] = w; preview[3] = h; };
    assert.equal(app.drop.tick(app), true);
    assert.deepEqual(app.drop._drop.hit.next.order, [0, 1, 2]);
    assert.equal(settings.getValue('layouts'), before, 'preview never writes');
    assert.deepEqual(preview, [2600, 550, 1400, 550]);
    assert.equal(app.drop.end(app, A, env.gi.Meta.GrabOp.MOVING), true);
    assert.deepEqual([B.rect, C.rect, A.rect],
        [[2000, 0, 2000, 550], [2000, 550, 600, 550], [2600, 550, 1400, 550]]);
    retile(app, 1);
    assert.deepEqual(A.rect, preview);
});

test('ABC: monitor landing forecasts the insertion order and chooses best vertical overlap', () => {
    const { env, app, wins: [_D, A, B, C] } = setup([LEFT, RIGHT],
        [[0, [1400, 0]], [0, [1400, 0]], [1, [1400, 0]], [1, [500, 0]]]);
    retile(app, 0);
    retile(app, 1);
    assert.deepEqual(A.rect, [0, 550, 2000, 550]);
    env.display.focus_window = A;
    env.keybindingManager.hotkeys.get('greenTile-swap-right').cb();
    assert.equal(A.get_monitor(), 1);
    assert.deepEqual([B.rect, A.rect, C.rect],
        [[2000, 0, 2000, 550], [2000, 550, 1400, 550], [3400, 550, 600, 550]]);
    retile(app, 1);
    assert.deepEqual([B.rect, A.rect, C.rect],
        [[2000, 0, 2000, 550], [2000, 550, 1400, 550], [3400, 550, 600, 550]]);
});

test('ABC: shared secondary workspace replaces the same placement slot', () => {
    const { env, app, wins } = setup([LEFT, RIGHT], [[1, [1400, 0]], [1, null]]);
    env.gi.Gio.Settings.prototype.get_boolean = () => true;
    app.ops.layoutSet(app, 1, 0, { auto: true });
    retile(app, 1);
    wins[0].minSize[0] = 0;
    const ws = makeWorkspace(env);
    ws.index = () => 1;
    env.activeWorkspace = ws;
    retile(app, 1, 1);
    assert.equal(app.split.ref(app, 1, 0, 2).wskey, '*');
    assert.equal(app.split._mins.size, 1);
    assert.deepEqual(app.split.minsFor(app, 1, 0, 2, wins), [{ w: 0, h: 0 }, { w: 0, h: 0 }]);
});

test('ABC: runtime fit selects shape once and reads raw split once for effective validation', () => {
    const { app, settings } = setup([LEFT], [[0, [1100, 0]], [0, [950, 0]]]);
    const source = fs.readFileSync(path.join(ROOT, 'lib/model/split.js'), 'utf8');
    const ast = ts.createSourceFile('split.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const decl = ast.statements.flatMap((s) => s.declarationList ? [...s.declarationList.declarations] : [])
        .find((d) => d.name.getText(ast) === 'splitFitShape');
    const pos = decl.initializer.body.getStart(ast) + 1;
    const model = cinnamonLoad('var calls = 0;\n' + source.slice(0, pos) + '\ncalls++;\n' + source.slice(pos)
        + '\nvar countCalls = () => calls;', load, 'instrumented-split.js');
    const original = globalThis.imports;
    try {
        globalThis.imports = { extensions: { 'greenTile@carsteneu': { lib: { model: {
            split: model, layouts: load('./lib/model/layouts.js'), 'settings-keys': load('./lib/model/settings-keys.js'),
        } } } } };
        const { Split } = cinnamonLoad(fs.readFileSync(path.join(ROOT, 'lib/runtime/split.js'), 'utf8'), load, 'split.js');
        const runtime = new Split(app.split._deps);
        const ref = runtime.ref(app, 0, 0, 2);
        runtime.remember(app, ref, { kind: 'rows', shape: [1, 1], major: [0.6, 0.4], minor: [[1], [1]] }, true);
        let reads = 0;
        const getValue = settings.getValue.bind(settings);
        settings.getValue = (key) => { if (key === 'layouts') { reads++; } return getValue(key); };
        const fit = runtime.fit(app, 0, 0, 2, { kind: 'rows', shape: [2] },
            [{ w: 1100, h: 0 }, { w: 950, h: 0 }], [0, 0, 2000, 1100], 0);
        assert.deepEqual(fit.shape, [1, 1]);
        assert.deepEqual(fit.split.major, [0.6, 0.4], 'the effective-shape split survives validation');
        assert.equal(model.countCalls(), 1, 'a fit does not run the cubic selector twice');
        assert.equal(reads, 1);
        app.split = runtime;
        const landingSource = fs.readFileSync(path.join(ROOT, 'lib/tiling/swap.js'), 'utf8');
        globalThis.imports.extensions['greenTile@carsteneu'].lib.tiling = {
            screen: { usableArea: () => [0, 0, 2000, 1100] },
            windows: {}, layout: {}, order: { sortReadingOrder: (_app, wins) => wins }, retile: {},
            place: { gap: () => 0 },
        };
        globalThis.imports.extensions['greenTile@carsteneu'].lib.model.swap = {};
        const landing = cinnamonLoad(landingSource, load, 'instrumented-swap.js');
        const windows = [{ get_stable_sequence: () => 10 }, { get_stable_sequence: () => 11 }];
        runtime.setPlacement(app, 0, 0, 2, { kind: 'rows', shape: [2], split: null,
            mins: [{ seq: 10, w: 1100, h: 0 }, { seq: 11, w: 950, h: 0 }] });
        const calls = model.countCalls();
        reads = 0;
        assert.deepEqual(landing.landingCells(app, {}, 0, 0, 2, { kind: 'rows', shape: [2] },
            [windows[0]], windows[1], { monitorIndex: 0, wsIndex: 0 }),
        [[0, 0, 2000, 660], [0, 660, 2000, 440]]);
        assert.equal(model.countCalls() - calls, 1, 'landing uses the same one-selector runtime fit');
        assert.equal(reads, 1, 'landing validates one raw stored split against its fitted shape');
    } finally {
        globalThis.imports = original;
    }
});

test('ABC: workspace landing carries source and target evidence into the actual insertion', () => {
    const { env, app, wins: [D, A, B, C] } = setup([LEFT],
        [[0, [1400, 0]], [0, [1400, 0]], [0, [1400, 0]], [0, [500, 0]]]);
    const source = env.activeWorkspace;
    const target = makeWorkspace(env);
    target.index = () => 1;
    const owners = new Map([[D, source], [A, source], [B, target], [C, target]]);
    for (const w of [D, A, B, C]) {
        w.get_workspace = () => owners.get(w);
        w.change_workspace_by_index = (index) => owners.set(w, env.workspaces[index]);
    }
    source.list_windows = () => [D, A].filter((w) => w.get_workspace() === source);
    target.list_windows = () => [B, C].concat(A.get_workspace() === target ? [A] : []);
    target.activate_with_focus = (w) => {
        env.activeWorkspace = target;
        env.display.focus_window = w;
        env.tabList.splice(0, env.tabList.length, ...target.list_windows());
    };
    app.ops.layoutSet(app, 0, 1, { auto: true });
    retile(app, 0, 0);
    retile(app, 0, 1);
    assert.deepEqual(A.rect, [0, 550, 2000, 550]);
    env.tabList.splice(0, env.tabList.length, D, A);
    env.display.focus_window = A;
    env.keybindingManager.hotkeys.get('greenTile-swap-right').cb();
    assert.equal(A.get_workspace(), target);
    assert.deepEqual([B.rect, A.rect, C.rect],
        [[0, 0, 2000, 550], [0, 550, 1400, 550], [1400, 550, 600, 550]]);
});

test('ABC: impossible minima still record requested cells and actual settled frames honestly', () => {
    const { app, wins } = setup([LEFT], [[0, [1500, 800]], [0, [1500, 800]]]);
    retile(app);
    assert.deepEqual(wins.map((w) => w.rect), [[0, 0, 1500, 1100], [1000, 0, 1500, 1100]]);
    const fit = app.split.effective(app, 0, 0, 2, { kind: 'rows', shape: [2] }, wins);
    assert.deepEqual(fit.cells, [[0, 0, 1500, 1100], [1000, 0, 1500, 1100]],
        'best effort must not pretend the refused windows occupy 1000-pixel cells');
    const entry = [...app.split._mins.values()][0];
    assert.deepEqual(entry.requested, [[0, 0, 1000, 1100], [1000, 0, 1000, 1100]]);
    assert.deepEqual(app.split.minsFor(app, 0, 0, 2, wins), [{ w: 1500, h: 800 }, { w: 1500, h: 800 }],
        'the full-height frames are not evidence of an 1100-pixel height minimum');
});

test('A review: moved drag frame cannot replace its grab-start fallback cell', () => {
    const { env, app, wins: [A, B] } = countCycle();
    app.drop.begin(app, A, env.gi.Meta.GrabOp.MOVING);
    A.move_frame(false, 1700, 50);
    env.pointer = [1800, 100];
    const before = [...app.split._mins.values()][0];
    const hit = app.drop.target(app, A, ...env.pointer);
    assert.ok(hit);
    assert.equal(hit.ordered[hit.toIndex], B);
    assert.equal([...app.split._mins.values()][0], before, 'a grab never rewrites the placement snapshot');
    const nominal = { kind: 'rows', shape: [2] };
    const recorded = app.split.placementFor(app, 0, 0, 2, [A, B]);
    assert.equal(app.split.effective(app, 0, 0, 2, nominal, [A, B], [A.rect, B.rect]), recorded,
        'action-start overrides apply only to unmatched live fallback, never a valid placed snapshot');
});

for (const [gap, phase] of [[0, 'before-key'], [0, 'timer'], [12, 'timer']]) {
    test(`A review: mouse underfill gap ${gap} ${phase} retains its new border and occupied extent`, () => {
        const { env, app, wins: [A, B] } = setup([{ ...LEFT, width: 2400 }], [[0, null], [0, null]], gap);
        env.keybindingManager.hotkeys.get('greenTile-auto3').cb();
        assert.deepEqual([A.rect, B.rect], gap
            ? [[0, 0, 794, 1100], [806, 0, 788, 1100]]
            : [[0, 0, 800, 1100], [800, 0, 800, 1100]]);
        const op = env.gi.Meta.GrabOp.RESIZING_E;
        app.auto.onGrabBegin(app, A, op);
        A.rect = [0, 0, 700, 1100];
        app.split.onResizeEnd(app, A, op);
        const timer = env.timers.get(app.auto._timers.get(0));
        assert.equal(timer.ms, 250);
        if (phase === 'before-key') {
            narrower(env, app);
            assert.deepEqual([A.rect, B.rect], [[0, 0, 699, 1100], [699, 0, 901, 1100]]);
        } else {
            timer.cb();
            assert.deepEqual([A.rect, B.rect], gap
                ? [[0, 0, 700, 1100], [712, 0, 882, 1100]]
                : [[0, 0, 700, 1100], [700, 0, 900, 1100]]);
            retile(app);
            assert.equal(A.rect[2], 700, 'a normal retile uses the same valid manual action geometry');
            assert.equal(B.rect[0] + B.rect[2], gap ? 1594 : 1600);
            app.split.reset(app, 0, 0);
            retile(app);
            assert.deepEqual([A.rect, B.rect], gap
                ? [[0, 0, 1194, 1100], [1206, 0, 1194, 1100]]
                : [[0, 0, 1200, 1100], [1200, 0, 1200, 1100]], 'reset drops the ephemeral occupied extent');
        }
    });
}

test('A review: native-sized fractional underfill swaps without losing its vacant third', () => {
    const { env, app, wins: [A, B] } = setup([{ ...LEFT, height: 1060 }], [[0, null], [0, null]]);
    env.keybindingManager.hotkeys.get('greenTile-auto3').cb();
    assert.deepEqual([A.rect, B.rect], [[0, 0, 667, 1060], [667, 0, 666, 1060]]);
    env.keybindingManager.hotkeys.get('greenTile-swap-right').cb();
    assert.deepEqual([A.rect, B.rect], [[667, 0, 666, 1060], [0, 0, 667, 1060]]);
    const entry = [...app.split._mins.values()][0];
    assert.equal(entry.area[2], 1333);
});

test('A review: declined single/empty source retile drops stale drag minima only on that surface', () => {
    const { env, app, wins: [A, D, B, C] } = setup([LEFT, RIGHT],
        [[0, [1400, 0]], [0, null], [1, [1400, 0]], [1, [500, 0]]]);
    retile(app, 0);
    retile(app, 1);
    app.drop.begin(app, A, env.gi.Meta.GrabOp.MOVING);
    const start = app.drop._drop.start.slice();
    env.tabList.splice(env.tabList.indexOf(D), 1);
    A.minSize[0] = 0;
    retile(app, 0);
    const mins = [{ w: 1400, h: 0 }, { w: 0, h: 0 }, { w: 0, h: 0 }];
    assert.deepEqual(app.split.minsFor(app, 1, 0, 3, [B, C, A], { monitorIndex: 0, wsIndex: 0 }), mins,
        'C never refused its 600-pixel frame: its application minimum is not inferred');
    assert.equal(app.split._mins.size, 1, 'the target record remains intact');
    assert.deepEqual(app.drop._drop.start, start);
    env.display.get_grab_op = () => env.gi.Meta.GrabOp.MOVING;
    A.move_to_monitor(1);
    A.move_frame(false, 3980, 780);
    env.pointer = [3995, 800];
    const preview = [];
    app.drop._drop.actor.set_position = (x, y) => { preview[0] = x; preview[1] = y; };
    app.drop._drop.actor.set_size = (w, h) => { preview[2] = w; preview[3] = h; };
    app.drop.tick(app);
    const model = load('./lib/model/split.js');
    const forecast = model.splitFit('rows', [3], mins, [2000, 0, 2000, 1100], 0, 120, null);
    assert.deepEqual(preview, model.splitRects(forecast.kind, forecast.shape, forecast.split, [2000, 0, 2000, 1100])[2]);
    assert.equal(app.drop.end(app, A, env.gi.Meta.GrabOp.MOVING), true);
    assert.deepEqual(A.rect, [3920, 0, 80, 1100],
        'landing can first discover C\'s unknown 500-pixel minimum; A must not retain the stale 1400');
    retile(app, 0);
    assert.equal(app.split._mins.size, 1, 'zero windows cannot retain a source placement');
});

test('A review: landing validates the saved split against the fitted target shape before choosing its slot', () => {
    const { env, app, wins: [_D, A, B, C] } = setup([LEFT, RIGHT],
        [[0, [1400, 0]], [0, [1400, 0]], [1, [1400, 0]], [1, [500, 0]]]);
    retile(app, 0);
    retile(app, 1);
    const ref = app.split.ref(app, 1, 0, 3);
    app.split.remember(app, ref, { kind: 'rows', shape: [1, 2], major: [0.9, 0.1], minor: [[1], [0.7, 0.3]] }, true);
    assert.deepEqual(A.rect, [0, 550, 2000, 550]);
    env.display.focus_window = A;
    env.keybindingManager.hotkeys.get('greenTile-swap-right').cb();
    assert.deepEqual([A.rect, B.rect, C.rect],
        [[2000, 0, 2000, 980], [2000, 980, 1400, 120], [3400, 980, 600, 120]]);
});

test('A review: underfilled fit clamps against the full gap reference, retaining a 120-pixel final edge', () => {
    const { app, wins } = setup([{ ...LEFT, width: 2400 }], [[0, null], [0, null]], 12);
    const layout = { kind: 'cols', shape: [1, 1], area: [0, 0, 1600, 1100],
        split: { kind: 'cols', shape: [1, 1], major: [1474 / 1600, 126 / 1600], minor: [[1], [1]] } };
    const place = load('./lib/tiling/place.js');
    const fit = place.placeFit(app, wins, layout, [0, 0, 2400, 1100], false, 0, 0, 2);
    assert.deepEqual(wins.map((w) => w.rect), [[0, 0, 1462, 1100], [1474, 0, 120, 1100]]);
    assert.deepEqual(load('./lib/model/split.js').splitRects(fit.kind, fit.shape, fit.split, fit.area),
        [[0, 0, 1468, 1100], [1468, 0, 132, 1100]]);
});

test('A review: a new preset replaces the mouse underfill action extent', () => {
    const { env, app, wins: [A, B], settings } = setup([{ ...LEFT, width: 2400 }], [[0, null], [0, null]]);
    env.keybindingManager.hotkeys.get('greenTile-auto3').cb();
    const op = env.gi.Meta.GrabOp.RESIZING_E;
    app.auto.onGrabBegin(app, A, op);
    A.rect = [0, 0, 700, 1100];
    app.split.onResizeEnd(app, A, op);
    env.timers.get(app.auto._timers.get(0)).cb();
    assert.deepEqual([A.rect, B.rect], [[0, 0, 700, 1100], [700, 0, 900, 1100]]);
    settings.setValue('presets', JSON.stringify([{ id: 'new', name: 'New', rules: [{ min: 2, stacks: [2] }] }]));
    app.ops.layoutSet(app, 0, 0, { preset: 'new', splits: null });
    retile(app);
    assert.deepEqual([A.rect, B.rect], [[0, 0, 2400, 550], [0, 550, 2400, 550]]);
    assert.equal([...app.split._mins.values()][0].area, undefined);
});

test('A final: occupied outer half-gap makes the 120 floor yield to a genuine 1465-pixel refusal', () => {
    const { env, app, wins: [A, B] } = setup([{ ...LEFT, width: 2400 }], [[0, null], [0, null]], 12);
    env.keybindingManager.hotkeys.get('greenTile-auto3').cb();
    assert.deepEqual([A.rect, B.rect], [[0, 0, 794, 1100], [806, 0, 788, 1100]]);
    A.minSize = [1465, 0];
    narrower(env, app);
    assert.deepEqual([A.rect, B.rect], [[0, 0, 1465, 1100], [1477, 0, 117, 1100]]);
    assert.equal(B.rect[0] - A.rect[0] - A.rect[2], 12);
    assert.equal(B.rect[0] + B.rect[2], 1594);
    assert.deepEqual(app.split.minsFor(app, 0, 0, 2, [A, B]), [{ w: 1465, h: 0 }, { w: 0, h: 0 }]);
    const model = load('./lib/model/split.js');
    const fit = model.splitFit('cols', [1, 1], [{ w: 1465, h: 0 }, { w: 0, h: 0 }],
        [0, 0, 1600, 1100], 12, 120, null, undefined, [0, 0, 2400, 1100]);
    const gap = load('./lib/model/gap.js');
    assert.deepEqual(model.splitRects(fit.kind, fit.shape, fit.split, [0, 0, 1600, 1100])
        .map((cell) => gap.gapCell(cell, [0, 0, 2400, 1100], 12)), [A.rect, B.rect]);
});

const pausedFreshColumns = (count = 2, height = 1060) => {
    const { env, ext } = makeEnv({ windowGap: 0, tileAnimation: false });
    enableOnMonitors(env, ext, [{ ...LEFT, height }]);
    const ws = makeWorkspace(env);
    ws.index = () => 0;
    env.activeWorkspace = ws;
    const app = ext.currentSession().app;
    app.ops.layoutSet(app, 0, 0, { auto: false });
    const wins = Array.from({ length: count }, (_v, i) => makeWindow(env, i + 2, [i * 400, 0, 300, 300]));
    env.tabList.push(...wins);
    env.display.focus_window = wins[0];
    wins.forEach((w) => app.auto.onWindowAdded(app, ws, w));
    assert.deepEqual([...app.auto._pending.get(0)], wins.map((w) => w.seq));
    app.ops.layoutSet(app, 0, 0, { auto: true });
    return { env, app, wins };
};

test('A pending: explicit fractional columns settle fresh identities before the first swap', () => {
    const { env, app, wins: [A, B] } = pausedFreshColumns();
    env.keybindingManager.hotkeys.get('greenTile-auto3').cb();
    assert.deepEqual([A.rect, B.rect], [[0, 0, 667, 1060], [667, 0, 666, 1060]]);
    const pendingAfterColumns = [...(app.auto._pending.get(0) || [])];
    env.keybindingManager.hotkeys.get('greenTile-swap-right').cb();
    assert.deepEqual([A.rect, B.rect], [[667, 0, 666, 1060], [0, 0, 667, 1060]]);
    assert.deepEqual(pendingAfterColumns, [], 'only successfully placed windows become settled');
    assert.equal(app.auto._overrides.size, 0, 'the first swap consumes both sort overrides');
});

test('A pending: explicit column slice leaves unplaced windows queued in opening order', () => {
    const { app, wins: [A, B, C, D] } = pausedFreshColumns(4);
    load('./lib/tiling/retile.js').appColumns(app, 2);
    assert.deepEqual([A.rect, B.rect], [[0, 0, 1000, 1060], [1000, 0, 1000, 1060]]);
    assert.deepEqual([C.rect, D.rect], [[800, 0, 300, 300], [1200, 0, 300, 300]]);
    assert.deepEqual([...app.auto._pending.get(0)], [4, 5]);
    C.move_frame(false, 400, 800);
    D.move_frame(false, 100, 0);
    retile(app);
    assert.deepEqual([...app.split._mins.values()][0].mins.map((m) => m.seq), [2, 3, 4, 5],
        'unplaced fresh windows append in opening order despite their reversed positions');
    assert.deepEqual([C.rect, D.rect], [[1333, 0, 667, 530], [1333, 530, 667, 530]]);
    assert.deepEqual([...(app.auto._pending.get(0) || [])], []);
});

test('A pending: declined degenerate columns leave every fresh intent untouched', () => {
    const { env, app, wins: [A, B] } = pausedFreshColumns(2, 0);
    const before = [A.rect.slice(), B.rect.slice()];
    env.keybindingManager.hotkeys.get('greenTile-auto3').cb();
    assert.deepEqual([A.rect, B.rect], before);
    assert.deepEqual([A.moves, B.moves], [[], []]);
    assert.deepEqual([...app.auto._pending.get(0)], [2, 3]);
});

test('A pending: refused column placement also settles only the placed fresh identities', () => {
    const { env, app, wins: [A, B] } = pausedFreshColumns();
    A.minSize = [1400, 0];
    env.keybindingManager.hotkeys.get('greenTile-auto3').cb();
    assert.deepEqual([A.rect, B.rect], [[0, 0, 1400, 1060], [1400, 0, 600, 1060]]);
    assert.deepEqual([...(app.auto._pending.get(0) || [])], []);
});

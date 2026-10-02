'use strict';
// Focus keybinding ownership/restore contract (lib/runtime/focus.js).
//
// greenTile takes over Cinnamon's own push-tile-* wm builtins and must hand
// them back. Two generations have to work:
//   - manager route (upstream js/ui/keybindings.js, pinned commit 2803c67d,
//     setBuiltinHandler at :464): setBuiltinHandler installs ONE Meta dispatcher
//     per name whose closure resolves the callback through the manager's
//     bindings map at press time, so a prior entry can be restored by
//     re-entering it and stays reachable end to end.
//   - direct route (installed 6.6 /usr/share/cinnamon/js/ui/keybindings.js has
//     no setBuiltinHandler): the handler itself is the Meta custom handler.
//
// The contract is fault isolation WITHOUT collateral damage:
//   - one failing restore must not strand the remaining names, and every
//     failure must be reported;
//   - a KNOWN prior must survive, including across App recreation — the
//     keybinding manager is a singleton, so whatever this release leaves in its
//     binding map is what the next App adopts as its rollback target;
//   - Meta cleanup must happen even when the binding-map entry is already gone,
//     otherwise our dispatcher keeps swallowing the key;
//   - a newer owner that registered after us is never restored over, deleted or
//     Meta-reset.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, cinnamonLoad, ROOT } = require('../helpers/cinnamon-loader');
const { createCinnamonEnv } = require('../helpers/fakes/cinnamon-env');
const { Focus } = load('./lib/runtime/focus');

const ACTION_IDS = { 'push-tile-left': 71, 'push-tile-right': 72, 'push-tile-up': 73, 'push-tile-down': 74 };
const NAMES = Object.keys(ACTION_IDS);

const makeMeta = () => {
    const meta = {
        customHandlers: new Map(),
        KeyBindingAction: { PUSH_TILE_LEFT: 71, PUSH_TILE_RIGHT: 72, PUSH_TILE_UP: 73, PUSH_TILE_DOWN: 74 },
        keybindings_set_custom_handler(name, fn) {
            if (fn === null)
                {meta.customHandlers.delete(name);}
            else
                {meta.customHandlers.set(name, fn);}
        },
    };
    return meta;
};

// Faithful KeybindingManager. It installs the Meta dispatcher through the
// public Meta setter exactly like upstream does — so a Meta-setter that throws
// is observable here, which is how the "entry already gone, dispatcher still
// swallowing the key" defect is reachable at all.
//
// fail.beforeName / fail.afterName hold a per-name remaining-throw count
// (before and after the dispatcher+map effect), so an injected failure survives
// retries only as long as the count says so.
const makeUpstreamManager = (meta) => {
    const bindings = new Map();
    const installs = [];
    const fail = { beforeName: new Map(), afterName: new Map() };
    const countdown = (map, name) => {
        const left = map.get(name) || 0;
        if (left <= 0)
            {return false;}
        map.set(name, left - 1);
        return true;
    };
    return {
        bindings,
        installs,
        fail,
        setBuiltinHandler(name, actionId, callback, allowedModes = 1) {
            installs.push({ name, actionId, callback, allowedModes });
            if (countdown(fail.beforeName, name))
                {throw new Error('fake install failure before effect (' + name + ')');}
            meta.keybindings_set_custom_handler(name, (display, win, binding) => {
                const entry = bindings.get(actionId);
                if (entry && entry.callback)
                    {entry.callback(display, win, binding);}
            });
            bindings.set(actionId, { name, bindings: [], callback, allowedModes });
            if (countdown(fail.afterName, name))
                {throw new Error('fake install failure after effect (' + name + ')');}
        },
    };
};

// The installed 6.6 manager: bindings map present, setBuiltinHandler absent.
const makeLegacyManager = () => ({ bindings: new Map() });

const harness = ({ generation = 'upstream' } = {}) => {
    const meta = makeMeta();
    const calls = [];
    const app = { id: 'app' };
    /** @type {any} */
    let manager = null;
    if (generation === 'upstream')
        {manager = makeUpstreamManager(meta);}
    if (generation === 'legacy')
        {manager = makeLegacyManager();}
    // Meta surface control: record every install/reset attempt and let a test
    // make the null-reset throw for a name a given number of times.
    const metaControl = { installs: [], resets: [], failResetName: new Map() };
    const rawSet = meta.keybindings_set_custom_handler.bind(meta);
    meta.keybindings_set_custom_handler = (name, fn) => {
        if (fn === null) {
            metaControl.resets.push(name);
            const left = metaControl.failResetName.get(name) || 0;
            if (left > 0) {
                metaControl.failResetName.set(name, left - 1);
                throw new Error('fake Meta reset failure (' + name + ')');
            }
        }
        else
            {metaControl.installs.push(name);}
        rawSet(name, fn);
    };
    const focus = new Focus({
        meta,
        keybindingManager: manager || undefined,
        hotkey: (_app, dir) => () => calls.push(dir),
    });
    return { meta, manager, metaControl, focus, calls, app };
};

/** A foreign prior with no recording, for tests that only need identity. */
const priorFor = (name) => ({ name, bindings: [], callback: () => {}, allowedModes: 1 });

/**
 * Seeds one foreign prior per push-tile action id; its callback records the
 * delivery so restoration can be proven reachable, not just present.
 * @param {any} manager
 * @param {any[]} delivered
 */
const seedPriors = (manager, delivered) => {
    /** @type {Record<string, any>} */
    const priors = {};
    for (const name of NAMES) {
        const prior = {
            name,
            bindings: [],
            allowedModes: 1,
            callback: (display, win) => delivered.push([name, win]),
        };
        priors[name] = prior;
        manager.bindings.set(ACTION_IDS[name], prior);
    }
    return priors;
};

const deliver = (meta, name, win) => meta.customHandlers.get(name)({}, win, {});

for (const [label, failedName] of [['FIRST', 'push-tile-left'], ['MIDDLE', 'push-tile-up'], ['LAST', 'push-tile-down']]) {
    test('manager route: a throwing ' + label + ' restore still restores every name', () => {
        const { meta, manager, focus, app } = harness({ generation: 'upstream' });
        /** @type {any[]} */
        const delivered = [];
        const priors = seedPriors(manager, delivered);
        focus.connect(app);
        manager.fail.beforeName.set(failedName, 1);
        assert.throws(() => focus.destroy(), new RegExp(failedName),
            'the failure is reported, not swallowed');
        for (const name of NAMES) {
            assert.equal(manager.bindings.get(ACTION_IDS[name]).callback, priors[name].callback,
                name + ' reaches its prior despite the ' + label + ' failure');
            deliver(meta, name, { id: name });
            assert.deepEqual(delivered.at(-1), [name, { id: name }],
                name + ' is REACHABLE through the dispatcher again');
        }
        assert.equal(delivered.length, NAMES.length, 'all four priors answer again');
    });
}

test('manager route: a failed restore hands the KNOWN prior back, never a live stale App callback', () => {
    const { meta, manager, focus, calls, app } = harness({ generation: 'upstream' });
    /** @type {any[]} */
    const delivered = [];
    const priors = seedPriors(manager, delivered);
    focus.connect(app);
    manager.fail.beforeName.set('push-tile-left', 1);
    assert.throws(() => focus.destroy());
    deliver(meta, 'push-tile-left', { id: 'x' });
    assert.deepEqual(calls, [], 'our handler never runs after destroy');
    assert.deepEqual(delivered, [['push-tile-left', { id: 'x' }]],
        'the KNOWN prior answers, not muffin builtin');
    assert.equal(manager.bindings.get(71).callback, priors['push-tile-left'].callback,
        'the manager slot holds the prior, not our dead entry');
});

test('manager route: a post-effect throw during restore still restores every name', () => {
    const { meta, manager, focus, app } = harness({ generation: 'upstream' });
    /** @type {any[]} */
    const delivered = [];
    const priors = seedPriors(manager, delivered);
    focus.connect(app);
    manager.fail.afterName.set('push-tile-left', 1);
    assert.throws(() => focus.destroy(), /push-tile-left/);
    for (const name of NAMES) {
        assert.equal(manager.bindings.get(ACTION_IDS[name]).callback, priors[name].callback,
            name + ' reaches its prior');
        deliver(meta, name, { id: name });
        assert.deepEqual(delivered.at(-1), [name, { id: name }], name + ' is reachable');
    }
});

test('manager route: destroy reports every unrestored binding in one combined error', () => {
    const { manager, focus, app } = harness({ generation: 'upstream' });
    seedPriors(manager, []);
    focus.connect(app);
    manager.fail.beforeName.set('push-tile-right', 1);
    manager.fail.beforeName.set('push-tile-down', 1);
    assert.throws(() => focus.destroy(), (e) => {
        assert.match(e.message, /restore failed for 2 binding\(s\)/);
        assert.match(e.message, /push-tile-right/);
        assert.match(e.message, /push-tile-down/);
        return true;
    });
});

test('manager route: a retry destroy completes a binding that stayed unrestored', () => {
    const { meta, manager, focus, app } = harness({ generation: 'upstream' });
    /** @type {any[]} */
    const delivered = [];
    const priors = seedPriors(manager, delivered);
    focus.connect(app);
    // the restore AND its recovery retry fail: the registration must stay owned
    manager.fail.beforeName.set('push-tile-left', 2);
    assert.throws(() => focus.destroy());
    manager.fail.beforeName.delete('push-tile-left');
    assert.doesNotThrow(() => focus.destroy(), 'the failed ownership was kept for the retry');
    for (const name of NAMES) {
        assert.equal(manager.bindings.get(ACTION_IDS[name]).callback, priors[name].callback,
            name + ' restored after retry');
        deliver(meta, name, { id: name });
        assert.deepEqual(delivered.at(-1), [name, { id: name }], name + ' is reachable after retry');
    }
});

test('manager route: repeated connect re-acquires without adopting our own handler as prior', () => {
    const { manager, focus, app } = harness({ generation: 'upstream' });
    const priors = seedPriors(manager, []);
    focus.connect(app);
    focus.connect(app);
    focus.destroy();
    for (const name of NAMES) {
        assert.equal(manager.bindings.get(ACTION_IDS[name]).callback, priors[name].callback,
            name + ' ends at the original prior, not at a previous own handler');
        assert.equal(manager.bindings.get(ACTION_IDS[name]).allowedModes, 1, name + ' prior modes intact');
    }
});

test('manager route: the restored prior callback is deliverable through the reinstalled dispatcher', () => {
    const { meta, manager, focus, app } = harness({ generation: 'upstream' });
    const delivered = [];
    const prior = { name: 'push-tile-left', bindings: [], callback: (display, win) => delivered.push(win), allowedModes: 7 };
    manager.bindings.set(71, prior);
    focus.connect(app);
    deliver(meta, 'push-tile-left', { id: 'ours' });
    assert.deepEqual(delivered, [], 'while WE are registered our handler answers, not the prior');
    focus.destroy();
    assert.equal(manager.bindings.get(71).callback, prior.callback);
    assert.equal(manager.bindings.get(71).allowedModes, 7, 'prior action modes survive the round trip');
    deliver(meta, 'push-tile-left', { id: 'restored' });
    assert.deepEqual(delivered, [{ id: 'restored' }], 'prior callback reachable through the dispatcher again');
});

test('DEFECT 1: a failed prior restore preserves the KNOWN prior across App recreation', () => {
    const { meta, manager, focus, app } = harness({ generation: 'upstream' });
    /** @type {any[]} */
    const delivered = [];
    const priors = seedPriors(manager, delivered);
    focus.connect(app);
    // restore and its recovery retry both fail BEFORE the effect
    manager.fail.beforeName.set('push-tile-left', 2);
    assert.throws(() => focus.destroy(), /push-tile-left/);
    assert.equal(manager.bindings.get(71).callback, priors['push-tile-left'].callback,
        'the KNOWN prior is preserved in the manager slot, not replaced by our dead entry');

    // monitors-changed recreates the App: a fresh instance on the same singleton
    const second = new Focus({
        meta,
        keybindingManager: manager,
        hotkey: (_app, _dir) => () => {},
    });
    second.connect({ id: 'app2' });
    second.destroy();
    assert.equal(manager.bindings.get(71).callback, priors['push-tile-left'].callback,
        'the second cycle still ends at the real prior');
    deliver(meta, 'push-tile-left', { id: 'restored' });
    assert.deepEqual(delivered.at(-1), ['push-tile-left', { id: 'restored' }],
        'the original prior is deliverable again after App recreation');
});

test('DEFECT 2: a failing Meta reset is retried independent of the binding-map entry', () => {
    const { meta, manager, metaControl, focus, app } = harness({ generation: 'upstream' });
    focus.connect(app);
    metaControl.failResetName.set('push-tile-left', 1);
    assert.throws(() => focus.destroy(), /push-tile-left/);
    const resets = metaControl.resets.filter((n) => n === 'push-tile-left');
    assert.equal(resets.length >= 2, true,
        'Meta cleanup was attempted again even though the map entry was already removed');
    assert.equal(meta.customHandlers.has('push-tile-left'), false,
        'our dispatcher no longer swallows the key');
    assert.equal(manager.bindings.has(71), false,
        'no dead entry is left for the next App to adopt as prior');
});

test('DEFECT 2: a persistently failing Meta reset is reported and stays retryable', () => {
    const { meta, manager, metaControl, focus, app } = harness({ generation: 'upstream' });
    focus.connect(app);
    metaControl.failResetName.set('push-tile-left', 2);
    assert.throws(() => focus.destroy(), /push-tile-left/);
    assert.equal(meta.customHandlers.has('push-tile-left'), true, 'dispatcher still ours: the reset kept failing');
    metaControl.failResetName.delete('push-tile-left');
    assert.doesNotThrow(() => focus.destroy(), 'the unrestored registration stayed retryable');
    assert.equal(meta.customHandlers.has('push-tile-left'), false, 'retry completed the Meta cleanup');
    assert.equal(manager.bindings.has(71), false, 'map left empty');
});

test('DEFECT 3: destroy never clobbers a newer foreign owner (prior captured)', () => {
    const { meta, manager, focus, app } = harness({ generation: 'upstream' });
    /** @type {any[]} */
    const delivered = [];
    const priors = seedPriors(manager, delivered);
    const foreign = [];
    focus.connect(app);
    manager.setBuiltinHandler('push-tile-left', 71, () => foreign.push('foreign'));
    assert.doesNotThrow(() => focus.destroy(), 'the slot belongs to the newer owner, so nothing is ours to restore');
    assert.notEqual(manager.bindings.get(71).callback, priors['push-tile-left'].callback,
        'our old prior was NOT restored over the newer owner');
    deliver(meta, 'push-tile-left', { id: 'other' });
    assert.deepEqual(foreign, ['foreign'], 'the newer owner still answers');
    assert.deepEqual(delivered, [], 'our old prior does not answer');
});

test('DEFECT 3: destroy never clobbers a newer foreign owner (no prior captured)', () => {
    const { meta, manager, focus, app } = harness({ generation: 'upstream' });
    const foreign = [];
    focus.connect(app);
    manager.setBuiltinHandler('push-tile-left', 71, () => foreign.push('foreign'));
    assert.doesNotThrow(() => focus.destroy());
    assert.equal(manager.bindings.has(71), true, 'the newer owner entry was not deleted');
    deliver(meta, 'push-tile-left', { id: 'other' });
    assert.deepEqual(foreign, ['foreign'], 'the newer owner still answers');
});

test('DEFECT 3: a same-instance retry after a newer connect does not override it', () => {
    const { meta, manager, focus, app } = harness({ generation: 'upstream' });
    const priors = seedPriors(manager, []);
    const foreign = [];
    focus.connect(app);
    manager.fail.beforeName.set('push-tile-left', 1);
    assert.throws(() => focus.destroy());
    assert.equal(manager.bindings.get(71).callback, priors['push-tile-left'].callback,
        'the prior was preserved for the retry');
    // a newer owner takes the binding before our retry
    manager.setBuiltinHandler('push-tile-left', 71, () => foreign.push('foreign'));
    assert.doesNotThrow(() => focus.destroy(), 'the retry sees the newer owner and stands down');
    deliver(meta, 'push-tile-left', { id: 'other' });
    assert.deepEqual(foreign, ['foreign'], 'the newer owner was not clobbered by the retry');
});

test('6.6 direct route: a throwing Meta reset still resets the rest and stays retryable', () => {
    const { meta, metaControl, focus, calls, app } = harness({ generation: 'legacy' });
    focus.connect(app);
    assert.deepEqual([...meta.customHandlers.keys()].sort(), [...NAMES].sort(), 'all four taken over');
    metaControl.failResetName.set('push-tile-left', 2);
    assert.throws(() => focus.destroy(), /push-tile-left/);
    for (const name of NAMES) {
        if (name === 'push-tile-left')
            {continue;}
        assert.equal(meta.customHandlers.has(name), false,
            name + ' reset to muffin builtin despite the first failure');
    }
    assert.equal(meta.customHandlers.has('push-tile-left'), true, 'the stubborn one is still ours');
    metaControl.failResetName.delete('push-tile-left');
    assert.doesNotThrow(() => focus.destroy());
    assert.equal(meta.customHandlers.has('push-tile-left'), false, 'retry completed the reset');
    assert.deepEqual(calls, [], 'no own callback ever ran');
});

test('destroy without connect is a no-op that never touches foreign state', () => {
    const { meta, manager, focus } = harness({ generation: 'upstream' });
    const foreign = priorFor('push-tile-left');
    manager.bindings.set(71, foreign);
    const foreignMeta = () => {};
    meta.customHandlers.set('push-tile-left', foreignMeta);
    assert.doesNotThrow(() => focus.destroy());
    assert.equal(manager.bindings.get(71), foreign, 'foreign dispatcher entry survives');
    assert.equal(meta.customHandlers.get('push-tile-left'), foreignMeta, 'foreign Meta handler survives');
});

// The caller probed the defect on the REAL extension entry (disable left four
// stale handlers behind). This integration case pins the whole chain: a
// throwing restore must not stop disable, must be reported, and the settings
// slot must still be finalized last.
test('integration: a throwing focus restore does not stop disable or settings finalize', () => {
    const env = createCinnamonEnv();
    globalThis.imports = env.imports;
    globalThis.global = env.global;
    const src = fs.readFileSync(path.join(ROOT, 'extension.js'), 'utf8');
    const ext = cinnamonLoad(src, load, 'extension.js');
    ext.init({ uuid: 'greenTile@carsteneu' });

    // upstream manager surface with a foreign prior on every push-tile id, so
    // destroy restores through setBuiltinHandler
    const bindings = new Map();
    /** @type {Record<string, any>} */
    const priors = {};
    for (const name of NAMES) {
        priors[name] = priorFor(name);
        bindings.set(ACTION_IDS[name], priors[name]);
    }
    let failFirstRestore = true;
    env.keybindingManager.bindings = bindings;
    env.keybindingManager.setBuiltinHandler = (name, actionId, callback, allowedModes = 1) => {
        if (name === 'push-tile-left' && failFirstRestore && bindings.get(71) !== priors[name]) {
            failFirstRestore = false;
            throw new Error('injected restore failure');
        }
        bindings.set(actionId, { name, bindings: [], callback, allowedModes });
        env.customBindings.set(name, (display, win) => {
            const entry = bindings.get(actionId);
            if (entry && entry.callback)
                {entry.callback(display, win);}
        });
    };

    ext.enable();
    env.flushDisplayConfigNoReply();

    assert.doesNotThrow(() => ext.disable(), 'Config.destroy isolates the focus failure');
    assert.equal(env.logErrors.some((m) => /push-tile restore failed for/.test(m) && m.indexOf('push-tile-left') !== -1), true,
        'the combined focus error is reported, not swallowed');
    assert.equal(env.settingsSlots.get('greenTile@carsteneu'), null, 'settings finalized despite the failure');
    for (const name of NAMES) {
        assert.equal(bindings.get(ACTION_IDS[name]).callback, priors[name].callback,
            name + ' released to its prior despite the injected failure');
    }
});

test('6.6 direct route platform limit: an unknown foreign Meta handler is not restorable', () => {
    // Documented limitation, not a fix: Meta.keybindings_set_custom_handler has
    // no getter, so a handler installed by someone else on the direct route
    // cannot be discovered. The only reachable restore target is muffin's
    // builtin. greenTile therefore restores the builtin, NOT the foreign
    // handler — the caller escalates this to the user instead of faking a getter.
    const { meta, focus, app } = harness({ generation: 'legacy' });
    const foreign = () => {};
    meta.customHandlers.set('push-tile-left', foreign);
    focus.connect(app);
    assert.notEqual(meta.customHandlers.get('push-tile-left'), foreign, 'taken over while active');
    focus.destroy();
    assert.equal(meta.customHandlers.has('push-tile-left'), false,
        'reset target is muffin builtin; the foreign direct handler is undiscoverable');
});

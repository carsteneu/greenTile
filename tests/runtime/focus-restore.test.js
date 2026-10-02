'use strict';
// Focus keybinding ownership/restore contract (lib/runtime/focus.js).
//
// greenTile takes over Cinnamon's own push-tile-* wm builtins and must hand
// them back. Two generations have to work:
//   - manager route (upstream 6.7.8 js/ui/keybindings.js:464): setBuiltinHandler
//     installs ONE Meta dispatcher per name whose closure resolves the callback
//     through the manager's bindings map at press time, so a prior entry can be
//     restored by re-entering it and stays reachable end to end.
//   - direct route (installed 6.6 /usr/share/cinnamon/js/ui/keybindings.js has
//     no setBuiltinHandler): the handler itself is the Meta custom handler.
//
// The contract these tests pin is FAULT ISOLATION: one failing restore must not
// strand the remaining names, must not leave a LIVE own callback (a stale App
// closure) behind, must keep the failed ownership for a retry, and must be
// reported instead of swallowed.
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

// Faithful KeybindingManager. `fail.before`/`fail.after` inject a throw at a
// given setBuiltinHandler call index — before the effect and after it, because
// the real one mutates the Meta dispatcher and the map before it can throw.
const makeUpstreamManager = (meta) => {
    const bindings = new Map();
    const installs = [];
    const fail = { before: new Set(), after: new Set() };
    return {
        bindings,
        installs,
        fail,
        setBuiltinHandler(name, actionId, callback, allowedModes = 1) {
            const callIndex = installs.length;
            installs.push({ name, actionId, callback, allowedModes });
            if (fail.before.has(callIndex))
                {throw new Error('fake install failure #' + callIndex + ' (' + name + ')');}
            meta.customHandlers.set(name, (display, win, binding) => {
                const entry = bindings.get(actionId);
                if (entry && entry.callback)
                    {entry.callback(display, win, binding);}
            });
            bindings.set(actionId, { name, bindings: [], callback, allowedModes });
            if (fail.after.has(callIndex))
                {throw new Error('fake post-effect failure #' + callIndex + ' (' + name + ')');}
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
    const metaControl = { failSetAt: new Set() };
    const rawSet = meta.keybindings_set_custom_handler.bind(meta);
    let setCalls = 0;
    meta.keybindings_set_custom_handler = (name, fn) => {
        const callIndex = setCalls++;
        if (metaControl.failSetAt.has(callIndex))
            {throw new Error('fake Meta setter failure #' + callIndex + ' (' + name + ')');}
        rawSet(name, fn);
    };
    const focus = new Focus({
        meta,
        keybindingManager: manager || undefined,
        hotkey: (_app, dir) => () => calls.push(dir),
    });
    return { meta, manager, metaControl, focus, calls, app };
};

/** A foreign prior registered through the shell route. */
const priorFor = (name) => ({ name, bindings: [], callback: () => {}, allowedModes: 1 });

const seedPriors = (manager) => {
    /** @type {Record<string, any>} */
    const priors = {};
    for (const name of NAMES) {
        priors[name] = priorFor(name);
        manager.bindings.set(ACTION_IDS[name], priors[name]);
    }
    return priors;
};

const deliver = (meta, name, win) => meta.customHandlers.get(name)({}, win, {});

// setBuiltinHandler call layout: connect installs 0..3, destroy restores 4..7.
const RESTORE_CALL = { 'push-tile-left': 4, 'push-tile-right': 5, 'push-tile-up': 6, 'push-tile-down': 7 };

for (const [label, failedName] of [['FIRST', 'push-tile-left'], ['MIDDLE', 'push-tile-up'], ['LAST', 'push-tile-down']]) {
    test('manager route: a throwing ' + label + ' restore still restores the remaining names', () => {
        const { meta, manager, focus, app } = harness({ generation: 'upstream' });
        const priors = seedPriors(manager);
        focus.connect(app);
        manager.fail.before.add(RESTORE_CALL[failedName]);
        assert.throws(() => focus.destroy(), new RegExp(failedName),
            'the failure is reported, not swallowed');
        for (const name of NAMES) {
            if (name === failedName)
                {continue;}
            assert.equal(manager.bindings.get(ACTION_IDS[name]).callback, priors[name].callback,
                name + ' prior callback restored despite the ' + label + ' failure');
            deliver(meta, name, { id: name });
        }
    });
}

test('manager route: a failed restore leaves an INERT handler, never a live stale App callback', () => {
    const { meta, manager, focus, calls, app } = harness({ generation: 'upstream' });
    seedPriors(manager);
    focus.connect(app);
    manager.fail.before.add(RESTORE_CALL['push-tile-left']);
    assert.throws(() => focus.destroy());
    deliver(meta, 'push-tile-left', { id: 'stale' });
    assert.deepEqual(calls, [], 'the unrestored binding no longer runs our handler');
});

test('manager route: a post-effect throw during restore still restores the remaining names', () => {
    const { manager, focus, app } = harness({ generation: 'upstream' });
    const priors = seedPriors(manager);
    focus.connect(app);
    manager.fail.after.add(RESTORE_CALL['push-tile-left']);
    assert.throws(() => focus.destroy(), /push-tile-left/);
    for (const name of NAMES) {
        assert.equal(manager.bindings.get(ACTION_IDS[name]).callback, priors[name].callback,
            name + ' restored');
    }
});

test('manager route: destroy reports every unrestored binding in one combined error', () => {
    const { manager, focus, app } = harness({ generation: 'upstream' });
    seedPriors(manager);
    focus.connect(app);
    manager.fail.before.add(RESTORE_CALL['push-tile-right']);
    manager.fail.before.add(RESTORE_CALL['push-tile-down']);
    assert.throws(() => focus.destroy(), (e) => {
        assert.match(e.message, /push-tile-right/);
        assert.match(e.message, /push-tile-down/);
        return true;
    });
});

test('manager route: a retry destroy restores the previously failed binding', () => {
    const { manager, focus, app } = harness({ generation: 'upstream' });
    const priors = seedPriors(manager);
    focus.connect(app);
    manager.fail.before.add(RESTORE_CALL['push-tile-left']);
    assert.throws(() => focus.destroy());
    manager.fail.before.delete(RESTORE_CALL['push-tile-left']);
    assert.doesNotThrow(() => focus.destroy(), 'the failed ownership was kept for the retry');
    for (const name of NAMES) {
        assert.equal(manager.bindings.get(ACTION_IDS[name]).callback, priors[name].callback,
            name + ' restored after retry');
    }
});

test('manager route: repeated connect re-acquires without adopting our own handler as prior', () => {
    const { manager, focus, app } = harness({ generation: 'upstream' });
    const priors = seedPriors(manager);
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

test('6.6 direct route: a throwing Meta reset still resets the remaining names', () => {
    const { meta, metaControl, focus, app } = harness({ generation: 'legacy' });
    focus.connect(app);
    assert.deepEqual([...meta.customHandlers.keys()].sort(), [...NAMES].sort(), 'all four taken over');
    metaControl.failSetAt.add(4);
    assert.throws(() => focus.destroy(), /push-tile-left/);
    for (const name of NAMES) {
        if (name === 'push-tile-left')
            {continue;}
        assert.equal(meta.customHandlers.has(name), false,
            name + ' reset to muffin builtin despite the first failure');
    }
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
    // destroy restores through setBuiltinHandler (calls 1-4 connect, 5-8 destroy)
    const bindings = new Map();
    /** @type {Record<string, any>} */
    const priors = {};
    for (const name of NAMES) {
        priors[name] = priorFor(name);
        bindings.set(ACTION_IDS[name], priors[name]);
    }
    const installs = [];
    env.keybindingManager.bindings = bindings;
    env.keybindingManager.setBuiltinHandler = (name, actionId, callback, allowedModes = 1) => {
        installs.push(name);
        if (installs.length === 5)
            {throw new Error('injected restore failure');}
        bindings.set(actionId, { name, bindings: [], callback, allowedModes });
        env.customBindings.set(name, (display, win) => {
            const entry = bindings.get(actionId);
            if (entry && entry.callback)
                {entry.callback(display, win);}
        });
    };

    ext.enable();
    env.flushDisplayConfigNoReply();
    assert.deepEqual(installs, NAMES, 'connect installed all four');

    assert.doesNotThrow(() => ext.disable(), 'Config.destroy isolates the focus failure');
    assert.equal(env.logErrors.some((m) => m.indexOf('focus:') !== -1), true,
        'the combined focus error is reported, not swallowed');
    assert.equal(env.settingsSlots.get('greenTile@carsteneu'), null, 'settings finalized despite the failure');
    assert.deepEqual(installs.slice(4), NAMES, 'destroy attempted ALL four restores');
    for (const name of NAMES) {
        if (name === 'push-tile-left')
            {continue;}
        assert.equal(bindings.get(ACTION_IDS[name]).callback, priors[name].callback,
            name + ' released to its prior despite the first failure');
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

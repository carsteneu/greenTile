'use strict';
// Deferred split writes vs. an external authoritative layouts write (todo_fixes
// item 5, PARTIAL), driven through the REAL extension.js on the fake Cinnamon
// runtime.
//
// Covered here: an external value-CHANGING write of layouts (the ordinary
// settings-dialog reset or an import) invalidates the older 500 ms deferred
// split flush, and no own write does. mechanism: settings.js emits
// changed::<key> only for a RELOADED value that differs (_checkSettings), and an
// own write never emits it (_setValue only stores and saves).
//
// NOT covered — see tests/app/settings-external-write.blocked-evidence.js and the
// BLOCKED report: a value-IDENTICAL external write (nothing to diff, no signal)
// and a dialog file write that lands before its asynchronous notification (the
// flush still wins that gap).
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, enableOnMonitor, settingsInstance } = require('../helpers/fakes/cinnamon-harness');

const flushTimers = (env) => env.liveTimers().filter((t) => t.ms === 500);

// the real mainloop drops a one-shot source when its callback returns false
const fireFlush = (env) => {
    const entry = [...env.timers.entries()].find(([, t]) => t.ms === 500);
    assert.ok(entry, 'a 500 ms flush timer is armed');
    env.timers.delete(entry[0]);
    entry[1].cb();
};

const enabledWithLayouts = (env, ext, n = 2) => {
    enableOnMonitor(env, ext);
    env.activeWorkspace = { index: () => 0 };
    const app = ext.currentSession().app;
    const ref = app.split.ref(app, 0, 0, n);
    assert.ok(ref, 'monitor key resolved from the fake DisplayConfig reply');
    const layouts = {};
    layouts[ref.mkey] = {};
    layouts[ref.mkey][ref.wskey] = { auto: true };
    settingsInstance(env).setValue('layouts', JSON.stringify(layouts));
    return { app, ref };
};

const layoutsWritesSince = (inst, mark) =>
    inst.callLog.slice(mark).filter((c) => c.op === 'setValue' && c.key === 'layouts');

test('item 5: an external value-changing layouts reset drops the older pending split', () => {
    const { env, ext } = makeEnv();
    const { app, ref } = enabledWithLayouts(env, ext);
    const inst = settingsInstance(env);

    app.split.remember(app, ref, { 0: 0.4, 1: 0.6 }, false);
    assert.equal(flushTimers(env).length, 1, 'the 500 ms flush timer is pending');

    const mark = inst.callLog.length;
    // the settings dialog's reset reached us as a reload: the value changed, so
    // _checkSettings reports it
    inst.remoteUpdate({ layouts: '' });
    assert.equal(inst.getValue('layouts'), '', 'the external reset is visible in the settings');
    assert.equal(flushTimers(env).length, 0, 'the deferred write was invalidated: timer dropped');

    app.split.flush(app);
    assert.equal(layoutsWritesSince(inst, mark).length, 0, 'no deferred split was merged back after the reset');
    ext.disable();
});

test('item 5: a resize after the external reset still persists', () => {
    const { env, ext } = makeEnv();
    const { app, ref } = enabledWithLayouts(env, ext);
    const inst = settingsInstance(env);

    app.split.remember(app, ref, { 0: 0.4, 1: 0.6 }, false);
    inst.remoteUpdate({ layouts: '' });
    app.split.remember(app, ref, { 0: 0.3, 1: 0.7 }, false);
    const mark = inst.callLog.length;
    fireFlush(env);
    const writes = layoutsWritesSince(inst, mark);
    assert.equal(writes.length, 1, 'the new pending split is written after the reset');
    assert.equal(writes[0].value.indexOf('0.3') !== -1, true, 'and it is the new one');
    ext.disable();
});

test('item 5: an own layouts write (layoutSet) keeps the pending split valid', () => {
    const { env, ext } = makeEnv();
    const { app, ref } = enabledWithLayouts(env, ext);
    const inst = settingsInstance(env);

    app.split.remember(app, ref, { 0: 0.4, 1: 0.6 }, false);
    const mark = inst.callLog.length;
    // auto on for the same monitor/workspace is an own layouts write; an own write
    // never emits changed::layouts, so the pending resize stays valid
    app.ops.layoutSet(app, 0, 0, { auto: true });
    assert.equal(flushTimers(env).length, 1, 'the own layouts write kept the pending split');
    fireFlush(env);
    assert.equal(layoutsWritesSince(inst, mark).filter((c) => c.value.indexOf('0.4') !== -1).length, 1,
        'the pending split reached the settings');
    ext.disable();
});

test('item 5: an own write of an unrelated key keeps the pending split valid', () => {
    const { env, ext } = makeEnv();
    const { app, ref } = enabledWithLayouts(env, ext);
    const inst = settingsInstance(env);

    app.split.remember(app, ref, { 0: 0.4, 1: 0.6 }, false);
    inst.setValue('panelTheme', true);
    inst.setOptions('excludeAppPicker', { 'Add application …': '' });
    assert.equal(flushTimers(env).length, 1, 'own writes did not drop the pending split');
    const mark = inst.callLog.length;
    fireFlush(env);
    assert.equal(layoutsWritesSince(inst, mark).filter((c) => c.value.indexOf('0.4') !== -1).length, 1,
        'the normal resize is still persisted');
    ext.disable();
});

test('item 5: a corrupt layouts setting is not replaced by the pending flush', () => {
    const { env, ext } = makeEnv();
    const { app, ref } = enabledWithLayouts(env, ext);
    const inst = settingsInstance(env);

    inst.setValue('layouts', '{not json');
    app.split.remember(app, ref, { 0: 0.4, 1: 0.6 }, false);
    const mark = inst.callLog.length;
    fireFlush(env);
    assert.equal(layoutsWritesSince(inst, mark).length, 0, 'the corrupt value is never overwritten');
    assert.equal(inst.getValue('layouts'), '{not json', 'and it is left as it was');
    assert.equal(env.logs.includes('greenTile layouts setting is corrupt, splits not written'), true,
        'the refusal is reported once');
    ext.disable();
});

test('item 5: the reload observer is wired per App and released with it', () => {
    const { env, ext } = makeEnv();
    const { app } = enabledWithLayouts(env, ext);
    const inst = settingsInstance(env);
    assert.equal(inst.count('changed::layouts'), 1, 'the reload surface is wired once');

    env.layoutManager.emit('monitors-changed');
    env.flushDisplayConfigNoReply();
    assert.notEqual(ext.currentSession().app, app, 'the App was recreated');

    ext.disable();
    assert.equal(settingsInstance(env).count('changed::layouts'), 0, 'finalize released the reload surface');
});

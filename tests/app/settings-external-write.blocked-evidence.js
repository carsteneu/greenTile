'use strict';
// ITEM 5 BLOCKED — EXECUTABLE EVIDENCE, INTENTIONALLY NOT PART OF `npm test`.
//
// The suite glob is `tests/*/*.test.js`; this file is named `*.blocked-evidence.js`
// so `npm test` stays green. It reproduces the two acceptance cases item 5 does
// NOT close, on the current tree. Run it directly to see them fail:
//
//   node --test tests/app/settings-external-write.blocked-evidence.js
//
// Case A — value-identical external write: the user imports the backup whose
//   `layouts` value equals the one already in memory. The dialog rewrote the
//   file, but settings.js `_checkSettings` diffs by VALUE, so `changed::layouts`
//   is never emitted, nothing invalidates, and the armed 500 ms flush merges the
//   pending splits over the imported value.
// Case B — write-before-notify: JsonSettingsWidgets.save_settings rewrites the
//   whole file and only THEN calls notify_callback -> cinnamonDBus.updateSetting
//   -> remoteUpdate. A flush landing in that gap sees the still-stale in-memory
//   value, writes the pending splits over the external reset, and the later
//   reload then finds memory equal to the file and emits nothing to correct it.
// Case C — disable with a queued external event: the external write happened but
//   its event/reload has not been delivered yet; the teardown flush then
//   resurrects the pending splits instead of dropping them.
//
// Attribution for a real closure needs either a framework write-method hook (an
// instance override of settings.setValue/setOptions — forbidden by the change
// contract) or every own writer routed through a Config-owned write function
// (panel.js/editor.js/drop.js/exclusions.js are outside this section's ownership),
// so both are reported as options rather than implemented.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, enableOnMonitor, settingsInstance } = require('../helpers/fakes/cinnamon-harness');

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
    const layouts = {};
    layouts[ref.mkey] = {};
    layouts[ref.mkey][ref.wskey] = { auto: true };
    settingsInstance(env).setValue('layouts', JSON.stringify(layouts));
    return { app, ref };
};

const layoutsWritesSince = (inst, mark) =>
    inst.callLog.slice(mark).filter((c) => c.op === 'setValue' && c.key === 'layouts');

test('BLOCKED A: a value-identical external write (backup import) must not be overwritten', () => {
    const { env, ext } = makeEnv();
    const { app, ref } = enabledWithLayouts(env, ext);
    const inst = settingsInstance(env);
    const exported = inst.getValue('layouts');

    app.split.remember(app, ref, { 0: 0.4, 1: 0.6 }, false);
    const mark = inst.callLog.length;
    // the dialog rewrote the file with the very value already in memory: the
    // framework sees no difference and notifies nothing
    inst.remoteUpdate({ layouts: exported });
    fireFlush(env);
    assert.equal(layoutsWritesSince(inst, mark).length, 0, 'the import must not be overwritten by the deferred split');
    ext.disable();
});

test('BLOCKED B: an external file write Cinnamon has not reloaded yet must not be overwritten', () => {
    const { env, ext } = makeEnv();
    const { app, ref } = enabledWithLayouts(env, ext);
    const inst = settingsInstance(env);

    app.split.remember(app, ref, { 0: 0.4, 1: 0.6 }, false);
    const mark = inst.callLog.length;
    // the dialog reset layouts on disk; its notification (and with it the reload)
    // has not arrived when the 500 ms timer fires
    const onDiskReset = { layouts: '' };
    env.pendingExternalWrite = onDiskReset;
    fireFlush(env);
    if (env.pendingExternalWrite) {
        inst.remoteUpdate(env.pendingExternalWrite);
        env.pendingExternalWrite = null;
    }
    assert.equal(layoutsWritesSince(inst, mark).length, 0,
        'the external reset must not be overwritten by the deferred split');
    ext.disable();
});

test('BLOCKED C: a disable flush must not resurrect splits over a write not yet delivered', () => {
    const { env, ext } = makeEnv();
    const { app, ref } = enabledWithLayouts(env, ext);
    const inst = settingsInstance(env);

    app.split.remember(app, ref, { 0: 0.4, 1: 0.6 }, false);
    // the external write happened, its reload is still queued when disable flushes
    env.pendingExternalWrite = { layouts: '' };
    const mark = inst.callLog.length;
    ext.disable();
    assert.equal(layoutsWritesSince(inst, mark).length, 0, 'the teardown flush must not resurrect the split');
});

'use strict';
// Deferred split writes vs. an authoritative external layouts write (todo_fixes
// item 5), driven through the REAL extension.js on the fake Cinnamon runtime.
//
// A resize-hotkey step stores a pending split and rides a 500 ms flush timer;
// flush() re-reads the setting and merges every pending entry back in. The
// settings dialog's "restore defaults" or an import rewrites the whole settings
// FILE. Two of its writes are invisible to the settings API: one that restores
// the value already in memory (settings.js _checkSettings diffs by VALUE and
// emits changed::layouts only on a difference) and one landing before the
// dialog's asynchronous notification (JsonSettingsWidgets.save_settings writes
// the file, notify_callback -> remoteUpdate comes afterwards). The Config
// therefore observes the settings FILE (Gio.FileMonitor) as well; own writes run
// with the monitor cancelled, so they are never mistaken for an external one.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, enableOnMonitor, settingsInstance } = require('../helpers/fakes/cinnamon-harness');

const UUID = 'greenTile@carsteneu';

const flushTimers = (env) => env.liveTimers().filter((t) => t.ms === 500);

// the real mainloop drops a one-shot source when its callback returns false
const fireFlush = (env) => {
    const entry = [...env.timers.entries()].find(([, t]) => t.ms === 500);
    assert.ok(entry, 'a 500 ms flush timer is armed');
    env.timers.delete(entry[0]);
    entry[1].cb();
};

// enable with one monitor and a stored layout for monitor 0 / ws 0, keyed
// exactly the way the extension writes it; returns the App and that ref
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

// the dialog's write of the whole settings file (its own copy), then its
// asynchronous notification: cinnamonDBus.updateSetting -> settings.js remoteUpdate
const externalWrite = (env, key, value, notify = true) => {
    env.settingsWriteFile(UUID, key, value);
    if (notify) {
        settingsInstance(env).remoteUpdate();
    }
};

test('item 5: an external layouts reset between a resize and its flush does not resurrect the split', () => {
    const { env, ext } = makeEnv();
    const { app, ref } = enabledWithLayouts(env, ext);
    const inst = settingsInstance(env);

    app.split.remember(app, ref, { 0: 0.4, 1: 0.6 }, false);
    assert.equal(flushTimers(env).length, 1, 'the 500 ms flush timer is pending');

    const mark = inst.callLog.length;
    externalWrite(env, 'layouts', '');
    assert.equal(inst.getValue('layouts'), '', 'the external reset is visible in the settings');

    assert.equal(flushTimers(env).length, 0, 'the deferred write was invalidated: timer dropped');
    app.split.flush(app); // the armed timer would call exactly this
    assert.equal(layoutsWritesSince(inst, mark).length, 0, 'no deferred split was merged back after the reset');
    ext.disable();
});

test('item 5: a SAME-VALUE external import between a resize and its flush is not overwritten', () => {
    const { env, ext } = makeEnv();
    const { app, ref } = enabledWithLayouts(env, ext);
    const inst = settingsInstance(env);
    const exported = inst.getValue('layouts');

    // the resize stores a pending split that is not on disk yet
    app.split.remember(app, ref, { 0: 0.4, 1: 0.6 }, false);
    assert.equal(flushTimers(env).length, 1, 'the 500 ms flush timer is pending');

    const mark = inst.callLog.length;
    // the user imports the very backup that matches the in-memory value: the
    // framework diffs by value, sees no difference and emits nothing
    externalWrite(env, 'layouts', exported);
    assert.equal(inst.getValue('layouts'), exported, 'memory and file agree — the settings API sees no change');

    assert.equal(flushTimers(env).length, 0, 'the file write alone invalidated the deferred write');
    app.split.flush(app);
    assert.equal(layoutsWritesSince(inst, mark).length, 0, 'the import was not overwritten by the deferred split');
    ext.disable();
});

test('item 5: a settings-file write Cinnamon has not reloaded yet is not overwritten by a deferred flush', () => {
    const { env, ext } = makeEnv();
    const { app, ref } = enabledWithLayouts(env, ext);
    const inst = settingsInstance(env);

    app.split.remember(app, ref, { 0: 0.4, 1: 0.6 }, false);
    const mark = inst.callLog.length;
    // the dialog wrote its whole copy; the DBus notification (and with it the
    // reload) has not arrived yet when the 500 ms timer fires
    env.settingsWriteFile(UUID, 'layouts', '');
    app.split.flush(app); // the armed timer would call exactly this

    assert.equal(layoutsWritesSince(inst, mark).length, 0,
        'the external file write must not be overwritten by the deferred split');
    ext.disable();
});

test('item 5: an own write of an unrelated key keeps the pending split valid', () => {
    const { env, ext } = makeEnv();
    const { app, ref } = enabledWithLayouts(env, ext);
    const inst = settingsInstance(env);

    app.split.remember(app, ref, { 0: 0.4, 1: 0.6 }, false);
    const mark = inst.callLog.length;
    // a theme change (any unrelated key) rewrites the whole settings file, but it
    // is this App's own write: it must not invalidate the pending resize
    inst.setValue('panelTheme', true);

    assert.equal(flushTimers(env).length, 1, 'the own write did not drop the pending split');
    fireFlush(env);
    assert.equal(layoutsWritesSince(inst, mark).length, 1, 'the normal resize is still persisted');
    ext.disable();
});

test('item 5: an own layoutSet does not drop a pending split, and a resize after an import persists', () => {
    const { env, ext } = makeEnv();
    const { app, ref } = enabledWithLayouts(env, ext);
    const inst = settingsInstance(env);

    app.split.remember(app, ref, { 0: 0.4, 1: 0.6 }, false);
    const mark = inst.callLog.length;
    // auto on for the same monitor/workspace is an own layouts write
    app.ops.layoutSet(app, 0, 0, { auto: true });
    assert.equal(flushTimers(env).length, 1, 'the own layouts write kept the pending split');
    fireFlush(env);
    assert.equal(layoutsWritesSince(inst, mark).filter((c) => c.value.indexOf('0.4') !== -1).length, 1,
        'the pending split reached the settings');

    // an external reset is authoritative …
    externalWrite(env, 'layouts', '');
    app.split.remember(app, ref, { 0: 0.3, 1: 0.7 }, false);
    const mark2 = inst.callLog.length;
    fireFlush(env);
    assert.equal(layoutsWritesSince(inst, mark2).length, 1, 'a resize after the import still persists');
    ext.disable();
});

test('item 5: the file observer is armed per App and released with it', () => {
    const { env, ext } = makeEnv();
    const { app } = enabledWithLayouts(env, ext);
    const inst = settingsInstance(env);
    assert.equal(inst.count('changed::layouts'), 1, 'the reload surface is wired once');
    assert.equal(env.settingsFileMonitors.length, 1, 'exactly one live file monitor');

    env.layoutManager.emit('monitors-changed');
    env.flushDisplayConfigNoReply();
    assert.equal(env.settingsFileMonitors.length, 1, 'the recreation released the old monitor and armed one new');
    assert.notEqual(ext.currentSession().app, app, 'the App was recreated');

    ext.disable();
    assert.equal(env.settingsFileMonitors.length, 0, 'disable releases the observer');
    assert.equal(settingsInstance(env).count('changed::layouts'), 0, 'finalize released the reload surface');
});

test('item 5: a monitor that cannot be re-armed does not disable split persistence', () => {
    const { env, ext } = makeEnv();
    const { app, ref } = enabledWithLayouts(env, ext);
    const inst = settingsInstance(env);

    // the observer keeps no divergence state, so no failure can turn it into a
    // kill switch: with the re-arm failing once, the App logs and keeps writing
    const realNewForPath = env.gi.Gio.File.new_for_path;
    let failNext = true;
    env.gi.Gio.File.new_for_path = (path) => {
        const file = realNewForPath(path);
        if (failNext) {
            failNext = false;
            return { get_path: () => path, monitor_file: () => { throw new Error('injected monitor failure'); } };
        }
        return file;
    };
    env.settingsFileMonitors[0].cancel(); // force the next own write to re-arm
    inst.setValue('panelTheme', true);
    assert.equal(env.logs.some((l) => l.indexOf('greenTile settings-file observer unavailable') === 0), true,
        'the failure is reported once');

    app.split.remember(app, ref, { 0: 0.4, 1: 0.6 }, false);
    const mark = inst.callLog.length;
    fireFlush(env);
    assert.equal(layoutsWritesSince(inst, mark).length, 1, 'the resize still reaches the settings');
    env.gi.Gio.File.new_for_path = realNewForPath;
    ext.disable();
});

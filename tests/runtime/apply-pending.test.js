'use strict';
// The ONE application path: every retained auto command is drained through
// Auto#_applyAuto (write when the monitor is writable, then remove the intent only
// after the write landed). applyPending is the batch caller: EVERY write must land
// before any effect, a write the layout guard REFUSES stays retained, and an intent
// whose monitor can never be addressed is discarded. All three branches in one batch
// are the case that pins the shared path: the applied command is written, logged and
// removed; the refused one is untouched; the unaddressable one is dropped.
// Multi-slot write-before-effect ordering is pinned by tests/app/async-init.test.js
// item 4/F1; here the effect phase never sees a refused command because it iterates
// only the `applied` list, which a refusal never enters.
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEnv, makeWindow, MONITOR, settingsInstance } = require('../helpers/fakes/cinnamon-harness');

// minimal workspace hub: what the extension's Scope connects/disconnects on it
const makeWorkspace = (wsIndex = 0) => ({
    index: () => wsIndex,
    connect: () => 1,
    disconnect: () => {},
    list_windows: () => [],
});

const layoutsWrites = (env) => settingsInstance(env).callLog.filter((c) => c.op === 'setValue' && c.key === 'layouts');

test('applyPending: a mixed multi-slot batch writes before any effect and retains a refused command', () => {
    const { env, ext } = makeEnv();
    const ws0 = makeWorkspace(0);
    ws0.list_windows = () => env.tabList;
    env.workspaces.push(ws0);
    env.activeWorkspace = { index: () => 0 };
    env.layoutManager.monitors.push(MONITOR, { x: 2000, y: 0, width: 1000, height: 1100 });
    const a = makeWindow(env, 501, [50, 70, 320, 200], 0);
    const b = makeWindow(env, 502, [450, 70, 320, 200], 0);
    env.tabList.push(a, b);
    ext.enable();
    env.flushDisplayConfigNoReply();
    const app = ext.currentSession().app;
    app.session.pendingAuto.length = 0;

    // The second write meets a corrupt setting (a concurrent writer damaged it
    // between the two, one-shot): the first intent applies, the second is refused.
    // Only the write phase reads `layouts`, so the 2nd read is the 2nd command's
    // write; the effect phase reads again and sees a healthy setting.
    const inst = settingsInstance(env);
    const reads = { n: 0 };
    const realGet = inst.getValue.bind(inst);
    inst.getValue = (key) => {
        if (key === 'layouts') {
            reads.n += 1;
            if (reads.n === 2) {
                return '{invalid';
            }
        }
        return realGet(key);
    };
    app.session.pendingAuto.push(
        { monitorIndex: 0, wsIndex: 0, auto: true },
        { monitorIndex: 1, wsIndex: 0, auto: false },
        // a monitor that can never be addressed: discarded, not applied, not kept
        { monitorIndex: 99, wsIndex: 0, auto: true });
    app.auto.applyPending(app);

    const writes = layoutsWrites(env);
    assert.equal(writes.length, 1, 'exactly the writable command was written');
    const ref0 = app.split.ref(app, 0, 0, 2);
    assert.equal(JSON.parse(writes[0].value)[ref0.mkey][ref0.wskey].auto, true, 'and it carries the requested command');
    assert.equal(app.ops.layoutFor(app, 0, 0).auto, true, 'the applied command is stored, not just queued');
    assert.equal(env.logs.includes('greenTile auto tiling on for ws0'), true, 'the applied command is reported once');
    assert.equal(env.logs.some((l) => l.indexOf('greenTile auto tiling off for ws0') === 0), false,
        'the refused command is never reported as applied');
    assert.equal(app.session.pendingAuto.length, 1, 'only the refused command stays retained');
    assert.equal(app.session.pendingAuto[0].monitorIndex, 1, 'and it is the refused one');
    assert.equal(app.session.pendingAuto.some((c) => c.monitorIndex === 99), false,
        'the unaddressable intent was discarded, not applied and not retained');
    ext.disable();
});

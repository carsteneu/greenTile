'use strict';
// Animation-ownership contracts (R3): every transition greenTile started on a
// window's compositor actor has an exact, per-transition owner, and
// cancel/stop/disable/destroy release it — never a foreign transition and
// never a foreign property value. Driven through the REAL extension.js on the
// fake Cinnamon runtime; the ease actor is source-faithful to the installed
// environment.js (see tests/helpers/fakes/ease-actor.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { makeEaseActor } = require('../helpers/fakes/ease-actor');
const { MONITOR, makeEnv, makeWindow, makeWorkspace, enableOnMonitor } = require('../helpers/fakes/cinnamon-harness');

const OWN_PROPS = ['scale-x', 'scale-y', 'translation-x', 'translation-y'];
const columnsHotkey = (env, key) => env.keybindingManager.hotkeys.get(key).cb();

test('a placement before the async monitor reply is still released at disable', () => {
    // enable() fills the auto observer's tracked-window list only after the
    // asynchronous DisplayConfig reply, but the column hotkeys place windows
    // immediately — the ownership must not ride that tracking.
    const { env, ext } = makeEnv();
    env.layoutManager.monitors.push(MONITOR);
    ext.enable(); // no flushDisplayConfigNoReply(): the reply has not arrived
    const actor = makeEaseActor();
    const w1 = makeWindow(env, 1, [10, 10, 400, 300], 0, actor);
    const w2 = makeWindow(env, 2, [500, 0, 400, 300]);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    env.activeWorkspace = { index: () => 0 };
    columnsHotkey(env, 'greenTile-auto6');
    assert.equal(actor.transitions.size, 4, 'the placement animated the actor');
    ext.disable();
    assert.deepEqual(actor.removedTransitions.slice().sort(), OWN_PROPS,
        'the pre-reply placement is released at disable');
    assert.equal(actor.translation_x, 0, 'visual == buffer after teardown');
    assert.equal(actor.scale_x, 1, 'visual == buffer after teardown');
});

test('a foreign transition that superseded our own property is never removed or reset', () => {
    const { env, ext } = makeEnv();
    enableOnMonitor(env, ext);
    const actor = makeEaseActor();
    const w1 = makeWindow(env, 1, [10, 10, 400, 300], 0, actor);
    const w2 = makeWindow(env, 2, [500, 0, 400, 300]);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    env.activeWorkspace = { index: () => 0 };
    columnsHotkey(env, 'greenTile-auto6');
    // the shell's own animation takes 'scale-x' over while our ease runs
    let foreignStopped = null;
    actor.foreignTransition('scale-x', 0.5, (fin) => { foreignStopped = fin; });
    const removedBeforeTeardown = actor.removedTransitions.length;
    ext.disable();
    assert.equal(foreignStopped, null, 'the foreign scale-x transition was never stopped');
    assert.equal(actor.transitions.has('scale-x'), true, 'the foreign transition survives teardown');
    assert.equal(actor.scale_x, 0.5, 'the foreign scale value is not reset to the identity');
    assert.deepEqual(actor.removedTransitions.slice(removedBeforeTeardown).sort(),
        ['scale-y', 'translation-x', 'translation-y'],
        'exactly the transitions still ours were released');
    assert.equal(actor.translation_x, 0, 'our own properties still snap to identity');
    assert.equal(actor.scale_y, 1);
});

test('a non-animated place supersedes only the transitions still ours', () => {
    const { env, ext } = makeEnv();
    enableOnMonitor(env, ext);
    const actor = makeEaseActor();
    const w1 = makeWindow(env, 1, [10, 10, 400, 300], 0, actor);
    const w2 = makeWindow(env, 2, [500, 0, 400, 300]);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    env.activeWorkspace = { index: () => 0 };
    columnsHotkey(env, 'greenTile-auto6');
    let foreignStopped = null;
    actor.foreignTransition('scale-x', 0.5, (fin) => { foreignStopped = fin; });
    const removedBeforePlace = actor.removedTransitions.length;
    // animation off: the next place must supersede OUR in-flight ease, not the
    // foreign transition that replaced one of its properties
    env.settingsInstances.at(-1).setValue('tileAnimation', false);
    columnsHotkey(env, 'greenTile-auto6');
    assert.equal(foreignStopped, null, 'the foreign transition is not superseded');
    assert.equal(actor.transitions.has('scale-x'), true, 'the foreign transition is still pending');
    assert.equal(actor.scale_x, 0.5, 'the foreign value stays untouched');
    assert.deepEqual(actor.removedTransitions.slice(removedBeforePlace).sort(),
        ['scale-y', 'translation-x', 'translation-y'],
        'our own live transitions were released');
    assert.equal(actor.translation_x, 0, 'our own properties snap to identity for the new geometry');
    assert.equal(actor.scale_y, 1);
});

test('teardown isolates a failing window and still releases the others, reporting the failure', () => {
    const { env, ext } = makeEnv();
    enableOnMonitor(env, ext);
    const actor1 = makeEaseActor();
    const actor2 = makeEaseActor();
    let armThrow = false;
    const realRemove = actor1.remove_transition;
    actor1.remove_transition = (name) => {
        if (armThrow && name === 'translation-x')
            {throw new Error('actor gone');}
        realRemove(name);
    };
    const w1 = makeWindow(env, 1, [10, 10, 400, 300], 0, actor1);
    const w2 = makeWindow(env, 2, [500, 100, 400, 300], 0, actor2);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    env.activeWorkspace = { index: () => 0 };
    columnsHotkey(env, 'greenTile-auto6');
    env.display.emit('window-created', w1);
    env.display.emit('window-created', w2);
    armThrow = true;
    ext.disable();
    assert.deepEqual(actor2.removedTransitions.slice().sort(), OWN_PROPS,
        'the healthy window is released although its neighbour threw');
    assert.deepEqual(actor1.removedTransitions.filter((n) => n !== 'translation-x').sort(),
        ['scale-x', 'scale-y', 'translation-y'], 'the failing window still releases its other properties');
    assert.equal(actor2.translation_x, 0, 'the healthy window ends at the identity');
    assert.ok(env.logErrors.some((l) => l.includes('greenTile placement cleanup completed with errors')),
        'the failure is reported honestly instead of being swallowed');
});

test('teardown never writes actor geometry outside the eased properties', () => {
    // Known limitation, explicitly NOT claimed fixed: the workspace effect
    // moves a window's actor with x/y (and restores origX/origY) as well as
    // translation — the observed "actor x != buffer x with translation 0"
    // desync cannot be repaired from the translation/scale park alone. What is
    // guaranteed here: greenTile never writes x/y/origX/origY, so a foreign
    // geometry stays exactly as the shell left it.
    const { env, ext } = makeEnv();
    enableOnMonitor(env, ext);
    const actor = makeEaseActor();
    actor.x = 500;
    actor.y = 320;
    actor.origX = 5;
    actor.origY = 7;
    const w1 = makeWindow(env, 1, [10, 10, 400, 300], 0, actor);
    const w2 = makeWindow(env, 2, [500, 0, 400, 300]);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    env.activeWorkspace = { index: () => 0 };
    columnsHotkey(env, 'greenTile-auto6');
    ext.disable();
    assert.deepEqual([actor.x, actor.y, actor.origX, actor.origY], [500, 320, 5, 7],
        'the shell geometry is untouched');
});

test('a completed ease releases its record and a later place takes a fresh one', () => {
    const { env, ext } = makeEnv();
    enableOnMonitor(env, ext);
    const actor = makeEaseActor();
    const w1 = makeWindow(env, 1, [10, 10, 400, 300], 0, actor);
    const w2 = makeWindow(env, 2, [500, 0, 400, 300]);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    env.activeWorkspace = { index: () => 0 };
    columnsHotkey(env, 'greenTile-auto6');
    const app = ext.currentSession().app;
    assert.equal(app.placement.has(w1), true, 'the running ease is owned');
    actor.finishAll();
    assert.equal(app.placement.has(w1), false, 'no stale owner survives the completion');
    // the window sits somewhere else before the next retile, so it animates again
    w1.rect = [10, 10, 400, 300];
    columnsHotkey(env, 'greenTile-auto3');
    assert.equal(actor.transitions.size, 4, 'the fresh placement animates');
    assert.equal(app.placement.has(w1), true, 'the fresh ease is owned');
    const removedBeforeTeardown = actor.removedTransitions.length;
    ext.disable();
    assert.deepEqual(actor.removedTransitions.slice(removedBeforeTeardown).sort(), OWN_PROPS,
        'the fresh ease is released');
});

test('a window closed mid-flight drops its record and releases its transitions', () => {
    const { env, ext } = makeEnv();
    enableOnMonitor(env, ext);
    makeWorkspace(env);
    env.activeWorkspace = { index: () => 0 };
    const actor = makeEaseActor();
    const w1 = makeWindow(env, 1, [10, 10, 400, 300], 0, actor);
    const w2 = makeWindow(env, 2, [500, 0, 400, 300]);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    env.display.emit('window-created', w1);
    columnsHotkey(env, 'greenTile-auto6');
    const app = ext.currentSession().app;
    assert.equal(app.placement.has(w1), true, 'the running ease is owned');
    w1.emit('unmanaged'); // the window goes away while its ease runs
    assert.equal(app.placement.has(w1), false, 'the closed window leaves no stale owner');
    assert.deepEqual(actor.removedTransitions.slice().sort(), OWN_PROPS,
        'its own transitions are released with the window');
});

test('teardown releases a placement whose window no longer exposes an actor', () => {
    // Muffin queues the actor destroy before the MetaWindow wrapper goes away,
    // so get_compositor_private() is NULL by the time an App teardown runs —
    // the actor has to be the one the acquisition read, not re-resolved here.
    const { env, ext } = makeEnv();
    enableOnMonitor(env, ext);
    const actor = makeEaseActor();
    const w1 = makeWindow(env, 1, [10, 10, 400, 300], 0, actor);
    const w2 = makeWindow(env, 2, [500, 0, 400, 300]);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    env.activeWorkspace = { index: () => 0 };
    columnsHotkey(env, 'greenTile-auto6');
    w1.get_compositor_private = () => null;
    ext.disable();
    assert.deepEqual(actor.removedTransitions.slice().sort(), OWN_PROPS,
        'the owner releases through the actor it kept, not through the window');
    assert.deepEqual(env.logErrors, [], 'no error is reported for the null actor');
});

test('teardown snaps the properties whose transitions were all cancelled outside', () => {
    const { env, ext } = makeEnv();
    enableOnMonitor(env, ext);
    const actor = makeEaseActor();
    const w1 = makeWindow(env, 1, [10, 10, 400, 300], 0, actor);
    const w2 = makeWindow(env, 2, [500, 0, 400, 300]);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    env.activeWorkspace = { index: () => 0 };
    columnsHotkey(env, 'greenTile-auto6');
    for (const prop of OWN_PROPS) {
        actor.remove_transition(prop);
    }
    assert.equal(actor.transitions.size, 0, 'every own transition was cancelled outside');
    ext.disable();
    assert.equal(actor.removedTransitions.length, 4, 'nothing was left for teardown to stop');
    assert.equal(actor.translation_x, 0, 'the parked values still snap back to the buffer position');
    assert.equal(actor.translation_y, 0);
    assert.equal(actor.scale_x, 1);
    assert.equal(actor.scale_y, 1);
});

test('the shell mass-cancelling our transitions leaves no live transition behind', () => {
    // Cinnamon's own window effects cancel with actor.remove_all_transitions()
    // (windowManager.js _sizeChangeWindowDone and the workspace-switch cleanup):
    // all four of our transitions go at once and the ease reports
    // finished=false. The parked values stay on the actor, so the record has to
    // survive — the snap at the next place is what puts visual back on buffer.
    const { env, ext } = makeEnv();
    enableOnMonitor(env, ext);
    const actor = makeEaseActor();
    const w1 = makeWindow(env, 1, [10, 10, 400, 300], 0, actor);
    const w2 = makeWindow(env, 2, [500, 0, 400, 300]);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    env.activeWorkspace = { index: () => 0 };
    columnsHotkey(env, 'greenTile-auto6');
    const app = ext.currentSession().app;
    assert.equal(app.placement.has(w1), true, 'the ease is owned');
    let actorSignals = 0;
    actor.connect('transition-stopped', () => { actorSignals += 1; });
    actor.removeAllTransitions();
    assert.equal(actor.transitions.size, 0, 'no live transition remains');
    assert.equal(actorSignals, 0,
        'a mass cancel emits no actor-level ::transition-stopped (bare g_hash_table_remove_all)');
    assert.equal(actor.translation_x, 10, 'the parked offset is still applied to the actor');
    assert.equal(app.placement.has(w1), true, 'the record survives a global cancel');
    env.settingsInstances.at(-1).setValue('tileAnimation', false);
    columnsHotkey(env, 'greenTile-auto6');
    assert.equal(actor.translation_x, 0, 'the orphaned parked values are snapped back');
    assert.equal(actor.translation_y, 0, 'the orphaned parked values are snapped back');
    assert.equal(actor.scale_x, 1, 'visual == buffer again');
    assert.equal(actor.scale_y, 1, 'visual == buffer again');
    assert.equal(app.placement.has(w1), false, 'the record is released with the snap');
});

test('a disposed actor is tolerated while the other windows are still released', () => {
    const { env, ext } = makeEnv();
    enableOnMonitor(env, ext);
    const actor1 = makeEaseActor();
    const actor2 = makeEaseActor();
    const w1 = makeWindow(env, 1, [10, 10, 400, 300], 0, actor1);
    const w2 = makeWindow(env, 2, [10, 20, 400, 300], 0, actor2);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    env.activeWorkspace = { index: () => 0 };
    columnsHotkey(env, 'greenTile-auto6');
    actor1.destroy();
    ext.disable();
    assert.deepEqual(actor2.removedTransitions.slice().sort(), OWN_PROPS,
        'the healthy neighbour is released although its actor is gone');
    assert.equal(actor2.translation_x, 0, 'the healthy window ends at the identity');
    assert.deepEqual(env.logErrors, [], 'a disposed actor is not reported as a failure');
});

test('the closing animation keeps the final frame geometry and the animation budget', () => {
    const { env, ext } = makeEnv();
    enableOnMonitor(env, ext);
    const actor = makeEaseActor();
    const w1 = makeWindow(env, 1, [10, 10, 400, 300], 0, actor);
    const w2 = makeWindow(env, 2, [500, 0, 400, 300]);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    env.activeWorkspace = { index: () => 0 };
    columnsHotkey(env, 'greenTile-auto6');
    // the buffer lands instantly on the final cell geometry (no stepped
    // resizes), the actor is parked and eased back over the same 250 ms
    assert.deepEqual(w1.moves[0], ['resize', 0, 0, 329, 1100]);
    assert.deepEqual(w1.moves[1], ['move', 0, 0]);
    assert.deepEqual(actor.eases, [{
        duration: 250,
        mode: 'ease-out-quad',
        targets: { translation_x: 0, translation_y: 0, scale_x: 1, scale_y: 1 },
    }]);
});

test('an animated placement never stops a foreign transition that is already running', () => {
    // The original contract: cancel ONLY the transitions greenTile owns. A
    // foreign animation (the shell's size-change/workspace effect) that is
    // already running must survive the placement untouched — the animated path
    // must then not ease those properties at all, while the requested Meta
    // geometry is still applied.
    const { env, ext } = makeEnv();
    enableOnMonitor(env, ext);
    const actor = makeEaseActor();
    let foreignStopped = null;
    const foreign = actor.foreignTransition('translation-x', 256, (fin) => { foreignStopped = fin; });
    const w1 = makeWindow(env, 1, [10, 10, 400, 300], 0, actor);
    const w2 = makeWindow(env, 2, [500, 0, 400, 300]);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    env.activeWorkspace = { index: () => 0 };
    columnsHotkey(env, 'greenTile-auto6');
    assert.equal(foreignStopped, null, 'the foreign transition is never stopped');
    assert.equal(actor.get_transition('translation-x'), foreign, 'the foreign transition keeps its identity');
    assert.equal(actor.translation_x, 256, 'the foreign value is not overwritten');
    assert.deepEqual(w1.moves[0], ['resize', 0, 0, 329, 1100], 'the requested geometry is still applied');
    assert.equal(actor.eases.length, 0, 'no own animation is started while a foreign transition is active');
});

test('a separately cancelled own property is repaired even after the first transition finishes', () => {
    // The shared first-transition callback must not drop the repair of a sibling
    // that was cancelled on its own: the parked value has to snap back at
    // teardown, not leak forever.
    const { env, ext } = makeEnv();
    enableOnMonitor(env, ext);
    const actor = makeEaseActor();
    const w1 = makeWindow(env, 1, [10, 10, 400, 300], 0, actor);
    const w2 = makeWindow(env, 2, [500, 0, 400, 300]);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    env.activeWorkspace = { index: () => 0 };
    columnsHotkey(env, 'greenTile-auto6');
    const app = ext.currentSession().app;
    const parked = actor.scale_x;
    assert.notEqual(parked, 1, 'precondition: the property is parked');
    actor.remove_transition('scale-x'); // one own property is cancelled on its own
    assert.equal(app.placement.has(w1), true, 'the record survives a single-property cancellation');
    actor.finishAll();                  // the FIRST transition completes normally
    assert.equal(actor.scale_x, 1, 'the cancelled own property is repaired once the ease has finished');
    assert.equal(app.placement.has(w1), false, 'the repair resolves the record');
    ext.disable();
    assert.equal(actor.scale_x, 1, 'still at identity at teardown');
    assert.equal(actor.translation_x, 0, 'the completed ones stay at identity');
});

test('a foreign animation that settles on the value we froze is never overwritten', () => {
    // The shell's animation supersedes one of ours and finishes on EXACTLY the
    // value our own ease was cancelled at. Numeric equality is no proof of
    // ownership: the actor reported a completed transition on that property
    // after ours stopped, so the value on the actor belongs to that animation
    // and teardown must leave it exactly as the shell left it.
    const { env, ext } = makeEnv();
    enableOnMonitor(env, ext);
    const actor = makeEaseActor();
    const w1 = makeWindow(env, 1, [10, 10, 400, 300], 0, actor);
    const w2 = makeWindow(env, 2, [500, 0, 400, 300]);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    env.activeWorkspace = { index: () => 0 };
    columnsHotkey(env, 'greenTile-auto6');
    const frozen = actor.scale_x;
    assert.notEqual(frozen, 1, 'precondition: our own ease parked scale-x');
    const foreign = actor.foreignTransition('scale-x', frozen, null); // the shell takes scale-x over
    actor.finishTransition(foreign);                                  // ...and its ease completes
    assert.equal(actor.get_transition('scale-x'), null, 'its transition is gone again');
    assert.equal(actor.scale_x, frozen, 'precondition: the foreign value is on the actor');
    ext.disable();
    assert.equal(actor.scale_x, frozen, 'a settled foreign value is never overwritten');
    assert.equal(actor.translation_x, 0, 'our own still-running properties are still snapped');
    assert.equal(actor.scale_y, 1);
});

test('a replacement animation chained from our own transition-stopped signal is never overwritten', () => {
    // Clutter emits ::transition-stopped AFTER the transition left the actor's
    // table, deliberately so a handler may chain a replacement
    // (clutter-actor.c 19387-19391 and 19750-19758). A third party does exactly
    // that while teardown removes our transition: the identity write must
    // re-check the property after the emission — writing it would cancel the
    // chained animation (the assignment routes through the duration-0 skip
    // branch, which removes the transition on that property).
    const { env, ext } = makeEnv();
    enableOnMonitor(env, ext);
    const actor = makeEaseActor();
    const w1 = makeWindow(env, 1, [10, 10, 400, 300], 0, actor);
    const w2 = makeWindow(env, 2, [500, 0, 400, 300]);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    env.activeWorkspace = { index: () => 0 };
    columnsHotkey(env, 'greenTile-auto6');
    let replacement = null;
    actor.connect('transition-stopped', (_a, name, finished) => {
        if (name === 'translation-x' && finished === false && replacement === null) {
            replacement = actor.foreignTransition('translation-x', 256, null);
        }
    });
    ext.disable();
    assert.equal(actor.translation_x, 256, 'the chained replacement value is not overwritten');
    assert.equal(actor.get_transition('translation-x'), replacement,
        'the replacement transition is still the current one');
});

test('a re-place and a completed ease leave no actor observer behind', () => {
    // Every record subscribes to the actor's ::transition-stopped. A superseded
    // record (a second placement of the same window) and a record that resolved
    // itself must both drop that subscription, or every placement in a session
    // leaves another handler on a live actor.
    const { env, ext } = makeEnv();
    enableOnMonitor(env, ext);
    const actor = makeEaseActor();
    const w1 = makeWindow(env, 1, [10, 10, 400, 300], 0, actor);
    const w2 = makeWindow(env, 2, [500, 0, 400, 300]);
    env.tabList.push(w1, w2);
    env.display.focus_window = w1;
    env.activeWorkspace = { index: () => 0 };
    columnsHotkey(env, 'greenTile-auto6');
    assert.equal(actor.listenerCount('transition-stopped'), 1, 'one observer for the in-flight placement');
    columnsHotkey(env, 'greenTile-auto6');
    assert.equal(actor.listenerCount('transition-stopped'), 1, 'the superseded record stopped observing');
    actor.finishAll();
    assert.equal(ext.currentSession().app.placement.has(w1), false, 'the completed ease resolved the record');
    assert.equal(actor.listenerCount('transition-stopped'), 0, 'a resolved record stopped observing');
    ext.disable();
    assert.equal(actor.listenerCount('transition-stopped'), 0, 'teardown left no observer behind');
});

'use strict';
// Fake Clutter.Actor carrying the platform ease() semantics lib/tiling/place.js
// relies on, source-faithful to the installed Cinnamon
// /usr/share/cinnamon/js/ui/environment.js (_easeActor / _makeEaseCallback):
//   - every eased property gets its own transition, named with DASHES
//     ('translation-x'); get_transition(name) is the identity handle of a
//     transition, remove_transition(name) stops exactly that one;
//   - a property whose current value equals the target gets NO transition
//     (nothing to animate);
//   - an ease first cancels the transitions it overwrites
//     (animatedProps.forEach(p => actor.remove_transition(p))), which reports
//     stopped with finished=false;
//   - ONLY the FIRST created transition carries the stopped callback
//     (environment.js: `const [transition] = transitions`);
//   - duration 0 applies the targets synchronously and reports onStopped(true).
// Foreign transitions are planted the same way, under their dashed name, and
// never carry greenTile's callback. Which shell effect owns which property, per
// /usr/share/cinnamon/js/ui/windowManager.js: the size-change effect
// (_sizeChangedWindow) writes translation_x/y + scale_x/y and eases them back to
// identity, the workspace-switch effect (_switchWorkspace) moves window actors
// through x/y + origX/origY — and both, like minimize/unminimize/map, clean up
// with actor.remove_all_transitions() (covered by removeAllTransitions()).
const makeEaseActor = () => {
    const actor = {
        translation_x: 0,
        translation_y: 0,
        scale_x: 1,
        scale_y: 1,
        // the shell's own actor geometry — place.js must never write it
        x: 0,
        y: 0,
        origX: 0,
        eases: [],
        removedTransitions: [],
        transitions: new Map(),
        destroyed: false,
        get_transition(name) {
            actor.assertAlive();
            return actor.transitions.get(name) || null;
        },
        remove_transition(name) {
            actor.assertAlive();
            const t = actor.transitions.get(name);
            if (!t)
                {return;}
            actor.transitions.delete(name);
            actor.removedTransitions.push(name);
            t.finished = false;
            if (t.onStop) {
                const cb = t.onStop;
                t.onStop = null;
                cb(false);
            }
        },
        // Cinnamon's own window effects cancel with this call
        // (windowManager.js: _sizeChangeWindowDone, the workspace-switch
        // cleanup, minimize/unminimize/map): every transition is stopped with
        // finished=false, so the ease's first transition reports the
        // cancellation exactly once.
        removeAllTransitions() {
            for (const name of [...actor.transitions.keys()]) {
                actor.remove_transition(name);
            }
        },
        // the actor's Clutter wrapper being disposed: every method call on it
        // throws from here on, as it does on a destroyed GObject. Meta keeps
        // handing out this object until Muffin clears the window's compositor
        // private (the NULL case is covered in the harness tests).
        destroy() {
            actor.destroyed = true;
            actor.transitions.clear();
        },
        assertAlive() {
            if (actor.destroyed)
                {throw new Error('actor: disposed');}
        },
        ease(props) {
            actor.assertAlive();
            const { duration = 0, mode, onStopped, ...targets } = props;
            actor.eases.push({ duration, mode, targets });
            const dashed = Object.keys(targets).map((p) => p.replace(/_/g, '-'));
            for (const name of dashed) {
                actor.remove_transition(name);
            }
            if (duration === 0) {
                Object.assign(actor, targets);
                if (onStopped)
                    {onStopped(true);}
                return;
            }
            const created = [];
            for (const name of dashed) {
                const field = name.replace(/-/g, '_');
                if (actor[field] === targets[field])
                    {continue;}
                const t = { prop: name, field, target: targets[field], finished: null, onStop: null };
                actor.transitions.set(name, t);
                created.push(t);
            }
            actor.lastEase = created;
            if (created.length === 0) {
                if (onStopped)
                    {onStopped(true);}
                return;
            }
            created[0].onStop = onStopped || null;
        },
        // the shell's workspace effect takes one property over: our transition
        // on it is superseded (stopped, finished=false) and the shell's own
        // transition carries its callback instead
        foreignTransition(name, value, onStopped = null) {
            actor.assertAlive();
            const field = name.replace(/-/g, '_');
            actor.remove_transition(name);
            actor[field] = value;
            const t = { prop: name, field, target: value, finished: null, onStop: onStopped };
            actor.transitions.set(name, t);
            return t;
        },
        // completes the transitions of the LAST ease only: the properties land
        // on their targets, those transitions are gone and the ease's
        // transitions[0] reports finished=true (the platform callback
        // connection). Foreign transitions keep running.
        finishAll() {
            const created = actor.lastEase || [];
            const first = created[0];
            for (const t of created) {
                if (actor.transitions.get(t.prop) === t) {
                    actor.transitions.delete(t.prop);
                    actor[t.field] = t.target;
                    t.finished = true;
                }
            }
            if (first && first.onStop) {
                const cb = first.onStop;
                first.onStop = null;
                cb(true);
            }
        },
    };
    return actor;
};

module.exports = { makeEaseActor };

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
//     (animatedProps.forEach(p => actor.remove_transition(p)));
//   - a transition is a GObject-like object with connect('stopped'/'new-frame'):
//     the ease attaches its own callback to the FIRST created transition only
//     (environment.js:180-189 `const [transition] = transitions`), and every
//     transition reports its own stop — completion with finished=true, a
//     cancellation or a takeover with finished=false;
//   - duration 0 applies the targets synchronously and reports onStopped(true)
//     with no transition created.
// Foreign transitions are planted the same way, under their dashed name, and
// never carry greenTile's callback. Which shell effect owns which property, per
// /usr/share/cinnamon/js/ui/windowManager.js: the size-change effect
// (_sizeChangedWindow) writes translation_x/y + scale_x/y and eases them back to
// identity, the workspace-switch effect (_switchWorkspace) moves window actors
// through x/y + origX/origY — and both, like minimize/unminimize/map, clean up
// with actor.remove_all_transitions() (covered by removeAllTransitions()).

// A Clutter transition stand-in: same property name, same target, and the
// 'stopped'/'new-frame' signal surface environment.js connects to.
const makeTransition = (prop, field, target) => {
    const handlers = { stopped: [], 'new-frame': [] };
    const transition = {
        prop,
        field,
        target,
        finished: null,
        connect(signal, cb) {
            if (!handlers[signal])
                {throw new Error('transition: unknown signal "' + signal + '"');}
            const id = { signal, cb };
            handlers[signal].push(id);
            return id;
        },
        disconnect(id) {
            const list = handlers[id.signal];
            const at = list.indexOf(id);
            if (at === -1)
                {throw new Error('transition: handler not connected');}
            list.splice(at, 1);
        },
        // The platform stops exactly this transition: completion reports true,
        // a cancellation or an overwriting ease reports false.
        _stop(finished) {
            transition.finished = finished;
            for (const id of handlers.stopped.slice()) {
                id.cb(transition, finished);
            }
        },
    };
    return transition;
};

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
            t._stop(false);
        },
        // Cinnamon's own window effects cancel with this call
        // (windowManager.js: _sizeChangeWindowDone, the workspace-switch
        // cleanup, minimize/unminimize/map): every transition stops with
        // finished=false.
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
            // cancel overwritten transitions (environment.js:168)
            for (const name of dashed) {
                actor.remove_transition(name);
            }
            if (duration === 0) {
                // no implicit transition is created; the ease reports done
                // synchronously (environment.js:189-192 callback(true))
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
                const t = makeTransition(name, field, targets[field]);
                actor.transitions.set(name, t);
                created.push(t);
            }
            actor.lastEase = created;
            if (created.length === 0) {
                if (onStopped)
                    {onStopped(true);}
                return;
            }
            // ONLY the first created transition carries the ease callback
            // (environment.js:180-188 `const [transition] = transitions`)
            created[0].connect('stopped', (_t, finished) => {
                if (onStopped)
                    {onStopped(finished);}
            });
        },
        // the shell's effect takes one property over: our transition on it is
        // superseded (stopped, finished=false) and the shell's own transition
        // carries its callback instead
        foreignTransition(name, value, onStopped = null) {
            actor.assertAlive();
            const field = name.replace(/-/g, '_');
            actor.remove_transition(name);
            actor[field] = value;
            const t = makeTransition(name, field, value);
            if (onStopped)
                {t.connect('stopped', (_t, finished) => onStopped(finished));}
            actor.transitions.set(name, t);
            return t;
        },
        // completes the transitions of the LAST ease only: the properties land
        // on their targets, those transitions are gone and each reports
        // finished=true (the ease's own callback rides transitions[0]).
        // Foreign transitions keep running.
        finishAll() {
            const created = actor.lastEase || [];
            for (const t of created) {
                if (actor.transitions.get(t.prop) === t) {
                    actor.transitions.delete(t.prop);
                    actor[t.field] = t.target;
                    t._stop(true);
                }
            }
        },
    };
    return actor;
};

module.exports = { makeEaseActor };

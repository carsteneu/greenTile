'use strict';
// Fake Clutter.Actor carrying the ease()/transition semantics lib/tiling/place.js
// and lib/runtime/placement.js rely on, source-faithful to the Clutter that
// Cinnamon actually loads: environment.js:3 pins `imports.gi.versions.Clutter =
// '0'`, i.e. the fork vendored in Muffin, not standalone Clutter. Ground truth:
// https://raw.githubusercontent.com/linuxmint/muffin/6.6.3/clutter/clutter/clutter-actor.c
// (functions: should_skip_implicit_transition, _clutter_actor_create_transition,
// add_transition_internal, on_transition_stopped, transition_closure_free,
// clutter_actor_remove_transition) plus the installed
// /usr/share/cinnamon/js/ui/environment.js (_easeActor / _easeActorProperty).
//
// Modelled, with the source lines they come from:
//   - every eased property gets its own transition, named with DASHES
//     ('translation-x'); get_transition(name) is the identity handle of a
//     transition, remove_transition(name) stops exactly that one. A transition
//     is created for every eased property whether or not the value changes:
//     should_skip_implicit_transition (19458-19493) gates only on easing
//     duration 0, an unallocated :allocation and an unmapped actor — never on
//     value equality;
//   - when the skip branch does fire (19433-19436 in
//     _clutter_actor_create_transition) it REMOVES any existing transition and
//     writes the target immediately through set_animatable_property, so a
//     skipped ease still lands the value;
//   - an ease first cancels the transitions it overwrites
//     (environment.js:168 `animatedProps.forEach(p => actor.remove_transition(p))`);
//   - a transition is a GObject-like object with connect('stopped'/'new-frame');
//     the ease attaches its own callback to the FIRST created transition only
//     (environment.js:180-189 `const [transition] = transitions`), and every
//     transition reports its own stop — completion with finished=true, a
//     cancellation or a takeover with finished=false;
//   - the ACTOR has a detailed 'transition-stopped' signal (name, is_finished),
//     emitted from on_transition_stopped (19353-19395) on a natural completion
//     (is_finished=TRUE) and explicitly from clutter_actor_remove_transition
//     (19722-19770) on a removal (is_finished=FALSE, only if it was playing).
//     Both emissions happen AFTER the transition left the actor's table, "so
//     that we can chain up new transitions without interfering with the one
//     that just finished" — which is why a stopped handler may install a
//     replacement, and why an identity write must re-check the property after
//     the emission;
//   - the actor's completion handler is connected when the transition is
//     created (add_transition_internal, 19443) and therefore runs BEFORE any
//     handler connected afterwards, so on a natural completion the actor signal
//     is emitted before greenTile's own per-transition handler.
// Foreign transitions are planted the same way, under their dashed name, and
// never carry greenTile's callback. Which shell effect owns which property, per
// /usr/share/cinnamon/js/ui/windowManager.js: the size-change effect
// (_sizeChangedWindow) writes translation_x/y + scale_x/y and eases them back to
// identity, the workspace-switch effect (_switchWorkspace) moves window actors
// through x/y + origX/origY — and both, like minimize/unminimize/map, clean up
// with actor.remove_all_transitions() (covered by removeAllTransitions()).

// A Clutter transition stand-in: same property name, same target, and the
// 'stopped'/'new-frame' signal surface environment.js connects to.
const makeTransition = (prop, field, target, owner) => {
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
        // The platform stops exactly this transition. A natural completion
        // first runs the actor's completion handler (connected at creation,
        // i.e. before any caller handler) — that handler removes the transition
        // from the actor's table and emits the actor's ::transition-stopped with
        // is_finished=TRUE — and only then the handlers connected afterwards run.
        _stop(finished) {
            transition.finished = finished;
            if (finished)
                {owner.emitTransitionStopped(prop, true);}
            for (const id of handlers.stopped.slice()) {
                id.cb(transition, finished);
            }
        },
    };
    return transition;
};

const makeEaseActor = () => {
    const signalHandlers = { 'transition-stopped': [] };
    const values = { translation_x: 0, translation_y: 0, scale_x: 1, scale_y: 1 };
    const actor = {
        // the shell's own actor geometry — place.js must never write it
        x: 0,
        y: 0,
        origX: 0,
        eases: [],
        removedTransitions: [],
        transitions: new Map(),
        destroyed: false,
        // Clutter.Actor's detailed signal surface (GObject connect/disconnect)
        connect(signal, cb) {
            actor.assertAlive();
            if (!signalHandlers[signal])
                {throw new Error('actor: unknown signal "' + signal + '"');}
            const id = { signal, cb };
            signalHandlers[signal].push(id);
            return id;
        },
        disconnect(id) {
            const list = signalHandlers[id.signal];
            const at = list.indexOf(id);
            if (at === -1)
                {throw new Error('actor: handler not connected');}
            list.splice(at, 1);
        },
        // g_signal_emit(actor, ::transition-stopped, quark, name, is_finished)
        emitTransitionStopped(name, finished) {
            for (const id of signalHandlers['transition-stopped'].slice()) {
                id.cb(actor, name, finished);
            }
        },
        get_transition(name) {
            actor.assertAlive();
            return actor.transitions.get(name) || null;
        },
        remove_transition(name) {
            actor.assertAlive();
            const t = actor.transitions.get(name);
            if (!t)
                {return;}
            // clutter_actor_remove_transition: the hash removal frees the
            // closure (which disconnects the actor's completion handler and
            // stops the timeline, firing the transition's own stopped), then
            // the actor's ::transition-stopped is emitted with FALSE.
            actor.transitions.delete(name);
            actor.removedTransitions.push(name);
            t._stop(false);
            actor.emitTransitionStopped(name, false);
        },
        // Cinnamon's own window effects cancel with this call
        // (windowManager.js: _sizeChangeWindowDone, the workspace-switch
        // cleanup, minimize/unminimize/map)
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
                // _clutter_actor_create_transition's skip branch: no transition
                // is created and the target lands immediately
                Object.assign(actor, targets);
                if (onStopped)
                    {onStopped(true);}
                return;
            }
            const created = [];
            for (const name of dashed) {
                const field = name.replace(/-/g, '_');
                const t = makeTransition(name, field, targets[field], actor);
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
            const t = makeTransition(name, field, value, actor);
            if (onStopped)
                {t.connect('stopped', (_t, finished) => onStopped(finished));}
            actor.transitions.set(name, t);
            return t;
        },
        // completes one transition naturally: the value lands on its target and
        // the actor reports ::transition-stopped(name, TRUE)
        finishTransition(t) {
            if (actor.transitions.get(t.prop) === t) {
                actor.transitions.delete(t.prop);
                actor[t.field] = t.target;
                t._stop(true);
            }
        },
        // completes the transitions of the LAST ease only. Foreign transitions
        // keep running.
        finishAll() {
            for (const t of actor.lastEase || []) {
                actor.finishTransition(t);
            }
        },
    };
    // The four animatable properties are accessors, because in Clutter an
    // ordinary assignment goes through _clutter_actor_create_transition: at the
    // default easing duration of 0 that hits the skip branch, which REMOVES any
    // transition on the property before writing the value. Source asymmetry
    // (clutter-actor.c 4788-4819 vs 5102-5134): translation writes always route
    // that way, scale writes only when the value actually changes. So greenTile's
    // identity write in _release would cancel a chained replacement on
    // translation-* but leave one on scale-* alone.
    for (const [field, prop, alwaysRoutes] of [
        ['translation_x', 'translation-x', true],
        ['translation_y', 'translation-y', true],
        ['scale_x', 'scale-x', false],
        ['scale_y', 'scale-y', false],
    ]) {
        Object.defineProperty(actor, field, {
            enumerable: true,
            configurable: true,
            get() {
                actor.assertAlive();
                return values[field];
            },
            set(v) {
                actor.assertAlive();
                if (alwaysRoutes || values[field] !== v) {
                    actor.remove_transition(prop);
                }
                values[field] = v;
            },
        });
    }
    return actor;
};

module.exports = { makeEaseActor };

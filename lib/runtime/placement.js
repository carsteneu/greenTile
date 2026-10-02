/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * per-App placement-resource owner: the exact transitions greenTile started on
 * a window's compositor actor (lib/tiling/place.js parks translation/scale and
 * eases them back to identity). One record per window, keyed by the MetaWindow
 * and holding the actor it was read from — the window's
 * get_compositor_private() is already NULL by the time an App teardown runs
 * (Muffin queues the actor destroy first), so the actor cannot be re-resolved
 * later.
 *
 * Ownership is per transition object (actor.get_transition(name)), not per
 * property name: a foreign animation that replaced one of our transitions must
 * be left alone, and a single cancelled property must not drop the ownership
 * of the transitions still running (the platform reports a stopped ease on its
 * FIRST transition only — environment.js _easeActor). The record is taken at
 * the acquisition itself, so a placement that happens before the auto
 * observer's asynchronous monitor reply is covered too.
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

/** @param {unknown} e */
const failText = (e) => {
    try {
        return e instanceof Error ? e.message : String(e);
    }
    catch (_e) {
        // a half-disposed wrapper may refuse to be stringified; a failing
        // message must not escape the cleanup it describes
        return 'unprintable error';
    }
};

/**
 * @typedef {Object} PlacementDeps
 * @property {(message: string) => void} logError global.logError
 */

/**
 * @typedef {Object} OwnTransition
 * @property {AnyRecord} transition the Clutter transition object we started
 * @property {string} field the actor field the transition animates
 * @property {number} identity the value that makes visual == buffer
 */

/**
 * @typedef {Object} PlacementRecord
 * @property {object} token identifies the acquisition this record belongs to
 * @property {CinnamonActor} actor the actor read at acquisition time
 * @property {Map<string, OwnTransition>} transitions property -> own transition
 *
 * Keyed by the MetaWindow, relying on GJS handing out one stable wrapper per
 * GObject instance: the window an 'unmanaged' signal delivers is the same
 * wrapper the placement was called with. A divergence would not leak a
 * transition — the record would simply be released at App teardown instead —
 * but it would delay the identity snap on close.
 */

var Placement = class {
    /** @param {PlacementDeps} deps */
    constructor(deps) {
        this._logError = deps.logError;
        /** @type {Map<CinnamonWindow, PlacementRecord>} */
        this._records = new Map();
    }

    // Observable ownership state: true while a placement of this window still
    // holds live transitions of its own. Guaranteed to fall back to false on
    // completion, cancel-with-release, window close and App teardown; a record
    // whose transitions the shell cancelled globally (remove_all_transitions)
    // stays until the next place or teardown snaps the parked values back, which
    // is deliberate — see _release.
    /** @param {CinnamonWindow} metaWindow */
    has(metaWindow) {
        return this._records.has(metaWindow);
    }

    // Takes ownership of the transitions the ease just created. The token is
    // this acquisition's identity: the stopped callback of a superseded ease
    // must never release a newer record.
    /**
     * @param {CinnamonWindow} metaWindow
     * @param {object} token
     * @param {CinnamonActor} actor
     * @param {ReadonlyArray<{ prop: string, field: string, identity: number }>} props
     */
    acquired(metaWindow, token, actor, props) {
        /** @type {Map<string, OwnTransition>} */
        const transitions = new Map();
        for (const p of props) {
            let transition = null;
            try {
                transition = actor.get_transition(p.prop);
            }
            catch (_e) {
                // a destroyed actor holds no transition of ours any more
                this._records.delete(metaWindow);
                return;
            }
            if (transition) {
                transitions.set(p.prop, { transition, field: p.field, identity: p.identity });
            }
        }
        if (transitions.size === 0) {
            this._records.delete(metaWindow);
            return;
        }
        this._records.set(metaWindow, { token, actor, transitions });
    }

    // The platform reports a stopped ease on its FIRST transition only, with
    // finished=false whenever it was cancelled or superseded and finished=true
    // when the whole ease ran through. Only the completed ease releases the
    // record: one cancelled property must not drop the ownership of the
    // transitions that are still running.
    /**
     * @param {CinnamonWindow} metaWindow
     * @param {object} token
     * @param {boolean} finished
     */
    settled(metaWindow, token, finished) {
        const record = this._records.get(metaWindow);
        if (!record || record.token !== token || !finished) {
            return;
        }
        this._records.delete(metaWindow);
    }

    // Drops one window's record and releases what is still ours: the window is
    // gone (unmanaged), or a non-animated placement is about to move the buffer
    // and the actor has to sit at identity for it. Failures are reported the
    // same way as at teardown — a failed release is never silent.
    /** @param {CinnamonWindow} metaWindow */
    release(metaWindow) {
        const record = this._records.get(metaWindow);
        if (!record) {
            return;
        }
        this._records.delete(metaWindow);
        /** @type {string[]} */
        const failures = [];
        this._release(record, failures);
        this._report(failures);
    }

    // App teardown: every record is released, per window and per property
    // isolated so one bad actor cannot strand the rest, and the failures are
    // reported once instead of disappearing into the unload.
    destroy() {
        /** @type {string[]} */
        const failures = [];
        for (const [metaWindow, record] of this._records) {
            this._records.delete(metaWindow);
            this._release(record, failures);
        }
        this._report(failures);
    }

    // A record's MetaWindow can be the only reference to a window that was
    // placed and closed before the auto observer started tracking it (the
    // asynchronous monitor reply): that record is held until App teardown,
    // which releases it. Bounded per App, and no transition outlives the actor.
    // The record is removed before it is released, so a release that keeps
    // failing can be reported at most once per acquisition — never per frame.
    /** @param {string[]} failures */
    _report(failures) {
        if (failures.length) {
            try {
                this._logError('greenTile placement cleanup completed with errors: ' + failures.join('; '));
            }
            catch (_e) {
                // the cleanup already ran: a failing report must not escape
                // into the signal handler or the App teardown step
            }
        }
    }

    // Removes exactly the transitions that are still ours and snaps their
    // properties to the identity (visual == buffer). A property a foreign
    // transition took over is left completely alone, and so is an actor that is
    // already destroyed — its transitions died with it. A property whose
    // transition is simply gone is snapped: either our ease completed (the
    // value is already the identity) or the transition was cancelled
    // mid-flight, which is exactly the desync the snap repairs.
    //
    // The one case this cannot tell apart is a foreign animation that
    // superseded ours on the same property and then completed on a NON-identity
    // target. For the shell's own effects that is not a case: the size-change
    // effect writes exactly these four properties and eases them back to 1/0
    // (windowManager.js _sizeChangedWindow/_sizeChangeWindowDone), and the
    // workspace-switch effect moves window actors through x/y + origX/origY
    // (windowManager.js _switchWorkspace), never through translation/scale. Both
    // of those paths mass-cancel with actor.remove_all_transitions(), which is
    // why a globally cancelled ease must NOT drop the record — the snap at the
    // next place or teardown is what restores the values. A third-party
    // supersede-and-settle at a non-identity value remains a blind spot; it is
    // unavoidable from the transition API alone, since Clutter exposes no
    // "which owner" on a completed transition.
    /**
     * @param {PlacementRecord} record
     * @param {string[] | null} failures
     */
    _release(record, failures) {
        const actor = record.actor;
        const entries = [...record.transitions];
        if (entries.length === 0) {
            return;
        }
        try {
            actor.get_transition(entries[0][0]);
        }
        catch (_e) {
            // wrapper already disposed — nothing of ours outlived it
            return;
        }
        for (const [prop, entry] of entries) {
            let current = null;
            try {
                current = actor.get_transition(prop);
            }
            catch (e) {
                if (failures) {
                    failures.push(prop + ': ' + failText(e));
                }
                continue;
            }
            if (current !== null && current !== entry.transition) {
                continue;
            }
            if (current === entry.transition) {
                try {
                    actor.remove_transition(prop);
                }
                catch (e) {
                    if (failures) {
                        failures.push(prop + ': ' + failText(e));
                    }
                    continue;
                }
            }
            try {
                /** @type {AnyRecord} */ (actor)[entry.field] = entry.identity;
            }
            catch (e) {
                if (failures) {
                    failures.push(entry.field + ': ' + failText(e));
                }
            }
        }
    }
};

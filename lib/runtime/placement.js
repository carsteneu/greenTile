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
 * Ownership is per transition object (actor.get_transition(name)), never per
 * property name. Each of our transitions carries its own 'stopped' handler
 * (environment.js connects exactly this signal: `transition.connect('stopped',
 * (t, finished) => ...)`), so:
 *   - a foreign animation that replaced one of our transitions is recognised by
 *     the transition IDENTITY and left completely alone — its transition is
 *     never removed and its value is never reset;
 *   - one cancelled property no longer drops the ownership of its siblings: the
 *     record survives, and each property is resolved on its own.
 * A property whose transition is gone is repaired only when it is provably
 * ours: our transition stopped unfinished AND the field still carries the value
 * it froze at. A property a foreign animation settled on carries the foreign
 * value, and a null transition is never by itself permission to snap.
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
 * @property {boolean} stopped whether that transition reported its stop
 * @property {number|undefined} frozen the field value at the stop
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

    // True while any of the props carries a transition that is NOT ours — the
    // shell's own window effect, a third-party animation. The animated
    // placement must not ease those properties: the platform cancels whatever
    // sits on an eased property (environment.js _easeActor), and cancelling a
    // foreign animation is exactly what the original contract forbids. A
    // property we still own does not count; an unreadable actor protects
    // nothing.
    /**
     * @param {CinnamonWindow} metaWindow
     * @param {CinnamonActor} actor
     * @param {ReadonlyArray<{ prop: string }>} props
     * @returns {boolean}
     */
    foreignActive(metaWindow, actor, props) {
        const record = this._records.get(metaWindow);
        const own = record ? record.transitions : null;
        for (const p of props) {
            let current = null;
            try {
                current = actor.get_transition(p.prop);
            }
            catch (_e) {
                return false;
            }
            if (current === null) {
                continue;
            }
            const entry = own ? own.get(p.prop) : null;
            if (!entry || entry.transition !== current) {
                return true;
            }
        }
        return false;
    }

    // Takes ownership of the transitions the ease just created. The token is
    // this acquisition's identity: a superseded ease's stop must never release a
    // newer record, and every entry is additionally guarded by its transition
    // object.
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
                // a destroyed actor holds no transition of ours any more; stop
                // reading and keep what was collected so a later teardown still
                // releases it
                break;
            }
            if (!transition) {
                continue;
            }
            /** @type {OwnTransition} */
            const entry = { transition, field: p.field, identity: p.identity, stopped: false, frozen: undefined };
            try {
                transition.connect('stopped', (/** @type {unknown} */ _t, /** @type {boolean} */ finished) => {
                    this._onStopped(metaWindow, token, p.prop, entry, finished);
                });
            }
            catch (_e) {
                // no signal surface on this wrapper: the entry stays owned and
                // is resolved by identity at release time
            }
            transitions.set(p.prop, entry);
        }
        if (transitions.size === 0) {
            this._records.delete(metaWindow);
            return;
        }
        this._records.set(metaWindow, { token, actor, transitions });
    }

    // One of our transitions stopped. finished=true is the whole ease running
    // through (the value is already the identity, nothing to repair). Any other
    // stop is a cancellation or a foreign takeover: the value the field carries
    // right now is frozen and kept as the evidence _release classifies against —
    // a foreign ease installs its replacement synchronously after this emission,
    // so the decision cannot be made here.
    /**
     * @param {CinnamonWindow} metaWindow
     * @param {object} token
     * @param {string} prop
     * @param {OwnTransition} entry
     * @param {boolean} finished
     */
    _onStopped(metaWindow, token, prop, entry, finished) {
        const record = this._records.get(metaWindow);
        if (!record || record.token !== token || record.transitions.get(prop) !== entry) {
            return;
        }
        if (finished) {
            record.transitions.delete(prop);
            this._sweep(record);
            if (record.transitions.size === 0) {
                this._records.delete(metaWindow);
            }
            return;
        }
        entry.stopped = true;
        try {
            entry.frozen = /** @type {AnyRecord} */ (record.actor)[entry.field];
        }
        catch (_e) {
            entry.frozen = undefined;
        }
    }

    // The earliest point at which a sibling that was cancelled on its own can be
    // repaired safely: a whole ease has just finished, so a foreign takeover of
    // any sibling has long since installed its own transition and is skipped.
    // Only properties that are provably ours are snapped; a null transition that
    // carries a foreign value is left alone.
    /** @param {PlacementRecord} record */
    _sweep(record) {
        const actor = record.actor;
        for (const [prop, entry] of [...record.transitions]) {
            let current = null;
            try {
                current = actor.get_transition(prop);
            }
            catch (_e) {
                return;
            }
            if (current !== null || !this._repairable(actor, entry)) {
                continue;
            }
            try {
                /** @type {AnyRecord} */ (actor)[entry.field] = entry.identity;
                record.transitions.delete(prop);
            }
            catch (_e) {
                // left in the record: the release reports it
            }
        }
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

    // True only for a property that is provably OURS to repair: our transition
    // stopped unfinished and the field still carries exactly the value it froze
    // at. Anything else is not greenTile's to touch — a completed ease already
    // sits at the identity, and a property a foreign animation settled on
    // carries the foreign value. Clutter exposes no owner on a finished
    // transition, so the frozen value is the evidence; a null transition alone
    // is never permission to snap.
    /**
     * @param {CinnamonActor} actor
     * @param {OwnTransition} entry
     * @returns {boolean}
     */
    _repairable(actor, entry) {
        if (!entry.stopped) {
            return false;
        }
        try {
            return /** @type {AnyRecord} */ (actor)[entry.field] === entry.frozen;
        }
        catch (_e) {
            return false;
        }
    }

    // Removes exactly the transitions that are still ours and, when the property
    // is provably ours, snaps it to the identity (visual == buffer). A property
    // a foreign transition holds — running or settled — is left completely
    // alone, and so is an actor that is already destroyed: its transitions died
    // with it.
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
                // a foreign transition owns the property now — never touch it
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
            else if (!this._repairable(actor, entry)) {
                continue;
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

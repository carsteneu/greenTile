// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
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
export const Placement: {
    new (deps: PlacementDeps): {
        _logError: (message: string) => void;
        /** @type {Map<CinnamonWindow, PlacementRecord>} */
        _records: Map<CinnamonWindow, PlacementRecord>;
        /** @param {CinnamonWindow} metaWindow */
        has(metaWindow: CinnamonWindow): boolean;
        /**
         * @param {CinnamonWindow} metaWindow
         * @param {object} token
         * @param {CinnamonActor} actor
         * @param {ReadonlyArray<{ prop: string, field: string, identity: number }>} props
         */
        acquired(metaWindow: CinnamonWindow, token: object, actor: CinnamonActor, props: ReadonlyArray<{
            prop: string;
            field: string;
            identity: number;
        }>): void;
        /**
         * @param {CinnamonWindow} metaWindow
         * @param {object} token
         * @param {boolean} finished
         */
        settled(metaWindow: CinnamonWindow, token: object, finished: boolean): void;
        /** @param {CinnamonWindow} metaWindow */
        release(metaWindow: CinnamonWindow): void;
        destroy(): void;
        /** @param {string[]} failures */
        _report(failures: string[]): void;
        /**
         * @param {PlacementRecord} record
         * @param {string[] | null} failures
         */
        _release(record: PlacementRecord, failures: string[] | null): void;
    };
};
export type PlacementDeps = {
    /**
     * global.logError
     */
    logError: (message: string) => void;
};
export type OwnTransition = {
    /**
     * the Clutter transition object we started
     */
    transition: AnyRecord;
    /**
     * the actor field the transition animates
     */
    field: string;
    /**
     * the value that makes visual == buffer
     */
    identity: number;
};
export type PlacementRecord = {
    /**
     * identifies the acquisition this record belongs to
     */
    token: object;
    /**
     * the actor read at acquisition time
     */
    actor: CinnamonActor;
    /**
     * property -> own transition
     *
     * Keyed by the MetaWindow, relying on GJS handing out one stable wrapper per
     * GObject instance: the window an 'unmanaged' signal delivers is the same
     * wrapper the placement was called with. A divergence would not leak a
     * transition — the record would simply be released at App teardown instead —
     * but it would delay the identity snap on close.
     */
    transitions: Map<string, OwnTransition>;
};

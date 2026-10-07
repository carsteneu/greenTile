// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
/**
 * Settle wait after a monitor change: Muffin can take several seconds to move windows
 * to their new monitors. The retile runs once, 2 s after the last monitor change or
 * window-entered-monitor event, at the latest 15 s after the first change. The timer
 * is managed as an explicit id (not on the scope): it is replaced and removed
 * mid-life, which the scope's release-everything model does not support.
 * @typedef {Object} SettleDeps
 * @property {AnyRecord} mainloop mainloop backend
 * @property {() => number} now clock, Date.now in production
 * @property {(msg: string) => void} log global.log
 * @property {(app: AppFacade) => void} onSettled the fanned-out retile, auto.settleAll
 * @property {(app: AppFacade) => boolean} isLive whether that App is still the live one
 */
export const Settle: {
    new (deps: SettleDeps): {
        _mainloop: AnyRecord;
        _now: () => number;
        _log: (msg: string) => void;
        _onSettled: (app: AppFacade) => void;
        _isLive: (app: AppFacade) => boolean;
        _timer: number;
        pending: boolean;
        started: number;
        /**
         * @param {AppFacade} app
         */
        start(app: AppFacade): void;
        /**
         * A monitor change destroys the App while the settle wait may be running; keep its
         * start time then, so the 15 s limit counts from the first change, not the last.
         */
        teardown(): void;
        /**
         * Config boot after an App recreation: the wait restarts once for the change that
         * routed through the recreation.
         * @param {AppFacade} app
         */
        consumePending(app: AppFacade): void;
        destroy(): void;
    };
};
/**
 * Session owner: runs the App create/recreate/destroy flow and carries what
 * must outlive an App recreation. Deps are all injected: signalManager (fresh,
 * this scope alone), layoutManager (Main.layoutManager), mainloop, gobject
 * (imports.gi.GObject, activates the scope's vendor guard for GObject targets),
 * now, log, onSettled, createApp.
 * @typedef {Object} SessionDeps
 * @property {AnyRecord} signalManager fresh, this scope alone
 * @property {AnyRecord} layoutManager Main.layoutManager
 * @property {AnyRecord} mainloop mainloop backend
 * @property {AnyRecord} gobject imports.gi.GObject
 * @property {() => number} now clock, Date.now in production
 * @property {(msg: string) => void} log global.log
 * @property {(app: AppFacade) => void} onSettled the fanned-out retile, auto.settleAll
 * @property {(session: Session) => { destroy(): void }} createApp builds the App on this session
 */
export const Session: {
    new (deps: SessionDeps): {
        _deps: SessionDeps;
        _scope: any;
        settle: {
            _mainloop: AnyRecord;
            _now: () => number;
            _log: (msg: string) => void;
            _onSettled: (app: AppFacade) => void;
            _isLive: (app: AppFacade) => boolean;
            _timer: number;
            pending: boolean;
            started: number;
            /**
             * @param {AppFacade} app
             */
            start(app: AppFacade): void;
            /**
             * A monitor change destroys the App while the settle wait may be running; keep its
             * start time then, so the 15 s limit counts from the first change, not the last.
             */
            teardown(): void;
            /**
             * Config boot after an App recreation: the wait restarts once for the change that
             * routed through the recreation.
             * @param {AppFacade} app
             */
            consumePending(app: AppFacade): void;
            destroy(): void;
        };
        /** @type {AppFacade | null} */
        _rolledBack: AppFacade | null;
        monitorFallbackLogged: boolean;
        /** @type {Array<{monitorIndex: number, wsIndex: number, auto: boolean}>} */
        pendingAuto: {
            monitorIndex: number;
            wsIndex: number;
            auto: boolean;
        }[];
        splitCorruptLogged: boolean;
        layoutsWriteGuardLogged: boolean;
        accentGenSeq: number;
        panelSaved: any;
        exclToggles: Map<any, any>;
        exclWatches: Map<any, any>;
        /** @type {Set<string>} */
        orderUsed: Set<string>;
        /** @type {any} */ app: any;
        _destroyed: boolean;
        /**
         * The next accent generation class for the theme component's stylesheet load.
         */
        nextAccentGen(): string;
        /** Creates the App and connects the monitors-changed recreate handler. */
        start(): void;
        /**
         * Whether that App is the live, fully started one — a rolled back shell is not.
         * @param {AppFacade} app
         */
        _isLive(app: AppFacade): boolean;
        /**
         * The storage slot an auto command addresses: the monitor key plus the
         * EFFECTIVE workspace key. On a monitor whose workspaces live on the primary
         * only, every numbered workspace resolves to the same alias — one slot, one
         * intent — so two commands for different numbered workspaces are the same
         * command there. Null while the registry cannot resolve it yet.
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {number} wsIndex
         * @returns {string | null}
         */
        intentSlot(app: AppFacade, monitorIndex: number, wsIndex: number): string | null;
        /**
         * Whether two auto commands address the same slot — the same storage entry, or
         * the same numbered pair while the registry cannot resolve the effective key.
         * @param {AppFacade} app
         * @param {number} aMonitor
         * @param {number} aWs
         * @param {number} bMonitor
         * @param {number} bWs
         * @returns {boolean}
         */
        sameSlot(app: AppFacade, aMonitor: number, aWs: number, bMonitor: number, bWs: number): boolean;
        /**
         * Collapses the retained queue to ONE intent per effective slot, keeping the
         * NEWEST (last pressed). The queue is built before the registry can resolve the
         * effective key, so two numbered workspaces of a shared monitor ('*') can both
         * sit in it for the same storage entry; every read and every application of the
         * queue normalizes first, so the newest command is the one that survives.
         * Entries the registry cannot resolve yet are kept untouched.
         * @param {AppFacade} app
         */
        normalizePending(app: AppFacade): void;
        /**
         * Drops the retained intent for that slot: an explicit command that took effect
         * supersedes it. Addresses the same effective slot, so a shared monitor's
         * numbered workspaces are the one target they are.
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {number} wsIndex
         */
        dropIntent(app: AppFacade, monitorIndex: number, wsIndex: number): void;
        /**
         * Whether a RETAINED pause covers that monitor+workspace. An automatic retile
         * must not place windows against the user's last command just because the
         * stored setting still says `auto` — the retained command is what the user
         * asked for last, and it is applied as soon as it can be written.
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {number} wsIndex
         * @returns {boolean}
         */
        holdsPause(app: AppFacade, monitorIndex: number, wsIndex: number): boolean;
        /**
         * Rolls back an App whose asynchronous start failed: the observer set, the
         * hotkeys and the timers of a half-started App must not outlive their use — a
         * hotkey that addresses a registry nobody watches, a settle wait that would
         * retile into a torn-down App, a registry that still reports ready. The App's
         * resources go and its registry flag is cleared, whatever failed (observers,
         * a queued auto command, the settle wait).
         *
         * Synchronous by design: the caller is the monitor-ready reply, which ends
         * with this callback (Monitors.refresh calls onReady as its last statement),
         * so nothing of that component runs after the App is torn down.
         *
         * The App SHELL stays referenced until the next recreation, so the session has
         * a single owner for it and no dangling timer holds a freed object; it is
         * inert — its hotkeys are unregistered, its handlers released, its registry
         * flag cleared, and its settle wait expires silently (Settle.isLive).
         * @param {AppFacade} app
         */
        rollbackApp(app: AppFacade): void;
        destroy(): void;
        /** Session teardown is also the end of the exclusion lifetime. */
        _releaseExclusions(): void;
    };
};
/**
 * Settle wait after a monitor change: Muffin can take several seconds to move windows
 * to their new monitors. The retile runs once, 2 s after the last monitor change or
 * window-entered-monitor event, at the latest 15 s after the first change. The timer
 * is managed as an explicit id (not on the scope): it is replaced and removed
 * mid-life, which the scope's release-everything model does not support.
 */
export type SettleDeps = {
    /**
     * mainloop backend
     */
    mainloop: AnyRecord;
    /**
     * clock, Date.now in production
     */
    now: () => number;
    /**
     * global.log
     */
    log: (msg: string) => void;
    /**
     * the fanned-out retile, auto.settleAll
     */
    onSettled: (app: AppFacade) => void;
    /**
     * whether that App is still the live one
     */
    isLive: (app: AppFacade) => boolean;
};
/**
 * Session owner: runs the App create/recreate/destroy flow and carries what
 * must outlive an App recreation. Deps are all injected: signalManager (fresh,
 * this scope alone), layoutManager (Main.layoutManager), mainloop, gobject
 * (imports.gi.GObject, activates the scope's vendor guard for GObject targets),
 * now, log, onSettled, createApp.
 */
export type SessionDeps = {
    /**
     * fresh, this scope alone
     */
    signalManager: AnyRecord;
    /**
     * Main.layoutManager
     */
    layoutManager: AnyRecord;
    /**
     * mainloop backend
     */
    mainloop: AnyRecord;
    /**
     * imports.gi.GObject
     */
    gobject: AnyRecord;
    /**
     * clock, Date.now in production
     */
    now: () => number;
    /**
     * global.log
     */
    log: (msg: string) => void;
    /**
     * the fanned-out retile, auto.settleAll
     */
    onSettled: (app: AppFacade) => void;
    /**
     * builds the App on this session
     */
    createApp: (session: {
        _deps: SessionDeps;
        _scope: any;
        settle: {
            _mainloop: AnyRecord;
            _now: () => number;
            _log: (msg: string) => void;
            _onSettled: (app: AppFacade) => void;
            _isLive: (app: AppFacade) => boolean;
            _timer: number;
            pending: boolean;
            started: number;
            /**
             * @param {AppFacade} app
             */
            start(app: AppFacade): void;
            /**
             * A monitor change destroys the App while the settle wait may be running; keep its
             * start time then, so the 15 s limit counts from the first change, not the last.
             */
            teardown(): void;
            /**
             * Config boot after an App recreation: the wait restarts once for the change that
             * routed through the recreation.
             * @param {AppFacade} app
             */
            consumePending(app: AppFacade): void;
            destroy(): void;
        };
        /** @type {AppFacade | null} */
        _rolledBack: AppFacade | null;
        monitorFallbackLogged: boolean;
        /** @type {Array<{monitorIndex: number, wsIndex: number, auto: boolean}>} */
        pendingAuto: {
            monitorIndex: number;
            wsIndex: number;
            auto: boolean;
        }[];
        splitCorruptLogged: boolean;
        layoutsWriteGuardLogged: boolean;
        accentGenSeq: number;
        panelSaved: any;
        exclToggles: Map<any, any>;
        exclWatches: Map<any, any>;
        /** @type {Set<string>} */
        orderUsed: Set<string>;
        /** @type {any} */ app: any;
        _destroyed: boolean;
        /**
         * The next accent generation class for the theme component's stylesheet load.
         */
        nextAccentGen(): string;
        /** Creates the App and connects the monitors-changed recreate handler. */
        start(): void;
        /**
         * Whether that App is the live, fully started one — a rolled back shell is not.
         * @param {AppFacade} app
         */
        _isLive(app: AppFacade): boolean;
        /**
         * The storage slot an auto command addresses: the monitor key plus the
         * EFFECTIVE workspace key. On a monitor whose workspaces live on the primary
         * only, every numbered workspace resolves to the same alias — one slot, one
         * intent — so two commands for different numbered workspaces are the same
         * command there. Null while the registry cannot resolve it yet.
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {number} wsIndex
         * @returns {string | null}
         */
        intentSlot(app: AppFacade, monitorIndex: number, wsIndex: number): string | null;
        /**
         * Whether two auto commands address the same slot — the same storage entry, or
         * the same numbered pair while the registry cannot resolve the effective key.
         * @param {AppFacade} app
         * @param {number} aMonitor
         * @param {number} aWs
         * @param {number} bMonitor
         * @param {number} bWs
         * @returns {boolean}
         */
        sameSlot(app: AppFacade, aMonitor: number, aWs: number, bMonitor: number, bWs: number): boolean;
        /**
         * Collapses the retained queue to ONE intent per effective slot, keeping the
         * NEWEST (last pressed). The queue is built before the registry can resolve the
         * effective key, so two numbered workspaces of a shared monitor ('*') can both
         * sit in it for the same storage entry; every read and every application of the
         * queue normalizes first, so the newest command is the one that survives.
         * Entries the registry cannot resolve yet are kept untouched.
         * @param {AppFacade} app
         */
        normalizePending(app: AppFacade): void;
        /**
         * Drops the retained intent for that slot: an explicit command that took effect
         * supersedes it. Addresses the same effective slot, so a shared monitor's
         * numbered workspaces are the one target they are.
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {number} wsIndex
         */
        dropIntent(app: AppFacade, monitorIndex: number, wsIndex: number): void;
        /**
         * Whether a RETAINED pause covers that monitor+workspace. An automatic retile
         * must not place windows against the user's last command just because the
         * stored setting still says `auto` — the retained command is what the user
         * asked for last, and it is applied as soon as it can be written.
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {number} wsIndex
         * @returns {boolean}
         */
        holdsPause(app: AppFacade, monitorIndex: number, wsIndex: number): boolean;
        /**
         * Rolls back an App whose asynchronous start failed: the observer set, the
         * hotkeys and the timers of a half-started App must not outlive their use — a
         * hotkey that addresses a registry nobody watches, a settle wait that would
         * retile into a torn-down App, a registry that still reports ready. The App's
         * resources go and its registry flag is cleared, whatever failed (observers,
         * a queued auto command, the settle wait).
         *
         * Synchronous by design: the caller is the monitor-ready reply, which ends
         * with this callback (Monitors.refresh calls onReady as its last statement),
         * so nothing of that component runs after the App is torn down.
         *
         * The App SHELL stays referenced until the next recreation, so the session has
         * a single owner for it and no dangling timer holds a freed object; it is
         * inert — its hotkeys are unregistered, its handlers released, its registry
         * flag cleared, and its settle wait expires silently (Settle.isLive).
         * @param {AppFacade} app
         */
        rollbackApp(app: AppFacade): void;
        destroy(): void;
        /** Session teardown is also the end of the exclusion lifetime. */
        _releaseExclusions(): void;
    }) => {
        destroy(): void;
    };
};

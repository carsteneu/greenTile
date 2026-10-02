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
 * @property {(app: AppFacade) => void} onSettled the fanned-out retile, autoScheduleAll
 */
export const Settle: {
    new (deps: SettleDeps): {
        _mainloop: AnyRecord;
        _now: () => number;
        _log: (msg: string) => void;
        _onSettled: (app: AppFacade) => void;
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
 * @property {(app: AppFacade) => void} onSettled the fanned-out retile, autoScheduleAll
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
        monitorFallbackLogged: boolean;
        splitCorruptLogged: boolean;
        layoutsWriteGuardLogged: boolean;
        accentGenSeq: number;
        accentCss: string;
        panelSaved: any;
        exclToggles: Map<any, any>;
        exclWatches: Map<any, any>;
        /** @type {any} */ app: any;
        _destroyed: boolean;
        /**
         * The next accent generation class for the theme component's stylesheet load.
         */
        nextAccentGen(): string;
        /** Creates the App and connects the monitors-changed recreate handler. */
        start(): void;
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
     * the fanned-out retile, autoScheduleAll
     */
    onSettled: (app: AppFacade) => void;
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
     * the fanned-out retile, autoScheduleAll
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
        monitorFallbackLogged: boolean;
        splitCorruptLogged: boolean;
        layoutsWriteGuardLogged: boolean;
        accentGenSeq: number;
        accentCss: string;
        panelSaved: any;
        exclToggles: Map<any, any>;
        exclWatches: Map<any, any>;
        /** @type {any} */ app: any;
        _destroyed: boolean;
        /**
         * The next accent generation class for the theme component's stylesheet load.
         */
        nextAccentGen(): string;
        /** Creates the App and connects the monitors-changed recreate handler. */
        start(): void;
        destroy(): void;
        /** Session teardown is also the end of the exclusion lifetime. */
        _releaseExclusions(): void;
    }) => {
        destroy(): void;
    };
};

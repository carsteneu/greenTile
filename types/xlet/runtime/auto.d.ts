// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
/**
 * @typedef {Object} AutoDeps
 * @property {AnyRecord} mainloop imports.mainloop
 * @property {AnyRecord} meta imports.gi.Meta
 * @property {AnyRecord} main imports.ui.main
 * @property {AnyRecord} global the Cinnamon global object
 * @property {AnyRecord} signalManager fresh, this scope alone
 * @property {AnyRecord} gobject imports.gi.GObject
 * @property {() => CinnamonWindow | null} focusWindow
 * @property {() => number} focusMonitorIndex
 * @property {(app: AppFacade, monitorIndex: number, wsIndex: number) => { auto: boolean }} layoutFor
 * @property {(app: AppFacade, monitorIndex: number, wsIndex: number, patch: {}) => void} layoutSet
 * @property {(app: AppFacade, monitorIndex: number, focused: CinnamonWindow | null) => void} retileMonitor
 * @property {() => void} borderUpdate
 * @property {(op: string) => boolean} grabIsResize
 * @property {(app: AppFacade, w: CinnamonWindow, op: string) => boolean} dropBegin
 * @property {(app: AppFacade, w: CinnamonWindow, op: string) => boolean} dropEnd
 * @property {() => void} dropStop
 * @property {(app: AppFacade, w: CinnamonWindow, op: string) => void} resizeEnd
 */
export const Auto: {
    new (deps: AutoDeps): {
        _deps: AutoDeps;
        _mainloop: AnyRecord;
        _meta: AnyRecord;
        _main: AnyRecord;
        _global: AnyRecord;
        _scope: any;
        _overrides: Map<any, any>;
        _timers: Map<any, any>;
        _pending: Map<any, any>;
        _lastMonitor: Map<any, any>;
        _grabMonitor: Map<any, any>;
        _resizeStart: Map<any, any>;
        /** @type {Array<[AnyRecord, number, number]>} */
        _workspaceSignals: Array<[AnyRecord, number, number]>;
        /** @type {Array<[CinnamonWindow, number, number, number]>} */
        _tracked: Array<[CinnamonWindow, number, number, number]>;
        /**
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {number} ms
         */
        scheduleMonitor(app: AppFacade, monitorIndex: number, ms: number): void;
        /**
         * @param {AppFacade} app
         * @param {number} ms
         */
        scheduleAll(app: AppFacade, ms: number): void;
        /**
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @returns {boolean}
         */
        _monitorWritable(app: AppFacade, monitorIndex: number): boolean;
        /**
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {number} wsIndex
         * @param {boolean} auto
         */
        _deferAuto(app: AppFacade, monitorIndex: number, wsIndex: number, auto: boolean): void;
        /**
         * Applies the auto on/off commands queued before the registry was ready —
         * called by the monitor-ready callback after connectAll and before the settle
         * retile, so no automatic tiling runs against a requested pause. Each intent
         * leaves the queue only once it is written, so a throw mid-way keeps the rest
         * for the next monitor-ready; an intent whose monitor no longer exists is
         * dropped (there is no key to address it, and nothing ever will be).
         * @param {AppFacade} app
         */
        applyPending(app: AppFacade): void;
        /** @param {AppFacade} app */
        activate(app: AppFacade): void;
        /** @param {AppFacade} app */
        deactivate(app: AppFacade): void;
        /**
         * @param {AppFacade} app
         * @param {AnyRecord} ws
         * @param {CinnamonWindow} w
         */
        onWindowAdded(app: AppFacade, ws: AnyRecord, w: CinnamonWindow): void;
        /**
         * @param {AppFacade} app
         * @param {AnyRecord} ws
         * @param {CinnamonWindow} w
         */
        onWindowRemoved(app: AppFacade, ws: AnyRecord, w: CinnamonWindow): void;
        /**
         * @param {AppFacade} app
         * @param {CinnamonWindow} w
         * @param {string} op
         */
        onGrabBegin(app: AppFacade, w: CinnamonWindow, op: string): void;
        /**
         * @param {AppFacade} app
         * @param {CinnamonWindow} w
         * @param {string} op
         */
        onGrabEnd(app: AppFacade, w: CinnamonWindow, op: string): void;
        /**
         * @param {AppFacade} app
         * @param {CinnamonWindow} w
         */
        onMinimizedNotify(app: AppFacade, w: CinnamonWindow): void;
        /**
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {CinnamonWindow} w
         */
        onEnteredMonitor(app: AppFacade, monitorIndex: number, w: CinnamonWindow): void;
        /** @param {CinnamonWindow} w */
        _windowOk(w: CinnamonWindow): boolean;
        /** @param {any[]} args */
        _anyWindow(args: any[]): any;
        /** @param {CinnamonWindow} w */
        _untrack(w: CinnamonWindow): void;
        /**
         * @param {AppFacade} app
         * @param {CinnamonWindow} w
         */
        trackWindow(app: AppFacade, w: CinnamonWindow): void;
        _disconnectWorkspaces(): void;
        /**
         * @param {AppFacade} app
         * @param {AnyRecord} ws
         */
        _connectWorkspace(app: AppFacade, ws: AnyRecord): void;
        /** @param {AppFacade} app */
        connectAll(app: AppFacade): void;
        /** @param {AppFacade} app */
        _connectAll(app: AppFacade): void;
        /**
         * Releases every acquisition connectAll made and rebuilds the scope, leaving
         * the component exactly as it was before the attempt.
         */
        _rollbackConnectAll(): void;
        /** @param {number} monitorIndex */
        pendingTake(monitorIndex: number): any;
        /**
         * @param {number} seq
         */
        pendingForget(seq: number): void;
        /** @param {number} seq */
        resizeStartTake(seq: number): any;
        /**
         * @param {number} seq
         * @param {Rect} rect
         * @param {number} now
         */
        sortOverride(seq: number, rect: Rect, now: number): void;
        /**
         * @param {number} seq
         * @param {number} now
         */
        sortTake(seq: number, now: number): any;
        /**
         * @param {number} seq
         * @param {number} now
         */
        sortPeek(seq: number, now: number): any;
        /** @param {number} seq */
        sortClear(seq: number): void;
        /** @param {number} now */
        sortPoll(now: number): void;
        destroy(): void;
    };
};
export type AutoDeps = {
    /**
     * imports.mainloop
     */
    mainloop: AnyRecord;
    /**
     * imports.gi.Meta
     */
    meta: AnyRecord;
    /**
     * imports.ui.main
     */
    main: AnyRecord;
    /**
     * the Cinnamon global object
     */
    global: AnyRecord;
    /**
     * fresh, this scope alone
     */
    signalManager: AnyRecord;
    /**
     * imports.gi.GObject
     */
    gobject: AnyRecord;
    focusWindow: () => CinnamonWindow | null;
    focusMonitorIndex: () => number;
    layoutFor: (app: AppFacade, monitorIndex: number, wsIndex: number) => {
        auto: boolean;
    };
    layoutSet: (app: AppFacade, monitorIndex: number, wsIndex: number, patch: {}) => void;
    retileMonitor: (app: AppFacade, monitorIndex: number, focused: CinnamonWindow | null) => void;
    borderUpdate: () => void;
    grabIsResize: (op: string) => boolean;
    dropBegin: (app: AppFacade, w: CinnamonWindow, op: string) => boolean;
    dropEnd: (app: AppFacade, w: CinnamonWindow, op: string) => boolean;
    dropStop: () => void;
    resizeEnd: (app: AppFacade, w: CinnamonWindow, op: string) => void;
};

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
 * @property {(app: AppFacade, monitorIndex: number, wsIndex: number, patch: {}) => boolean} layoutSet
 * @property {(app: AppFacade, monitorIndex: number, focused: CinnamonWindow | null, animate?: boolean, wsIndex?: number | null, actionLayout?: Layout | null, settle?: boolean) => void} retileMonitor
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
        _destroyed: boolean;
        _pending: Map<any, any>;
        _lastMonitor: Map<any, any>;
        _grabMonitor: Map<any, any>;
        _resizeStart: Map<any, any>;
        /** @type {Array<[AnyRecord, number, number]>} */
        _workspaceSignals: Array<[AnyRecord, number, number]>;
        /** @type {Array<[CinnamonWindow, number, number, number]>} */
        _tracked: Array<[CinnamonWindow, number, number, number]>;
        _switchTimer: number;
        /** @type {Map<string, {fn: (opts: AnyRecord) => void, opts: AnyRecord}>} */
        _afterSwitch: Map<string, {
            fn: (opts: AnyRecord) => void;
            opts: AnyRecord;
        }>;
        _holdSince: number;
        _pressSeq: number;
        /**
         * Whether the shell's workspace-switch effect may still own the window actors
         * (see SWITCH_EFFECT_MS): a frame moved now would be drawn at its old place.
         * @returns {boolean}
         */
        switching(): boolean;
        /**
         * Runs `fn(opts)` now, or — while the switch effect runs — once it ended. One held
         * run per key: a newer request for the same key replaces the older one and moves
         * to the end, so the held runs replay in the order of their newest request (the
         * settle fan-out relies on the active surface being placed last). Options of the
         * replaced request survive where the newer one leaves them empty: an option the
         * newer request sets to null, undefined or false takes the older value, so a
         * settle or an explicit arrangement is never lost to a plain retile.
         * @param {string} key the surface (monitor and workspace)
         * @param {(opts: AnyRecord) => void} fn
         * @param {AnyRecord} [opts]
         */
        afterSwitch(key: string, fn: (opts: AnyRecord) => void, opts?: AnyRecord): void;
        /**
         * A key press that reads or moves tiled geometry: run now, or — inside the switch
         * effect — queued behind every held retile, in press order. The surfaces it reads
         * are only settled once the held retiles ran; a press answered from the frames
         * before that lands one cell off, or arranges against a placement record of the
         * wrong count.
         * @param {() => void} fn
         */
        afterSwitchPress(fn: () => void): void;
        /** @returns {boolean} */
        _effectRunning(): boolean;
        _monotonicMs(): number;
        _noteSwitch(): void;
        /**
         * Opens (or restarts) the hold: the first look after `ms`.
         * @param {number} ms
         */
        _openHold(ms: number): void;
        /**
         * @param {number} ms the wait before the next look
         * @param {number} elapsed the time the hold has lasted once that wait is over
         */
        _armSwitchEnd(ms: number, elapsed: number): void;
        /**
         * Puts runs of a finished hold behind the ones a new hold collected meanwhile. A
         * key held in both keeps the NEWER run and its options win; the older options fill
         * in what it leaves empty (the afterSwitch merge rule, applied in time order).
         * @param {Array<[string, {fn: (opts: AnyRecord) => void, opts: AnyRecord}]>} rest
         */
        _rehold(rest: Array<[string, {
            fn: (opts: AnyRecord) => void;
            opts: AnyRecord;
        }]>): void;
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
         * The settle fan-out: by the time the settle wait expires Muffin has moved the
         * windows of EVERY workspace — a Cinnamon restart re-manages them all, a monitor
         * change parks them on the remaining monitor and moves them back — so the settle
         * must place every workspace greenTile tiles, not only the active one. Otherwise
         * a background workspace stays where Muffin left it until the user visits it.
         * The active workspace keeps the debounced path (it applies a retained intent
         * first and animates); the background workspaces are placed right here, without
         * animation. A paused workspace stays untouched: the retile gates on autoAllowed.
         * On a monitor whose workspaces live on the primary only, every numbered
         * workspace resolves to the same surface: it is placed once.
         * @param {AppFacade} app
         */
        settleAll(app: AppFacade): void;
        /**
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @returns {boolean}
         */
        _monitorWritable(app: AppFacade, monitorIndex: number): boolean;
        /**
         * Stores an auto on/off command for its monitor+workspace slot, newest wins: the
         * intent already retained for the slot is dropped, the new one appended. The one
         * enqueue path — reached both when the registry cannot address the target yet and
         * when the layout guard refused the write (a corrupt layouts setting). The queue
         * stays bounded by the monitor/workspace count, so a held hotkey cannot grow it.
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {number} wsIndex
         * @param {boolean} auto
         */
        _retainAuto(app: AppFacade, monitorIndex: number, wsIndex: number, auto: boolean): void;
        /**
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {number} wsIndex
         * @param {boolean} auto
         */
        _deferAuto(app: AppFacade, monitorIndex: number, wsIndex: number, auto: boolean): void;
        /**
         * The retained intent for that monitor+workspace, if any.
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {number} wsIndex
         * @returns {{monitorIndex: number, wsIndex: number, auto: boolean} | undefined}
         */
        _pendingIntent(app: AppFacade, monitorIndex: number, wsIndex: number): {
            monitorIndex: number;
            wsIndex: number;
            auto: boolean;
        } | undefined;
        /**
         * Drops the retained intent for that key: an explicit command that took effect
         * (or a newer explicit command) supersedes it, one per monitor+workspace.
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {number} wsIndex
         */
        _dropIntent(app: AppFacade, monitorIndex: number, wsIndex: number): void;
        /**
         * Retains an intent the layout guard REFUSED (a corrupt layouts setting): the
         * newest explicit command is the pending one, so it replaces any older one and
         * is applied once the setting can take it.
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {number} wsIndex
         * @param {boolean} auto
         */
        _holdRefused(app: AppFacade, monitorIndex: number, wsIndex: number, auto: boolean): void;
        /**
         * Applies an explicit auto on/off command: writes it when the registry can
         * address the monitor, then drops the retained intent for that slot — removed
         * ONLY once the write actually landed, so a refused write (a corrupt layouts
         * setting) leaves the intent in place. The one successful-write/removal path.
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {number} wsIndex
         * @param {boolean} auto
         * @returns {boolean} whether the command was written
         */
        _applyAuto(app: AppFacade, monitorIndex: number, wsIndex: number, auto: boolean): boolean;
        /**
         * Applies a retained intent that outranks the stored setting — one held while
         * the layouts setting was corrupt — and reports whether an automatic retile may
         * proceed for that monitor+workspace. A retained PAUSE that still cannot be
         * written returns false: the stored `auto` would otherwise place windows
         * against the user's last command.
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {number} wsIndex
         * @returns {boolean}
         */
        _applyOrHonorPending(app: AppFacade, monitorIndex: number, wsIndex: number): boolean;
        /**
         * Applies the auto on/off commands queued before the registry was ready —
         * called by the monitor-ready callback after connectAll and before the settle
         * retile, so no automatic tiling runs against a requested pause. Each intent
         * leaves the queue only once the layout write actually happened, so a throw
         * mid-way (or a refusal by the layout guard, e.g. a corrupt layouts setting)
         * keeps it queued for the next monitor-ready; an intent whose monitor no
         * longer exists is dropped (there is no key to address it, and nothing ever
         * will be).
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
         * Releases every acquisition connectAll made and rebuilds the scope.
         * @returns {boolean} whether the release was clean (the scope's signal manager
         *   is empty again), i.e. whether a retry may safely re-register
         */
        _rollbackConnectAll(): boolean;
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
    layoutSet: (app: AppFacade, monitorIndex: number, wsIndex: number, patch: {}) => boolean;
    retileMonitor: (app: AppFacade, monitorIndex: number, focused: CinnamonWindow | null, animate?: boolean, wsIndex?: number | null, actionLayout?: Layout | null, settle?: boolean) => void;
    borderUpdate: () => void;
    grabIsResize: (op: string) => boolean;
    dropBegin: (app: AppFacade, w: CinnamonWindow, op: string) => boolean;
    dropEnd: (app: AppFacade, w: CinnamonWindow, op: string) => boolean;
    dropStop: () => void;
    resizeEnd: (app: AppFacade, w: CinnamonWindow, op: string) => void;
};

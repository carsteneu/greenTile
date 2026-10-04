// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
export const SPLIT_FLUSH_MS: number;
/**
 * Split runtime: pending split writes, flush timer, resize-hotkey
 * acceleration and the cached keyboard repeat settings. Deps (all injected):
 * mainloop (imports.mainloop), glib (imports.gi.GLib), gio (imports.gi.Gio),
 * global (the global object), main (imports.ui.main — layoutManager),
 * focusWindow, layoutFor, layoutShape, layoutSet, collectWindows,
 * usableArea, gap, retileMonitor, grabOpName.
 * @typedef {Object} SplitDeps
 * @property {AnyRecord} mainloop imports.mainloop
 * @property {AnyRecord} glib imports.gi.GLib
 * @property {AnyRecord} gio imports.gi.Gio
 * @property {AnyRecord} global the global object
 * @property {AnyRecord} main imports.ui.main — layoutManager
 * @property {() => CinnamonWindow | null} focusWindow
 * @property {(app: AppFacade, monitorIndex: number, wsIndex: number) => { preset: Preset | null, auto: boolean }} layoutFor
 * @property {(app: AppFacade, monitorIndex: number, windowCount: number) => DragLayout | null} layoutShape
 * @property {(app: AppFacade, monitorIndex: number, wsIndex: number, patch: {}) => void} layoutSet
 * @property {(monitor: CinnamonMonitor, focus: CinnamonWindow | null, ws?: number | null) => CinnamonWindow[]} collectWindows
 * @property {(monitor: CinnamonMonitor) => Rect} usableArea
 * @property {(app: AppFacade) => number} gap
 * @property {(app: AppFacade, monitorIndex: number, focused: CinnamonWindow | null, animate?: boolean, wsIndex?: number | null) => void} retileMonitor
 * @property {(op: string) => string} grabOpName
 */
export const Split: {
    new (deps: SplitDeps): {
        _deps: SplitDeps;
        _mainloop: AnyRecord;
        _glib: AnyRecord;
        _gio: AnyRecord;
        _global: AnyRecord;
        _main: AnyRecord;
        _pending: Map<any, any>;
        _flushTimer: {
            id: number;
        };
        /** @type {{ state: AccelState | null }} */
        keys: {
            state: AccelState | null;
        };
        _keyboardSettings: any;
        /**
         * Pending-write key parts for the monitor + workspace + window count.
         * null when the monitor has no key (unknown monitor).
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {number} wsIndex
         * @param {number} n
         * @returns {{ key: string, mkey: string, wskey: string, n: string } | null}
         */
        ref(app: AppFacade, monitorIndex: number, wsIndex: number, n: number): {
            key: string;
            mkey: string;
            wskey: string;
            n: string;
        } | null;
        /**
         * Stored split for the layout when it fits (kind, shape), null otherwise. Read-time
         * effective geometry: the returned split is corrected to keep the promised minimum
         * in FINAL (post gap) frames when the usable area allows it (legacy narrow borders,
         * a raised gap, a shrunken monitor) — stored and pending values stay untouched, so
         * restoring the original conditions restores the original placement.
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {number} wsIndex
         * @param {number} n
         * @param {Layout} layout
         * @returns {SplitShape | null}
         */
        for(app: AppFacade, monitorIndex: number, wsIndex: number, n: number, layout: Layout): SplitShape | null;
        /**
         * Writes all pending splits into the layouts setting and stops the flush
         * timer. Never overwrites a corrupt layouts setting.
         * @param {AppFacade} app
         */
        flush(app: AppFacade): void;
        /**
         * Stores a pending split write; debounced by the 500 ms flush timer unless
         * flushNow.
         * @param {AppFacade} app
         * @param {{ key: string, mkey: string, wskey: string, n: string }} ref
         * @param {SplitShape} split
         * @param {boolean} flushNow
         */
        remember(app: AppFacade, ref: {
            key: string;
            mkey: string;
            wskey: string;
            n: string;
        }, split: SplitShape, flushNow: boolean): void;
        /**
         * A split that the hotkeys have not yet written expires: a drop on the same
         * monitor + workspace + window count stores its shape and a stale pending
         * split would win over it on the next read.
         * @param {string} refKey
         */
        forget(refKey: string): void;
        /**
         * Drops every deferred split write and its flush timer. An external write of
         * the layouts setting (the settings dialog's reset, an import — or its save
         * of a whole stale copy) is authoritative: flush() re-reads the setting and
         * would otherwise merge the splits computed against the old value back in.
         * The accel state is untouched, so a held resize key keeps accelerating.
         */
        invalidate(): void;
        /** Removes the armed flush timer, if any (its source may already be gone). */
        _dropFlushTimer(): void;
        /**
         * true when the monitor + workspace has stored (or pending) splits or dragged shapes —
         * shows the reset button
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {number} wsIndex
         * @returns {boolean}
         */
        any(app: AppFacade, monitorIndex: number, wsIndex: number): boolean;
        /**
         * Removes pending splits and stored splits/shapes of the
         * monitor + workspace.
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {number} wsIndex
         */
        reset(app: AppFacade, monitorIndex: number, wsIndex: number): void;
        /**
         * Keyboard repeat delay for the hotkey acceleration: the desktop's repeat delay
         * plus margin, 600 ms as the fallback when the schema is unreadable.
         * @returns {number}
         */
        repeatThreshold(): number;
        /**
         * Resize hotkeys (Super+Alt+arrows): move a border of the focused window's cell. A tap
         * moves 1 px, holding the key accelerates (splitAccel). Retiles without animation
         * at every step; the split is written 500 ms after the last step.
         * @param {AppFacade} app
         * @param {string} action
         */
        hotkey(app: AppFacade, action: string): void;
        /**
         * Edge resize of a tiled window (mouse or window menu): the moved edges become the new
         * borders of the layout (lib/model/split.js), stored for this monitor, workspace and
         * window count; the neighbours follow in the retile. Edges on the monitor border have
         * no neighbour: the window snaps back. With automatic tiling off it stays a free resize.
         * @param {AppFacade} app
         * @param {CinnamonWindow} w
         * @param {string} op
         */
        onResizeEnd(app: AppFacade, w: CinnamonWindow, op: string): void;
        /** Stops the flush timer and drops all pending writes. */
        destroy(): void;
    };
};
/**
 * Split runtime: pending split writes, flush timer, resize-hotkey
 * acceleration and the cached keyboard repeat settings. Deps (all injected):
 * mainloop (imports.mainloop), glib (imports.gi.GLib), gio (imports.gi.Gio),
 * global (the global object), main (imports.ui.main — layoutManager),
 * focusWindow, layoutFor, layoutShape, layoutSet, collectWindows,
 * usableArea, gap, retileMonitor, grabOpName.
 */
export type SplitDeps = {
    /**
     * imports.mainloop
     */
    mainloop: AnyRecord;
    /**
     * imports.gi.GLib
     */
    glib: AnyRecord;
    /**
     * imports.gi.Gio
     */
    gio: AnyRecord;
    /**
     * the global object
     */
    global: AnyRecord;
    /**
     * imports.ui.main — layoutManager
     */
    main: AnyRecord;
    focusWindow: () => CinnamonWindow | null;
    layoutFor: (app: AppFacade, monitorIndex: number, wsIndex: number) => {
        preset: Preset | null;
        auto: boolean;
    };
    layoutShape: (app: AppFacade, monitorIndex: number, windowCount: number) => DragLayout | null;
    layoutSet: (app: AppFacade, monitorIndex: number, wsIndex: number, patch: {}) => void;
    collectWindows: (monitor: CinnamonMonitor, focus: CinnamonWindow | null, ws?: number | null) => CinnamonWindow[];
    usableArea: (monitor: CinnamonMonitor) => Rect;
    gap: (app: AppFacade) => number;
    retileMonitor: (app: AppFacade, monitorIndex: number, focused: CinnamonWindow | null, animate?: boolean, wsIndex?: number | null) => void;
    grabOpName: (op: string) => string;
};

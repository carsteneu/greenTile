// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
export const SPLIT_FLUSH_MS: number;
/**
 * Split runtime: pending split writes, flush timer, resize-hotkey
 * acceleration and the cached keyboard repeat settings. Deps (all injected):
 * mainloop (imports.mainloop), glib (imports.gi.GLib), gio (imports.gi.Gio),
 * global (the global object), main (imports.ui.main — layoutManager),
 * focusWindow, layoutFor, layoutShape, layoutSet, collectWindows,
 * usableArea, gap, retileMonitor, grabOpName, sortReadingOrder.
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
 * @property {(app: AppFacade, windows: CinnamonWindow[], columnMajor: boolean, consume?: boolean) => CinnamonWindow[]} sortReadingOrder
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
        _mins: Map<any, any>;
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
         * Valid manual size intent at this count, including its original kind/shape.
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {number} wsIndex
         * @param {number} n
         * @returns {SplitShape | null}
         */
        manual(app: AppFacade, monitorIndex: number, wsIndex: number, n: number): SplitShape | null;
        /**
         * Stored split for the shape it has to describe (kind, shape), null when the
         * stored value does not. Called with the NOMINAL shape by for(), and with the
         * EFFECTIVE shape by fit(): an arrangement regrouped to fewer columns is a
         * different shape, and a resize the user made on it is stored in that shape — it
         * has to be read back against exactly that shape, or it would be dropped and the
         * user's stored split destroyed.
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {number} wsIndex
         * @param {number} n
         * @param {'cols'|'rows'} kind
         * @param {readonly number[]} shape
         * @returns {SplitShape | null}
         */
        _stored(app: AppFacade, monitorIndex: number, wsIndex: number, n: number, kind: "cols" | "rows", shape: readonly number[]): SplitShape | null;
        /**
         * Records the arrangement that was actually PLACED for a (monitor, workspace, window
         * count): its kind/shape/split, the IDENTITY of the windows in placement order, and
         * the cell minima the placement observed. REPLACED, never merged — the entry only
         * ever describes the most recent placement, so nothing needs invalidating.
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {number} wsIndex
         * @param {number} n
         * @param {{kind: 'cols'|'rows', shape: number[], split: Split | null, seqs: number[], mins: Array<{seq: number, w: number, h: number}>}} entry
         */
        setPlacement(app: AppFacade, monitorIndex: number, wsIndex: number, n: number, entry: {
            kind: "cols" | "rows";
            shape: number[];
            split: Split | null;
            seqs: number[];
            mins: Array<{
                seq: number;
                w: number;
                h: number;
            }>;
        }): void;
        /**
         * The recorded arrangement when it describes EXACTLY these windows in this order,
         * null otherwise. The identity check is the point: a window closed and replaced at
         * the same count must not inherit the predecessor's arrangement or its minimum.
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {number} wsIndex
         * @param {number} n
         * @param {CinnamonWindow[]} ordered
         * @returns {FittedLayout | null}
         */
        placementFor(app: AppFacade, monitorIndex: number, wsIndex: number, n: number, ordered: CinnamonWindow[]): FittedLayout | null;
        /**
         * Cell minima of the recorded placement, mapped to the requested windows BY IDENTITY:
         * a window carries its own observed minimum wherever it sits in the arrangement, so a
         * proposal that reorders the windows still sees the genuine refusals — and a window
         * that is not in the record (a fresh one, or a closed window's replacement) gets zero
         * instead of inheriting someone else's. The order deliberately does NOT have to match:
         * only the read-side geometry needs a record in one specific order.
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {number} wsIndex
         * @param {number} n
         * @param {CinnamonWindow[]} ordered
         * @returns {Array<{w: number, h: number}>}
         */
        minsFor(app: AppFacade, monitorIndex: number, wsIndex: number, n: number, ordered: CinnamonWindow[]): Array<{
            w: number;
            h: number;
        }>;
        /**
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {number} wsIndex
         * @param {number} n
         * @param {CinnamonWindow[]} ordered
         * @returns {{kind: 'cols'|'rows', shape: number[], split: Split | null, seqs: number[], mins: Array<{seq: number, w: number, h: number}>} | null}
         */
        _entry(app: AppFacade, monitorIndex: number, wsIndex: number, n: number, ordered: CinnamonWindow[]): {
            kind: "cols" | "rows";
            shape: number[];
            split: Split | null;
            seqs: number[];
            mins: Array<{
                seq: number;
                w: number;
                h: number;
            }>;
        } | null;
        /**
         * Effective arrangement for the ordered windows of a layout: the arrangement the last
         * placement under this key ACTUALLY produced, when that placement describes exactly
         * these windows. Consumers therefore read the real geometry — a placement made from a
         * different layout (the column hotkey can fall back to 'cols' while the automatic
         * layout is 'rows') can never be mistaken for one the consumer would have derived from
         * its own nominal layout. Without a matching record the plain equal division of the
         * nominal layout is used, never a guess about minima.
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {number} wsIndex
         * @param {number} n
         * @param {Layout} layout
         * @param {CinnamonWindow[]} ordered
         * @returns {FittedLayout}
         */
        effective(app: AppFacade, monitorIndex: number, wsIndex: number, n: number, layout: Layout, ordered: CinnamonWindow[]): FittedLayout;
        /**
         * The arrangement for explicit cell minima — what placeFit re-runs on as it gathers
         * the evidence of its own placements. The effective shape is decided BEFORE the
         * stored split is read, so a resize the user made on a regrouped arrangement is
         * read back against exactly that shape rather than being dropped.
         * @param {AppFacade} app
         * @param {number} monitorIndex
         * @param {number} wsIndex
         * @param {number} n
         * @param {Layout} layout
         * @param {Array<{w: number, h: number}>} mins
         * @param {Rect} area
         * @param {number} gap
         * @returns {FittedLayout}
         */
        fit(app: AppFacade, monitorIndex: number, wsIndex: number, n: number, layout: Layout, mins: Array<{
            w: number;
            h: number;
        }>, area: Rect, gap: number): FittedLayout;
        /**
         * Minimum final frame size of the two parts either side of the border an edge of
         * cell idx belongs to. The floor comes from the minima the last placement observed,
         * so a border already sitting on a window's real minimum stays exactly where it is
         * instead of creeping outward. Each side keeps its OWN gap inset on the split axis;
         * the greenTile floor is a target and stays the legacy 120 px plus one full gap.
         * @param {'cols'|'rows'} kind
         * @param {readonly number[]} shape
         * @param {Array<{w: number, h: number}>} mins
         * @param {number} idx
         * @param {string} edge
         * @param {number} gap
         * @returns {[number, number]}
         */
        _edgeMins(kind: "cols" | "rows", shape: readonly number[], mins: Array<{
            w: number;
            h: number;
        }>, idx: number, edge: string, gap: number): [number, number];
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
 * usableArea, gap, retileMonitor, grabOpName, sortReadingOrder.
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
    sortReadingOrder: (app: AppFacade, windows: CinnamonWindow[], columnMajor: boolean, consume?: boolean) => CinnamonWindow[];
};

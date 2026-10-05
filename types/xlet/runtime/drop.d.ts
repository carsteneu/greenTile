// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
/**
 * @typedef {Object} DropDeps
 * @property {AnyRecord} meta imports.gi.Meta
 * @property {AnyRecord} main imports.ui.main — uiGroup
 * @property {AnyRecord} global the Cinnamon global object
 * @property {AnyRecord} mainloop imports.mainloop
 * @property {AnyRecord} st imports.gi.St
 * @property {(w: CinnamonWindow) => boolean} excludeCheck
 * @property {(monitor: CinnamonMonitor, focus: CinnamonWindow | null, ws?: number) => CinnamonWindow[]} collectWindows
 * @property {(app: AppFacade, monitorIndex: number, windowCount: number) => Layout | null} layoutShape
 * @property {(app: AppFacade, monitorIndex: number, wsIndex: number, patch: {}) => void} layoutSet
 * @property {(monitor: CinnamonMonitor) => Rect} usableArea
 * @property {(app: AppFacade) => number} gap
 * @property {(app: AppFacade, wins: CinnamonWindow[], layout: Layout, area: Rect, animate: boolean, monitorIndex: number, wsIndex: number, n: number) => FittedLayout} placeFit
 * @property {() => Rgb} accentRgb
 */
/**
 * Shape a successful target() lookup returns.
 * @typedef {Object} DropTargetHit
 * @property {number} monitorIndex
 * @property {number} n
 * @property {DragLayout} layout
 * @property {CinnamonWindow[]} ordered
 * @property {number} fromIndex
 * @property {number} toIndex
 * @property {'top'|'bottom'|'left'|'right'|'center'} zone
 * @property {{ kind: 'cols' | 'rows', shape: readonly number[], order: number[] } | null} next
 */
export const Drop: {
    new (deps: DropDeps): {
        _deps: DropDeps;
        _meta: AnyRecord;
        _main: AnyRecord;
        _global: AnyRecord;
        _mainloop: AnyRecord;
        /** @type {{ timer: number, actor: AnyRecord | null, seq: number | null, from: number | null, start: Rect | null, w: CinnamonWindow | null, hit: any }} */
        _drop: {
            timer: number;
            actor: AnyRecord | null;
            seq: number | null;
            from: number | null;
            start: Rect | null;
            w: CinnamonWindow | null;
            hit: any;
        };
        stop(): void;
        /**
         * @param {AppFacade} app
         * @param {CinnamonWindow} w
         * @param {string} op
         */
        begin(app: AppFacade, w: CinnamonWindow, op: string): void;
        /**
         * @param {AppFacade} app
         * @param {CinnamonWindow} w
         * @param {number} px
         * @param {number} py
         * @param {number | null} [fromMonitor]
         * @param {Rect | null} [startFrame]
         * @returns {DropTargetHit | null}
         */
        target(app: AppFacade, w: CinnamonWindow, px: number, py: number, fromMonitor?: number | null, startFrame?: Rect | null): DropTargetHit | null;
        /** @param {AppFacade} app */
        tick(app: AppFacade): boolean;
        /**
         * @param {AppFacade} app
         * @param {CinnamonWindow} w
         * @param {string} op
         */
        end(app: AppFacade, w: CinnamonWindow, op: string): boolean;
        destroy(): void;
    };
};
export type DropDeps = {
    /**
     * imports.gi.Meta
     */
    meta: AnyRecord;
    /**
     * imports.ui.main — uiGroup
     */
    main: AnyRecord;
    /**
     * the Cinnamon global object
     */
    global: AnyRecord;
    /**
     * imports.mainloop
     */
    mainloop: AnyRecord;
    /**
     * imports.gi.St
     */
    st: AnyRecord;
    excludeCheck: (w: CinnamonWindow) => boolean;
    collectWindows: (monitor: CinnamonMonitor, focus: CinnamonWindow | null, ws?: number) => CinnamonWindow[];
    layoutShape: (app: AppFacade, monitorIndex: number, windowCount: number) => Layout | null;
    layoutSet: (app: AppFacade, monitorIndex: number, wsIndex: number, patch: {}) => void;
    usableArea: (monitor: CinnamonMonitor) => Rect;
    gap: (app: AppFacade) => number;
    placeFit: (app: AppFacade, wins: CinnamonWindow[], layout: Layout, area: Rect, animate: boolean, monitorIndex: number, wsIndex: number, n: number) => FittedLayout;
    accentRgb: () => Rgb;
};
/**
 * Shape a successful target() lookup returns.
 */
export type DropTargetHit = {
    monitorIndex: number;
    n: number;
    layout: DragLayout;
    ordered: CinnamonWindow[];
    fromIndex: number;
    toIndex: number;
    zone: "top" | "bottom" | "left" | "right" | "center";
    next: {
        kind: "cols" | "rows";
        shape: readonly number[];
        order: number[];
    } | null;
};

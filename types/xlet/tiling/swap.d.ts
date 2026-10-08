// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
export function swapOverride(app: AppFacade, metaWindow: CinnamonWindow, rect: Rect): void;
export function dropDisplacedSizes(app: AppFacade, monitorIndex: number, wsIndex: number, n: number): void;
export function landingCells(app: AppFacade, targetMonitor: CinnamonMonitor, monitorIndex: number, wsIndex: number, n: number, layout: Layout, others: CinnamonWindow[], incoming: CinnamonWindow, source: {
    monitorIndex: number;
    wsIndex: number;
}): Rect[];
export function swapHotkey(app: AppFacade, dir: "left" | "right" | "up" | "down"): void;

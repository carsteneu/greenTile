// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
export const ANIMATE_MS: number;
export function place(app: AppFacade, metaWindow: CinnamonWindow, x: number, y: number, width: number, height: number, animate?: boolean): void;
export function gap(app: AppFacade): number;
export function placeCell(app: AppFacade, metaWindow: CinnamonWindow, x: number, y: number, width: number, height: number, area: Rect, animate?: boolean): void;
export function placeRects(app: AppFacade, ordered: CinnamonWindow[], layout: Layout, split: Split | null, area: Rect, animate: boolean): void;

// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
export const ANIMATE_MS: number;
export function place(app: AppFacade, metaWindow: CinnamonWindow, x: number, y: number, width: number, height: number, animate?: boolean): CinnamonRectangle;
export function gap(app: AppFacade): number;
export function placeCell(app: AppFacade, metaWindow: CinnamonWindow, x: number, y: number, width: number, height: number, area: Rect, animate?: boolean): {
    req: Rect;
    got: CinnamonRectangle;
} | null;
export function placeRects(app: AppFacade, ordered: CinnamonWindow[], layout: Layout, split: Split | null, area: Rect, animate: boolean): ({
    req: Rect;
    got: CinnamonRectangle;
} | null)[];
export function placeFit(app: AppFacade, ordered: CinnamonWindow[], layout: Layout, area: Rect, animate: boolean, monitorIndex: number, wsIndex: number, n: number): FittedLayout;

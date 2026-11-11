// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
export function singleMode(raw: any): "leave" | "fill" | "center";
export function singleActive(raw: any, n: number): boolean;
export function singleLeavesMaximized(raw: any, n: number, maximized: boolean): boolean;
export const singleLayout: Readonly<{
    kind: "rows";
    shape: readonly number[];
}>;
/**
 * Share of the usable width a centered window keeps.
 *
 * The golden ratio (0.618) was the original value and it reads well up to about
 * 2560 px of usable width. Above that the frame stops looking "centered" and
 * starts looking like a wall of text: at 5120 px it covered 3164 px, which the
 * author measured as roughly a tenth too wide. 0.556 is the golden ratio less
 * that tenth — a share, not a pixel ceiling, so the frame keeps its proportion
 * on every screen instead of stopping at one number that only fits one monitor.
 *
 * Deliberately a constant and not a setting: the number is the product decision,
 * so changing it again should be a reasoned change and not a slider.
 */
export const SINGLE_CENTER_WIDTH: number;
/** Share of the usable height a centered window keeps. */
export const SINGLE_CENTER_HEIGHT: number;
export function singleCenterRect(area: Rect): Rect;
export function singleCenterLayout(area: Rect, gap: number): Layout;
export function singleBase(mode: "leave" | "fill" | "center", area: Rect, gap: number): Layout;

// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
export function singleMode(raw: any): "leave" | "fill" | "center";
export function singleActive(raw: any, n: number): boolean;
export function singleLeavesMaximized(raw: any, n: number, maximized: boolean): boolean;
export const singleLayout: Readonly<{
    kind: "rows";
    shape: readonly number[];
}>;
/** Share of the usable width a centered window keeps (the golden ratio 1/φ). */
export const SINGLE_CENTER_WIDTH: number;
/**
 * Hard ceiling for the centered window's width, in pixels. The share above
 * grows with the monitor, so on a very wide screen the "golden" frame turns
 * into a wall of text. 1600 leaves every usable width up to 2560 px untouched —
 * laptops and by far most desktops — and stays a width that text reads without
 * the eye wandering between lines. Deliberately a constant and not a setting:
 * the number is the product decision, so changing it again should be a reasoned
 * change and not a slider.
 */
export const SINGLE_CENTER_MAX_WIDTH: number;
/** Share of the usable height a centered window keeps. */
export const SINGLE_CENTER_HEIGHT: number;
export function singleCenterRect(area: Rect): Rect;
export function singleCenterLayout(area: Rect, gap: number): Layout;
export function singleBase(mode: "leave" | "fill" | "center", area: Rect, gap: number): Layout;

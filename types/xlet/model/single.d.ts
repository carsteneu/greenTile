// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
export function singleMode(raw: any): "leave" | "fill" | "center";
export function singleActive(raw: any, n: number): boolean;
export const singleLayout: Readonly<{
    kind: "rows";
    shape: readonly number[];
}>;
/** Share of the usable width a centered window keeps (the golden ratio 1/φ). */
export const SINGLE_CENTER_WIDTH: number;
/** Share of the usable height a centered window keeps. */
export const SINGLE_CENTER_HEIGHT: number;
export function singleCenterRect(area: Rect): Rect;
export function singleCenterLayout(area: Rect, gap: number): Layout;
export function singleBase(mode: "leave" | "fill" | "center", area: Rect, gap: number): Layout;

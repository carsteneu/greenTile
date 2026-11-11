// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
/** Largest gap in px a stored value can reach. */
export const GAP_MAX: number;
/** Step in px the −/+ buttons in the preset panel change the gap by. */
export const GAP_STEP: number;
/** Largest distance in px a stored screen-edge value can reach. */
export const EDGE_MAX: number;
/** Step in px the −/+ buttons in the preset panel change the edge distance by. */
export const EDGE_STEP: number;
export function gapValue(v: any): number;
export function edgeValue(v: any): number;
export function insetArea(area: Rect, edge: number): Rect;
export function gapCell(cell: Rect, area: Rect, gap: number): Rect;

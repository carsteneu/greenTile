// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
/**
 * Drag-and-drop zone split. Edge bands of a drop target's cell in fractions of the
 * cell size; a corner goes to the axis with the smaller relative distance.
 */
export const DROP_EDGE: number;
export function dropZone(cell: Rect, px: number, py: number): "top" | "bottom" | "left" | "right" | "center" | null;
export function dropLayout(kind: string, shape: readonly number[], from: number, to: number, zone: string): {
    kind: "cols" | "rows";
    shape: readonly number[];
    order: number[];
} | null;
export function dropFits(kind: string, shape: readonly number[], width: number, height: number, gap: number, minPx: number): boolean;

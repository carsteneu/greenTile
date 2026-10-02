// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
/** Minimum width/height of a cell between two movable borders, in px. */
export const SPLIT_MIN_PX: number;
/** Maximum extra px a resize hotkey gains per detected key repeat. */
export const SPLIT_STEP_MAX: number;
export function splitEqual(kind: "cols" | "rows", shape: readonly number[]): Split;
export function splitNorm(parts: any, len: number): number[] | null;
export function splitValid(kind: "cols" | "rows", shape: readonly number[], split: any): Split | null;
export function splitParts(fractions: number[] | null, n: number, start: number, len: number): Array<[number, number]>;
export function splitRects(kind: "cols" | "rows", shape: readonly number[], split: Split | null, area: Rect): Rect[];
export function splitCellAt(rects: Rect[], frame: Rect): number;
export function splitEdgeRef(kind: "cols" | "rows", shape: readonly number[], idx: number, edge: string): EdgeRef | null;
export function splitHasEdge(kind: "cols" | "rows", shape: readonly number[], idx: number, edge: string): boolean;
export function splitAxis(kind: "cols" | "rows", list: "major" | "minor", area: Rect): [number, number];
export function splitBorderPos(kind: "cols" | "rows", shape: readonly number[], split: Split | null, idx: number, edge: string, area: Rect): number | null;
export function splitMove(kind: "cols" | "rows", shape: readonly number[], split: Split | null, idx: number, edge: string, pos: number, area: Rect, minPx: number): Split | null;
export function splitKeyTarget(kind: "cols" | "rows", shape: readonly number[], idx: number, action: string): {
    edge: string;
    sign: number;
} | null;
export function splitAccel(state: AccelState | null, action: string, now: number, threshold: number): {
    step: number;
    state: AccelState;
};
export function splitOpEdges(name: string): string[];
export function splitFrameEdges(from: Rect, to: Rect): string[];
export function splitMinimal(kind: "cols" | "rows", shape: readonly number[], split: Split | null, area: Rect, gap: number, minPx: number): Split | null;
export function sortOrder(rects: Rect[], columnMajor: boolean): number[];

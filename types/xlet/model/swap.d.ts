// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
export function swapDirOk(dir: string): boolean;
export function swapAxis(dir: string): number;
export function swapSign(dir: string): number;
export function swapOverlap(a: Rect, b: Rect, axis: number): number;
export function swapCenter(r: Rect, axis: number): number;
export function swapNeighbor(cells: Rect[], self: number, dir: string): number | null;
export function swapLandingCell(cells: Rect[], frame: Rect, dir: string): number | null;
export function swapChainStep(input: {
    dir: string;
    monitorIndex: number;
    primaryIndex: number;
    onlyPrimary: boolean;
    monitors: Array<{
        index: number;
        x: number;
        width: number;
    }>;
    workspaces: number;
    wsIndex: number;
}): {
    kind: "monitor";
    to: number;
    monitor: number;
    slot: "first" | "last";
} | {
    kind: "workspace";
    delta: number;
    monitor: number;
    slot: "first" | "last";
} | null;

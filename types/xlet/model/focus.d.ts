// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
export function focusMonitorStep(input: {
    dir: string;
    monitorIndex: number;
    monitors: Array<{
        index: number;
        x: number;
    }>;
}): number | null;
export function focusMonitorPick(frames: CinnamonMonitor[], dir: string, self: CinnamonRectangle): number | null;

// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
export function layoutsParse(raw: string): any;
export function layoutsEntry(layouts: any, mkey: MonitorKey, wskey: WsKey, presetIds: string[]): {
    preset: string | null;
    auto: boolean;
};
export function layoutsSplits(layouts: any, mkey: MonitorKey, wskey: WsKey): any;
export function layoutsShapes(layouts: any, mkey: MonitorKey, wskey: WsKey): any;
export function layoutsSet(layouts: any, mkey: MonitorKey, wskey: WsKey, patch: any): any;
export function layoutsRemovePreset(layouts: any, presetId: string): any;
export function shapeValid(value: any, n: number): DragLayout | null;
export function layoutResolve(base: DragLayout | null, stored: any, n: number): Layout | null;

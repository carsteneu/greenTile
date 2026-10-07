// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
export function panelRoundRect(cr: AnyRecord, x: number, y: number, w: number, h: number, r: number): void;
export function panelThumb(app: AppFacade, stacks: number[], opts?: {
    width?: number;
    height?: number;
    gap?: number;
    vgap?: number;
    radius?: number;
    color?: Rgb | null;
    spans?: number[] | null;
}): any;
export function panelMiddle(): {
    x_fill: boolean;
    y_fill: boolean;
    y_align: any;
};

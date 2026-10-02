// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
/**
 * The preset panel can be resized with the grip in its bottom right corner, list and
 * editor separately. Setting panelSize: {"list": {"w", "h"}, "editor": {"w", "h"}};
 * w is the panel width, h the height of the part that stretches (list: the preset
 * rows, editor: the painter). Without a stored size the panel keeps its natural size.
 */
export const PANEL_MIN: Readonly<{
    list: Readonly<{
        w: 600;
        h: 180;
    }>;
    editor: Readonly<{
        w: 600;
        h: 136;
    }>;
}>;
export function panelSizeOk(s: any): boolean;
export function panelSizeObj(raw: string): AnyRecord;
export function panelSizeParse(raw: string): AnyRecord;
export function panelSizeSet(raw: string, view: string, size: {
    w: number;
    h: number;
}): string;
export function panelSizeClamp(size: {
    w: number;
    h: number;
}, min: {
    w: number;
    h: number;
}, max: {
    w: number;
    h: number;
}): {
    w: number;
    h: number;
};

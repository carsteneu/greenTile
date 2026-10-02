// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
/**
 * Preset editor model. A rule is {min, stacks}; stacks[i] = windows stacked in column i.
 * The painter grid of the approved prototype has 6 columns and 4 rows.
 */
/** Painter grid width, in columns. */
export const editorCols: number;
/** Painter grid height, in rows (and thus the highest stack). */
export const editorRows: number;
/** Smallest min value a rule can carry. */
export const editorMinFloor: number;
/** Largest min value a rule can carry. */
export const editorMinCeiling: number;
export function editorClampInt(v: number, lo: number, hi: number): number;
export function editorClamp(stacks: number[]): number[];
export function editorPaint(stacks: number[], col: number, row: number): number[];
export function editorPaintRange(stacks: number[], from: number, to: number, row: number): number[];
export function editorRemove(stacks: number[], col: number): number[];
export function editorSort(rules: Rule[]): Rule[];
export function editorAddRule(rules: Rule[]): {
    rules: Rule[];
    index: number;
};
export function editorDeleteRule(rules: Rule[], index: number): {
    rules: Rule[];
    index: number;
};
export function editorStepMin(rules: Rule[], index: number, delta: number): {
    rules: Rule[];
    index: number;
};
export function editorValidate(draft: {
    name?: string;
}): "name" | null;
export function editorNewId(presets: Preset[]): string;
export function editorCommit(presets: Preset[], preset: Preset): Preset[];
export function editorDeletePreset(presets: Preset[], id: string): Preset[];

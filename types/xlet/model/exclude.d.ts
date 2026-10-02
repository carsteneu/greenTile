// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
export function exclRowsNormalize(rows: any): ExclRow[];
export function exclMatch(wmClass: string | null, wmInstance: string | null, title: string | null, rows: ExclRow[], appId: string | null, appClasses: AnyRecord | null): boolean;
export function exclRowsAppend(rows: any, text: string): ExclRow[];
export function exclAppOptions(apps: any, placeholderLabel: string): AnyRecord;
export function exclToggleSet(map: Map<number, boolean>, seq: number, on: boolean): void;

// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
export function pendingRegistry(): {
    begin(): number;
    is_current(token: number): boolean;
    invalidate(): void;
};

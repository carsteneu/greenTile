// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
/**
 * Cairo colors for the thumbnails, the painter's dashed outline and the painter's
 * handle ink, per theme; the CSS classes cover the rest. Thumbs stand somewhat (not
 * dramatically) apart from the panel background: #1c1f28 in dark, #f6f7fa in light —
 * thumb contrast 1.70→2.04 (dark, lighter) and 1.49→1.76 (light, darker) against the
 * panel. The outline pairs with the CSS border tokens (#2a2e39 / #c3c9d6) and stays.
 * `panel` is the .gk-panel background itself (rgba(28, 31, 40, 0.98) dark, rgba(246,
 * 247, 250, 0.98) light): the painter needs it to pick an ink that contrasts with the
 * painted column, and cairo cannot read the stylesheet.
 */
export const THEME_CAIRO: Readonly<{
    dark: Readonly<{
        thumb: number[];
        outline: number[];
        panel: number[];
    }>;
    light: Readonly<{
        thumb: number[];
        outline: number[];
        panel: number[];
    }>;
}>;
export function themeResolve(setting: "light" | "dark" | "system", colorScheme: string, themeName: string): "light" | "dark";
export function themeToggleTarget(theme: "light" | "dark"): "light" | "dark";

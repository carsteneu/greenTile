// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
/**
 * All accent colors derive from one base: the default orange, the accent of the
 * Cinnamon theme (probed at runtime — lib/runtime/theme.js applies it) or the custom
 * accentColor setting. The default orange keeps its exact tone table, so
 * the default look stays pixel-identical; every other base is derived from
 * HSL lightness: hover lighter, light theme darker, text by luminance.
 */
/** @type {Rgb} */
export const accentDefault: Rgb;
export function accentParse(value: any): Rgb | null;
export function accentIsOwn(mode: string): boolean;
export function accentFromProbed(r: number, g: number, b: number, a: number): Rgb | null;
/**
 * The theme probe chain, in fallback order: the menu entries carry the theme
 * accent in Mint-L, but Mint-Y paints them grey — there the calendar day
 * hover state holds it. accentProbeFirst walks the chain and returns
 * the first color the model accepts, so grey themes keep the default. The
 * probes resolve class-selector rules only — themes painting their accent on
 * type-qualified selectors or in border-color keep the default too.
 */
export const accentProbes: readonly string[][];
export function accentProbeFirst(probeFn: (className: string, pseudoClass: string) => Rgb | null): Rgb | null;
export function accentHsl(rgb: Rgb): Hsl;
export function accentRgb(hsl: Hsl): Rgb;
/** The two ink colours the accent model draws with: dark on bright bases, light on dark. */
/** @type {Rgb} */
export const accentInkDark: Rgb;
/** @type {Rgb} */
export const accentInkLight: Rgb;
export function accentLuminance(rgb: Rgb): number;
export function accentContrast(a: Rgb, b: Rgb): number;
export function accentTextOn(rgb: Rgb): Rgb;
export function accentInkOn(rgb: Rgb): Rgb;
export function accentHandleInk(base: Rgb, panel: Rgb): {
    fill: Rgb;
    rim: Rgb;
};
export function accentTones(base: Rgb): AccentTones;
export function accentCss(tones: AccentTones): string;

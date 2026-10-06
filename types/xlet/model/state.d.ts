// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
/**
 * The state color tints the "Auto: on" marker and the assigned preset cards.
 * The default green keeps its exact table — which in the light scope uses TWO
 * greens: the text (#3f8f22) and the tints + stripe (#4ea530) are different
 * colors and must stay that way. Any other base derives from HSL: dark
 * keeps the base rgb, the light text sits a bit darker than the light tints
 * (mirroring the default's split).
 */
/**
 * Default state tone triple, Object.freeze'd — handed out as immutable Rgb.
 * @type {Rgb}
 */
export const stateDefault: Rgb;
export function stateMode(mode: string): "green" | "theme" | "own";
export function stateTones(base: Rgb): StateTones;
export function stateCss(tones: StateTones): string;

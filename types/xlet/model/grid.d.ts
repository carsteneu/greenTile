// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
/** Minimum card width that still shows a usable layout preview (px). */
export const PRESET_CARD_MIN_W: number;
/** Gap between cards, horizontally and between the rows (px). Mirrors the
 *  .gk-cards / .gk-card-row spacing in stylesheet.css — keep them equal. */
export const PRESET_CARD_GAP: number;
/** Panel inner padding left and right of the card area (px). */
export const PRESET_GRID_PAD: number;
/** Width reserved for the vertical scrollbar so a full row never overflows it
 *  (px; the panel's scroll view bar is ~21px while it is shown). */
export const PRESET_SCROLLBAR: number;
/** The .gk-panel 1px border on both sides (px) — it sits inside the panel width
 *  and takes room away from the card area. */
export const PRESET_PANEL_BORDER: number;
export function gridAvailable(panelWidth: number): number;
export function gridColumns(available: number, minW?: number, gap?: number): number;
export function gridCardWidth(available: number, columns: number, gap?: number): number;
export function gridRows(items: any[], columns: number): any[][];

// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
export function focusMotion(dir: "left" | "right" | "up" | "down"): number;
export function focusPushNative(window: CinnamonWindow, dir: "left" | "right" | "up" | "down"): void;
export function focusHotkey(app: AppFacade, dir: "left" | "right" | "up" | "down"): (/** @type {AnyRecord} */ display: AnyRecord, /** @type {CinnamonWindow} */ window: CinnamonWindow) => void;

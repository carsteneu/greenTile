// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
export function windowTileable(w: CinnamonWindow | null | undefined): boolean;
export function collectWindows(app: AppFacade, monitor: CinnamonMonitor, focusWindow: CinnamonWindow | null, wsIndex?: number | null | undefined): CinnamonWindow[];
export function isOnAllWorkspaces(w: CinnamonWindow): boolean;
export function windowReset(metaWindow: CinnamonWindow | null): void;
export function windowMoveResize(metaWindow: CinnamonWindow | null, x: number, y: number, width: number, height: number): void;

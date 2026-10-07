// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
export function windowDescription(w: CinnamonWindow): string | null;
export function appColumns(app: AppFacade, cols: number): void;
export function userArranged(app: AppFacade, windows: CinnamonWindow[], focused: CinnamonWindow | null, hasFocus: boolean, actionLayout: Layout | null): boolean;
export function appAuto(app: AppFacade, monitorIndex: number, focused: CinnamonWindow | null, animate?: boolean, wsIndex?: number | null, actionLayout?: Layout | null, settle?: boolean): void;
export function presetRetile(app: AppFacade, monitorIndex: number, focused: CinnamonWindow | null, animate?: boolean, wsIndex?: number | null, settle?: boolean): void;
export function retileMonitor(app: AppFacade, monitorIndex: number, focused: CinnamonWindow | null, animate?: boolean, wsIndex?: number | null, actionLayout?: Layout | null, settle?: boolean): void;
export function singleRetile(app: AppFacade): void;
export function exclRetile(app: AppFacade): void;

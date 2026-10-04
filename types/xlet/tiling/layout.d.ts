// GENERATED from lib/ by scripts/generate-xlet-types.mjs — do not edit;
// regenerate with: npm run gen:types
export function autoShape(monitor: CinnamonMonitor, n: number): DragLayout;
export function presetsRead(app: AppFacade): Preset[];
export function layoutFor(app: AppFacade, monitorIndex: number, wsIndex: number): {
    preset: Preset | null;
    auto: boolean;
};
export function autoAllowed(app: AppFacade, monitorIndex: number, wsIndex: number): boolean;
export function layoutSet(app: AppFacade, monitorIndex: number, wsIndex: number, patch: {}): boolean;
export function presetsWrite(app: AppFacade, presets: Preset[]): void;
export function rulesPick(rules: Rule[], n: number): Rule | null;
export function layoutShapeWs(app: AppFacade, monitorIndex: number, wsIndex: number, n: number): DragLayout | null;
export function layoutShape(app: AppFacade, monitorIndex: number, n: number): DragLayout | null;

/*
 * Shared data shapes of greenTile for checkJs — ambient typedefs (this file is
 * NOT a module, so the types are global and usable from JSDoc without import()).
 * Dev-only: never part of the release zip. Everything here mirrors the runtime
 * shapes the models parse and produce (see the per-file comments in lib/model).
 */

/** Meta.Window as far as greenTile touches it — a GI struct, deliberately open. */
type CinnamonWindow = AnyRecord;
/** A Cinnamon monitor / layout actor object ( layoutManager.monitors[i] ). */
type CinnamonMonitor = AnyRecord;

/** Screen rectangle [x, y, w, h] in px (also window frames and cells). */
type Rect = [number, number, number, number];

/** Setting "layouts" key of a monitor: vendor|product|serial (+|connector on zero serial). */
type MonitorKey = string;
/** Workspace key inside a monitor entry of "layouts": the ws number from 1 or '*'. */
type WsKey = string;

/** Movable-border model of a filled layout; fractions sum to 1 per axis. */
type Split = {
    kind: 'cols' | 'rows';
    shape: readonly number[];
    major: number[];
    minor: number[][];
};

/** Dragged-shape override as stored in "layouts": { kind, shape } plus the
 * source rule/preset metadata the layout editor keeps attached. */
type DragLayout = {
    kind: 'cols' | 'rows';
    shape: readonly number[];
    rule?: Rule;
    preset?: Preset;
};

/** A preset rule: applies from `min` windows on, `stacks` = windows per column. */
type Rule = {
    min: number;
    stacks: number[];
};

/** A preset as stored in the "presets" setting. */
type Preset = {
    id: string;
    name: string;
    rules: Rule[];
    isNew?: boolean;
};

/** A resolved tiling layout: base grid + optional preset rule metadata (retile logs). */
type Layout = DragLayout & {
    rule?: Rule;
};

/** border-frame reference of a cell edge as produced by splitEdgeRef. */
type EdgeRef = {
    list: 'major' | 'minor';
    i: number;
    b: number;
};

/** Resize-hotkey repeat state (lib/model/split.js splitAccel). */
type AccelState = {
    action: string;
    last: number;
    step: number;
};

/** Per-layout assignment entry of one (monitor, workspace) in "layouts". */
type LayoutsEntry = {
    preset?: string;
    auto?: boolean;
    splits?: Record<string, Split>;
    shapes?: Record<string, DragLayout>;
};

/** The whole "layouts" setting object: monitor key -> ws key -> entry. */
type LayoutsMap = Record<MonitorKey, Record<WsKey, LayoutsEntry>>;

/** Reading-order item of lib/model/split.js sortOrder (rect + index + centre). */
type SortItem = { i: number; r: Rect; c: number };

/** Settings access as greenTile uses it (values are JSON data / strings). */
type SettingsFacade = {
    getValue(key: string): any;
    setValue(key: string, value: any): void;
    bind(key: string, prop: string, cb: () => void, data?: any): void;
    setOptions(options: {}, profile?: any): void;
    finalize(): void;
};

/** The settings Config wiring (lib/app/config.js) — surface used across lib/. */
type ConfigFacade = {
    settings: SettingsFacade;
};

/** Ops facade the preset panel and editor (lib/ui) work through (app.ops). */
type OpsFacade = {
    focusWindow(): CinnamonWindow | null;
    focusMonitorIndex(): number;
    collectWindows(app: AppFacade, monitor: CinnamonMonitor, focus: CinnamonWindow | null, ws?: number | null): CinnamonWindow[];
    layoutFor(app: AppFacade, monitorIndex: number, wsIndex: number): { preset: Preset | null; auto: boolean };
    layoutSet(app: AppFacade, monitorIndex: number, wsIndex: number, patch: {}): void;
    retileMonitor(app: AppFacade, monitorIndex: number, focused: CinnamonWindow | null, animate?: boolean, wsIndex?: number | null): void;
    presetsRead(app: AppFacade): Preset[];
    presetsWrite(app: AppFacade, presets: Preset[]): void;
    gap(app: AppFacade): number;
    rulesPick(rules: Rule[], count: number): Rule | null;
    windowCount(app: AppFacade): number;
    rebuild(app: AppFacade | null): void;
};

/** Settle wait after a monitor change (lib/runtime/session.js Session.settle). */
type SettleFacade = {
    pending: boolean;
    started: number;
    start(app: AppFacade): void;
    teardown(): void;
    consumePending(app: AppFacade): void;
    destroy(): void;
};

/** Extension-session state that outlives an App recreation (lib/runtime/session.js). */
type SessionFacade = {
    settle: SettleFacade;
    monitorFallbackLogged: boolean;
    splitCorruptLogged: boolean;
    layoutsWriteGuardLogged: boolean;
    accentGenSeq: number;
    accentCss: string;
    panelSaved: any;
    exclToggles: Map<number, boolean>;
    exclWatches: Map<number, { disconnect: () => void }>;
    nextAccentGen(): string;
    destroy(): void;
};

/** Auto-tiling facade (lib/runtime/auto.js). */
type AutoFacade = {
    scheduleAll(app: AppFacade, delayMs: number): void;
    scheduleMonitor(app: AppFacade, monitorIndex: number, delayMs: number): void;
    pendingTake(monitorIndex: number): Set<number>;
    activate(app: AppFacade): void;
    deactivate(app: AppFacade): void;
    connectAll(app: AppFacade): void;
    resizeStartTake(seq: number): { rect: Rect; monitor: number } | undefined;
    sortOverride(seq: number, rect: Rect, now: number): void;
    sortTake(seq: number, now: number): Rect | null;
    sortClear(seq: number): void;
    sortPoll(now: number): void;
    destroy(): void;
};

/** Split-runtime facade (lib/runtime/split.js). */
type SplitFacade = {
    for(app: AppFacade, monitorIndex: number, wsIndex: number, windowCount: number, layout: DragLayout): SplitShape | null;
    onResizeEnd(app: AppFacade, win: CinnamonWindow, op: string): void;
    ref(app: AppFacade, monitorIndex: number, wsIndex: number, n: number): { key: string; mkey: string; wskey: string; n: string } | null;
    forget(refKey: string): void;
    flush(app: AppFacade): void;
    hotkey(app: AppFacade, action: string): void;
    destroy(): void;
    any(app: AppFacade, monitorIndex: number, wsIndex: number): boolean;
    reset(app: AppFacade, monitorIndex: number, wsIndex: number): void;
};

/** Monitor registry facade (lib/runtime/monitors.js). */
type MonitorsFacade = {
    ready: boolean;
    keys: MonitorKey[];
    labels: string[];
    wsKey(monitorIndex: number, wsIndex: number): WsKey;
    onlyPrimary(): boolean;
    refresh(onReady: () => void): void;
    destroy(): void;
};

/** Exclusion facade (lib/runtime/exclusions.js). */
type ExclFacade = {
    isExcluded(win: CinnamonWindow): boolean;
    removeToggle(seq: number): void;
    apply(settings: SettingsFacade): void;
    start(settings: SettingsFacade): void;
    destroy(): void;
    picked(settings: SettingsFacade, app: AppFacade, value: any): void;
    toggleFocused(app: AppFacade): void;
};

/** App facade: the wired component set every function under lib/ receives. */
type AppFacade = {
    config: ConfigFacade;
    session: SessionFacade;
    auto: AutoFacade;
    split: SplitFacade;
    monitors: MonitorsFacade;
    excl: ExclFacade;
    ops: OpsFacade;
    panel: AnyRecord;
    /** Theme runtime (lib/runtime/theme.js). */
    theme: AnyRecord;
    /** Focus-border runtime (lib/runtime/border.js). */
    border: AnyRecord;
    /** Drag-and-drop tiling runtime (lib/runtime/drop.js). */
    drop: AnyRecord;
    /** Focus hotkey runtime (lib/runtime/focus.js). */
    focus: AnyRecord;
    /** Hotkey owner (lib/runtime/hotkeys.js). */
    hotkeys: {
        register(bindings: Array<{ name: string; bindings: any; callback: () => void }>): void;
        remove(): void;
    };
};

/** gettext binding, lib/ui/i18n.js */
type TranslateFn = (msgid: string) => string;

/** RGB color triplet [r, g, b], each 0–255 (accent, state and theme models). Model constants are Object.freeze'd, so the triplet is readonly for consumers. */
type Rgb = readonly [number, number, number];

/** The model split (kind per orientation, cell grid) produced by lib/model/split.js. Same shape as the global  Split  above; the alias keeps JSDoc unambiguous inside lib/runtime/split.js, whose class exports the name Split. */
type SplitShape = Split;

/** HSL color triplet [h (0–360), s (0–1), l (0–1)] as produced by accentHsl. */
type Hsl = [number, number, number];

/** State color tone table as produced by stateTones (lib/model/state.js). */
type StateTones = {
    text: Rgb;
    tint: Rgb;
    lightText: Rgb;
    lightTint: Rgb;
};

/** Accent color tone table as produced by accentTones (lib/model/accent.js). */
type AccentTones = {
    base: Rgb;
    hover: Rgb;
    saveHover: Rgb;
    lightBase: Rgb;
    lightHover: Rgb;
    textOn: Rgb;
};

/** One exclusions row as stored: match by class/title/app with the text to match. */
type ExclRow = {
    match: 'class' | 'title' | 'app';
    text: string;
};

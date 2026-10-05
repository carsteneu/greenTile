/*
 * Shared data shapes of greenTile for checkJs — ambient typedefs (this file is
 * NOT a module, so the types are global and usable from JSDoc without import()).
 * Dev-only: never part of the release zip. Everything here mirrors the runtime
 * shapes the models parse and produce (see the per-file comments in lib/model).
 */

/** Screen rectangle [x, y, w, h] in px (also window frames and cells). */
type Rect = [number, number, number, number];

/** Muffin rectangle object as returned by Meta.Window.get_frame_rect(). */
type CinnamonRectangle = { x: number; y: number; width: number; height: number };

/** Meta.Workspace as far as greenTile touches it (identity, index, window list). */
type CinnamonWorkspace = {
    index(): number;
    list_windows(): CinnamonWindow[];
};

/**
 * Clutter actor of a window frame (Meta.Window.get_compositor_private) as far
 * as greenTile touches it: translation/scale for the animated placement plus
 * the platform transition API of Cinnamon's environment.js (_easeActor/
 * _easeActorProperty) — ease(), get_transition() as the identity handle of a
 * single running transition, remove_transition() to stop exactly that one, and
 * the actor's own detailed ::transition-stopped(name, is_finished) signal.
 * The Clutter property accessors are plain fields here.
 */
type CinnamonActor = {
    translation_x: number;
    translation_y: number;
    scale_x: number;
    scale_y: number;
    /** Cinnamon Clutter.Actor.prototype.ease (environment.js _easeActor). */
    ease(props: Record<string, any>): void;
    /** Clutter.Actor.get_transition(propName) — the running transition of that
     * (dashed) property or null. lib/runtime/placement.js compares this object
     * identity to tell an own transition from a foreign one. */
    get_transition(name: string): ClutterTransition | null;
    /** Clutter.Actor.remove_transition — stops exactly the named transition. */
    remove_transition(name: string): void;
    /** Clutter.Actor::transition-stopped — (actor, name, is_finished), emitted
     * after a transition left the actor's table: from on_transition_stopped on a
     * natural completion (TRUE) and from remove_transition on a removal (FALSE,
     * only if it was playing). lib/runtime/placement.js reads it to tell a
     * takeover from its own cancellation. */
    connect(signal: string, cb: (actor: CinnamonActor, name: string, finished: boolean) => void): any;
    disconnect(id: any): void;
};

/**
 * Clutter.Transition as greenTile uses it: the identity handle of one running
 * mutation plus the platform signal surface environment.js connects to —
 * 'stopped' reports (transition, finished), 'new-frame' (transition, timeIndex).
 * lib/runtime/placement.js attaches its own per-transition 'stopped' handler so
 * one cancelled property cannot drop the repair of its siblings.
 */
type ClutterTransition = {
    connect(signal: string, cb: (transition: ClutterTransition, payload: any) => void): any;
};

/**
 * Meta.Window as far as greenTile touches it — narrowed to the members the
 * runtime paths actually call, so method-name and argument typos fail tsc.
 * Every member is verified against the installed muffin 6.6 gi (Meta-0.typelib:
 * move_resize_frame, move_frame, unmaximize, activate, get_monitor,
 * get_workspace, get_frame_rect, get_compositor_private, get_maximized,
 * is_fullscreen, get_wm_class, get_wm_class_instance, get_window_type,
 * is_on_all_workspaces, get_stable_sequence, GObject signal connect/disconnect.
 * Deliberately open: window properties beyond this
 * surface (x/y/rect,WM props), authorizations and hints — add members here
 * only with a runtime-API check against the muffin typelib.
 */
interface CinnamonWindow {
    minimized: boolean;
    get_wm_class(): string | null;
    get_window_type(): number;
    get_monitor(): number;
    get_title(): string;
    get_workspace(): CinnamonWorkspace;
    is_on_all_workspaces(): boolean;
    get_maximized(): boolean | number;
    is_fullscreen(): boolean;
    unmaximize(flags: number): void;
    /** Meta.Window.move_resize_frame(user_op, x, y, width, height) */
    move_resize_frame(userOp: boolean, x: number, y: number, width: number, height: number): void;
    /** Meta.Window.move_frame(user_op, x, y) */
    move_frame(userOp: boolean, x: number, y: number): void;
    get_frame_rect(): CinnamonRectangle;
    /** The window frame's Clutter actor (null once the window is destroyed). */
    get_compositor_private(): CinnamonActor | null;
    activate(time: number): void;
    /** Stable seq across App recreations (Meta.Window.get_stable_sequence). */
    get_stable_sequence(): number;
    get_wm_class_instance(): string | null;
    /** GObject signal id — lib/runtime (auto, exclusions, border) keeps it for disconnect. */
    connect(signal: string, callback: (...args: any[]) => void): number;
    disconnect(id: number): void;
}

/** Meta.MonitorBox shaped: a Cinnamon monitor (layoutManager.monitors[i]). */
type CinnamonMonitor = {
    index: number;
    x: number;
    y: number;
    width: number;
    height: number;
};

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
    /** Transient action geometry; never a stored preset or shape field. */
    split?: Split | null;
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
    connect(sigName: string, cb: (...args: any[]) => void): number;
    finalize(): void;
};

/** The settings Config wiring (lib/app/config.js) — surface used across lib/. */
type ConfigFacade = {
    settings: SettingsFacade;
    destroy(): void;
};

/** Ops facade the preset panel and editor (lib/ui) work through (app.ops). */
type OpsFacade = {
    focusWindow(): CinnamonWindow | null;
    focusMonitorIndex(): number;
    collectWindows(app: AppFacade, monitor: CinnamonMonitor, focus: CinnamonWindow | null, ws?: number | null): CinnamonWindow[];
    layoutFor(app: AppFacade, monitorIndex: number, wsIndex: number): { preset: Preset | null; auto: boolean };
    layoutSet(app: AppFacade, monitorIndex: number, wsIndex: number, patch: {}): boolean;
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
    panelSaved: any;
    exclToggles: Map<number, boolean>;
    exclWatches: Map<number, { disconnect: () => void }>;
    /** Auto on/off commands pressed before the monitor registry was ready. */
    pendingAuto: Array<{ monitorIndex: number; wsIndex: number; auto: boolean }>;
    nextAccentGen(): string;
    rollbackApp(app: AppFacade): void;
    /** Whether two auto commands address the same storage slot (effective ws key). */
    sameSlot(app: AppFacade, aMonitor: number, aWs: number, bMonitor: number, bWs: number): boolean;
    /** Whether a retained pause covers that monitor+workspace. */
    holdsPause(app: AppFacade, monitorIndex: number, wsIndex: number): boolean;
    /** Drops the retained intent for that slot (an explicit command superseded it). */
    dropIntent(app: AppFacade, monitorIndex: number, wsIndex: number): void;
    /** Collapses the retained queue to one intent per effective slot, newest wins. */
    normalizePending(app: AppFacade): void;
    destroy(): void;
};

/** Animated-placement owner facade (lib/runtime/placement.js): the per-App
 * records of the actor transitions greenTile started (lib/tiling/place.js). */
type PlacementFacade = {
    has(metaWindow: CinnamonWindow): boolean;
    foreignActive(metaWindow: CinnamonWindow, actor: CinnamonActor, props: ReadonlyArray<{ prop: string }>): boolean;
    acquired(metaWindow: CinnamonWindow, token: object, actor: CinnamonActor, props: ReadonlyArray<{ prop: string, field: string, identity: number }>): void;
    release(metaWindow: CinnamonWindow): void;
    destroy(): void;
};

/** Auto-tiling facade (lib/runtime/auto.js). */
type AutoFacade = {

    scheduleAll(app: AppFacade, delayMs: number): void;
    scheduleMonitor(app: AppFacade, monitorIndex: number, delayMs: number): void;
    pendingTake(monitorIndex: number): Set<number>;
    pendingForget(seq: number): void;
    activate(app: AppFacade): void;
    deactivate(app: AppFacade): void;
    applyPending(app: AppFacade): void;
    connectAll(app: AppFacade): void;
    resizeStartTake(seq: number): { rect: Rect; monitor: number } | undefined;
    sortOverride(seq: number, rect: Rect, now: number): void;
    sortTake(seq: number, now: number): Rect | null;
    sortPeek(seq: number, now: number): Rect | null;
    sortClear(seq: number): void;
    sortPoll(now: number): void;
    destroy(): void;
};

/** Split-runtime facade (lib/runtime/split.js). */
type SplitFacade = {
    for(app: AppFacade, monitorIndex: number, wsIndex: number, windowCount: number, layout: DragLayout): SplitShape | null;
    manual(app: AppFacade, monitorIndex: number, wsIndex: number, n: number): SplitShape | null;
    effective(app: AppFacade, monitorIndex: number, wsIndex: number, n: number, layout: Layout, ordered: CinnamonWindow[]): FittedLayout;
    fit(app: AppFacade, monitorIndex: number, wsIndex: number, n: number, layout: Layout, mins: Array<{ w: number; h: number }>, area: Rect, gap: number): FittedLayout;
    setPlacement(app: AppFacade, monitorIndex: number, wsIndex: number, n: number, entry: { kind: 'cols' | 'rows'; shape: number[]; split: Split | null; seqs: number[]; mins: Array<{ seq: number; w: number; h: number }> }): void;
    placementFor(app: AppFacade, monitorIndex: number, wsIndex: number, n: number, ordered: CinnamonWindow[]): FittedLayout | null;
    minsFor(app: AppFacade, monitorIndex: number, wsIndex: number, n: number, ordered: CinnamonWindow[]): Array<{ w: number; h: number }>;
    onResizeEnd(app: AppFacade, win: CinnamonWindow, op: string): void;
    ref(app: AppFacade, monitorIndex: number, wsIndex: number, n: number): { key: string; mkey: string; wskey: string; n: string } | null;
    forget(refKey: string): void;
    flush(app: AppFacade): void;
    hotkey(app: AppFacade, action: string): void;
    destroy(): void;
    any(app: AppFacade, monitorIndex: number, wsIndex: number): boolean;
    reset(app: AppFacade, monitorIndex: number, wsIndex: number): void;
    invalidate(): void;
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

/** Focus-border facade (lib/runtime/border.js). */
type BorderFacade = {
    init(app: AppFacade): void;
    update(): void;
    flash(win: CinnamonWindow): void;
    restyle(): void;
    destroy(): void;
};

/** Drop-preview facade (lib/runtime/drop.js). */
type DropFacade = {
    begin(app: AppFacade, w: CinnamonWindow, op: string): void;
    target(app: AppFacade, w: CinnamonWindow, px: number, py: number, fromMonitor?: number | null, startFrame?: Rect | null): void;
    tick(app: AppFacade): void;
    end(app: AppFacade, w: CinnamonWindow, op: string): void;
    stop(): void;
    destroy(): void;
};

/** Exclusion facade (lib/runtime/exclusions.js). */
type ExclFacade = {    isExcluded(win: CinnamonWindow): boolean;
    removeToggle(seq: number): void;
    apply(settings: SettingsFacade): void;
    start(settings: SettingsFacade): void;
    destroy(): void;
    picked(settings: SettingsFacade, app: AppFacade, value: any): void;
    toggleFocused(app: AppFacade): void;
};

/** Per-App preset panel state as built by lib/runtime/panel-state.js (app.panel.).
 * Narrow on purpose: app.panel.rebuld()-style typos must fail tsc (issue 12). */
type PanelStateFacade = {
    actor: AnyRecord | null;
    positioned: boolean;
    sig: Array<{ obj: AnyRecord; id: number }>;
    dragging: boolean;
    view: 'list' | 'editor';
    draft: AnyRecord | null;
    guardUntil: number;
    escBound: boolean;
    guard(): void;
    close(): void;
};

// theme/border/drop/focus stay deliberately open (AnyRecord): their surfaces
// are only touched by their own lib/runtime modules, which hold the concrete
// class instance — widening them would re-describe whole runtime classes for
// no check value. panel/panel-state is spelled out because lib/tiling and
// lib/ui call into app.panel across module borders.
/** App facade: the wired component set every function under lib/ receives. */
type AppFacade = {
    config: ConfigFacade;
    session: SessionFacade;
    auto: AutoFacade;
    placement: PlacementFacade;
    split: SplitFacade;
    monitors: MonitorsFacade;
    excl: ExclFacade;
    ops: OpsFacade;
    panel: PanelStateFacade;
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
    /** Tears the App down (lib/app/app.js); the session's rollback path uses it. */
    destroy(): void;
};

/** gettext binding, lib/ui/i18n.js */
type TranslateFn = (msgid: string) => string;

/** RGB color triplet [r, g, b], each 0–255 (accent, state and theme models). Model constants are Object.freeze'd, so the triplet is readonly for consumers. */
type Rgb = readonly [number, number, number];

/** The model split (kind per orientation, cell grid) produced by lib/model/split.js. Same shape as the global  Split  above; the alias keeps JSDoc unambiguous inside lib/runtime/split.js, whose class exports the name Split. */
type SplitShape = Split;

/** Effective arrangement of a layout after the application-minimum fit (Split.fit):
 * the kind is unchanged, the shape may hold fewer horizontally adjacent windows
 * (more vertical stacking), split is the effective read-time split or null for the
 * equal division. Consumed by the placement and every focus/swap/drop/resize path so
 * they address the settled geometry. */
type FittedLayout = {
    kind: 'cols' | 'rows';
    shape: number[];
    split: Split | null;
};

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

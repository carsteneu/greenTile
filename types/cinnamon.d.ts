/*
 * Ambient types for the Cinnamon/GJS runtime surface greenTile uses — typed
 * as precisely as cheap, `any` where the GI surface is wide compared to our
 * grip on it (St widget construction, Clutter event objects, Meta structs).
 * Dev-only: consumed by tsc, never part of the release zip.
 *
 * The runtime model matches Cinnamon's fileUtils.js createExports: module
 * code runs inside a 'use strict'-wrapped function with require/exports/
 * module bound, and `imports` and `global` are true globals of the shell.
 */



type AnyRecord = Record<string, any>;

/** SignalManager as used in lib/ (only the used subset is declared). */
declare class SignalManager {
    constructor(prefix?: string);
    connect(obj: object, signalName: string, callback: (...args: any[]) => void, prefix?: string): void;
    connectArray(objs: object[]): void;
    disconnect(sigObj: unknown): void;
    disconnectAll(): void;
    destroy(): void;
}

/** GLib surface greenTile calls or passes through as a dependency. */
declare const GLibNS: {
    get_monotonic_time(): number;
    get_home_dir(): string;
    get_user_data_dir(): string;
    SOURCE_REMOVE: boolean;
};

/**
 * Muffin Meta surface greenTile calls (Meta-0.typelib, muffin 6.6) — narrow
 * on purpose so name typos like Meta.MaximizeFlags.HORIZONTL fail tsc
 * (todo_fixes issue 12). Widen only with a typelib/runtime check.
 */
declare const MetaNS: {
    MaximizeFlags: { HORIZONTAL: number; VERTICAL: number };
    WindowType: { NORMAL: number };
    MotionDirection: { UP: number; DOWN: number; LEFT: number; RIGHT: number };
    /** Builtin action ids, resolved by name at runtime (focus.js manager route);
     * members absent on a generation fall back to the direct Meta handler. */
    KeyBindingAction: {
        PUSH_TILE_LEFT?: number;
        PUSH_TILE_RIGHT?: number;
        PUSH_TILE_UP?: number;
        PUSH_TILE_DOWN?: number;
    };
    /** GrabOp values are compared by identity via Object.keys lookup (lib/tiling/grab.js). */
    GrabOp: AnyRecord;
    Display: AnyRecord;
    WorkspaceManager: AnyRecord;
    MonitorManager: { get(): AnyRecord };
    keybindings_set_custom_handler(name: string, callback: (...args: any[]) => void): void;
};

/**
 * imports.ui.main surface greenTile calls (Cinnamon main.js) — narrow on
 * purpose so layoutManager.monitorz-style typos fail tsc (issue 12).
 * Direct uses only: Main.uiGroup and Main.osdWindowManager flow in through
 * the AnyRecord deps objects (lib/app/app.js) and stay untyped here.
 */
declare const MainNS: {
    layoutManager: {
        monitors: CinnamonMonitor[];
        primaryIndex: number;
        addChrome(actor: AnyRecord): void;
        removeChrome(actor: AnyRecord): void;
    };
    keybindingManager: {
        addHotKey(name: string, binding: unknown, callback: (...args: any[]) => void, data?: unknown): void;
        removeHotKey(name: string): void;
    };
    getTabList(): CinnamonWindow[];
    panelManager: { getPanelsInMonitor(monitorIndex: number): Array<AnyRecord> };
    /** Modal record on success, false when the shell refused (panel.js checks truthiness). */
    pushModal(actor: AnyRecord): AnyRecord | boolean;
    popModal(actor: AnyRecord): void;
};

declare const imports: {
    gi: {
        St: any;
        Clutter: any;
        Gio: AnyRecord;
        GObject: AnyRecord;
        Meta: typeof MetaNS;
        Pango: AnyRecord;
        Cinnamon: AnyRecord;
        GLib: typeof GLibNS;
    };
    ui: {
        main: typeof MainNS;
        panel: AnyRecord;
        settings: AnyRecord;
        tooltips: AnyRecord;
    };
    misc: {
        signalManager: {
            SignalManager: typeof SignalManager;
        };
        util: AnyRecord;
    };
    mainloop: {
        idle_add(callback: () => boolean, priority?: number): number;
        timeout_add(ms: number, callback: () => boolean, priority?: number): number;
        source_remove(id: number): void;
    };
    gettext: {
        bindtextdomain(domain: string, dir: string): void;
        dgettext(domain: string, msgid: string): string;
        gettext(msgid: string): string;
    };
} & ImportsExtensions;

/**
 * The shipped module tree as both Cinnamon generations expose it on the
 * imports root (6.6 main.js _addXletDirectoriesToSearchPath, upstream
 * installXletImporter): imports.extensions['greenTile@carsteneu'] — see
 * XletTree for what the surface type covers.
 */
type ImportsExtensions = {
    extensions: {
        'greenTile@carsteneu': XletTree;
    } & Record<string, unknown>;
};

/**
 * The shipped module tree as both Cinnamon generations expose it on the
 * imports root. Typing flows through the GENERATED mirror in types/xlet/
 * (npm run gen:types): real signatures from the shipped JSDoc — a wrong
 * argument on a cross-module call fails tsc, and the drift guard test
 * keeps the mirror in sync with lib/.
 */
type XletTree = {
    lib: {
        app: {
            app: typeof import('./xlet/app/app');
            config: typeof import('./xlet/app/config');
        };
        model: {
            accent: typeof import('./xlet/model/accent');
            drop: typeof import('./xlet/model/drop');
            editor: typeof import('./xlet/model/editor');
            exclude: typeof import('./xlet/model/exclude');
            fill: typeof import('./xlet/model/fill');
            focus: typeof import('./xlet/model/focus');
            gap: typeof import('./xlet/model/gap');
            layouts: typeof import('./xlet/model/layouts');
            lifecycle: typeof import('./xlet/model/lifecycle');
            monitor: typeof import('./xlet/model/monitor');
            'panel-size': typeof import('./xlet/model/panel-size');
            'settings-keys': typeof import('./xlet/model/settings-keys');
            single: typeof import('./xlet/model/single');
            split: typeof import('./xlet/model/split');
            state: typeof import('./xlet/model/state');
            swap: typeof import('./xlet/model/swap');
            teardown: typeof import('./xlet/model/teardown');
            theme: typeof import('./xlet/model/theme');
        };
        runtime: {
            auto: typeof import('./xlet/runtime/auto');
            border: typeof import('./xlet/runtime/border');
            drop: typeof import('./xlet/runtime/drop');
            exclusions: typeof import('./xlet/runtime/exclusions');
            focus: typeof import('./xlet/runtime/focus');
            hotkeys: typeof import('./xlet/runtime/hotkeys');
            monitors: typeof import('./xlet/runtime/monitors');
            'panel-state': typeof import('./xlet/runtime/panel-state');
            placement: typeof import('./xlet/runtime/placement');
            scope: typeof import('./xlet/runtime/scope');
            session: typeof import('./xlet/runtime/session');
            split: typeof import('./xlet/runtime/split');
            theme: typeof import('./xlet/runtime/theme');
        };
        tiling: {
            debug: typeof import('./xlet/tiling/debug');
            'focus-nav': typeof import('./xlet/tiling/focus-nav');
            grab: typeof import('./xlet/tiling/grab');
            layout: typeof import('./xlet/tiling/layout');
            order: typeof import('./xlet/tiling/order');
            place: typeof import('./xlet/tiling/place');
            retile: typeof import('./xlet/tiling/retile');
            screen: typeof import('./xlet/tiling/screen');
            swap: typeof import('./xlet/tiling/swap');
            windows: typeof import('./xlet/tiling/windows');
        };
        ui: {
            draw: typeof import('./xlet/ui/draw');
            editor: typeof import('./xlet/ui/editor');
            i18n: typeof import('./xlet/ui/i18n');
            panel: typeof import('./xlet/ui/panel');
        };
    };
};

/** Cinnamon global object (`global` in the shell). */
declare const global: {
    log(msg: string): void;
    logError(err: unknown): void;
    display: AnyRecord;
    workspace_manager: AnyRecord;
    stage: AnyRecord;
    window_manager: AnyRecord;
    overlay_group: AnyRecord;
    get_current_time(): number;
    get_pointer(): [number, number];
    set_cursor(type: string): void;
    unset_cursor(): void;
};

// Cinnamon extends String with a printf-style format() in its JS framework
// (js/misc/format.js); used for translated "%d"-style literals.
interface String {
    format(...args: unknown[]): string;
}

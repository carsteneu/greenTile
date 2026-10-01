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
        tweener: AnyRecord;
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
 * installXletImporter): imports.extensions['greenTile@carsteneu'].lib.... —
 * typed through typeof import so cross-module references keep full tsc
 * checking (each lib file is a module under moduleDetection force). Other
 * xlets resolve to unknown.
 */
type ImportsExtensions = {
    extensions: {
        'greenTile@carsteneu': XletTree;
    } & Record<string, unknown>;
};

/**
 * The shipped module tree as both Cinnamon generations expose it on the
 * imports root (6.6 main.js _addXletDirectoriesToSearchPath, upstream
 * installXletImporter): imports.extensions['greenTile@carsteneu'].lib...*.
 * Value type is any per module: the natively imported namespace carries only
 * runtime-level (not type-level) exports, so tsc checks each module
 * internally while the public name surface is pinned by
 * tests/architecture/native-resolver.test.js against the real loader.
 * @type {Record<string, Record<string, any>>}
 */
type XletTree = Record<string, Record<string, any>>;

/** Cinnamon global object (`global` in the shell). */
declare const global: {
    log(msg: string): void;
    logError(err: unknown): void;
    display: AnyRecord;
    screen: AnyRecord;
    stage: AnyRecord;
    window_manager: AnyRecord;
    workspace_manager: AnyRecord;
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

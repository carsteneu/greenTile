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

/**
 * Cinnamon resolves every require against the xlet root, not the importing
 * file (fileUtils.js requireModule) — a specifier starting './lib/…' means
 * <xlet-root>/lib/… from anywhere. tsc can only resolve file-relative, so this
 * wildcard types those modules as `any` instead of failing them. *The* escape
 * for cross-module shape flow; everything inside a module stays fully checked.
 * (Pattern may not start with './' — TS2436 — but tsc still registers the
 * template; the one diagnostic is suppressed below.)
 * @ts-ignore */
declare module "./lib/*";

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
    SOURCE_REMOVE: boolean;
};

declare const imports: {
    gi: {
        St: any;
        Clutter: any;
        Gio: AnyRecord;
        GObject: AnyRecord;
        Meta: AnyRecord;
        Pango: AnyRecord;
        Cinnamon: AnyRecord;
        GLib: typeof GLibNS;
    };
    ui: {
        main: AnyRecord;
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
};

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

'use strict';
// Fake Cinnamon runtime for lifecycle tests against the REAL greenTile.js.
// Behavioral fakes cover the paths greenTile touches on enable()/disable() and
// the monitors-changed recreation: signal hubs on Main/global objects, the
// keybinding manager, Meta custom keybindings, one shared GLib source-id space,
// the ExtensionSettings slot model (register on construct, finalize nulls the
// slot; setValue alone does not fire IN bindings — cinnamonDBus remoteUpdate
// does, learning #95107) and a queued Gio.DBus DisplayConfig reply the test
// drives explicitly. Everything else falls into a deep stub so a load-time
// binding (imports.ui.tooltips, gettext, ...) never throws.
const makeStub = () => new Proxy(function () {}, {
    apply: () => makeStub(),
    construct: () => makeStub(),
    get: (t, p) => {
        if (p === Symbol.toPrimitive)
            return () => '';
        return makeStub();
    },
    set: () => true,
});

const proxyStub = (branch) => new Proxy(function () {}, {
    get: (t, p) => {
        if (p === Symbol.toPrimitive)
            return () => '';
        if (p in branch)
            return branch[p];
        return makeStub();
    },
    apply: () => makeStub(),
    construct: () => makeStub(),
});

const signalHub = (name) => {
    const handlers = [];
    let nextId = 1;
    return {
        __hub: name,
        handlers,
        connect(sigName, callback) {
            const id = nextId++;
            handlers.push({ sigName, callback, id });
            return id;
        },
        disconnect(id) {
            const at = handlers.findIndex((h) => h.id === id);
            if (at === -1)
                throw new Error(name + ': no such signal handler ' + id);
            handlers.splice(at, 1);
        },
        count(sigName) {
            return handlers.filter((h) => !sigName || h.sigName === sigName).length;
        },
        emit(sigName, ...args) {
            for (const h of handlers.slice())
                if (h.sigName === sigName)
                    h.callback(...args);
        },
    };
};

// Explicit "schema": every key greenTile reads on the tested paths must have a
// default, a missing one throws with a precise message instead of passing
// undefined into the code under test.
const SETTINGS_DEFAULTS = {
    autotile6hotkey: '<Super>6',
    autotile3hotkey: '<Super>3',
    autotileautohotkey: '<Super>a',
    autotileoffhotkey: '<Super>o',
    presetHotkey: '<Super>p',
    excludeHotkey: '<Super>x',
    resizeWiderHotkey: '<Super>w',
    resizeNarrowerHotkey: '<Super>n',
    resizeTallerHotkey: '<Super>t',
    resizeShorterHotkey: '<Super>s',
    swapLeftHotkey: '<Super>Left',
    swapRightHotkey: '<Super>Right',
    swapUpHotkey: '<Super>Up',
    swapDownHotkey: '<Super>Down',
    exclusions: [],
    excludeAppPicker: 'picker',
    layoutsMigrated: false,
    wsPresets: '{}',
    autoWorkspaces: [],
    layouts: '',
    presets: '[]',
    panelTheme: false,
    accentMode: false,
    accentColor: '',
    stateMode: '',
    stateColor: '',
    focusBorder: false,
    fillSingleWindow: false,
};

const createCinnamonEnv = (options) => {
    const settingsDefaults = Object.assign({}, SETTINGS_DEFAULTS, (options && options.settingsDefaults) || {});
    const env = {
        logs: [],
        logErrors: [],
        queuedDBus: [],
        workspaces: [],
        customBindings: new Map(),
        timers: new Map(),
    };

    // --- Main.* objects
    env.layoutManager = Object.assign(signalHub('layoutManager'), {
        monitors: [],
        primaryIndex: 0,
        addChrome() {},
        removeChrome() {},
    });
    env.themeManager = signalHub('themeManager');
    env.keybindingManager = {
        hotkeys: new Map(),
        addHotKey(name, binding, cb, cbData) {
            this.hotkeys.set(name, { binding, cb, cbData });
        },
        removeHotKey(name) {
            this.hotkeys.delete(name);
        },
    };
    const mainBranch = {
        layoutManager: env.layoutManager,
        keybindingManager: env.keybindingManager,
        themeManager: env.themeManager,
        pushModal: () => 0,
        popModal() {},
        uiGroup: { add_child() {}, remove_child() {} },
        getTabList: () => null,
    };
    env.ui = proxyStub({
        settings: {
            BindingDirection: { IN: 'in' },
            ExtensionSettings: class {
                constructor(owner, uuid) {
                    return makeSettings(uuid);
                }
            },
        },
        main: mainBranch,
    });

    // --- global.* objects
    env.screen = Object.assign(signalHub('screen'), {
        get_n_workspaces() {
            return env.workspaces.length;
        },
        get_workspace_by_index(i) {
            return env.workspaces[i];
        },
    });
    env.display = Object.assign(signalHub('display'), {
        focus_window: null,
        get_monitor_name(i) {
            return 'FakeMonitor-' + i;
        },
    });
    env.workspaceManager = signalHub('workspaceManager');
    env.windowManager = signalHub('windowManager');
    env.appSystem = Object.assign(signalHub('AppSystem'), {
        get_all() {
            return [];
        },
    });
    env.stage = makeStub();
    env.overlayGroup = { add_actor() {}, remove_actor() {} };

    env.global = new Proxy(function () {}, {
        get: (t, p) => {
            if (p === Symbol.toPrimitive)
                return () => '';
            if (p === 'display')
                return env.display;
            if (p === 'screen')
                return env.screen;
            if (p === 'workspace_manager')
                return env.workspaceManager;
            if (p === 'window_manager')
                return env.windowManager;
            if (p === 'stage')
                return env.stage;
            if (p === 'overlay_group')
                return env.overlayGroup;
            if (p === 'log')
                return (...a) => env.logs.push(a.map(String).join(' '));
            if (p === 'logError')
                return (...a) => env.logErrors.push(a.map(String).join(' '));
            if (p === 'get_current_time')
                return () => 0;
            if (p === 'get_pointer')
                return () => [0, 0];
            if (p === 'set_cursor' || p === 'unset_cursor')
                return () => {};
            return makeStub();
        },
        apply: () => makeStub(),
        construct: () => makeStub(),
    });

    // --- one shared source-id space, like GLib's main context
    let nextTimerId = 1;
    env.mainloop = {
        timeout_add(ms, cb) {
            const id = nextTimerId++;
            env.timers.set(id, { kind: 'mainloop', ms, cb });
            return id;
        },
        source_remove(id) {
            if (!env.timers.delete(id))
                throw new Error('mainloop: no such source ' + id);
        },
    };
    env.glib = {
        PRIORITY_DEFAULT: 0,
        SOURCE_REMOVE: false,
        timeout_add(priority, ms, cb) {
            const id = nextTimerId++;
            env.timers.set(id, { kind: 'glib', priority, ms, cb });
            return id;
        },
        Source: {
            remove(id) {
                if (!env.timers.delete(id))
                    throw new Error('glib: no such source ' + id);
            },
        },
        get_monotonic_time: () => 0,
        get_home_dir: () => '/home/fake',
        get_user_cache_dir: () => '/home/fake/.cache',
        build_filenamev: (parts) => parts.join('/'),
        path_get_dirname: (p) => p.split('/').slice(0, -1).join('/') || '.',
        mkdir_with_parents: () => true,
        file_set_contents: () => true,
    };

    // --- settings: Cinnamon slot model, one object per uuid
    env.settingsSlots = new Map();
    env.settingsInstances = [];
    const makeSettings = (uuid) => {
        const values = new Map(Object.entries(settingsDefaults));
        const instance = {
            uuid,
            bindings: [],
            finalized: false,
            bind(key, prop, cb, data) {
                // divergence from real Cinnamon: bindWithObject defines the bound
                // property on the bind object; greenTile.js only reads via
                // getValue/setValue and bound callbacks — keep the fakes frozen
                // so the lifecycle baseline numbers stay comparable
                this.bindings.push({ key, prop, cb, data });
            },
            bindProperty(direction, key, prop, cb, data) {
                return this.bind(key, prop, cb, data);
            },
            setOptions() {},
            getValue(key) {
                if (!values.has(key))
                    throw new Error('fake settings: no default for "' + key + '" (uuid ' + uuid + ')');
                return values.get(key);
            },
            setValue(key, v) {
                values.set(key, v);
            },
            finalize() {
                this.finalized = true;
                env.settingsSlots.set(uuid, null);
            },
        };
        env.settingsInstances.push(instance);
        env.settingsSlots.set(uuid, instance);
        return instance;
    };

    // --- gi branches (unknown namespaces fall into deep stubs)
    const gio = {
        DBusCallFlags: { NONE: 'none' },
        DBus: {
            session: {
                call(bus, path, iface, method, ...rest) {
                    // GJS passes callback (+ optional user_data) last; queue the
                    // last function regardless of the exact trailing shape
                    const fns = rest.filter((a) => typeof a === 'function');
                    env.queuedDBus.push(fns[fns.length - 1] || (() => {}));
                },
            },
        },
        SettingsSchemaSource: {
            get_default: () => null,
        },
    };
    const meta = {
        keybindings_set_custom_handler(name, fn) {
            if (fn === null)
                env.customBindings.delete(name);
            else
                env.customBindings.set(name, fn);
        },
        MaximizeFlags: { HORIZONTAL: 2, VERTICAL: 4 },
        MonitorManager: {
            get: () => ({ get_monitor_for_connector: () => -1 }),
        },
    };
    const cinnamon = {
        AppSystem: { get_default: () => env.appSystem },
        WindowTracker: { get_default: () => null },
        Cursor: { RESIZE_BOTTOM_RIGHT: 0 },
    };
    const st = {
        Bin: class {
            constructor(opts) {
                Object.assign(this, opts);
                this.style = this.style || '';
            }
            hide() {}
            show() {}
            destroy() {}
        },
        ThemeContext: { get_for_stage: () => makeStub() },
    };
    env.gi = proxyStub({ GLib: env.glib, Gio: gio, Meta: meta, Cinnamon: cinnamon, St: st });

    env.imports = new Proxy(function () {}, {
        get: (t, p) => {
            if (p === Symbol.toPrimitive)
                return () => '';
            if (p === 'ui')
                return env.ui;
            if (p === 'gi')
                return env.gi;
            if (p === 'mainloop')
                return env.mainloop;
            return makeStub();
        },
        apply: () => makeStub(),
        construct: () => makeStub(),
    });

    // --- report helpers
    env.greenTileHotkeys = () => [...env.keybindingManager.hotkeys.keys()].filter((n) => n.startsWith('greenTile-')).sort();
    env.liveTimers = () => [...env.timers.entries()].map(([id, t]) => ({ id, kind: t.kind, ms: t.ms }));
    env.totalHandlers = () => [env.layoutManager, env.themeManager, env.screen, env.display, env.workspaceManager, env.windowManager, env.appSystem]
        .reduce((sum, hub) => sum + hub.handlers.length, 0);
    env.flushDisplayConfigNoReply = () => {
        const queued = env.queuedDBus;
        env.queuedDBus = [];
        for (const cb of queued)
            cb({ call_finish() { throw new Error('fake: no DisplayConfig reply'); } }, null);
    };
    return env;
};

module.exports = { createCinnamonEnv, SETTINGS_DEFAULTS };

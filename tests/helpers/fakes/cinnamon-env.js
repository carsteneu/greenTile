'use strict';
// Fake Cinnamon runtime for lifecycle tests against the REAL extension.js.
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
            {return () => '';}
        return makeStub();
    },
    set: () => true,
});

const proxyStub = (branch) => new Proxy(function () {}, {
    get: (t, p) => {
        if (p === Symbol.toPrimitive)
            {return () => '';}
        if (p in branch)
            {return branch[p];}
        return makeStub();
    },
    apply: () => makeStub(),
    construct: () => makeStub(),
});

// Fake SignalManager mirroring /usr/share/cinnamon/js/misc/signalManager.js:
// storage entries [sigName, obj, callback, id] with the REAL connect id the
// target returns (the runtime Scope releases obj.disconnect per that id; the
// real SignalManager stores obj.connect()'s return value the same way),
// identical connects dedupe (a second connect on (sigName, obj, callback) is
// a no-op), getSignals drives the runtime Scope release path (obj.disconnect
// per entry by the scope itself) and disconnectAllSignals only resets the
// storage afterwards.
class FakeSignalManager {
    constructor() {
        this._storage = [];
    }
    connect(obj, sigName, callback, bind, force) {
        if (!force
            && this._storage.some(([s, o, c]) => s === sigName && o === obj && c === callback))
            {return;}
        const id = obj.connect(sigName, callback);
        this._storage.push([sigName, obj, callback, id]);
        return id;
    }
    getSignals() {
        return this._storage.slice();
    }
    disconnectAllSignals() {
        this._storage.length = 0;
    }
}

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
                {throw new Error(name + ': no such signal handler ' + id);}
            handlers.splice(at, 1);
        },
        count(sigName) {
            return handlers.filter((h) => !sigName || h.sigName === sigName).length;
        },
        emit(sigName, ...args) {
            for (const h of handlers.slice())
                {if (h.sigName === sigName)
                    {h.callback(...args);}}
        },
    };
};

// Explicit "schema": every key greenTile reads on the tested paths must have a
// default, a missing one throws with a precise message instead of passing
// undefined into the code under test.
const SETTINGS_DEFAULTS = {
    columns6Hotkey: '<Super>6',
    columns3Hotkey: '<Super>3',
    autoOnHotkey: '<Super>a',
    autoOffHotkey: '<Super>o',
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
    layouts: '',
    presets: '[]',
    panelTheme: false,
    accentMode: false,
    accentColor: '',
    stateMode: '',
    stateColor: '',
    focusBorder: false,
    fillSingleWindow: false,
    panelSize: '',
    windowGap: 8,
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
        cancellables: [],
        tabList: [],
        uiGroupChildren: [],
        overlayChildren: [],
        // chrome surface accounting for the preset panel (additive: the
        // original addChrome/removeChrome were no-ops)
        chromeChildren: [],
        gioSettings: [],
        // schema values for fake Gio.Settings.get_string, keyed by schema_id:
        // { 'org.x.apps.portal': { 'color-scheme': 'prefer-dark' } }
        schemaValues: {},
    };

    // --- Main.* objects
    env.layoutManager = Object.assign(signalHub('layoutManager'), {
        monitors: [],
        primaryIndex: 0,
        addChrome(a) {
            if (!env.chromeChildren.includes(a))
                {env.chromeChildren.push(a);}
        },
        removeChrome(a) {
            const at = env.chromeChildren.indexOf(a);
            if (at !== -1)
                {env.chromeChildren.splice(at, 1);}
        },
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
    env.uiGroup = {
        children: env.uiGroupChildren,
        add_child(a) {
            this.children.push(a);
        },
        remove_child(a) {
            const at = this.children.indexOf(a);
            if (at !== -1)
                {this.children.splice(at, 1);}
        },
    };
    const mainBranch = {
        layoutManager: env.layoutManager,
        keybindingManager: env.keybindingManager,
        themeManager: env.themeManager,
        pushModal: () => 0,
        popModal() {},
        uiGroup: env.uiGroup,
        getTabList: () => env.tabList,
    };
    env.ui = proxyStub({
        settings: {
            BindingDirection: { IN: 'in' },
            ExtensionSettings: class {
                constructor(owner, uuid) {
                    return makeSettings(uuid, owner);
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
    env.workspaceManager = Object.assign(signalHub('workspaceManager'), {
        get_workspace_by_index(i) {
            return env.workspaces[i];
        },
    });
    // active workspace identity for the auto-tiling observer paths; null until a
    // test opts in (windows with get_workspace() -> null match it)
    env.activeWorkspace = null;
    env.workspaceManager.get_active_workspace = () => env.activeWorkspace;
    env.windowManager = signalHub('windowManager');
    env.appSystem = Object.assign(signalHub('AppSystem'), {
        get_all() {
            return [];
        },
    });
    env.stage = signalHub('stage');
    env.overlayGroup = {
        add_actor(a) {
            env.overlayChildren.push(a);
        },
        remove_actor(a) {
            const at = env.overlayChildren.indexOf(a);
            if (at !== -1)
                {env.overlayChildren.splice(at, 1);}
        },
    };

    env.global = new Proxy(function () {}, {
        get: (t, p) => {
            if (p === Symbol.toPrimitive)
                {return () => '';}
            if (p === 'display')
                {return env.display;}
            if (p === 'screen')
                {return env.screen;}
            if (p === 'workspace_manager')
                {return env.workspaceManager;}
            if (p === 'window_manager')
                {return env.windowManager;}
            if (p === 'stage')
                {return env.stage;}
            if (p === 'overlay_group')
                {return env.overlayGroup;}
            if (p === 'log')
                {return (...a) => env.logs.push(a.map(String).join(' '));}
            if (p === 'logError')
                {return (...a) => env.logErrors.push(a.map(String).join(' '));}
            if (p === 'get_current_time')
                {return () => 0;}
            if (p === 'get_pointer')
                {return () => [0, 0];}
            if (p === 'set_cursor' || p === 'unset_cursor')
                {return () => {};}
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
                {throw new Error('mainloop: no such source ' + id);}
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
                    {throw new Error('glib: no such source ' + id);}
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
    const makeSettings = (uuid, owner) => {
        const values = new Map(Object.entries(settingsDefaults));
        const instance = {
            uuid,
            bindings: [],
            finalized: false,
            callLog: [],
            bind(key, prop, cb, data) {
                // mirrors /usr/share/cinnamon/js/ui/settings.js bindWithObject:
                // the bound property is a live getter/setter on the bind object
                // (the owner passed to the ExtensionSettings constructor), and
                // the callback fires bound to that object
                if (owner) {
                    Object.defineProperty(owner, prop, {
                        enumerable: true,
                        configurable: true,
                        get: () => (values.has(key) ? values.get(key) : undefined),
                        set: (v) => instance.setValue(key, v),
                    });
                }
                this.bindings.push({ key, prop, cb: cb ? () => cb.call(owner) : undefined, data });
            },
            bindProperty(direction, key, prop, cb, data) {
                return this.bind(key, prop, cb, data);
            },
            setOptions() {},
            getValue(key) {
                if (!values.has(key))
                    {throw new Error('fake settings: no default for "' + key + '" (uuid ' + uuid + ')');}
                return values.get(key);
            },
            setValue(key, v) {
                this.callLog.push({ op: 'setValue', key, value: v, finalized: this.finalized });
                values.set(key, v);
            },
            finalize() {
                this.finalized = true;
                this.callLog.push({ op: 'finalize' });
                env.settingsSlots.set(uuid, null);
            },
        };
        env.settingsInstances.push(instance);
        env.settingsSlots.set(uuid, instance);
        return instance;
    };

    // --- gi branches (unknown namespaces fall into deep stubs)
    // schema source: every lookup succeeds (greenTile registers the portal and
    // cinnamon theme schemas); a test opts out by nulling env.schemaSource
    env.schemaSource = { lookup: () => ({}) };
    // fake St.Theme: records the stylesheet load/unload balance on the live
    // theme object (unload of a not-loaded sheet still lands in unloads, real
    // St would throw — the production code releases it in its own try/catch)
    env.stTheme = {
        loads: [],
        unloads: [],
        load_stylesheet(path) {
            this.loads.push(path);
        },
        unload_stylesheet(path) {
            const at = this.loads.indexOf(path);
            if (at !== -1)
                {this.loads.splice(at, 1);}
            this.unloads.push(path);
        },
    };
    const gio = {
        DBusCallFlags: { NONE: 'none' },
        Cancellable: class {
            constructor() {
                this.cancelled = false;
                env.cancellables.push(this);
            }
            cancel() {
                this.cancelled = true;
            }
            is_cancelled() {
                return this.cancelled;
            }
        },
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
            get_default: () => env.schemaSource,
        },
        Settings: class {
            constructor(opts) {
                this.schema_id = opts && opts.schema_id;
                this._handlers = [];
                this._nextHandlerId = 1;
                env.gioSettings.push(this);
            }
            // reads ride the test's schemaValues (empty string keeps the theme
            // resolution falling back: '' is falsy, portal scheme and cinnamon
            // name then resolve light)
            get_string(key) {
                const perSchema = env.schemaValues[this.schema_id];
                return (perSchema && perSchema[key]) || '';
            }
            get_uint() {
                return 500;
            }
            get_boolean() {
                return false;
            }
            connect(sigName, callback) {
                const id = this._nextHandlerId++;
                this._handlers.push({ sigName, callback, id });
                return id;
            }
            disconnect(id) {
                const at = this._handlers.findIndex((h) => h.id === id);
                if (at !== -1)
                    {this._handlers.splice(at, 1);}
            }
            count(sigName) {
                return this._handlers.filter((h) => !sigName || h.sigName === sigName).length;
            }
        },
    };
    const meta = {
        keybindings_set_custom_handler(name, fn) {
            if (fn === null)
                {env.customBindings.delete(name);}
            else
                {env.customBindings.set(name, fn);}
        },
        MaximizeFlags: { HORIZONTAL: 2, VERTICAL: 4 },
        // value 6 mirrors the real Meta.WindowType.NORMAL enum weight; only the
        // identity comparison with greenTile's own Meta.WindowType.NORMAL read
        // matters, which is the same fake object
        WindowType: { NORMAL: 6, DIALOG: 3 },
        GrabOp: { NONE: 0, MOVING: 'moving', KEYBOARD_MOVING: 'keyboard-moving', RESIZING_E: 'resizing-e' },
        MonitorManager: {
            get: () => ({ get_monitor_for_connector: () => -1 }),
        },
    };
    const cinnamon = {
        AppSystem: { get_default: () => env.appSystem },
        WindowTracker: { get_default: () => ({ get_window_app: () => ({}) }) },
        Cursor: { RESIZE_BOTTOM_RIGHT: 0 },
    };
    // Fake St actor wired like a signalHub-bearing node: records handler
    // connect/disconnect and its destroy state. Covers every call the preset
    // panel open/close path makes on its widgets.
    class FakeActor {
        constructor(opts = {}) {
            Object.assign(this, opts);
            this.style = this.style || '';
            this.destroyed = false;
            this.children = [];
            this._handlers = [];
            this._nextHandlerId = 1;
        }
        connect(sigName, cb) {
            const id = this._nextHandlerId++;
            this._handlers.push({ sigName, cb, id });
            return id;
        }
        disconnect(id) {
            const at = this._handlers.findIndex((h) => h.id === id);
            if (at === -1)
                {throw new Error('fake actor: no such signal handler ' + id);}
            this._handlers.splice(at, 1);
        }
        count(sigName) {
            return this._handlers.filter((h) => !sigName || h.sigName === sigName).length;
        }
        emit(sigName, ...args) {
            for (const h of this._handlers.slice())
                {if (h.sigName === sigName)
                    {h.cb(...args);}}
        }
        add(child) {
            if (!this.children.includes(child))
                {this.children.push(child);}
        }
        add_actor(child) {
            this.add(child);
        }
        remove_child(child) {
            const at = this.children.indexOf(child);
            if (at !== -1)
                {this.children.splice(at, 1);}
        }
        destroy_all_children() {
            this.children = [];
        }
        set_child(child) {
            this.child = child;
        }
        hide() {}
        show() {}
        set_style() {}
        raise_top() {}
        set_position(x, y) {
            this.px = x;
            this.py = y;
        }
        set_size() {}
        set_width() {}
        set_height() {}
        get_height() {
            return 0;
        }
        get_size() {
            return [600, 400];
        }
        get_position() {
            return [0, 0];
        }
        get_allocation_box() {
            return { x1: 0, y1: 0, x2: 600, y2: 400 };
        }
        get_preferred_height() {
            return [0, 100];
        }
        contains(actor) {
            return actor === this || this.children.includes(actor);
        }
        grab_key_focus() {}
        queue_repaint() {}
        destroy() {
            if (this.destroyed)
                {return;}
            this.destroyed = true;
            this._handlers.length = 0;
        }
    }
    const st = {
        Align: { START: 'start', MIDDLE: 'middle', END: 'end' },
        PolicyType: { NEVER: 'never', AUTOMATIC: 'automatic' },
        Bin: class extends FakeActor {},
        Widget: class extends FakeActor {},
        BoxLayout: class extends FakeActor {},
        Button: class extends FakeActor {},
        Label: class extends FakeActor {},
        ScrollView: class extends FakeActor {},
        Entry: class extends FakeActor {},
        DrawingArea: class extends FakeActor {},
        ThemeContext: { get_for_stage: () => ({ get_theme: () => env.stTheme }) },
    };
    env.gi = proxyStub({ GLib: env.glib, Gio: gio, Meta: meta, Cinnamon: cinnamon, St: st });

    env.imports = new Proxy(function () {}, {
        get: (t, p) => {
            if (p === Symbol.toPrimitive)
                {return () => '';}
            if (p === 'ui')
                {return env.ui;}
            if (p === 'gi')
                {return env.gi;}
            if (p === 'mainloop')
                {return env.mainloop;}
            if (p === 'misc')
                {return proxyStub({ signalManager: { SignalManager: FakeSignalManager } });}
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
            {cb({ call_finish() { throw new Error('fake: no DisplayConfig reply'); } }, null);}
    };
    return env;
};

module.exports = { createCinnamonEnv, SETTINGS_DEFAULTS };

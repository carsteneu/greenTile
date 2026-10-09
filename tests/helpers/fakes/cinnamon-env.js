'use strict';
// Fake Cinnamon runtime for lifecycle tests against the REAL extension.js.
// Behavioral fakes cover the paths greenTile touches on enable()/disable() and
// the monitors-changed recreation: signal hubs on Main/global objects, the
// keybinding manager, Meta custom keybindings, one shared GLib source-id space,
// the ExtensionSettings slot model (register on construct, finalize nulls the
// slot; setValue alone does not fire IN bindings — cinnamonDBus remoteUpdate
// does, learning #95107) and a queued Gio.DBus DisplayConfig reply the test
// drives explicitly. The runtime-critical Cinnamon namespaces (global
// subobjects, imports.ui.main, tooltips, panel, the imports.gi
// namespace list, imports.misc) are strict: unknown member access throws
// (issue 13), so a typo'd runtime access fails the test. Remaining loose ends
// (top-level fallbacks like imports.gettext) fall into a deep stub so a
// load-time binding never throws.
const { createXletImporter } = require('../native-importer');
const { UUID: XLET_UUID } = require('../cinnamon-loader');

const REPO_ROOT = require('node:path').join(__dirname, '..', '..', '..');

// GJS ships the String.prototype.format extension (SpiderMonkey %_ format,
// used across the Cinnamon js tree); the fake gettext returns real strings,
// so the shipped `_('…').format(x)` call sites need the same surface here.
// Covers the dialect greenTile uses: %s, %d, %f, %x and a literal %%.
if (!String.prototype.format) {
    Object.defineProperty(String.prototype, 'format', {
        value: function (...args) {
            let i = 0;
            return this.replace(/%([sdfx%])/g, (_, c) => {
                if (c === '%') {
                    return '%';
                }
                const v = args[i++];
                if (c === 'd') {
                    return String(Math.round(Number(v)));
                }
                if (c === 'f') {
                    return String(Number(v));
                }
                if (c === 'x') {
                    return Number(v).toString(16);
                }
                return String(v);
            });
        },
        writable: true,
        configurable: true,
    });
}

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

// Strict namespace (todo_fixes issue 13): known members pass through by
// reference, unknown ones THROW — a typo'd runtime access fails the running
// test instead of silently stubbing along. Branch contents stay behavior-
// identical to the former silent stubs.
const strictNs = (name, branch) => new Proxy(function () {}, {
    get: (t, p) => {
        if (p === Symbol.toPrimitive)
            {return () => '';}
        // non-string keys (util.inspect, JSON.stringify, engine probes) never
        // member-typo on the lib side — silent to keep debug tooling usable
        if (typeof p !== 'string')
            {return makeStub();}
        if (Object.prototype.hasOwnProperty.call(branch, p))
            {return branch[p];}
        throw new Error('fake ' + name + ': unknown member "' + p + '"');
    },
    apply: () => {
        throw new Error('fake ' + name + ': namespaces are not callable');
    },
    construct: () => {
        throw new Error('fake ' + name + ': namespaces are not constructible');
    },
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
    // Ordinary fixtures model an install that already completed the built-in
    // exclusion seed; the seed tests explicitly pass false for the first start.
    exclusionsSeeded: true,
    excludeAppPicker: 'picker',
    layouts: '',
    presets: '[]',
    // Ordinary fixtures model a user who already completed the import. Migration
    // tests explicitly pass false to exercise the first-start path.
    starterPresetsImported: true,
    // The starter set this install already has: 1 = the twelve before the span
    // starters, the current generation after the import ran.
    starterGeneration: 2,
    panelTheme: false,
    accentMode: false,
    accentColor: '',
    stateMode: '',
    stateColor: '',
    focusBorder: false,
    fillSingleWindow: false,
    singleWindowMode: 'leave',
    singleWindowMigrated: true,
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
        // pointer position the fake global.get_pointer reports; a test can move it
        // (drag/drop target resolution)
        pointer: [0, 0],
        uiGroupChildren: [],
        overlayChildren: [],
        // chrome surface accounting for the preset panel (additive: the
        // original addChrome/removeChrome were no-ops)
        chromeChildren: [],
        gioSettings: [],
        // every ByteArray handed to Gio.File.replace_contents_bytes_async (the
        // theme's accent stylesheet write); the file ops complete synchronously
        // so enable() still leaves the sheet loaded
        accentWrites: [],
        // stylesheet-file cleanup: paths removed via Gio.File.delete_async
        accentDeletes: [],
        // in-memory file system for the runtime-order store (lib/runtime/orders.js):
        // path -> text (Gio.File.new_for_path load_contents/replace_contents), plus
        // every write with the flags it used (PRIVATE must be among them)
        files: new Map(),
        fileWrites: [],
        fileQueries: [],
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
            a._fakeParent = this;
            this.children.push(a);
        },
        remove_child(a) {
            const at = this.children.indexOf(a);
            if (at !== -1)
                {this.children.splice(at, 1);}
            a._fakeParent = null;
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
        // the shell's workspace-switch effect runs only with animations on and no
        // modal pushed (windowManager.js _switchWorkspace); the auto observer reads both
        animations_enabled: true,
        modalCount: 0,
        // usableArea (lib/tiling/screen.js) iterates this to subtract the
        // surrounding panels' insets — the fake keeps it empty like the old
        // silent stub did
        panelManager: {
            getPanelsInMonitor: () => [],
        },
    };
    // the live imports.ui.main members, for tests that flip a shell state
    // (animations_enabled, modalCount) — the namespace proxy itself is read-only
    env.mainBranch = mainBranch;
    env.ui = strictNs('imports.ui', {
        settings: {
            BindingDirection: { IN: 'in' },
            ExtensionSettings: class {
                constructor(owner, uuid) {
                    return makeSettings(uuid, owner);
                }
            },
        },
        main: strictNs('imports.ui.main', mainBranch),
        tooltips: strictNs('imports.ui.tooltips', {
            // result is discarded by the only call site (lib/ui/panel.js theme button)
            Tooltip: class {
                constructor(_item, _title) {}
            },
        }),
        panel: strictNs('imports.ui.panel', {
            // identity-only switch values in lib/tiling/screen.js usableArea
            PanelLoc: { top: 'top', bottom: 'bottom', left: 'left', right: 'right' },
        }),
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
            // A monitor may carry a stable `name`; a test that unplugs and replugs
            // monitors uses it so the fallback key follows the MONITOR and not its
            // index (real keys come from the connector and survive reindexing).
            const m = env.layoutManager.monitors[i];
            return (m && m.name) ? m.name : 'FakeMonitor-' + i;
        },
    });
    env.workspaceManager = Object.assign(signalHub('workspaceManager'), {
        get_n_workspaces() {
            return env.workspaces.length;
        },
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
            // the window actors (global.get_window_actors): empty unless a test
            // installs its own list in env.windowActors
            if (p === 'get_window_actors')
                {return () => (typeof env.windowActors === 'function' ? env.windowActors() : (env.windowActors || []));}
            if (p === 'get_pointer')
                {return () => env.pointer;}
            if (p === 'set_cursor' || p === 'unset_cursor')
                {return () => {};}
            throw new Error('fake global: unknown property "' + String(p) + '"');
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
        // per-session runtime dir: the restart-order store lives here and is wiped
        // at logout (lib/runtime/orders.js)
        get_user_runtime_dir: () => '/run/user/1000',
        // XDG data dir: gettext mo lookup root (lib/ui/i18n.js), mirrors the
        // real GLib default under $XDG_DATA_HOME unset
        get_user_data_dir: () => '/home/fake/.local/share',
        build_filenamev: (parts) => parts.join('/'),
        path_get_dirname: (p) => p.split('/').slice(0, -1).join('/') || '.',
        mkdir_with_parents: () => true,
        // GLib.Bytes wrapper for the async accent write. The theme passes
        // imports.byteArray.fromString(css) (a Uint8Array); Bytes keeps it
        // verbatim so a test can read the written stylesheet back.
        Bytes: class {
            constructor(contents) {
                if (!(contents instanceof Uint8Array)) {
                    throw new TypeError('GLib.Bytes: expected a ByteArray (Uint8Array)');
                }
                this.contents = contents;
            }
        },
    };

    // --- settings: Cinnamon slot model, one object per uuid
    env.settingsSlots = new Map();
    env.settingsInstances = [];
    // No settings-FILE monitor exists any more (item 5's file surface was removed
    // with the method override it needed): the list stays so a test can assert
    // that no watch is installed.
    env.settingsFileMonitors = [];
    // The framework's settings FILE holds the SCHEMA entry per key plus its value
    // (settings.js merges settings-schema.json into settingsData and saves that),
    // and a settings instance restores its settingsData from it. The file model
    // therefore carries the schema fields, not only the values — a fixture that
    // layers the real settings.js methods on top depends on it (setOptions needs
    // the key's `options`).
    let schema = {};
    try {
        schema = JSON.parse(require('node:fs').readFileSync(REPO_ROOT + '/settings-schema.json', 'utf8'));
    }
    catch (_e) {
        schema = {};
    }
    // The settings FILE the framework keeps (settings.js _saveToFile) and the
    // dialog's whole-file rewrite path. `settingsWriteFile` models the dialog
    // (and any external writer) putting a value on disk; `remoteUpdate()` with no
    // payload models cinnamonDBus.updateSetting -> settings.js remoteUpdate, which
    // reloads the FILE and only then diffs by value.
    env.settingsFiles = new Map();
    env.settingsWriteFile = (uuid, key, value) => {
        let data = {};
        try {
            data = JSON.parse(env.settingsFiles.get(uuid) || '{}');
        }
        catch (_e) {
            data = {};
        }
        data[key] = { value: value };
        env.settingsFiles.set(uuid, JSON.stringify(data, null, 4));
    };
    const makeSettings = (uuid, owner) => {
        const values = new Map(Object.entries(settingsDefaults));
        // A real settings instance loads the file it (or the dialog) wrote before,
        // so own writes survive an App recreation: seed from the persisted file.
        const persisted = env.settingsFiles.get(uuid);
        if (persisted) {
            try {
                const data = JSON.parse(persisted);
                for (const key of Object.keys(data)) {
                    if (data[key] && Object.hasOwn(data[key], 'value')) {
                        values.set(key, data[key].value);
                    }
                }
            }
            catch (_e) {
                // an unreadable file keeps the defaults, like a fresh install
            }
        }
        const optionsStore = new Map();
        const sigHandlers = [];
        let nextSigId = 1;
        const instance = {
            uuid,
            bindings: [],
            finalized: false,
            callLog: [],
            connect(sigName, cb) {
                const id = nextSigId++;
                sigHandlers.push({ sigName, cb, id });
                return id;
            },
            disconnect(id) {
                const at = sigHandlers.findIndex((h) => h.id === id);
                if (at !== -1) {
                    sigHandlers.splice(at, 1);
                }
            },
            count(sigName) {
                return sigHandlers.filter((h) => !sigName || h.sigName === sigName).length;
            },
            emit(sigName, ...args) {
                for (const h of sigHandlers.slice()) {
                    if (h.sigName === sigName) {
                        h.cb(...args);
                    }
                }
            },
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
                        set: (v) => { instance.setValue(key, v); },
                    });
                }
                this.bindings.push({ key, prop, cb: cb ? () => cb.call(owner) : undefined, data });
            },
            bindProperty(direction, key, prop, cb, data) {
                return this.bind(key, prop, cb, data);
            },
            // mirrors settings.js setOptions: stores the widget options (and, in
            // the framework, also rewrites the settings file)
            setOptions(key, pickOptions) {
                this.callLog.push({ op: 'setOptions', key, finalized: this.finalized });
                optionsStore.set(key, pickOptions);
            },
            getValue(key) {
                if (!values.has(key))
                    {throw new Error('fake settings: no default for "' + key + '" (uuid ' + uuid + ')');}
                return values.get(key);
            },
            getDefaultValue(key) {
                if (!schema[key]) throw new Error('fake settings: unknown default ' + key);
                return schema[key].default;
            },
            setValue(key, v) {
                this.callLog.push({ op: 'setValue', key, value: v, finalized: this.finalized });
                // mirrors settings.js _setValue: the field is written and the file
                // SAVED only when the value differs (objects always save). The
                // vendor compares with loose `!=`; greenTile's keys hold booleans,
                // strings and objects, where strict equality is the same decision.
                // It does NOT emit changed::<key> (only _checkSettings does, for a
                // reloaded value that differs).
                if (typeof v === 'object' || values.get(key) !== v) {
                    values.set(key, v);
                    this.saveFile();
                }
            },
            /** Writes the whole settings file, as settings.js _saveToFile does. */
            saveFile() {
                const data = {};
                for (const [k, v] of values) {
                    data[k] = Object.assign({}, schema[k] || {}, { value: v });
                }
                env.settingsFiles.set(uuid, JSON.stringify(data, null, 4));
            },
            // cinnamonDBus.updateSetting -> settings.js remoteUpdate ->
            // _checkSettings: reload the settings payload, diff by VALUE, fire the
            // bound callback and changed::<key> only for a key that really differs.
            // An external write that restores the value already in memory produces
            // no signal here — that is exactly the acceptance boundary the item 5
            // BLOCKED report rests on.
            remoteUpdate(payload) {
                let data = payload;
                if (data === undefined) {
                    // no payload: reload the file, as the framework does
                    try {
                        const stored = JSON.parse(env.settingsFiles.get(uuid) || '{}');
                        data = {};
                        for (const key of Object.keys(stored)) {
                            data[key] = stored[key].value;
                        }
                    }
                    catch (_e) {
                        return;
                    }
                }
                data = data || {};
                for (const key of Object.keys(data)) {
                    const value = data[key];
                    const current = values.get(key);
                    if (current === value || (typeof value === 'object' && JSON.stringify(current) === JSON.stringify(value))) {
                        continue;
                    }
                    values.set(key, value);
                    for (const b of this.bindings) {
                        if (b.key === key && b.cb) {
                            b.cb();
                        }
                    }
                    this.emit('changed::' + key);
                }
            },
            finalize() {
                this.finalized = true;
                this.callLog.push({ op: 'finalize' });
                sigHandlers.length = 0;
                env.settingsSlots.set(uuid, null);
            },
        };
        env.settingsInstances.push(instance);
        env.settingsSlots.set(uuid, instance);
        // the framework writes the file when the xlet's settings are created
        instance.saveFile();
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
            // the real St.Theme.load_stylesheet returns a boolean; the fake mirrors
            // it so a test cannot pass on an undefined return the native call never
            // produces
            return true;
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
        FileMonitorFlags: { NONE: 0, WATCH_MOVES: 2 },
        FileCreateFlags: { NONE: 0, PRIVATE: 1, REPLACE_DESTINATION: 2 },
        FileQueryInfoFlags: { NONE: 0, NOFOLLOW_SYMLINKS: 4 },
        FileType: { UNKNOWN: 0, REGULAR: 1, DIRECTORY: 2, SPECIAL: 3, SHORTCUT: 4, MOUNTABLE: 5 },
        // Synchronous-completing async file ops for the lifecycle tests: the real
        // engine completes asynchronously, but the accent write must land before
        // enable() returns so the sheet is loaded (the async timing itself is
        // covered by tests/runtime/theme.test.js over an on-demand fake).
        File: {
            new_for_path(path) {
                return {
                    get_path: () => path,
                    // lib/runtime/orders.js checks the type and the size BEFORE reading,
                    // so the fake answers from env.fileType / env.fileSize when a test
                    // plants something that is not a small regular file
                    query_info(attrs, flags, _cancellable) {
                        if (env.queryFileThrows) {
                            throw new Error('fake: injected query failure');
                        }
                        env.fileQueries.push({ path, attrs, flags });
                        return {
                            get_file_type: () => (env.fileType !== undefined ? env.fileType : 1),
                            get_size: () => (env.fileSize !== undefined ? env.fileSize : (env.files.get(path) || '').length),
                        };
                    },
                    // lib/runtime/orders.js: synchronous read of the runtime-order store
                    load_contents(_cancellable) {
                        if (env.readFileThrows) {
                            throw new Error('fake: injected read failure');
                        }
                        if (!env.files.has(path)) {
                            return [false, null];
                        }
                        return [true, new TextEncoder().encode(env.files.get(path))];
                    },
                    // lib/runtime/orders.js: atomic (local) replacement; the fake keeps
                    // the text so a test can read it back
                    replace_contents(bytes, _etag, _backup, flags, _cancellable) {
                        if (env.writeFileThrows) {
                            throw new Error('fake: injected write failure');
                        }
                        const text = new TextDecoder().decode(bytes);
                        env.files.set(path, text);
                        env.fileWrites.push({ path, text, flags });
                        return [true, 'fake-etag'];
                    },
                    replace_contents_bytes_async(bytes, _etag, _backup, _flags, _cancellable, cb) {
                        env.accentWrites.push(bytes.contents);
                        cb(null, {});
                    },
                    replace_contents_finish() {
                        return [true, 'fake-etag'];
                    },
                    delete_async(_priority, _cancellable, cb) {
                        env.accentDeletes.push(path);
                        cb(null, {});
                    },
                    delete_finish() {
                        return true;
                    },
                };
            },
        },
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
            get_boolean(key) {
                const perSchema = env.schemaValues[this.schema_id];
                return Boolean(perSchema && perSchema[key] === true);
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
            return true;
        },
        // muffin builtin action ids: push-tile-* are wm builtins, resolved by
        // name through Meta.KeyBindingAction (focus.js manager route)
        KeyBindingAction: {
            PUSH_TILE_LEFT: 71,
            PUSH_TILE_RIGHT: 72,
            PUSH_TILE_UP: 73,
            PUSH_TILE_DOWN: 74,
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
        // a window flagged __noApp has no owning app (app-less dialog/normal window)
        WindowTracker: { get_default: () => ({ get_window_app: (w) => (w && w.__noApp ? null : ({})) }) },
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
            this._fakeParent = null;
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
            child._fakeParent = this;
        }
        add_actor(child) {
            this.add(child);
        }
        remove_child(child) {
            const at = this.children.indexOf(child);
            if (at !== -1)
                {this.children.splice(at, 1);}
            child._fakeParent = null;
        }
        destroy_all_children() {
            for (const child of this.children) {
                child._fakeParent = null;
            }
            this.children = [];
        }
        set_child(child) {
            this.child = child;
        }
        hide() {}
        show() {}
        set_style() {}
        add_style_pseudo_class() {}
        remove_style_pseudo_class() {}
        raise_top() {}
        set_position(x, y) {
            this.px = x;
            this.py = y;
        }
        set_size() {}
        // Records the width request (there is no allocation in the fake): the
        // card grid tests read it back to prove the cards follow the panel width.
        set_width(w) {
            this.width = w;
        }
        set_height(h) {
            this.height = h;
        }
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
            // Cinnamon removes an actor from its parent on destroy
            if (this._fakeParent) {
                this._fakeParent.remove_child(this);
                this._fakeParent = null;
            }
        }
    }
    const st = {
        Align: { START: 'start', MIDDLE: 'middle', END: 'end' },
        PolicyType: { NEVER: 'never', AUTOMATIC: 'automatic' },
        Bin: class extends FakeActor {},
        Widget: class extends FakeActor {},
        BoxLayout: class extends FakeActor {},
        Button: class extends FakeActor {},
        Label: class extends FakeActor {
            constructor(...args) {
                super(...args);
                this.clutter_text = new FakeActor();
            }
        },
        ScrollView: class extends FakeActor {},
        Entry: class extends FakeActor {
            constructor(...args) {
                super(...args);
                this.clutter_text = new FakeActor();
            }
        },
        DrawingArea: class extends FakeActor {},
        ThemeContext: { get_for_stage: () => ({ get_theme: () => env.stTheme, scale_factor: env.themeScale ?? 1 }) },
    };
    // --- gi branches: namespace list is strict (GObject access throws — greenTile
    // never touches it at runtime); the branches themselves are concrete.
    env.gi = strictNs('imports.gi', {
        GLib: env.glib,
        Gio: gio,
        Meta: meta,
        Cinnamon: cinnamon,
        St: st,
        // extension.js wires this per App; only the scope vendor guard reads it
        // (lib/runtime/scope.js — sniffs GObjects via is_finalized, which the
        // fake signal hubs never implement, so the handler below stays inert
        // and behavior matches the former silent stub)
        GObject: {
            signal_handler_is_connected: () => true,
        },
        // constants lib/tiling + lib/ui compare only by identity; EVENT_PROPAGATE/
        // EVENT_STOP mirror the real boolean values, the rest are identity stubs
        Clutter: {
            EVENT_PROPAGATE: false,
            EVENT_STOP: true,
            EventType: { BUTTON_PRESS: 'button-press', BUTTON_RELEASE: 'button-release' },
            KEY_Escape: 'Escape',
            AnimationMode: { EASE_OUT_QUAD: 'ease-out-quad' },
        },
        Pango: { EllipsizeMode: { NONE: 'none', END: 'end' } },
    });

    // the xlet dir importer as both module generations expose it on the
    // imports root (main.js _addXletDirectoriesToSearchPath); per-env factory
    // so each test's env gets its own module cache (no stale bindings)
    env.extensions = { [XLET_UUID]: createXletImporter({ root: REPO_ROOT }) };
    env.gettext = {
        bindtextdomain() {},
        dgettext: (_domain, str) => str,
        gettext: (str) => str,
    };
    // imports.byteArray: fromString() -> ByteArray (Uint8Array), the exact shape
    // the theme feeds to GLib.Bytes for the accent stylesheet write
    env.byteArray = {
        fromString: (contents) => new TextEncoder().encode(contents),
        toString: (bytes) => new TextDecoder().decode(bytes),
    };
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
            if (p === 'gettext')
                {return env.gettext;}
            if (p === 'byteArray')
                {return env.byteArray;}
            if (p === 'extensions')
                {return env.extensions;}
            if (p === 'misc')
                {return strictNs('imports.misc', {
                    signalManager: { SignalManager: FakeSignalManager },
                    util: {
                        // lib/ui/panel.js settings entry, result unused
                        spawn: () => {},
                    },
                });}
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

'use strict';
// Shared harness for the extension-level tests: the REAL extension.js loaded
// on the fake Cinnamon runtime, plus the fake MetaWindow and the monitor enable
// helpers. Extracted from tests/tiling/characterization.test.js so the
// animation-ownership tests drive exactly the same entry and the same fake
// window surface.
const fs = require('node:fs');
const path = require('node:path');
const { cinnamonLoad, load, ROOT } = require('../cinnamon-loader');
const { createCinnamonEnv } = require('./cinnamon-env');

const MONITOR = { x: 0, y: 0, width: 2000, height: 1100 };

const makeEnv = (extraSettings = {}) => {
    const env = createCinnamonEnv({ settingsDefaults: Object.assign({ tileAnimation: true }, extraSettings) });
    // test-local instance augmentations: push_tile (native push is not part of
    // the shared fake) and the MotionDirection names push-tile reads
    const pushes = [];
    env.display.push_tile = (window, dir) => pushes.push([window, dir]);
    env.gi.Meta.MotionDirection = { LEFT: 1, RIGHT: 2, UP: 3, DOWN: 4 };
    const imports = new Proxy(env.imports, {
        get(target, prop) {
            if (prop !== 'ui')
                {return target[prop];}
            const ui = target[prop];
            return new Proxy(ui, {
                get(u, p) {
                    if (p === 'main') {
                        // no panels on the monitor: usableArea sees the
                        // full monitor rect
                        const main = u[p];
                        return new Proxy(main, {
                            get(m, mp) {
                                if (mp === 'panelManager')
                                    {return { getPanelsInMonitor: () => [] };}
                                return m[mp];
                            },
                        });
                    }
                    return u[p];
                },
            });
        },
    });
    globalThis.imports = imports;
    globalThis.global = env.global;
    const src = fs.readFileSync(path.join(ROOT, 'extension.js'), 'utf8');
    const ext = cinnamonLoad(src, load, 'extension.js');
    ext.init({ uuid: 'greenTile@carsteneu' });
    return { env, ext, pushes };
};

// Fake MetaWindow recording move_resize_frame / move_frame with enough signal
// hub surface for the auto/border observers that ride along. `options` is
// additive: windowType/wmClass feed the eligibility filters (dialogs, app-less
// windows), noApp marks a window whose tracker lookup fails, minSize models an
// application-enforced minimum frame (the WM refuses a smaller request and keeps
// the minimum, exactly like a terminal that snaps to its character grid), and
// move_to_monitor keeps get_monitor() live like Meta does on a real
// cross-monitor move. `minSize` is a live array, so a test can relax it later.
const makeWindow = (env, seq, rect, monitor = 0, withActor = null, options = {}) => {
    const handlers = [];
    let nextId = 1;
    let mon = monitor;
    const window = {
        seq,
        minSize: options.minSize || null,
        minimized: false,
        /** @type {boolean} marked windows have no owning app (app-less window) */
        __noApp: options.noApp === true,
        moves: [],
        rect: rect.slice(),
        connect(sig, cb) {
            const id = nextId++;
            handlers.push({ sig, cb, id });
            return id;
        },
        disconnect(id) {
            const at = handlers.findIndex((h) => h.id === id);
            if (at === -1)
                {throw new Error('window: no such handler ' + id);}
            handlers.splice(at, 1);
        },
        count(sig) {
            return handlers.filter((h) => !sig || h.sig === sig).length;
        },
        emit(sig, ...args) {
            for (const h of handlers.slice())
                {if (h.sig === sig)
                    {h.cb(...args);}}
        },
        get_stable_sequence: () => seq,
        get_window_type: () => (options.windowType !== undefined ? options.windowType : 6),
        get_wm_class: () => (options.wmClass !== undefined ? options.wmClass : 'FakeWindow'),
        get_title: () => 'FakeWindow' + seq,
        // X11 window description (MetaWindow.get_description): survives a Cinnamon
        // restart, so it is the identity the restart-order store records. A window
        // without options.description models a Wayland client (no id).
        get_description: () => (options.description !== undefined ? options.description : null),
        get_monitor: () => mon,
        get_workspace: () => env.activeWorkspace,
        is_on_all_workspaces: () => false,
        get_frame_rect: () => ({ x: window.rect[0], y: window.rect[1], width: window.rect[2], height: window.rect[3] }),
        get_compositor_private: () => withActor,
        move_resize_frame(anim, x, y, w, h) {
            window.moves.push(['resize', x, y, w, h]);
            const min = window.minSize;
            window.rect = [x, y, min ? Math.max(w, min[0]) : w, min ? Math.max(h, min[1]) : h];
        },
        move_frame(anim, x, y) {
            window.moves.push(['move', x, y]);
            window.rect = [x, y, window.rect[2], window.rect[3]];
        },
        unmaximize() {},
        activate() {
            env.display.focus_window = window;
        },
        change_workspace_by_index() {},
        move_to_monitor(index) {
            mon = index;
        },
    };
    return window;
};

const makeWorkspace = (env) => {
    const ws = { list_windows: () => env.tabList };
    env.workspaces.push(ws);
    return ws;
};

const settingsInstance = (env) => env.settingsInstances.at(-1);

// enable + one DisplayConfig flush; monitor 0 is the 2000x1100 work area.
const enableOnMonitor = (env, ext) => {
    env.layoutManager.monitors.push(MONITOR);
    ext.enable();
    env.flushDisplayConfigNoReply();
};

// enable with the given monitor rects (indexes in push order)
const enableOnMonitors = (env, ext, monitors) => {
    for (const m of monitors) {
        env.layoutManager.monitors.push(m);
    }
    ext.enable();
    env.flushDisplayConfigNoReply();
};

module.exports = {
    MONITOR, makeEnv, makeWindow, makeWorkspace, settingsInstance, enableOnMonitor, enableOnMonitors,
};

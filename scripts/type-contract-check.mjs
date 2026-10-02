/*
 * Type-contract check (todo_fixes issue 12): the five verified tsc
 * counterexamples (get_monitr, move_resize_frame('yes'), layoutManager.monitorz,
 * Meta.MaximizeFlags.HORIZONTL, app.panel.rebuld) compile against any-typed
 * Cinnamon surfaces — this harness compiles each mutation separately against
 * the repo's ambient types and expects tsc to FAIL on every one of them, while
 * a set of legit call shapes must keep compiling.
 *
 * Run:  node scripts/type-contract-check.mjs   (or: npm run check:types)
 * Exit: 0 — every mutation errors, every legit sample compiles.
 *       1 — otherwise (contract broken).
 * Wired into npm run check (last leg); scratch snippets land in
 * .yesmem/tmp/type-contracts/ (gitignored). Not part of npm test — the ten
 * tsc programs would roughly double the suite wall time.
 */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const typesDir = join(root, 'types');
const tmpDir = join(root, '.yesmem', 'tmp', 'type-contracts');

// Each mutation is a previously passing tsc counterexample against the
// any-typed surfaces; each legit sample pins the real call shapes lib/ uses.
const cases = [
    {
        name: 'mutation-window-method-typo',
        expect: 'fail',
        code: `
const w = null as unknown as CinnamonWindow;
console.log(w.get_monitr());
`,
    },
    {
        name: 'mutation-move-resize-frame-arg',
        expect: 'fail',
        code: `
const w = null as unknown as CinnamonWindow;
w.move_resize_frame('yes', 1, 2, 3, 4);
`,
    },
    {
        name: 'mutation-layout-manager-monitors-typo',
        expect: 'fail',
        code: `
console.log(imports.ui.main.layoutManager.monitorz);
`,
    },
    {
        name: 'mutation-maximize-flags-typo',
        expect: 'fail',
        code: `
console.log(imports.gi.Meta.MaximizeFlags.HORIZONTL);
`,
    },
    {
        name: 'mutation-panel-rebuild-typo',
        expect: 'fail',
        code: `
const app = null as unknown as AppFacade;
app.panel.rebuld();
`,
    },
    {
        // the verified acceptance-rejection mutation: a wrong argument on a
        // REAL cross-module call through the native namespace must fail tsc
        // (the generated mirror in types/xlet provides the signature)
        name: 'mutation-xlet-windowmoveresize-arg',
        expect: 'fail',
        code: `
const { windowMoveResize } = imports.extensions['greenTile@carsteneu'].lib.tiling.windows;
windowMoveResize(null, 'WRONG-X', 2, 3, 4);
`,
    },
    {
        name: 'mutation-xlet-module-member-typo',
        expect: 'fail',
        code: `
const w = imports.extensions['greenTile@carsteneu'].lib.tiling.windows;
w.windowMoveRezise(null, 1, 2, 3, 4);
`,
    },
    {
        name: 'mutation-config-destroy-typo',
        expect: 'fail',
        code: `
const app = null as unknown as AppFacade;
app.config.destory();
`,
    },
    {
        name: 'legit-xlet-windowmoveresize',
        expect: 'pass',
        code: `
const { windowMoveResize } = imports.extensions['greenTile@carsteneu'].lib.tiling.windows;
const win = null as unknown as CinnamonWindow;
windowMoveResize(win, 1, 2, 3, 4);
windowMoveResize(null, 1, 2, 3, 4);
`,
    },
    {
        name: 'legit-window-api',
        expect: 'pass',
        code: `
const w = null as unknown as CinnamonWindow;
if (!w.minimized && w.get_wm_class() != null
    && w.get_window_type() === imports.gi.Meta.WindowType.NORMAL) {
    w.unmaximize(imports.gi.Meta.MaximizeFlags.HORIZONTAL | imports.gi.Meta.MaximizeFlags.VERTICAL);
    w.move_resize_frame(true, 1, 2, 3, 4);
    w.move_frame(true, 1, 2);
    const r = w.get_frame_rect();
    console.log(r.x, r.y, r.width, r.height);
    w.activate(0);
    console.log(w.get_monitor(), w.get_title(), w.is_on_all_workspaces());
    console.log(w.get_maximized() || w.is_fullscreen());
    const actor = w.get_compositor_private();
    if (actor) {
        console.log(actor.translation_x, actor.scale_y);
    }
    console.log(w.get_workspace() === global.workspace_manager.get_active_workspace());
}
`,
    },
    {
        name: 'legit-monitor-api',
        expect: 'pass',
        code: `
const m = null as unknown as CinnamonMonitor;
const rect: Rect = [m.x, m.y, m.width, m.height];
console.log(rect, m.index);
const lmm = imports.ui.main.layoutManager;
console.log(lmm.monitors.length, lmm.primaryIndex, lmm.monitors[lmm.primaryIndex] === m);
`,
    },
    {
        name: 'legit-main-api',
        expect: 'pass',
        code: `
const tabs = imports.ui.main.getTabList();
console.log(tabs[0] ?? null);
const panels = imports.ui.main.panelManager.getPanelsInMonitor(0);
for (const panel of panels) {
    if (!panel.isHideable()) {
        console.log(panel.panelPosition, panel.height || panel.actor.get_height());
    }
}
`,
    },
    {
        name: 'legit-meta-api',
        expect: 'pass',
        code: `
const Meta = imports.gi.Meta;
console.log(Object.keys(Meta.GrabOp));
console.log(Meta.MotionDirection.UP, Meta.MotionDirection.DOWN);
Meta.keybindings_set_custom_handler('greenTile-x', () => {});
console.log(Meta.MonitorManager.get());
`,
    },
    {
        name: 'legit-panel-api',
        expect: 'pass',
        code: `
const app = null as unknown as AppFacade;
console.log(app.panel.view, app.panel.draft, app.panel.actor, app.panel.positioned);
app.panel.guard();
app.panel.close();
console.log(app.ops.rebuild(app));
`,
    },
];

const compile = (files) => {
    // tsc auto-includes node_modules/@types/* unless types:[] — that drag-in
    // collides with the ambient `declare const global` (TS2451), so every case
    // gets a generated project mirroring the repo tsconfig options.
    const cfg = {
        compilerOptions: {
            target: 'ES2022',
            module: 'commonjs',
            moduleResolution: 'node',
            strict: true,
            noEmit: true,
            types: [],
        },
        files: [
            join(typesDir, 'cinnamon.d.ts'),
            join(typesDir, 'greenTile.d.ts'),
            ...files,
        ],
    };
    const cfgPath = join(tmpDir, 'tsconfig.json');
    writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
    try {
        execFileSync(join(root, 'node_modules', '.bin', 'tsc'), ['-p', cfgPath], {
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: root,
        });
        return { errors: 0, output: '' };
    } catch (err) {
        const first = String(err.stdout || '') + String(err.stderr || '');
        return { errors: -1, output: first };
    }
};

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

const snippetFiles = [];
let failures = 0;
for (const c of cases) {
    const file = join(tmpDir, c.name + '.ts');
    writeFileSync(file, c.code);
    snippetFiles.push([c.name, c.expect, file]);
}

// Case snippets reference only case-local bindings, so each compiles in one
// program per case (mutations must not mask each other).
for (const [name, expect, file] of snippetFiles) {
    const { errors, output } = compile([file]);
    const ok = expect === 'fail' ? errors !== 0 : errors === 0;
    console.log((ok ? 'PASS' : 'FAIL') + '  expect-tsc-' + expect + '  ' + name);
    if (!ok) {
        failures++;
        const lines = output.split('\n').filter((l) => l.includes('error TS'));
        for (const l of lines.slice(0, 5)) {
            console.log('      ' + l.trim());
        }
        if (lines.length === 0 && output.trim()) {
            console.log(output.trim().split('\n').slice(0, 5).map((l) => '      ' + l).join('\n'));
        }
    }
}

console.log('');
if (failures === 0) {
    console.log('type-contract-check: PASS (' + cases.length + ' cases: '
        + cases.filter((c) => c.expect === 'fail').length + ' mutations rejected, '
        + cases.filter((c) => c.expect === 'pass').length + ' legit samples compile)');
    process.exit(0);
}
console.log('type-contract-check: FAIL (' + failures + '/' + cases.length + ' cases violated the contract)');
process.exit(1);

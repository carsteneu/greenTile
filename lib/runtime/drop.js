/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * per-App drop runtime: drag tracking for the zone split. While a tiled window
 * is moved (mouse move grab), a 50 ms pointer poll shows a preview of the cell
 * a drop would produce; on release over a zone of another tiled window the new
 * layout is placed directly and stored as a shape (per monitor, workspace and
 * window count). Cancel (Esc), release in the centre or outside tiled cells
 * keeps today's snap-on-release behaviour. Owned by the App (monitors-changed
 * destroys the App): a drag cannot survive a monitor change — Muffin ends the
 * grab there anyway, and the 50 ms tick dies with its App. The timer and the
 * preview actor are replaced mid-life (explicit id / reference, no scope);
 * stop() leaves the last .hit in place as before. destroy() is an idempotent
 * stop: timers and the actor die, nothing is written. All Cinnamon access is
 * injected (deps), the app parameter carries the App's own surfaces (split,
 * auto, config).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const {
    TILE_SPLIT_MIN_PX, tile_split_rects, tile_sort_order,
} = require('./lib/model/split');
const { tile_drop_zone, tile_drop_layout, tile_drop_fits } = require('./lib/model/drop');
const { tile_layouts_parse } = require('./lib/model/layouts');
const { tile_gap_cell } = require('./lib/model/gap');

// deps: meta (imports.gi.Meta), main (imports.ui.main — uiGroup), global
// (the global object), mainloop (imports.mainloop), st (imports.gi.St),
// collectWindows (tile_collect_windows), excludeCheck (tile_excl_is_excluded),
// layoutShape (tile_layout_shape), layoutSet (tile_layout_set), usableArea
// (getUsableScreenArea), gap (tile_gap), placeRects (tile_place_rects),
// accentRgb (() => the theme component's resolved accent rgb).
class Drop {
    constructor(deps) {
        this._deps = deps;
        this._meta = deps.meta;
        this._main = deps.main;
        this._global = deps.global;
        this._mainloop = deps.mainloop;
        this._drop = { timer: 0, actor: null, seq: null, from: null, start: null, w: null };
    }

    stop() {
        if (this._drop.timer) {
            this._mainloop.source_remove(this._drop.timer);
            this._drop.timer = 0;
        }
        if (this._drop.actor) {
            this._drop.actor.destroy();
            this._drop.actor = null;
        }
        this._drop.seq = null;
        this._drop.from = null;
        this._drop.start = null;
        this._drop.w = null;
    }

    begin(app, w, op) {
        if (op !== this._meta.GrabOp.MOVING || this._drop.seq !== null)
            return;
        if (w.get_workspace() !== this._global.workspace_manager.get_active_workspace())
            return;
        const monitorIndex = w.get_monitor();
        const monitor = this._main.layoutManager.monitors[monitorIndex];
        if (!monitor || this._deps.excludeCheck(w))
            return;
        const windows = this._deps.collectWindows(monitor, null);
        if (windows.indexOf(w) === -1)
            return;
        if (!this._deps.layoutShape(app, monitorIndex, windows.length))
            return;
        const f = w.get_frame_rect();
        this._drop.seq = w.get_stable_sequence();
        this._drop.from = monitorIndex;
        this._drop.start = [f.x, f.y, f.width, f.height];
        this._drop.w = w;
        const rgb = this._deps.accentRgb();
        this._drop.actor = new this._deps.st.Widget({ reactive: false, style: 'background-color: rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.25); border: 2px solid rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ');' });
        this._main.uiGroup.add_child(this._drop.actor);
        this._drop.actor.hide();
        this._drop.timer = this._mainloop.timeout_add(50, () => this.tick(app));
    }

    // Where a drop at (px, py) would land: the target cell of another tiled window and
    // the zone, plus the new layout (lib/model/drop.js). null outside any zone. The target set
    // holds all tiled windows of the pointer's monitor with A in it — dragged within its
    // own monitor A keeps its reading-order place; from another monitor it is inserted
    // fresh (from = -1) and the count there grows by one.
    target(app, w, px, py, fromMonitor, startFrame) {
        const monitors = this._main.layoutManager.monitors;
        let monitorIndex = -1;
        for (let i = 0; i < monitors.length; i++) {
            const m = monitors[i];
            if (px >= m.x && px < m.x + m.width && py >= m.y && py < m.y + m.height) {
                monitorIndex = i;
                break;
            }
        }
        if (monitorIndex === -1)
            return null;
        const monitor = monitors[monitorIndex];
        const wsIndex = this._global.workspace_manager.get_active_workspace().index();
        const same = (fromMonitor != null ? fromMonitor : this._drop.from) === monitorIndex;
        const others = this._deps.collectWindows(monitor, null, wsIndex).filter((t) => t !== w);
        const windows = same ? others.concat([w]) : others;
        const n = windows.length;
        if (n < (same ? 2 : 1))
            return null;
        const layout = this._deps.layoutShape(app, monitorIndex, n);
        if (!layout)
            return null;
        // Reading order from the grab-start geometry: A's frame follows the pointer, so
        // its live frame would shuffle the order the stored shape is keyed by.
        const rects = windows.map((t) => {
            if (t === w)
                return startFrame || this._drop.start;
            const f = t.get_frame_rect();
            return [f.x, f.y, f.width, f.height];
        });
        const ordered = tile_sort_order(rects, layout.kind === 'cols').map((i) => windows[i]);
        const fromIndex = ordered.indexOf(w);
        const area = this._deps.usableArea(monitor);
        const cellRects = tile_split_rects(layout.kind, layout.shape, app.split.for(app, monitorIndex, wsIndex, n, layout), area);
        let ci = -1;
        for (let i = 0; i < cellRects.length; i++) {
            const [cx, cy, cw, ch] = cellRects[i];
            if (px >= cx && px < cx + cw && py >= cy && py < cy + ch) {
                ci = i;
                break;
            }
        }
        if (ci === -1 || ci >= ordered.length)
            return null;
        // fromIndex -1: cross-monitor drop, A is appended fresh (tile_drop_layout).
        // On the own monitor A's index must exist and the target cell must not be A's.
        if (same && fromIndex === -1)
            return null;
        if (fromIndex === ci)
            return null;
        const zone = tile_drop_zone(cellRects[ci], px, py);
        if (!zone)
            return null;
        const next = zone === 'center' ? null : tile_drop_layout(layout.kind, layout.shape, fromIndex, ci, zone);
        if (next && !tile_drop_fits(next.kind, next.shape, area[2], area[3], this._deps.gap(app), TILE_SPLIT_MIN_PX))
            return null;
        return { monitorIndex: monitorIndex, n: n, layout: layout, ordered: ordered, fromIndex: fromIndex, toIndex: ci, zone: zone, next: next };
    }

    tick(app) {
        if (this._drop.seq === null || this._global.display.get_grab_op() === this._meta.GrabOp.NONE) {
            this.stop();
            return false;
        }
        const p = this._global.get_pointer();
        const hit = this.target(app, this._drop.w, p[0], p[1]);
        this._drop.hit = hit;
        if (!hit || !hit.next) {
            this._drop.actor.hide();
            return true;
        }
        const monitor = this._main.layoutManager.monitors[hit.monitorIndex];
        if (!monitor) {
            this.stop();
            return false;
        }
        const area = this._deps.usableArea(monitor);
        const rects = tile_split_rects(hit.next.kind, hit.next.shape, null, area);
        // A's cell in the new layout; a cross-monitor A sits at the end of the order
        const fresh = hit.ordered.length;
        const at = hit.next.order.indexOf(hit.fromIndex >= 0 ? hit.fromIndex : fresh);
        const cell = tile_gap_cell(rects[at], area, this._deps.gap(app));
        this._drop.actor.set_position(cell[0], cell[1]);
        this._drop.actor.set_size(cell[2], cell[3]);
        this._drop.actor.show();
        return true;
    }

    // true = split applied, the grab-end handler must not run the usual snap.
    end(app, w, op) {
        if (this._drop.seq === null)
            return false;
        const start = this._drop.start;
        const fromMonitor = this._drop.from;
        this.stop();
        if (op !== this._meta.GrabOp.MOVING)
            return false;
        // Esc cancel (spike 2): Muffin put the frame back at the start rect.
        const f = w.get_frame_rect();
        if (start && Math.abs(f.x - start[0]) <= 2 && Math.abs(f.y - start[1]) <= 2)
            return false;
        const p = this._global.get_pointer();
        const hit = this.target(app, w, p[0], p[1], fromMonitor, start);
        if (!hit || !hit.next)
            return false;
        const wsIndex = this._global.workspace_manager.get_active_workspace().index();
        const layouts = tile_layouts_parse(app.config.settings.getValue('layouts') || '');
        if (layouts === null)
            return false;
        const n = hit.next.order.length;
        const ref = app.split.ref(app, hit.monitorIndex, wsIndex, n);
        if (!ref)
            return false;
        app.split.forget(ref.key);
        this._deps.layoutSet(app, hit.monitorIndex, wsIndex, { shapes: { [ref.n]: { kind: hit.next.kind, shape: hit.next.shape } }, splits: { [ref.n]: null } });
        const monitor = this._main.layoutManager.monitors[hit.monitorIndex];
        const area = this._deps.usableArea(monitor);
        const orderedByNext = hit.next.order.map((i) => (i === hit.ordered.length ? w : hit.ordered[i]));
        this._deps.placeRects(app, orderedByNext, { kind: hit.next.kind, shape: hit.next.shape }, null, area, true);
        // Overrides from a recent resize/swap must not re-sort the freshly placed order.
        for (const t of orderedByNext)
            app.auto.sortClear(t.get_stable_sequence());
        if (fromMonitor !== hit.monitorIndex)
            app.auto.scheduleMonitor(app, fromMonitor, 250);
        this._global.log('greenTile drag split ws' + (wsIndex + 1) + ' mon=' + ref.mkey + ' n=' + n + ' ' + hit.next.kind + '=[' + hit.next.shape.join(',') + ']');
        return true;
    }

    destroy() {
        this.stop();
        this._drop.hit = null;
    }
}

module.exports = {
    Drop,
};

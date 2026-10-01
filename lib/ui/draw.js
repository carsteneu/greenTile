/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * Cairo helpers and thumbnail widget for the preset panel (design tokens
 * from the approved HTML mockup,
 * docs/superpowers/specs/2026-09-28-preset-ui-design.md).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

// Cinnamon imports are read lazily inside every function on purpose: a module
// top-level alias would bind to whatever `imports` was live at first load, and
// the Node tests re-evaluate the entry per fresh fake environment against a
// cached require graph.

/**
 * @param {AnyRecord} cr
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {number} r
 */
var panelRoundRect = (cr, x, y, w, h, r) => {
    cr.newSubPath();
    cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    cr.arc(x + r, y + r, r, Math.PI, 3 * Math.PI / 2);
    cr.closePath();
    cr.fill();
};
// Mockup: list thumbnails 54x34, gap 2px, radius 2px, fill per THEME_CAIRO dark thumb
// (#485064 dark / #b7bdcc light);
// editor rule thumbnails 34x18, gap 2px, 1px between stacked cells, radius 1px.
/**
 * @param {AppFacade} app
 * @param {number[]} stacks
 * @param {{ width?: number, height?: number, gap?: number, vgap?: number, radius?: number, color?: Rgb | null }} [opts]
 */
var panelThumb = (app, stacks, opts = {}) => {
    const St = imports.gi.St;
    const { width = 54, height = 34, gap = 2, vgap = 2, radius = 2, color = null } = opts;
    // Corrupt preset data must not hang the repaint loop: every cell count
    // normalizes to a finite integer, so the paint loop below terminates. No
    // upper bound applies here — surplus cells are the honest rendering of a
    // filled rule (they sum to the window count), not corrupt data.
    const cells = (Array.isArray(stacks) ? stacks : []).map((/** @type {any} */ s) => {
        const v = Math.floor(Number(s));
        return Number.isFinite(v) && v >= 1 ? v : 1;
    });
    const area = new St.DrawingArea({ width, height });
    area.connect('repaint', (/** @type {AnyRecord} */ a) => {
        const cr = a.get_context();
        const [W, H] = a.get_surface_size();
        const paint = color || app.theme.cairo('thumb');
        cr.setSourceRGB(paint[0] / 255, paint[1] / 255, paint[2] / 255);
        const cw = (W - gap * (cells.length - 1)) / cells.length;
        for (let c = 0; c < cells.length; c++) {
            // Many stacked cells (surplus windows in the filled thumbnail): the gap shrinks
            // so that each cell keeps at least 1px.
            const vg = cells[c] > 1 ? Math.max(0, Math.min(vgap, (H - cells[c]) / (cells[c] - 1))) : 0;
            const ch = (H - vg * (cells[c] - 1)) / cells[c];
            for (let r = 0; r < cells[c]; r++) {
                panelRoundRect(cr, c * (cw + gap), r * (ch + vg), cw, ch, Math.min(radius, ch / 2));
            }
        }
        cr.$dispose();
    });
    return area;
};
var panelMiddle = () => {
    const St = imports.gi.St;
    return { x_fill: false, y_fill: false, y_align: St.Align.MIDDLE };
};


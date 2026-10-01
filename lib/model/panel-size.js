/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * panel-size model, extracted verbatim from the marked pure model block in
 * greenTile.js (no Cinnamon imports). Author of the model code: carsten_eu.
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

// The preset panel can be resized with the grip in its bottom right corner, list and
// editor separately. Setting "panelSize": {"list": {"w", "h"}, "editor": {"w", "h"}};
// w is the panel width, h the height of the part that stretches (list: the preset
// rows, editor: the painter). Without a stored size the panel keeps its natural size.
const TILE_PANEL_MIN = { list: { w: 600, h: 180 }, editor: { w: 600, h: 136 } };
const tile_panel_size_ok = (s) => s != null && typeof s === 'object'
    && typeof s.w === 'number' && Number.isFinite(s.w) && s.w > 0
    && typeof s.h === 'number' && Number.isFinite(s.h) && s.h > 0;
const tile_panel_size_obj = (raw) => {
    try {
        const v = JSON.parse(raw || '{}');
        return v != null && typeof v === 'object' && !Array.isArray(v) ? v : {};
    }
    catch (e) {
        return {};
    }
};
const tile_panel_size_parse = (raw) => {
    const v = tile_panel_size_obj(raw);
    return {
        list: tile_panel_size_ok(v.list) ? { w: v.list.w, h: v.list.h } : null,
        editor: tile_panel_size_ok(v.editor) ? { w: v.editor.w, h: v.editor.h } : null,
    };
};
const tile_panel_size_set = (raw, view, size) => {
    const parsed = tile_panel_size_parse(raw);
    const next = {};
    for (const key of ['list', 'editor']) {
        if (parsed[key])
            next[key] = parsed[key];
    }
    next[view] = { w: Math.round(size.w), h: Math.round(size.h) };
    return JSON.stringify(next);
};
// max = room on the monitor; when it is smaller than the minimum, the minimum wins.
const tile_panel_size_clamp = (size, min, max) => ({
    w: Math.round(Math.max(Math.min(size.w, max.w), min.w)),
    h: Math.round(Math.max(Math.min(size.h, max.h), min.h)),
});

module.exports = {
    TILE_PANEL_MIN,
    tile_panel_size_ok,
    tile_panel_size_obj,
    tile_panel_size_parse,
    tile_panel_size_set,
    tile_panel_size_clamp,
};

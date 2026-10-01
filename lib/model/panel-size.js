/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * panel-size model over pure data (no Cinnamon imports).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

// The preset panel can be resized with the grip in its bottom right corner, list and
// editor separately. Setting panelSize: {"list": {"w", "h"}, "editor": {"w", "h"}};
// w is the panel width, h the height of the part that stretches (list: the preset
// rows, editor: the painter). Without a stored size the panel keeps its natural size.
const PANEL_MIN = Object.freeze({ list: Object.freeze({ w: 600, h: 180 }), editor: Object.freeze({ w: 600, h: 136 }) });
const panelSizeOk = (s) => s != null && typeof s === 'object'
    && typeof s.w === 'number' && Number.isFinite(s.w) && s.w > 0
    && typeof s.h === 'number' && Number.isFinite(s.h) && s.h > 0;
const panelSizeObj = (raw) => {
    try {
        const v = JSON.parse(raw || '{}');
        return v != null && typeof v === 'object' && !Array.isArray(v) ? v : {};
    }
    catch (e) {
        return {};
    }
};
const panelSizeParse = (raw) => {
    const v = panelSizeObj(raw);
    return {
        list: panelSizeOk(v.list) ? { w: v.list.w, h: v.list.h } : null,
        editor: panelSizeOk(v.editor) ? { w: v.editor.w, h: v.editor.h } : null,
    };
};
const panelSizeSet = (raw, view, size) => {
    const parsed = panelSizeParse(raw);
    const next = {};
    for (const key of ['list', 'editor']) {
        if (parsed[key]) {
            next[key] = parsed[key];
        }
    }
    next[view] = { w: Math.round(size.w), h: Math.round(size.h) };
    return JSON.stringify(next);
};
// max = room on the monitor; when it is smaller than the minimum, the minimum wins.
const panelSizeClamp = (size, min, max) => ({
    w: Math.round(Math.max(Math.min(size.w, max.w), min.w)),
    h: Math.round(Math.max(Math.min(size.h, max.h), min.h)),
});

module.exports = {
    PANEL_MIN,
    panelSizeOk,
    panelSizeObj,
    panelSizeParse,
    panelSizeSet,
    panelSizeClamp,
};

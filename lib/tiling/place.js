/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * Window placement: animated single-window placement and the layout-cell
 * wrapper, plus the gap read and the cells-of-ordered-windows renderer.
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const { tile_gap_value, tile_gap_cell } = require('./lib/model/gap');
const { tile_split_rects } = require('./lib/model/split');
const { tile_window_reset, tile_window_move_resize } = require('./lib/tiling/windows');
const { SETTINGS_KEYS } = require('./lib/model/settings-keys');

// Animated placement: the window gets its final geometry instantly (no stepped
// resizes — those reflow terminal text at every step), while the compositor actor
// is parked at the old rect via translation/scale and eased back to identity.
// Offsets are set BEFORE the move so no intermediate frame shows the final position.
const TILE_ANIMATE_MS = 250;
// animate = false: the window jumps (resize hotkeys held down retile ~33 times per second;
// overlapping tweens would make the windows swim). With the setting tileAnimation off
// every placement jumps; read at each placement, so a change applies from the next tiling.
const tile_place = (app, metaWindow, x, y, width, height, animate = true) => {
    const Tweener = imports.ui.tweener;
    tile_window_reset(metaWindow);
    const oldRect = metaWindow.get_frame_rect();
    const actor = metaWindow.get_compositor_private();
    if (actor && (!animate || app.config.settings.getValue(SETTINGS_KEYS.tileAnimation) === false)) {
        Tweener.removeTweens(actor);
        actor.translation_x = 0;
        actor.translation_y = 0;
        actor.scale_x = 1;
        actor.scale_y = 1;
        tile_window_move_resize(metaWindow, x, y, width, height);
        return;
    }
    if (actor) {
        Tweener.removeTweens(actor);
        actor.translation_x = oldRect.x - x;
        actor.translation_y = oldRect.y - y;
        actor.scale_x = oldRect.width / width;
        actor.scale_y = oldRect.height / height;
    }
    tile_window_move_resize(metaWindow, x, y, width, height);
    if (actor) {
        Tweener.addTween(actor, {
            translation_x: 0,
            translation_y: 0,
            scale_x: 1,
            scale_y: 1,
            time: TILE_ANIMATE_MS / 1000,
            transition: 'easeOutQuad',
        });
    }
};
const tile_gap = (app) => tile_gap_value(app.config.settings.getValue(SETTINGS_KEYS.windowGap));
// Places a window into a layout cell of the usable area, minus the window gap.
const tile_place_cell = (app, metaWindow, x, y, width, height, area, animate = true) => {
    const [cx, cy, cw, ch] = tile_gap_cell([x, y, width, height], area, tile_gap(app));
    tile_place(app, metaWindow, cx, cy, cw, ch, animate);
};
// Places the ordered windows into the cells of the layout (split or equal division).
const tile_place_rects = (app, ordered, layout, split, area, animate) => {
    const rects = tile_split_rects(layout.kind, layout.shape, split, area);
    for (let i = 0; i < rects.length && i < ordered.length; i++) {
        const [x, y, w, h] = rects[i];
        tile_place_cell(app, ordered[i], x, y, w, h, area, animate);
    }
};

module.exports = { TILE_ANIMATE_MS, tile_place, tile_gap, tile_place_cell, tile_place_rects };

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

const XLET = imports.extensions['greenTile@carsteneu'];

const { gapValue, gapCell } = XLET.lib.model.gap;
const { splitRects } = XLET.lib.model.split;
const { windowReset, windowMoveResize } = XLET.lib.tiling.windows;
const { SETTINGS_KEYS } = XLET.lib.model['settings-keys'];

// Animated placement: the window gets its final geometry instantly (no stepped
// resizes — those reflow terminal text at every step), while the compositor actor
// is parked at the old rect via translation/scale and eased back to identity.
// Offsets are set BEFORE the move so no intermediate frame shows the final position.
var ANIMATE_MS = 250;
// animate = false: the window jumps (resize hotkeys held down retile ~33 times per second;
// overlapping tweens would make the windows swim). With the setting tileAnimation off
// every placement jumps; read at each placement, so a change applies from the next tiling.
/**
 * @param {AppFacade} app
 * @param {CinnamonWindow} metaWindow
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {boolean} [animate]
 */
var place = (app, metaWindow, x, y, width, height, animate = true) => {
    const Tweener = imports.ui.tweener;
    windowReset(metaWindow);
    const oldRect = metaWindow.get_frame_rect();
    const actor = metaWindow.get_compositor_private();
    if (actor && (!animate || app.config.settings.getValue(SETTINGS_KEYS.tileAnimation) === false)) {
        Tweener.removeTweens(actor);
        actor.translation_x = 0;
        actor.translation_y = 0;
        actor.scale_x = 1;
        actor.scale_y = 1;
        windowMoveResize(metaWindow, x, y, width, height);
        return;
    }
    if (actor) {
        Tweener.removeTweens(actor);
        actor.translation_x = oldRect.x - x;
        actor.translation_y = oldRect.y - y;
        actor.scale_x = oldRect.width / width;
        actor.scale_y = oldRect.height / height;
    }
    windowMoveResize(metaWindow, x, y, width, height);
    if (actor) {
        Tweener.addTween(actor, {
            translation_x: 0,
            translation_y: 0,
            scale_x: 1,
            scale_y: 1,
            time: ANIMATE_MS / 1000,
            transition: 'easeOutQuad',
        });
    }
};
/**
 * @param {AppFacade} app
 * @returns {number}
 */
var gap = (app) => gapValue(app.config.settings.getValue(SETTINGS_KEYS.windowGap));
// Places a window into a layout cell of the usable area, minus the window gap.
/**
 * @param {AppFacade} app
 * @param {CinnamonWindow} metaWindow
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 * @param {Rect} area
 * @param {boolean} [animate]
 */
var placeCell = (app, metaWindow, x, y, width, height, area, animate = true) => {
    const [cx, cy, cw, ch] = gapCell([x, y, width, height], area, gap(app));
    place(app, metaWindow, cx, cy, cw, ch, animate);
};
// Places the ordered windows into the cells of the layout (split or equal division).
// Places the ordered windows into the cells of the layout (split or equal division).
/**
 * @param {AppFacade} app
 * @param {CinnamonWindow[]} ordered
 * @param {Layout} layout
 * @param {Split | null} split
 * @param {Rect} area
 * @param {boolean} animate
 */
var placeRects = (app, ordered, layout, split, area, animate) => {
    const rects = splitRects(layout.kind, layout.shape, split, area);
    for (let i = 0; i < rects.length && i < ordered.length; i++) {
        const [x, y, w, h] = rects[i];
        placeCell(app, ordered[i], x, y, w, h, area, animate);
    }
};


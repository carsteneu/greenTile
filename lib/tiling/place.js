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
// module-private: markers the compositor actor carries while OUR ease runs
// (const stays private under the native importer — only var/function export)
const EASE_OWN_KEY = '__greenTile_easing';
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
    windowReset(metaWindow);
    const oldRect = metaWindow.get_frame_rect();
    const actor = metaWindow.get_compositor_private();
    const animateOn = animate && app.config.settings.getValue(SETTINGS_KEYS.tileAnimation) !== false;
    if (!actor) {
        windowMoveResize(metaWindow, x, y, width, height);
        return;
    }
    if (!animateOn) {
        // Only an OWN in-flight ease is superseded (through the platform's
        // per-property remove, duration 0 applies the identity targets
        // synchronously). A foreign transition — e.g. the shell's own
        // workspace-switch animation — is never touched: stomping
        // translation/scale while it runs left actors visually desynced from
        // their Meta buffers (translations forced to 0 mid-animation).
        if (actor[EASE_OWN_KEY]) {
            actor[EASE_OWN_KEY] = false;
            actor.ease({ translation_x: 0, translation_y: 0, scale_x: 1, scale_y: 1, duration: 0 });
        }
        windowMoveResize(metaWindow, x, y, width, height);
        return;
    }
    actor[EASE_OWN_KEY] = true;
    // pre-state parks the actor at the old rect; the ease runs it back to
    // identity. Writing the start values only matters for OUR properties;
    // a foreign transition on them is superseded by the ease below with a
    // smooth handoff (per-property remove inside actor.ease), never nuked.
    actor.translation_x = oldRect.x - x;
    actor.translation_y = oldRect.y - y;
    actor.scale_x = oldRect.width / width;
    actor.scale_y = oldRect.height / height;
    windowMoveResize(metaWindow, x, y, width, height);
    const Clutter = imports.gi.Clutter;
    actor.ease({
        translation_x: 0,
        translation_y: 0,
        scale_x: 1,
        scale_y: 1,
        duration: ANIMATE_MS,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        onStopped: () => {
            actor[EASE_OWN_KEY] = false;
        },
    });
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

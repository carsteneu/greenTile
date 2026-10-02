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
// module-private: ownership record the compositor actor carries while OUR
// ease runs. gen is a generation token — a superseded ease's onStopped(false)
// must not drop the ownership a newer ease already took; props are the dashed
// transition names WE started, so teardown can release exactly those.
const EASE_OWN_KEY = '__greenTile_easeOwn';
const EASE_OWN_PROPS = Object.freeze(['translation-x', 'translation-y', 'scale-x', 'scale-y']);
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
        // Only an OWN in-flight ease is superseded (duration 0 snaps OUR
        // properties to identity synchronously). A foreign transition — e.g.
        // the shell's own workspace-switch animation — is never touched:
        // stomping translation/scale while it runs left actors visually
        // desynced from their Meta buffers.
        if (actor[EASE_OWN_KEY]) {
            const own = actor[EASE_OWN_KEY];
            actor[EASE_OWN_KEY] = null;
            actor.ease({ translation_x: 0, translation_y: 0, scale_x: 1, scale_y: 1, duration: 0 });
            void own;
        }
        windowMoveResize(metaWindow, x, y, width, height);
        return;
    }
    // Park the actor at its CURRENT VISUAL position: the frame rect is the
    // buffer position, the visible position is frame + translation (and the
    // visible size is frame * scale). Parking from the frame alone — while a
    // foreign animation or a leftover own ease still carries translation —
    // lands exactly that many pixels off, the persistent actor/buffer offset
    // observed live on workspace switches.
    actor.translation_x = oldRect.x + actor.translation_x - x;
    actor.translation_y = oldRect.y + actor.translation_y - y;
    actor.scale_x = (oldRect.width * actor.scale_x) / width;
    actor.scale_y = (oldRect.height * actor.scale_y) / height;
    windowMoveResize(metaWindow, x, y, width, height);
    const gen = (actor[EASE_OWN_KEY] ? actor[EASE_OWN_KEY].gen : 0) + 1;
    const own = { gen, props: EASE_OWN_PROPS };
    actor[EASE_OWN_KEY] = own;
    const Clutter = imports.gi.Clutter;
    actor.ease({
        translation_x: 0,
        translation_y: 0,
        scale_x: 1,
        scale_y: 1,
        duration: ANIMATE_MS,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        onStopped: () => {
            // only the CURRENT generation may drop ownership: a superseded
            // ease also fires onStopped(false), after a newer one took over
            if (actor[EASE_OWN_KEY] === own)
                {actor[EASE_OWN_KEY] = null;}
        },
    });
};

/**
 * Releases every in-flight OWN ease of the window's actor at App teardown:
 * exactly our four transitions are removed, our properties snap to their
 * identity targets (visual == buffer), the ownership record drops. Foreign
 * transitions and foreign property values are never touched. Safe on windows
 * without an actor, without our ease, and on already-destroyed wrappers.
 * @param {CinnamonWindow | null} metaWindow
 */
var placeDispose = (metaWindow) => {
    let actor = null;
    try {
        actor = metaWindow && metaWindow.get_compositor_private
            ? metaWindow.get_compositor_private()
            : null;
    }
    catch (_e) {
        // a destroyed wrapper may throw on access — nothing of ours to release
        return;
    }
    const own = actor ? actor[EASE_OWN_KEY] : null;
    if (!actor || !own)
        {return;}
    actor[EASE_OWN_KEY] = null;
    for (const name of own.props) {
        if (typeof actor.remove_transition === 'function')
            {actor.remove_transition(name);}
    }
    // snap OUR property values: with our transitions gone mid-flight the
    // visual must still equal the buffer position
    actor.translation_x = 0;
    actor.translation_y = 0;
    actor.scale_x = 1;
    actor.scale_y = 1;
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

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
//
// The shell's own size-change effect writes exactly these four properties too
// (windowManager.js _sizeChangedWindow, gated on windows with __animationInfo
// and on desktop-effects-change-size) and its done handler mass-cancels them.
// Two consequences the owner handles: (1) if that effect is ALREADY running on
// one of these properties, the placement skips its animation entirely — the
// platform cancels whatever sits on an eased property, and cancelling a foreign
// animation is forbidden; (2) if it starts while our ease runs, our transitions
// are cancelled and the record survives so its values are still repaired. The
// visible animation is the shell's in both cases.
var ANIMATE_MS = 250;
// The properties greenTile parks and eases on the compositor actor. Single
// source of truth for three things that must never disagree: the park below,
// the ease targets and the per-App ownership table (the parked values are
// actor fields, the dashed `prop` is the Clutter transition name). 'offset'
// entries are absolute positions, 'ratio' entries are size factors; `axis`
// names the frame-rect member the property derives from. The tiling layer must
// not import the runtime layer, so the table is handed to the owner as an
// argument.
const EASE_PROPS = Object.freeze([
    Object.freeze({ prop: 'translation-x', field: 'translation_x', identity: 0, kind: 'offset', axis: 'x' }),
    Object.freeze({ prop: 'translation-y', field: 'translation_y', identity: 0, kind: 'offset', axis: 'y' }),
    Object.freeze({ prop: 'scale-x', field: 'scale_x', identity: 1, kind: 'ratio', axis: 'width' }),
    Object.freeze({ prop: 'scale-y', field: 'scale_y', identity: 1, kind: 'ratio', axis: 'height' }),
]);
// animate = false: the window jumps (resize hotkeys held down retile ~33 times per second;
// overlapping animations would make the windows swim). With the setting tileAnimation off
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
    const placement = app.placement;
    if (!animateOn) {
        // Only an OWN in-flight ease is superseded, and only the transitions
        // that are still ours (the placement owner re-checks the transition
        // identity): a foreign transition — e.g. the shell's size-change effect,
        // which drives the same translation/scale — is never touched. Stomping
        // translation/scale while it runs left actors visually desynced from
        // their Meta buffers.
        placement.release(metaWindow);
        windowMoveResize(metaWindow, x, y, width, height);
        return;
    }
    if (placement.foreignActive(metaWindow, actor, EASE_PROPS)) {
        // A foreign animation is already running on one of these properties.
        // The platform cancels whatever sits on an eased property
        // (environment.js _easeActor), so easing here would cancel a foreign
        // animation — exactly what the contract forbids. Skip our animation:
        // release only our own in-flight transitions and set the requested
        // geometry on the buffer, leaving the foreign transition and its value
        // untouched.
        placement.release(metaWindow);
        windowMoveResize(metaWindow, x, y, width, height);
        return;
    }
    // Park the actor at its CURRENT VISUAL position: the frame rect is the
    // buffer position, the visible position is frame + translation (and the
    // visible size is frame * scale). Parking from the frame alone — while a
    // foreign animation or a leftover own ease still carries translation —
    // lands exactly that many pixels off, the persistent actor/buffer offset
    // observed live on workspace switches.
    const next = { x, y, width, height };
    for (const p of EASE_PROPS) {
        actor[p.field] = p.kind === 'offset'
            ? oldRect[p.axis] + actor[p.field] - next[p.axis]
            : (oldRect[p.axis] * actor[p.field]) / next[p.axis];
    }
    windowMoveResize(metaWindow, x, y, width, height);
    // The token is this acquisition's identity: a superseded ease's stop must
    // never release the record of the ease that replaced it (each owned
    // transition additionally carries its own stop handler in the owner).
    const token = {};
    const Clutter = imports.gi.Clutter;
    /** @type {Record<string, number>} */
    const identityTargets = {};
    for (const p of EASE_PROPS) {
        identityTargets[p.field] = p.identity;
    }
    actor.ease({
        ...identityTargets,
        duration: ANIMATE_MS,
        mode: Clutter.AnimationMode.EASE_OUT_QUAD,
    });
    // after the ease: the transitions exist, so the owner can take exactly them
    placement.acquired(metaWindow, token, actor, EASE_PROPS);
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
    // A degenerate usable area (a zero-length axis, or non-finite geometry) cannot
    // contain any frame. Placing would move the window onto geometry outside it —
    // and animate that move. Leave the window exactly as it is instead: no reset,
    // no move/resize, no ease. A repairable area already comes back contained from
    // gapCell (bounded gap).
    if (!Number.isFinite(cx + cy + cw + ch) || cw < 1 || ch < 1
        || cx < area[0] || cy < area[1]
        || cx + cw > area[0] + area[2] || cy + ch > area[1] + area[3]) {
        return;
    }
    place(app, metaWindow, cx, cy, cw, ch, animate);
};
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

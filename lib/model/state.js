/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * state model, extracted verbatim from the marked pure model block in
 * greenTile.js (no Cinnamon imports). Author of the model code: carsten_eu.
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const { tile_accent_hsl, tile_accent_rgb } = require('./lib/model/accent');

// The state color tints the "Auto: on" marker and the assigned rows. The
// default green keeps today's exact table — which in the light scope uses TWO
// greens: the text (#3f8f22) and the tints + stripe (#4ea530) are different
// colors today and must stay that way. Any other base derives from HSL: dark
// keeps the base rgb, the light text sits a bit darker than the light tints
// (mirroring the default's split).
const tile_state_default = [156, 224, 114];
// "green" (today's look) | "theme" (the probed theme accent) | "own" (stateColor)
const tile_state_mode = (mode) => (mode === 'own' || mode === 'custom') ? 'own' : (mode === 'theme' ? 'theme' : 'green');
const tile_state_tones = (base) => {
    if (base[0] === 156 && base[1] === 224 && base[2] === 114)
        return {
            text: [156, 224, 114],
            tint: [156, 224, 114],
            lightText: [63, 143, 34],
            lightTint: [78, 165, 48],
        };
    const [h, s, l] = tile_accent_hsl(base);
    return {
        text: [base[0], base[1], base[2]],
        tint: [base[0], base[1], base[2]],
        lightText: tile_accent_rgb([h, s, Math.min(l, 0.36)]),
        lightTint: tile_accent_rgb([h, s, Math.min(l, 0.42)]),
    };
};
// Same shape as tile_accent_css: the generated rules are prefixed with the
// panel root class, so they outrank the base rules of stylesheet.css in both
// scopes (.gk-light rules carry today's alphas, only the colors differ).
const tile_state_css = (tones) => {
    const rgb = (c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    const rgba = (c, a) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
    return [
        `.gk-panel .gk-auto-on { color: ${rgb(tones.text)}; border-color: ${rgba(tones.tint, 0.5)}; background-color: ${rgba(tones.tint, 0.08)}; }`,
        `.gk-panel .gk-auto-on:hover { color: ${rgb(tones.text)}; background-color: ${rgba(tones.tint, 0.16)}; }`,
        `.gk-panel .gk-row-assigned { background-color: ${rgba(tones.tint, 0.06)}; }`,
        `.gk-panel .gk-row-assigned:hover { background-color: ${rgba(tones.tint, 0.13)}; }`,
        `.gk-panel .gk-row-stripe { background-color: ${rgb(tones.tint)}; }`,
        `.gk-panel .gk-sub { color: ${rgb(tones.text)}; }`,
        `.gk-panel.gk-light .gk-auto-on { color: ${rgb(tones.lightText)}; border-color: ${rgba(tones.lightTint, 0.5)}; background-color: ${rgba(tones.lightTint, 0.1)}; }`,
        `.gk-panel.gk-light .gk-auto-on:hover { color: ${rgb(tones.lightText)}; background-color: ${rgba(tones.lightTint, 0.18)}; }`,
        `.gk-panel.gk-light .gk-row-assigned { background-color: ${rgba(tones.lightTint, 0.08)}; }`,
        `.gk-panel.gk-light .gk-row-assigned:hover { background-color: ${rgba(tones.lightTint, 0.16)}; }`,
        `.gk-panel.gk-light .gk-row-stripe { background-color: ${rgb(tones.lightTint)}; }`,
        `.gk-panel.gk-light .gk-sub { color: ${rgb(tones.lightText)}; }`,
    ].join('\n');
};

module.exports = {
    tile_state_default,
    tile_state_mode,
    tile_state_tones,
    tile_state_css,
};

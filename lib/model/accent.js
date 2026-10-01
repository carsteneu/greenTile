/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * accent model, extracted verbatim from the marked pure model block in
 * greenTile.js (no Cinnamon imports). Author of the model code: carsten_eu.
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

// All accent colors derive from one base: today's orange, the accent of the
// Cinnamon theme (probed at runtime — lib/runtime/theme.js applies it) or the custom
// accentColor setting. The historical orange keeps its exact tone table, so
// the default look stays pixel-identical; every other base is derived from
// HSL lightness: hover lighter, light theme darker, text by luminance.
const tile_accent_default = [255, 150, 64];
// The colorchooser stores Gdk.RGBA strings ("rgb(r,g,b)", "rgba(r,g,b,a)").
// #hex is accepted too (hand-edited JSON); anything else falls back below.
const tile_accent_parse = (value) => {
    if (typeof value !== 'string')
        return null;
    const rgb = value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/i);
    if (rgb) {
        const parts = rgb.slice(1, 4).map(Number);
        return parts.some((c) => c > 255) ? null : parts;
    }
    const hex = value.match(/^#([0-9a-f]{6})$/i);
    if (hex)
        return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16));
    return null;
};
// The settings dialog cannot offer an option with the value "custom"
// (xlet-settings.py drops it), so the schema value is "own"; a stored legacy
// "custom" (hand-edited file of an older version) keeps meaning the same thing.
const tile_accent_is_own = (mode) => mode === 'own' || mode === 'custom';
// The probed ink is only an accent when it is opaque, saturated enough to
// differ from the panel greys and neither near-black (invisible) nor
// near-white (unreadable) — anything else keeps the default orange.
const tile_accent_from_probed = (r, g, b, a) => {
    if (![r, g, b, a].every((n) => Number.isFinite(n)) || a < 250)
        return null;
    const rgb = [r, g, b].map(Math.round);
    const max = Math.max(...rgb);
    const min = Math.min(...rgb);
    const l = (max + min) / 510;
    const s = max === min ? 0 : l < 0.5 ? (max - min) / (max + min) : (max - min) / (510 - max - min);
    if (s < 0.15 || l < 0.14 || l > 0.92)
        return null;
    return rgb;
};
// The theme probe chain, in fallback order: the menu entries carry the theme
// accent in Mint-L, but Mint-Y paints them grey — there the calendar day
// hover state holds it. tile_accent_probe_first walks the chain and returns
// the first color the model accepts, so grey themes keep the default. The
// probes resolve class-selector rules only — themes painting their accent on
// type-qualified selectors or in border-color keep the default too.
const tile_accent_probes = [
    ['popup-menu-item', 'active'],
    ['popup-menu-item', 'hover'],
    ['calendar-day-base', 'hover'],
];
const tile_accent_probe_first = (probeFn) => {
    for (const [className, pseudoClass] of tile_accent_probes) {
        const rgb = probeFn(className, pseudoClass);
        if (rgb)
            return rgb;
    }
    return null;
};
const tile_accent_hsl = (rgb) => {
    const [r, g, b] = rgb.map((v) => v / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const s = max === min ? 0 : (l < 0.5 ? (max - min) / (max + min) : (max - min) / (2 - max - min));
    let h = 0;
    if (max !== min) {
        if (max === r)
            h = ((g - b) / (max - min)) % 6;
        else if (max === g)
            h = (b - r) / (max - min) + 2;
        else
            h = (r - g) / (max - min) + 4;
        h = h * 60;
        if (h < 0)
            h += 360;
    }
    return [h, s, l];
};
const tile_accent_rgb = (hsl) => {
    const [h, s, l] = hsl;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    const parts = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return parts.map((v) => Math.round((v + m) * 255));
};
const tile_accent_text_on = (rgb) => {
    const lin = (v) => {
        v /= 255;
        return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    const y = 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
    return y > 0.3 ? [20, 22, 29] : [246, 247, 250];
};
const tile_accent_tones = (base) => {
    if (base[0] === 255 && base[1] === 150 && base[2] === 64)
        return {
            base: [255, 150, 64],
            hover: [255, 176, 112],
            saveHover: [255, 171, 102],
            lightBase: [217, 122, 36],
            lightHover: [232, 154, 63],
            textOn: [20, 22, 29],
        };
    const [h, s, l] = tile_accent_hsl(base);
    const lighter = (v) => Math.min(v + 0.10, 0.92);
    const lightBase = tile_accent_rgb([h, s, Math.min(l, 0.5)]);
    return {
        base: [base[0], base[1], base[2]],
        hover: tile_accent_rgb([h, s, lighter(l)]),
        saveHover: tile_accent_rgb([h, s, Math.min(l + 0.08, 0.92)]),
        lightBase: lightBase,
        lightHover: tile_accent_rgb([h, s, lighter(Math.min(l, 0.5))]),
        textOn: tile_accent_text_on(base),
    };
};
// The generated stylesheet overrides the accent rules of stylesheet.css. The
// selectors are prefixed with .gk-panel (every accent actor is a descendant of
// the panel root), which makes them more specific than the base rules — the
// override does not depend on how st orders equally specific sheets. As today,
// the light scope tints keep the base rgb — only the alphas differ.
const tile_accent_css = (tones) => {
    const rgb = (c) => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    const rgba = (c, a) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`;
    return [
        '/* generated by the greenTile accent model (accent and state colors) — manual edits are overwritten */',
        `.gk-panel .gk-plus { color: ${rgb(tones.base)}; }`,
        `.gk-panel .gk-plus:hover { color: ${rgb(tones.hover)}; }`,
        `.gk-panel .gk-grip:hover { color: ${rgb(tones.base)}; }`,
        `.gk-panel .gk-reset-btn:hover { background-color: ${rgba(tones.base, 0.18)}; border-color: ${rgb(tones.base)}; }`,
        `.gk-panel .gk-ed-rule-active { background-color: ${rgba(tones.base, 0.08)}; }`,
        `.gk-panel .gk-ed-rule-active:hover { background-color: ${rgba(tones.base, 0.14)}; }`,
        `.gk-panel .gk-ed-rule-stripe { background-color: ${rgb(tones.base)}; }`,
        `.gk-panel .gk-ed-add { color: ${rgb(tones.base)}; }`,
        `.gk-panel .gk-ed-add:hover { color: ${rgb(tones.hover)}; }`,
        `.gk-panel .gk-stepper-btn:hover { border-color: ${rgb(tones.base)}; }`,
        `.gk-panel .gk-entry { selection-background-color: ${rgb(tones.base)}; selected-color: ${rgb(tones.textOn)}; }`,
        `.gk-panel .gk-entry:focus { border-color: ${rgb(tones.base)}; }`,
        `.gk-panel .gk-save { color: ${rgb(tones.textOn)}; background-color: ${rgb(tones.base)}; }`,
        `.gk-panel .gk-save:hover { background-color: ${rgb(tones.saveHover)}; }`,
        `.gk-panel.gk-light .gk-plus { color: ${rgb(tones.lightBase)}; }`,
        `.gk-panel.gk-light .gk-plus:hover { color: ${rgb(tones.lightHover)}; }`,
        `.gk-panel.gk-light .gk-grip:hover { color: ${rgb(tones.lightBase)}; }`,
        `.gk-panel.gk-light .gk-reset-btn:hover { background-color: ${rgba(tones.base, 0.22)}; border-color: ${rgb(tones.lightBase)}; }`,
        `.gk-panel.gk-light .gk-ed-rule-active { background-color: ${rgba(tones.base, 0.14)}; }`,
        `.gk-panel.gk-light .gk-ed-rule-active:hover { background-color: ${rgba(tones.base, 0.2)}; }`,
        `.gk-panel.gk-light .gk-ed-rule-stripe { background-color: ${rgb(tones.lightBase)}; }`,
        `.gk-panel.gk-light .gk-ed-add { color: ${rgb(tones.lightBase)}; }`,
        `.gk-panel.gk-light .gk-ed-add:hover { color: ${rgb(tones.lightHover)}; }`,
        `.gk-panel.gk-light .gk-stepper-btn:hover { border-color: ${rgb(tones.lightBase)}; }`,
        `.gk-panel.gk-light .gk-entry:focus { border-color: ${rgb(tones.lightBase)}; }`,
    ].join('\n');
};

module.exports = {
    tile_accent_default,
    tile_accent_parse,
    tile_accent_is_own,
    tile_accent_from_probed,
    tile_accent_probes,
    tile_accent_probe_first,
    tile_accent_hsl,
    tile_accent_rgb,
    tile_accent_text_on,
    tile_accent_tones,
    tile_accent_css,
};

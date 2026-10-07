'use strict';
// The painter's boundary handles must stay visible on the painted column AND in the
// panel gap, in both themes and for any accent the theme probe or the colour chooser
// can produce. The pure model (lib/model/accent.js) picks the ink: the one with the
// higher WCAG contrast against the painted column (the accent at 0.85 over the panel
// colour, exactly as the painter fills it), while the opposite ink becomes the rim.
//
// The contrast maths here is deliberately an INDEPENDENT implementation (WCAG relative
// luminance), so a wrong formula inside the model cannot pass by symmetry.
const test = require('node:test');
const assert = require('node:assert/strict');

const accent = require('../helpers/cinnamon-loader').load('./lib/model/accent.js');
const theme = require('../helpers/cinnamon-loader').load('./lib/model/theme.js');

const DARK_INK = [20, 22, 29];
const LIGHT_INK = [246, 247, 250];
const PANEL_DARK = [28, 31, 40];
const PANEL_LIGHT = [246, 247, 250];

const lin = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const luminance = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
const ratio = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};
const composite = (accentRgb, panelRgb) => accentRgb.map((v, i) => v * 0.85 + panelRgb[i] * 0.15);

test('the panel colour of both themes is available to cairo', () => {
    // Cairo cannot read the stylesheet, so the painter's background has to come from the
    // theme table: .gk-panel is rgba(28, 31, 40, 0.98) dark and rgba(246, 247, 250, 0.98) light.
    assert.deepEqual(theme.THEME_CAIRO.dark.panel, PANEL_DARK);
    assert.deepEqual(theme.THEME_CAIRO.light.panel, PANEL_LIGHT);
});

test('a bright accent gets the dark ink and the light rim, in both themes', () => {
    for (const panel of [PANEL_DARK, PANEL_LIGHT]) {
        assert.deepEqual(accent.accentHandleInk([255, 150, 64], panel), { fill: DARK_INK, rim: LIGHT_INK });
        assert.deepEqual(accent.accentHandleInk([250, 250, 250], panel), { fill: DARK_INK, rim: LIGHT_INK });
    }
});

test('a dark accent gets the light ink and the dark rim, in both themes', () => {
    for (const panel of [PANEL_DARK, PANEL_LIGHT]) {
        assert.deepEqual(accent.accentHandleInk([8, 8, 8], panel), { fill: LIGHT_INK, rim: DARK_INK });
        assert.deepEqual(accent.accentHandleInk([0, 0, 0], panel), { fill: LIGHT_INK, rim: DARK_INK });
    }
});

test('saturated accents keep the fill and rim as a contrasting pair', () => {
    for (const panel of [PANEL_DARK, PANEL_LIGHT]) {
        for (const base of [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [0, 255, 255], [255, 0, 255]]) {
            const ink = accent.accentHandleInk(base, panel);
            assert.notDeepEqual(ink.fill, ink.rim, `rim must differ from the fill for ${base}`);
            assert.ok([DARK_INK, LIGHT_INK].some((c) => c[0] === ink.fill[0] && c[1] === ink.fill[1] && c[2] === ink.fill[2]));
            assert.deepEqual(ink.rim, ink.fill[0] === DARK_INK[0] ? LIGHT_INK : DARK_INK);
        }
    }
});

test('the chosen ink is the higher-contrast one against the painted column, everywhere', () => {
    // Property sweep: the accent can be ANY colour (theme probe or the colour chooser),
    // and the painter fills the column with accent*0.85 over the panel colour.
    const ramp = Array.from({ length: 32 }, (_v, i) => [i * 8, i * 8, i * 8]);
    const extras = [[255, 150, 64], [255, 0, 0], [0, 0, 255], [12, 200, 90], [200, 12, 90], [255, 255, 255], [0, 0, 0]];
    for (const panel of [PANEL_DARK, PANEL_LIGHT]) {
        for (const base of ramp.concat(extras)) {
            const painted = composite(base, panel);
            const ink = accent.accentHandleInk(base, panel);
            const fillContrast = ratio(ink.fill, painted);
            const rimContrast = ratio(ink.rim, painted);
            assert.ok(fillContrast >= rimContrast, `fill is the better ink on the column for ${base} on ${panel}`);
            assert.ok(fillContrast >= 4.0,
                `>= 4:1 on the painted column, got ${fillContrast.toFixed(2)}:1 for ${base} on ${panel}`);
            // One of the two inks always carries the gap/background side too.
            assert.ok(Math.max(ratio(ink.fill, panel), ratio(ink.rim, panel)) >= 7.0,
                `>= 7:1 somewhere against the panel for ${base} on ${panel}`);
        }
    }
});

test('accentInkOn picks by luminance and stays consistent with the handle fill', () => {
    assert.deepEqual(accent.accentInkOn([255, 200, 120]), DARK_INK);
    assert.deepEqual(accent.accentInkOn([24, 26, 34]), LIGHT_INK);
    for (const base of [[10, 10, 10], [128, 128, 128], [240, 240, 240], [255, 150, 64]]) {
        assert.deepEqual(accent.accentInkOn(composite(base, PANEL_DARK)), accent.accentHandleInk(base, PANEL_DARK).fill);
    }
});

test('the existing text-on-accent rule keeps its exact values', () => {
    // The handle work must not move the stylesheet's ink: same two constants, same y > 0.3 rule.
    assert.deepEqual(accent.accentTextOn([255, 150, 64]), DARK_INK);
    assert.deepEqual(accent.accentTextOn([40, 40, 40]), LIGHT_INK);
    const tones = accent.accentTones([255, 150, 64]);
    assert.deepEqual(tones, {
        base: [255, 150, 64], hover: [255, 176, 112], saveHover: [255, 171, 102],
        lightBase: [217, 122, 36], lightHover: [232, 154, 63], textOn: [20, 22, 29],
    });
});

'use strict';
// The painter's boundary handles must stay visible on the painted column AND in the gap
// beside them, in both themes and for any accent the theme probe or the colour chooser can
// produce. The pure model (lib/model/accent.js) picks one ink per BAND, for the surface
// that band lies on: a merge handle sits in the gap (fill on the painter background, rim
// on the two columns beside it), a split handle sits inside a merged column (both bands on
// the painted column, the rim as an inner edge).
//
// The contrast maths here is deliberately an INDEPENDENT implementation (WCAG relative
// luminance), so a wrong formula inside the model cannot pass by symmetry.
const test = require('node:test');
const assert = require('node:assert/strict');

const accent = require('../helpers/cinnamon-loader').load('./lib/model/accent.js');
const theme = require('../helpers/cinnamon-loader').load('./lib/model/theme.js');

const DARK_INK = [20, 22, 29];
const LIGHT_INK = [246, 247, 250];
// .gk-painter backgrounds (stylesheet.css) — what the columns are painted over and what
// the gap between two painted columns shows.
const PAINTER_DARK = [20, 22, 29];
const PAINTER_LIGHT = [232, 235, 241];

const lin = (v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};
const luminance = (rgb) => 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
const ratio = (a, b) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
};
const painted = (base, painter) => base.map((v, i) => v * 0.85 + painter[i] * 0.15);

test('the painter background of both themes is available to cairo', () => {
    // Cairo cannot read the stylesheet, so the surface the painter draws on has to come
    // from the theme table: .gk-painter is #14161d dark and #e8ebf1 light.
    assert.deepEqual(theme.THEME_CAIRO.dark.painter, PAINTER_DARK);
    assert.deepEqual(theme.THEME_CAIRO.light.painter, PAINTER_LIGHT);
});

test('a merge handle is inked for the gap, a split handle for the column', () => {
    // Bright accent on the dark painter: the gap is dark (light ink) and the column is
    // bright (dark ink) — the two bands take opposite inks, which is the point.
    assert.deepEqual(accent.accentHandleInk('merge', [255, 150, 64], PAINTER_DARK),
        { fill: LIGHT_INK, rim: DARK_INK });
    assert.deepEqual(accent.accentHandleInk('split', [255, 150, 64], PAINTER_DARK),
        { fill: DARK_INK, rim: LIGHT_INK });
    // Light painter: the gap is bright (dark ink) and so is the orange column, so both
    // bands land on the dark ink — a visible mark on every surface it touches.
    assert.deepEqual(accent.accentHandleInk('merge', [255, 150, 64], PAINTER_LIGHT),
        { fill: DARK_INK, rim: DARK_INK });
    assert.deepEqual(accent.accentHandleInk('split', [255, 150, 64], PAINTER_LIGHT),
        { fill: DARK_INK, rim: LIGHT_INK });
});

test('a dark accent flips to the light ink where the surface is dark', () => {
    assert.deepEqual(accent.accentHandleInk('merge', [8, 8, 8], PAINTER_DARK),
        { fill: LIGHT_INK, rim: LIGHT_INK });
    assert.deepEqual(accent.accentHandleInk('split', [8, 8, 8], PAINTER_DARK),
        { fill: LIGHT_INK, rim: DARK_INK });
    // Light painter + dark accent: the gap is bright, the column dark — opposite inks again.
    assert.deepEqual(accent.accentHandleInk('merge', [8, 8, 8], PAINTER_LIGHT),
        { fill: DARK_INK, rim: LIGHT_INK });
});

test('every band stays legible on the surface it covers, for any accent', () => {
    // Property sweep: the accent can be ANY colour (theme probe or the colour chooser).
    const ramp = Array.from({ length: 32 }, (_v, i) => [i * 8, i * 8, i * 8]);
    const extras = [[255, 150, 64], [255, 0, 0], [0, 0, 255], [12, 200, 90], [200, 12, 90], [255, 255, 255], [0, 0, 0]];
    for (const painter of [PAINTER_DARK, PAINTER_LIGHT]) {
        for (const base of ramp.concat(extras)) {
            const column = painted(base, painter);
            const merge = accent.accentHandleInk('merge', base, painter);
            const split = accent.accentHandleInk('split', base, painter);
            // The merge handle's fill band lies on the gap, its rim band on the columns.
            assert.ok(ratio(merge.fill, painter) >= 4.0,
                `merge fill >= 4:1 on the gap, got ${ratio(merge.fill, painter).toFixed(2)} for ${base} on ${painter}`);
            assert.ok(ratio(merge.rim, column) >= 4.0,
                `merge rim >= 4:1 on the column, got ${ratio(merge.rim, column).toFixed(2)} for ${base} on ${painter}`);
            // The split handle sits on the column: its fill carries the mark there.
            assert.ok(ratio(split.fill, column) >= 4.0,
                `split fill >= 4:1 on the column, got ${ratio(split.fill, column).toFixed(2)} for ${base} on ${painter}`);
            // The split rim is an inner edge, not the contrast carrier, but it must differ.
            assert.notDeepEqual(split.rim, split.fill);
            assert.ok([DARK_INK, LIGHT_INK].some((c) => c[0] === split.fill[0] && c[1] === split.fill[1] && c[2] === split.fill[2]));
        }
    }
});

test('accentInkOn picks by luminance and stays consistent with the handle inks', () => {
    assert.deepEqual(accent.accentInkOn([255, 200, 120]), DARK_INK);
    assert.deepEqual(accent.accentInkOn([24, 26, 34]), LIGHT_INK);
    for (const base of [[10, 10, 10], [128, 128, 128], [240, 240, 240], [255, 150, 64]]) {
        assert.deepEqual(accent.accentInkOn(painted(base, PAINTER_DARK)),
            accent.accentHandleInk('split', base, PAINTER_DARK).fill);
        assert.deepEqual(accent.accentInkOn(PAINTER_DARK),
            accent.accentHandleInk('merge', base, PAINTER_DARK).fill);
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

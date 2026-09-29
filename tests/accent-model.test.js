'use strict';
// Tests the pure accent model of greenTile.js (marked block "accent-model"),
// extracted and evaluated without Cinnamon, like the other model blocks. It
// parses the colorchooser value, decides whether a probed Cinnamon theme
// accent is usable, derives all tones from one base and generates the accent
// stylesheet. The default orange must survive the round trip unchanged.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'greenTile.js'), 'utf8');
const match = src.match(/\/\/ >>> accent-model[^\n]*\n([\s\S]*?)\/\/ <<< accent-model/);
if (!match)
    throw new Error('accent-model block not found in greenTile.js');
const block = match[1];
const names = ['tile_accent_default', 'tile_accent_parse', 'tile_accent_from_probed', 'tile_accent_tones', 'tile_accent_css'];
const m = new Function(block + '\nreturn {' + names.join(',') + '};')();

test('block is self-contained', () => {
    assert.doesNotMatch(block, /imports\.|tile_St|tile_Clutter|global\.|utils_Main/);
});

test('default accent is today\'s orange', () => {
    assert.deepEqual(m.tile_accent_default, [255, 150, 64]);
});

test('parse reads rgb() values as written by the colorchooser', () => {
    assert.deepEqual(m.tile_accent_parse('rgb(255,150,64)'), [255, 150, 64]);
    assert.deepEqual(m.tile_accent_parse('rgb( 108 , 171 , 205 )'), [108, 171, 205]);
    assert.deepEqual(m.tile_accent_parse('RGBA(12,34,56,78)'), [12, 34, 56]);
});

test('parse drops a float alpha and accepts the rgb() without it', () => {
    assert.deepEqual(m.tile_accent_parse('rgba(255,150,64,0.9)'), [255, 150, 64]);
    assert.deepEqual(m.tile_accent_parse('rgba(0,0,0,1)'), [0, 0, 0]);
});

test('parse reads #hex values', () => {
    assert.deepEqual(m.tile_accent_parse('#ff9640'), [255, 150, 64]);
    assert.deepEqual(m.tile_accent_parse('#6CABCD'), [108, 171, 205]);
});

test('parse rejects garbage and out-of-range values', () => {
    assert.equal(m.tile_accent_parse(''), null);
    assert.equal(m.tile_accent_parse('green'), null);
    assert.equal(m.tile_accent_parse('rgb(255,150)'), null);
    assert.equal(m.tile_accent_parse('rgb(300,150,64)'), null);
    assert.equal(m.tile_accent_parse('rgb(-5,150,64)'), null);
    assert.equal(m.tile_accent_parse(null), null);
    assert.equal(m.tile_accent_parse(undefined), null);
});

test('probed accent passes through the verified spike color', () => {
    assert.deepEqual(m.tile_accent_from_probed(108, 171, 205, 255), [108, 171, 205]);
    assert.deepEqual(m.tile_accent_from_probed(255, 150, 64, 255), [255, 150, 64]);
});

test('probed accent is rejected when transparent, grey or extreme', () => {
    assert.equal(m.tile_accent_from_probed(108, 171, 205, 0), null);
    assert.equal(m.tile_accent_from_probed(108, 171, 205, 100), null);
    assert.equal(m.tile_accent_from_probed(128, 128, 128, 255), null);
    assert.equal(m.tile_accent_from_probed(26, 29, 36, 255), null);
    assert.equal(m.tile_accent_from_probed(250, 250, 250, 255), null);
    assert.equal(m.tile_accent_from_probed(null, 171, 205, 255), null);
    assert.equal(m.tile_accent_from_probed(108, undefined, 205, 255), null);
});

test('tones for the default orange are the historical values, exactly', () => {
    assert.deepEqual(m.tile_accent_tones([255, 150, 64]), {
        base: [255, 150, 64],
        hover: [255, 176, 112],
        saveHover: [255, 171, 102],
        lightBase: [217, 122, 36],
        lightHover: [232, 154, 63],
        textOn: [20, 22, 29],
    });
});

test('derived tones are lighter on hover and darker in light theme', () => {
    const tones = m.tile_accent_tones([108, 171, 205]);
    const sum = (rgb) => rgb[0] + rgb[1] + rgb[2];
    assert.deepEqual(tones.base, [108, 171, 205]);
    assert.equal(sum(tones.hover) > sum(tones.base), true);
    assert.equal(sum(tones.lightBase) < sum(tones.base), true);
    assert.equal(sum(tones.lightHover) > sum(tones.lightBase), true);
    assert.deepEqual(tones.textOn, [20, 22, 29]);
    assert.deepEqual(m.tile_accent_tones([108, 171, 205]), tones);
});

test('text on accent switches sides by luminance', () => {
    assert.deepEqual(m.tile_accent_tones([40, 44, 52]).textOn, [246, 247, 250]);
});

test('generated CSS carries every accent selector in both scopes', () => {
    const css = m.tile_accent_css(m.tile_accent_tones([255, 150, 64]));
    for (const selector of [
        '.gk-plus { color: rgb(255, 150, 64); }',
        '.gk-plus:hover { color: rgb(255, 176, 112); }',
        '.gk-grip:hover { color: rgb(255, 150, 64); }',
        '.gk-reset-btn:hover { background-color: rgba(255, 150, 64, 0.18); border-color: rgb(255, 150, 64); }',
        '.gk-ed-rule-active { background-color: rgba(255, 150, 64, 0.08); }',
        '.gk-ed-rule-active:hover { background-color: rgba(255, 150, 64, 0.14); }',
        '.gk-ed-rule-stripe { background-color: rgb(255, 150, 64); }',
        '.gk-ed-add { color: rgb(255, 150, 64); }',
        '.gk-ed-add:hover { color: rgb(255, 176, 112); }',
        '.gk-stepper-btn:hover { border-color: rgb(255, 150, 64); }',
        '.gk-entry { selection-background-color: rgb(255, 150, 64); selected-color: rgb(20, 22, 29); }',
        '.gk-save { color: rgb(20, 22, 29); background-color: rgb(255, 150, 64); }',
        '.gk-save:hover { background-color: rgb(255, 171, 102); }',
    ])
        assert.equal(css.includes(selector), true, selector);
    for (const selector of [
        '.gk-light .gk-plus { color: rgb(217, 122, 36); }',
        '.gk-light .gk-plus:hover { color: rgb(232, 154, 63); }',
        '.gk-light .gk-grip:hover { color: rgb(217, 122, 36); }',
        '.gk-light .gk-reset-btn:hover { background-color: rgba(255, 150, 64, 0.22); border-color: rgb(217, 122, 36); }',
        '.gk-light .gk-ed-rule-active { background-color: rgba(255, 150, 64, 0.14); }',
        '.gk-light .gk-ed-rule-active:hover { background-color: rgba(255, 150, 64, 0.2); }',
        '.gk-light .gk-ed-rule-stripe { background-color: rgb(217, 122, 36); }',
        '.gk-light .gk-ed-add { color: rgb(217, 122, 36); }',
        '.gk-light .gk-ed-add:hover { color: rgb(232, 154, 63); }',
        '.gk-light .gk-stepper-btn:hover { border-color: rgb(217, 122, 36); }',
        '.gk-light .gk-entry:focus { border-color: rgb(217, 122, 36); }',
    ])
        assert.equal(css.includes(selector), true, selector);
});

test('generated CSS for a probed accent carries the accent, not orange', () => {
    const css = m.tile_accent_css(m.tile_accent_tones([108, 171, 205]));
    assert.equal(css.includes('rgb(108, 171, 205)'), true);
    assert.equal(css.includes('rgb(255, 150, 64)'), false);
});

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
const stateMatch = src.match(/\/\/ >>> state-model[^\n]*\n([\s\S]*?)\/\/ <<< state-model/);
if (!stateMatch)
    throw new Error('state-model block not found in greenTile.js');
const stateBlock = stateMatch[1];
const names = ['tile_accent_default', 'tile_accent_parse', 'tile_accent_from_probed', 'tile_accent_tones', 'tile_accent_css', 'tile_accent_is_own', 'tile_accent_probes', 'tile_accent_probe_first'];
const stateNames = ['tile_state_default', 'tile_state_mode', 'tile_state_tones', 'tile_state_css'];
// the state block builds on the accent block's HSL helpers, so both evaluate together
const m = new Function(block + '\n' + stateBlock + '\nreturn {' + names.concat(stateNames).join(',') + '};')();

test('blocks are self-contained', () => {
    assert.doesNotMatch(block + stateBlock, /imports\.|tile_St|tile_Clutter|global\.|utils_Main/);
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

test('probe chain tries menu entries first, then the calendar day hover', () => {
    assert.deepEqual(m.tile_accent_probes, [
        ['popup-menu-item', 'active'],
        ['popup-menu-item', 'hover'],
        ['calendar-day-base', 'hover'],
    ]);
});

test('probe chain returns the first color the model accepts', () => {
    // Mint-Y paints its menu entries grey; the calendar day hover carries the accent
    const mintY = (className, pseudoClass) =>
        className === 'calendar-day-base' && pseudoClass === 'hover' ? [232, 33, 39] : null;
    assert.deepEqual(m.tile_accent_probe_first(mintY), [232, 33, 39]);
    // Mint-L matches the first stage — later stages stay untouched
    let reached = false;
    const mintL = (className, pseudoClass) => {
        if (className === 'popup-menu-item' && pseudoClass === 'active')
            return [108, 171, 205];
        reached = true;
        return null;
    };
    assert.deepEqual(m.tile_accent_probe_first(mintL), [108, 171, 205]);
    assert.equal(reached, false);
});

test('probe chain keeps the default when no stage qualifies', () => {
    assert.equal(m.tile_accent_probe_first(() => null), null);
    // grey calendar day (Mint-Y-Dark-Grey) is rejected by the model at the caller
    const greyTheme = (className, pseudoClass) =>
        className === 'popup-menu-item' ? null : [112, 115, 122];
    assert.deepEqual(m.tile_accent_probe_first(greyTheme), [112, 115, 122]);
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
        '.gk-panel .gk-plus { color: rgb(255, 150, 64); }',
        '.gk-panel .gk-plus:hover { color: rgb(255, 176, 112); }',
        '.gk-panel .gk-grip:hover { color: rgb(255, 150, 64); }',
        '.gk-panel .gk-reset-btn:hover { background-color: rgba(255, 150, 64, 0.18); border-color: rgb(255, 150, 64); }',
        '.gk-panel .gk-ed-rule-active { background-color: rgba(255, 150, 64, 0.08); }',
        '.gk-panel .gk-ed-rule-active:hover { background-color: rgba(255, 150, 64, 0.14); }',
        '.gk-panel .gk-ed-rule-stripe { background-color: rgb(255, 150, 64); }',
        '.gk-panel .gk-ed-add { color: rgb(255, 150, 64); }',
        '.gk-panel .gk-ed-add:hover { color: rgb(255, 176, 112); }',
        '.gk-panel .gk-stepper-btn:hover { border-color: rgb(255, 150, 64); }',
        '.gk-panel .gk-entry { selection-background-color: rgb(255, 150, 64); selected-color: rgb(20, 22, 29); }',
        '.gk-panel .gk-entry:focus { border-color: rgb(255, 150, 64); }',
        '.gk-panel .gk-save { color: rgb(20, 22, 29); background-color: rgb(255, 150, 64); }',
        '.gk-panel .gk-save:hover { background-color: rgb(255, 171, 102); }',
    ])
        assert.equal(css.includes(selector), true, selector);
    for (const selector of [
        '.gk-panel.gk-light .gk-plus { color: rgb(217, 122, 36); }',
        '.gk-panel.gk-light .gk-plus:hover { color: rgb(232, 154, 63); }',
        '.gk-panel.gk-light .gk-grip:hover { color: rgb(217, 122, 36); }',
        '.gk-panel.gk-light .gk-reset-btn:hover { background-color: rgba(255, 150, 64, 0.22); border-color: rgb(217, 122, 36); }',
        '.gk-panel.gk-light .gk-ed-rule-active { background-color: rgba(255, 150, 64, 0.14); }',
        '.gk-panel.gk-light .gk-ed-rule-active:hover { background-color: rgba(255, 150, 64, 0.2); }',
        '.gk-panel.gk-light .gk-ed-rule-stripe { background-color: rgb(217, 122, 36); }',
        '.gk-panel.gk-light .gk-ed-add { color: rgb(217, 122, 36); }',
        '.gk-panel.gk-light .gk-ed-add:hover { color: rgb(232, 154, 63); }',
        '.gk-panel.gk-light .gk-stepper-btn:hover { border-color: rgb(217, 122, 36); }',
        '.gk-panel.gk-light .gk-entry:focus { border-color: rgb(217, 122, 36); }',
    ])
        assert.equal(css.includes(selector), true, selector);
});

test('generated CSS for a probed accent carries the accent, not orange', () => {
    const css = m.tile_accent_css(m.tile_accent_tones([108, 171, 205]));
    assert.equal(css.includes('rgb(108, 171, 205)'), true);
    assert.equal(css.includes('rgb(255, 150, 64)'), false);
});

test('every accent color in stylesheet.css still matches the default tone table', () => {
    // Drift guard: if someone retunes a tone in stylesheet.css, the default-orange
    // generated stylesheet must follow (pixel identity of the default look).
    const sheet = fs.readFileSync(path.join(__dirname, '..', 'stylesheet.css'), 'utf8');
    for (const hex of ['#ff9640', '#ffb070', '#ffab66', '#d97a24', '#e89a3f', '#14161d'])
        assert.equal(sheet.includes(hex), true, hex + ' missing in stylesheet.css');
    const tints = new Set(sheet.match(/rgba\(255, 150, 64, [0-9.]+\)/g));
    assert.deepEqual(
        [...tints].sort(),
        ['rgba(255, 150, 64, 0.08)', 'rgba(255, 150, 64, 0.14)', 'rgba(255, 150, 64, 0.18)', 'rgba(255, 150, 64, 0.2)', 'rgba(255, 150, 64, 0.22)']
    );
});

test('setting mode "own" also recognizes the legacy "custom" value', () => {
    assert.equal(m.tile_accent_is_own('own'), true);
    assert.equal(m.tile_accent_is_own('custom'), true);
    assert.equal(m.tile_accent_is_own('theme'), false);
    assert.equal(m.tile_accent_is_own(undefined), false);
});

test('state mode resolution keeps the legacy "custom" working', () => {
    assert.deepEqual(m.tile_state_mode('green'), 'green');
    assert.deepEqual(m.tile_state_mode('theme'), 'theme');
    assert.deepEqual(m.tile_state_mode('own'), 'own');
    assert.deepEqual(m.tile_state_mode('custom'), 'own');
    assert.deepEqual(m.tile_state_mode('bogus'), 'green');
    assert.deepEqual(m.tile_state_mode(undefined), 'green');
});

test('default state is today\'s green', () => {
    assert.deepEqual(m.tile_state_default, [156, 224, 114]);
});

test('state tones for the default green are the historical values, exactly', () => {
    assert.deepEqual(m.tile_state_tones([156, 224, 114]), {
        text: [156, 224, 114],
        tint: [156, 224, 114],
        lightText: [63, 143, 34],
        lightTint: [78, 165, 48],
    });
});

test('derived state tones keep the base in dark and split light text from tints', () => {
    const tones = m.tile_state_tones([108, 171, 205]);
    const sum = (rgb) => rgb[0] + rgb[1] + rgb[2];
    assert.deepEqual(tones.text, [108, 171, 205]);
    assert.deepEqual(tones.tint, [108, 171, 205]);
    assert.equal(sum(tones.lightText) < sum(tones.tint), true);
    assert.equal(sum(tones.lightTint) < sum(tones.tint), true);
    assert.equal(sum(tones.lightText) < sum(tones.lightTint), true);
    assert.deepEqual(m.tile_state_tones([108, 171, 205]), tones);
});

test('generated state CSS carries every state selector in both scopes', () => {
    const css = m.tile_state_css(m.tile_state_tones([156, 224, 114]));
    for (const selector of [
        '.gk-panel .gk-auto-on { color: rgb(156, 224, 114); border-color: rgba(156, 224, 114, 0.5); background-color: rgba(156, 224, 114, 0.08); }',
        '.gk-panel .gk-auto-on:hover { color: rgb(156, 224, 114); background-color: rgba(156, 224, 114, 0.16); }',
        '.gk-panel .gk-row-assigned { background-color: rgba(156, 224, 114, 0.06); }',
        '.gk-panel .gk-row-assigned:hover { background-color: rgba(156, 224, 114, 0.13); }',
        '.gk-panel .gk-row-stripe { background-color: rgb(156, 224, 114); }',
        '.gk-panel .gk-sub { color: rgb(156, 224, 114); }',
    ])
        assert.equal(css.includes(selector), true, selector);
    for (const selector of [
        '.gk-panel.gk-light .gk-auto-on { color: rgb(63, 143, 34); border-color: rgba(78, 165, 48, 0.5); background-color: rgba(78, 165, 48, 0.1); }',
        '.gk-panel.gk-light .gk-auto-on:hover { color: rgb(63, 143, 34); background-color: rgba(78, 165, 48, 0.18); }',
        '.gk-panel.gk-light .gk-row-assigned { background-color: rgba(78, 165, 48, 0.08); }',
        '.gk-panel.gk-light .gk-row-assigned:hover { background-color: rgba(78, 165, 48, 0.16); }',
        '.gk-panel.gk-light .gk-row-stripe { background-color: rgb(78, 165, 48); }',
        '.gk-panel.gk-light .gk-sub { color: rgb(63, 143, 34); }',
    ])
        assert.equal(css.includes(selector), true, selector);
});

test('generated state CSS for a custom color carries it, not the green', () => {
    const css = m.tile_state_css(m.tile_state_tones([108, 171, 205]));
    const tones = m.tile_state_tones([108, 171, 205]);
    assert.equal(css.includes('rgb(108, 171, 205)'), true);
    assert.equal(css.includes('rgb(156, 224, 114)'), false);
    assert.equal(css.includes('rgb(63, 143, 34)'), false);
    assert.equal(css.includes(`rgb(${tones.lightText[0]}, ${tones.lightText[1]}, ${tones.lightText[2]})`), true);
});

test('every state color in stylesheet.css still matches the default tone table', () => {
    // Drift guard for the state green: the light theme uses TWO greens (text
    // #3f8f22, tints and stripe #4ea530) — the default table must keep them.
    const sheet = fs.readFileSync(path.join(__dirname, '..', 'stylesheet.css'), 'utf8');
    for (const hex of ['#9ce072', '#3f8f22', '#4ea530'])
        assert.equal(sheet.includes(hex), true, hex + ' missing in stylesheet.css');
    const darkTints = new Set(sheet.match(/rgba\(156, 224, 114, [0-9.]+\)/g));
    assert.deepEqual(
        [...darkTints].sort(),
        ['rgba(156, 224, 114, 0.06)', 'rgba(156, 224, 114, 0.08)', 'rgba(156, 224, 114, 0.13)', 'rgba(156, 224, 114, 0.16)', 'rgba(156, 224, 114, 0.5)']
    );
    const lightTints = new Set(sheet.match(/rgba\(78, 165, 48, [0-9.]+\)/g));
    assert.deepEqual(
        [...lightTints].sort(),
        ['rgba(78, 165, 48, 0.08)', 'rgba(78, 165, 48, 0.1)', 'rgba(78, 165, 48, 0.16)', 'rgba(78, 165, 48, 0.18)', 'rgba(78, 165, 48, 0.5)']
    );
});

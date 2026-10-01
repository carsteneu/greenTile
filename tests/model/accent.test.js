'use strict';
// Tests the pure accent model (lib/model/accent.js), loaded through the shared
// Cinnamon-mimicking loader. It
// parses the colorchooser value, decides whether a probed Cinnamon theme
// accent is usable, derives all tones from one base and generates the accent
// stylesheet. The default orange must survive the round trip unchanged.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// the state model builds on the accent model's HSL helpers, so both load together
const m = {
    ...require('../helpers/cinnamon-loader').load('./lib/model/accent.js'),
    ...require('../helpers/cinnamon-loader').load('./lib/model/state.js'),
};

test('default accent is today\'s orange', () => {
    assert.deepEqual(m.accentDefault, [255, 150, 64]);
});

test('parse reads rgb() values as written by the colorchooser', () => {
    assert.deepEqual(m.accentParse('rgb(255,150,64)'), [255, 150, 64]);
    assert.deepEqual(m.accentParse('rgb( 108 , 171 , 205 )'), [108, 171, 205]);
    assert.deepEqual(m.accentParse('RGBA(12,34,56,78)'), [12, 34, 56]);
});

test('parse drops a float alpha and accepts the rgb() without it', () => {
    assert.deepEqual(m.accentParse('rgba(255,150,64,0.9)'), [255, 150, 64]);
    assert.deepEqual(m.accentParse('rgba(0,0,0,1)'), [0, 0, 0]);
});

test('parse reads #hex values', () => {
    assert.deepEqual(m.accentParse('#ff9640'), [255, 150, 64]);
    assert.deepEqual(m.accentParse('#6CABCD'), [108, 171, 205]);
});

test('parse rejects garbage and out-of-range values', () => {
    assert.equal(m.accentParse(''), null);
    assert.equal(m.accentParse('green'), null);
    assert.equal(m.accentParse('rgb(255,150)'), null);
    assert.equal(m.accentParse('rgb(300,150,64)'), null);
    assert.equal(m.accentParse('rgb(-5,150,64)'), null);
    assert.equal(m.accentParse(null), null);
    assert.equal(m.accentParse(undefined), null);
});

test('probed accent passes through the verified spike color', () => {
    assert.deepEqual(m.accentFromProbed(108, 171, 205, 255), [108, 171, 205]);
    assert.deepEqual(m.accentFromProbed(255, 150, 64, 255), [255, 150, 64]);
});

test('probed accent is rejected when transparent, grey or extreme', () => {
    assert.equal(m.accentFromProbed(108, 171, 205, 0), null);
    assert.equal(m.accentFromProbed(108, 171, 205, 100), null);
    assert.equal(m.accentFromProbed(128, 128, 128, 255), null);
    assert.equal(m.accentFromProbed(26, 29, 36, 255), null);
    assert.equal(m.accentFromProbed(250, 250, 250, 255), null);
    assert.equal(m.accentFromProbed(null, 171, 205, 255), null);
    assert.equal(m.accentFromProbed(108, undefined, 205, 255), null);
});

test('probe chain tries menu entries first, then the calendar day hover', () => {
    assert.deepEqual(m.accentProbes, [
        ['popup-menu-item', 'active'],
        ['popup-menu-item', 'hover'],
        ['calendar-day-base', 'hover'],
    ]);
});

test('probe chain returns the first color the model accepts', () => {
    // Mint-Y paints its menu entries grey; the calendar day hover carries the accent
    const mintY = (className, pseudoClass) =>
        className === 'calendar-day-base' && pseudoClass === 'hover' ? [232, 33, 39] : null;
    assert.deepEqual(m.accentProbeFirst(mintY), [232, 33, 39]);
    // Mint-L matches the first stage — later stages stay untouched
    let reached = false;
    const mintL = (className, pseudoClass) => {
        if (className === 'popup-menu-item' && pseudoClass === 'active')
            {return [108, 171, 205];}
        reached = true;
        return null;
    };
    assert.deepEqual(m.accentProbeFirst(mintL), [108, 171, 205]);
    assert.equal(reached, false);
});

test('probe chain keeps the default when no stage qualifies', () => {
    assert.equal(m.accentProbeFirst(() => null), null);
    // a grey calendar day (Mint-Y-Dark-Grey) is rejected inside accentProbe
    // by the model — the chain itself only walks stage by stage
    const greyTheme = (className, _pseudoClass) =>
        className === 'popup-menu-item' ? null : [112, 115, 122];
    assert.deepEqual(m.accentProbeFirst(greyTheme), [112, 115, 122]);
});

test('tones for the default orange are the historical values, exactly', () => {
    assert.deepEqual(m.accentTones([255, 150, 64]), {
        base: [255, 150, 64],
        hover: [255, 176, 112],
        saveHover: [255, 171, 102],
        lightBase: [217, 122, 36],
        lightHover: [232, 154, 63],
        textOn: [20, 22, 29],
    });
});

test('derived tones are lighter on hover and darker in light theme', () => {
    const tones = m.accentTones([108, 171, 205]);
    const sum = (rgb) => rgb[0] + rgb[1] + rgb[2];
    assert.deepEqual(tones.base, [108, 171, 205]);
    assert.equal(sum(tones.hover) > sum(tones.base), true);
    assert.equal(sum(tones.lightBase) < sum(tones.base), true);
    assert.equal(sum(tones.lightHover) > sum(tones.lightBase), true);
    assert.deepEqual(tones.textOn, [20, 22, 29]);
    assert.deepEqual(m.accentTones([108, 171, 205]), tones);
});

test('text on accent switches sides by luminance', () => {
    assert.deepEqual(m.accentTones([40, 44, 52]).textOn, [246, 247, 250]);
});

test('generated CSS carries every accent selector in both scopes', () => {
    const css = m.accentCss(m.accentTones([255, 150, 64]));
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
        {assert.equal(css.includes(selector), true, selector);}
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
        {assert.equal(css.includes(selector), true, selector);}
});

test('generated CSS for a probed accent carries the accent, not orange', () => {
    const css = m.accentCss(m.accentTones([108, 171, 205]));
    assert.equal(css.includes('rgb(108, 171, 205)'), true);
    assert.equal(css.includes('rgb(255, 150, 64)'), false);
});

test('every accent color in stylesheet.css still matches the default tone table', () => {
    // Drift guard: if someone retunes a tone in stylesheet.css, the default-orange
    // generated stylesheet must follow (pixel identity of the default look).
    const sheet = fs.readFileSync(path.join(__dirname, '..', '..', 'stylesheet.css'), 'utf8');
    for (const hex of ['#ff9640', '#ffb070', '#ffab66', '#d97a24', '#e89a3f', '#14161d'])
        {assert.equal(sheet.includes(hex), true, hex + ' missing in stylesheet.css');}
    const tints = new Set(sheet.match(/rgba\(255, 150, 64, [0-9.]+\)/g));
    assert.deepEqual(
        [...tints].sort(),
        ['rgba(255, 150, 64, 0.08)', 'rgba(255, 150, 64, 0.14)', 'rgba(255, 150, 64, 0.18)', 'rgba(255, 150, 64, 0.2)', 'rgba(255, 150, 64, 0.22)']
    );
});

test('setting mode "own" also recognizes the legacy "custom" value', () => {
    assert.equal(m.accentIsOwn('own'), true);
    assert.equal(m.accentIsOwn('custom'), true);
    assert.equal(m.accentIsOwn('theme'), false);
    assert.equal(m.accentIsOwn(undefined), false);
});

test('state mode resolution keeps the legacy "custom" working', () => {
    assert.deepEqual(m.stateMode('green'), 'green');
    assert.deepEqual(m.stateMode('theme'), 'theme');
    assert.deepEqual(m.stateMode('own'), 'own');
    assert.deepEqual(m.stateMode('custom'), 'own');
    assert.deepEqual(m.stateMode('bogus'), 'green');
    assert.deepEqual(m.stateMode(undefined), 'green');
});

test('default state is today\'s green', () => {
    assert.deepEqual(m.stateDefault, [156, 224, 114]);
});

test('state tones for the default green are the historical values, exactly', () => {
    assert.deepEqual(m.stateTones([156, 224, 114]), {
        text: [156, 224, 114],
        tint: [156, 224, 114],
        lightText: [63, 143, 34],
        lightTint: [78, 165, 48],
    });
});

test('derived state tones keep the base in dark and split light text from tints', () => {
    const tones = m.stateTones([108, 171, 205]);
    const sum = (rgb) => rgb[0] + rgb[1] + rgb[2];
    assert.deepEqual(tones.text, [108, 171, 205]);
    assert.deepEqual(tones.tint, [108, 171, 205]);
    assert.equal(sum(tones.lightText) < sum(tones.tint), true);
    assert.equal(sum(tones.lightTint) < sum(tones.tint), true);
    assert.equal(sum(tones.lightText) < sum(tones.lightTint), true);
    assert.deepEqual(m.stateTones([108, 171, 205]), tones);
});

test('generated state CSS carries every state selector in both scopes', () => {
    const css = m.stateCss(m.stateTones([156, 224, 114]));
    for (const selector of [
        '.gk-panel .gk-auto-on { color: rgb(156, 224, 114); border-color: rgba(156, 224, 114, 0.5); background-color: rgba(156, 224, 114, 0.08); }',
        '.gk-panel .gk-auto-on:hover { color: rgb(156, 224, 114); background-color: rgba(156, 224, 114, 0.16); }',
        '.gk-panel .gk-row-assigned { background-color: rgba(156, 224, 114, 0.06); }',
        '.gk-panel .gk-row-assigned:hover { background-color: rgba(156, 224, 114, 0.13); }',
        '.gk-panel .gk-row-stripe { background-color: rgb(156, 224, 114); }',
        '.gk-panel .gk-sub { color: rgb(156, 224, 114); }',
    ])
        {assert.equal(css.includes(selector), true, selector);}
    for (const selector of [
        '.gk-panel.gk-light .gk-auto-on { color: rgb(63, 143, 34); border-color: rgba(78, 165, 48, 0.5); background-color: rgba(78, 165, 48, 0.1); }',
        '.gk-panel.gk-light .gk-auto-on:hover { color: rgb(63, 143, 34); background-color: rgba(78, 165, 48, 0.18); }',
        '.gk-panel.gk-light .gk-row-assigned { background-color: rgba(78, 165, 48, 0.08); }',
        '.gk-panel.gk-light .gk-row-assigned:hover { background-color: rgba(78, 165, 48, 0.16); }',
        '.gk-panel.gk-light .gk-row-stripe { background-color: rgb(78, 165, 48); }',
        '.gk-panel.gk-light .gk-sub { color: rgb(63, 143, 34); }',
    ])
        {assert.equal(css.includes(selector), true, selector);}
});

test('generated state CSS for a custom color carries it, not the green', () => {
    const css = m.stateCss(m.stateTones([108, 171, 205]));
    const tones = m.stateTones([108, 171, 205]);
    assert.equal(css.includes('rgb(108, 171, 205)'), true);
    assert.equal(css.includes('rgb(156, 224, 114)'), false);
    assert.equal(css.includes('rgb(63, 143, 34)'), false);
    assert.equal(css.includes(`rgb(${tones.lightText[0]}, ${tones.lightText[1]}, ${tones.lightText[2]})`), true);
});

test('every state color in stylesheet.css still matches the default tone table', () => {
    // Drift guard for the state green: the light theme uses TWO greens (text
    // #3f8f22, tints and stripe #4ea530) — the default table must keep them.
    const sheet = fs.readFileSync(path.join(__dirname, '..', '..', 'stylesheet.css'), 'utf8');
    for (const hex of ['#9ce072', '#3f8f22', '#4ea530'])
        {assert.equal(sheet.includes(hex), true, hex + ' missing in stylesheet.css');}
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

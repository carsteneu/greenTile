'use strict';
// Tests the pure theme model (lib/model/theme.js), loaded through the shared
// Cinnamon-mimicking loader.
// It resolves the "panelTheme" setting ("system" | "light" | "dark") plus the
// system color scheme and the Cinnamon theme name to 'light' or 'dark'.
const test = require('node:test');
const assert = require('node:assert/strict');

const m = require('./cinnamon-loader').load('./lib/model/theme.js');

test('manual light and dark win over the system, whatever the scheme', () => {
    for (const scheme of ['prefer-dark', 'prefer-light', 'default', 'weird', null, undefined])
        assert.equal(m.tile_theme_resolve('light', scheme, 'Mint-L-Dark-Aqua'), 'light');
    for (const scheme of ['prefer-dark', 'prefer-light', 'default', 'weird', null, undefined])
        assert.equal(m.tile_theme_resolve('dark', scheme, 'Mint-Y'), 'dark');
});

test('system follows the color scheme', () => {
    assert.equal(m.tile_theme_resolve('system', 'prefer-dark', 'Mint-Y'), 'dark');
    assert.equal(m.tile_theme_resolve('system', 'prefer-light', 'Mint-L-Dark-Aqua'), 'light');
});

test('system with default scheme falls back to the Cinnamon theme name', () => {
    assert.equal(m.tile_theme_resolve('system', 'default', 'Mint-L-Dark-Aqua'), 'dark');
    assert.equal(m.tile_theme_resolve('system', 'default', 'mint-y-dark'), 'dark');
    assert.equal(m.tile_theme_resolve('system', 'default', 'Dark Aura'), 'dark');
    assert.equal(m.tile_theme_resolve('system', 'default', 'Mint-Y'), 'light');
    assert.equal(m.tile_theme_resolve('unknown-scheme', 'default', 'Mint-Y'), 'light');
});

test('system with a missing scheme falls back to the theme name, then to light', () => {
    assert.equal(m.tile_theme_resolve('system', null, 'Mint-L-Dark-Aqua'), 'dark');
    assert.equal(m.tile_theme_resolve('system', null, ''), 'light');
    assert.equal(m.tile_theme_resolve('system', null, null), 'light');
    assert.equal(m.tile_theme_resolve('system', undefined, 'Mint-Y'), 'light');
});

test('toggle_target always resolves "system" too: shown theme decides the opposite setting', () => {
    // The header button shows the theme a click switches TO; the target is derived
    // from tile_theme_state.theme, which is always 'light' or 'dark', never 'system'.
    assert.equal(m.tile_theme_toggle_target('light'), 'dark');
    assert.equal(m.tile_theme_toggle_target('dark'), 'light');
});

test('an unset or invalid setting behaves like system', () => {
    assert.equal(m.tile_theme_resolve('', 'prefer-dark', ''), 'dark');
    assert.equal(m.tile_theme_resolve(null, 'prefer-dark', ''), 'dark');
    assert.equal(m.tile_theme_resolve(undefined, 'default', 'Mint-Y'), 'light');
    assert.equal(m.tile_theme_resolve('bogus', 'default', 'Mint-Y'), 'light');
});

'use strict';
// Tests the pure theme model (lib/model/theme.js), loaded through the shared
// Cinnamon-mimicking loader.
// It resolves the "panelTheme" setting ("system" | "light" | "dark") plus the
// system color scheme and the Cinnamon theme name to 'light' or 'dark'.
const test = require('node:test');
const assert = require('node:assert/strict');

const m = require('../helpers/cinnamon-loader').load('./lib/model/theme.js');

test('manual light and dark win over the system, whatever the scheme', () => {
    for (const scheme of ['prefer-dark', 'prefer-light', 'default', 'weird', null, undefined])
        assert.equal(m.themeResolve('light', scheme, 'Mint-L-Dark-Aqua'), 'light');
    for (const scheme of ['prefer-dark', 'prefer-light', 'default', 'weird', null, undefined])
        assert.equal(m.themeResolve('dark', scheme, 'Mint-Y'), 'dark');
});

test('system follows the color scheme', () => {
    assert.equal(m.themeResolve('system', 'prefer-dark', 'Mint-Y'), 'dark');
    assert.equal(m.themeResolve('system', 'prefer-light', 'Mint-L-Dark-Aqua'), 'light');
});

test('system with default scheme falls back to the Cinnamon theme name', () => {
    assert.equal(m.themeResolve('system', 'default', 'Mint-L-Dark-Aqua'), 'dark');
    assert.equal(m.themeResolve('system', 'default', 'mint-y-dark'), 'dark');
    assert.equal(m.themeResolve('system', 'default', 'Dark Aura'), 'dark');
    assert.equal(m.themeResolve('system', 'default', 'Mint-Y'), 'light');
    assert.equal(m.themeResolve('unknown-scheme', 'default', 'Mint-Y'), 'light');
});

test('system with a missing scheme falls back to the theme name, then to light', () => {
    assert.equal(m.themeResolve('system', null, 'Mint-L-Dark-Aqua'), 'dark');
    assert.equal(m.themeResolve('system', null, ''), 'light');
    assert.equal(m.themeResolve('system', null, null), 'light');
    assert.equal(m.themeResolve('system', undefined, 'Mint-Y'), 'light');
});

test('toggle_target always resolves "system" too: shown theme decides the opposite setting', () => {
    // The header button shows the theme a click switches TO; the target is derived
    // from themeState.theme, which is always 'light' or 'dark', never 'system'.
    assert.equal(m.themeToggleTarget('light'), 'dark');
    assert.equal(m.themeToggleTarget('dark'), 'light');
});

test('an unset or invalid setting behaves like system', () => {
    assert.equal(m.themeResolve('', 'prefer-dark', ''), 'dark');
    assert.equal(m.themeResolve(null, 'prefer-dark', ''), 'dark');
    assert.equal(m.themeResolve(undefined, 'default', 'Mint-Y'), 'light');
    assert.equal(m.themeResolve('bogus', 'default', 'Mint-Y'), 'light');
});

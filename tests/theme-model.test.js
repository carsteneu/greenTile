'use strict';
// Tests the pure theme model of greenTile.js (marked block "theme-model"),
// extracted and evaluated without Cinnamon, like the other model blocks.
// It resolves the "panelTheme" setting ("system" | "light" | "dark") plus the
// system color scheme and the Cinnamon theme name to 'light' or 'dark'.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'greenTile.js'), 'utf8');
const match = src.match(/\/\/ >>> theme-model[^\n]*\n([\s\S]*?)\/\/ <<< theme-model/);
if (!match)
    throw new Error('theme-model block not found in greenTile.js');
const block = match[1];
const names = ['tile_theme_resolve'];
const m = new Function(block + '\nreturn {' + names.join(',') + '};')();

test('block is self-contained', () => {
    assert.doesNotMatch(block, /imports\.|tile_St|tile_Clutter|global\.|utils_Main/);
});

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

test('an unset or invalid setting behaves like system', () => {
    assert.equal(m.tile_theme_resolve('', 'prefer-dark', ''), 'dark');
    assert.equal(m.tile_theme_resolve(null, 'prefer-dark', ''), 'dark');
    assert.equal(m.tile_theme_resolve(undefined, 'default', 'Mint-Y'), 'light');
    assert.equal(m.tile_theme_resolve('bogus', 'default', 'Mint-Y'), 'light');
});

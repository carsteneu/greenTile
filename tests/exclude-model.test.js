'use strict';
// Tests the pure exclusion model of greenTile.js (marked block "exclude-model"),
// extracted and evaluated without Cinnamon, like auto-model. Storage format: the
// list setting "exclusions" of the settings dialog, rows
// { match: "class" | "title", text: <non-empty string> }.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'greenTile.js'), 'utf8');
const match = src.match(/\/\/ >>> exclude-model[^\n]*\n([\s\S]*?)\/\/ <<< exclude-model/);
if (!match)
    throw new Error('exclude-model block not found in greenTile.js');
const block = match[1];
const names = ['tile_excl_rows_normalize', 'tile_excl_match', 'tile_excl_toggle_set'];
const m = new Function(block + '\nreturn {' + names.join(',') + '};')();

test('block is self-contained', () => {
    assert.doesNotMatch(block, /imports\.|tile_St|tile_Clutter|global\.|utils_Main/);
});

test('rows_normalize tolerates anything that is not a list of valid rows', () => {
    assert.deepEqual(m.tile_excl_rows_normalize(undefined), []);
    assert.deepEqual(m.tile_excl_rows_normalize(null), []);
    assert.deepEqual(m.tile_excl_rows_normalize('[]'), []);
    assert.deepEqual(m.tile_excl_rows_normalize({ match: 'class', text: 'x' }), []);
});

test('rows_normalize drops invalid, empty and unknown-match rows', () => {
    assert.deepEqual(m.tile_excl_rows_normalize([
        null,
        ' nonsense',
        { match: 'class', text: '' },
        { match: 'class', text: '   ' },
        { match: 'color', text: 'red' },
        { match: 'title' },
        { text: 'Firefox' },
        { match: 'class', text: 42 },
    ]), []);
});

test('rows_normalize trims the text and keeps class and title rows', () => {
    assert.deepEqual(m.tile_excl_rows_normalize([
        { match: 'class', text: ' Firefox ' },
        { match: 'title', text: 'x' },
    ]), [{ match: 'class', text: 'Firefox' }, { match: 'title', text: 'x' }]);
});

test('match: class equals the wm class or the instance, case-insensitive', () => {
    const rows = [{ match: 'class', text: 'Firefox' }];
    assert.equal(m.tile_excl_match('firefox', 'firefox', 'Any title', rows), true);
    assert.equal(m.tile_excl_match('FIREFOX', 'FIREFOX', 'Any title', rows), true);
    assert.equal(m.tile_excl_match('firefox-developer', 'firefox', 'Any title', rows), true);
    assert.equal(m.tile_excl_match('Firefox Developer', 'Firefox Developer', 'Any', rows), false);
    assert.equal(m.tile_excl_match('terminal', 'xterm', 'Any', rows), false);
});

test('match: title contains the text, case-insensitive', () => {
    const rows = [{ match: 'title', text: 'vim - ~/FILE' }];
    assert.equal(m.tile_excl_match('gvim', 'gvim', 'vim - ~/file.txt', rows), true);
    assert.equal(m.tile_excl_match('gvim', 'gvim', 'Vim - other', rows), false);
    assert.equal(m.tile_excl_match('gvim', 'gvim', null, rows), false);
});

test('match: any row wins, null fields never match', () => {
    const rows = [{ match: 'class', text: 'Firefox' }, { match: 'title', text: 'vim' }];
    assert.equal(m.tile_excl_match('gvim', 'gvim', 'vim - x', rows), true);
    assert.equal(m.tile_excl_match('firefox', 'firefox', null, rows), true);
    assert.equal(m.tile_excl_match(null, null, null, rows), false);
    assert.equal(m.tile_excl_match('gvim', 'gvim', 'hello', rows), false);
});

test('toggle_set adds, removes and tolerates unknown states', () => {
    const map = new Map();
    m.tile_excl_toggle_set(map, 7, true);
    assert.equal(map.get(7), true);
    m.tile_excl_toggle_set(map, 7, false);
    assert.equal(map.has(7), false);
    m.tile_excl_toggle_set(map, 8, false);
    assert.equal(map.has(8), false);
});

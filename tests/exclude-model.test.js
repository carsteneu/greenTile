'use strict';
// Tests the pure exclusion model of greenTile.js (marked block "exclude-model"),
// extracted and evaluated without Cinnamon, like auto-model. Storage format: the
// list setting "exclusions" of the settings dialog, rows
// { match: "class" | "title" | "app", text: <non-empty string> }.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'greenTile.js'), 'utf8');
const match = src.match(/\/\/ >>> exclude-model[^\n]*\n([\s\S]*?)\/\/ <<< exclude-model/);
if (!match)
    throw new Error('exclude-model block not found in greenTile.js');
const block = match[1];
const names = ['tile_excl_rows_normalize', 'tile_excl_match', 'tile_excl_toggle_set', 'tile_excl_rows_append', 'tile_excl_app_options'];
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

test('rows_normalize keeps app rows', () => {
    assert.deepEqual(m.tile_excl_rows_normalize([
        { match: 'app', text: ' org.gimp.GIMP.desktop:flatpak ' },
        { match: 'app', text: '' },
        { match: 'app' },
    ]), [{ match: 'app', text: 'org.gimp.GIMP.desktop:flatpak' }]);
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

test('match: app equals the app id, case-insensitive; null never matches', () => {
    const rows = [{ match: 'app', text: 'org.gimp.GIMP.desktop:flatpak' }];
    assert.equal(m.tile_excl_match('Gimp', 'gimp', 'Any title', rows, 'org.gimp.GIMP.desktop:flatpak'), true);
    assert.equal(m.tile_excl_match('Gimp', 'gimp', 'Any title', rows, 'ORG.GIMP.GIMP.DESKTOP:FLATPAK'), true);
    assert.equal(m.tile_excl_match('Gimp', 'gimp', 'Any title', rows, 'org.gimp.GIMP.desktop'), false);
    assert.equal(m.tile_excl_match('Gimp', 'gimp', 'Any title', rows, null), false);
    assert.equal(m.tile_excl_match('Gimp', 'gimp', 'Any title', rows, 42), false);
    assert.equal(m.tile_excl_match('gimp', 'gimp', 'x', rows, 'org.gimp.GIMP.desktop:flatpak'), true);
    assert.equal(m.tile_excl_match('Gimp', 'gimp', 'Any title', rows, 'random.desktop'), false);
});

test('rows_append appends a normalized app row only once', () => {
    assert.deepEqual(
        m.tile_excl_rows_append([{ match: 'class', text: 'Firefox' }], 'org.gimp.GIMP.desktop:flatpak'),
        [{ match: 'class', text: 'Firefox' }, { match: 'app', text: 'org.gimp.GIMP.desktop:flatpak' }]);
    const once = m.tile_excl_rows_append(undefined, 'org.gimp.GIMP.desktop:flatpak');
    assert.deepEqual(m.tile_excl_rows_append(once, 'org.gimp.GIMP.desktop:flatpak'), once);
    assert.deepEqual(m.tile_excl_rows_append([{ match: 'class', text: 'org.gimp.GIMP.desktop:flatpak' }], 'org.gimp.GIMP.desktop:flatpak').length, 2);
    assert.deepEqual(m.tile_excl_rows_append([{ match: 'app', text: 'other.desktop' }], 'org.gimp.GIMP.desktop:flatpak').length, 2);
    assert.deepEqual(m.tile_excl_rows_append([], '  org.gimp.GIMP.desktop:flatpak  '),
        [{ match: 'app', text: 'org.gimp.GIMP.desktop:flatpak' }]);
});

test('app_options: placeholder first, then label to id sorted by name', () => {
    const options = m.tile_excl_app_options([
        { id: 'b.desktop', name: 'Brave' },
        null,
        { id: '', name: 'No id' },
        { id: 'a.desktop', name: null },
        { id: 'z.desktop', name: 'Terminal' },
        { id: 'c.desktop', name: 'Dateien' },
        { id: 'd.desktop', name: 'Terminal' },
    ], 'Add application …');
    assert.deepEqual(Object.keys(options), ['Add application …', 'Brave', 'Dateien', 'Terminal']);
    assert.equal(options['Add application …'], 'picker');
    assert.equal(options['Brave'], 'b.desktop');
    assert.equal(options['Terminal'], 'z.desktop');
    assert.deepEqual(m.tile_excl_app_options([], 'Add application …'), { 'Add application …': 'picker' });
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

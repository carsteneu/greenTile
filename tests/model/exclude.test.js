'use strict';
// Tests the pure exclusion model (lib/model/exclude.js), loaded through the shared
// Cinnamon-mimicking loader. Storage format: the
// list setting "exclusions" of the settings dialog, rows
// { match: "class" | "title" | "app", text: <non-empty string> }.
const test = require('node:test');
const assert = require('node:assert/strict');

const m = require('../helpers/cinnamon-loader').load('./lib/model/exclude.js');

test('rows_normalize tolerates anything that is not a list of valid rows', () => {
    assert.deepEqual(m.exclRowsNormalize(undefined), []);
    assert.deepEqual(m.exclRowsNormalize(null), []);
    assert.deepEqual(m.exclRowsNormalize('[]'), []);
    assert.deepEqual(m.exclRowsNormalize({ match: 'class', text: 'x' }), []);
});

test('rows_normalize drops invalid, empty and unknown-match rows', () => {
    assert.deepEqual(m.exclRowsNormalize([
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
    assert.deepEqual(m.exclRowsNormalize([
        { match: 'class', text: ' Firefox ' },
        { match: 'title', text: 'x' },
    ]), [{ match: 'class', text: 'Firefox' }, { match: 'title', text: 'x' }]);
});

test('rows_normalize keeps app rows', () => {
    assert.deepEqual(m.exclRowsNormalize([
        { match: 'app', text: ' org.gimp.GIMP.desktop:flatpak ' },
        { match: 'app', text: '' },
        { match: 'app' },
    ]), [{ match: 'app', text: 'org.gimp.GIMP.desktop:flatpak' }]);
});

test('match: class equals the wm class or the instance, case-insensitive', () => {
    const rows = [{ match: 'class', text: 'Firefox' }];
    assert.equal(m.exclMatch('firefox', 'firefox', 'Any title', rows), true);
    assert.equal(m.exclMatch('FIREFOX', 'FIREFOX', 'Any title', rows), true);
    assert.equal(m.exclMatch('firefox-developer', 'firefox', 'Any title', rows), true);
    assert.equal(m.exclMatch('Firefox Developer', 'Firefox Developer', 'Any', rows), false);
    assert.equal(m.exclMatch('terminal', 'xterm', 'Any', rows), false);
});

test('match: title contains the text, case-insensitive', () => {
    const rows = [{ match: 'title', text: 'vim - ~/FILE' }];
    assert.equal(m.exclMatch('gvim', 'gvim', 'vim - ~/file.txt', rows), true);
    assert.equal(m.exclMatch('gvim', 'gvim', 'Vim - other', rows), false);
    assert.equal(m.exclMatch('gvim', 'gvim', null, rows), false);
});

test('match: app equals the app id, case-insensitive; null never matches', () => {
    const rows = [{ match: 'app', text: 'org.gimp.GIMP.desktop:flatpak' }];
    assert.equal(m.exclMatch('Gimp', 'gimp', 'Any title', rows, 'org.gimp.GIMP.desktop:flatpak'), true);
    assert.equal(m.exclMatch('Gimp', 'gimp', 'Any title', rows, 'ORG.GIMP.GIMP.DESKTOP:FLATPAK'), true);
    assert.equal(m.exclMatch('Gimp', 'gimp', 'Any title', rows, 'org.gimp.GIMP.desktop'), false);
    assert.equal(m.exclMatch('Gimp', 'gimp', 'Any title', rows, null), false);
    assert.equal(m.exclMatch('Gimp', 'gimp', 'Any title', rows, 42), false);
    assert.equal(m.exclMatch('gimp', 'gimp', 'x', rows, 'org.gimp.GIMP.desktop:flatpak'), true);
    assert.equal(m.exclMatch('Gimp', 'gimp', 'Any title', rows, 'random.desktop'), false);
});

test('match: app also matches the rule app StartupWMClass against the window class, case-insensitive', () => {
    const rows = [{ match: 'app', text: 'anytype.desktop' }];
    const classes = { 'anytype.desktop': 'anytype' };
    // WindowTracker may map the window to a NoDisplay sibling desktop of the same program
    assert.equal(m.exclMatch('anytype', 'anytype', 'Anytype', rows, 'anytype-xwayland.desktop', classes), true);
    const brave = [{ match: 'app', text: 'com.brave.Browser.desktop' }];
    const braveClasses = { 'com.brave.Browser.desktop': 'brave-browser' };
    assert.equal(m.exclMatch('Brave-browser', 'Brave-browser', 'Brave', brave, 'com.brave.Browser.desktop', braveClasses), true);
    assert.equal(m.exclMatch('BRAVE-BROWSER', null, null, brave, null, braveClasses), true);
});

test('match: app StartupWMClass compares the window instance too', () => {
    const rows = [{ match: 'app', text: 'foo.desktop' }];
    const classes = { 'foo.desktop': 'Foo' };
    assert.equal(m.exclMatch(null, 'foo', 'x', rows, 'other.desktop', classes), true);
    assert.equal(m.exclMatch(null, 'other-instance', 'x', rows, 'other.desktop', classes), false);
});

test('match: app StartupWMClass mismatch with a different app id does not match', () => {
    const rows = [{ match: 'app', text: 'anytype.desktop' }];
    const classes = { 'anytype.desktop': 'anytype' };
    assert.equal(m.exclMatch('other-class', 'other-class', 'x', rows, 'elsewhere.desktop', classes), false);
});

test('match: app row with null StartupWMClass falls back to id compare only', () => {
    const rows = [{ match: 'app', text: 'SciTE.desktop' }];
    const classes = { 'SciTE.desktop': null };
    assert.equal(m.exclMatch('SciTE', 'SciTE', 'x', rows, 'other.desktop', classes), false);
    assert.equal(m.exclMatch('SciTE', 'SciTE', 'x', rows, 'SciTE.desktop', classes), true);
});

test('match: app row tolerates a missing or empty appClasses map (id only)', () => {
    const rows = [{ match: 'app', text: 'org.gimp.GIMP.desktop:flatpak' }];
    assert.equal(m.exclMatch('gimp', 'gimp', 'x', rows, 'org.gimp.GIMP.desktop:flatpak'), true);
    assert.equal(m.exclMatch('gimp', 'gimp', 'x', rows, 'org.gimp.GIMP.desktop:flatpak', undefined), true);
    assert.equal(m.exclMatch('Gimp', 'gimp', 'x', rows, null, {}), false);
});

test('rows_append appends a normalized app row only once', () => {
    assert.deepEqual(
        m.exclRowsAppend([{ match: 'class', text: 'Firefox' }], 'org.gimp.GIMP.desktop:flatpak'),
        [{ match: 'class', text: 'Firefox' }, { match: 'app', text: 'org.gimp.GIMP.desktop:flatpak' }]);
    const once = m.exclRowsAppend(undefined, 'org.gimp.GIMP.desktop:flatpak');
    assert.deepEqual(m.exclRowsAppend(once, 'org.gimp.GIMP.desktop:flatpak'), once);
    assert.deepEqual(m.exclRowsAppend([{ match: 'class', text: 'org.gimp.GIMP.desktop:flatpak' }], 'org.gimp.GIMP.desktop:flatpak').length, 2);
    assert.deepEqual(m.exclRowsAppend([{ match: 'app', text: 'other.desktop' }], 'org.gimp.GIMP.desktop:flatpak').length, 2);
    assert.deepEqual(m.exclRowsAppend([], '  org.gimp.GIMP.desktop:flatpak  '),
        [{ match: 'app', text: 'org.gimp.GIMP.desktop:flatpak' }]);
});

test('app_options: placeholder first, then label to id sorted by name', () => {
    const options = m.exclAppOptions([
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
    const empty = m.exclAppOptions([], 'Add application …');
    assert.deepEqual(Object.keys(empty), ['Add application …']);
    assert.equal(empty['Add application …'], 'picker');
    const hostile = m.exclAppOptions([{ id: 'p.desktop', name: '__proto__' }, { id: 'c.desktop', name: 'constructor' }], 'Add application …');
    assert.equal(hostile.__proto__, 'p.desktop');
    assert.equal(hostile.constructor, 'c.desktop');
    assert.deepEqual(Object.keys(hostile), ['Add application …', '__proto__', 'constructor']);
});

test('match: any row wins, null fields never match', () => {
    const rows = [{ match: 'class', text: 'Firefox' }, { match: 'title', text: 'vim' }];
    assert.equal(m.exclMatch('gvim', 'gvim', 'vim - x', rows), true);
    assert.equal(m.exclMatch('firefox', 'firefox', null, rows), true);
    assert.equal(m.exclMatch(null, null, null, rows), false);
    assert.equal(m.exclMatch('gvim', 'gvim', 'hello', rows), false);
});

test('toggle_set adds, removes and tolerates unknown states', () => {
    const map = new Map();
    m.exclToggleSet(map, 7, true);
    assert.equal(map.get(7), true);
    m.exclToggleSet(map, 7, false);
    assert.equal(map.has(7), false);
    m.exclToggleSet(map, 8, false);
    assert.equal(map.has(8), false);
});

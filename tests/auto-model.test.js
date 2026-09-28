'use strict';
// Tests the pure per-workspace auto model of greenTile.js (marked block
// "auto-model"), extracted and evaluated without Cinnamon, like editor-model.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'greenTile.js'), 'utf8');
const match = src.match(/\/\/ >>> auto-model[^\n]*\n([\s\S]*?)\/\/ <<< auto-model/);
if (!match)
    throw new Error('auto-model block not found in greenTile.js');
const block = match[1];
const names = ['tile_general_parse', 'tile_general_ws_active', 'tile_general_set_ws'];
const m = new Function(block + '\nreturn {' + names.join(',') + '};')();

test('block is self-contained', () => {
    assert.doesNotMatch(block, /imports\.|tile_St|tile_Clutter|global\.|utils_Main/);
});

test('parse returns a normalised object for any input', () => {
    assert.deepEqual(m.tile_general_parse('{"autoWorkspaces":{"4":true,"0":false}}'), { autoWorkspaces: { 4: true, 0: false } });
    assert.deepEqual(m.tile_general_parse(''), { autoWorkspaces: {} });
    assert.deepEqual(m.tile_general_parse('not json'), { autoWorkspaces: {} });
    assert.deepEqual(m.tile_general_parse('[1,2]'), { autoWorkspaces: {} });
    assert.deepEqual(m.tile_general_parse('{"autoWorkspaces":[true]}'), { autoWorkspaces: {} });
    assert.deepEqual(m.tile_general_parse(null), { autoWorkspaces: {} });
});

test('parse keeps unknown top-level keys for later settings', () => {
    const g = m.tile_general_parse('{"autoWorkspaces":{},"future":42}');
    assert.equal(g.future, 42);
});

test('parse drops non-boolean workspace entries', () => {
    assert.deepEqual(m.tile_general_parse('{"autoWorkspaces":{"1":true,"2":"yes","3":1}}'), { autoWorkspaces: { 1: true } });
});

test('without an explicit entry, a workspace is active exactly when it has a preset', () => {
    const g = m.tile_general_parse('{}');
    assert.equal(m.tile_general_ws_active(g, 3, true), true);
    assert.equal(m.tile_general_ws_active(g, 3, false), false);
});

test('an explicit entry wins over the preset default', () => {
    const g = m.tile_general_parse('{"autoWorkspaces":{"3":false,"5":true}}');
    assert.equal(m.tile_general_ws_active(g, 3, true), false);
    assert.equal(m.tile_general_ws_active(g, 5, false), true);
});

test('set_ws writes the flag without mutating the input', () => {
    const g = m.tile_general_parse('{"autoWorkspaces":{"1":true},"future":1}');
    const next = m.tile_general_set_ws(g, 4, false);
    assert.deepEqual(next.autoWorkspaces, { 1: true, 4: false });
    assert.equal(next.future, 1);
    assert.deepEqual(g.autoWorkspaces, { 1: true });
    assert.equal(m.tile_general_ws_active(next, 4, true), false);
});

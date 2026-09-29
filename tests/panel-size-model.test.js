'use strict';
// Tests the pure panel size model of greenTile.js (marked block "panel-size-model"),
// extracted and evaluated without Cinnamon, like the other model blocks.
// Stored in the setting "panelSize": {"list": {"w", "h"}, "editor": {"w", "h"}}; w is
// the panel width, h the height of the part that stretches (list: preset rows,
// editor: painter).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'greenTile.js'), 'utf8');
const match = src.match(/\/\/ >>> panel-size-model[^\n]*\n([\s\S]*?)\/\/ <<< panel-size-model/);
if (!match)
    throw new Error('panel-size-model block not found in greenTile.js');
const block = match[1];
const names = ['tile_panel_size_parse', 'tile_panel_size_set', 'tile_panel_size_clamp', 'TILE_PANEL_MIN'];
const m = new Function(block + '\nreturn {' + names.join(',') + '};')();

test('block is self-contained', () => {
    assert.doesNotMatch(block, /imports\.|tile_St|tile_Clutter|global\.|utils_Main/);
});

test('minimums: 600 px wide; list three rows, editor the default painter height', () => {
    assert.deepEqual(m.TILE_PANEL_MIN, { list: { w: 600, h: 180 }, editor: { w: 600, h: 136 } });
});

test('parse reads both views and ignores anything invalid', () => {
    assert.deepEqual(m.tile_panel_size_parse('{"list":{"w":800,"h":400},"editor":{"w":700,"h":200}}'),
        { list: { w: 800, h: 400 }, editor: { w: 700, h: 200 } });
    assert.deepEqual(m.tile_panel_size_parse(''), { list: null, editor: null });
    assert.deepEqual(m.tile_panel_size_parse(undefined), { list: null, editor: null });
    assert.deepEqual(m.tile_panel_size_parse('nope'), { list: null, editor: null });
    assert.deepEqual(m.tile_panel_size_parse('[1]'), { list: null, editor: null });
    assert.deepEqual(m.tile_panel_size_parse('{"list":{"w":"800","h":400},"editor":{"w":700}}'), { list: null, editor: null });
    assert.deepEqual(m.tile_panel_size_parse('{"list":{"w":-5,"h":400}}'), { list: null, editor: null });
});

test('set stores one view, keeps the other, rounds to whole pixels', () => {
    const one = m.tile_panel_size_set('', 'list', { w: 812.6, h: 401.2 });
    assert.deepEqual(JSON.parse(one), { list: { w: 813, h: 401 } });
    const two = m.tile_panel_size_set(one, 'editor', { w: 700, h: 220 });
    assert.deepEqual(JSON.parse(two), { list: { w: 813, h: 401 }, editor: { w: 700, h: 220 } });
    const again = m.tile_panel_size_set('garbage', 'editor', { w: 700, h: 220 });
    assert.deepEqual(JSON.parse(again), { editor: { w: 700, h: 220 } });
});

test('clamp keeps the size between the minimum and the room on the monitor', () => {
    const min = { w: 600, h: 180 };
    assert.deepEqual(m.tile_panel_size_clamp({ w: 900, h: 400 }, min, { w: 2000, h: 1000 }), { w: 900, h: 400 });
    assert.deepEqual(m.tile_panel_size_clamp({ w: 300, h: 50 }, min, { w: 2000, h: 1000 }), { w: 600, h: 180 });
    assert.deepEqual(m.tile_panel_size_clamp({ w: 3000, h: 3000 }, min, { w: 1500, h: 700 }), { w: 1500, h: 700 });
    assert.deepEqual(m.tile_panel_size_clamp({ w: 700.4, h: 300.6 }, min, { w: 2000, h: 1000 }), { w: 700, h: 301 });
});

test('when the monitor has less room than the minimum, the minimum wins', () => {
    assert.deepEqual(m.tile_panel_size_clamp({ w: 900, h: 400 }, { w: 600, h: 180 }, { w: 500, h: 100 }), { w: 600, h: 180 });
});

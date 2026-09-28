'use strict';
// Tests the pure layouts model of greenTile.js (marked block "layouts-model"),
// extracted and evaluated without Cinnamon, like auto-model. The block may use
// tile_auto_list_map, so both blocks are evaluated together. Storage format: the
// string setting "layouts", JSON shaped
// { "<monitor key>": { "<workspace number from 1 | *>": { preset?, auto? } } }.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'greenTile.js'), 'utf8');
const extract = (name) => {
    const match = src.match(new RegExp('// >>> ' + name + '[^\\n]*\\n([\\s\\S]*?)// <<< ' + name));
    if (!match)
        throw new Error(name + ' block not found in greenTile.js');
    return match[1];
};
const layoutsBlock = extract('layouts-model');
const code = extract('auto-model') + '\n' + layoutsBlock;
const names = ['tile_auto_list_map', 'tile_layouts_parse', 'tile_layouts_entry', 'tile_layouts_set', 'tile_layouts_migrate'];
const m = new Function(code + '\nreturn {' + names.join(',') + '};')();

test('block is self-contained', () => {
    assert.doesNotMatch(layoutsBlock, /imports\.|tile_St|tile_Clutter|global\.|utils_Main/);
});

test('parse accepts JSON objects, returns {} for empty and null for garbage', () => {
    assert.deepEqual(m.tile_layouts_parse('{"a":{}}'), { a: {} });
    assert.deepEqual(m.tile_layouts_parse(''), {});
    assert.deepEqual(m.tile_layouts_parse(undefined), {});
    assert.equal(m.tile_layouts_parse('nope'), null);
    assert.equal(m.tile_layouts_parse('[]'), null);
    assert.equal(m.tile_layouts_parse('5'), null);
    assert.equal(m.tile_layouts_parse('null'), null);
});

test('defaults without entry: no preset, auto off', () => {
    assert.deepEqual(m.tile_layouts_entry({}, 'M', '5', ['p1']), { preset: null, auto: false });
});

test('a preset implies auto', () => {
    assert.deepEqual(m.tile_layouts_entry({ M: { '5': { preset: 'p1' } } }, 'M', '5', ['p1']), { preset: 'p1', auto: true });
});

test('explicit auto wins over the preset default', () => {
    assert.deepEqual(m.tile_layouts_entry({ M: { '5': { preset: 'p1', auto: false } } }, 'M', '5', ['p1']), { preset: 'p1', auto: false });
    assert.deepEqual(m.tile_layouts_entry({ M: { '5': { auto: true } } }, 'M', '5', ['p1']), { preset: null, auto: true });
});

test('entry with unknown preset id is no preset', () => {
    assert.deepEqual(m.tile_layouts_entry({ M: { '5': { preset: 'gone' } } }, 'M', '5', ['p1']), { preset: null, auto: false });
});

test('other monitors or workspaces are not inherited', () => {
    const layouts = { N: { '5': { preset: 'p1' } }, M: { '4': { preset: 'p1' } } };
    assert.deepEqual(m.tile_layouts_entry(layouts, 'M', '5', ['p1']), { preset: null, auto: false });
});

test('set adds and removes fields', () => {
    const first = m.tile_layouts_set({}, 'M', '5', { preset: 'p2' });
    assert.deepEqual(first, { M: { '5': { preset: 'p2' } } });
    const second = m.tile_layouts_set(first, 'M', '5', { auto: true });
    assert.deepEqual(second, { M: { '5': { preset: 'p2', auto: true } } });
    const third = m.tile_layouts_set(second, 'M', '5', { preset: null });
    assert.deepEqual(third, { M: { '5': { auto: true } } });
});

test('set drops empty entries and empty monitors', () => {
    const layouts = { M: { '5': { auto: true } }, N: { '4': { preset: 'p1' } } };
    assert.deepEqual(m.tile_layouts_set(layouts, 'M', '5', { auto: null }), { N: { '4': { preset: 'p1' } } });
});

test('set does not mutate its input', () => {
    const layouts = { M: { '5': { preset: 'p1' } } };
    const copy = JSON.parse(JSON.stringify(layouts));
    m.tile_layouts_set(layouts, 'M', '5', { preset: null, auto: true });
    assert.deepEqual(layouts, copy);
});

test('the * workspace key works like any other key', () => {
    const layouts = m.tile_layouts_set({}, 'M', '*', { preset: 'p1' });
    assert.deepEqual(layouts, { M: { '*': { preset: 'p1' } } });
    assert.deepEqual(m.tile_layouts_entry(layouts, 'M', '*', ['p1']), { preset: 'p1', auto: true });
});

test('migrate converts wsPresets and autoWorkspaces into one monitor key', () => {
    assert.deepEqual(
        m.tile_layouts_migrate({ '0': 'p1', '4': 'p2' }, [{ workspace: 5, auto: true }], 'M'),
        { M: { '1': { preset: 'p1' }, '5': { preset: 'p2', auto: true } } },
    );
});

test('migrate returns {} when both keys are empty and drops empty states', () => {
    assert.deepEqual(m.tile_layouts_migrate({}, [], 'M'), {});
    assert.deepEqual(m.tile_layouts_migrate({}, [{ workspace: 3, auto: false }], 'M'), {});
});

test('migrate keeps auto off next to a preset', () => {
    assert.deepEqual(
        m.tile_layouts_migrate({ '0': 'p1' }, [{ workspace: 1, auto: false }], 'M'),
        { M: { '1': { preset: 'p1', auto: false } } },
    );
});

test('migrate ignores invalid rows, as tile_auto_list_map does', () => {
    assert.deepEqual(
        m.tile_layouts_migrate({ '0': 'p1' }, [{ workspace: 2, auto: true }, { workspace: 'x', auto: true }, null, { workspace: 2.5, auto: true }], 'M'),
        { M: { '1': { preset: 'p1' }, '2': { auto: true } } },
    );
});

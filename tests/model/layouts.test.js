'use strict';
// Tests the pure layouts model (lib/model/layouts.js), loaded through the shared
// Cinnamon-mimicking loader.
// Storage format: the
// string setting "layouts", JSON shaped
// { "<monitor key>": { "<workspace number from 1 | *>": { preset?, auto? } } }.
const test = require('node:test');
const assert = require('node:assert/strict');

const load = require('../helpers/cinnamon-loader').load;
const m = load('./lib/model/layouts.js');

test('parse accepts JSON objects, returns {} for empty and null for garbage', () => {
    assert.deepEqual(m.layoutsParse('{"a":{}}'), { a: {} });
    assert.deepEqual(m.layoutsParse(''), {});
    assert.deepEqual(m.layoutsParse(undefined), {});
    assert.equal(m.layoutsParse('nope'), null);
    assert.equal(m.layoutsParse('[]'), null);
    assert.equal(m.layoutsParse('5'), null);
    assert.equal(m.layoutsParse('null'), null);
});

test('defaults without entry: no preset, auto off', () => {
    assert.deepEqual(m.layoutsEntry({}, 'M', '5', ['p1']), { preset: null, auto: false });
});

test('a preset implies auto', () => {
    assert.deepEqual(m.layoutsEntry({ M: { '5': { preset: 'p1' } } }, 'M', '5', ['p1']), { preset: 'p1', auto: true });
});

test('explicit auto wins over the preset default', () => {
    assert.deepEqual(m.layoutsEntry({ M: { '5': { preset: 'p1', auto: false } } }, 'M', '5', ['p1']), { preset: 'p1', auto: false });
    assert.deepEqual(m.layoutsEntry({ M: { '5': { auto: true } } }, 'M', '5', ['p1']), { preset: null, auto: true });
});

test('entry with unknown preset id is no preset', () => {
    assert.deepEqual(m.layoutsEntry({ M: { '5': { preset: 'gone' } } }, 'M', '5', ['p1']), { preset: null, auto: false });
});

test('other monitors or workspaces are not inherited', () => {
    const layouts = { N: { '5': { preset: 'p1' } }, M: { '4': { preset: 'p1' } } };
    assert.deepEqual(m.layoutsEntry(layouts, 'M', '5', ['p1']), { preset: null, auto: false });
});

test('set adds and removes fields', () => {
    const first = m.layoutsSet({}, 'M', '5', { preset: 'p2' });
    assert.deepEqual(first, { M: { '5': { preset: 'p2' } } });
    const second = m.layoutsSet(first, 'M', '5', { auto: true });
    assert.deepEqual(second, { M: { '5': { preset: 'p2', auto: true } } });
    const third = m.layoutsSet(second, 'M', '5', { preset: null });
    assert.deepEqual(third, { M: { '5': { auto: true } } });
});

test('set drops empty entries and empty monitors', () => {
    const layouts = { M: { '5': { auto: true } }, N: { '4': { preset: 'p1' } } };
    assert.deepEqual(m.layoutsSet(layouts, 'M', '5', { auto: null }), { N: { '4': { preset: 'p1' } } });
});

test('set does not mutate its input', () => {
    const layouts = { M: { '5': { preset: 'p1' } } };
    const copy = JSON.parse(JSON.stringify(layouts));
    m.layoutsSet(layouts, 'M', '5', { preset: null, auto: true });
    assert.deepEqual(layouts, copy);
});

test('the * workspace key works like any other key', () => {
    const layouts = m.layoutsSet({}, 'M', '*', { preset: 'p1' });
    assert.deepEqual(layouts, { M: { '*': { preset: 'p1' } } });
    assert.deepEqual(m.layoutsEntry(layouts, 'M', '*', ['p1']), { preset: 'p1', auto: true });
});

const sp3 = { kind: 'cols', shape: [1, 2], major: [0.6, 0.4], minor: [[1], [0.3, 0.7]] };
const sp4 = { kind: 'cols', shape: [2, 2], major: [0.5, 0.5], minor: [[0.5, 0.5], [0.2, 0.8]] };

test('splits patch sets one window count next to preset and auto', () => {
    const start = { M: { '5': { preset: 'p2', auto: true } } };
    const next = m.layoutsSet(start, 'M', '5', { splits: { '3': sp3 } });
    assert.deepEqual(next, { M: { '5': { preset: 'p2', auto: true, splits: { '3': sp3 } } } });
    assert.deepEqual(start, { M: { '5': { preset: 'p2', auto: true } } });
});

test('splits patch adds, replaces and removes single counts', () => {
    let l = m.layoutsSet({}, 'M', '1', { splits: { '3': sp3 } });
    l = m.layoutsSet(l, 'M', '1', { splits: { '4': sp4 } });
    assert.deepEqual(l.M['1'].splits, { '3': sp3, '4': sp4 });
    l = m.layoutsSet(l, 'M', '1', { splits: { '3': null } });
    assert.deepEqual(l.M['1'].splits, { '4': sp4 });
    l = m.layoutsSet(l, 'M', '1', { splits: { '4': null } });
    assert.deepEqual(l, {});
});

test('splits: null removes all splits, keeps preset and auto', () => {
    const l = m.layoutsSet({ M: { '2': { preset: 'p1', splits: { '3': sp3, '4': sp4 } } } }, 'M', '2', { splits: null });
    assert.deepEqual(l, { M: { '2': { preset: 'p1' } } });
});

test('splits never change the implied automatic tiling', () => {
    const l = m.layoutsSet({}, 'M', '7', { splits: { '3': sp3 } });
    assert.deepEqual(m.layoutsEntry(l, 'M', '7', ['p1']), { preset: null, auto: false });
    const withPreset = m.layoutsSet({ M: { '7': { preset: 'p1' } } }, 'M', '7', { splits: { '3': sp3 } });
    assert.deepEqual(m.layoutsEntry(withPreset, 'M', '7', ['p1']), { preset: 'p1', auto: true });
});

test('removing the preset keeps the splits entry', () => {
    const l = m.layoutsSet({ M: { '2': { preset: 'p1', splits: { '3': sp3 } } } }, 'M', '2', { preset: null });
    assert.deepEqual(l, { M: { '2': { splits: { '3': sp3 } } } });
});

test('layoutsSplits reads the raw splits object, {} when missing or invalid', () => {
    assert.deepEqual(m.layoutsSplits({ M: { '2': { splits: { '3': sp3 } } } }, 'M', '2'), { '3': sp3 });
    assert.deepEqual(m.layoutsSplits({ M: { '2': { preset: 'p1' } } }, 'M', '2'), {});
    assert.deepEqual(m.layoutsSplits({ M: { '2': { splits: [1] } } }, 'M', '2'), {});
    assert.deepEqual(m.layoutsSplits({ M: { '2': { splits: 'x' } } }, 'M', '2'), {});
    assert.deepEqual(m.layoutsSplits(null, 'M', '2'), {});
    assert.deepEqual(m.layoutsSplits({}, 'X', '1'), {});
});

test('invalid splits patch values are ignored', () => {
    const l = m.layoutsSet({ M: { '1': { preset: 'p1' } } }, 'M', '1', { splits: 'bogus' });
    assert.deepEqual(l, { M: { '1': { preset: 'p1' } } });
    const l2 = m.layoutsSet({ M: { '1': { preset: 'p1' } } }, 'M', '1', { splits: { '3': 'x' } });
    assert.deepEqual(l2, { M: { '1': { preset: 'p1' } } });
});

test('splits and shapes patch keys are numeric window counts', () => {
    const l = m.layoutsSet({}, 'M', '1', {
        splits: { '-1': { cols: [0.5] } },
        shapes: { 'oops': JSON.parse('{"kind":"cols","shape":[2,1]}') },
    });
    assert.deepEqual(l, {});
    const l2 = m.layoutsSet({}, 'M', '1', { shapes: { '2': { kind: 'cols', shape: [2] }, '-1': { kind: 'cols', shape: [2] } } });
    assert.deepEqual(m.layoutsShapes(l2, 'M', '1'), { '2': { kind: 'cols', shape: [2] } });
});

test('shape_valid accepts cols/rows with integer parts summing to n', () => {
    assert.deepEqual(m.shapeValid({ kind: 'cols', shape: [2, 1] }, 3), { kind: 'cols', shape: [2, 1] });
    assert.deepEqual(m.shapeValid({ kind: 'rows', shape: [3] }, 3), { kind: 'rows', shape: [3] });
    assert.equal(m.shapeValid({ kind: 'cols', shape: [2, 1] }, 4), null);
    assert.equal(m.shapeValid({ kind: 'cols', shape: [0, 3] }, 3), null);
    assert.equal(m.shapeValid({ kind: 'cols', shape: [1.5, 1.5] }, 3), null);
    assert.equal(m.shapeValid({ kind: 'grid', shape: [3] }, 3), null);
    assert.equal(m.shapeValid(null, 3), null);
});

test('layouts_set shapes: set, remove single, remove all, empty entry dropped', () => {
    let l = m.layoutsSet({}, 'M', '1', { shapes: { 3: { kind: 'cols', shape: [2, 1] } } });
    assert.deepEqual(m.layoutsShapes(l, 'M', '1'), { 3: { kind: 'cols', shape: [2, 1] } });
    l = m.layoutsSet(l, 'M', '1', { shapes: { 3: null } });
    assert.deepEqual(l, {});
    l = m.layoutsSet({ M: { 1: { preset: 'p', shapes: { 2: { kind: 'rows', shape: [2] } } } } }, 'M', '1', { shapes: null });
    assert.deepEqual(l, { M: { 1: { preset: 'p' } } });
});

test('layouts_set shape + split removal for the same n in one patch', () => {
    const before = { M: { 1: { splits: { 3: { cols: [0.5] }, 4: { cols: [0.3] } } } } };
    const l = m.layoutsSet(before, 'M', '1', { shapes: { 3: { kind: 'cols', shape: [2, 1] } }, splits: { 3: null } });
    assert.deepEqual(l, { M: { 1: { splits: { 4: { cols: [0.3] } }, shapes: { 3: { kind: 'cols', shape: [2, 1] } } } } });
});

test('layout_resolve: stored shape wins only over a non-null base, keeps rule/preset', () => {
    const base = { kind: 'cols', shape: [1, 1, 1], rule: { min: 1 }, preset: { id: 'p' } };
    assert.deepEqual(m.layoutResolve(base, { kind: 'cols', shape: [2, 1] }, 3),
        { kind: 'cols', shape: [2, 1], rule: { min: 1 }, preset: { id: 'p' } });
    assert.equal(m.layoutResolve(null, { kind: 'cols', shape: [2, 1] }, 3), null);
    assert.equal(m.layoutResolve(base, { kind: 'cols', shape: [9] }, 3), base);
    assert.equal(m.layoutResolve(base, undefined, 3), base);
});

test('layoutsShapes reads the raw shapes object, {} when missing or invalid', () => {
    assert.deepEqual(m.layoutsShapes({ M: { '2': { shapes: { '3': { kind: 'cols', shape: [2, 1] } } } } }, 'M', '2'), { '3': { kind: 'cols', shape: [2, 1] } });
    assert.deepEqual(m.layoutsShapes({ M: { '2': { preset: 'p1' } } }, 'M', '2'), {});
    assert.deepEqual(m.layoutsShapes({ M: { '2': { shapes: [1] } } }, 'M', '2'), {});
    assert.deepEqual(m.layoutsShapes(null, 'M', '2'), {});
    assert.deepEqual(m.layoutsShapes({}, 'X', '1'), {});
});

test('remove_preset strips the id everywhere, empty entries and monitors vanish', () => {
    const layouts = {
        M: { '5': { preset: 'p1' }, '6': { preset: 'p1', auto: false, splits: { '2': sp3 } } },
        N: { '*': { preset: 'p2', shapes: { '2': { kind: 'cols', shape: [2] } } }, '7': { preset: 'p1', auto: true } },
        P: { '1': { auto: true } },
    };
    const next = m.layoutsRemovePreset(layouts, 'p1');
    assert.deepEqual(next, {
        M: { '6': { auto: false, splits: { '2': sp3 } } },
        N: { '*': { preset: 'p2', shapes: { '2': { kind: 'cols', shape: [2] } } }, '7': { auto: true } },
        P: { '1': { auto: true } },
    });
    assert.deepEqual(layouts.M['5'], { preset: 'p1' });
});

test('remove_preset leaves everything unchanged for an unknown id', () => {
    const layouts = { M: { '5': { preset: 'p1' }, '6': { auto: false } } };
    assert.deepEqual(m.layoutsRemovePreset(layouts, 'gone'), layouts);
    assert.deepEqual(m.layoutsRemovePreset({}, 'p1'), {});
    assert.deepEqual(m.layoutsRemovePreset(null, 'p1'), {});
});

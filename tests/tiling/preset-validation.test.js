'use strict';
// Robustness of the persisted preset data (todo_fixes issue 1): presetsRead
// validates structure, types and ranges at read time — a corrupt settings
// file (external edit, backup restore) can throwing no exceptions, hanging no
// loop and must be left unmodified on disk.
const test = require('node:test');
const assert = require('node:assert/strict');

const { load } = require('../helpers/cinnamon-loader');
const layout = load('./lib/tiling/layout.js');

const RAW = (value) => ({
    config: { settings: { getValue: (k) => (k === 'presets' ? value : undefined), setValue: () => assert.fail('presetsRead must not write') } },
});

const readRaw = (value) => layout.presetsRead(RAW(value));

test('raw json that is not an array reads as empty', () => {
    assert.deepEqual(readRaw('{'), []);
    assert.deepEqual(readRaw('null'), []);
    assert.deepEqual(readRaw('42'), []);
    assert.deepEqual(readRaw('undefined'), []);
    assert.deepEqual(readRaw(''), []);
});

test('entries that are not presets are dropped', () => {
    assert.deepEqual(readRaw(JSON.stringify([null, 42, 'x', []])), []);
    assert.deepEqual(readRaw(JSON.stringify([{}, { name: 'A', rules: [] }, { id: 7 }])), []);
});

test('valid presets survive the read byte-identically', () => {
    const presets = [
        { id: 'p1', name: 'Halves', rules: [{ min: 2, stacks: [1, 1] }] },
        { id: 'p2', name: 'Max', rules: [{ min: 50, stacks: [4, 4, 4, 4, 4, 4] }] },
    ];
    assert.deepEqual(readRaw(JSON.stringify(presets)), presets);
});

test('a preset without rules reads with an empty rule list', () => {
    assert.deepEqual(readRaw(JSON.stringify([{ id: 'p1', name: 'A' }])), [{ id: 'p1', name: 'A', rules: [] }]);
});

test('thresholds clamp into the editor range, missing thresholds drop', () => {
    const rules = [
        { min: -5, stacks: [1, 1] },
        { min: 1e9, stacks: [1, 1] },
        { min: 2, stacks: [1, 1] },
        { min: 50, stacks: [1, 1] },
        { min: '7', stacks: [1, 1] },
        { min: NaN, stacks: [1, 1] },
        { stacks: [1, 1] },
    ];
    const out = readRaw(JSON.stringify([{ id: 'p1', name: 'A', rules }]));
    // JSON.stringify persists NaN as null and undefined keys not at all — both
    // round-trips are exercised here.
    assert.deepEqual(out, [{
        id: 'p1',
        name: 'A',
        rules: [
            { min: 2, stacks: [1, 1] },
            { min: 50, stacks: [1, 1] },
            { min: 2, stacks: [1, 1] },
            { min: 50, stacks: [1, 1] },
            { min: 7, stacks: [1, 1] },
            { min: 2, stacks: [1, 1] },
        ],
    }]);
});

test('stack values clamp into the editor grid, corrupt stacks read as empty', () => {
    const rules = [
        { min: 2, stacks: [1e309, 2.9, 0, -3, '3', 'x', null] },
        { min: 3, stacks: 'no' },
        { min: 4, stacks: [] },
        { min: 5, stacks: [1, 1, 1, 1, 1, 1, 1] },
    ];
    const out = readRaw(JSON.stringify([{ id: 'p1', name: 'A', rules }]));
    assert.deepEqual(out, [{
        id: 'p1',
        name: 'A',
        rules: [
            { min: 2, stacks: [1, 2, 1, 1, 3, 1] },
            { min: 3, stacks: [] },
            { min: 4, stacks: [] },
            { min: 5, stacks: [1, 1, 1, 1, 1, 1] },
        ],
    }]);
});

test('a non-string name reads as an empty name', () => {
    assert.deepEqual(readRaw(JSON.stringify([{ id: 'p1', name: 42, rules: [] }])), [{ id: 'p1', name: '', rules: [] }]);
});

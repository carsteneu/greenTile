'use strict';
// Tests the pure editor model (lib/model/editor.js). The module is loaded through the
// shared Cinnamon-mimicking loader; it must not reference anything outside itself.
const test = require('node:test');
const assert = require('node:assert/strict');

const m = require('./cinnamon-loader').load('./lib/model/editor.js');

test('grid size matches the prototype', () => {
    assert.equal(m.editorCols, 6);
    assert.equal(m.editorRows, 4);
});

test('clamp limits columns and stack heights, never returns empty', () => {
    assert.deepEqual(m.editorClamp([0, 5, 2, 1, 1, 1, 1, 1]), [1, 4, 2, 1, 1, 1]);
    assert.deepEqual(m.editorClamp([]), [1]);
});

test('paint sets an existing column to row + 1', () => {
    assert.deepEqual(m.editorPaint([1, 1, 1, 1], 3, 1), [1, 1, 1, 2]);
});

test('paint beyond the last column fills the gap with the same value', () => {
    assert.deepEqual(m.editorPaint([1, 1], 4, 0), [1, 1, 1, 1, 1]);
    assert.deepEqual(m.editorPaint([1, 1], 4, 2), [1, 1, 3, 3, 3]);
});

test('paint clamps column and row to the grid', () => {
    assert.deepEqual(m.editorPaint([1], 9, 9), [1, 4, 4, 4, 4, 4]);
    assert.deepEqual(m.editorPaint([2, 2], -3, -1), [1, 2]);
});

test('paint does not mutate its input', () => {
    const stacks = [1, 1];
    m.editorPaint(stacks, 0, 3);
    assert.deepEqual(stacks, [1, 1]);
});

test('paint_range paints every column between both ends, in either direction', () => {
    assert.deepEqual(m.editorPaintRange([1], 0, 3, 1), [2, 2, 2, 2]);
    assert.deepEqual(m.editorPaintRange([1, 1, 1, 1], 3, 1, 2), [1, 3, 3, 3]);
});

test('remove deletes one column but keeps at least one', () => {
    assert.deepEqual(m.editorRemove([1, 1, 2], 1), [1, 2]);
    assert.deepEqual(m.editorRemove([3], 0), [3]);
    assert.deepEqual(m.editorRemove([1, 2], 5), [1, 2]);
});

test('sort orders rules by min without mutating', () => {
    const rules = [{ min: 5, stacks: [1] }, { min: 2, stacks: [1] }];
    assert.deepEqual(m.editorSort(rules).map((r) => r.min), [2, 5]);
    assert.equal(rules[0].min, 5);
});

test('add_rule copies the highest rule with min + 1 and selects it', () => {
    const rules = [{ min: 5, stacks: [1, 1, 1, 2] }, { min: 2, stacks: [1, 1] }];
    const r = m.editorAddRule(rules);
    assert.deepEqual(r.rules.map((x) => x.min), [2, 5, 6]);
    assert.deepEqual(r.rules[2].stacks, [1, 1, 1, 2]);
    assert.notEqual(r.rules[2].stacks, r.rules[1].stacks);
    assert.equal(r.index, 2);
});

test('add_rule on an empty list creates the default rule', () => {
    const r = m.editorAddRule([]);
    assert.deepEqual(r.rules, [{ min: 2, stacks: [1, 1] }]);
    assert.equal(r.index, 0);
});

test('add_rule stops at the ceiling', () => {
    const r = m.editorAddRule([{ min: 50, stacks: [1] }]);
    assert.equal(r.rules.length, 1);
});

test('delete_rule removes the selected rule and keeps the index in range', () => {
    const rules = [{ min: 2, stacks: [1] }, { min: 3, stacks: [1] }, { min: 5, stacks: [1] }];
    let r = m.editorDeleteRule(rules, 1);
    assert.deepEqual(r.rules.map((x) => x.min), [2, 5]);
    assert.equal(r.index, 1);
    r = m.editorDeleteRule(rules, 2);
    assert.equal(r.index, 1);
});

test('delete_rule keeps the last remaining rule', () => {
    const r = m.editorDeleteRule([{ min: 2, stacks: [1, 1] }], 0);
    assert.equal(r.rules.length, 1);
    assert.equal(r.index, 0);
});

test('step_min moves the threshold, skips used values and re-sorts', () => {
    const rules = [{ min: 2, stacks: [1] }, { min: 3, stacks: [2] }, { min: 5, stacks: [3] }];
    let r = m.editorStepMin(rules, 1, 1);
    assert.deepEqual(r.rules.map((x) => x.min), [2, 4, 5]);
    assert.equal(r.index, 1);
    r = m.editorStepMin(r.rules, 1, 1);
    assert.deepEqual(r.rules.map((x) => x.min), [2, 5, 6]);
    assert.equal(r.index, 2);
    assert.deepEqual(r.rules[2].stacks, [2]);
    r = m.editorStepMin(rules, 0, 1);
    assert.deepEqual(r.rules.map((x) => x.min), [3, 4, 5]);
    assert.equal(r.index, 1);
    assert.deepEqual(r.rules[1].stacks, [1]);
});

test('step_min respects the floor of 2 and the ceiling of 50', () => {
    const low = m.editorStepMin([{ min: 2, stacks: [1] }], 0, -1);
    assert.equal(low.rules[0].min, 2);
    const blocked = m.editorStepMin([{ min: 2, stacks: [1] }, { min: 3, stacks: [1] }], 1, -1);
    assert.deepEqual(blocked.rules.map((x) => x.min), [2, 3]);
    const high = m.editorStepMin([{ min: 50, stacks: [1] }], 0, 1);
    assert.equal(high.rules[0].min, 50);
});

test('validate requires a non-blank name', () => {
    assert.equal(m.editorValidate({ name: '  ' }), 'name');
    assert.equal(m.editorValidate({ name: 'Terminals' }), null);
});

test('new_id continues the p<number> sequence', () => {
    assert.equal(m.editorNewId([{ id: 'p1' }, { id: 'p3' }, { id: 'x' }]), 'p4');
    assert.equal(m.editorNewId([]), 'p1');
});

test('commit replaces by id in place or appends, without mutating', () => {
    const presets = [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }];
    const replaced = m.editorCommit(presets, { id: 'p1', name: 'A2' });
    assert.deepEqual(replaced.map((p) => p.name), ['A2', 'B']);
    const appended = m.editorCommit(presets, { id: 'p3', name: 'C' });
    assert.deepEqual(appended.map((p) => p.id), ['p1', 'p2', 'p3']);
    assert.equal(presets[0].name, 'A');
});

test('delete_preset drops only the preset with that id, without mutating', () => {
    const presets = [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }, { id: 'p3', name: 'C' }];
    const next = m.editorDeletePreset(presets, 'p2');
    assert.deepEqual(next.map((p) => p.id), ['p1', 'p3']);
    assert.equal(presets.length, 3);
    assert.deepEqual(m.editorDeletePreset(presets, 'gone').map((p) => p.id), ['p1', 'p2', 'p3']);
    assert.deepEqual(m.editorDeletePreset([], 'p1'), []);
});


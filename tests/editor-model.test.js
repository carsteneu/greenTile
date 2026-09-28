'use strict';
// Tests the pure editor model of greenTile.js. The bundle cannot be loaded in
// Node (it needs Cinnamon's imports), so the marked block is extracted and
// evaluated on its own. The block must not reference anything outside itself.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'greenTile.js'), 'utf8');
const match = src.match(/\/\/ >>> editor-model[^\n]*\n([\s\S]*?)\/\/ <<< editor-model/);
if (!match)
    throw new Error('editor-model block not found in greenTile.js');
const block = match[1];
const names = [
    'tile_editor_cols', 'tile_editor_rows', 'tile_editor_clamp', 'tile_editor_paint',
    'tile_editor_paint_range', 'tile_editor_remove', 'tile_editor_sort', 'tile_editor_add_rule',
    'tile_editor_delete_rule', 'tile_editor_step_min', 'tile_editor_validate',
    'tile_editor_new_id', 'tile_editor_commit',
];
const m = new Function(block + '\nreturn {' + names.join(',') + '};')();

test('block is self-contained', () => {
    assert.doesNotMatch(block, /imports\.|tile_St|tile_Clutter|global\.|utils_Main/);
});

test('grid size matches the prototype', () => {
    assert.equal(m.tile_editor_cols, 6);
    assert.equal(m.tile_editor_rows, 4);
});

test('clamp limits columns and stack heights, never returns empty', () => {
    assert.deepEqual(m.tile_editor_clamp([0, 5, 2, 1, 1, 1, 1, 1]), [1, 4, 2, 1, 1, 1]);
    assert.deepEqual(m.tile_editor_clamp([]), [1]);
});

test('paint sets an existing column to row + 1', () => {
    assert.deepEqual(m.tile_editor_paint([1, 1, 1, 1], 3, 1), [1, 1, 1, 2]);
});

test('paint beyond the last column fills the gap with the same value', () => {
    assert.deepEqual(m.tile_editor_paint([1, 1], 4, 0), [1, 1, 1, 1, 1]);
    assert.deepEqual(m.tile_editor_paint([1, 1], 4, 2), [1, 1, 3, 3, 3]);
});

test('paint clamps column and row to the grid', () => {
    assert.deepEqual(m.tile_editor_paint([1], 9, 9), [1, 4, 4, 4, 4, 4]);
    assert.deepEqual(m.tile_editor_paint([2, 2], -3, -1), [1, 2]);
});

test('paint does not mutate its input', () => {
    const stacks = [1, 1];
    m.tile_editor_paint(stacks, 0, 3);
    assert.deepEqual(stacks, [1, 1]);
});

test('paint_range paints every column between both ends, in either direction', () => {
    assert.deepEqual(m.tile_editor_paint_range([1], 0, 3, 1), [2, 2, 2, 2]);
    assert.deepEqual(m.tile_editor_paint_range([1, 1, 1, 1], 3, 1, 2), [1, 3, 3, 3]);
});

test('remove deletes one column but keeps at least one', () => {
    assert.deepEqual(m.tile_editor_remove([1, 1, 2], 1), [1, 2]);
    assert.deepEqual(m.tile_editor_remove([3], 0), [3]);
    assert.deepEqual(m.tile_editor_remove([1, 2], 5), [1, 2]);
});

test('sort orders rules by min without mutating', () => {
    const rules = [{ min: 5, stacks: [1] }, { min: 2, stacks: [1] }];
    assert.deepEqual(m.tile_editor_sort(rules).map((r) => r.min), [2, 5]);
    assert.equal(rules[0].min, 5);
});

test('add_rule copies the highest rule with min + 1 and selects it', () => {
    const rules = [{ min: 5, stacks: [1, 1, 1, 2] }, { min: 2, stacks: [1, 1] }];
    const r = m.tile_editor_add_rule(rules);
    assert.deepEqual(r.rules.map((x) => x.min), [2, 5, 6]);
    assert.deepEqual(r.rules[2].stacks, [1, 1, 1, 2]);
    assert.notEqual(r.rules[2].stacks, r.rules[1].stacks);
    assert.equal(r.index, 2);
});

test('add_rule on an empty list creates the default rule', () => {
    const r = m.tile_editor_add_rule([]);
    assert.deepEqual(r.rules, [{ min: 2, stacks: [1, 1] }]);
    assert.equal(r.index, 0);
});

test('add_rule stops at the ceiling', () => {
    const r = m.tile_editor_add_rule([{ min: 50, stacks: [1] }]);
    assert.equal(r.rules.length, 1);
});

test('delete_rule removes the selected rule and keeps the index in range', () => {
    const rules = [{ min: 2, stacks: [1] }, { min: 3, stacks: [1] }, { min: 5, stacks: [1] }];
    let r = m.tile_editor_delete_rule(rules, 1);
    assert.deepEqual(r.rules.map((x) => x.min), [2, 5]);
    assert.equal(r.index, 1);
    r = m.tile_editor_delete_rule(rules, 2);
    assert.equal(r.index, 1);
});

test('delete_rule keeps the last remaining rule', () => {
    const r = m.tile_editor_delete_rule([{ min: 2, stacks: [1, 1] }], 0);
    assert.equal(r.rules.length, 1);
    assert.equal(r.index, 0);
});

test('step_min moves the threshold, skips used values and re-sorts', () => {
    const rules = [{ min: 2, stacks: [1] }, { min: 3, stacks: [2] }, { min: 5, stacks: [3] }];
    let r = m.tile_editor_step_min(rules, 1, 1);
    assert.deepEqual(r.rules.map((x) => x.min), [2, 4, 5]);
    assert.equal(r.index, 1);
    r = m.tile_editor_step_min(r.rules, 1, 1);
    assert.deepEqual(r.rules.map((x) => x.min), [2, 5, 6]);
    assert.equal(r.index, 2);
    assert.deepEqual(r.rules[2].stacks, [2]);
    r = m.tile_editor_step_min(rules, 0, 1);
    assert.deepEqual(r.rules.map((x) => x.min), [3, 4, 5]);
    assert.equal(r.index, 1);
    assert.deepEqual(r.rules[1].stacks, [1]);
});

test('step_min respects the floor of 2 and the ceiling of 50', () => {
    const low = m.tile_editor_step_min([{ min: 2, stacks: [1] }], 0, -1);
    assert.equal(low.rules[0].min, 2);
    const blocked = m.tile_editor_step_min([{ min: 2, stacks: [1] }, { min: 3, stacks: [1] }], 1, -1);
    assert.deepEqual(blocked.rules.map((x) => x.min), [2, 3]);
    const high = m.tile_editor_step_min([{ min: 50, stacks: [1] }], 0, 1);
    assert.equal(high.rules[0].min, 50);
});

test('validate requires a non-blank name', () => {
    assert.equal(m.tile_editor_validate({ name: '  ' }), 'name');
    assert.equal(m.tile_editor_validate({ name: 'Terminals' }), null);
});

test('new_id continues the p<number> sequence', () => {
    assert.equal(m.tile_editor_new_id([{ id: 'p1' }, { id: 'p3' }, { id: 'x' }]), 'p4');
    assert.equal(m.tile_editor_new_id([]), 'p1');
});

test('commit replaces by id in place or appends, without mutating', () => {
    const presets = [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }];
    const replaced = m.tile_editor_commit(presets, { id: 'p1', name: 'A2' });
    assert.deepEqual(replaced.map((p) => p.name), ['A2', 'B']);
    const appended = m.tile_editor_commit(presets, { id: 'p3', name: 'C' });
    assert.deepEqual(appended.map((p) => p.id), ['p1', 'p2', 'p3']);
    assert.equal(presets[0].name, 'A');
});

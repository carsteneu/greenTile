'use strict';
// Tests the spans side of the pure editor model (lib/model/editor.js): the spans
// array stays parallel to stacks, merging joins a column with its right neighbour
// (the left stack count stays), splitting hands one grid column back on the right.
const test = require('node:test');
const assert = require('node:assert/strict');

const m = require('../helpers/cinnamon-loader').load('./lib/model/editor.js');

test('editorSpans pads missing columns with one and cuts the surplus', () => {
    assert.deepEqual(m.editorSpans([1, 2], 4), [1, 2, 1, 1]);
    assert.deepEqual(m.editorSpans([1, 2, 3, 4], 2), [1, 2]);
    assert.deepEqual(m.editorSpans(undefined, 3), [1, 1, 1]);
    assert.deepEqual(m.editorSpans([], 0), []);
});

test('editorSpans normalizes corrupt values like the stacks clamp does', () => {
    assert.deepEqual(m.editorSpans([2.9, 0, -3, '3', 'x', null], 6), [2, 1, 1, 3, 1, 1]);
    assert.deepEqual(m.editorSpans([1e309, 1e9], 2), [1, 6]);
});

test('editorMerge joins a column with its right neighbour', () => {
    assert.deepEqual(m.editorMerge([2, 3, 1], [1, 2, 1], 0), { stacks: [2, 1], spans: [3, 1] });
    assert.deepEqual(m.editorMerge([2, 3], [1, 1], 0), { stacks: [2], spans: [2] });
});

test('editorMerge keeps the left stack count and never touches its input', () => {
    const stacks = [2, 3, 1];
    const spans = [1, 2, 1];
    const r = m.editorMerge(stacks, spans, 1);
    assert.deepEqual(r, { stacks: [2, 3], spans: [1, 3] });
    assert.deepEqual(stacks, [2, 3, 1]);
    assert.deepEqual(spans, [1, 2, 1]);
});

test('editorMerge refuses the last column and out-of-range indices', () => {
    assert.equal(m.editorMerge([2, 3], [1, 1], 1), null);
    assert.equal(m.editorMerge([2], [1], 0), null);
    assert.equal(m.editorMerge([2, 3], [1, 1], 5), null);
    assert.equal(m.editorMerge([2, 3], [1, 1], -1), null);
});

test('editorSplit hands one grid column back on the right', () => {
    assert.deepEqual(m.editorSplit([2, 1], [3, 1], 0), { stacks: [2, 1, 1], spans: [2, 1, 1] });
    assert.deepEqual(m.editorSplit([1], [2], 0), { stacks: [1, 1], spans: [1, 1] });
});

test('editorSplit does nothing on a span of one and never touches its input', () => {
    const stacks = [2, 1];
    const spans = [2, 1];
    assert.deepEqual(m.editorSplit(stacks, spans, 0), { stacks: [2, 1, 1], spans: [1, 1, 1] });
    assert.deepEqual(stacks, [2, 1]);
    assert.deepEqual(spans, [2, 1]);
    assert.equal(m.editorSplit([2, 1], [1, 1], 0), null);
    assert.equal(m.editorSplit([2, 1], [2, 1], 5), null);
});

test('split then merge restores the columns', () => {
    const merged = m.editorSplit([4, 1], [2, 1], 0);
    assert.deepEqual(m.editorMerge(merged.stacks, merged.spans, 0), { stacks: [4, 1], spans: [2, 1] });
});

test('merge keeps the span budget of the grid', () => {
    const merged = m.editorMerge([1, 1, 1, 1, 1, 1], [1, 1, 1, 1, 1, 1], 0);
    assert.equal(merged.spans.reduce((a, b) => a + b, 0), 6, 'the grid columns stay six');
    assert.equal(merged.spans.length, 5);
});

test('add_rule and step_min carry the spans along', () => {
    const rules = [{ min: 3, stacks: [1, 1, 1], spans: [1, 2, 1] }];
    const added = m.editorAddRule(rules);
    assert.deepEqual(added.rules[1].spans, [1, 2, 1]);
    assert.notEqual(added.rules[1].spans, rules[0].spans);
    const stepped = m.editorStepMin(rules, 0, 0);
    assert.deepEqual(stepped.rules[0].spans, [1, 2, 1]);
    assert.deepEqual(stepped.rules[0].stacks, [1, 1, 1]);
});

test('add_rule stays byte-identical for rules without spans', () => {
    const rules = [{ min: 3, stacks: [1, 1, 1] }];
    assert.deepEqual(m.editorAddRule(rules).rules[1], { min: 4, stacks: [1, 1, 1] });
    assert.deepEqual(m.editorStepMin(rules, 0, 1).rules[0], { min: 4, stacks: [1, 1, 1] });
});

'use strict';
// Tests the pure 100 % area model (lib/model/fill.js).
// fillStacks turns a painted rule into the layout for n windows so that no
// cell stays empty; autoRows spreads n windows over the rows of the wide
// automatic grid so that every row spans the full width.
const test = require('node:test');
const assert = require('node:assert/strict');

const m = require('./cinnamon-loader').load('./lib/model/fill.js');

const sum = (a) => a.reduce((x, y) => x + y, 0);

test('exact fit keeps the painted rule', () => {
    assert.deepEqual(m.fillStacks([1, 2, 2], 5), [1, 2, 2]);
    assert.deepEqual(m.fillStacks([2, 2, 2], 6), [2, 2, 2]);
});

test('surplus windows extend the last column (unchanged behaviour)', () => {
    assert.deepEqual(m.fillStacks([1, 1], 4), [1, 3]);
    assert.deepEqual(m.fillStacks([2, 3], 7), [2, 5]);
});

test('missing windows shorten the highest column, on a tie the right one', () => {
    assert.deepEqual(m.fillStacks([4, 4], 5), [3, 2]);
    assert.deepEqual(m.fillStacks([2, 2], 3), [2, 1]);
    assert.deepEqual(m.fillStacks([2, 3], 4), [2, 2]);
    assert.deepEqual(m.fillStacks([1, 4], 3), [1, 2]);
    assert.deepEqual(m.fillStacks([3, 1, 2], 5), [2, 1, 2]);
});

test('columns stay while there are enough windows for one each', () => {
    assert.deepEqual(m.fillStacks([2, 2], 2), [1, 1]);
    assert.deepEqual(m.fillStacks([2, 2, 2], 3), [1, 1, 1]);
});

test('fewer windows than columns: columns drop from the right, one window each', () => {
    assert.deepEqual(m.fillStacks([1, 2, 2], 2), [1, 1]);
    assert.deepEqual(m.fillStacks([1, 1, 1, 1], 3), [1, 1, 1]);
    assert.deepEqual(m.fillStacks([4, 4, 4], 1), [1]);
});

test('result always has exactly n cells and no empty column', () => {
    const rules = [[1], [1, 1], [2, 2], [1, 2, 2], [4, 4, 4, 4, 4, 4], [3, 1, 4, 1]];
    for (const stacks of rules) {
        for (let n = 1; n <= 30; n++) {
            const out = m.fillStacks(stacks, n);
            assert.equal(sum(out), n, JSON.stringify(stacks) + ' n=' + n);
            assert.ok(out.every((s) => Number.isInteger(s) && s >= 1), JSON.stringify(out));
            assert.ok(out.length <= stacks.length);
        }
    }
});

test('the painted rule is not mutated', () => {
    const stacks = [4, 4];
    m.fillStacks(stacks, 3);
    m.fillStacks(stacks, 9);
    assert.deepEqual(stacks, [4, 4]);
});

test('no windows: the painted rule is returned as it is', () => {
    assert.deepEqual(m.fillStacks([2, 2], 0), [2, 2]);
});

test('narrow auto grid: 3 columns with balanced stacks, singles left', () => {
    assert.deepEqual(m.autoNarrowStacks(4), [1, 1, 2]);
    assert.deepEqual(m.autoNarrowStacks(5), [1, 2, 2]);
    assert.deepEqual(m.autoNarrowStacks(6), [2, 2, 2]);
    assert.deepEqual(m.autoNarrowStacks(8), [2, 3, 3]);
    assert.deepEqual(m.autoNarrowStacks(9), [3, 3, 3]);
});

test('auto rows: up to six windows side by side in one row', () => {
    assert.equal(m.AUTO_ROW_MAX, 6);
    assert.deepEqual(m.autoRows(2), [2]);
    assert.deepEqual(m.autoRows(6), [6]);
});

test('auto rows: more than six are spread evenly, upper rows take the surplus', () => {
    assert.deepEqual(m.autoRows(7), [4, 3]);
    assert.deepEqual(m.autoRows(8), [4, 4]);
    assert.deepEqual(m.autoRows(9), [5, 4]);
    assert.deepEqual(m.autoRows(11), [6, 5]);
    assert.deepEqual(m.autoRows(12), [6, 6]);
    assert.deepEqual(m.autoRows(13), [5, 4, 4]);
});

test('auto rows: n cells, no row wider than six, no empty row', () => {
    for (let n = 1; n <= 40; n++) {
        const rows = m.autoRows(n);
        assert.equal(sum(rows), n);
        assert.ok(rows.every((r) => r >= 1 && r <= 6), n + ': ' + JSON.stringify(rows));
        assert.equal(rows.length, Math.ceil(n / 6));
    }
});

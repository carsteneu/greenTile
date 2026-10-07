'use strict';
// splitEqual with the optional column weights (preset spans): the major fractions
// become weights[i] / sum(weights) when the weights carry shape.length entries,
// otherwise the equal division as before. load through the shared Cinnamon loader;
// the module is pure.
const test = require('node:test');
const assert = require('node:assert/strict');

const m = require('../helpers/cinnamon-loader').load('./lib/model/split.js');

test('without weights the split is the equal division', () => {
    assert.deepEqual(m.splitEqual('cols', [1, 2, 1]), {
        kind: 'cols',
        shape: [1, 2, 1],
        major: [1 / 3, 1 / 3, 1 / 3],
        minor: [[1], [1 / 2, 1 / 2], [1]],
    });
});

test('weights become the major fractions, the minor axis stays equal', () => {
    const s = m.splitEqual('cols', [1, 1, 1], [1, 2, 1]);
    assert.deepEqual(s.major, [0.25, 0.5, 0.25]);
    assert.deepEqual(s.minor, [[1], [1], [1]]);
    assert.deepEqual(s.shape, [1, 1, 1]);
    assert.equal(s.kind, 'cols');
});

test('all-ones weights equal the no-weights output byte for byte', () => {
    assert.deepEqual(m.splitEqual('cols', [1, 2, 1], [1, 1, 1]), m.splitEqual('cols', [1, 2, 1]));
});

test('weights that do not match the shape fall back to the equal division', () => {
    assert.deepEqual(m.splitEqual('cols', [1, 1], [1, 2, 1]).major, [0.5, 0.5]);
    assert.deepEqual(m.splitEqual('cols', [1, 1, 1], []).major, [1 / 3, 1 / 3, 1 / 3]);
});

test('corrupt weights cannot produce a broken split', () => {
    const one = (weights) => m.splitEqual('cols', [1, 1], weights).major;
    assert.deepEqual(one([0, 4]), [0.5, 0.5], 'a zero weight is not a fraction');
    assert.deepEqual(one([-1, 4]), [0.5, 0.5], 'a negative weight is not a fraction');
    assert.deepEqual(one([Number.MAX_VALUE * 2, 1]), [0.5, 0.5], 'a non-finite weight is not a fraction');
    assert.deepEqual(one(['2', '2']), [0.5, 0.5], 'a string weight is not a fraction');
    assert.deepEqual(one([Number.NaN, Number.NaN]), [0.5, 0.5]);
});

test('weights and shape are not mutated', () => {
    const shape = [1, 1, 1];
    const weights = [1, 2, 1];
    const s = m.splitEqual('cols', shape, weights);
    s.major[0] = 9;
    assert.deepEqual(shape, [1, 1, 1]);
    assert.deepEqual(weights, [1, 2, 1]);
    assert.deepEqual(s.shape, [1, 1, 1]);
});

test('splitRects places the weighted widths over the whole area', () => {
    const split = m.splitEqual('cols', [1, 1, 1], [1, 2, 1]);
    assert.deepEqual(m.splitRects('cols', [1, 1, 1], split, [0, 0, 1000, 100]),
        [[0, 0, 250, 100], [250, 0, 500, 100], [750, 0, 250, 100]]);
});

test('a weighted split survives the stored-split validation', () => {
    const split = m.splitEqual('cols', [1, 1, 1], [1, 2, 1]);
    assert.deepEqual(m.splitValid('cols', [1, 1, 1], split), split);
    assert.equal(m.splitValid('cols', [1, 1], split), null, 'a shape mismatch is rejected');
});

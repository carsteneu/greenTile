'use strict';
// Tests the pure signal-teardown helper (lib/model/teardown.js). Fake targets stand in
// for workspace/screen objects; a throwing disconnect must not stop the loop.
const test = require('node:test');
const assert = require('node:assert/strict');

const m = require('./cinnamon-loader').load('./lib/model/teardown.js');

test('disconnects every id of every entry', () => {
    const attempts = [];
    const fake = () => ({ disconnect: (id) => attempts.push(id) });
    m.tile_disconnect_each([
        [fake(), 11, 12],
        [fake(), 21],
    ]);
    assert.deepEqual(attempts, [11, 12, 21]);
});

test('a throwing disconnect does not stop the loop', () => {
    const attempts = [];
    const gone = new Set([12, 21]);
    const fake = () => ({ disconnect: (id) => {
        attempts.push(id);
        if (gone.has(id))
            throw new Error('signal was already gone');
    } });
    m.tile_disconnect_each([
        [fake(), 11, 12, 13],
        [fake(), 21],
    ]);
    assert.deepEqual(attempts, [11, 12, 13, 21]);
});

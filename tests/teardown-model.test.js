'use strict';
// Tests the pure signal-teardown helper of greenTile.js (marked block "teardown-model"),
// extracted and evaluated without Cinnamon, like monitor-model. Fake targets stand in
// for workspace/screen objects; a throwing disconnect must not stop the loop.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'greenTile.js'), 'utf8');
const match = src.match(/\/\/ >>> teardown-model[^\n]*\n([\s\S]*?)\/\/ <<< teardown-model/);
if (!match)
    throw new Error('teardown-model block not found in greenTile.js');
const block = match[1];
const m = new Function(block + '\nreturn {tile_disconnect_each};')();

test('block is self-contained', () => {
    assert.doesNotMatch(block, /imports\.|tile_St|tile_Clutter|global\.|utils_Main/);
});

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

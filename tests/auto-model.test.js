'use strict';
// Tests the pure per-workspace auto model (lib/model/auto.js), loaded through the
// shared Cinnamon-mimicking loader.
// Storage format: the list setting "autoWorkspaces" shown on the General page of
// the settings dialog, rows { workspace: <number from 1>, auto: <boolean> }.
const test = require('node:test');
const assert = require('node:assert/strict');

const m = require('./cinnamon-loader').load('./lib/model/auto.js');

test('list_map turns rows (workspace numbers from 1) into a map by workspace index', () => {
    assert.deepEqual(m.tile_auto_list_map([{ workspace: 5, auto: false }, { workspace: 1, auto: true }]), { 4: false, 0: true });
});

test('list_map tolerates anything that is not a list of valid rows', () => {
    assert.deepEqual(m.tile_auto_list_map(undefined), {});
    assert.deepEqual(m.tile_auto_list_map(null), {});
    assert.deepEqual(m.tile_auto_list_map('[]'), {});
    assert.deepEqual(m.tile_auto_list_map({ workspace: 1, auto: true }), {});
    assert.deepEqual(m.tile_auto_list_map([
        null,
        { workspace: 0, auto: true },
        { workspace: 2.5, auto: true },
        { workspace: '3', auto: true },
        { workspace: 4, auto: 'yes' },
        { workspace: 6, auto: true },
    ]), { 5: true });
});

test('list_map: with duplicate rows for a workspace the last row wins', () => {
    assert.deepEqual(m.tile_auto_list_map([{ workspace: 2, auto: true }, { workspace: 2, auto: false }]), { 1: false });
});

test('without a row, a workspace is active exactly when it has a preset', () => {
    assert.equal(m.tile_auto_ws_active({}, 3, true), true);
    assert.equal(m.tile_auto_ws_active({}, 3, false), false);
});

test('a row wins over the preset default', () => {
    const map = m.tile_auto_list_map([{ workspace: 4, auto: false }, { workspace: 6, auto: true }]);
    assert.equal(m.tile_auto_ws_active(map, 3, true), false);
    assert.equal(m.tile_auto_ws_active(map, 5, false), true);
});

test('list_set replaces every row of the workspace by one row, sorted, without mutating', () => {
    const list = [{ workspace: 3, auto: true }, { workspace: 1, auto: false }, { workspace: 3, auto: false }];
    const next = m.tile_auto_list_set(list, 2, true);
    assert.deepEqual(next, [{ workspace: 1, auto: false }, { workspace: 3, auto: true }]);
    assert.equal(list.length, 3);
    assert.deepEqual(m.tile_auto_list_set(next, 4, false), [{ workspace: 1, auto: false }, { workspace: 3, auto: true }, { workspace: 5, auto: false }]);
});

test('list_set drops invalid rows and starts from scratch for a non-list value', () => {
    assert.deepEqual(m.tile_auto_list_set([null, { workspace: 'x', auto: true }], 0, true), [{ workspace: 1, auto: true }]);
    assert.deepEqual(m.tile_auto_list_set(undefined, 0, false), [{ workspace: 1, auto: false }]);
});

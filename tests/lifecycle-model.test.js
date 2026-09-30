'use strict';
// Tests the pure pending-op epoch of greenTile.js (marked block "lifecycle-model"),
// extracted and evaluated without Cinnamon, like monitor-model. The registry guards
// tile_monitors_refresh: a late DBus reply is ignored when it is stale — superseded
// by a newer refresh (monitor change) or invalidated by teardown (App destroy).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'greenTile.js'), 'utf8');
const match = src.match(/\/\/ >>> lifecycle-model[^\n]*\n([\s\S]*?)\/\/ <<< lifecycle-model/);
if (!match)
    throw new Error('lifecycle-model block not found in greenTile.js');
const block = match[1];
const m = new Function(block + '\nreturn {tile_pending_registry};')();

test('block is self-contained', () => {
    assert.doesNotMatch(block, /imports\.|tile_St|tile_Clutter|global\.|utils_Main/);
});

test('a fresh token is current', () => {
    const pending = m.tile_pending_registry();
    assert.equal(pending.is_current(pending.begin()), true);
});

test('a newer begin supersedes an older token', () => {
    const pending = m.tile_pending_registry();
    const first = pending.begin();
    const second = pending.begin();
    assert.equal(pending.is_current(first), false);
    assert.equal(pending.is_current(second), true);
});

test('invalidate drops the pending token (teardown)', () => {
    const pending = m.tile_pending_registry();
    const token = pending.begin();
    pending.invalidate();
    assert.equal(pending.is_current(token), false);
});

test('after invalidate a new begin is current again (disable -> enable)', () => {
    const pending = m.tile_pending_registry();
    pending.begin();
    pending.invalidate();
    assert.equal(pending.is_current(pending.begin()), true);
});

test('repeated invalidate stays invalidated', () => {
    const pending = m.tile_pending_registry();
    const token = pending.begin();
    pending.invalidate();
    pending.invalidate();
    assert.equal(pending.is_current(token), false);
});

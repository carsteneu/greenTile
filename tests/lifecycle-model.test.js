'use strict';
// Tests the pure pending-op epoch (lib/model/lifecycle.js). The registry guards
// tile_monitors_refresh: a late DBus reply is ignored when it is stale — superseded
// by a newer refresh (monitor change) or invalidated by teardown (App destroy).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const m = require('./cinnamon-loader').load('./lib/model/lifecycle.js');

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

test('invalidate drops even the newest token after repeated begins', () => {
    const pending = m.tile_pending_registry();
    pending.begin();
    const last = pending.begin();
    pending.invalidate();
    assert.equal(pending.is_current(last), false);
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

'use strict';
// Tests the pure restart-order model (lib/model/window-order.js): the on-disk
// store of per-surface window orders, keyed by X11 window descriptions, and the
// reorder applied to a reading-ordered window list. The file is untrusted input
// (a foreign or hand-edited file lives in the user's runtime dir), so parse,
// validation, caps and the reorder are pure and defensive.
const test = require('node:test');
const assert = require('node:assert/strict');

const m = require('../helpers/cinnamon-loader').load('./lib/model/window-order.js');

const key = (mon, ws) => m.orderKey(mon, ws);
const store = (surfaces) => JSON.stringify({ v: 1, s: surfaces });
const win = (desc) => ({ description: desc, get_description() { return this.description; } });

test('constants pin the version and the caps', () => {
    assert.equal(m.ORDER_VERSION, 1);
    assert.ok(m.ORDER_MAX_PER_SURFACE >= 8 && m.ORDER_MAX_PER_SURFACE <= 256);
    assert.ok(m.ORDER_MAX_SURFACES >= 8 && m.ORDER_MAX_SURFACES <= 256);
});

test('orderKey joins monitor and workspace key with a newline', () => {
    assert.equal(m.orderKey('DEL1234', '1'), 'DEL1234\n1');
});

test('orderItemValid accepts only X11 hex descriptions', () => {
    for (const good of ['0x1', '0x0', '0x6a00004', '0x6A00004', '0x1234567890abcdef']) {
        assert.equal(m.orderItemValid(good), true, good);
    }
    for (const bad of ['', '0x', 'x1', '6a00004', '0x1234567890abcdefa', '0x6a\n', ' 0x6a', 0x6a, 106, null, undefined, {}, [], '0xzz']) {
        assert.equal(m.orderItemValid(bad), false, JSON.stringify(bad));
    }
});

test('orderParse returns null for anything that is not a valid store', () => {
    for (const raw of [null, undefined, 5, {}, [], '{', 'null', '[]', '{}', '{"v":2,"s":{}}', '{"v":1}', '{"v":1,"s":[]}', '{"s":{}}', '{"foo":1}', 'not json at all']) {
        assert.equal(m.orderParse(raw), null, JSON.stringify(raw));
    }
});

test('orderParse keeps valid surfaces and drops everything malformed', () => {
    const s = {
        [key('M', '1')]: ['0x1', '0x2'],
        [key('M', '2')]: ['0x3'],                       // < 2 ids: dropped
        [key('M', '3')]: '0x1',                          // not an array: dropped
        [key('M', '4')]: ['0x1', 'nope', '0x5'],         // filtered -> 2 left: kept
        [key('M', '5')]: ['0x1', '0x1'],                 // dedupe -> 1: dropped
    };
    const parsed = m.orderParse(store(s));
    assert.deepEqual(Object.keys(parsed.s).sort(), [key('M', '1'), key('M', '4')].sort());
    assert.deepEqual(m.orderGet(parsed, key('M', '4')), ['0x1', '0x5']);
});

test('orderParse bounds the id count per surface and the surface count', () => {
    const many = [];
    for (let i = 0; i < m.ORDER_MAX_PER_SURFACE + 20; i++) {
        many.push('0x' + (i + 1).toString(16));
    }
    const surfaces = {};
    for (let i = 0; i < m.ORDER_MAX_SURFACES + 20; i++) {
        surfaces[key('M', String(i))] = many.slice();
    }
    const parsed = m.orderParse(store(surfaces));
    const keys = Object.keys(parsed.s);
    assert.equal(keys.length, m.ORDER_MAX_SURFACES);
    assert.equal(m.orderGet(parsed, keys[0]).length, m.ORDER_MAX_PER_SURFACE);
});

test('orderParse drops surfaces whose key is absurdly long', () => {
    const long = 'M'.repeat(500);
    const parsed = m.orderParse(store({ [long]: ['0x1', '0x2'] }));
    assert.deepEqual(Object.keys(parsed.s), []);
});

test('orderGet returns a copy and null for unknown or short surfaces', () => {
    const parsed = m.orderParse(store({ [key('M', '1')]: ['0x1', '0x2'] }));
    const ids = m.orderGet(parsed, key('M', '1'));
    assert.deepEqual(ids, ['0x1', '0x2']);
    ids.push('0x9');
    assert.deepEqual(m.orderGet(parsed, key('M', '1')), ['0x1', '0x2'], 'the store is not aliased');
    assert.equal(m.orderGet(parsed, key('M', 'nope')), null);
    assert.equal(m.orderGet(null, key('M', '1')), null);
});

test('orderSet adds a surface, keeps the others and never mutates the input', () => {
    const before = m.orderParse(store({ [key('M', '1')]: ['0x1', '0x2'] }));
    const after = m.orderSet(before, key('M', '2'), ['0x3', '0x4', 'nope']);
    assert.deepEqual(m.orderGet(after, key('M', '2')), ['0x3', '0x4']);
    assert.deepEqual(m.orderGet(after, key('M', '1')), ['0x1', '0x2']);
    assert.equal(m.orderGet(before, key('M', '2')), null, 'the input store is untouched');
});

test('orderSet removes a surface when fewer than two valid ids remain', () => {
    const before = m.orderParse(store({ [key('M', '1')]: ['0x1', '0x2'] }));
    const after = m.orderSet(before, key('M', '1'), ['0x1', 'nope']);
    assert.equal(m.orderGet(after, key('M', '1')), null);
});

test('orderSet keeps the surface count bounded when adding', () => {
    let s = { v: 1, s: {} };
    for (let i = 0; i < m.ORDER_MAX_SURFACES + 5; i++) {
        s = m.orderSet(s, key('M', String(i)), ['0x1', '0x2']);
    }
    assert.equal(Object.keys(s.s).length, m.ORDER_MAX_SURFACES);
});

test('orderSort puts the listed windows first in list order and appends the rest unchanged', () => {
    const a = win('0x1');
    const b = win('0x2');
    const c = win('0x3');
    const windows = [a, b, c];
    const desc = (w) => w.get_description();
    assert.deepEqual(m.orderSort(['0x3', '0x1'], windows, desc), [c, a, b]);
    assert.deepEqual(m.orderSort(['0x2', '0x1', '0x3'], windows, desc), [b, a, c]);
});

test('orderSort tolerates unknown ids, a null description and duplicates', () => {
    const a = win('0x1');
    const b = win(null);
    const c = win('0x3');
    const windows = [a, b, c];
    const desc = (w) => w.get_description();
    assert.deepEqual(m.orderSort(['0xffff', '0x3', '0x3'], windows, desc), [c, a, b]);
    assert.deepEqual(m.orderSort(null, windows, desc), [a, b, c], 'no ids: the input order');
    assert.deepEqual(m.orderSort(['0x1'], windows, desc), [a, b, c], 'a single id is no order');
});

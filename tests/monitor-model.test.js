'use strict';
// Tests the pure monitor identity model (lib/model/monitor.js).
// Key source: DBus org.cinnamon.Muffin.DisplayConfig GetCurrentState, per monitor
// the tuple (connector, vendor, product, serial).
const test = require('node:test');
const assert = require('node:assert/strict');

const m = require('./cinnamon-loader').load('./lib/model/monitor.js');

test('key is vendor|product|serial', () => {
    assert.equal(m.tile_monitor_key('DisplayPort-1', 'AOC', 'AG493UG7R4', '0x000002ee'), 'AOC|AG493UG7R4|0x000002ee');
});

test('zero or empty serial appends the connector', () => {
    assert.equal(m.tile_monitor_key('eDP', 'LEN', '0x41a8', '0x00000000'), 'LEN|0x41a8|0x00000000|eDP');
    assert.equal(m.tile_monitor_key('eDP', 'LEN', '0x41a8', ''), 'LEN|0x41a8||eDP');
    assert.equal(m.tile_monitor_key('eDP', 'LEN', '0x41a8', '0'), 'LEN|0x41a8|0|eDP');
});

test('identical models with zero serial differ by connector', () => {
    const first = m.tile_monitor_key('DP-1', 'DEL', 'U2723QE', '0x00000000');
    const second = m.tile_monitor_key('DP-2', 'DEL', 'U2723QE', '0x00000000');
    assert.notEqual(first, second);
});

test('fallback key', () => {
    assert.equal(m.tile_monitor_fallback_key('AOC 49"', 5120, 1440), 'name:AOC 49"|5120x1440');
});

test('states from GetCurrentState', () => {
    const input = [
        [['DisplayPort-1', 'AOC', 'AG493UG7R4', '0x000002ee'], [], {}],
        [['eDP', 'LEN', '0x41a8', '0x00000000'], [], {}],
    ];
    assert.deepEqual(m.tile_monitor_states(input), [
        { connector: 'DisplayPort-1', key: 'AOC|AG493UG7R4|0x000002ee' },
        { connector: 'eDP', key: 'LEN|0x41a8|0x00000000|eDP' },
    ]);
});

test('states skips malformed items and non-array input', () => {
    assert.deepEqual(m.tile_monitor_states('nope'), []);
    assert.deepEqual(m.tile_monitor_states([
        null,
        'garbage',
        [['AOC', 'AOC', 'AG493UG7R4', '0x000002ee'], [], {}],
        [[], [], {}],
        [['DisplayPort-1', 'AOC', 'AG493UG7R4', '0x000002ee'], [], {}],
    ]), [
        { connector: 'AOC', key: 'AOC|AG493UG7R4|0x000002ee' },
        { connector: 'DisplayPort-1', key: 'AOC|AG493UG7R4|0x000002ee' },
    ]);
});

test('ws key', () => {
    assert.equal(m.tile_monitor_ws_key(4, true, false), '5');
    assert.equal(m.tile_monitor_ws_key(4, false, false), '5');
    assert.equal(m.tile_monitor_ws_key(4, false, true), '*');
    assert.equal(m.tile_monitor_ws_key(4, true, true), '5');
});

test('labels stay untouched while unique', () => {
    assert.deepEqual(m.tile_monitor_labels(['AOC 49"'], ['DisplayPort-1']), ['AOC 49"']);
});

test('labels append the connector for duplicated names', () => {
    assert.deepEqual(
        m.tile_monitor_labels(['DELL U2723QE', 'DELL U2723QE'], ['DP-2', 'DP-3']),
        ['DELL U2723QE (DP-2)', 'DELL U2723QE (DP-3)'],
    );
});

test('labels fall back to the monitor number when the connector is missing', () => {
    assert.deepEqual(
        m.tile_monitor_labels(['DELL U2723QE', 'DELL U2723QE'], ['DP-2', '']),
        ['DELL U2723QE (DP-2)', 'DELL U2723QE (2)'],
    );
});

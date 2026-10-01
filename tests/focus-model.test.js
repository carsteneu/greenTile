'use strict';
// Tests the pure focus model (lib/model/focus.js). It covers the monitor-edge rules of
// Super+Arrow focus movement: which monitor borders in the direction (no wrap), and which
// window on it is nearest.
const test = require('node:test');
const assert = require('node:assert/strict');

const m = require('./cinnamon-loader').load('./lib/model/focus.js');

// laptop + 5K side by side, ordered by geometry x.
const monitors = [
    { index: 0, x: 0 },
    { index: 1, x: 5120 },
];

test('monitor step: neighbour both ways, null at the outer edges (no wrap)', () => {
    assert.equal(m.focusMonitorStep({ dir: 'right', monitorIndex: 0, monitors }), 1);
    assert.equal(m.focusMonitorStep({ dir: 'left', monitorIndex: 1, monitors }), 0);
    assert.equal(m.focusMonitorStep({ dir: 'right', monitorIndex: 1, monitors }), null);
    assert.equal(m.focusMonitorStep({ dir: 'left', monitorIndex: 0, monitors }), null);
});

test('monitor step: only horizontal directions cross monitors', () => {
    assert.equal(m.focusMonitorStep({ dir: 'up', monitorIndex: 0, monitors }), null);
    assert.equal(m.focusMonitorStep({ dir: 'down', monitorIndex: 0, monitors }), null);
});

test('monitor step: stacked monitors share x, so left/right has no target', () => {
    const stacked = [{ index: 0, x: 0 }, { index: 1, x: 0 }];
    assert.equal(m.focusMonitorStep({ dir: 'right', monitorIndex: 0, monitors: stacked }), null);
    assert.equal(m.focusMonitorStep({ dir: 'left', monitorIndex: 0, monitors: stacked }), null);
});

test('monitor step: unknown monitor index', () => {
    assert.equal(m.focusMonitorStep({ dir: 'right', monitorIndex: 7, monitors }), null);
});

// A window on the target monitor, as the pick receives it.
const self = { x: 0, y: 100, width: 500, height: 300 };
const frames = [
    { index: 0, x: 5120, y: 0, width: 500, height: 600 },
    { index: 1, x: 5120, y: 700, width: 500, height: 300 },
];

test('monitor pick: entering from the left takes the leftmost window', () => {
    assert.equal(m.focusMonitorPick(frames, 'right', self), 0);
});

test('monitor pick: entering from the right takes the rightmost window', () => {
    const far = [
        { index: 0, x: 1000, y: 0, width: 500, height: 600 },
        { index: 1, x: 0, y: 0, width: 500, height: 600 },
    ];
    assert.equal(m.focusMonitorPick(far, 'left', self), 0);
});

test('monitor pick: vertical overlap with the focus frame wins among edge-tied windows', () => {
    // both windows share x = 5120; window 0 overlaps self.y=100..400, window 1 starts at 700
    assert.equal(m.focusMonitorPick(frames, 'right', self), 0);
    const lower = { x: 0, y: 750, width: 500, height: 200 };
    assert.equal(m.focusMonitorPick(frames, 'right', lower), 1);
});

test('monitor pick: no vertical overlap falls back to the topmost window', () => {
    assert.equal(m.focusMonitorPick(frames, 'right', { x: 0, y: 5000, width: 500, height: 100 }), 0);
});

test('monitor pick: horizontally adjacent windows tie on x, the topmost wins', () => {
    const wide = [
        { index: 0, x: 5120, y: 0, width: 250, height: 100 },
        { index: 1, x: 5120, y: 100, width: 250, height: 100 },
    ];
    assert.equal(m.focusMonitorPick(wide, 'right', { x: 0, y: 0, width: 100, height: 100 }), 0);
});

test('monitor pick: up/down never picks (monitors do not continue vertically)', () => {
    assert.equal(m.focusMonitorPick(frames, 'up', self), null);
    assert.equal(m.focusMonitorPick(frames, 'down', self), null);
});

test('monitor pick: empty target monitor', () => {
    assert.equal(m.focusMonitorPick([], 'right', self), null);
});

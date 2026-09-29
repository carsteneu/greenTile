'use strict';
// Tests the pure swap model of greenTile.js (marked block "swap-model"), extracted and
// evaluated without Cinnamon, like split-model and fill-model. Cells are rects
// [x, y, width, height] in placement order; dir is 'left'|'right'|'up'|'down'.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'greenTile.js'), 'utf8');
const match = src.match(/\/\/ >>> swap-model[^\n]*\n([\s\S]*?)\/\/ <<< swap-model/);
if (!match)
    throw new Error('swap-model block not found in greenTile.js');
const block = match[1];
const names = ['tile_swap_neighbor', 'tile_swap_landing_cell', 'tile_swap_chain_step'];
const m = new Function(block + '\nreturn {' + names.join(',') + '};')();

test('block is self-contained', () => {
    assert.doesNotMatch(block, /imports\.|tile_St|tile_Clutter|global\.|utils_Main|Meta\./);
});

// Equal 2x2 grid on 1000x600 (placement order: row by row).
const grid22 = [
    [0, 0, 500, 300], [500, 0, 500, 300],
    [0, 300, 500, 300], [500, 300, 500, 300],
];

test('neighbor: 2x2 grid in all directions', () => {
    assert.equal(m.tile_swap_neighbor(grid22, 0, 'right'), 1);
    assert.equal(m.tile_swap_neighbor(grid22, 1, 'left'), 0);
    assert.equal(m.tile_swap_neighbor(grid22, 0, 'down'), 2);
    assert.equal(m.tile_swap_neighbor(grid22, 2, 'up'), 0);
    assert.equal(m.tile_swap_neighbor(grid22, 0, 'up'), null);
    assert.equal(m.tile_swap_neighbor(grid22, 0, 'left'), null);
    assert.equal(m.tile_swap_neighbor(grid22, 3, 'down'), null);
    assert.equal(m.tile_swap_neighbor(grid22, 3, 'right'), null);
    assert.equal(m.tile_swap_neighbor([grid22[0]], 0, 'right'), null);
});

// cols [2,3]: two windows on the left, three on the right (unequal heights).
const cols23 = [
    [0, 0, 500, 300], [0, 300, 500, 300],
    [500, 0, 500, 200], [500, 200, 500, 200], [500, 400, 500, 200],
];

test('neighbor: best perpendicular overlap wins at equal distance', () => {
    // right from the top-left cell: both right cells overlap, the top one more
    assert.equal(m.tile_swap_neighbor(cols23, 0, 'right'), 2);
    // right from the bottom-left cell: the bottom-right cell overlaps most
    assert.equal(m.tile_swap_neighbor(cols23, 1, 'right'), 4);
    // up/down inside a column
    assert.equal(m.tile_swap_neighbor(cols23, 0, 'down'), 1);
    assert.equal(m.tile_swap_neighbor(cols23, 1, 'up'), 0);
    assert.equal(m.tile_swap_neighbor(cols23, 2, 'down'), 3);
    assert.equal(m.tile_swap_neighbor(cols23, 4, 'up'), 3);
});

test('neighbor: no perpendicular overlap falls back to the nearest in direction', () => {
    const cells = [
        [0, 0, 500, 300],      // self
        [500, 700, 500, 300],  // only cell to the right, no vertical overlap at all
    ];
    assert.equal(m.tile_swap_neighbor(cells, 0, 'right'), 1);
    // left from top-left cell of cols23: no column to the left
    assert.equal(m.tile_swap_neighbor(cols23, 0, 'left'), null);
});

// rows [1,2]: one full-width row, then two half-width windows.
const rows12 = [
    [0, 0, 1000, 300],
    [0, 300, 500, 300], [500, 300, 500, 300],
];

test('neighbor: rows layout left/right and up', () => {
    assert.equal(m.tile_swap_neighbor(rows12, 1, 'right'), 2);
    assert.equal(m.tile_swap_neighbor(rows12, 2, 'left'), 1);
    assert.equal(m.tile_swap_neighbor(rows12, 0, 'down'), 1);
});

test('neighbor: invalid dir and out-of-range self', () => {
    assert.equal(m.tile_swap_neighbor(grid22, 0, 'sideways'), null);
    assert.equal(m.tile_swap_neighbor(grid22, 99, 'right'), null);
});

test('landing: edge column, then best vertical overlap with the window frame', () => {
    // right lands in the leftmost column: frame overlapping the bottom cell picks it
    assert.equal(m.tile_swap_landing_cell(cols23, [600, 500, 200, 100], 'right'), 1);
    assert.equal(m.tile_swap_landing_cell(cols23, [600, 0, 200, 200], 'right'), 0);
    // no overlap at all: top cell wins
    assert.equal(m.tile_swap_landing_cell(cols23, [600, 1200, 100, 100], 'right'), 0);
    // left lands in the rightmost column: three cells stacked
    assert.equal(m.tile_swap_landing_cell(cols23, [100, 500, 100, 100], 'left'), 4);
    assert.equal(m.tile_swap_landing_cell(cols23, [100, 100, 100, 100], 'left'), 2);
    assert.equal(m.tile_swap_landing_cell(cols23, [0, 900, 100, 100], 'left'), 2);
    assert.equal(m.tile_swap_landing_cell([], [0, 0, 1, 1], 'right'), null);
});

const monitors3 = [
    { index: 2, x: 1920, width: 1920 },
    { index: 0, x: 0, width: 1920 },
    { index: 1, x: 3840, width: 1920 },
];

const chain = (dir, monitorIndex, extra) => m.tile_swap_chain_step(Object.assign({
    dir: dir, monitorIndex: monitorIndex, primaryIndex: 0, onlyPrimary: false,
    monitors: monitors3, workspaces: 13, wsIndex: 4,
}, extra || {}));

test('chain: monitor steps along the x-ordered monitor chain', () => {
    assert.deepEqual(chain('right', 0), { kind: 'monitor', to: 2, slot: 'first' });
    assert.deepEqual(chain('right', 2), { kind: 'monitor', to: 1, slot: 'first' });
    assert.deepEqual(chain('left', 1), { kind: 'monitor', to: 2, slot: 'last' });
    assert.deepEqual(chain('left', 2), { kind: 'monitor', to: 0, slot: 'last' });
});

test('chain: workspace step at the monitor chain ends', () => {
    // right past the rightmost monitor: next workspace, first slot of the leftmost monitor
    assert.deepEqual(chain('right', 1), { kind: 'workspace', delta: 1, monitor: 0, slot: 'first' });
    // left past the leftmost monitor: previous workspace, last slot of the rightmost monitor
    assert.deepEqual(chain('left', 0), { kind: 'workspace', delta: -1, monitor: 1, slot: 'last' });
});

test('chain: no wrap at the first and last workspace', () => {
    assert.deepEqual(chain('left', 0, { wsIndex: 0 }), null);
    assert.deepEqual(chain('right', 1, { wsIndex: 12 }), null);
    // monitor steps do not depend on the workspace bounds
    assert.deepEqual(chain('right', 0, { wsIndex: 12 }), { kind: 'monitor', to: 2, slot: 'first' });
});

test('chain: workspaces-only-on-primary anchors workspace steps on the primary monitor', () => {
    // monitor 1 is the primary monitor in this scenario
    assert.deepEqual(chain('right', 1, { onlyPrimary: true, monitorIndex: 1, primaryIndex: 1 }),
        { kind: 'workspace', delta: 1, monitor: 0, slot: 'first' });
    // from a non-primary monitor at the chain end there is no workspace step
    assert.deepEqual(chain('right', 1, { onlyPrimary: true }), null);
    assert.deepEqual(chain('left', 0, { onlyPrimary: true, primaryIndex: 2 }), null);
    // monitor steps are unaffected
    assert.deepEqual(chain('right', 0, { onlyPrimary: true }), { kind: 'monitor', to: 2, slot: 'first' });
});

test('chain: up/down never chain across monitors or workspaces', () => {
    assert.equal(chain('up', 1), null);
    assert.equal(chain('down', 0), null);
});

test('chain: unknown monitor yields no step', () => {
    assert.deepEqual(chain('right', 9), null);
});

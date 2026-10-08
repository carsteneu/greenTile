'use strict';
// Tests the single-window mode model (lib/model/single.js), cross-checking the
// fallback layouts against the split-model geometry. The settings select
// "A single window" (default "center" for fresh installs) decides what happens
// to a lone tiled window: leave it untouched, fill the monitor, or place it
// centered (golden-ratio width, 90 % height, equal margins).
const test = require('node:test');
const assert = require('node:assert/strict');

const load = require('../helpers/cinnamon-loader').load;
const m = load('./lib/model/single.js');
const split = load('./lib/model/split.js');
const gap = load('./lib/model/gap.js');

test('singleMode normalises the stored select value, unknown reads as leave', () => {
    assert.equal(m.singleMode('leave'), 'leave');
    assert.equal(m.singleMode('fill'), 'fill');
    assert.equal(m.singleMode('center'), 'center');
});

test('singleMode falls back to leave for anything that is not a known mode', () => {
    for (const raw of [undefined, null, '', 'yes', true, false, 0, 1, {}, [], 'Leave untouched', 'Custom']) {
        assert.equal(m.singleMode(raw), 'leave', 'raw=' + JSON.stringify(raw));
    }
});

test('singleActive places a window only for a lone one, and never on leave', () => {
    assert.equal(m.singleActive('fill', 1), true);
    assert.equal(m.singleActive('center', 1), true);
    assert.equal(m.singleActive('leave', 1), false);
    assert.equal(m.singleActive(undefined, 1), false);
    assert.equal(m.singleActive(true, 1), false);
    for (const mode of ['leave', 'fill', 'center']) {
        assert.equal(m.singleActive(mode, 0), false, mode + ' n=0');
        assert.equal(m.singleActive(mode, 2), false, mode + ' n=2');
        assert.equal(m.singleActive(mode, 7), false, mode + ' n=7');
    }
});

// A window the user maximized (both directions) or put fullscreen is their own
// full-area placement: the mode must not unmaximize it to re-place it. Only a
// lone window counts, and only a placing mode (leave is already a no-op).
test('singleLeavesMaximized leaves a maximized or fullscreen lone window alone', () => {
    for (const mode of ['center', 'fill']) {
        assert.equal(m.singleLeavesMaximized(mode, 1, true), true, mode + ' n=1 maximized');
        assert.equal(m.singleLeavesMaximized(mode, 1, false), false, mode + ' n=1 plain');
        assert.equal(m.singleLeavesMaximized(mode, 0, true), false, mode + ' n=0');
        assert.equal(m.singleLeavesMaximized(mode, 2, true), false, mode + ' n=2');
        assert.equal(m.singleLeavesMaximized(mode, 7, true), false, mode + ' n=7');
    }
    assert.equal(m.singleLeavesMaximized('leave', 1, true), false, 'leave places nothing anyway');
    assert.equal(m.singleLeavesMaximized(undefined, 1, true), false, 'unknown mode reads as leave');
});

test('fallback layout is a single full-area row cell', () => {
    assert.deepEqual(m.singleLayout, { kind: 'rows', shape: [1] });
    const area = [0, 0, 1920, 1080];
    assert.deepEqual(
        split.splitRects(m.singleLayout.kind, m.singleLayout.shape, null, area),
        [area]
    );
});

test('full-area cell is flush with the screen edges (no gap on outer edges)', () => {
    const area = [100, 80, 1280, 720];
    assert.deepEqual(
        split.splitRects(m.singleLayout.kind, m.singleLayout.shape, null, area),
        [[100, 80, 1280, 720]]
    );
});

// ---------------- centered frame (option "center") ----------------

test('the centered frame is golden-ratio wide, 90 % high and centered', () => {
    // 5120 * 0.6180339887 = 3164.33 -> 3164; 1400 * 0.9 = 1260;
    // margins (5120-3164)/2 = 978 and (1400-1260)/2 = 70, both exact.
    assert.deepEqual(m.singleCenterRect([0, 0, 5120, 1400]), [978, 70, 3164, 1260]);
    // 1920 * 0.6180339887 = 1186.63 -> 1187; (1920-1187)/2 = 366.5 -> floor 366.
    assert.deepEqual(m.singleCenterRect([0, 0, 1920, 1040]), [366, 52, 1187, 936]);
    assert.deepEqual(m.singleCenterRect([0, 0, 2000, 1100]), [382, 55, 1236, 990]);
});

test('the centered frame respects the usable-area origin (panels, other monitors)', () => {
    assert.deepEqual(m.singleCenterRect([100, 40, 1920, 1040]), [466, 92, 1187, 936]);
});

test('the centered frame never leaves the usable area', () => {
    for (const area of [[0, 0, 1920, 1040], [0, 0, 1921, 1041], [37, 11, 1234, 777], [0, 0, 640, 480], [0, 0, 1024, 768]]) {
        const [x, y, w, h] = m.singleCenterRect(area);
        assert.ok(w > 0 && h > 0, 'size ' + JSON.stringify([w, h]));
        assert.ok(x >= area[0] && y >= area[1], 'origin inside ' + JSON.stringify(area));
        assert.ok(x + w <= area[0] + area[2] && y + h <= area[1] + area[3], 'inside ' + JSON.stringify(area));
    }
});

test('the layout compensates the window gap so the placed frame stays the golden one', () => {
    for (const area of [[0, 0, 2000, 1100], [0, 0, 1920, 1040], [100, 40, 1920, 1040], [0, 0, 5120, 1400]]) {
        for (const g of [0, 2, 8, 48]) {
            const layout = m.singleCenterLayout(area, g);
            assert.equal(layout.kind, 'rows');
            assert.deepEqual(layout.shape, [1]);
            assert.deepEqual(gap.gapCell(layout.area, area, g), m.singleCenterRect(area),
                'area=' + JSON.stringify(area) + ' gap=' + g);
        }
    }
});

test('singleBase picks the centered layout for center and the full area otherwise', () => {
    const area = [0, 0, 2000, 1100];
    assert.equal(m.singleBase('fill', area, 8), m.singleLayout);
    assert.equal(m.singleBase('leave', area, 8), m.singleLayout);
    assert.deepEqual(m.singleBase('center', area, 0), { kind: 'rows', shape: [1], area: [382, 55, 1236, 990] });
});

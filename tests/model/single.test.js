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
    // 5120 * 0.6180339887 = 3164.33 -> 3164, held at the 1600 ceiling; 1400 * 0.9 = 1260;
    // margins (5120-1600)/2 = 1760 and (1400-1260)/2 = 70, both exact.
    assert.deepEqual(m.singleCenterRect([0, 0, 5120, 1400]), [1760, 70, 1600, 1260]);
    // 1920 * 0.6180339887 = 1186.63 -> 1187; (1920-1187)/2 = 366.5 -> floor 366.
    assert.deepEqual(m.singleCenterRect([0, 0, 1920, 1040]), [366, 52, 1187, 936]);
    assert.deepEqual(m.singleCenterRect([0, 0, 2000, 1100]), [382, 55, 1236, 990]);
});

// The frame is a share of the width, so it grows with the monitor: on a very
// wide screen the golden frame passes 1600 px and the window becomes a wall of
// text. 1600 is the product decision — it leaves every usable width up to
// 2560 px untouched (laptops, most desktops) and is a width text still reads
// without the eye wandering between lines. The number is hard-coded on purpose:
// a setting would put a UI on a detail, and changing it again should be a
// reasoned change, not a slider.
test('the centered frame never grows wider than 1600 px', () => {
    for (const [area, want] of [
        // 3440 * 0.618 = 2126 -> capped; (3440 - 1600)/2 = 920.
        [[0, 0, 3440, 1440], [920, 72, 1600, 1296]],
        [[0, 0, 3840, 1080], [1120, 54, 1600, 972]],
        [[0, 0, 5120, 1400], [1760, 70, 1600, 1260]],
        // An area already inset by the screen-edge setting (12 px each side):
        // the cap holds for that smaller area, and the frame stays centred in it.
        [[12, 12, 5096, 1376], [1760, 81, 1600, 1238]],
    ]) {
        assert.deepEqual(m.singleCenterRect(area), want, 'area=' + JSON.stringify(area));
    }
});

test('the cap binds from a usable width of 2590 px, not below it', () => {
    // 2589 * 0.6180339887 = 1600.09 -> 1600 either way: the cap changes nothing yet.
    assert.deepEqual(m.singleCenterRect([0, 0, 2589, 1040]), [494, 52, 1600, 936], 'just below the cap');
    // 2590 * 0.6180339887 = 1600.708 -> 1601 without the cap; the cap pulls it to 1600.
    assert.deepEqual(m.singleCenterRect([0, 0, 2590, 1040]), [495, 52, 1600, 936], 'first width the cap binds');
});

test('the cap leaves the golden ratio alone on a 2560 px area', () => {
    // The widest monitor the number is chosen to leave untouched.
    assert.deepEqual(m.singleCenterRect([0, 0, 2560, 1040]), [489, 52, 1582, 936]);
});

test('the capped frame stays centred on its axis', () => {
    // An odd difference is where the floored offset shows: (3841-1600)/2 = 1120.5.
    // Rounding up or to nearest would put the frame one pixel right of centre.
    assert.deepEqual(m.singleCenterRect([0, 0, 3841, 1080]), [1120, 54, 1600, 972], 'odd margin floors to the left');
    // And the same on the vertical axis, which no other row pins: (1030-927)/2 = 51.5.
    assert.deepEqual(m.singleCenterRect([0, 0, 1920, 1030]), [366, 51, 1187, 927], 'odd vertical margin floors');
    for (const area of [[0, 0, 3440, 1440], [0, 0, 3840, 1080], [0, 0, 5120, 1400], [100, 40, 5120, 1400]]) {
        const [x, , w] = m.singleCenterRect(area);
        const left = x - area[0];
        const right = area[0] + area[2] - (x + w);
        assert.ok(right - left === 0 || right - left === 1,
            'margins differ by at most one pixel: ' + JSON.stringify(area) + ' left=' + left + ' right=' + right);
    }
});

// A capped frame leaves much larger margins than the golden one, so the outset
// singleCenterLayout adds for the gap must still be cancelled exactly. (The
// existing gap test below already covers 5120: its expected value comes from
// singleCenterRect, so it tracks the ceiling on its own.)
test('the gap compensation still lands on the capped frame at other wide sizes', () => {
    for (const area of [[0, 0, 3440, 1440], [12, 12, 5096, 1376]]) {
        for (const g of [0, 2, 8, 48]) {
            const layout = m.singleCenterLayout(area, g);
            assert.deepEqual(gap.gapCell(layout.area, area, g), m.singleCenterRect(area),
                'area=' + JSON.stringify(area) + ' gap=' + g);
        }
    }
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

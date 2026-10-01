/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * split model over pure data (no Cinnamon imports).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

// Movable borders of a filled layout, stored as fractions (setting layouts, field
// "splits", keyed by window count). kind "cols": columns (major, along x) with stacked
// cells (minor, along y) — presets and the narrow auto grid; kind "rows": rows (major,
// along y) with cells side by side (minor, along x) — the wide auto grid. A split is
// { kind, shape, major: [fractions], minor: [[fractions] per column/row] }.

/** Minimum width/height of a cell between two movable borders, in px. */
const SPLIT_MIN_PX = 120;
/** Maximum extra px a resize hotkey gains per detected key repeat. */
const SPLIT_STEP_MAX = 64;
/**
 * Equal split for a shape: every part gets the same fraction.
 * @param {'cols'|'rows'} kind
 * @param {readonly number[]} shape
 * @returns {Split}
 */
const splitEqual = (kind, shape) => ({
    kind: kind,
    shape: shape.slice(),
    major: shape.map(() => 1 / shape.length),
    minor: shape.map((k) => {
        const parts = [];
        for (let i = 0; i < k; i++) {
            parts.push(1 / k);
        }
        return parts;
    }),
});
/**
 * Normalised copy of the fractions when they are len positive finite numbers summing
 * to ~1, otherwise null.
 * @param {any} parts raw stored fractions, validated here
 * @param {number} len expected part count
 * @returns {number[] | null}
 */
const splitNorm = (parts, len) => {
    if (!Array.isArray(parts) || parts.length !== len) {
        return null;
    }
    if (!parts.every((/** @type {number} */ v) => typeof v === 'number' && Number.isFinite(v) && v > 0)) {
        return null;
    }
    const sum = parts.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0);
    if (Math.abs(sum - 1) > 0.02) {
        return null;
    }
    return parts.map((v) => v / sum);
};
/**
 * Normalised copy of a stored split when it fits (kind, shape), otherwise null.
 * @param {'cols'|'rows'} kind
 * @param {readonly number[]} shape
 * @param {any} split raw stored split, validated here
 * @returns {Split | null}
 */
const splitValid = (kind, shape, split) => {
    if (split == null || typeof split !== 'object' || split.kind !== kind) {
        return null;
    }
    if (!Array.isArray(split.shape) || split.shape.length !== shape.length || split.shape.some((/** @type {number} */ v, /** @type {number} */ i) => v !== shape[i])) {
        return null;
    }
    const major = splitNorm(split.major, shape.length);
    if (!major || !Array.isArray(split.minor) || split.minor.length !== shape.length) {
        return null;
    }
    const minor = [];
    for (let i = 0; i < shape.length; i++) {
        const parts = splitNorm(split.minor[i], shape[i]);
        if (!parts) {
            return null;
        }
        minor.push(parts);
    }
    return { kind: kind, shape: shape.slice(), major: major, minor: minor };
};
/**
 * Positions and sizes of n parts along one axis. Without fractions this is the
 * equal division (start + i * len / n), so layouts without a split do not move
 * by a pixel.
 * @param {number[] | null} fractions
 * @param {number} n
 * @param {number} start
 * @param {number} len
 * @returns {Array<[number, number]>} [start, size] per part
 */
const splitParts = (fractions, n, start, len) => {
    /** @type {Array<[number, number]>} */
    const out = [];
    if (!fractions) {
        const size = len / n;
        for (let i = 0; i < n; i++) {
            out.push([start + i * size, size]);
        }
        return out;
    }
    let acc = 0;
    for (let i = 0; i < n; i++) {
        const from = start + len * acc;
        acc += fractions[i];
        const to = i === n - 1 ? start + len : start + len * acc;
        out.push([from, to - from]);
    }
    return out;
};
/**
 * Cell rectangles in placement order: cols column by column, top to bottom; rows row by
 * row, left to right.
 * @param {'cols'|'rows'} kind
 * @param {readonly number[]} shape
 * @param {Split | null} split
 * @param {Rect} area
 * @returns {Rect[]}
 */
const splitRects = (kind, shape, split, area) => {
    const [ax, ay, aw, ah] = area;
    /** @type {Rect[]} */
    const rects = [];
    const cols = kind === 'cols';
    const major = splitParts(split ? split.major : null, shape.length, cols ? ax : ay, cols ? aw : ah);
    for (let i = 0; i < shape.length; i++) {
        const minor = splitParts(split ? split.minor[i] : null, shape[i], cols ? ay : ax, cols ? ah : aw);
        for (const [pos, size] of minor) {
            rects.push(cols ? [major[i][0], pos, major[i][1], size] : [pos, major[i][0], size, major[i][1]]);
        }
    }
    return rects;
};
/**
 * Index of the cell whose centre lies nearest to the frame centre (placement order).
 * @param {Rect[]} rects
 * @param {Rect} frame
 * @returns {number} index or -1
 */
const splitCellAt = (rects, frame) => {
    const cx = frame[0] + frame[2] / 2;
    const cy = frame[1] + frame[3] / 2;
    let best = -1;
    let bestDist = Infinity;
    rects.forEach((r, i) => {
        const dx = r[0] + r[2] / 2 - cx;
        const dy = r[1] + r[3] / 2 - cy;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) {
            bestDist = dist;
            best = i;
        }
    });
    return best;
};
/**
 * Which stored border an edge of cell idx is: the border between part b and b + 1 of
 * split.major or split.minor[i] — or null when the edge lies on the monitor border.
 * @param {'cols'|'rows'} kind
 * @param {readonly number[]} shape
 * @param {number} idx cell index in placement order
 * @param {string} edge 'left' | 'right' | 'top' | 'bottom'
 * @returns {EdgeRef | null}
 */
const splitEdgeRef = (kind, shape, idx, edge) => {
    let i = 0;
    let j = idx;
    while (i < shape.length && j >= shape[i]) {
        j -= shape[i];
        i++;
    }
    if (idx < 0 || i >= shape.length) {
        return null;
    }
    const vertical = edge === 'left' || edge === 'right';
    const after = edge === 'right' || edge === 'bottom';
    if (!vertical && edge !== 'top' && edge !== 'bottom') {
        return null;
    }
    const onMajor = (kind === 'cols') === vertical;
    const index = onMajor ? i : j;
    const count = onMajor ? shape.length : shape[i];
    const b = after ? index : index - 1;
    if (b < 0 || b >= count - 1) {
        return null;
    }
    return { list: onMajor ? 'major' : 'minor', i: i, b: b };
};
/**
 * @param {'cols'|'rows'} kind
 * @param {readonly number[]} shape
 * @param {number} idx
 * @param {string} edge
 * @returns {boolean}
 */
const splitHasEdge = (kind, shape, idx, edge) => splitEdgeRef(kind, shape, idx, edge) !== null;
/**
 * Start/length pair of a split axis in screen coordinates.
 * @param {'cols'|'rows'} kind
 * @param {'major'|'minor'} list
 * @param {Rect} area
 * @returns {[number, number]}
 */
const splitAxis = (kind, list, area) => {
    const alongX = (kind === 'cols') === (list === 'major');
    return alongX ? [area[0], area[2]] : [area[1], area[3]];
};
/**
 * Screen coordinate of the stored border an edge of cell idx belongs to.
 * @param {'cols'|'rows'} kind
 * @param {readonly number[]} shape
 * @param {Split | null} split
 * @param {number} idx
 * @param {string} edge
 * @param {Rect} area
 * @returns {number | null}
 */
const splitBorderPos = (kind, shape, split, idx, edge, area) => {
    const ref = splitEdgeRef(kind, shape, idx, edge);
    if (!ref) {
        return null;
    }
    const s = split || splitEqual(kind, shape);
    const parts = ref.list === 'major' ? s.major : s.minor[ref.i];
    const [start, len] = splitAxis(kind, ref.list, area);
    const cells = splitParts(split ? parts : null, parts.length, start, len);
    return cells[ref.b][0] + cells[ref.b][1];
};
/**
 * New split with the given edge of cell idx moved to pos (screen coordinate). Only the
 * two parts next to the border change; both keep at least minPx. null when the edge has
 * no neighbour or the two parts have no room for two minimum sizes.
 * @param {'cols'|'rows'} kind
 * @param {readonly number[]} shape
 * @param {Split | null} split
 * @param {number} idx
 * @param {string} edge
 * @param {number} pos
 * @param {Rect} area
 * @param {number} minPx
 * @returns {Split | null}
 */
const splitMove = (kind, shape, split, idx, edge, pos, area, minPx) => {
    const ref = splitEdgeRef(kind, shape, idx, edge);
    if (!ref) {
        return null;
    }
    const next = split ? JSON.parse(JSON.stringify(split)) : splitEqual(kind, shape);
    const parts = ref.list === 'major' ? next.major : next.minor[ref.i];
    const [start, len] = splitAxis(kind, ref.list, area);
    let before = 0;
    for (let k = 0; k < ref.b; k++) {
        before += parts[k];
    }
    const p0 = start + len * before;
    const p2 = start + len * (before + parts[ref.b] + parts[ref.b + 1]);
    if (p2 - p0 < 2 * minPx) {
        return null;
    }
    const at = Math.min(Math.max(pos, p0 + minPx), p2 - minPx);
    parts[ref.b] = (at - p0) / len;
    parts[ref.b + 1] = (p2 - at) / len;
    return next;
};
/**
 * Hotkey action -> the edge to move and the direction (+1 = towards right/bottom).
 * The cell grows or shrinks at its right/bottom border; the last cell in that direction
 * uses its left/top border instead.
 * @param {'cols'|'rows'} kind
 * @param {readonly number[]} shape
 * @param {number} idx
 * @param {string} action 'wider' | 'narrower' | 'taller' | 'shorter'
 * @returns {{ edge: string, sign: number } | null}
 */
const splitKeyTarget = (kind, shape, idx, action) => {
    const options = /** @type {Array<[string, number]> | undefined} */ ({
        wider: [['right', 1], ['left', -1]],
        narrower: [['right', -1], ['left', 1]],
        taller: [['bottom', 1], ['top', -1]],
        shorter: [['bottom', -1], ['top', 1]],
    }[action]);
    if (!options) {
        return null;
    }
    for (const [edge, sign] of options) {
        if (splitHasEdge(kind, shape, idx, edge)) {
            return { edge: edge, sign: sign };
        }
    }
    return null;
};
/**
 * Step size for a resize hotkey. Cinnamon calls the hotkey again on key auto-repeat but
 * reports no release: a call of the same action within `threshold` ms (keyboard repeat
 * delay + margin) is a repeat and grows the step by 1 px up to SPLIT_STEP_MAX.
 * @param {AccelState | null} state
 * @param {string} action
 * @param {number} now
 * @param {number} threshold
 * @returns {{ step: number, state: AccelState }}
 */
const splitAccel = (state, action, now, threshold) => {
    const repeat = state != null && state.action === action && now - state.last <= threshold;
    const step = repeat ? Math.min(SPLIT_STEP_MAX, state.step + 1) : 1;
    return { step: step, state: { action: action, last: now, step: step } };
};
/**
 * Muffin grab op name (e.g. RESIZING_NE) -> window edges that move (corners move two).
 * @param {string} name
 * @returns {string[]}
 */
const splitOpEdges = (name) => {
    const found = /RESIZING_([NS]?)([EW]?)$/.exec(String(name || ''));
    if (!found) {
        return [];
    }
    const edges = [];
    if (found[1]) {
        edges.push(found[1] === 'N' ? 'top' : 'bottom');
    }
    if (found[2]) {
        edges.push(found[2] === 'W' ? 'left' : 'right');
    }
    return edges;
};
/**
 * Edges that moved between the frame at grab start and at release (fallback when the
 * grab op does not name a direction, e.g. KEYBOARD_RESIZING_UNKNOWN). 1 px is noise.
 * @param {Rect} from
 * @param {Rect} to
 * @returns {string[]}
 */
const splitFrameEdges = (from, to) => {
    const edges = [];
    const moved = (/** @type {number} */ a, /** @type {number} */ b) => Math.abs(a - b) >= 2;
    if (moved(from[1], to[1])) {
        edges.push('top');
    }
    if (moved(from[1] + from[3], to[1] + to[3])) {
        edges.push('bottom');
    }
    if (moved(from[0], to[0])) {
        edges.push('left');
    }
    if (moved(from[0] + from[2], to[0] + to[2])) {
        edges.push('right');
    }
    return edges;
};
/**
 * Effective read-time geometry of one axis: raises every FINAL (post gapCell) part
 * size to minPx where feasible, otherwise distributes all remaining pixels as equal
 * shares (largest remainder). Nothing changes when the axis already keeps minPx —
 * the fractions of the caller are returned untouched (null). The gap loss per part
 * follows gapCell: the first part loses no leading inset, the last no trailing one,
 * every part in between the full gap (half at each border, rounding included).
 * @param {number[] | null} fractions
 * @param {number} count
 * @param {number} start
 * @param {number} len
 * @param {number} gap
 * @param {number} minPx
 * @returns {number[] | null} corrected fractions, or null when nothing changes
 */
/**
 * @param {number[] | null} fractions fractions of one axis (null = equal division)
 * @param {number} count
 * @param {number} start first px of the axis
 * @param {number} len px length of the axis
 * @param {number} gap window gap
 * @param {number} minPx promised minimum of a FINAL frame size
 * @returns {number[] | null} corrected fractions, or null when nothing changes
 */
const splitClampAxis = (fractions, count, start, len, gap, minPx) => {
    const lead = Math.floor(gap / 2);
    const trail = gap - lead;
    const parts = splitParts(fractions, count, start, len);
    const loss = parts.map((_p, i) => (i === 0 ? 0 : lead) + (i === count - 1 ? 0 : trail));
    const fin = parts.map((p, i) => Math.round(p[0] + p[1]) - Math.round(p[0]) - loss[i]);
    if (fin.every((f) => f >= minPx)) {
        return null;
    }
    const avail = len - loss.reduce((a, b) => a + b, 0);
    /** @type {number[]} */
    const next = [];
    if (avail < count * minPx) {
        // not enough for every part at minPx: equal shares for all (fair shortfall),
        // the px remainder goes to the first parts — deterministic, keeps tiling
        const base = Math.floor(avail / count);
        const rem = avail - base * count;
        next.push(...fin.map((_f, i) => base + (i < rem ? 1 : 0)));
    }
    else {
        // raise the parts below minPx, financed proportionally by the parts above it
        const need = fin.map((f) => Math.max(0, minPx - f));
        const surplus = fin.map((f) => Math.max(0, f - minPx));
        const totalNeed = need.reduce((a, b) => a + b, 0);
        const totalSurplus = surplus.reduce((a, b) => a + b, 0);
        const give = need.map((n, i) => (n > 0 ? 0 : Math.floor(totalNeed * surplus[i] / totalSurplus)));
        let given = give.reduce((a, b) => a + b, 0);
        /** @param {number} i */
        const fracGive = (i) => totalNeed * surplus[i] / totalSurplus - Math.floor(totalNeed * surplus[i] / totalSurplus);
        const order = fin.map((_f, i) => i).sort((a, b) =>
            (fracGive(b) - fracGive(a)) || (surplus[b] - surplus[a]) || (a - b));
        while (given < totalNeed) {
            for (const i of order) {
                if (given >= totalNeed) {
                    break;
                }
                if (give[i] < surplus[i]) {
                    give[i] += 1;
                    given += 1;
                }
            }
        }
        next.push(...fin.map((f, i) => f - give[i] + need[i]));
    }
    // pre-gap widths -> fractions; the edges (first from, last to) stay on the axis bounds
    return next.map((f, i) => (f + loss[i]) / len);
};

/**
 * Corrected copy of a stored split whose final (post gapCell) frames would fall
 * below minPx: legacy narrow borders, a raised gap or a shrunken usable area.
 * Stored and pending split values stay untouched — mounting this is the caller's
 * read-time view. Only when no axis needs a correction the input is passed through
 * unchanged (same reference, null for a null split).
 * @param {'cols'|'rows'} kind
 * @param {readonly number[]} shape
 * @param {Split | null} split stored or pending split (read-only)
 * @param {Rect} area usable area the layout is placed in
 * @param {number} gap window gap
 * @param {number} minPx promised minimum of a FINAL frame
 * @returns {Split | null}
 */
const splitMinimal = (kind, shape, split, area, gap, minPx) => {
    const cols = kind === 'cols';
    /**
     * @param {number[] | null} fracs
     * @param {number} cnt
     * @param {number} start
     * @param {number} len
     */
    const clamp = (fracs, cnt, start, len) => splitClampAxis(fracs, cnt, start, len, gap, minPx);
    const majorStart = cols ? area[0] : area[1];
    const majorLen = cols ? area[2] : area[3];
    const minorStart = cols ? area[1] : area[0];
    const minorLen = cols ? area[3] : area[2];
    const major = clamp(split ? split.major : null, shape.length, majorStart, majorLen);
    const minor = shape.map((k, i) => clamp(split ? split.minor[i] : null, k, minorStart, minorLen));
    if (major === null && minor.every((m) => m === null)) {
        return split;
    }
    const equal = splitEqual(kind, shape);
    return {
        kind: kind,
        shape: shape.slice(),
        major: major || (split ? split.major.slice() : equal.major),
        minor: shape.map((k, i) => minor[i] || (split ? split.minor[i].slice() : equal.minor[i])),
    };
};

/**
 * Reading order for a retile. rects[i] = [x, y, w, h] of window i; returns the indices in
 * placement order. Windows are grouped along the major axis (x for columns, y for rows)
 * by overlap: a window joins the current group when it overlaps the group's first window
 * by at least half the smaller extent. Groups follow each other by centre, inside a group
 * by the other axis. Tiled windows of one column (row) always share a group, whatever the
 * borders, so unequal splits and a dragged edge never move a window to another cell.
 * @param {Rect[]} rects
 * @param {boolean} columnMajor
 * @returns {number[]}
 */
const sortOrder = (rects, columnMajor) => {
    const p = columnMajor ? 0 : 1;
    const s = 1 - p;
    const items = rects.map((r, i) => ({ i: i, r: r, c: r[p] + r[p + 2] / 2 }));
    items.sort((a, b) => (a.c - b.c) || (a.r[s] - b.r[s]) || (a.i - b.i));
    /** @type {Array<{ anchor: Rect, items: SortItem[] }> } */
    const groups = [];
    for (const it of items) {
        const g = groups[groups.length - 1];
        if (g) {
            const a = g.anchor;
            const overlap = Math.min(a[p] + a[p + 2], it.r[p] + it.r[p + 2]) - Math.max(a[p], it.r[p]);
            if (overlap > 0 && overlap >= 0.5 * Math.min(a[p + 2], it.r[p + 2])) {
                g.items.push(it);
                continue;
            }
        }
        groups.push({ anchor: it.r, items: [it] });
    }
    const order = [];
    for (const g of groups) {
        g.items.sort((a, b) => (a.r[s] - b.r[s]) || (a.r[p] - b.r[p]) || (a.i - b.i));
        for (const it of g.items) {
            order.push(it.i);
        }
    }
    return order;
};

module.exports = {
    SPLIT_MIN_PX,
    SPLIT_STEP_MAX,
    splitEqual,
    splitNorm,
    splitValid,
    splitParts,
    splitRects,
    splitCellAt,
    splitEdgeRef,
    splitHasEdge,
    splitAxis,
    splitBorderPos,
    splitMove,
    splitKeyTarget,
    splitAccel,
    splitOpEdges,
    splitFrameEdges,
    splitMinimal,
    sortOrder,
};

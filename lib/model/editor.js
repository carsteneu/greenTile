/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * editor model over pure data (no Cinnamon imports).
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

// Preset editor model. A rule is {min, stacks}; stacks[i] = windows stacked in column i.
// The painter grid of the approved prototype has 6 columns and 4 rows.
const editorCols = 6;
const editorRows = 4;
const editorMinFloor = 2;
const editorMinCeiling = 50;
const editorClampInt = (v, lo, hi) => Math.min(Math.max(Math.floor(v), lo), hi);
const editorClamp = (stacks) => {
    const next = stacks.slice(0, editorCols).map((s) => editorClampInt(s, 1, editorRows));
    return next.length ? next : [1];
};
// Column `col` holds `row + 1` windows; missing columns up to `col` get the same value.
const editorPaint = (stacks, col, row) => {
    const c = editorClampInt(col, 0, editorCols - 1);
    const value = editorClampInt(row, 0, editorRows - 1) + 1;
    const next = stacks.slice(0, editorCols);
    while (next.length < c)
        next.push(value);
    next[c] = value;
    return next;
};
const editorPaintRange = (stacks, from, to, row) => {
    const a = editorClampInt(Math.min(from, to), 0, editorCols - 1);
    const b = editorClampInt(Math.max(from, to), 0, editorCols - 1);
    let next = stacks.slice();
    for (let c = a; c <= b; c++)
        next = editorPaint(next, c, row);
    return next;
};
const editorRemove = (stacks, col) => {
    const next = stacks.slice();
    if (next.length > 1 && col >= 0 && col < next.length)
        next.splice(col, 1);
    return next;
};
const editorSort = (rules) => rules.slice().sort((a, b) => a.min - b.min);
const editorAddRule = (rules) => {
    const sorted = editorSort(rules);
    const last = sorted[sorted.length - 1];
    if (!last)
        return { rules: [{ min: editorMinFloor, stacks: [1, 1] }], index: 0 };
    if (last.min >= editorMinCeiling)
        return { rules: sorted, index: sorted.length - 1 };
    return { rules: sorted.concat([{ min: last.min + 1, stacks: last.stacks.slice() }]), index: sorted.length };
};
const editorDeleteRule = (rules, index) => {
    if (rules.length <= 1 || index < 0 || index >= rules.length)
        return { rules: rules.slice(), index: editorClampInt(index, 0, Math.max(rules.length - 1, 0)) };
    const next = rules.slice();
    next.splice(index, 1);
    return { rules: next, index: Math.min(index, next.length - 1) };
};
// Moves the threshold of rule `index` by delta and skips values used by other rules.
const editorStepMin = (rules, index, delta) => {
    const used = rules.filter((r, i) => i !== index).map((r) => r.min);
    let min = rules[index].min + delta;
    while (used.indexOf(min) !== -1)
        min += delta;
    if (min < editorMinFloor || min > editorMinCeiling)
        return { rules: rules.slice(), index };
    const edited = { min, stacks: rules[index].stacks.slice() };
    const sorted = editorSort(rules.map((r, i) => (i === index ? edited : r)));
    return { rules: sorted, index: sorted.indexOf(edited) };
};
const editorValidate = (draft) => (String(draft.name || '').trim() ? null : 'name');
const editorNewId = (presets) => {
    let max = 0;
    for (const p of presets) {
        const found = /^p(\d+)$/.exec(String(p.id));
        if (found)
            max = Math.max(max, parseInt(found[1], 10));
    }
    return 'p' + (max + 1);
};
const editorCommit = (presets, preset) => {
    const i = presets.findIndex((p) => p.id === preset.id);
    if (i === -1)
        return presets.concat([preset]);
    const next = presets.slice();
    next[i] = preset;
    return next;
};
const editorDeletePreset = (presets, id) => presets.filter((p) => p.id !== id);

module.exports = {
    editorCols,
    editorRows,
    editorMinFloor,
    editorMinCeiling,
    editorClampInt,
    editorClamp,
    editorPaint,
    editorPaintRange,
    editorRemove,
    editorSort,
    editorAddRule,
    editorDeleteRule,
    editorStepMin,
    editorValidate,
    editorNewId,
    editorCommit,
    editorDeletePreset,
};

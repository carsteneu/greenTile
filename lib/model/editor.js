/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * editor model, extracted verbatim from the marked pure model block in
 * greenTile.js (no Cinnamon imports). Author of the model code: carsten_eu.
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

// Preset editor model. A rule is {min, stacks}; stacks[i] = windows stacked in column i.
// The painter grid of the approved prototype has 6 columns and 4 rows.
const tile_editor_cols = 6;
const tile_editor_rows = 4;
const tile_editor_min_floor = 2;
const tile_editor_min_ceiling = 50;
const tile_editor_clamp_int = (v, lo, hi) => Math.min(Math.max(Math.floor(v), lo), hi);
const tile_editor_clamp = (stacks) => {
    const next = stacks.slice(0, tile_editor_cols).map((s) => tile_editor_clamp_int(s, 1, tile_editor_rows));
    return next.length ? next : [1];
};
// Column `col` holds `row + 1` windows; missing columns up to `col` get the same value.
const tile_editor_paint = (stacks, col, row) => {
    const c = tile_editor_clamp_int(col, 0, tile_editor_cols - 1);
    const value = tile_editor_clamp_int(row, 0, tile_editor_rows - 1) + 1;
    const next = stacks.slice(0, tile_editor_cols);
    while (next.length < c)
        next.push(value);
    next[c] = value;
    return next;
};
const tile_editor_paint_range = (stacks, from, to, row) => {
    const a = tile_editor_clamp_int(Math.min(from, to), 0, tile_editor_cols - 1);
    const b = tile_editor_clamp_int(Math.max(from, to), 0, tile_editor_cols - 1);
    let next = stacks.slice();
    for (let c = a; c <= b; c++)
        next = tile_editor_paint(next, c, row);
    return next;
};
const tile_editor_remove = (stacks, col) => {
    const next = stacks.slice();
    if (next.length > 1 && col >= 0 && col < next.length)
        next.splice(col, 1);
    return next;
};
const tile_editor_sort = (rules) => rules.slice().sort((a, b) => a.min - b.min);
const tile_editor_add_rule = (rules) => {
    const sorted = tile_editor_sort(rules);
    const last = sorted[sorted.length - 1];
    if (!last)
        return { rules: [{ min: tile_editor_min_floor, stacks: [1, 1] }], index: 0 };
    if (last.min >= tile_editor_min_ceiling)
        return { rules: sorted, index: sorted.length - 1 };
    return { rules: sorted.concat([{ min: last.min + 1, stacks: last.stacks.slice() }]), index: sorted.length };
};
const tile_editor_delete_rule = (rules, index) => {
    if (rules.length <= 1 || index < 0 || index >= rules.length)
        return { rules: rules.slice(), index: tile_editor_clamp_int(index, 0, Math.max(rules.length - 1, 0)) };
    const next = rules.slice();
    next.splice(index, 1);
    return { rules: next, index: Math.min(index, next.length - 1) };
};
// Moves the threshold of rule `index` by delta and skips values used by other rules.
const tile_editor_step_min = (rules, index, delta) => {
    const used = rules.filter((r, i) => i !== index).map((r) => r.min);
    let min = rules[index].min + delta;
    while (used.indexOf(min) !== -1)
        min += delta;
    if (min < tile_editor_min_floor || min > tile_editor_min_ceiling)
        return { rules: rules.slice(), index };
    const edited = { min, stacks: rules[index].stacks.slice() };
    const sorted = tile_editor_sort(rules.map((r, i) => (i === index ? edited : r)));
    return { rules: sorted, index: sorted.indexOf(edited) };
};
const tile_editor_validate = (draft) => (String(draft.name || '').trim() ? null : 'name');
const tile_editor_new_id = (presets) => {
    let max = 0;
    for (const p of presets) {
        const found = /^p(\d+)$/.exec(String(p.id));
        if (found)
            max = Math.max(max, parseInt(found[1], 10));
    }
    return 'p' + (max + 1);
};
const tile_editor_commit = (presets, preset) => {
    const i = presets.findIndex((p) => p.id === preset.id);
    if (i === -1)
        return presets.concat([preset]);
    const next = presets.slice();
    next[i] = preset;
    return next;
};
const tile_editor_delete_preset = (presets, id) => presets.filter((p) => p.id !== id);

module.exports = {
    tile_editor_cols,
    tile_editor_rows,
    tile_editor_min_floor,
    tile_editor_min_ceiling,
    tile_editor_clamp_int,
    tile_editor_clamp,
    tile_editor_paint,
    tile_editor_paint_range,
    tile_editor_remove,
    tile_editor_sort,
    tile_editor_add_rule,
    tile_editor_delete_rule,
    tile_editor_step_min,
    tile_editor_validate,
    tile_editor_new_id,
    tile_editor_commit,
    tile_editor_delete_preset,
};

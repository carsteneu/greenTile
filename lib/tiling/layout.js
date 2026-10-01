/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * Layout resolution: per-workspace preset rules (stored in extension settings),
 * the automatic grid shapes and the dragged-shape override — the single place
 * that answers "which layout tiles n windows here".
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

const { tile_layouts_parse, tile_layouts_entry, tile_layouts_shapes, tile_layouts_set, tile_layouts_migrate, tile_layout_resolve } = require('./lib/model/layouts');
const { tile_fill_stacks, tile_auto_rows, tile_auto_narrow_stacks } = require('./lib/model/fill');
const { tile_single_fill, tile_single_layout } = require('./lib/model/single');

// Layout of the automatic grid for n windows. Below 2100 px monitor width, 4+ uniform
// columns get too narrow: 3 fixed columns with balanced stacks instead (kind "cols",
// tile_auto_narrow_stacks). Otherwise one row with one column per window up to 6, then
// the windows are spread evenly over full-width rows (kind "rows", tile_auto_rows).
const tile_auto_shape = (monitor, n) => (monitor.width < 2100 && n > 3)
    ? { kind: 'cols', shape: tile_auto_narrow_stacks(n) }
    : { kind: 'rows', shape: tile_auto_rows(n) };
// Per-workspace preset tiling: rules by window count, stored in extension settings
// (survives spice reinstalls — settings live in ~/.config/cinnamon/spices).
// Preset = {"id","name","rules":[{"min":2,"stacks":[1,1]},...]}; assignment map
// wsIndex -> preset id. Rule choice: last rule with min <= window count.
const tile_presets_read = (app) => {
    try {
        const v = JSON.parse(app.config.settings.getValue('presets') || '[]');
        return Array.isArray(v) ? v : [];
    }
    catch (e) {
        return [];
    }
};
const tile_layout_for = (app, monitorIndex, wsIndex) => {
    if (!app.monitors.ready || !app.monitors.keys[monitorIndex])
        return { preset: null, auto: false };
    const presets = tile_presets_read(app);
    const layouts = tile_layouts_parse(app.config.settings.getValue('layouts') || '');
    const entry = tile_layouts_entry(layouts, app.monitors.keys[monitorIndex], app.monitors.wsKey(monitorIndex, wsIndex), presets.map((p) => p.id));
    return {
        preset: entry.preset ? presets.find((p) => p.id === entry.preset) || null : null,
        auto: entry.auto,
    };
};
const tile_layout_set = (app, monitorIndex, wsIndex, patch) => {
    if (!app.monitors.ready || !app.monitors.keys[monitorIndex])
        return;
    const layouts = tile_layouts_parse(app.config.settings.getValue('layouts') || '');
    // Corrupt layouts are treated as empty on read; nothing is written (and the
    // old string is not silently replaced) until the setting itself is fixed.
    if (layouts === null) {
        if (!app.session.layoutsWriteGuardLogged) {
            app.session.layoutsWriteGuardLogged = true;
            global.log('greenTile layouts setting is corrupt, not writing it');
        }
        return;
    }
    const next = tile_layouts_set(layouts, app.monitors.keys[monitorIndex], app.monitors.wsKey(monitorIndex, wsIndex), patch);
    app.config.settings.setValue('layouts', JSON.stringify(next));
};
// Once: convert the old per-workspace keys into layouts entries of the monitor that is
// primary right now (the 5K monitor). layoutsMigrated keeps deleted layouts from coming
// back on the next start.
const tile_layouts_migrate_once = (app) => {
    const Main = imports.ui.main;
    if (app.config.settings.getValue('layoutsMigrated'))
        return;
    let wsPresets = {};
    try {
        wsPresets = JSON.parse(app.config.settings.getValue('wsPresets') || '{}');
    }
    catch (e) { /* old key unreadable — treated as empty */ }
    if (!wsPresets || typeof wsPresets !== 'object' || Array.isArray(wsPresets))
        wsPresets = {};
    const autoList = app.config.settings.getValue('autoWorkspaces');
    const hasOld = Object.keys(wsPresets).length > 0 || (Array.isArray(autoList) && autoList.length > 0);
    const layouts = tile_layouts_parse(app.config.settings.getValue('layouts') || '');
    if (layouts && Object.keys(layouts).length === 0 && hasOld) {
        const primaryIndex = Main.layoutManager.primaryIndex;
        const mkey = app.monitors.keys[primaryIndex] || '';
        if (mkey) {
            const migrated = tile_layouts_migrate(wsPresets, autoList, mkey);
            if (Object.keys(migrated).length > 0) {
                app.config.settings.setValue('layouts', JSON.stringify(migrated));
                global.log('greenTile migrated wsPresets/autoWorkspaces to layouts for monitor ' + mkey);
            }
        }
    }
    app.config.settings.setValue('layoutsMigrated', true);
};
const tile_presets_write = (app, presets) => {
    app.config.settings.setValue('presets', JSON.stringify(presets));
};
const tile_rules_pick = (rules, n) => {
    let match = null;
    for (const rule of rules) {
        if (n >= rule.min)
            match = rule;
    }
    return match;
};
// Layout greenTile tiles for n windows on this monitor and the given workspace: the
// preset rule filled to n (tile_fill_stacks), or the automatic grid — with a stored
// dragged shape (lib/model/drop.js) winning over both. null when nothing is tiled.
const tile_layout_shape_ws = (app, monitorIndex, wsIndex, n) => {
    const Main = imports.ui.main;
    const monitor = Main.layoutManager.monitors[monitorIndex];
    const single = tile_single_fill(app.config.settings.getValue('fillSingleWindow'), n);
    if (!monitor || (n < 2 && !single))
        return null;
    const layoutState = tile_layout_for(app, monitorIndex, wsIndex);
    let base = null;
    if (layoutState.preset) {
        const rule = tile_rules_pick(layoutState.preset.rules, n);
        if (rule && rule.stacks && rule.stacks.length !== 0)
            base = { kind: 'cols', shape: tile_fill_stacks(rule.stacks, n), rule: rule, preset: layoutState.preset };
        else if (single)
            base = tile_single_layout;
        else
            return null;
    } else if (layoutState.auto) {
        base = tile_auto_shape(monitor, n);
    }
    if (!base)
        return null;
    // A dragged shape for this monitor + workspace + window count wins over the
    // preset rule / auto grid; corrupt layouts read as empty ({}), so nothing stored.
    const ref = app.split.ref(app, monitorIndex, wsIndex, n);
    if (!ref)
        return base;
    const layouts = tile_layouts_parse(app.config.settings.getValue('layouts') || '');
    return tile_layout_resolve(base, tile_layouts_shapes(layouts, ref.mkey, ref.wskey)[ref.n], n);
};
// Layout for the active workspace.
const tile_layout_shape = (app, monitorIndex, n) => tile_layout_shape_ws(app, monitorIndex, global.workspace_manager.get_active_workspace().index(), n);

module.exports = { tile_presets_read, tile_presets_write, tile_layout_for, tile_layout_set, tile_layouts_migrate_once, tile_rules_pick, tile_auto_shape, tile_layout_shape_ws, tile_layout_shape };

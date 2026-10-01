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

const { layoutsParse, layoutsEntry, layoutsShapes, layoutsSet, layoutResolve } = require('./lib/model/layouts');
const { fillStacks, autoRows, autoNarrowStacks } = require('./lib/model/fill');
const { singleFill, singleLayout } = require('./lib/model/single');
const { SETTINGS_KEYS } = require('./lib/model/settings-keys');
const { editorCols, editorRows, editorMinFloor, editorMinCeiling } = require('./lib/model/editor');

// Layout of the automatic grid for n windows. Below 2100 px monitor width, 4+ uniform
// columns get too narrow: 3 fixed columns with balanced stacks instead (kind "cols",
// autoNarrowStacks). Otherwise one row with one column per window up to 6, then
// the windows are spread evenly over full-width rows (kind "rows", autoRows).
/**
 * @param {CinnamonMonitor} monitor
 * @param {number} n
 * @returns {DragLayout}
 */
const autoShape = (monitor, n) => (monitor.width < 2100 && n > 3)
    ? { kind: 'cols', shape: autoNarrowStacks(n) }
    : { kind: 'rows', shape: autoRows(n) };
// Per-workspace preset tiling: rules by window count, stored in extension settings
// (survives spice reinstalls — settings live in ~/.config/cinnamon/spices).
// Preset = {"id","name","rules":[{"min":2,"stacks":[1,1]},...]}; assignment map
// wsIndex -> preset id. Rule choice: last rule with min <= window count.
/**
 * A rule read from the corruptible settings data: thresholds clamp into the
 * editor range, stack values into the editor grid, rules without a finite
 * threshold drop. Returns null for rules past repair.
 * @param {any} rule
 * @returns {Rule | null}
 */
const ruleClean = (rule) => {
    if (!rule || typeof rule !== 'object') {
        return null;
    }
    const min = Math.floor(Number(rule.min));
    if (!Number.isFinite(min)) {
        return null;
    }
    const stacks = Array.isArray(rule.stacks)
        ? rule.stacks.slice(0, editorCols).map((/** @type {any} */ s) => {
            const v = Math.floor(Number(s));
            return Number.isFinite(v) && v >= 1 ? Math.min(v, editorRows) : 1;
        })
        : [];
    return { min: Math.min(Math.max(min, editorMinFloor), editorMinCeiling), stacks };
};
/**
 * A preset read from the corruptible settings data: only entries with an id
 * survive (the assignment map keys on it), names and rules read as typed.
 * Returns null for entries beyond repair.
 * @param {any} preset
 * @returns {Preset | null}
 */
const presetClean = (preset) => {
    if (!preset || typeof preset !== 'object' || typeof preset.id !== 'string' || !preset.id) {
        return null;
    }
    return {
        id: preset.id,
        name: typeof preset.name === 'string' ? preset.name : '',
        rules: Array.isArray(preset.rules) ? preset.rules.map(ruleClean).filter((/** @type {Rule | null} */ r) => r !== null) : [],
    };
};
/**
 * Presets validate at read time — corrupt settings data (external edit,
 * backup restore) can no longer throw exceptions or hang computations, and
 * the file is never rewritten as a side effect of reading (preset writes
 * stay editor-driven).
 * @param {AppFacade} app
 * @returns {Preset[]}
 */
const presetsRead = (app) => {
    try {
        const v = JSON.parse(app.config.settings.getValue(SETTINGS_KEYS.presets) || '[]');
        return Array.isArray(v) ? v.map(presetClean).filter((/** @type {Preset | null} */ p) => p !== null) : [];
    }
    catch (_e) {
        return [];
    }
};
/**
 * @param {AppFacade} app
 * @param {number} monitorIndex
 * @param {number} wsIndex
 * @returns {{ preset: Preset | null, auto: boolean }}
 */
const layoutFor = (app, monitorIndex, wsIndex) => {
    if (!app.monitors.ready || !app.monitors.keys[monitorIndex]) {
        return { preset: null, auto: false };
    }
    const presets = presetsRead(app);
    const layouts = layoutsParse(app.config.settings.getValue(SETTINGS_KEYS.layouts) || '');
    const entry = layoutsEntry(layouts, app.monitors.keys[monitorIndex], app.monitors.wsKey(monitorIndex, wsIndex), presets.map((p) => p.id));
    return {
        preset: entry.preset ? presets.find((p) => p.id === entry.preset) || null : null,
        auto: entry.auto,
    };
};
/**
 * @param {AppFacade} app
 * @param {number} monitorIndex
 * @param {number} wsIndex
 * @param {{}} patch
 */
const layoutSet = (app, monitorIndex, wsIndex, patch) => {
    if (!app.monitors.ready || !app.monitors.keys[monitorIndex]) {
        return;
    }
    const layouts = layoutsParse(app.config.settings.getValue(SETTINGS_KEYS.layouts) || '');
    // Corrupt layouts are treated as empty on read; nothing is written (and the
    // old string is not silently replaced) until the setting itself is fixed.
    if (layouts === null) {
        if (!app.session.layoutsWriteGuardLogged) {
            app.session.layoutsWriteGuardLogged = true;
            global.log('greenTile layouts setting is corrupt, not writing it');
        }
        return;
    }
    const next = layoutsSet(layouts, app.monitors.keys[monitorIndex], app.monitors.wsKey(monitorIndex, wsIndex), patch);
    app.config.settings.setValue(SETTINGS_KEYS.layouts, JSON.stringify(next));
};
/**
 * @param {AppFacade} app
 * @param {Preset[]} presets
 */
const presetsWrite = (app, presets) => {
    app.config.settings.setValue(SETTINGS_KEYS.presets, JSON.stringify(presets));
};
/**
 * @param {Rule[]} rules
 * @param {number} n
 * @returns {Rule | null}
 */
const rulesPick = (rules, n) => {
    let match = null;
    for (const rule of rules) {
        if (n >= rule.min) {
            match = rule;
        }
    }
    return match;
};
// Layout greenTile tiles for n windows on this monitor and the given workspace: the
// preset rule filled to n (fillStacks), or the automatic grid — with a stored
// dragged shape (lib/model/drop.js) winning over both. null when nothing is tiled.
/**
 * @param {AppFacade} app
 * @param {number} monitorIndex
 * @param {number} wsIndex
 * @param {number} n
 * @returns {DragLayout | null}
 */
const layoutShapeWs = (app, monitorIndex, wsIndex, n) => {
    const Main = imports.ui.main;
    const monitor = Main.layoutManager.monitors[monitorIndex];
    const single = singleFill(app.config.settings.getValue(SETTINGS_KEYS.fillSingleWindow), n);
    if (!monitor || (n < 2 && !single)) {
        return null;
    }
    const layoutState = layoutFor(app, monitorIndex, wsIndex);
    // Paused monitor-workspaces (auto off) accept no placement at all: swap and the
    // dnd preview/placement routes read their shape here, free OS drags stay untouched.
    if (!layoutState.auto) {
        return null;
    }
    /** @type {DragLayout | null} */
    let base = null;
    if (layoutState.preset) {
        const rule = rulesPick(layoutState.preset.rules, n);
        if (rule && rule.stacks && rule.stacks.length !== 0) {
            base = { kind: 'cols', shape: fillStacks(rule.stacks, n), rule: rule, preset: layoutState.preset };
        }
        else if (single) {
            base = singleLayout;
        }
        else {
            return null;
        }
    } else if (layoutState.auto) {
        base = autoShape(monitor, n);
    }
    if (!base) {
        return null;
    }
    // A dragged shape for this monitor + workspace + window count wins over the
    // preset rule / auto grid; corrupt layouts read as empty ({}), so nothing stored.
    const ref = app.split.ref(app, monitorIndex, wsIndex, n);
    if (!ref) {
        return base;
    }
    const layouts = layoutsParse(app.config.settings.getValue(SETTINGS_KEYS.layouts) || '');
    return layoutResolve(base, layoutsShapes(layouts, ref.mkey, ref.wskey)[ref.n], n);
};
// Layout for the active workspace.
/**
 * @param {AppFacade} app
 * @param {number} monitorIndex
 * @param {number} n
 * @returns {DragLayout | null}
 */
const layoutShape = (app, monitorIndex, n) => layoutShapeWs(app, monitorIndex, global.workspace_manager.get_active_workspace().index(), n);

module.exports = { presetsRead, presetsWrite, layoutFor, layoutSet, rulesPick, autoShape, layoutShapeWs, layoutShape };

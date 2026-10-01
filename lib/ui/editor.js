/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * Preset panel view 2 (the editor), moved verbatim from greenTile.js. Module
 * boundary only: widget tree, strings and event handling are unchanged. The
 * tiling functions live in lib/tiling and reach the UI through the explicit
 * frozen ops facade on the App (app.ops) — lib/ui requires lib/app only for
 * the settings-keys constants.
 *
 * Copyright (C) 2026 carsten_eu
 *
 * Licensed under the GNU General Public License version 3, see LICENSE.
 * SPDX-License-Identifier: GPL-3.0-only
 */

// Cinnamon imports are read lazily inside every function on purpose, like
// lib/runtime's injected deps: a module top-level alias would bind to whatever
// `imports` was live at first load, and the Node tests re-evaluate the entry
// per fresh fake environment against a cached require graph.
const { tile_editor_cols, tile_editor_rows, tile_editor_min_floor, tile_editor_clamp, tile_editor_paint, tile_editor_paint_range, tile_editor_remove, tile_editor_sort, tile_editor_add_rule, tile_editor_delete_rule, tile_editor_step_min, tile_editor_validate, tile_editor_new_id, tile_editor_commit, tile_editor_delete_preset } = require('./lib/model/editor');
const { tile_layouts_parse, tile_layouts_remove_preset } = require('./lib/model/layouts');
const { tile_panel_round_rect, tile_panel_thumb, tile_panel_middle } = require('./lib/ui/draw');
const { _ } = require('./lib/ui/i18n');
const { SETTINGS_KEYS } = require('./lib/model/settings-keys');

const tile_editor_open = (app, preset) => {
    const { rulesPick: tile_rules_pick, windowCount: tile_panel_window_count, rebuild: tile_panel_rebuild } = app.ops;
    const rules = tile_editor_sort((preset.rules || []).map((r) => ({ min: r.min, stacks: tile_editor_clamp(r.stacks || []) })));
    if (rules.length === 0)
        rules.push({ min: tile_editor_min_floor, stacks: [1, 1] });
    // Start on the rule a click in view 1 would apply right now
    const pick = tile_rules_pick(rules, tile_panel_window_count(app));
    app.panel.draft = { id: preset.id, name: preset.name || '', rules, index: Math.max(rules.indexOf(pick), 0), isNew: !!preset.isNew };
    app.panel.view = 'editor';
    app.panel.guard();
    tile_panel_rebuild(app);
};
const tile_editor_open_new = (app) => {
    const { presetsRead: tile_presets_read } = app.ops;
    tile_editor_open(app, { id: tile_editor_new_id(tile_presets_read(app)), name: '', rules: [{ min: tile_editor_min_floor, stacks: [1, 1] }], isNew: true });
};
const tile_editor_back = (app) => {
    const { rebuild: tile_panel_rebuild } = app.ops;
    app.panel.view = 'list';
    app.panel.draft = null;
    app.panel.guard();
    tile_panel_rebuild(app);
};
const tile_editor_save = (app, errorLabel) => {
    const { presetsRead: tile_presets_read, presetsWrite: tile_presets_write, focusMonitorIndex: tile_focus_monitor_index, layoutFor: tile_layout_for, retileMonitor: tile_retile_monitor, focusWindow: tile_focus_window } = app.ops;
    const d = app.panel.draft;
    if (!d)
        return;
    if (tile_editor_validate(d) === 'name') {
        errorLabel.text = _("Please enter a name.");
        return;
    }
    const preset = { id: d.id, name: d.name.trim(), rules: d.rules.map((r) => ({ min: r.min, stacks: r.stacks.slice() })) };
    tile_presets_write(app, tile_editor_commit(tile_presets_read(app), preset));
    global.log('greenTile preset "' + preset.name + '" saved (' + preset.rules.length + ' rules)');
    tile_editor_back(app);
    // Retile only where the preset is in use AND automatic tiling is on; a paused
    // workspace (Super+Ctrl+D) is left alone until Super+Ctrl+A.
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    const layout = tile_layout_for(app, tile_focus_monitor_index(), wsIndex);
    if (layout.preset && layout.preset.id === preset.id && layout.auto)
        tile_retile_monitor(app, tile_focus_monitor_index(), tile_focus_window());
};
const tile_presets_delete = (app) => {
    const { presetsRead: tile_presets_read, presetsWrite: tile_presets_write } = app.ops;
    const d = app.panel.draft;
    if (!d)
        return;
    tile_presets_write(app, tile_editor_delete_preset(tile_presets_read(app), d.id));
    const layouts = tile_layouts_parse(app.config.settings.getValue(SETTINGS_KEYS.layouts) || '');
    // Corrupt layouts stay untouched until the setting is fixed, like tile_layout_set,
    // which logs the same condition only once.
    if (layouts === null) {
        if (!app.session.layoutsWriteGuardLogged) {
            app.session.layoutsWriteGuardLogged = true;
            global.log('greenTile layouts setting is corrupt, deleting preset without layout cleanup');
        }
    }
    else
        app.config.settings.setValue(SETTINGS_KEYS.layouts, JSON.stringify(tile_layouts_remove_preset(layouts, d.id)));
    global.log('greenTile preset "' + (d.name || d.id) + '" deleted');
    tile_editor_back(app);
};
const tile_editor_rule_row = (app, rule, active, last, onSelect) => {
    const St = imports.gi.St;
    const row = new St.Button({
        style_class: 'gk-ed-rule' + (active ? ' gk-ed-rule-active' : '') + (last ? ' gk-ed-rule-last' : ''),
        x_fill: true, y_fill: true, track_hover: true, reactive: true,
    });
    const outer = new St.BoxLayout({ x_expand: true });
    if (active)
        outer.add(new St.Bin({ style_class: 'gk-ed-rule-stripe' }), { x_fill: false, y_fill: true });
    const box = new St.BoxLayout({ style_class: 'gk-ed-rule-box', x_expand: true });
    box.add(new St.Label({ text: _("from %d").format(rule.min), style_class: 'gk-ed-rule-label' }), { expand: true, x_fill: true, y_fill: false, y_align: St.Align.MIDDLE });
    box.add(tile_panel_thumb(app, rule.stacks, { width: 34, height: 18, gap: 2, vgap: 1, radius: 1, color: active ? app.theme.rgb : app.theme.cairo('thumb') }), tile_panel_middle());
    outer.add(box, { expand: true, x_fill: true, y_fill: true });
    row.set_child(outer);
    row.connect('clicked', () => onSelect());
    return row;
};
// Painter: 6 columns x 4 rows. Button 1 paints (row under the pointer = windows in the
// column), dragging paints every column passed; button 3 removes the column.
const tile_editor_painter = (app, getStacks, onChange) => {
    const St = imports.gi.St;
    const Clutter = imports.gi.Clutter;
    const Main = imports.ui.main;
    const frame = new St.Bin({ style_class: 'gk-painter', x_fill: true, y_fill: true });
    const area = new St.DrawingArea({ style_class: 'gk-painter-area', reactive: true, x_expand: true });
    frame.set_child(area);
    area.connect('repaint', (a) => {
        const cr = a.get_context();
        const [W, H] = a.get_surface_size();
        const stacks = getStacks();
        const accent = app.theme.rgb;
        const gap = 3;
        const cw = (W - gap * (tile_editor_cols - 1)) / tile_editor_cols;
        for (let c = 0; c < tile_editor_cols; c++) {
            const x = c * (cw + gap);
            if (c < stacks.length) {
                cr.setSourceRGBA(accent[0] / 255, accent[1] / 255, accent[2] / 255, 0.85);
                const ch = (H - gap * (stacks[c] - 1)) / stacks[c];
                for (let r = 0; r < stacks[c]; r++)
                    tile_panel_round_rect(cr, x, r * (ch + gap), cw, ch, 2);
            }
            else {
                // empty column: dashed outline in the border colour
                const outline = app.theme.cairo('outline');
                cr.setSourceRGB(outline[0] / 255, outline[1] / 255, outline[2] / 255);
                cr.setLineWidth(1);
                cr.setDash([3, 3], 0);
                cr.rectangle(x + 0.5, 0.5, cw - 1, H - 1);
                cr.stroke();
                cr.setDash([], 0);
            }
        }
        cr.$dispose();
    });
    const cellAt = (event) => {
        const [sx, sy] = event.get_coords();
        const [ok, lx, ly] = area.transform_stage_point(sx, sy);
        if (!ok)
            return null;
        const [w, h] = area.get_size();
        if (w <= 0 || h <= 0)
            return null;
        const col = Math.min(Math.max(Math.floor(lx / (w / tile_editor_cols)), 0), tile_editor_cols - 1);
        return { col, row: Math.floor(ly / (h / tile_editor_rows)) };
    };
    let stroke = null;
    const endStroke = () => {
        if (!stroke)
            return;
        const device = stroke.device;
        stroke = null;
        device.ungrab();
        try {
            Main.popModal(area);
        }
        catch (e) {
            // already popped
        }
    };
    area.connect('button-press-event', (a, event) => {
        const pos = cellAt(event);
        if (!pos)
            return Clutter.EVENT_PROPAGATE;
        const button = event.get_button();
        if (button === 3) {
            onChange(tile_editor_remove(getStacks(), pos.col));
            return Clutter.EVENT_STOP;
        }
        if (button !== 1)
            return Clutter.EVENT_PROPAGATE;
        endStroke();
        onChange(tile_editor_paint(getStacks(), pos.col, pos.row));
        // Same recipe as the title-bar drag (pushModal + device.grab): the stroke keeps
        // receiving motion and release when the pointer leaves the painter.
        if (Main.pushModal(area)) {
            const device = event.get_device();
            device.grab(area);
            stroke = { device, col: pos.col };
        }
        return Clutter.EVENT_STOP;
    });
    area.connect('motion-event', (a, event) => {
        if (!stroke)
            return Clutter.EVENT_PROPAGATE;
        const pos = cellAt(event);
        if (!pos)
            return Clutter.EVENT_STOP;
        if (pos.col === stroke.col)
            onChange(tile_editor_paint(getStacks(), pos.col, pos.row));
        else
            onChange(tile_editor_paint_range(getStacks(), stroke.col + Math.sign(pos.col - stroke.col), pos.col, pos.row));
        stroke.col = pos.col;
        return Clutter.EVENT_STOP;
    });
    area.connect('button-release-event', () => {
        if (!stroke)
            return Clutter.EVENT_PROPAGATE;
        endStroke();
        return Clutter.EVENT_STOP;
    });
    // Connected before any pushModal(area), so it runs before main.js' own destroy
    // handler and pops a valid record (popModal on an unknown actor ends ALL modals).
    area.connect('destroy', () => endStroke());
    return { actor: frame, area };
};
// Preset panel — view 2 (editor): rule list on the left, stepper + painter + name on
// the right (layout and tokens from the approved prototype). The draft
// {id, name, rules (sorted by min), index, isNew} is written to the settings on Save only.
// Cairo can't read the stylesheet: the theme component's accent state (updated by
// changed() before any panel exists) supplies the accent (app.theme.rgb).
const tile_editor_body = (app) => {
    const St = imports.gi.St;
    const middle = tile_panel_middle();
    const body = new St.BoxLayout({ style_class: 'gk-ed-body', reactive: true });
    // left column: rules
    const left = new St.BoxLayout({ vertical: true, style_class: 'gk-ed-left' });
    left.add(new St.Label({ text: _("Rules (by window count)").toUpperCase(), style_class: 'gk-ed-label' }));
    const rulesBox = new St.BoxLayout({ vertical: true, style_class: 'gk-ed-rules' });
    left.add(rulesBox);
    const actions = new St.BoxLayout({ style_class: 'gk-ed-actions' });
    const addBtn = new St.Button({ label: '＋ ' + _("Rule"), style_class: 'gk-ed-add', track_hover: true });
    const delBtn = new St.Button({ label: '🗑 ' + _("Delete rule"), style_class: 'gk-ed-del', track_hover: true });
    actions.add(addBtn);
    actions.add(delBtn);
    left.add(actions);
    body.add(left, { x_fill: false, y_fill: false, y_align: St.Align.START });
    // right column: stepper, painter, name, save
    const right = new St.BoxLayout({ vertical: true, style_class: 'gk-ed-right', x_expand: true });
    const stepper = new St.BoxLayout({ style_class: 'gk-stepper' });
    stepper.add(new St.Label({ text: _("Rule applies from").toUpperCase(), style_class: 'gk-ed-label' }), middle);
    const minus = new St.Button({ label: '−', style_class: 'gk-stepper-btn', track_hover: true });
    const value = new St.Label({ style_class: 'gk-stepper-value' });
    const plus = new St.Button({ label: '+', style_class: 'gk-stepper-btn', track_hover: true });
    stepper.add(minus, middle);
    stepper.add(value, middle);
    stepper.add(plus, middle);
    stepper.add(new St.Label({ text: _("windows").toUpperCase(), style_class: 'gk-ed-label' }), middle);
    right.add(stepper);
    right.add(new St.Label({ text: _("Painter").toUpperCase(), style_class: 'gk-ed-label' }));
    let refresh = () => {};
    const painter = tile_editor_painter(
        app,
        () => app.panel.draft.rules[app.panel.draft.index].stacks,
        (stacks) => {
            const dr = app.panel.draft;
            const rule = dr.rules[dr.index];
            if (stacks.join(',') === rule.stacks.join(','))
                return;
            dr.rules[dr.index] = { min: rule.min, stacks };
            refresh();
        });
    right.add(painter.actor);
    const result = new St.Label({ style_class: 'gk-ed-faint' });
    right.add(result);
    const hint = new St.Label({ text: _("Click or drag: the row sets how many windows the column holds. Right-click removes a column."), style_class: 'gk-ed-faint' });
    hint.clutter_text.line_wrap = true;
    hint.clutter_text.ellipsize = imports.gi.Pango.EllipsizeMode.NONE;
    right.add(hint);
    const nameRow = new St.BoxLayout({ style_class: 'gk-ed-name-row' });
    nameRow.add(new St.Label({ text: _("Name").toUpperCase(), style_class: 'gk-ed-label' }), middle);
    const entry = new St.Entry({ style_class: 'gk-entry', text: app.panel.draft.name, hint_text: _("Preset name"), can_focus: true, x_expand: true });
    nameRow.add(entry, { expand: true, x_fill: true, y_fill: false, y_align: St.Align.MIDDLE });
    right.add(nameRow);
    const saveRow = new St.BoxLayout({ style_class: 'gk-ed-save-row' });
    const delWrap = new St.BoxLayout();
    const presetDelBtn = new St.Button({ label: '🗑 ' + _("Delete preset"), style_class: 'gk-preset-del', track_hover: true });
    delWrap.add(presetDelBtn);
    const confirmWrap = new St.BoxLayout({ style_class: 'gk-preset-del-row' });
    confirmWrap.add(new St.Label({ text: _("Really delete?"), style_class: 'gk-preset-del-question' }), middle);
    const confirmBtn = new St.Button({ label: _("Delete"), style_class: 'gk-preset-del', track_hover: true });
    confirmWrap.add(confirmBtn, middle);
    const cancelBtn = new St.Button({ label: '✕', style_class: 'gk-preset-del-cancel', track_hover: true });
    confirmWrap.add(cancelBtn, middle);
    const save = new St.Button({ label: _("Save"), style_class: 'gk-save', track_hover: true });
    const error = new St.Label({ text: '', style_class: 'gk-error' });
    // A new, never-saved preset has nothing persistent to delete; Back/Esc is its discard.
    // Save sits left, the destructive delete at the outer right; the expanding error
    // label keeps the two apart.
    saveRow.add(save, middle);
    saveRow.add(error, { expand: true, x_fill: true, y_fill: false, y_align: St.Align.MIDDLE });
    if (!app.panel.draft.isNew) {
        saveRow.add(delWrap, middle);
        saveRow.add(confirmWrap, middle);
    }
    right.add(saveRow);
    confirmWrap.hide();
    body.add(right, { expand: true, x_fill: true, y_fill: true });
    refresh = () => {
        const dr = app.panel.draft;
        rulesBox.destroy_all_children();
        dr.rules.forEach((rule, i) => {
            rulesBox.add(tile_editor_rule_row(app, rule, i === dr.index, i === dr.rules.length - 1, () => {
                dr.index = i;
                refresh();
            }));
        });
        const rule = dr.rules[dr.index];
        value.text = String(rule.min);
        result.text = _("Result: %s").format('[' + rule.stacks.join(',') + ']');
        const canDelete = dr.rules.length > 1;
        delBtn.reactive = canDelete;
        if (canDelete)
            delBtn.remove_style_pseudo_class('insensitive');
        else
            delBtn.add_style_pseudo_class('insensitive');
        painter.area.queue_repaint();
    };
    const apply = (r) => {
        app.panel.draft.rules = r.rules;
        app.panel.draft.index = r.index;
        refresh();
    };
    addBtn.connect('clicked', () => apply(tile_editor_add_rule(app.panel.draft.rules)));
    delBtn.connect('clicked', () => apply(tile_editor_delete_rule(app.panel.draft.rules, app.panel.draft.index)));
    minus.connect('clicked', () => apply(tile_editor_step_min(app.panel.draft.rules, app.panel.draft.index, -1)));
    plus.connect('clicked', () => apply(tile_editor_step_min(app.panel.draft.rules, app.panel.draft.index, 1)));
    entry.clutter_text.connect('text-changed', () => {
        app.panel.draft.name = entry.get_text();
        error.text = '';
    });
    entry.clutter_text.connect('activate', () => tile_editor_save(app, error));
    save.connect('clicked', () => tile_editor_save(app, error));
    presetDelBtn.connect('clicked', () => {
        delWrap.hide();
        confirmWrap.show();
    });
    cancelBtn.connect('clicked', () => {
        confirmWrap.hide();
        delWrap.show();
    });
    confirmBtn.connect('clicked', () => tile_presets_delete(app));
    refresh();
    return { actor: body, entry, painter: painter.area };
};

module.exports = { tile_editor_open, tile_editor_open_new, tile_editor_back, tile_editor_body };

/*
 * greenTile — window tiling extension for Cinnamon
 * UUID: greenTile@carsteneu
 *
 * Preset panel frame (open/close/position/drag/toggle/rebuild) and view 1 (the
 * selection list), moved verbatim from greenTile.js. Module boundary only:
 * widget tree, strings and event handling are unchanged. The tiling functions
 * live in lib/tiling and reach the UI through the explicit frozen ops facade
 * on the App (app.ops) — lib/ui requires lib/app only for the
 * settings-keys constants.
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
const { TILE_GAP_MAX, TILE_GAP_STEP, tile_gap_value } = require('./lib/model/gap');
const { TILE_PANEL_MIN, tile_panel_size_parse, tile_panel_size_set, tile_panel_size_clamp } = require('./lib/model/panel-size');
const { tile_theme_toggle_target } = require('./lib/model/theme');
const { tile_fill_stacks } = require('./lib/model/fill');
const { PANEL_ESC_NAME } = require('./lib/runtime/hotkeys');
const { tile_panel_thumb, tile_panel_middle } = require('./lib/ui/draw');
const { tile_editor_open, tile_editor_open_new, tile_editor_back, tile_editor_body } = require('./lib/ui/editor');
const { _ } = require('./lib/ui/i18n');
const { SETTINGS_KEYS } = require('./lib/model/settings-keys');

// Preset panel — view 1 (selection list) and, further below, view 2 (editor);
// design tokens from the approved HTML mockup (docs/superpowers/specs/2026-09-28-preset-ui-design.md).
// Thumbnail = the rule a click would apply right now (current window count);
// fallback: the smallest rule, so an empty workspace still shows the base layout.
const tile_panel_window_count = (app) => {
    const Main = imports.ui.main;
    const { focusWindow: tile_focus_window, collectWindows: tile_collect_windows } = app.ops;
    const focusWindow = tile_focus_window();
    if (!focusWindow)
        return 0;
    const monitor = Main.layoutManager.monitors[focusWindow.get_monitor()];
    return tile_collect_windows(app, monitor, focusWindow).length + (app.excl.isExcluded(focusWindow) ? 0 : 1);
};
const tile_panel_row = (app, preset, n) => {
    const St = imports.gi.St;
    const { rulesPick: tile_rules_pick, focusMonitorIndex: tile_focus_monitor_index, layoutFor: tile_layout_for, layoutSet: tile_layout_set, retileMonitor: tile_retile_monitor, focusWindow: tile_focus_window } = app.ops;
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    const monitorIndex = tile_focus_monitor_index();
    const assignedLayout = tile_layout_for(app, monitorIndex, wsIndex).preset;
    const assignedHere = assignedLayout != null && assignedLayout.id === preset.id;
    // x_fill: St.Button centres its child by default — the row must span the full width
    const row = new St.Button({ style_class: 'gk-row' + (assignedHere ? ' gk-row-assigned' : ''), x_fill: true, y_fill: true, track_hover: true, reactive: true });
    const outer = new St.BoxLayout({ x_expand: true });
    // green left stripe as its own actor — St draws per-side border colours unreliably
    if (assignedHere)
        outer.add(new St.Bin({ style_class: 'gk-row-stripe' }), { x_fill: false, y_fill: true });
    const box = new St.BoxLayout({ style_class: 'gk-row-box', x_expand: true });
    outer.add(box, { expand: true, x_fill: true, y_fill: true });
    const picked = tile_rules_pick(preset.rules, n);
    const rep = picked || preset.rules.reduce((best, rule) => (!best || rule.min < best.min ? rule : best), null);
    // A matching rule is shown filled to the window count, exactly as a click tiles it.
    const thumbStacks = rep && rep.stacks.length ? (picked ? tile_fill_stacks(rep.stacks, n) : rep.stacks) : [1];
    box.add(tile_panel_thumb(app, thumbStacks), tile_panel_middle());
    const textBox = new St.BoxLayout({ vertical: true, style_class: 'gk-row-text' });
    textBox.add(new St.Label({ text: preset.name, style_class: 'gk-name' }));
    if (assignedHere)
        textBox.add(new St.Label({ text: '✓ ' + _("assigned — workspace %d").format(wsIndex + 1), style_class: 'gk-sub' }));
    box.add(textBox, { expand: true, x_fill: true, y_fill: false, y_align: St.Align.MIDDLE });
    if (assignedHere) {
        const un = new St.Button({ label: '✕', style_class: 'gk-icon-btn', track_hover: true });
        un.connect('clicked', () => {
            tile_layout_set(app, monitorIndex, wsIndex, { preset: null });
            global.log('greenTile preset unassigned ws' + wsIndex);
            tile_panel_rebuild(app);
        });
        box.add(un, tile_panel_middle());
    }
    const edit = new St.Button({ label: '🔧', style_class: 'gk-icon-btn', track_hover: true });
    edit.connect('clicked', () => tile_editor_open(app, preset));
    box.add(edit, tile_panel_middle());
    row.set_child(outer);
    row.connect('clicked', () => {
        tile_layout_set(app, monitorIndex, wsIndex, { preset: preset.id });
        global.log('greenTile preset "' + preset.name + '" assigned ws' + wsIndex);
        // Choosing a preset means "tile this workspace with it": a monitor/workspace
        // whose automatic tiling was switched off (Super+Ctrl+D) is switched on again.
        if (!tile_layout_for(app, monitorIndex, wsIndex).auto)
            tile_layout_set(app, monitorIndex, wsIndex, { auto: true });
        const focusWindow = tile_focus_window();
        tile_retile_monitor(app, monitorIndex, focusWindow);
        // The list stays open so several presets can be tried in a row; only ✕,
        // Escape or the panel hotkey close it. Rebuild shows the new assignment.
        tile_panel_rebuild(app);
    });
    return row;
};
// "Gap between windows  − 8 px +" in the list view. Each click stores the value and,
// when automatic tiling is on for this workspace, retiles it shortly after (debounced,
// so fast repeated clicks tile once), so the new gap shows live.
const tile_panel_gap_row = (app) => {
    const St = imports.gi.St;
    const { focusMonitorIndex: tile_focus_monitor_index, gap: tile_gap, layoutFor: tile_layout_for, retileMonitor: tile_retile_monitor } = app.ops;
    const row = new St.BoxLayout({ style_class: 'gk-gap-row' });
    row.add(new St.Label({ text: _("Gap between windows"), style_class: 'gk-gap-label' }), { expand: true, x_fill: true, y_fill: false, y_align: St.Align.MIDDLE });
    const minus = new St.Button({ label: '−', style_class: 'gk-gap-btn', track_hover: true });
    const value = new St.Label({ style_class: 'gk-gap-value' });
    const plus = new St.Button({ label: '+', style_class: 'gk-gap-btn', track_hover: true });
    const show = (gap) => {
        value.text = _("%d px").format(gap);
        minus.reactive = gap > 0;
        minus.opacity = gap > 0 ? 255 : 90;
        plus.reactive = gap < TILE_GAP_MAX;
        plus.opacity = gap < TILE_GAP_MAX ? 255 : 90;
    };
    const change = (delta) => {
        const gap = tile_gap_value(tile_gap(app) + delta);
        app.config.settings.setValue(SETTINGS_KEYS.windowGap, gap);
        show(gap);
        app.auto.scheduleMonitor(app, tile_focus_monitor_index(), 150);
    };
    minus.connect('clicked', () => change(-TILE_GAP_STEP));
    plus.connect('clicked', () => change(TILE_GAP_STEP));
    // "Reset sizes": only when borders were moved on this monitor + workspace (lib/model/split.js);
    // clears them for every window count and retiles; the rebuild hides the button again.
    const monitorIndex = tile_focus_monitor_index();
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    if (app.split.any(app, monitorIndex, wsIndex)) {
        const reset = new St.Button({ label: _("Reset sizes"), style_class: 'gk-reset-btn', track_hover: true });
        reset.connect('clicked', () => {
            app.split.reset(app, monitorIndex, wsIndex);
            if (tile_layout_for(app, monitorIndex, wsIndex).auto)
                tile_retile_monitor(app, monitorIndex, null);
            tile_panel_rebuild(app);
        });
        row.add(reset, { y_fill: false, y_align: St.Align.MIDDLE });
    }
    row.add(minus, { y_fill: false, y_align: St.Align.MIDDLE });
    row.add(value, { y_fill: false, y_align: St.Align.MIDDLE });
    row.add(plus, { y_fill: false, y_align: St.Align.MIDDLE });
    show(tile_gap(app));
    return row;
};
const tile_panel_rebuild = (app) => {
    if (!app.panel.actor)
        return;
    const view = app.panel.view;
    const draft = app.panel.draft;
    app.panel.close();
    app.panel.view = view;
    app.panel.draft = draft;
    tile_panel_open(app);
};
const tile_panel_open = (app) => {
    const St = imports.gi.St;
    const Clutter = imports.gi.Clutter;
    const Util = imports.misc.util;
    const Tooltips = imports.ui.tooltips;
    const Main = imports.ui.main;
    const GLib = imports.gi.GLib;
    const UUID = 'greenTile@carsteneu';
    const { getFocusApp, focusMonitorIndex: tile_focus_monitor_index, layoutFor: tile_layout_for, presetsRead: tile_presets_read } = app.ops;
    const wsIndex = global.workspace_manager.get_active_workspace().index();
    const monitorIndex = tile_focus_monitor_index();
    const draft = app.panel.view === 'editor' ? app.panel.draft : null;
    const panel = new St.BoxLayout({ vertical: true, style_class: app.theme.panelClass(), reactive: true, can_focus: true });
    const header = new St.BoxLayout({ style_class: 'gk-panel-header', reactive: true });
    let titleText = _("Presets — workspace %d · %s").format(wsIndex + 1, app.monitors.labels[monitorIndex] || '');
    if (draft)
        titleText = draft.isNew ? _("Create preset") : _("Edit %s").format(draft.name);
    const title = new St.Label({ text: titleText, style_class: 'gk-title' });
    header.add(title, { expand: true, x_fill: true, y_fill: false, y_align: St.Align.MIDDLE });
    if (draft) {
        const backBtn = new St.Button({ label: '← ' + _("Back"), style_class: 'gk-back', track_hover: true });
        backBtn.connect('clicked', () => tile_editor_back(app));
        header.add(backBtn);
    }
    else {
        // Automatic tiling state of this monitor and workspace (Super+Ctrl+A / Super+Ctrl+D),
        // shown and switchable here; turning it on tiles right away, like Super+Ctrl+A.
        const autoOn = tile_layout_for(app, monitorIndex, wsIndex).auto;
        const autoBtn = new St.Button({
            label: autoOn ? _("Auto: on") : _("Auto: off"),
            style_class: 'gk-auto' + (autoOn ? ' gk-auto-on' : ''),
            track_hover: true,
        });
        autoBtn.connect('clicked', () => {
            if (tile_layout_for(app, monitorIndex, wsIndex).auto)
                app.auto.deactivate(app);
            else
                app.auto.activate(app);
            tile_panel_rebuild(app);
        });
        header.add(autoBtn, { y_fill: false, y_align: St.Align.MIDDLE });
        // Theme toggle: one click switches between light and dark; "Follow system" is
        // selectable again in the settings dialog. The glyph shows the theme a click
        // switches TO (moon in light mode, like most desktop apps do).
        const themeShown = app.theme.theme;
        const themeBtn = new St.Button({
            label: themeShown === 'light' ? '☾' : '☀',
            style_class: 'gk-close gk-theme',
            track_hover: true,
        });
        new Tooltips.Tooltip(themeBtn, themeShown === 'light' ? _("Dark theme") : _("Light theme"));
        themeBtn.connect('clicked', () => {
            app.config.settings.setValue(SETTINGS_KEYS.panelTheme, tile_theme_toggle_target(app.theme.theme));
            // Cinnamon's XletSettings.setValue only saves the settings file — the
            // IN bind callback does not fire on programmatic changes, so the panel
            // re-theme and rebuild happen here. The guard swallows stray clicks
            // that follow the rebuild, like the Back button does.
            app.panel.guard();
            app.theme.changed();
        });
        header.add(themeBtn);
        // ⚙ opens the extension's settings dialog on its first page; the same dialog
        // Cinnamon opens from the Extensions manager.
        const settingsBtn = new St.Button({ label: '⚙', style_class: 'gk-close gk-settings', track_hover: true });
        settingsBtn.connect('clicked', () => {
            app.panel.close();
            Util.spawn(['xlet-settings', 'extension', UUID, '-t', '0']);
        });
        header.add(settingsBtn);
        const closeBtn = new St.Button({ label: '✕', style_class: 'gk-close', track_hover: true });
        closeBtn.connect('clicked', () => app.panel.close());
        header.add(closeBtn);
    }
    panel.add(header);
    // Drag the panel by hand: the WHOLE title bar is a handle (except the button).
    // Recipe from Cinnamon's dnd.js (_grabEvents/_ungrabEvents); it needs BOTH parts:
    //   Main.pushModal(panel)  → X delivers all events to Cinnamon, even over native windows
    //   device.grab(panel)     → Clutter routes them to the panel, not to the actor under the pointer
    // Either one alone loses motion/release as soon as the pointer leaves the panel.
    let drag = null;
    // Resize state (grip in the bottom right corner); set up further below, once the
    // stretching part (list rows or painter) exists. Declared here for the handlers.
    let resize = null;
    let onResizeMotion = () => { };
    let endResize = () => { };
    const endDrag = () => {
        if (!drag)
            return;
        drag.device.ungrab();
        try {
            Main.popModal(panel);
        } catch (e) {
            // modal already popped (main.js pops it on actor destroy)
        }
        drag = null;
        app.panel.dragging = false;
        const [px, py] = panel.get_position();
        app.session.panelSaved = { x: Math.round(px), y: Math.round(py) };
        global.log('greenTile panel moved to ' + Math.round(px) + ',' + Math.round(py));
    };
    const onDragMotion = (a, event) => {
        if (resize) {
            onResizeMotion(event);
            return Clutter.EVENT_STOP;
        }
        if (!drag)
            return Clutter.EVENT_PROPAGATE;
        const [gx, gy] = event.get_coords();
        panel.set_position(Math.round(gx - drag.dx), Math.round(gy - drag.dy));
        return Clutter.EVENT_STOP;
    };
    const onDragRelease = () => {
        if (resize) {
            endResize();
            return Clutter.EVENT_STOP;
        }
        if (!drag)
            return Clutter.EVENT_PROPAGATE;
        endDrag();
        return Clutter.EVENT_STOP;
    };
    header.connect('button-press-event', (a, event) => {
        const src = event.get_source();
        if (src !== header && src !== title)
            return Clutter.EVENT_PROPAGATE;
        const [gx, gy] = event.get_coords();
        const [px, py] = panel.get_position();
        if (isNaN(px) || isNaN(py))
            return Clutter.EVENT_PROPAGATE;
        endDrag();
        if (!Main.pushModal(panel))
            return Clutter.EVENT_PROPAGATE;
        const device = event.get_device();
        device.grab(panel);
        app.panel.dragging = true;
        drag = { dx: gx - px, dy: gy - py, device };
        return Clutter.EVENT_STOP;
    });
    panel.connect('motion-event', onDragMotion);
    panel.connect('button-release-event', onDragRelease);
    panel.connect('destroy', () => {
        endDrag();
        endResize();
    });
    // Double-click guard: right after a switch between list and editor, mouse buttons
    // on the panel are swallowed in the capture phase, before any button, row or the
    // painter sees them (a double-click on Save would otherwise assign the list row
    // under the pointer; one on 🔧 would paint into the editor).
    panel.connect('captured-event', (a, event) => {
        const type = event.type();
        if ((type === Clutter.EventType.BUTTON_PRESS || type === Clutter.EventType.BUTTON_RELEASE)
            && GLib.get_monotonic_time() < app.panel.guardUntil)
            return Clutter.EVENT_STOP;
        return Clutter.EVENT_PROPAGATE;
    });
    let rowsBox = null;
    let scroll = null;
    let editor = null;
    // Footer: the list's hint and, in both views, the resize grip in the corner.
    const footer = new St.BoxLayout({ style_class: 'gk-footer' });
    const grip = new St.Label({ text: '◢', style_class: 'gk-grip', reactive: true, track_hover: true });
    if (draft) {
        editor = tile_editor_body(app);
        panel.add(editor.actor);
    }
    else {
        const presets = tile_presets_read(app);
        const n = tile_panel_window_count(app);
        rowsBox = new St.BoxLayout({ vertical: true, style_class: 'gk-rows' });
        if (presets.length === 0)
            rowsBox.add(new St.Label({ text: _("No presets yet."), style_class: 'gk-muted' }));
        for (const preset of presets)
            rowsBox.add(tile_panel_row(app, preset, n));
        // vscrollbar starts as NEVER: with AUTOMATIC, Cinnamon's St reserves the bar's 21px
        // even when there is nothing to scroll (rows end too far from the right edge). The bar
        // is switched on in the allocation handler once the list exceeds LIST_MAX.
        scroll = new St.ScrollView({
            style_class: 'gk-scroll',
            reactive: true,
            hscrollbar_policy: St.PolicyType.NEVER,
            vscrollbar_policy: St.PolicyType.NEVER,
        });
        scroll.add_actor(rowsBox);
        panel.add(scroll);
        panel.add(tile_panel_gap_row(app));
        const plus = new St.Button({ label: '＋ ' + _("New preset"), style_class: 'gk-plus', x_fill: true, track_hover: true });
        plus.connect('clicked', () => tile_editor_open_new(app));
        panel.add(plus);
        const hint = new St.Label({ text: _("Click a row to apply it to this workspace and tile right away"), style_class: 'gk-hint' });
        footer.add(hint, { expand: true, x_fill: true, y_fill: false, y_align: St.Align.MIDDLE });
    }
    // expand: in the editor there is no hint before the grip, it must still sit right.
    footer.add(grip, { expand: true, x_fill: false, y_fill: false, x_align: St.Align.END, y_align: St.Align.END });
    panel.add(footer);
    Main.layoutManager.addChrome(panel);
    app.panel.actor = panel;
    // Monitors come and go (external display plugged in or out). A saved position
    // whose title bar is on no current monitor would open the panel off screen, so it
    // is dropped and the panel is centred again. Probe point: title bar at list width.
    const monitors = Main.layoutManager.monitors;
    const monitorAt = (x, y) => monitors.find((m) => x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height) || null;
    const focusMonitor = () => {
        const focusWindow = getFocusApp();
        return (focusWindow && monitors[focusWindow.get_monitor()]) || monitors[Main.layoutManager.primaryIndex] || monitors[0];
    };
    if (app.session.panelSaved && !monitorAt(app.session.panelSaved.x + 300, app.session.panelSaved.y + 20)) {
        global.log('greenTile panel position ' + app.session.panelSaved.x + ',' + app.session.panelSaved.y + ' is on no monitor, centring again');
        app.session.panelSaved = null;
    }
    // Keep the position across rebuilds (workspace switches, focus changes, view changes)
    app.panel.positioned = app.session.panelSaved != null;
    if (app.session.panelSaved)
        panel.set_position(app.session.panelSaved.x, app.session.panelSaved.y);
    // Resize with the grip in the bottom right corner, same grab recipe as the title-bar
    // drag (pushModal + device.grab). Width = panel width, height = the part that
    // stretches (list: preset rows, editor: painter; the rules column stays fixed).
    // Stored per view in SETTINGS_KEYS.panelSize, limited to the room on the panel's monitor.
    const sizeView = draft ? 'editor' : 'list';
    const stretch = draft ? editor.painter : scroll;
    const sizeMin = TILE_PANEL_MIN[sizeView];
    const storedSize = tile_panel_size_parse(app.config.settings.getValue(SETTINGS_KEYS.panelSize))[sizeView];
    const panelMonitor = () => {
        const [px, py] = panel.get_position();
        return monitorAt(px + 300, py + 20) || focusMonitor();
    };
    // The list's scrollbar only when the rows do not fit (AUTOMATIC reserves its width
    // even when there is nothing to scroll, see below).
    const fitScroll = () => {
        if (!scroll)
            return;
        const [, natural] = rowsBox.get_preferred_height(-1);
        const policy = natural > scroll.get_height() + 1 ? St.PolicyType.AUTOMATIC : St.PolicyType.NEVER;
        if (scroll.vscrollbar_policy !== policy)
            scroll.vscrollbar_policy = policy;
    };
    if (storedSize) {
        const m = (app.session.panelSaved && monitorAt(app.session.panelSaved.x + 300, app.session.panelSaved.y + 20)) || focusMonitor();
        panel.set_width(Math.max(Math.min(storedSize.w, m.width), sizeMin.w));
        stretch.set_height(Math.max(storedSize.h, sizeMin.h));
    }
    grip.connect('enter-event', () => global.set_cursor(imports.gi.Cinnamon.Cursor.RESIZE_BOTTOM_RIGHT));
    grip.connect('leave-event', () => {
        if (!resize)
            global.unset_cursor();
    });
    grip.connect('button-press-event', (a, event) => {
        if (event.get_button() !== 1)
            return Clutter.EVENT_PROPAGATE;
        const [gx, gy] = event.get_coords();
        const [px, py] = panel.get_position();
        if (isNaN(px) || isNaN(py))
            return Clutter.EVENT_PROPAGATE;
        endDrag();
        endResize();
        if (!Main.pushModal(panel))
            return Clutter.EVENT_PROPAGATE;
        const device = event.get_device();
        device.grab(panel);
        app.panel.dragging = true;
        // From now on the user sets the list height: LIST_MAX must not cap it (it
        // measures the rows box, which the scroll view stretches to its own height).
        scrollCapped = true;
        const [pw, ph] = panel.get_size();
        const sh = stretch.get_height();
        const m = panelMonitor();
        resize = {
            device, gx, gy, w: pw, h: sh, last: null,
            max: { w: m.x + m.width - px, h: sh + (m.y + m.height - (py + ph)) },
        };
        global.set_cursor(imports.gi.Cinnamon.Cursor.RESIZE_BOTTOM_RIGHT);
        return Clutter.EVENT_STOP;
    });
    onResizeMotion = (event) => {
        const [gx, gy] = event.get_coords();
        const s = tile_panel_size_clamp({ w: resize.w + gx - resize.gx, h: resize.h + gy - resize.gy }, sizeMin, resize.max);
        panel.set_width(s.w);
        stretch.set_height(s.h);
        fitScroll();
        resize.last = s;
    };
    endResize = () => {
        if (!resize)
            return;
        const r = resize;
        resize = null;
        r.device.ungrab();
        try {
            Main.popModal(panel);
        }
        catch (e) {
            // modal already popped (main.js pops it on actor destroy)
        }
        global.unset_cursor();
        app.panel.dragging = false;
        if (r.last) {
            app.config.settings.setValue(SETTINGS_KEYS.panelSize, tile_panel_size_set(app.config.settings.getValue(SETTINGS_KEYS.panelSize), sizeView, r.last));
            global.log('greenTile panel ' + sizeView + ' resized to ' + r.last.w + 'x' + r.last.h);
        }
    };
    // LIST_MAX measured live: an assigned row is 60 px, a plain row 59 px, so five
    // rows ≈ 296 px fit without the scrollbar; the sixth row scrolls.
    const LIST_MAX = 320;
    // With a stored size the list height is the user's, not LIST_MAX.
    let scrollCapped = storedSize != null;
    let clamped = false;
    let fitted = storedSize == null;
    panel.connect('notify::allocation', () => {
        // Allocation notifications can still arrive after close (destroy);
        // without this guard the centring would run on a dying actor.
        if (app.panel.actor !== panel)
            return;
        if (!fitted) {
            // A size stored on a bigger monitor (5K) can be taller than this one
            // (laptop): shrink the stretching part once, the position clamp follows.
            fitted = true;
            const box = panel.get_allocation_box();
            const excess = (box.y2 - box.y1) - panelMonitor().height;
            if (excess > 0)
                stretch.set_height(Math.max(stretch.get_height() - excess, sizeMin.h));
            fitScroll();
        }
        if (!app.panel.positioned) {
            app.panel.positioned = true;
            clamped = true;
            const monitor = focusMonitor();
            const box = panel.get_allocation_box();
            const width = box.x2 - box.x1;
            const height = box.y2 - box.y1;
            const cx = monitor.x + Math.max(monitor.width - width, 0) / 2;
            const cy = monitor.y + Math.max(monitor.height - height, 0) / 2.5;
            panel.set_position(Math.round(cx), Math.round(cy));
            app.session.panelSaved = { x: Math.round(cx), y: Math.round(cy) };
        }
        if (!clamped && !app.panel.dragging) {
            // Keep the whole panel inside the monitor its title bar is on: a panel dragged
            // near the right edge would stick out, and a smaller monitor after a display
            // change has the same effect. Both views are 600 px wide; probe at the centre.
            clamped = true;
            const box = panel.get_allocation_box();
            const width = box.x2 - box.x1;
            const height = box.y2 - box.y1;
            const [px, py] = panel.get_position();
            const monitor = monitorAt(px + 300, py + 20) || focusMonitor();
            const nx = Math.min(Math.max(px, monitor.x), monitor.x + Math.max(monitor.width - width, 0));
            const ny = Math.min(Math.max(py, monitor.y), monitor.y + Math.max(monitor.height - height, 0));
            if (nx !== px || ny !== py) {
                panel.set_position(Math.round(nx), Math.round(ny));
                app.session.panelSaved = { x: Math.round(nx), y: Math.round(ny) };
                global.log('greenTile panel clamped to ' + Math.round(nx) + ',' + Math.round(ny));
            }
        }
        if (scroll && !scrollCapped) {
            const rb = rowsBox.get_allocation_box();
            if (rb.y2 - rb.y1 > LIST_MAX) {
                scrollCapped = true;
                scroll.vscrollbar_policy = St.PolicyType.AUTOMATIC;
                scroll.set_height(LIST_MAX);
            }
        }
    });
    // The list follows the desktop: a workspace switch re-renders it (title,
    // assignment, thumbnail window count). The editor is never rebuilt by these
    // signals, it would lose the draft.
    // Meta.WorkspaceManager emits "workspace-switched" (windowManager.js:435).
    // A rebuild during an active drag would kill the grab, so it is skipped then.
    const onWorkspaceSwitched = () => {
        if (app.panel.view === 'editor')
            return;
        if (app.panel.dragging)
            global.log('greenTile rebuild suppressed (drag)');
        else
            tile_panel_rebuild(app);
    };
    app.panel.sig.push({ obj: global.workspace_manager, id: global.workspace_manager.connect('workspace-switched', onWorkspaceSwitched) });
    // Clicking outside closes the panel, in both views, without a grab: the click
    // still acts on whatever it hit. Chrome surfaces (Cinnamon's panels, menus,
    // other extensions' overlays) deliver Clutter events — close when the pressed
    // actor is not the panel or one of its children. This needs the CAPTURE phase:
    // applet buttons handle their button presses with EVENT_STOP, so a plain
    // stage button-press listener never sees them; captured-event passes every
    // event on its way down, before the actor under the pointer. With the editor's
    // modal active the stage input is FULLSCREEN (main.js pushModal), so EVERY
    // outside click arrives here; in list mode clicks on windows and the desktop
    // go to the clients instead — they close the panel through the focus change
    // below.
    app.panel.sig.push({
        obj: global.stage,
        id: global.stage.connect('captured-event', (stage, event) => {
            if (event.type() !== Clutter.EventType.BUTTON_PRESS)
                return Clutter.EVENT_PROPAGATE;
            if (app.panel.dragging)
                return Clutter.EVENT_PROPAGATE;
            const src = event.get_source();
            if (src && app.panel.actor && app.panel.actor.contains(src))
                return Clutter.EVENT_PROPAGATE;
            global.log('greenTile panel closed by outside click');
            app.panel.close();
            return Clutter.EVENT_PROPAGATE;
        }),
    });
    // A click into a window or on the desktop (Nemo) never becomes a stage event
    // in list mode, but it changes the focus: that closes the panel too, the
    // editor included (its draft is dropped, as with Esc and Back). Any other
    // focus change — a window opening, an app demanding attention — closes it as
    // well; that is the price of the passive approach. Suppressed during a drag,
    // which would otherwise lose its grab.
    app.panel.sig.push({
        obj: global.display,
        id: global.display.connect('notify::focus-window', () => {
            if (app.panel.dragging) {
                global.log('greenTile close suppressed (drag)');
                return;
            }
            global.log('greenTile panel closed by focus change');
            app.panel.close();
        }),
    });
    // No monitors-changed handler here: on a display change enable() recreates the whole
    // App, which closes the panel; the saved-position check above covers the next open.
    panel.connect('key-press-event', (a, event) => {
        if (event.get_key_symbol() === Clutter.KEY_Escape) {
            if (app.panel.view === 'editor')
                tile_editor_back(app);
            else
                app.panel.close();
            return Clutter.EVENT_STOP;
        }
        return Clutter.EVENT_PROPAGATE;
    });
    // The list has no modal (it must not block the desktop), so it never gets key
    // events itself. Escape is therefore grabbed as a hotkey while the list is open
    // (same way the classic grid binds its Escape); released in app.panel.close().
    // Side effect: while the list is open, applications do not receive Escape.
    if (!draft) {
        Main.keybindingManager.addHotKey(PANEL_ESC_NAME, 'Escape', () => app.panel.close());
        app.panel.escBound = true;
    }
    global.log('greenTile panel open' + (draft ? ' (editor)' : ''));
    if (editor) {
        // The name entry needs the keyboard; a chrome actor only gets key events while
        // Cinnamon holds a modal grab. The modal sits on the editor body, NOT on the panel:
        // popModal restores the key focus only for the topmost record, so the drag
        // (pushModal(panel)) and the painter stroke (pushModal(area)) must stay separate
        // records that hand the focus back to the entry. Destroying the panel pops it.
        if (Main.pushModal(editor.actor))
            editor.entry.grab_key_focus();
        else
            global.log('greenTile editor: pushModal failed, the name entry gets no keyboard');
    }
    else
        panel.grab_key_focus();
};
const tile_panel_toggle = (app) => {
    if (app.panel.actor)
        app.panel.close();
    else
        tile_panel_open(app);
};

module.exports = { tile_panel_toggle, tile_panel_rebuild, tile_panel_window_count };

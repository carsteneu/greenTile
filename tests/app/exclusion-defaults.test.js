'use strict';
// The built-in exclusion row for the Cinnamon xlet settings dialogs. The row is
// in the schema default (fresh installs) and Config._seedExclusionDefaults adds
// it ONCE to an existing install — never twice, never re-added after the user
// deleted it, and never over unreadable data. The dialog's WM_CLASS was read live
// on Cinnamon 6.6.4 (Mint 22.3): the xlet-settings window is a NORMAL top-level
// window with WM_CLASS "Xlet-settings.py" / instance "xlet-settings.py".
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cinnamonLoad, load, ROOT } = require('../helpers/cinnamon-loader');
const { createCinnamonEnv } = require('../helpers/fakes/cinnamon-env');
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'settings-schema.json'), 'utf8'));
const Config = load('./lib/app/config.js').Config;
const exclude = load('./lib/model/exclude.js');

const SHELL_ROW = { match: 'class', text: 'xlet-settings.py' };

test('the schema default carries exactly the xlet settings row and its marker', () => {
    assert.deepEqual(schema.exclusions.default, [SHELL_ROW]);
    assert.equal(schema.exclusionsSeeded.type, 'generic');
    assert.equal(schema.exclusionsSeeded.default, false);
});

test('the shipped row matches the real dialog and nothing unrelated', () => {
    const rows = exclude.exclRowsNormalize(schema.exclusions.default);
    // live values of the xlet-settings window on Cinnamon 6.6.4 (Mint 22.3); the
    // WindowTracker app id is a window-backed "window:3", so a class match is the
    // only stable choice
    assert.equal(exclude.exclMatch('Xlet-settings.py', 'xlet-settings.py', 'greenTile', rows, 'window:3'), true,
        'the class row matches both the class and the instance, case-insensitively');
    assert.equal(exclude.exclMatch('Cinnamon-settings.py', 'cinnamon-settings.py', 'System Settings', rows, 'x'), false);
    assert.equal(exclude.exclMatch('Gnome-terminal', 'gnome-terminal', 'xlet-settings.py notes', rows, 'x'), false,
        'a class row never matches a title');
});

// A key absent from the stored values reads its SCHEMA default, like a real
// settings object after Cinnamon's _doUpgrade filled a newly added key.
const fixture = (values) => {
    const f = { values: { ...values }, writes: [] };
    f.settings = {
        getValue: (key) => (key in f.values ? f.values[key] : schema[key].default),
        getDefaultValue: (key) => schema[key].default,
        setValue(key, value) {
            f.values[key] = value;
            f.writes.push(key);
        },
    };
    f.getValue = (key) => f.settings.getValue(key);
    f.run = () => Config.prototype._seedExclusionDefaults.call({ settings: f.settings });
    return f;
};

test('a fresh install keeps the schema row and only records the seed', () => {
    const f = fixture({ exclusions: schema.exclusions.default, exclusionsSeeded: false });
    f.run();
    assert.deepEqual(f.values.exclusions, [SHELL_ROW]);
    assert.equal(f.values.exclusionsSeeded, true);
    assert.deepEqual(f.writes, ['exclusionsSeeded'], 'the shipped default is not rewritten');
});

test('an existing install with an empty list gets the row appended once', () => {
    const f = fixture({ exclusions: [], exclusionsSeeded: false });
    f.run();
    assert.deepEqual(f.values.exclusions, [SHELL_ROW]);
    assert.deepEqual(f.writes, ['exclusions', 'exclusionsSeeded']);
});

test('an existing install keeps its own rows and gets the row appended', () => {
    const own = { match: 'class', text: 'Firefox' };
    const f = fixture({ exclusions: [own], exclusionsSeeded: false });
    f.run();
    assert.deepEqual(f.values.exclusions, [own, SHELL_ROW]);
    assert.equal(f.values.exclusionsSeeded, true);
});

test('an equivalent row the user already has is not duplicated', () => {
    for (const existing of [
        { match: 'class', text: 'xlet-settings.py' },
        { match: 'class', text: 'Xlet-settings.py' },
        { match: 'class', text: '  xlet-settings.py  ' },
    ]) {
        const f = fixture({ exclusions: [existing], exclusionsSeeded: false });
        f.run();
        assert.deepEqual(f.values.exclusions, [existing], JSON.stringify(existing));
        assert.deepEqual(f.writes, ['exclusionsSeeded'], 'only the marker is written');
    }
});

test('a row of a different kind with the same text is not the same rule', () => {
    const f = fixture({ exclusions: [{ match: 'title', text: 'xlet-settings.py' }], exclusionsSeeded: false });
    f.run();
    assert.deepEqual(f.values.exclusions, [{ match: 'title', text: 'xlet-settings.py' }, SHELL_ROW]);
});

test('the marker makes the seed a no-op — a row the user deleted stays deleted', () => {
    for (const exclusions of [[], [{ match: 'title', text: 'x' }], [SHELL_ROW]]) {
        const f = fixture({ exclusions, exclusionsSeeded: true });
        f.run();
        assert.deepEqual(f.values.exclusions, exclusions, JSON.stringify(exclusions));
        assert.deepEqual(f.writes, []);
    }
});

test('unreadable data is never replaced and never marked', () => {
    for (const bad of ['[]', '', null, undefined, 42, {}, 'nonsense']) {
        const f = fixture({ exclusions: bad, exclusionsSeeded: false });
        f.run();
        assert.deepEqual(f.values.exclusions, bad, 'value kept: ' + JSON.stringify(bad));
        assert.deepEqual(f.writes, [], 'nothing written for ' + JSON.stringify(bad));
    }
});

test('a row this reader cannot parse is preserved next to the appended row', () => {
    const garbage = { match: 'color', text: 'red' };
    const f = fixture({ exclusions: [garbage], exclusionsSeeded: false });
    f.run();
    assert.deepEqual(f.values.exclusions, [garbage, SHELL_ROW], 'the unparsable row stays verbatim');
});

test('the seed is idempotent — a second start changes nothing', () => {
    const f = fixture({ exclusions: [], exclusionsSeeded: false });
    f.run();
    const after = { ...f.values };
    f.writes.length = 0;
    f.run();
    assert.deepEqual(f.values, after);
    assert.deepEqual(f.writes, []);
});

const enable = (settingsDefaults) => {
    const env = createCinnamonEnv({ settingsDefaults });
    globalThis.imports = env.imports;
    globalThis.global = env.global;
    const ext = cinnamonLoad(fs.readFileSync(path.join(ROOT, 'extension.js'), 'utf8'), load, 'extension.js');
    ext.init({ uuid: 'greenTile@carsteneu' });
    ext.enable();
    env.flushDisplayConfigNoReply();
    return { inst: env.settingsInstances.find((s) => s.uuid === 'greenTile@carsteneu'), ext };
};

// the fields Exclusions.isExcluded reads off a window; __noApp keeps the fake
// WindowTracker out of the way — a class row is matched without an app id
const winLike = (cls, inst, title) => ({
    __noApp: true,
    get_stable_sequence: () => 1,
    get_wm_class: () => cls,
    get_wm_class_instance: () => inst,
    get_title: () => title,
});

test('enable seeds the row into an existing install and applies it', () => {
    const { inst, ext } = enable({ exclusions: [], exclusionsSeeded: false });
    assert.deepEqual(inst.getValue('exclusions'), [SHELL_ROW]);
    assert.equal(inst.getValue('exclusionsSeeded'), true);
    const excl = ext.currentSession().app.excl;
    assert.equal(excl.isExcluded(winLike('Xlet-settings.py', 'xlet-settings.py', 'greenTile')), true,
        'the seeded row is live in the running exclusion set');
    assert.equal(excl.isExcluded(winLike('Gnome-terminal', 'gnome-terminal', 'notes')), false,
        'an unrelated window is not excluded');
});

test('enable leaves a completed install (marker set, empty list) untouched', () => {
    const { inst, ext } = enable({ exclusions: [], exclusionsSeeded: true });
    assert.deepEqual(inst.getValue('exclusions'), []);
    assert.equal(ext.currentSession().app.excl.isExcluded(winLike('Xlet-settings.py', 'xlet-settings.py', 'greenTile')),
        false, 'a row the user deleted stays deleted - no exclusion is applied');
});

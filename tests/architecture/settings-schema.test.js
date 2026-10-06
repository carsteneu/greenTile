'use strict';
// Tests the settings-schema.json lifecycle of the checkbox -> switch migration.
// The three deprecated checkbox settings (Cinnamon 3.2) must become switch without
// touching description/tooltip (the msgids) or the defaults, and stored user values
// must survive a schema upgrade. The upgrade replay mirrors Cinnamon's
// _doUpgrade + _checkSanity (/usr/share/cinnamon/js/ui/settings.js) verbatim.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'settings-schema.json'), 'utf8'));

const checkSanity = (val, setting) => {
    let found;
    switch (setting['type']) {
        case 'spinbutton':
        case 'scale':
            return (val < setting['max'] && val > setting['min']);
        case 'combobox':
        case 'radiogroup':
            found = false;
            for (const opt in setting['options']) {
                if (val === setting['options'][opt]) {
                    found = true;
                    break;
                }
            }
            return found;
        default:
            return true;
    }
};

const doUpgrade = (current, templateData) => {
    for (const key in templateData) {
        if (key === '__md5__') continue;
        const props = templateData[key];
        if (!('type' in props) || !('default' in props)) continue;
        let oldValue = null;
        if (current[key] && current[key].value !== undefined) {
            oldValue = current[key].value;
            if (key in current && checkSanity(oldValue, templateData[key])) templateData[key].value = oldValue;
        }
        if (!('value' in templateData[key])) templateData[key].value = templateData[key].default;
    }
    return templateData;
};

test('no deprecated checkbox type remains in the schema', () => {
    assert.doesNotMatch(JSON.stringify(schema), /"type": ?"checkbox"/);
});

test('the three settings are switches', () => {
    for (const key of ['tileAnimation', 'focusBorder', 'fillSingleWindow']) {
        assert.equal(schema[key].type, 'switch');
    }
});

test('defaults did not change with the type', () => {
    assert.equal(schema.tileAnimation.default, true);
    assert.equal(schema.focusBorder.default, true);
    assert.equal(schema.fillSingleWindow.default, false);
});

test('descriptions and tooltips (the msgids) are untouched', () => {
    assert.equal(schema.tileAnimation.description, 'Animate tiling');
    assert.equal(schema.tileAnimation.tooltip, 'Windows glide into their new place. Off: they jump there at once.');
    assert.equal(schema.focusBorder.description, 'Border around the focused window');
    assert.equal(schema.focusBorder.tooltip, 'After a Super+Arrow focus move, mark the newly focused window with a thin border in the state color for three seconds.');
    assert.equal(schema.fillSingleWindow.description, 'Fill the monitor with a single window');
    assert.equal(schema.fillSingleWindow.tooltip, 'With automatic tiling or a preset on, a single tiled window fills the whole usable area instead of being left untouched.');
});

test('stored boolean values survive the checkbox -> switch upgrade', () => {
    for (const key of ['tileAnimation', 'focusBorder', 'fillSingleWindow']) {
        for (const stored of [true, false]) {
            const current = { [key]: { value: stored } };
            const upgraded = doUpgrade(current, { [key]: { type: 'switch', default: schema[key].default } });
            assert.equal(upgraded[key].value, stored);
        }
    }
});

test('a first install includes twelve distinct editable starter presets', () => {
    const presets = JSON.parse(schema.presets.default);
    assert.equal(presets.length, 12);
    assert.equal(new Set(presets.map(p => p.id)).size, 12, 'unique editable IDs');
    assert.equal(new Set(presets.map(p => p.name)).size, 12, 'distinct names');
    assert.equal(new Set(presets.map(p => JSON.stringify(p.rules[0].stacks))).size, 12, 'distinct base layouts');
    for (const preset of presets) {
        assert.match(preset.id, /^p\d+$/);
        assert.ok(preset.name.trim());
        assert.equal(preset.rules[0].min, 2, 'available from two windows');
        let previous = 1;
        for (const rule of preset.rules) {
            assert.ok(rule.min > previous && rule.min <= 50, 'ascending valid thresholds');
            previous = rule.min;
            assert.ok(rule.stacks.length >= 1 && rule.stacks.length <= 6);
            assert.ok(rule.stacks.every(n => Number.isInteger(n) && n >= 1 && n <= 4));
        }
    }
});

test('starter presets survive the normal reader and cover every supported window count', () => {
    const { load } = require('../helpers/cinnamon-loader');
    const layout = load('./lib/tiling/layout.js');
    const { fillStacks } = load('./lib/model/fill.js');
    const presets = JSON.parse(schema.presets.default);
    assert.equal(presets.length, 12);
    const app = { config: { settings: { getValue: () => schema.presets.default,
        setValue: () => assert.fail('reading presets must not rewrite settings') } } };
    assert.deepEqual(layout.presetsRead(app), presets);
    for (const preset of presets) {
        for (let n = 2; n <= 24; n++) {
            const picked = layout.rulesPick(preset.rules, n);
            assert.ok(picked, `${preset.name}: rule for ${n}`);
            assert.equal(fillStacks(picked.stacks, n).reduce((a, b) => a + b, 0), n);
        }
    }
});

test('upgrading keeps custom or deliberately empty presets instead of reseeding', () => {
    for (const stored of ['[]', '', '[{"id":"mine","name":"Custom","rules":[]}]']) {
        const upgraded = doUpgrade({ presets: { value: stored } }, structuredClone(schema));
        assert.equal(upgraded.presets.value, stored);
    }
});

test('starter presets represent twelve different effective layout families', () => {
    const { load } = require('../helpers/cinnamon-loader');
    const { rulesPick } = load('./lib/tiling/layout.js');
    const { fillStacks } = load('./lib/model/fill.js');
    const signatures = JSON.parse(schema.presets.default).map(preset =>
        JSON.stringify(Array.from({ length: 49 }, (_, i) =>
            fillStacks(rulesPick(preset.rules, i + 2).stacks, i + 2))));
    assert.equal(new Set(signatures).size, 12, 'no two presets always apply the same layout');
});

test('fresh selection size fits twelve cards in four columns and three rows', () => {
    const { load } = require('../helpers/cinnamon-loader');
    const { gridAvailable, gridColumns, gridRows } = load('./lib/model/grid.js');
    const size = JSON.parse(schema.panelSize.default);
    assert.deepEqual(size, { list: { w: 800, h: 480 } }, 'editor size remains unchanged');
    const cols = gridColumns(gridAvailable(size.list.w));
    assert.equal(cols, 4);
    assert.equal(gridRows(JSON.parse(schema.presets.default), cols).length, 3);
    assert.equal(schema.layouts.default, '', 'no monitor or workspace is assigned automatically');
});

test('upgrading preserves previously stored panel sizes including an unset size', () => {
    for (const stored of ['', '{"list":{"w":640,"h":220},"editor":{"w":700,"h":180}}']) {
        const upgraded = doUpgrade({ panelSize: { value: stored } }, structuredClone(schema));
        assert.equal(upgraded.panelSize.value, stored);
    }
});

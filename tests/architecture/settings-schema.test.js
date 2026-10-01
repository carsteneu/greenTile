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
            for (let opt in setting['options']) {
                if (val == setting['options'][opt]) {
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
    for (let key in templateData) {
        if (key == '__md5__') continue;
        let props = templateData[key];
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

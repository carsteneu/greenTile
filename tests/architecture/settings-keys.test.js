'use strict';
// Settings-key single source: lib/model/settings-keys.js carries the ONLY raw
// settings key strings. The dialog msgids are extracted from
// settings-schema.json and are translatable — a renamed key would lose the
// user's stored value (Cinnamon settings.js _doUpgrade keeps values only for
// identical keys) — so every key string lives in exactly one place: key
// renames edit that file and the schema, nothing else. The key list is derived
// from settings-schema.json here; the "layout" dialogue structure entry is not
// a persisted key and is exempt from both the constants set and the guard.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, ROOT } = require('../helpers/cinnamon-loader');

const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'settings-schema.json'), 'utf8'));
const SCHEMA_KEYS = Object.keys(schema).filter((k) => k !== 'layout').sort();

const collectJs = (function collect(dir, prefix) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory())
            {out.push(...collect(path.join(dir, entry.name), rel));}
        else if (entry.name.endsWith('.js'))
            {out.push(rel);}
    }
    return out;
})(path.join(ROOT, 'lib'), 'lib');

test('settings-keys.js is frozen and covers every persisted schema key exactly', () => {
    const keys = load('./lib/model/settings-keys.js').SETTINGS_KEYS;
    assert.equal(Object.isFrozen(keys), true, 'the constants object must be frozen');
    assert.deepEqual(Object.keys(keys).sort(), SCHEMA_KEYS, 'one constant per schema key, no extras');
    for (const key of SCHEMA_KEYS)
        {assert.equal(keys[key], key, 'the constant value is the key itself');}
});

test('the schema carries exactly this persisted key set', () => {
    // whitelist instead of a banned list: any added, renamed or dropped key
    // must be a deliberate change of this list
    assert.deepEqual(SCHEMA_KEYS, [
        'accentColor', 'accentMode', 'autoOffHotkey', 'autoOnHotkey',
        'columns3Hotkey', 'columns6Hotkey', 'excludeAppPicker', 'excludeHotkey',
        'exclusions', 'fillSingleWindow', 'focusBorder', 'layouts', 'panelSize',
        'panelTheme', 'presetHotkey', 'presets', 'resizeNarrowerHotkey',
          'resizeShorterHotkey', 'resizeTallerHotkey', 'resizeWiderHotkey',
            'starterGeneration', 'starterPresetsImported', 'stateColor', 'stateMode', 'swapDownHotkey', 'swapLeftHotkey',
        'swapRightHotkey', 'swapUpHotkey', 'tileAnimation', 'windowGap',
    ].sort());
});

test('no raw settings key string outside lib/model/settings-keys.js', () => {
    const files = collectJs.filter((f) => f !== 'lib/model/settings-keys.js').concat(['extension.js']);
    const violations = [];
    for (const file of files) {
        const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
        for (const key of SCHEMA_KEYS) {
            // quoted literal occurrences only: logging and identifiers may
            // legitimately contain an unquoted key as a word
            if (new RegExp(`['"]${key}['"]`).test(src))
                {violations.push(file + ": '" + key + "'");}
        }
    }
    assert.deepEqual(violations, [], 'raw settings key strings found');
});

'use strict';
// The one-time migration of the boolean "Fill the monitor with a single window"
// into the singleWindowMode select (Config._migrateSingleWindow). The old key
// stays in the schema (hidden) so Cinnamon's _doUpgrade preserves its stored
// value; the marker makes the migration authoritative and idempotent. An
// existing install keeps its old switch, a fresh install keeps the new default.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { cinnamonLoad, load, ROOT } = require('../helpers/cinnamon-loader');
const { createCinnamonEnv } = require('../helpers/fakes/cinnamon-env');
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'settings-schema.json'), 'utf8'));
const Config = load('./lib/app/config.js').Config;

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
    f.run = () => Config.prototype._migrateSingleWindow.call({ settings: f.settings });
    return f;
};

test('the select default is "Center the window" (a fresh install keeps it)', () => {
    const f = fixture({ starterPresetsImported: false, singleWindowMigrated: false, fillSingleWindow: false });
    f.run();
    assert.equal(f.getValue('singleWindowMode'), 'center');
    assert.equal(f.values.singleWindowMigrated, true);
    assert.deepEqual(f.writes, ['singleWindowMigrated'], 'the fresh default is not rewritten');
});

test('an existing install with the old switch on lands on "Fill the monitor"', () => {
    const f = fixture({ starterPresetsImported: true, singleWindowMigrated: false, fillSingleWindow: true });
    f.run();
    assert.equal(f.values.singleWindowMode, 'fill');
    assert.equal(f.values.singleWindowMigrated, true);
    assert.deepEqual(f.writes, ['singleWindowMode', 'singleWindowMigrated']);
});

test('an existing install with the old switch off lands on "Leave it untouched"', () => {
    const f = fixture({ starterPresetsImported: true, singleWindowMigrated: false, fillSingleWindow: false });
    f.run();
    assert.equal(f.values.singleWindowMode, 'leave');
    assert.deepEqual(f.writes, ['singleWindowMode', 'singleWindowMigrated']);
});

test('a missing old key reads its schema default, not an error', () => {
    const f = fixture({ starterPresetsImported: true, singleWindowMigrated: false });
    f.run();
    assert.equal(f.values.singleWindowMode, 'leave');
});

test('the marker makes the migration a no-op and never overwrites a later choice', () => {
    for (const mode of ['leave', 'fill', 'center']) {
        const f = fixture({ starterPresetsImported: true, fillSingleWindow: true, singleWindowMode: mode, singleWindowMigrated: true });
        f.run();
        assert.equal(f.values.singleWindowMode, mode, 'mode=' + mode);
        assert.deepEqual(f.writes, [], 'already migrated: nothing is written');
    }
});

test('the migration is idempotent', () => {
    const f = fixture({ starterPresetsImported: true, fillSingleWindow: true, singleWindowMode: 'center', singleWindowMigrated: false });
    f.run();
    const after = { ...f.values };
    f.writes.length = 0;
    f.run();
    assert.deepEqual(f.values, after);
    assert.deepEqual(f.writes, []);
});

test('a corrupt old value never turns the select on (safe choice: leave)', () => {
    for (const bad of ['true', 1, 'yes', null, undefined]) {
        const f = fixture({ starterPresetsImported: true, fillSingleWindow: bad, singleWindowMigrated: false });
        f.run();
        assert.equal(f.values.singleWindowMode, 'leave', 'old=' + JSON.stringify(bad));
    }
});

const enable = (settingsDefaults) => {
    const env = createCinnamonEnv({ settingsDefaults });
    globalThis.imports = env.imports;
    globalThis.global = env.global;
    const ext = cinnamonLoad(fs.readFileSync(path.join(ROOT, 'extension.js'), 'utf8'), load, 'extension.js');
    ext.init({ uuid: 'greenTile@carsteneu' });
    ext.enable();
    env.flushDisplayConfigNoReply();
    return env.settingsInstances.find((s) => s.uuid === 'greenTile@carsteneu');
};

test('enable migrates an existing install against the real settings slot', () => {
    const inst = enable({ starterPresetsImported: true, singleWindowMigrated: false,
        fillSingleWindow: true, singleWindowMode: 'center' });
    assert.equal(inst.getValue('singleWindowMode'), 'fill', 'the old switch value carried over');
    assert.equal(inst.getValue('singleWindowMigrated'), true, 'the marker is set');
});

test('enable leaves a fresh install on the centered default', () => {
    const inst = enable({ starterPresetsImported: false, singleWindowMigrated: false,
        fillSingleWindow: false, singleWindowMode: 'center' });
    assert.equal(inst.getValue('singleWindowMode'), 'center', 'the migration did not overwrite the fresh default');
    assert.equal(inst.getValue('singleWindowMigrated'), true, 'the marker is set');
});

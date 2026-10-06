'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { load, ROOT } = require('../helpers/cinnamon-loader');
const { makeEnv } = require('../helpers/fakes/cinnamon-harness');
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'settings-schema.json'), 'utf8'));
const starters = JSON.parse(schema.presets.default);
const Config = load('./lib/app/config.js').Config;

// Values are changed before saving, as Cinnamon _setValue does. Failure tests
// recreate settings from the persisted snapshot, rather than trusting memory.
const fixture = (presets = [], layouts = {}, done = false) => {
    const initial = { presets: typeof presets === 'string' ? presets : JSON.stringify(presets),
        layouts: typeof layouts === 'string' ? layouts : JSON.stringify(layouts), starterPresetsImported: done };
    const f = { disk: { ...initial }, values: { ...initial }, writes: [], fail: null };
    f.settings = {
        getValue: key => f.values[key],
        getDefaultValue: key => schema[key].default,
        setValue(key, value) {
            f.values[key] = value;
            if (f.fail === key) throw new Error('injected save failure');
            f.disk = { ...f.values };
            f.writes.push(key);
        },
    };
    f.run = () => Config.prototype._importStarterPresets.call({ settings: f.settings });
    return f;
};

test('an upgrade appends twelve starters without changing old presets or assignments', () => {
    const original = [{ id: 'p1', name: 'My layout', rules: [{ min: 2, stacks: [3, 1] }], custom: true }];
    const layouts = { monitor: { '1': { preset: 'p2' } } };
    const f = fixture(original, layouts);
    f.run();
    const result = JSON.parse(f.disk.presets);
    assert.deepEqual(result.slice(0, 1), original);
    assert.equal(result.length, 13);
    assert.equal(new Set(result.map(p => p.id)).size, 13);
    assert.ok(result.slice(1).every(p => p.id !== 'p1' && p.id !== 'p2'), 'dangling assignments cannot acquire a new preset');
    assert.equal(f.disk.layouts, JSON.stringify(layouts));
    assert.equal(f.disk.starterPresetsImported, true);
    assert.deepEqual(f.writes, ['presets', 'starterPresetsImported']);
});

test('fresh defaults and manually appended starters are not duplicated', () => {
    for (const presets of [starters, starters.map((p, i) => ({ ...p, id: `p${i + 4}` }))]) {
        const f = fixture(presets);
        f.run();
        assert.equal(f.disk.presets, JSON.stringify(presets));
        assert.deepEqual(f.writes, ['starterPresetsImported']);
    }
});

test('a namesake with custom rules is preserved instead of updated', () => {
    const existing = { id: 'custom', name: starters[0].name, rules: [{ min: 2, stacks: [4] }] };
    const f = fixture([existing]);
    f.run();
    const result = JSON.parse(f.disk.presets);
    assert.equal(result.length, 12);
    assert.deepEqual(result[0], existing);
    assert.equal(result.filter(p => p.name === existing.name).length, 1);
});

test('completed migration never restores deleted or modifies renamed starters', () => {
    const f = fixture();
    f.run();
    const remaining = JSON.parse(f.disk.presets).slice(2);
    remaining[0].name = 'Renamed';
    f.values.presets = f.disk.presets = JSON.stringify(remaining);
    f.writes.length = 0;
    f.run();
    assert.equal(f.disk.presets, JSON.stringify(remaining));
    assert.deepEqual(f.writes, []);
    const empty = fixture([], {}, true);
    empty.run();
    assert.equal(empty.disk.presets, '[]');
    assert.deepEqual(empty.writes, []);
});

test('unreadable or malformed preset and layout data are never rewritten or marked', () => {
    for (const raw of ['{', '', 'null', '{}', '[null]', '[{"id":"p1","name":"A","rules":[]},{"id":"p1","name":"B","rules":[]}]']) {
        const f = fixture(raw);
        f.run();
        assert.deepEqual(f.writes, []);
        assert.equal(f.disk.presets, raw);
        assert.equal(f.disk.starterPresetsImported, false);
    }
    for (const raw of ['{', 'null', '[]']) {
        const f = fixture([], raw);
        f.run();
        assert.deepEqual(f.writes, []);
    }
});

test('a failed preset save does not persist the marker and can retry after restart', () => {
    const f = fixture();
    f.fail = 'presets';
    assert.throws(f.run, /save failure/);
    assert.equal(f.disk.starterPresetsImported, false);
    assert.equal(f.disk.presets, '[]');
    const retry = fixture(f.disk.presets, f.disk.layouts, f.disk.starterPresetsImported);
    retry.run();
    assert.equal(JSON.parse(retry.disk.presets).length, 12);
});

test('a failed marker save retries without appending the already persisted batch', () => {
    const f = fixture();
    f.fail = 'starterPresetsImported';
    assert.throws(f.run, /save failure/);
    assert.equal(f.disk.starterPresetsImported, false);
    assert.equal(JSON.parse(f.disk.presets).length, 12);
    const retry = fixture(f.disk.presets, f.disk.layouts, f.disk.starterPresetsImported);
    retry.run();
    assert.equal(JSON.parse(retry.disk.presets).length, 12);
    assert.deepEqual(retry.writes, ['starterPresetsImported']);
});

test('real startup runs the import once across monitor recreation and enable cycles', () => {
    const { env, ext } = makeEnv({ presets: '[]', starterPresetsImported: false });
    try {
        ext.enable();
        const first = env.settingsInstances.at(-1);
        assert.equal(JSON.parse(first.getValue('presets')).length, 12);
        assert.equal(first.getValue('starterPresetsImported'), true);
        first.setValue('presets', '[]');
        env.layoutManager.emit('monitors-changed');
        assert.equal(env.settingsInstances.at(-1).getValue('presets'), '[]');
        ext.disable();
        ext.enable();
        assert.equal(env.settingsInstances.at(-1).getValue('presets'), '[]');
    }
    finally { ext.disable(); }
});

test('three custom plus twelve manually imported presets keep their exact values', () => {
    const original = [1, 2, 3].map(n => ({ id: `p${n}`, name: `Custom ${n}`, rules: [{ min: 2, stacks: [n] }] }));
    const existing = original.concat(starters.map((p, i) => ({ ...p, id: `p${i + 4}` })));
    const layouts = { monitor: { '1': { preset: 'p15', auto: true } } };
    const f = fixture(existing, layouts);
    f.run();
    assert.equal(f.disk.presets, JSON.stringify(existing));
    assert.equal(f.disk.layouts, JSON.stringify(layouts));
    assert.deepEqual(f.writes, ['starterPresetsImported']);
});

for (const failingKey of ['presets', 'starterPresetsImported']) {
    test(`startup finalizes settings without another write after failed ${failingKey} save`, () => {
        const { env, ext } = makeEnv({ presets: '[]', starterPresetsImported: false });
        const Original = env.ui.settings.ExtensionSettings;
        let fail = true;
        let failedSettings;
        const saves = [];
        env.ui.settings.ExtensionSettings = class {
            constructor(owner, uuid) {
                const settings = new Original(owner, uuid);
                const save = settings.saveFile;
                settings.saveFile = function () {
                    saves.push([this.getValue('presets'), this.getValue('starterPresetsImported')]);
                    if (fail && (failingKey === 'presets' || this.getValue('starterPresetsImported') === true)) {
                        failedSettings = this;
                        throw new Error('injected startup save failure');
                    }
                    save.call(this);
                };
                return settings;
            }
        };
        try {
            assert.throws(() => ext.enable(), /startup save failure/);
            assert.equal(failedSettings.finalized, true, 'failed settings object is discarded');
            assert.equal(saves.length, failingKey === 'presets' ? 1 : 2, 'cleanup does not save dirty memory');
            ext.disable();
            assert.equal(saves.length, failingKey === 'presets' ? 1 : 2);
            fail = false;
            ext.enable();
            const settings = env.settingsInstances.at(-1);
            assert.equal(JSON.parse(settings.getValue('presets')).length, 12);
            assert.equal(settings.getValue('starterPresetsImported'), true);
        }
        finally { ext.disable(); }
    });
}

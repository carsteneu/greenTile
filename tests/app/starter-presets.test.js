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
// A key absent from the stored values reads its SCHEMA default, like a real settings
// object after Cinnamon's _doUpgrade filled a newly added key.
const fixture = (presets = [], layouts = {}, done = false, generation = undefined) => {
    const initial = { presets: typeof presets === 'string' ? presets : JSON.stringify(presets),
        layouts: typeof layouts === 'string' ? layouts : JSON.stringify(layouts), starterPresetsImported: done };
    if (generation !== undefined) {
        initial.starterGeneration = generation;
    }
    const f = { disk: { ...initial }, values: { ...initial }, writes: [], fail: null };
    f.settings = {
        getValue: key => (key in f.values ? f.values[key] : schema[key].default),
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

// The starter set as it shipped before the span starters: the first twelve schema entries.
const twelve = () => JSON.parse(schema.presets.default).slice(0, 12);
const four = () => JSON.parse(schema.presets.default).slice(12);

test('an upgrade appends every starter without changing old presets or assignments', () => {
    const original = [{ id: 'p1', name: 'My layout', rules: [{ min: 2, stacks: [3, 1] }], custom: true }];
    const layouts = { monitor: { '1': { preset: 'p2' } } };
    const f = fixture(original, layouts);
    f.run();
    const result = JSON.parse(f.disk.presets);
    assert.deepEqual(result.slice(0, 1), original);
    assert.equal(result.length, 17);
    assert.equal(new Set(result.map(p => p.id)).size, 17);
    assert.ok(result.slice(1).every(p => p.id !== 'p1' && p.id !== 'p2'), 'dangling assignments cannot acquire a new preset');
    assert.equal(f.disk.layouts, JSON.stringify(layouts));
    assert.equal(f.disk.starterPresetsImported, true);
    assert.equal(f.disk.starterGeneration, 2);
    assert.deepEqual(f.writes, ['presets', 'starterPresetsImported', 'starterGeneration']);
});

test('fresh defaults and manually appended starters are not duplicated', () => {
    for (const presets of [starters, starters.map((p, i) => ({ ...p, id: `p${i + 4}` }))]) {
        const f = fixture(presets);
        f.run();
        assert.equal(f.disk.presets, JSON.stringify(presets));
        assert.deepEqual(f.writes, ['starterPresetsImported', 'starterGeneration']);
    }
});

test('a namesake with custom rules is preserved instead of updated', () => {
    const existing = { id: 'custom', name: starters[0].name, rules: [{ min: 2, stacks: [4] }] };
    const f = fixture([existing]);
    f.run();
    const result = JSON.parse(f.disk.presets);
    assert.equal(result.length, starters.length);
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
    // An install whose list is empty but that completed the twelve still receives the
    // starters added later — those were never there, so nothing of the user's comes back.
    const empty = fixture([], {}, true);
    empty.run();
    assert.deepEqual(JSON.parse(empty.disk.presets).map(p => p.name), four().map(p => p.name));
    assert.equal(empty.disk.starterGeneration, 2);
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
    assert.equal(JSON.parse(retry.disk.presets).length, starters.length);
});

test('a failed marker save retries without appending the already persisted batch', () => {
    const f = fixture();
    f.fail = 'starterPresetsImported';
    assert.throws(f.run, /save failure/);
    assert.equal(f.disk.starterPresetsImported, false);
    assert.equal(JSON.parse(f.disk.presets).length, starters.length);
    const retry = fixture(f.disk.presets, f.disk.layouts, f.disk.starterPresetsImported);
    retry.run();
    assert.equal(JSON.parse(retry.disk.presets).length, starters.length);
    assert.deepEqual(retry.writes, ['starterPresetsImported', 'starterGeneration']);
});

test('real startup runs the import once across monitor recreation and enable cycles', () => {
    const { env, ext } = makeEnv({ presets: '[]', starterPresetsImported: false, starterGeneration: 1 });
    try {
        ext.enable();
        const first = env.settingsInstances.at(-1);
        assert.equal(JSON.parse(first.getValue('presets')).length, starters.length);
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
    const existing = original.concat(twelve().map((p, i) => ({ ...p, id: `p${i + 4}` })));
    const layouts = { monitor: { '1': { preset: 'p15', auto: true } } };
    const f = fixture(existing, layouts);
    f.run();
    const result = JSON.parse(f.disk.presets);
    assert.deepEqual(result.slice(0, existing.length), existing, 'every stored preset keeps its exact value');
    assert.deepEqual(result.slice(existing.length).map(p => p.name), four().map(p => p.name));
    assert.equal(f.disk.layouts, JSON.stringify(layouts));
    assert.deepEqual(f.writes, ['presets', 'starterPresetsImported', 'starterGeneration']);
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
            assert.equal(JSON.parse(settings.getValue('presets')).length, starters.length);
            assert.equal(settings.getValue('starterPresetsImported'), true);
        }
        finally { ext.disable(); }
    });
}

// --- The four span starters (2.2.4) arrive ONCE for an install that already has the twelve ---

test('an install from the pre-counter version receives exactly the four span starters, once', () => {
    const existing = twelve();
    const f = fixture(existing, { monitor: { '1': { preset: 'p3' } } }, true);
    f.run();
    const result = JSON.parse(f.disk.presets);
    assert.equal(result.length, 16);
    assert.deepEqual(result.slice(0, 12), existing, 'the twelve stay untouched');
    assert.deepEqual(result.slice(12).map(p => p.name), four().map(p => p.name));
    assert.equal(f.disk.starterGeneration, 2);
    assert.equal(f.disk.starterPresetsImported, true);
    assert.deepEqual(f.writes, ['presets', 'starterPresetsImported', 'starterGeneration']);
});

test('a start after the generation is recorded imports nothing at all', () => {
    const all = JSON.parse(schema.presets.default);
    const f = fixture(all, {}, true, 2);
    f.run();
    assert.equal(f.disk.presets, JSON.stringify(all));
    assert.deepEqual(f.writes, []);
});

test('a span starter deleted after the import is not restored', () => {
    const kept = JSON.parse(schema.presets.default).filter(p => p.name !== 'Two thirds right');
    const f = fixture(kept, {}, true, 2);
    f.run();
    assert.equal(f.disk.presets, JSON.stringify(kept));
    assert.deepEqual(f.writes, []);
});

test('an existing namesake keeps its own rules and the other three arrive', () => {
    const namesake = { id: 'mine', name: 'Wide center', rules: [{ min: 2, stacks: [4] }], custom: true };
    const f = fixture(twelve().concat([namesake]), {}, true);
    f.run();
    const result = JSON.parse(f.disk.presets);
    assert.equal(result.length, 16, 'three new starters plus the namesake, not four');
    assert.deepEqual(result[12], namesake, 'the edited namesake is untouched');
    assert.deepEqual(result.slice(13).map(p => p.name), ['Wide center + stacks', 'Two thirds left', 'Two thirds right']);
    assert.equal(result.filter(p => p.name === 'Wide center').length, 1);
    assert.equal(f.disk.starterGeneration, 2);
});

test('a fresh install records the generation without rewriting the starters', () => {
    const f = fixture(JSON.parse(schema.presets.default), {}, false);
    f.run();
    assert.equal(f.disk.presets, schema.presets.default);
    assert.deepEqual(f.writes, ['starterPresetsImported', 'starterGeneration']);
    assert.equal(f.disk.starterGeneration, 2);
});

test('an unreadable counter falls back to the marker instead of re-importing the twelve', () => {
    const f = fixture(twelve(), {}, true, 'nonsense');
    f.run();
    assert.equal(JSON.parse(f.disk.presets).length, 16, 'the marker says the twelve are there, so only the four arrive');
    assert.equal(f.disk.starterGeneration, 2);
    const fresh = fixture('[]', {}, false, 'nonsense');
    fresh.run();
    assert.equal(JSON.parse(fresh.disk.presets).length, 16, 'an unmarked install gets the whole set');
});

test('a failed generation save retries without appending the four twice', () => {
    const f = fixture(twelve(), {}, true);
    f.fail = 'starterGeneration';
    assert.throws(f.run, /save failure/);
    const retry = fixture(f.disk.presets, f.disk.layouts, f.disk.starterPresetsImported, f.disk.starterGeneration);
    retry.run();
    assert.equal(JSON.parse(retry.disk.presets).length, 16, 'the four are not duplicated');
    assert.deepEqual(retry.writes, ['starterPresetsImported', 'starterGeneration']);
});

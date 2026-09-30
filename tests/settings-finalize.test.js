'use strict';
// Tests that Config.destroy finalizes the ExtensionSettings object. Cinnamon keeps one
// settings slot per uuid (/usr/share/cinnamon/js/ui/settings.js L1014-1022, overwritten
// by every register, nulled by unregister via finalize L907-917); the settings dialog
// resolves through that slot (cinnamonDBus.js remoteUpdate). Without finalize the slot
// keeps the destroyed app's settings object and its bound callbacks fire while the
// extension is disabled. The slot model below replays those semantics with call
// counters; the source tests bind the assertions to the real code.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'greenTile.js'), 'utf8');

const configStart = src.indexOf('class Config');
const configEnd = src.indexOf(';// CONCATENATED MODULE: ../base/utils.ts');
const config = src.slice(configStart, configEnd);
const destroyStart = config.indexOf('this.destroy = () => {');
const destroyBody = config.slice(destroyStart, config.indexOf('this.app = app;'));

const enableStart = src.indexOf('const enable = () => {');
const enableBody = src.slice(enableStart);

test('Config.destroy finalizes the settings object', () => {
    assert.equal(destroyBody.match(/this\.settings\.finalize\(\)/g).length, 1);
});

test('finalize runs last, after every teardown step that still needs settings', () => {
    const finalizeAt = destroyBody.indexOf('this.settings.finalize()');
    assert.ok(finalizeAt > destroyBody.indexOf('tile_split_flush'), 'after tile_split_flush (writes layouts)');
    assert.ok(finalizeAt > destroyBody.indexOf('tile_border_shutdown'), 'after the last teardown helper');
    assert.ok(finalizeAt > destroyBody.indexOf('this.DisableHotkey()'), 'after the hotkey removal');
});

test('monitors-changed and disable destroy the app before the next registration', () => {
    const changedStart = enableBody.indexOf("Main.layoutManager.connect('monitors-changed'");
    const changedBody = enableBody.slice(changedStart);
    assert.ok(changedBody.indexOf('app.destroy()') > -1);
    assert.ok(changedBody.indexOf('app.destroy()') < changedBody.indexOf('app = new App(platform)'));
    const disableStart = enableBody.indexOf('const disable = () => {');
    const disableBody = enableBody.slice(disableStart, enableBody.indexOf('\n};', disableStart));
    assert.match(disableBody, /Main\.layoutManager\.disconnect\(monitorChangedSignal\)/);
    assert.match(disableBody, /app\.destroy\(\)/);
});

// The contract, modeled on /usr/share/cinnamon/js/ui/settings.js and cinnamonDBus.js:
// register stores one settings object per uuid (the slot, overwritten on every
// registration), unregister nulls it, and a dialog change calls the live slot's
// remoteUpdate, which fires the bound callbacks of that object.
const makeRegistry = () => {
    const slots = {};
    return {
        register: (uuid, obj) => { slots[uuid] = obj; },
        unregister: (uuid) => { slots[uuid] = null; },
        dialogChange: (uuid) => { const s = slots[uuid]; if (s) s.remoteUpdate(); },
    };
};

const makeConfig = (registry, uuid) => {
    const bound = { hotkeys: 0, updates: 0 };
    const settings = {
        bindProperty: () => { bound.hotkeys += 1; },
        finalize: () => registry.unregister(uuid),
        remoteUpdate: () => { bound.updates += 1; },
    };
    settings.bindProperty('hotkey');
    registry.register(uuid, settings);
    return { bound, settings };
};

test('a destroyed but not finalized app gets dialog changes while disabled (bug replay)', () => {
    const registry = makeRegistry();
    const dead = makeConfig(registry, 'greenTile@carsteneu');
    // disable() ran, nothing overwrote the slot
    registry.dialogChange('greenTile@carsteneu');
    assert.equal(dead.bound.updates, 1, 'bindings of the dead app fire while the extension is disabled');
});

test('a finalized app gets no dialog changes while disabled', () => {
    const registry = makeRegistry();
    const cfg = makeConfig(registry, 'greenTile@carsteneu');
    cfg.settings.finalize();
    registry.dialogChange('greenTile@carsteneu');
    assert.equal(cfg.bound.updates, 0);
});

test('after destroy + re-enable only the new object sees dialog changes', () => {
    const registry = makeRegistry();
    const first = makeConfig(registry, 'greenTile@carsteneu');
    first.settings.finalize();
    const second = makeConfig(registry, 'greenTile@carsteneu');
    registry.dialogChange('greenTile@carsteneu');
    assert.equal(second.bound.updates, 1);
    assert.equal(first.bound.updates, 0);
});

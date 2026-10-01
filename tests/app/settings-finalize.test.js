'use strict';
// Tests that Config.destroy finalizes the ExtensionSettings object. Cinnamon keeps one
// settings slot per uuid (/usr/share/cinnamon/js/ui/settings.js L1014-1022, overwritten
// by every register, nulled by unregister via finalize L907-917); the settings dialog
// resolves through that slot (cinnamonDBus.js remoteUpdate). Without finalize the slot
// keeps the destroyed app's settings object and its bound callbacks fire while the
// extension is disabled. The slot model below replays those semantics with call
// counters; the source tests bind the assertions to lib/app/config.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const configSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'app', 'config.js'), 'utf8');

const destroyStart = configSrc.indexOf('    destroy() {');
if (destroyStart === -1)
    {throw new Error('destroy method not found in lib/app/config.js');}
const destroyBody = configSrc.slice(destroyStart, configSrc.indexOf('\n    }\n', destroyStart));

const extensionSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'extension.js'), 'utf8');

test('Config.destroy finalizes the settings object', () => {
    assert.equal(destroyBody.match(/this\.settings\.finalize\(\)/g).length, 1);
});

test('finalize runs last, after every teardown step that still needs settings', () => {
    const finalizeAt = destroyBody.indexOf('this.settings.finalize()');
    assert.ok(finalizeAt > destroyBody.indexOf('this.app.split.flush('), 'after split.flush (writes pending layouts)');
    const themeAt = destroyBody.indexOf('this.app.theme.destroy()');
    const focusAt = destroyBody.indexOf('this.app.focus.destroy()');
    const borderAt = destroyBody.indexOf('this.app.border.destroy()');
    assert.ok(themeAt > -1 && focusAt > -1 && borderAt > -1,
        'the theme/focus/border runtime teardowns are still called');
    assert.ok(finalizeAt > borderAt && finalizeAt > themeAt && finalizeAt > focusAt,
        'after the last teardown helper');
    assert.ok(finalizeAt > destroyBody.indexOf('this.unregisterHotkeys()'), 'after the hotkey removal');
});

test('monitors-changed and disable destroy the app before the next registration', () => {
    // The monitors-changed handler lives in the extension session; it destroys
    // the old App before creating the next one, and disable() tears the session —
    // whose scope releases the handler first, BEFORE the App dies — down.
    const sessionSrc = fs.readFileSync(path.join(__dirname, '..', '..', 'lib', 'runtime', 'session.js'), 'utf8');
    const changedStart = sessionSrc.indexOf("'monitors-changed'");
    const changedBody = sessionSrc.slice(changedStart);
    assert.ok(changedBody.indexOf('this.app.destroy();') > -1, 'the handler destroys the old app');
    assert.ok(changedBody.indexOf('this.app.destroy();') < changedBody.indexOf('this._deps.createApp'),
        'destroy happens before the next registration');
    const enableStart = extensionSrc.indexOf('function enable() {');
    const enableBody = extensionSrc.slice(enableStart);
    const disableStart = enableBody.indexOf('function disable() {');
    const disableBody = enableBody.slice(disableStart, enableBody.indexOf('\n}\n', disableStart));
    assert.match(disableBody, /this\.session\.destroy\(\)/);
    assert.match(enableBody, /this\.session\.start\(\)/, 'enable creates and starts the session');
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

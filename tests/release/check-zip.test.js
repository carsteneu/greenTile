'use strict';
// check-zip.sh guards the published artifact's surface: the required runtime
// files must be present, dev-only material absent, and every shipped .js must
// parse. A tiny zip fixture built with the `zip` tool exercises each verdict.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT } = require('../helpers/cinnamon-loader');

const TMP = path.join(ROOT, '.yesmem', 'tmp');
fs.mkdirSync(TMP, { recursive: true });
const SCRIPT = path.join(ROOT, 'scripts', 'check-zip.sh');
const ROOTDIR = 'greenTile-9.9.9';

const REQUIRED = [
    'install.sh', 'update.sh',
    'greenTile@carsteneu/extension.js', 'greenTile@carsteneu/metadata.json',
    'greenTile@carsteneu/settings-schema.json', 'greenTile@carsteneu/stylesheet.css',
    'greenTile@carsteneu/icon.png', 'greenTile@carsteneu/LICENSE',
    'greenTile@carsteneu/lib/app/app.js', 'greenTile@carsteneu/po/de.po',
];

// Builds greenTile-9.9.9.zip with the required files, minus `omit`, plus `extra`.
function makeZip(t, { omit = '', extra = [] } = {}) {
    const dir = fs.mkdtempSync(path.join(TMP, 'check-zip-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    for (const rel of [...REQUIRED.filter((r) => r !== omit), ...extra]) {
        const p = path.join(dir, ROOTDIR, rel);
        fs.mkdirSync(path.dirname(p), { recursive: true });
        fs.writeFileSync(p, rel.endsWith('.js') ? 'var x = 1;\n' : `${rel}\n`);
    }
    const zip = path.join(dir, `${ROOTDIR}.zip`);
    const r = spawnSync('zip', ['-qr', zip, ROOTDIR], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, `zip fixture failed: ${r.stderr}`);
    return zip;
}

const run = (zip) => spawnSync('bash', [SCRIPT, zip], { encoding: 'utf8' });

test('a complete zip passes', (t) => {
    const r = run(makeZip(t));
    assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
    assert.match(r.stdout, /zip ok: \d+ entries/);
});

test('a zip missing a runtime file fails', (t) => {
    const r = run(makeZip(t, { omit: 'greenTile@carsteneu/extension.js' }));
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /missing in zip: greenTile@carsteneu\/extension\.js/);
});

test('a zip carrying dev-only files fails', (t) => {
    const r = run(makeZip(t, { extra: ['greenTile@carsteneu/package.json'] }));
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /dev-only or obsolete/);
});

test('no zip to check is reported, not passed silently', (t) => {
    const dir = fs.mkdtempSync(path.join(TMP, 'check-zip-empty-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const r = spawnSync('bash', [SCRIPT, path.join(dir, 'absent.zip')], { encoding: 'utf8' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /no zip found/);
});

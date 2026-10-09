'use strict';
// build-spices.sh assembles the Cinnamon Spices submission layout. validate-spice
// and the Spices CI check that layout, so its invariants are pinned here: listing
// files at the top, the runtime files under files/<UUID>/, nothing dev-only.
// The tests assemble from HEAD (always present, even in a shallow CI checkout) —
// the released tag is the script's default, not what this test needs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ROOT, UUID } = require('../helpers/cinnamon-loader');

const TMP = path.join(ROOT, '.yesmem', 'tmp');
fs.mkdirSync(TMP, { recursive: true });
const SCRIPT = path.join(ROOT, 'scripts', 'build-spices.sh');

const build = (dest, env = {}) =>
    spawnSync('bash', [SCRIPT, dest], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...env } });

/** Assembles into a fresh temp dir and returns the layout root. */
function assemble(t) {
    const dir = fs.mkdtempSync(path.join(TMP, 'spices-layout-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const dest = path.join(dir, UUID);
    const r = build(dest, { SPICES_REF: 'HEAD' });
    assert.equal(r.status, 0, `${r.stdout}${r.stderr}`);
    return dest;
}

test('the assembled layout has the Spices structure', (t) => {
    const dest = assemble(t);

    for (const f of ['info.json', 'README.md', 'screenshot.png'])
        { assert.ok(fs.existsSync(path.join(dest, f)), `missing ${f}`); }

    // files/ must contain ONLY the UUID directory (validate-spice rejects more)
    assert.deepEqual(fs.readdirSync(path.join(dest, 'files')), [UUID]);

    const files = path.join(dest, 'files', UUID);
    for (const rel of ['extension.js', 'metadata.json', 'settings-schema.json',
        'stylesheet.css', 'icon.png', 'LICENSE', 'lib/app/app.js', 'po/de.po',
        `po/${UUID}.pot`])
        { assert.ok(fs.existsSync(path.join(files, rel)), `missing files/${UUID}/${rel}`); }
});

test('the runtime tree carries no dev-only or forbidden file', (t) => {
    const files = path.join(assemble(t), 'files', UUID);
    for (const rel of ['install.sh', 'update.sh', 'package.json', 'package-lock.json',
        'tsconfig.json', 'eslint.config.js', 'tests', 'types', 'scripts', '.github'])
        { assert.ok(!fs.existsSync(path.join(files, rel)), `dev-only file in layout: ${rel}`); }
});

test('po/ holds only .po and .pot, with exactly one template', (t) => {
    const po = path.join(assemble(t), 'files', UUID, 'po');
    const entries = fs.readdirSync(po);
    assert.ok(entries.every((f) => f.endsWith('.po') || f.endsWith('.pot')), entries.join(' '));
    assert.equal(entries.filter((f) => f.endsWith('.pot')).length, 1);
    assert.ok(entries.filter((f) => f.endsWith('.po')).length >= 19);
});

test('metadata and info carry the submitted identity', (t) => {
    const dest = assemble(t);
    const files = path.join(dest, 'files', UUID);
    const metadata = JSON.parse(fs.readFileSync(path.join(files, 'metadata.json'), 'utf8'));
    assert.equal(metadata.uuid, UUID);
    assert.ok(metadata.name && metadata.description && metadata.version);
    const info = JSON.parse(fs.readFileSync(path.join(dest, 'info.json'), 'utf8'));
    assert.ok(info.author && !/\s/.test(info.author));
});

test('an unknown ref fails instead of assembling a wrong tree', (t) => {
    const dir = fs.mkdtempSync(path.join(TMP, 'spices-badref-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const r = build(path.join(dir, UUID), { SPICES_REF: 'v0.0.0-nope' });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /ref 'v0\.0\.0-nope' not found/);
    assert.ok(!fs.existsSync(path.join(dir, UUID, 'info.json')));
});

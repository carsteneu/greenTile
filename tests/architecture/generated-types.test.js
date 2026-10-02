'use strict';
// Drift guard for the generated type mirror (types/xlet/**): the mirror is
// the typed cross-module contract (see types/cinnamon.d.ts XletTree) and is
// GENERATED from lib/ by scripts/generate-xlet-types.mjs (npm run gen:types).
// A mirror that does not match the shipped sources is a silent contract lie,
// so this test regenerates into a temp dir and demands byte equality with the
// committed mirror for every shipped module.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../helpers/cinnamon-loader');

const libFiles = (function collect(dir, prefix) {
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

test('the generated type mirror matches the shipped sources exactly', () => {
    const tmp = path.join(ROOT, '.yesmem', 'tmp', 'xlet-drift-check');
    const gen = spawnSync('node', [path.join(ROOT, 'scripts', 'generate-xlet-types.mjs'), '--out', tmp], { encoding: 'utf8' });
    assert.equal(gen.status, 0, 'generator failed:\n' + gen.stderr);
    try {
        assert.ok(libFiles.length >= 40, 'the shipped tree was actually scanned');
        for (const rel of libFiles) {
            // the mirror mirrors lib/ contents WITHOUT the lib/ prefix
            const mirrorRel = rel.replace(/^lib\//, '').replace(/\.js$/, '.d.ts');
            const committed = path.join(ROOT, 'types', 'xlet', mirrorRel);
            const fresh = path.join(tmp, mirrorRel);
            assert.ok(fs.existsSync(committed), 'missing committed mirror for ' + rel + ' — run npm run gen:types');
            assert.ok(fs.existsSync(fresh), 'generator produced no mirror for ' + rel);
            assert.equal(fs.readFileSync(fresh, 'utf8'), fs.readFileSync(committed, 'utf8'),
                'mirror drift for ' + rel + ' — regenerate with npm run gen:types and commit');
        }
    }
    finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});

test('the ambient consumer tree wires the mirror, not raw lib paths', () => {
    const src = fs.readFileSync(path.join(ROOT, 'types', 'cinnamon.d.ts'), 'utf8');
    assert.ok(src.includes("typeof import('./xlet/app/app')"), 'XletTree resolves through the generated mirror');
    assert.doesNotMatch(src, /typeof import\('\.\.\/lib\//, 'no direct lib .js typing — the mirror is the contract');
});

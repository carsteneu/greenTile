'use strict';
// Keeps tsconfig rootDirs in sync with the lib/ layers: Cinnamon resolves
// every require against the xlet root (fileUtils.js), so a root-relative
// require only type-checks when the importing directory is listed as a
// rootDir. A new directory under lib/ must therefore be added there — this
// test fails until it is, instead of falling back to untyped modules.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../helpers/cinnamon-loader');

const tsconfig = JSON.parse(fs.readFileSync(path.join(ROOT, 'tsconfig.json'), 'utf8'));

const dirs = (() => {
    const out = [];
    const walk = (dir, rel) => {
        const hasJs = fs.readdirSync(dir, { withFileTypes: true }).some((e) => e.isFile() && e.name.endsWith('.js'));
        if (hasJs && rel) {
            out.push(rel);
        }
        for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            if (entry.isDirectory()) {
                walk(path.join(dir, entry.name), rel ? `${rel}/${entry.name}` : entry.name);
            }
        }
    };
    walk(path.join(ROOT, 'lib'), '');
    return out.sort();
})();

test('tsconfig rootDirs covers every lib/ directory containing .js files', () => {
    const rootDirs = tsconfig.compilerOptions.rootDirs;
    assert.ok(Array.isArray(rootDirs), 'tsconfig.compilerOptions.rootDirs is missing');
    for (const dir of dirs) {
        const key = `lib/${dir}`;
        assert.ok(rootDirs.includes(key), `rootDirs is missing '${key}' — root-relative requires inside it would type-check as untyped`);
    }
});

test('rootDirs only references directories that exist', () => {
    for (const entry of tsconfig.compilerOptions.rootDirs) {
        if (entry === '.') {
            continue;
        }
        assert.ok(fs.existsSync(path.join(ROOT, entry)), `rootDirs lists non-existent '${entry}'`);
    }
});

'use strict';
// Keeps the tsconfig directory inventory aligned with JavaScript-containing
// lib/ layers and checks that its entries still exist. Runtime dependencies use
// the native XLET namespace; generated declarations provide cross-module types.
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
        assert.ok(rootDirs.includes(key), `rootDirs is missing JavaScript-containing '${key}'`);
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

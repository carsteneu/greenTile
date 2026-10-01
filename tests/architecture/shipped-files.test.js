'use strict';
// Release surface guard: parses the cp lines of build-release.sh and freezes
// what ships. Nothing dev-only (npm/types/CI/test material) may reach the zip:
// the release must stay byte-list-identical to the pre-tooling state. The lib/
// folder is copied recursively, so the test also asserts lib ships .js files
// only — a stray .d.ts or config would ship unnoticed otherwise.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../helpers/cinnamon-loader');

const script = fs.readFileSync(path.join(ROOT, 'build-release.sh'), 'utf8');
const cpLines = script.split('\n').filter((l) => l.trim().startsWith('cp '));

test('build-release.sh copies exactly the known root files onto the zip', () => {
    const rootCp = cpLines.find((l) => l.trim().startsWith('cp extension.js'));
    assert.ok(rootCp, 'the root-file cp line is missing');
    const entries = rootCp.trim().replace(/^cp\s+/, '').split(/\s+/).filter((e) => !e.includes('$STAGE'));
    assert.deepEqual(entries, ['extension.js', 'metadata.json', 'settings-schema.json', 'stylesheet.css', 'icon.png'],
        'the shipped root file set changed — keep the release list identical');
});

test('no dev-only path reaches the release script', () => {
    const forbidden = [
        'package.json', 'package-lock.json', 'tsconfig', 'eslint', 'node_modules',
        'tests', 'types', '.yesmem', 'docs', 'README', 'FEATURES', '.github', 'ci.yml',
    ];
    for (const line of cpLines) {
        for (const word of forbidden) {
            assert.ok(!line.includes(word), `cp line ships dev-only material: '${word}' in ${line.trim()}`);
        }
    }
});

test('the set of cp source paths is exactly the known release list', () => {
    const sources = cpLines
        .map((l) => l.trim().replace(/^cp\s+(?:-R\s+)?/, '').replace(/"/g, '').split(/\s+/))
        .flat()
        .filter((e) => !e.includes('$STAGE'))
        .sort();
    assert.deepEqual(sources, [
        'extension.js',
        'icon.png',
        'install.sh',
        'lib',
        'metadata.json',
        'po/*.po',
        'settings-schema.json',
        'stylesheet.css',
        'update.sh',
    ], 'the cp source set changed — keep the release list identical');
});

test('lib/ ships .js files only — the build copies it wholesale', () => {
    assert.ok(cpLines.some((l) => /cp\s+-R\s+lib\s+/.test(l)), 'lib/ must be copied recursively');
    const collect = (dir, prefix) => {
        const out = [];
        for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
            const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
            if (entry.isDirectory()) {
                out.push(...collect(path.join(dir, entry.name), rel));
            }
            else {
                out.push(rel);
            }
        }
        return out;
    };
    const files = collect(path.join(ROOT, 'lib'), 'lib');
    assert.ok(files.length > 0, 'lib/ must not be empty');
    for (const file of files) {
        assert.ok(file.endsWith('.js'), `${file} would ship in the zip but is not a .js file`);
        assert.ok(!file.includes('test'), `${file} must not carry test material`);
    }
});

test('po/ ships only .po files, scripts stay explicit', () => {
    assert.ok(cpLines.some((l) => l.includes('cp po/*.po')), 'the po cp line must ship *.po only');
    const poDir = path.join(ROOT, 'po');
    for (const file of fs.readdirSync(poDir)) {
        assert.ok(file.endsWith('.po') || file.endsWith('.pot'),
            `${file} in po/ is neither .po nor .pot — the cp po/*.po line would silently skip or ship it`);
    }
    assert.ok(cpLines.some((l) => l.includes('install.sh')), 'install.sh ships');
    assert.ok(cpLines.some((l) => l.includes('update.sh')), 'update.sh ships');
});

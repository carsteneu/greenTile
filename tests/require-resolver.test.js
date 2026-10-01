'use strict';
// Shipped-set integrity: every require() across the shipped .js files must resolve
// the way Cinnamon's fileUtils.js requireModule resolves — relative paths against
// the xlet root, '.js' appended, '../' forbidden (fileUtils mangles it into
// '.<name>') — and the target must exist inside the shipped set. Every lib module
// must carry an explicit column-0 module.exports line; without one Cinnamon's
// auto-export scan would export every top-level name.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const shippedJs = (function collect(dir, prefix) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory())
            out.push(...collect(path.join(dir, entry.name), rel));
        else if (entry.name.endsWith('.js'))
            out.push(rel);
    }
    return out;
})(path.join(ROOT, 'lib'), 'lib').concat(['extension.js']);

const requireRe = /\brequire\(\s*(['"])([^'"\n]+)\1\s*\)/g;

const resolveCinnamon = (spec) => {
    // only the real Cinnamon import namespaces reach the imports global at runtime
    // (fileUtils.js checks gi., ui., misc., perf. and the importNames list) — anything
    // else must resolve as a root-relative file
    if (/^(?:gi|ui|misc|perf)\./.test(spec))
        return null;
    assert.ok(!spec.includes('..'), `require('${spec}') uses '../' — fileUtils turns it into '.<name>' (broken)`);
    assert.ok(spec.startsWith('./'), `require('${spec}') is not root-relative './'`);
    const target = spec.replace(/\.\//g, '');
    return path.join(ROOT, target.endsWith('.js') ? target : target + '.js');
};

test('every require() in the shipped files resolves to a shipped file (Cinnamon rules)', () => {
    let count = 0;
    for (const file of shippedJs) {
        const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
        for (const match of src.matchAll(requireRe)) {
            const abs = resolveCinnamon(match[2]);
            if (abs == null)
                continue;
            count += 1;
            assert.ok(shippedJs.includes(path.relative(ROOT, abs).replace(/\\/g, '/')),
                `require('${match[2]}') in ${file} does not point into the shipped set (${abs})`);
            assert.ok(fs.existsSync(abs), `require('${match[2]}') in ${file}: target missing (${abs})`);
        }
    }
    assert.ok(count >= 20, `expected the shipped set to carry requires, found ${count}`);
});

test('every lib module has an explicit column-0 module.exports', () => {
    for (const file of shippedJs.filter((f) => f.startsWith('lib/'))) {
        const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
        assert.match(src, /^module\.exports(\.[a-zA-Z0-9_$]+)?\s*=/m,
            `${file} lacks an explicit module.exports — Cinnamon would auto-export every top-level name`);
    }
});

'use strict';
// Translation-drift guard: every literal handed to `_()` or `translate()`
// must exist as a msgid in the pot. xgettext only knows the `_` keyword, so
// the `translate:` alias wired in lib/app/app.js is invisible to makepot —
// this test makes that gap loud instead of silently dropping translations.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../helpers/cinnamon-loader');

const pot = fs.readFileSync(path.join(ROOT, 'po', 'greenTile@carsteneu.pot'), 'utf8');
// msgid values wrap across lines (msgid "" + continuation lines) — unwrap them.
const msgids = new Set();
for (const m of pot.matchAll(/^msgid (?:"([^"]*)"[^\n]*\n)((?:"([^"]*)"[^\n]*\n)*)/gm)) {
    const value = (m[1] + (m[2].matchAll ? [...m[2].matchAll(/"([^"]*)"/g)].map((c) => c[1]).join('') : m[2]));
    if (value) {
        msgids.add(value);
    }
}

const literals = new Set();
const scan = (file) => {
    const src = fs.readFileSync(file, 'utf8');
    // `_('literal')` — the underscore form, at call position.
    for (const m of src.matchAll(/(^|[^\w$])_\(\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g)) {
        literals.add(m[2]);
    }
    // `translate('literal')` — injected as `_`, not extractable by xgettext.
    for (const m of src.matchAll(/(?<![\w$])translate\(\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g)) {
        literals.add(m[1]);
    }
};

const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            walk(path.join(dir, entry.name));
        }
        else if (entry.name.endsWith('.js')) {
            scan(path.join(dir, entry.name));
        }
    }
};

scan(path.join(ROOT, 'extension.js'));
walk(path.join(ROOT, 'lib'));

test('every translatable literal (_ / translate) has a msgid in the pot', () => {
    assert.ok(literals.size > 0, 'expected to find _()/translate() literals in shipped code');
    const missing = [];
    for (const raw of literals) {
        const s = raw.slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
        if (!msgids.has(s)) {
            missing.push(s);
        }
    }
    assert.deepEqual(missing.map((s) => [...s]).sort(), [],
        `literal(s) used in code but missing from the pot: ${JSON.stringify(missing)}`);
});

'use strict';
// Static step-3 guard: extension.js, lib/app/** and lib/runtime/** must not
// declare mutable module-level state — no top-level let/var and no top-level
// mutable const (object/array literal, new Map/Set/WeakMap, Object.create)
// unless wrapped in Object.freeze. The extension session rides the exports
// object (Cinnamon calls enable()/disable() member-style), never a module
// variable. Functions, classes, require results (including the Cinnamon
// root-relative destructuring) and primitives are fine: they are immutable
// bindings or per-load values, not shared mutable state.
//
// The check is line-shaped (column 0 = top level in this codebase) on purpose:
// without a new dependency there is no full JS parse, and the shipped files keep
// every top-level statement on one line. Self-tested against synthetic snippets
// below, so the guard's own semantics stay pinned.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./cinnamon-loader');

const FILES = ['extension.js'].concat(
    ['app', 'runtime', 'ui', 'tiling'].flatMap((sub) => fs.readdirSync(path.join(ROOT, 'lib', sub))
        .filter((f) => f.endsWith('.js'))
        .map((f) => path.join('lib', sub, f)))
        .sort()
);

const MUTABLE_RHS = /^(\{|\[|new Map\(|new Set\(|new WeakMap\(|Object\.create\s*\()/;

const findViolations = (src, file) => {
    const problems = [];
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (/^(let|var) /.test(line)) {
            problems.push(file + ':' + (i + 1) + ' top-level ' + line.slice(0, 60));
            continue;
        }
        const m = /^const ([A-Za-z$_][\w$]*)\s*=\s*(.*)$/.exec(line);
        if (!m)
            continue;
        let rhs = m[2].trim();
        if (rhs === '') {
            // value may start on the next line
            let j = i + 1;
            while (j < lines.length && lines[j].trim() === '')
                j++;
            rhs = j < lines.length ? lines[j].trim() : '';
        }
        if (/^Object\.freeze\s*\(/.test(rhs))
            continue;
        if (MUTABLE_RHS.test(rhs))
            problems.push(file + ':' + (i + 1) + ' mutable top-level const ' + m[1] + ' = ' + rhs.slice(0, 40));
    }
    return problems;
};

test('guard flags mutable top-level state and accepts the allowed forms', () => {
    assert.equal(findViolations('let x = 0;', 'f.js').length, 1);
    assert.equal(findViolations('var x = 1;', 'f.js').length, 1);
    assert.equal(findViolations('const x = {};', 'f.js').length, 1);
    assert.equal(findViolations('const x = [];', 'f.js').length, 1);
    assert.equal(findViolations('const x = new Map();', 'f.js').length, 1);
    assert.equal(findViolations('const x = new Set();', 'f.js').length, 1);
    assert.equal(findViolations('const x = new WeakMap();', 'f.js').length, 1);
    assert.equal(findViolations('const x = Object.create(null);', 'f.js').length, 1);
    assert.equal(findViolations('const x =\n{};', 'f.js').length, 1, 'value on the next line is checked too');
    assert.equal(findViolations('const x = Object.freeze({});', 'f.js').length, 0);
    assert.equal(findViolations('const x = Object.freeze(new Map());', 'f.js').length, 0);
    assert.equal(findViolations('const f = () => {};', 'f.js').length, 0, 'functions allowed');
    assert.equal(findViolations('const f = function () {};', 'f.js').length, 0, 'functions allowed');
    assert.equal(findViolations('const f = (a) => ({ ...a });', 'f.js').length, 0, 'arrow params are not an object literal');
    assert.equal(findViolations('class C {}', 'f.js').length, 0, 'classes allowed');
    assert.equal(findViolations('const { a, b } = require("./x");', 'f.js').length, 0, 'require destructuring allowed');
    assert.equal(findViolations('const Main = imports.ui.main;', 'f.js').length, 0, 'imports allowed');
    assert.equal(findViolations('const N = 400 * 1000;', 'f.js').length, 0, 'primitives allowed');
    assert.equal(findViolations('const s = "text";', 'f.js').length, 0, 'primitives allowed');
    // indented declarations are function-local, not module state
    assert.equal(findViolations('    let x = 0;', 'f.js').length, 0, 'only column 0 is module level');
});

test('extension.js, lib/app/**, lib/runtime/**, lib/ui/** and lib/tiling/** carry no mutable module-level state', () => {
    const seen = [];
    for (const file of FILES) {
        const violations = findViolations(fs.readFileSync(path.join(ROOT, file), 'utf8'), file);
        seen.push(file);
        assert.deepEqual(violations, [], file + ' has top-level mutable state');
    }
    assert.ok(seen.includes('extension.js'), 'extension.js covered');
    assert.ok(seen.includes(path.join('lib/app', 'app.js')), 'lib/app/app.js covered');
    assert.ok(seen.includes(path.join('lib/app', 'config.js')), 'lib/app/config.js covered');
    assert.ok(seen.includes(path.join('lib/app', 'settings-keys.js')), 'lib/app/settings-keys.js covered');
    assert.ok(seen.includes(path.join('lib/runtime', 'hotkeys.js')), 'lib/runtime/hotkeys.js covered');
    assert.ok(seen.includes(path.join('lib/runtime', 'exclusions.js')), 'lib/runtime/exclusions.js covered');
    assert.ok(seen.includes(path.join('lib/runtime', 'panel-state.js')), 'lib/runtime/panel-state.js covered');
    assert.ok(seen.includes(path.join('lib/ui', 'panel.js')), 'lib/ui/panel.js covered');
    assert.ok(seen.includes(path.join('lib/ui', 'editor.js')), 'lib/ui/editor.js covered');
    assert.ok(seen.includes(path.join('lib/ui', 'draw.js')), 'lib/ui/draw.js covered');
    assert.ok(seen.includes(path.join('lib/ui', 'i18n.js')), 'lib/ui/i18n.js covered');
    assert.ok(seen.includes(path.join('lib/tiling', 'layout.js')), 'lib/tiling/layout.js covered');
    assert.ok(seen.includes(path.join('lib/tiling', 'retile.js')), 'lib/tiling/retile.js covered');
});

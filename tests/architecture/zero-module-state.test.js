'use strict';
// Static step-3 guard: extension.js, lib/app/** and lib/runtime/** must not
// declare mutable module-level state — no top-level let, no reassignment of
// exported bindings and no top-level mutable const (object/array literal, new
// Map/Set/WeakMap, Object.create) unless wrapped in Object.freeze. Top-level
// `var` is the native exporter's public-export mechanism (CJS exposes only
// var/function declarations), so a var is accepted when its value is a
// function/arrow/class expression, a primitive or an Object.freeze — and only
// while the binding is never reassigned. The single documented exception is
// extension.js's module-private lifecycle holder (const lifecycle =
// { session: null }): the session can no longer ride `this`, because the
// extensibility of a natively imported namespace is not a contract to rely
// on; the holder is owned by exactly this one module and re-created by an
// xlet reload (module-cache clear).
//
// The check is line-shaped (column 0 = top level in this codebase) on purpose:
// without a new dependency there is no full JS parse, and the shipped files keep
// every top-level statement on one line. Self-tested against synthetic snippets
// below, so the guard's own semantics stay pinned.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../helpers/cinnamon-loader');

const FILES = ['extension.js'].concat(
    ['app', 'model', 'runtime', 'ui', 'tiling'].flatMap((sub) => fs.readdirSync(path.join(ROOT, 'lib', sub))
        .filter((f) => f.endsWith('.js'))
        .map((f) => path.join('lib', sub, f)))
        .sort()
);

const MUTABLE_RHS = /^(\{|\[|new Map\(|new Set\(|new WeakMap\(|Object\.create\s*\()/;
const LIFECYCLE_HOLDER = /^const lifecycle = \{ session: null \};$/;
const VAR_RE = /^var\s+([A-Za-z$_][\w$]*)\s*=\s*(.*)$/;

const findViolations = (src, file, opts = {}) => {
    const isEntry = opts.isEntry === true || file === 'extension.js';
    const problems = [];
    const lines = src.split('\n');
    const varDecls = new Map();
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // the lifecycle holder is the ONE allowed exception and only in the
        // entry — anywhere else the pattern is smuggled module state
        if (LIFECYCLE_HOLDER.test(line) && isEntry) {
            continue;
        }
        const letMatch = /^let\s/.test(line) ? line : null;
        if (letMatch !== null) {
            problems.push(file + ':' + (i + 1) + ' top-level ' + line.slice(0, 60));
            continue;
        }
        const varMatch = VAR_RE.exec(line);
        if (varMatch) {
            const [, name, rhs] = varMatch;
            const isMutable = MUTABLE_RHS.test(rhs.trim())
                && !/^(?:\(|function\b|class\b|Object\.freeze\b)/.test(rhs.trim());
            if (isMutable) {
                problems.push(file + ':' + (i + 1) + ' mutable top-level var ' + name + ' = ' + rhs.slice(0, 40));
            }
            // exported bindings are tracked for reassignment regardless: the
            // native exporter makes reassigning a var a public-surface change
            varDecls.set(name, i);
            continue;
        }
        const m = /^const ([A-Za-z$_][\w$]*)\s*=\s*(.*)$/.exec(line);
        if (!m)
            {continue;}
        let rhs = m[2].trim();
        if (rhs === '') {
            // value may start on the next line
            let j = i + 1;
            while (j < lines.length && lines[j].trim() === '')
                {j++;}
            rhs = j < lines.length ? lines[j].trim() : '';
        }
        if (/^Object\.freeze\s*\(/.test(rhs))
            {continue;}
        if (MUTABLE_RHS.test(rhs))
            {problems.push(file + ':' + (i + 1) + ' mutable top-level const ' + m[1] + ' = ' + rhs.slice(0, 40));}
    }
    for (const [name, declLine] of varDecls) {
        const reassign = new RegExp('^\\s*' + name + '\\s*=(?!=)');
        const incDec = new RegExp('^\\s*' + name + '\\s*(\\+\\+|--);');
        const compound = new RegExp('^\\s*' + name + '\\s*(\\+=|-=|\\*=|/=|%=|\\*\\*=|\\?\\?=|\\|\\|=)');
        for (let i = 0; i < lines.length; i++) {
            if (i !== declLine && (reassign.test(lines[i]) || incDec.test(lines[i]) || compound.test(lines[i]))) {
                problems.push(file + ':' + (i + 1) + ' exported binding reassigned: ' + name);
            }
        }
    }
    return problems;
};

test('guard flags mutable top-level state and accepts the allowed forms', () => {
    assert.equal(findViolations('let x = 0;', 'f.js').length, 1);
    assert.equal(findViolations('var x = 1;', 'f.js').length, 0, 'var export with primitive value is the native export mechanism');
    assert.equal(findViolations('var x = () => {};', 'f.js').length, 0, 'var export with arrow value allowed');
    assert.equal(findViolations('var x = class {};', 'f.js').length, 0, 'var-bound class expression allowed');
    assert.equal(findViolations('var x = Object.freeze({});', 'f.js').length, 0);
    assert.equal(findViolations('var x = {};', 'f.js').length, 1, 'var export of a mutable literal flagged');
    assert.equal(findViolations('var x = {}\nvar y = 1;\nx = y;', 'f.js').length, 2, 'reassignment of an exported binding flagged');
    assert.equal(findViolations('var counter = 0;\ncounter++;', 'f.js').length, 1, 'increment of an exported binding flagged');
    assert.equal(findViolations('var counter = 0;\ncounter += 1;', 'f.js').length, 1, 'compound assignment to an exported binding flagged');
    assert.equal(findViolations('var x = {};', 'f.js').length, 1);
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
    assert.equal(findViolations('class C {}', 'f.js').length, 0, 'classes allowed (private in the native namespace)');
    // the lifecycle holder is the documented exception — but ONLY in the entry
    assert.equal(findViolations('const lifecycle = { session: null };', 'extension.js').length, 0, 'the extension.js lifecycle holder is the documented exception');
    assert.equal(findViolations('const lifecycle = { session: null };', 'f.js').length, 1, 'the holder pattern outside the entry is smuggled module state (reviewer mutation)');
    assert.equal(findViolations('const other = { session: null };', 'f.js').length, 1, 'only the lifecycle holder pattern is exempt');
    assert.equal(findViolations('const { a, b } = XLET.lib.model.split;', 'f.js').length, 0, 'importer destructuring allowed');
    assert.equal(findViolations('const Main = imports.ui.main;', 'f.js').length, 0, 'imports allowed');
    assert.equal(findViolations('const N = 400 * 1000;', 'f.js').length, 0, 'primitives allowed');
    assert.equal(findViolations('const s = "text";', 'f.js').length, 0, 'primitives allowed');
    // indented declarations are function-local, not module state
    assert.equal(findViolations('    let x = 0;', 'f.js').length, 0, 'only column 0 is module level');
});

test('extension.js, lib/app/**, lib/model/**, lib/runtime/**, lib/ui/** and lib/tiling/** carry no mutable module-level state', () => {
    const seen = [];
    for (const file of FILES) {
        const violations = findViolations(fs.readFileSync(path.join(ROOT, file), 'utf8'), file);
        seen.push(file);
        assert.deepEqual(violations, [], file + ' has top-level mutable state');
    }
    assert.ok(seen.includes('extension.js'), 'extension.js covered');
    assert.ok(seen.includes(path.join('lib/app', 'app.js')), 'lib/app/app.js covered');
    assert.ok(seen.includes(path.join('lib/app', 'config.js')), 'lib/app/config.js covered');
    assert.ok(seen.includes(path.join('lib/model', 'settings-keys.js')), 'lib/model/settings-keys.js covered');
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

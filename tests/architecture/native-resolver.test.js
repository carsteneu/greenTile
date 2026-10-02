'use strict';
// Shipped-set integrity after the native-importer migration: no shipped file
// may carry the legacy CommonJS machinery (require(), module.exports, bare
// exports.*), every module reference must go through the xlet importer
// (`XLET.lib…` / the entry wiring) and resolve to a shipped file, and every
// destructured symbol must be a public native export (top-level var or
// function declaration) of its target — private const/let/class names stay
// inaccessible, exactly as CJS exposes only var/function.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');

const shippedJs = (function collect(dir, prefix) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory())
            {out.push(...collect(path.join(dir, entry.name), rel));}
        else if (entry.name.endsWith('.js'))
            {out.push(rel);}
    }
    return out;
})(path.join(ROOT, 'lib'), 'lib').concat(['extension.js']);

// XLET.<chain>: dotted segments are plain identifiers; hyphenated file names
// (settings-keys, panel-size, focus-nav) MUST use the bracket form, otherwise
// the chain parses as a subtraction. Both forms normalize to a lib path here.
const chainRe = /XLET\.lib((?:\.[A-Za-z_$][\w$]*|\['[^']+'\])+)/g;
const segmentRe = /\.([A-Za-z_$][\w$]*)|\['([^']+)'\]/g;

const publicNamesOf = (src) => {
    const names = new Set();
    for (const m of src.matchAll(/^var\s+([A-Za-z_$][\w$]*)/gm)) { names.add(m[1]); }
    for (const m of src.matchAll(/^function\s+([A-Za-z_$][\w$]*)/gm)) { names.add(m[1]); }
    return names;
};

test('no legacy CommonJS machinery stays in the shipped set', () => {
    for (const file of shippedJs) {
        const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
        assert.doesNotMatch(src, /\brequire\s*\(/, file + ' uses require() — native imports only');
        assert.doesNotMatch(src, /^module\.exports(\.[a-zA-Z0-9_$]+)?\s*=/m, file + ' sets module.exports');
        assert.doesNotMatch(src, /(^|\n)exports\.[a-zA-Z0-9_$]+\s*=/, file + ' writes bare exports.' + file);
    }
});

test('every XLET reference resolves to a shipped file', () => {
    let count = 0;
    for (const file of shippedJs) {
        const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
        for (const match of src.matchAll(chainRe)) {
            const segments = [];
            let m;
            segmentRe.lastIndex = 0;
            while ((m = segmentRe.exec(match[1])) !== null) {
                segments.push(m[1] || m[2]);
            }
            count += 1;
            const target = ['lib', ...segments].join('/') + '.js';
            assert.ok(shippedJs.includes(target),
                `XLET.lib${match[1]} in ${file} does not point into the shipped set (${target})`);
            assert.ok(fs.existsSync(path.join(ROOT, target)), `target missing: ${target}`);
        }
    }
    assert.ok(count >= 40, `expected the shipped set to wire through the importer, found ${count} edges`);
});

test('every consumed symbol is a public native export of its target', () => {
    const publics = new Map();
    for (const file of shippedJs) {
        publics.set(file, publicNamesOf(fs.readFileSync(path.join(ROOT, file), 'utf8')));
    }
    let checked = 0;
    for (const file of shippedJs) {
        const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
        for (const match of src.matchAll(/const \{([^}]+)\} = (XLET\.lib(?:\.[A-Za-z_$][\w$]*|\['[^']+'\])+)/g)) {
            const segments = [];
            let m;
            segmentRe.lastIndex = 0;
            while ((m = segmentRe.exec(match[2].slice('XLET.lib'.length))) !== null) {
                segments.push(m[1] || m[2]);
            }
            const target = ['lib', ...segments].join('/') + '.js';
            const allowed = publics.get(target);
            for (const raw of match[1].split(',')) {
                const name = raw.trim();
                if (!name) { continue; }
                checked += 1;
                assert.ok(allowed.has(name),
                    `${file} consumes '${name}' from ${target}, but it is not a public native export there (var/function only)`);
            }
        }
    }
    assert.ok(checked >= 80, `expected a dense public surface check, verified ${checked} symbols`);
});

test('the entry wires only through the importer, not require()', () => {
    const src = fs.readFileSync(path.join(ROOT, 'extension.js'), 'utf8');
    assert.doesNotMatch(src, /\brequire\s*\(/, 'extension.js must not require()');
    assert.match(src, /const XLET = imports\.extensions\['greenTile@carsteneu'\];/,
        'the entry resolves its modules through the xlet importer');
});

// XLET must appear only as the canonical declaration or as the head of a
// XLET.lib member chain, and imports.extensions only inside that declaration —
// a second occurrence is a direct-route import that bypasses every chain
// guard. Returns violation strings for the given (fileName, source) pairs.
const xletShapeViolations = (file, rawSrc) => {
    const declRe = /^const XLET = imports\.extensions\['greenTile@carsteneu'\];$/;
    const noComments = rawSrc.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const violations = [];
    for (const line of noComments.split('\n')) {
        if (declRe.test(line)) {
            continue;
        }
        if (/imports\.extensions/.test(line)) {
            violations.push(file + ' uses imports.extensions outside the XLET declaration: ' + line.trim().slice(0, 70));
        }
        // aliasing a bare XLET.lib chain into a local binding routes module
        // access around the static chain scan — destructuring from a chain
        // stays canonical
        if (/(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*=\s*XLET\.lib[\w$'\]\[./-]*\s*;?\s*$/.test(line)) {
            violations.push(file + ' aliases the module tree: ' + line.trim().slice(0, 70));
        }
        let at = line.indexOf('XLET');
        while (at !== -1) {
            const after = line.slice(at + 'XLET'.length);
            if (!after.startsWith('.lib'))
                {violations.push(file + ': ' + line.trim().slice(0, 70));}
            at = line.indexOf('XLET', at + 1);
        }
    }
    return violations;
};

test('XLET appears only as the declaration or a XLET.lib chain — no dynamic access, aliasing or direct routes', () => {
    // the resolver/layer/cycle guards scan static `XLET.lib…` chains; any
    // other use of XLET (indexing it, aliasing it into a variable, passing
    // it around) or of imports.extensions (direct route) would route module
    // access around those guards
    const violations = [];
    for (const file of shippedJs) {
        violations.push(...xletShapeViolations(file, fs.readFileSync(path.join(ROOT, file), 'utf8')));
    }
    assert.deepEqual(violations, [], 'XLET used outside the declaration/member-chain form');
});

test('xletShapeViolations catches the reviewer bypass mutations', () => {
    // direct route: imports.extensions chain straight to a lib module
    assert.equal(xletShapeViolations('f.js', "const { App } = imports.extensions['greenTile@carsteneu'].lib.app.app;").length, 1,
        'a direct imports.extensions route is flagged');
    // hidden alias: XLET.lib bound to a local name, chains continue elsewhere
    const aliased = [
        "const XLET = imports.extensions['greenTile@carsteneu'];",
        'const hiddenLib = XLET.lib;',
        'const { App } = hiddenLib.app.app;',
    ].join('\n');
    assert.equal(xletShapeViolations('f.js', aliased).length, 1, 'XLET.lib aliasing is flagged');
    // the canonical form stays clean
    const canonical = [
        "const XLET = imports.extensions['greenTile@carsteneu'];",
        "const { Split } = XLET.lib.runtime.split;",
        "const { SETTINGS_KEYS } = XLET.lib.model['settings-keys'];",
    ].join('\n');
    assert.deepEqual(xletShapeViolations('f.js', canonical), [], 'the canonical wiring passes');
});

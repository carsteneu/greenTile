'use strict';
// Architecture guards on the shipped module graph: the native import graph of
// every shipped .js file (extension.js, lib/**/*.js) must stay acyclic — a
// re-entrant import during module evaluation reaches a partially initialized
// namespace (or re-evaluates forever under the legacy CJS loader), and the
// whole point of the layered design is a strictly one-directional flow — and
// must obey the layer rules below, written as a data table: lib/app is the
// composition root next to the entry, extension.js may import only lib/app and
// the session runtime. The loader-side mirror of the importer cache semantics
// lives in tests/helpers/native-importer.js and is self-tested per fixture at
// the bottom.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../helpers/cinnamon-loader');

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
// (settings-keys, panel-size, focus-nav) must use the bracket form — a dotted
// hyphen would parse as a subtraction and break at import time.
const chainRe = /XLET\.lib((?:\.[A-Za-z_$][\w$]*|\['[^']+'\])+)/g;
const segmentRe = /\.([A-Za-z_$][\w$]*)|\['([^']+)'\]/g;

// Layer rules as data: a module may only import its own layer or lower ones.
// The entry extension.js may import only the composition root (lib/app) and
// the session runtime. lib/app is imported by nothing but lib/app itself and
// the entry — the composition root has no lower-layer dependents (the pure
// settings-key constants live in the model layer for exactly that reason).
const LAYER_RULES = [
    { dir: 'lib/model', allows: ['lib/model'] },
    { dir: 'lib/tiling', allows: ['lib/model', 'lib/tiling'] },
    { dir: 'lib/runtime', allows: ['lib/model', 'lib/tiling', 'lib/runtime'] },
    { dir: 'lib/ui', allows: ['lib/model', 'lib/tiling', 'lib/runtime', 'lib/ui'] },
    { dir: 'lib/app', allows: ['lib/model', 'lib/tiling', 'lib/runtime', 'lib/ui', 'lib/app'] },
    { dir: 'extension.js', allows: ['lib/app', 'lib/runtime/session.js'] },
];

const layerOf = (file) => LAYER_RULES.find((l) => file === l.dir || file.startsWith(l.dir + '/')) || null;

const chainToTarget = (chain) => {
    const segments = [];
    let m;
    segmentRe.lastIndex = 0;
    while ((m = segmentRe.exec(chain)) !== null) {
        segments.push(m[1] || m[2]);
    }
    return ['lib', ...segments].join('/') + '.js';
};

const buildGraph = () => {
    const graph = new Map();
    for (const file of shippedJs) {
        const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
        const targets = [];
        for (const match of src.matchAll(chainRe)) {
            targets.push(chainToTarget(match[1]));
        }
        graph.set(file, targets);
    }
    return graph;
};

// Depth-first cycle search over the static graph; every import target of a
// shipped file itself ships (native-resolver.test.js), so an unknown node is
// a real integrity break and is walked as a cycle end.
const findCycle = (graph) => {
    const open = new Set();
    const done = new Set();
    const trail = [];
    const visit = (node) => {
        if (done.has(node))
            {return null;}
        if (open.has(node)) {
            const at = trail.indexOf(node);
            return trail.slice(at).concat(node);
        }
        open.add(node);
        trail.push(node);
        for (const dep of graph.get(node) || []) {
            const cycle = visit(dep);
            if (cycle)
                {return cycle;}
        }
        trail.pop();
        open.delete(node);
        done.add(node);
        return null;
    };
    for (const start of graph.keys()) {
        const cycle = visit(start);
        if (cycle)
            {return cycle;}
    }
    return null;
};

test('the shipped native import graph is strictly acyclic (cycle path reported)', () => {
    const graph = buildGraph();
    const cycle = findCycle(graph);
    assert.equal(cycle, null, 'import cycle detected: ' + (cycle || []).join(' -> '));
    assert.ok(graph.size > 20, 'the shipped set was actually scanned');
});

test('lib layers may only import their own or lower layers', () => {
    const graph = buildGraph();
    const violations = [];
    for (const [file, deps] of graph) {
        const layer = layerOf(file);
        if (!layer || layer.allows === null)
            {continue;}
        for (const dep of deps) {
            const depLayer = layerOf(dep);
            // allows lists layer dirs; a rule may also name a concrete file
            // (the entry's session runtime: lib/runtime/session.js)
            if ((depLayer && layer.allows.includes(depLayer.dir)) || layer.allows.includes(dep))
                {continue;}
            violations.push(file + ' -> ' + dep + ' (layer ' + layer.dir + ' forbids '
                + (depLayer ? depLayer.dir : dep) + ')');
        }
    }
    assert.deepEqual(violations, [], 'layer violations');
});

test('nothing outside lib/app and extension.js imports the composition root', () => {
    const graph = buildGraph();
    const violations = [];
    for (const [file, deps] of graph) {
        if (file === 'extension.js' || file.startsWith('lib/app/'))
            {continue;}
        for (const dep of deps) {
            if (dep.startsWith('lib/app/'))
                {violations.push(file + ' -> ' + dep + ' (lower layer must not depend on the composition root)');}
        }
    }
    assert.deepEqual(violations, [], 'composition-root dependents');
});

test('every lib module declares at least one public native export', () => {
    const empty = shippedJs.filter((f) => f.startsWith('lib/'))
        .filter((f) => !/^var\s+[A-Za-z_$][\w$]*|^function\s+[A-Za-z_$][\w$]*/m.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    assert.deepEqual(empty, [], 'lib files without a public var/function export');
});

test('the importer mirrors the native cache: an import cycle throws naming the chain', () => {
    const { createXletImporter } = require('../helpers/native-importer');
    const fixtures = path.join(ROOT, 'tests', 'helpers', 'fixtures');
    const imp = createXletImporter({ root: fixtures });
    globalThis.imports = imp;
    let err = null;
    try {
        void imp['cycle-a'];
    }
    catch (e) {
        err = e;
    }
    finally {
        delete globalThis.imports;
    }
    assert.ok(err, 'the fixture cycle must throw');
    assert.match(err.message, /circular native import/);
    assert.match(err.message, /cycle-a -> cycle-b -> cycle-a/,
        'the chain naming both fixtures must be in the message');
});

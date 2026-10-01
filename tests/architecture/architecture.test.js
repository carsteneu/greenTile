'use strict';
// Architecture guards on the shipped module graph: the require graph of every
// shipped .js file (extension.js, lib/**/*.js) must stay acyclic — Cinnamon's
// fileUtils.js createExports caches a module only after its evaluation
// finished, so a module required while it is still evaluating would be
// re-evaluated forever — and must obey the layer rules below, written as a data
// table: lib/app is the composition root next to the entry, extension.js may
// require only lib/app and the session runtime. The loader-side mirror of the
// createExports cache semantics lives in cinnamon-loader.js and is self-tested
// per fixture here.
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

const requireRe = /\brequire\(\s*(['"])([^'"\n]+)\1\s*\)/g;

// Layer rules as data: a module may only require its own layer or lower ones.
// The entry extension.js may require only the composition root (lib/app) and
// the session runtime. lib/app is required by nothing but lib/app itself and
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

const buildGraph = () => {
    const graph = new Map();
    for (const file of shippedJs) {
        const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
        const targets = [];
        for (const match of src.matchAll(requireRe)) {
            // gi./ui./misc./perf. specifiers reach the Cinnamon imports global
            // and never enter the file graph
            if (/^(?:gi|ui|misc|perf)\./.test(match[2]))
                {continue;}
            const target = match[2].replace(/\.\//g, '');
            targets.push(target.endsWith('.js') ? target : target + '.js');
        }
        graph.set(file, targets);
    }
    return graph;
};

// Depth-first cycle search over the static graph; every require target of a
// shipped file itself ships (require-resolver.test.js), so an unknown node is
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

test('the shipped require graph is strictly acyclic (cycle path reported)', () => {
    const graph = buildGraph();
    const cycle = findCycle(graph);
    assert.equal(cycle, null, 'require cycle detected: ' + (cycle || []).join(' -> '));
    assert.ok(graph.size > 20, 'the shipped set was actually scanned');
});

test('lib layers may only require their own or lower layers', () => {
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

test('nothing outside lib/app and extension.js requires the composition root', () => {
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

test('every lib module declares an explicit column-0 module.exports', () => {
    const missing = shippedJs.filter((f) => f.startsWith('lib/'))
        .filter((f) => !/^module\.exports(\.[a-zA-Z0-9_$]+)?\s*=/m.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    assert.deepEqual(missing, [], 'lib files without explicit module.exports');
});

test('the loader mirrors createExports: a require cycle throws "circular require" naming the chain', () => {
    const { load } = require('../helpers/cinnamon-loader');
    let err = null;
    try {
        load('./tests/helpers/fixtures/cycle-a.js');
    }
    catch (e) {
        err = e;
    }
    assert.ok(err, 'the fixture cycle must throw');
    assert.match(err.message, /circular require/);
    assert.match(err.message, /cycle-a\.js -> .*cycle-b\.js -> .*cycle-a\.js/,
        'the chain naming both fixtures must be in the message');
});

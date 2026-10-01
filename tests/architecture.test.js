'use strict';
// Architecture guards on the shipped module graph: the require graph of every
// shipped .js file (extension.js, greenTile.js, lib/**/*.js) must stay acyclic
// — Cinnamon's fileUtils.js createExports caches a module only after its
// evaluation finished, so a module required while it is still evaluating would
// be re-evaluated forever — and must obey the layer rules below, written as a
// data table (4c-B only edits the table when lib/app moves in and greenTile.js
// becomes a thin entry). The loader-side mirror of the createExports cache
// semantics lives in cinnamon-loader.js and is self-tested per fixture here.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('./cinnamon-loader');

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
})(path.join(ROOT, 'lib'), 'lib').concat(['greenTile.js', 'extension.js']);

const requireRe = /\brequire\(\s*(['"])([^'"\n]+)\1\s*\)/g;

// Layer rules as data: a module may only require its own layer or lower ones.
// entry: null allows (greenTile.js today, extension.js) may require everything
// in lib — 4c-B tightens this.
const LAYER_RULES = [
    { dir: 'lib/model', allows: ['lib/model'] },
    { dir: 'lib/tiling', allows: ['lib/model', 'lib/tiling'] },
    { dir: 'lib/runtime', allows: ['lib/model', 'lib/tiling', 'lib/runtime'] },
    { dir: 'lib/ui', allows: ['lib/model', 'lib/tiling', 'lib/runtime', 'lib/ui'] },
    { dir: 'greenTile.js', allows: null },
    { dir: 'extension.js', allows: null },
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
                continue;
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
    const path = [];
    const visit = (node) => {
        if (done.has(node))
            return null;
        if (open.has(node)) {
            const at = path.indexOf(node);
            return path.slice(at).concat(node);
        }
        open.add(node);
        path.push(node);
        for (const dep of graph.get(node) || []) {
            const cycle = visit(dep);
            if (cycle)
                return cycle;
        }
        path.pop();
        open.delete(node);
        done.add(node);
        return null;
    };
    for (const start of graph.keys()) {
        const cycle = visit(start);
        if (cycle)
            return cycle;
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
            continue;
        for (const dep of deps) {
            const depLayer = layerOf(dep);
            if (!depLayer || !layer.allows.includes(depLayer.dir))
                violations.push(file + ' -> ' + dep + ' (layer ' + layer.dir + ' forbids '
                    + (depLayer ? depLayer.dir : dep) + ')');
        }
    }
    assert.deepEqual(violations, [], 'layer violations');
});

test('every lib module declares an explicit column-0 module.exports', () => {
    const missing = shippedJs.filter((f) => f.startsWith('lib/'))
        .filter((f) => !/^module\.exports(\.[a-zA-Z0-9_$]+)?\s*=/m.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
    assert.deepEqual(missing, [], 'lib files without explicit module.exports');
});

test('the loader mirrors createExports: a require cycle throws "circular require" naming the chain', () => {
    const { load } = require('./cinnamon-loader');
    let err = null;
    try {
        load('./tests/fixtures/cycle-a.js');
    }
    catch (e) {
        err = e;
    }
    assert.ok(err, 'the fixture cycle must throw');
    assert.match(err.message, /circular require/);
    assert.match(err.message, /cycle-a\.js -> .*cycle-b\.js -> .*cycle-a\.js/,
        'the chain naming both fixtures must be in the message');
});

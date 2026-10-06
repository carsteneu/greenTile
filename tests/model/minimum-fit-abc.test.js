'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { load, cinnamonLoad, ROOT } = require('../helpers/cinnamon-loader');
const m = load('./lib/model/split.js');

for (const [kind, shape, n, width, want] of [
    ['cols', [1, 1, 2], 4, 1300, [1, 1, 1, 1]],
    ['cols', [2, 1], 3, 1200, [1, 1, 1]],
    ['rows', [1, 2], 3, 1200, [3]],
]) {
    test(`ABC selector: ${kind} ${shape} searches remaining counts only after preferred counts fail`, () => {
        assert.deepEqual(m.splitFitShape(kind, shape, Array.from({ length: n }, () => ({ w: 300, h: 600 })),
            width, 1000, 12), want);
    });
}

// Exhaustive small partitions, independent of the production interval DP. Preserve
// nominal-first, count-direction and local balance tie breaks for all old successes;
// extend only its failed-count branch. At most four windows, 4608 inputs.
const partitions = (n) => n === 0 ? [[]] : Array.from({ length: n }, (_v, i) => i + 1)
    .flatMap((k) => partitions(n - k).map((tail) => [k, ...tail]));
const cost = (kind, shape, mins, width, height, gap) => {
    let at = 0;
    let used = 0;
    for (const size of shape) {
        const group = mins.slice(at, at + size);
        if (group.reduce((sum, v) => sum + (kind === 'cols' ? v.h : v.w), 0)
            + (size - 1) * gap > (kind === 'cols' ? height : width)) { return Infinity; }
        used += Math.max(...group.map((v) => kind === 'cols' ? v.w : v.h)) + (at ? gap : 0);
        at += size;
    }
    return used;
};
const compare = (a, b, kind, mins, width, height, gap) => {
    const length = cost(kind, a, mins, width, height, gap) - cost(kind, b, mins, width, height, gap);
    if (length) { return length; }
    // DP resolves each suffix by its own least length, then local balance and first
    // boundary. Compare the same decisions recursively, not a global balance sum.
    const off = Math.abs(a[0] - mins.length / a.length) - Math.abs(b[0] - mins.length / b.length);
    return off || (a[0] - b[0]) || (a.length > 1
        ? compare(a.slice(1), b.slice(1), kind, mins.slice(a[0]), width, height, gap) : 0);
};

test('ABC selector: bounded partition oracle preserves preferences and finds omitted feasible counts', () => {
    let cases = 0;
    for (const kind of ['cols', 'rows']) {
        for (const shape of partitions(4)) {
            for (const width of [500, 1000, 1600]) {
                for (const height of [500, 1000, 1600]) {
                    for (const gap of [0, 12]) {
                        for (let mask = 0; mask < 16; mask++) {
                            const mins = Array.from({ length: 4 }, (_v, i) => ({
                                w: mask & (1 << i) ? 600 : 200, h: mask & (1 << i) ? 200 : 600,
                            }));
                            const limit = kind === 'cols' ? width : height;
                            let want = shape;
                            if (cost(kind, shape, mins, width, height, gap) > limit) {
                                const counts = kind === 'cols'
                                    ? Array.from({ length: shape.length }, (_v, i) => shape.length - i)
                                        .concat(Array.from({ length: 4 - shape.length }, (_v, i) => shape.length + i + 1))
                                    : Array.from({ length: 5 - shape.length }, (_v, i) => shape.length + i)
                                        .concat(Array.from({ length: shape.length - 1 }, (_v, i) => shape.length - i - 1));
                                for (const count of counts) {
                                    const options = partitions(4).filter((s) => s.length === count && cost(kind, s, mins, width, height, gap) <= limit);
                                    if (options.length) {
                                        want = options.sort((a, b) => compare(a, b, kind, mins, width, height, gap))[0];
                                        break;
                                    }
                                }
                            }
                            assert.deepEqual(m.splitFitShape(kind, shape, mins, width, height, gap), want,
                                JSON.stringify({ kind, shape, mins, width, height, gap }));
                            cases++;
                        }
                    }
                }
            }
        }
    }
    assert.equal(cases, 4608);
});

test('ABC DP: interval work is cubic, including skipped suffix states', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib/model/split.js'), 'utf8');
    const ast = ts.createSourceFile('split.js', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const positions = [];
    const visit = (node) => {
        if (ts.isCallExpression(node) && node.expression.getText(ast) === 'Math.max') {
            positions.push(node.getStart(ast));
        }
        ts.forEachChild(node, visit);
    };
    visit(ast);
    let instrumented = src;
    for (const at of positions.reverse()) {
        instrumented = instrumented.slice(0, at) + 'countMax' + instrumented.slice(at + 'Math.max'.length);
    }
    const probe = cinnamonLoad('var maxCalls = 0; const countMax = (...args) => { maxCalls++; return Math.max(...args); };\n'
        + instrumented + '\nvar countCalls = () => maxCalls;', load, 'instrumented-split.js');
    for (const n of [10, 20]) {
        const before = probe.countCalls();
        const mins = Array.from({ length: n }, (_v, i) => ({ w: i % 3 === 0 ? 700 : 300, h: 100 }));
        const fit = probe.splitFitShape('cols', Array.from({ length: n }, () => 1), mins, 1000, n * 120, 12);
        assert.equal(fit.reduce((a, b) => a + b, 0), n);
        assert.ok(probe.countCalls() - before <= n * (n + 1) * (n + 2) / 6 + n,
            'one interval maximum per j transition, not an interval rescan');
    }
});

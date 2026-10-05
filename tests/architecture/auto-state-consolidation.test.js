'use strict';
// Consolidation guard for the automatic-tiling state. The permission decision and
// the enqueue each live in exactly ONE place, and the invariant is pinned on the
// shipped source rather than through observed behavior: a caller that re-inlines an
// equivalent guard is behaviorally identical to the shared query, so every
// behavioral suite still passes (a cold reviewer proved it — inlining the pause gate
// into retile.js left the behavior tests green).
//
// Enforced:
//   - the retained-pause gate (session.holdsPause) is read in the tiling layer only
//     by lib/tiling/layout.js (inside autoAllowed) — retile/swap consume autoAllowed.
//   - app.session.pendingAuto is appended only by lib/runtime/auto.js (Auto#_retainAuto).
//   - lib/runtime/auto.js holds exactly ONE settings write for an auto command
//     (Auto#_applyAuto) and ONE retained-intent removal (Auto#_dropIntent); every
//     caller — activate, deactivate, _applyOrHonorPending, applyPending — goes through them.
//
// Known, deliberately-unconsolidated write path (NOT covered here): the preset-row
// click in lib/ui/panel.js sets `auto: true` directly and ignores a refused write —
// unlike Auto#_applyAuto it retains NO intent on refusal. Routing it through the
// primitive would ADD refusal-retention, i.e. change behavior, which this refactor
// (no behavior change) does not do. This guard does not claim to cover it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT } = require('../helpers/cinnamon-loader');

const shippedLib = (function collect(dir, prefix) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            out.push(...collect(path.join(dir, entry.name), rel));
        }
        else if (entry.name.endsWith('.js')) {
            out.push(rel);
        }
    }
    return out;
})(path.join(ROOT, 'lib'), 'lib');

// count on code only: comments and simple string literals cannot hide the call
const codeOf = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
const occurrences = (code, token) => code.split(token).length - 1;

test('the retained-pause permission gate is reached only through layout.autoAllowed in the tiling layer', () => {
    const readers = shippedLib
        .filter((rel) => rel.startsWith('lib/tiling/') && occurrences(codeOf(rel), 'holdsPause') > 0)
        .sort();
    assert.deepEqual(readers, ['lib/tiling/layout.js'],
        'retile/swap must consume layout.autoAllowed, not re-read session.holdsPause');
});

test('the auto-command enqueue has exactly one implementation', () => {
    const enqueuers = shippedLib.filter((rel) => occurrences(codeOf(rel), 'pendingAuto.push') > 0).sort();
    assert.deepEqual(enqueuers, ['lib/runtime/auto.js'],
        'app.session.pendingAuto is appended only by Auto#_retainAuto');
    assert.equal(occurrences(codeOf('lib/runtime/auto.js'), 'pendingAuto.push'), 1,
        'and only once, inside Auto#_retainAuto');
});

test('the auto-command write and its intent removal each have exactly one implementation', () => {
    const auto = codeOf('lib/runtime/auto.js');
    assert.equal(occurrences(auto, 'layoutSet('), 1,
        'the only settings write for an auto command is inside Auto#_applyAuto');
    assert.equal(occurrences(auto, 'session.dropIntent('), 1,
        'the only retained-intent removal is inside Auto#_dropIntent');
});

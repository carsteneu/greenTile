'use strict';
// Consolidation guard for the automatic-tiling state: the permission decision, the
// enqueue path and the successful-write path each live in exactly ONE place. The
// permission decision is layout.autoAllowed — the retile and the swap consume it and
// must not re-derive the retained-pause gate; the enqueue is Auto#_retainAuto (the
// only app.session.pendingAuto.push). A caller that open-codes either again would
// pass every behavioral suite, because an equivalent inline is behaviorally
// identical to the shared query, so the invariant is pinned on the shipped source
// here rather than through observed behavior.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { ROOT } = require('../helpers/cinnamon-loader');

// count on code only: a comment may name the gate without consulting it
const codeOf = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
const occurrences = (code, token) => code.split(token).length - 1;

test('the retained-pause permission gate is read only by layout.autoAllowed', () => {
    for (const rel of ['lib/tiling/retile.js', 'lib/tiling/swap.js']) {
        assert.equal(occurrences(codeOf(rel), 'holdsPause'), 0,
            rel + ' must reach the pause gate through layout.autoAllowed, not by re-reading holdsPause');
    }
    assert.equal(occurrences(codeOf('lib/tiling/layout.js'), 'holdsPause'), 1,
        'layout.js owns the single pause-gate read, inside autoAllowed');
});

test('the auto-command enqueue has exactly one implementation', () => {
    assert.equal(occurrences(codeOf('lib/runtime/auto.js'), 'pendingAuto.push'), 1,
        'app.session.pendingAuto is appended only by Auto#_retainAuto');
});

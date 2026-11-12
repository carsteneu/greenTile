#!/usr/bin/env node
// Runs the Cinnamon Spices pattern check locally, against the files this
// repository ships — so a finding shows up here and not in the pull request.
//
// The upstream checker lives in linuxmint/github-actions (pattern-checker) and
// runs as a regex pass over a PR diff. Two consequences worth knowing:
//
//   * It has no parser. A comment that QUOTES an identifier counts as a use, so
//     precise prose has to avoid writing those names out. That is the trap this
//     script exists to surface before a push.
//   * It only sees the diff, so a finding appears when a file enters the diff,
//     not when it is first written.
//
// patterns.json is a frozen copy of pattern-checker/patterns/*.yml (fetched
// 2026-11-12). When upstream adds patterns this file has to be refreshed; the
// versions are listed in PATTERN_SOURCE below so the refresh is mechanical.
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PATTERN_SOURCE = 'linuxmint/github-actions @ pattern-checker/patterns (2026-11-12)';

// The checker's own default exclusions (pattern-checker/patterns.yml), plus the
// file kinds we ship that it never sees: it reads the PR diff of the spice's
// files/ directory, which is what shippedFiles() resolves to.
const EXCLUDED = [/\.po$/, /\.pot$/, /ChangeLog$/, /NEWS$/, /\.md$/, /\.svg$/, /\.desktop$/];

/** The .js files that go into a release, relative to the repo root. */
function shippedFiles() {
    const out = ['extension.js'];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
            const rel = dir + '/' + entry.name;
            if (entry.isDirectory()) {
                walk(rel);
            }
            else if (entry.name.endsWith('.js')) {
                out.push(rel);
            }
        }
    };
    walk('lib');
    return out.filter((f) => !EXCLUDED.some((re) => re.test(f)));
}

const patterns = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'patterns.json'), 'utf8'))
    .map((p) => ({ ...p, re: new RegExp(p.regex) }));

const findings = [];
for (const file of shippedFiles()) {
    const lines = fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n');
    lines.forEach((line, i) => {
        for (const p of patterns) {
            if (p.re.test(line)) {
                findings.push({ file, line: i + 1, pattern: p.name, family: p.family, text: line.trim().slice(0, 100) });
            }
        }
    });
}

if (findings.length === 0) {
    console.log('check-patterns: 0 findings in ' + shippedFiles().length + ' shipped .js files ('
        + patterns.length + ' patterns, ' + PATTERN_SOURCE + ')');
    process.exit(0);
}

const byFamily = new Map();
for (const f of findings) {
    if (!byFamily.has(f.family)) {
        byFamily.set(f.family, []);
    }
    byFamily.get(f.family).push(f);
}
console.log('check-patterns: ' + findings.length + ' finding(s) in ' + shippedFiles().length + ' shipped .js files');
for (const [family, list] of byFamily) {
    console.log('\n[' + family + ']');
    for (const f of list) {
        console.log('  ' + f.file + ':' + f.line + '  ' + f.pattern);
        console.log('    ' + f.text);
    }
}
console.log('\nUpstream treats these as advisory (fail_on_match: false). A comment that quotes an');
console.log('identifier is reported like a use — reword it rather than arguing with the regex.');
process.exit(1);

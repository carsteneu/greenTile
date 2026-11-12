#!/usr/bin/env node
// Every version a submission text names must be the version we ship.
//
// The Spices pull request body and the listing text are written by hand, and the
// body said "built from the tagged 2.3.0 release" two releases after 2.3.0 — twice.
// The tag is visible in the commit history anyway, so a stale number there is pure
// noise for a reviewer, and it is the kind of detail nobody re-reads before a push.
//
// PR_BODY.md is the body as pushed to the pull request, kept here so this check can
// run offline. Update it when the body changes; the number it names is checked.
'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'metadata.json'), 'utf8')).version;

// The submission texts: the PR body (as pushed, kept here so the check runs
// offline) and the listing a reader sees in the store.
const TEXTS = ['spices/greenTile@carsteneu/PR_BODY.md', 'spices/greenTile@carsteneu/README.md'];
// Only the release the submission is built from. A bare X.Y.Z in these texts is
// usually a Cinnamon version (6.0.4, 6.6.9) or a historical release the feature
// list refers to, and neither is a version claim this check can judge.
const VERSION = /\btagged v?(\d+\.\d+\.\d+)\b/g;

const problems = [];
let mentions = 0;
for (const rel of TEXTS) {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) {
        continue;
    }
    fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        for (const m of line.matchAll(VERSION)) {
            mentions++;
            if (m[1] !== version) {
                problems.push({ file: rel, line: i + 1, found: m[1], text: line.trim().slice(0, 90) });
            }
        }
    });
}

if (problems.length === 0) {
    console.log('check-submission: ' + mentions + ' version mention(s), all ' + version + ' (metadata.json)');
    process.exit(0);
}
console.log('check-submission: metadata.json says ' + version + ', these texts say otherwise:');
for (const p of problems) {
    console.log('  ' + p.file + ':' + p.line + '  ' + p.found);
    console.log('    ' + p.text);
}
process.exit(1);

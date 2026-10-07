'use strict';
// Release consistency guard: every version marker — metadata.json, package.json,
// package-lock.json (two lines) and the Project-Id-Version header of every
// po/*.po plus the pot template — must equal the version in metadata.json, the
// one file makepot.sh and build-release.sh read. Without this a half-bumped
// tree ships a zip whose name, metadata and catalogs disagree.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { ROOT } = require('../helpers/cinnamon-loader');
const { markerFiles, collectMarkers, findMismatches, readVersion, POT } = require('../helpers/version-markers');

const TMP = path.join(ROOT, '.yesmem', 'tmp');
fs.mkdirSync(TMP, { recursive: true });

// A minimal tree holding exactly the marker files, for mismatch fixtures.
function makeVersionTree(t) {
    const dir = fs.mkdtempSync(path.join(TMP, 'version-tree-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    fs.mkdirSync(path.join(dir, 'po'), { recursive: true });
    for (const rel of markerFiles(ROOT)) {
        fs.copyFileSync(path.join(ROOT, rel), path.join(dir, rel));
    }
    return dir;
}

test('every version marker equals metadata.json on the shipped tree', () => {
    assert.match(readVersion(ROOT), /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/,
        'metadata.json version is not a plain X.Y.Z (no v prefix, no leading zeros)');
    const markers = collectMarkers(ROOT);
    // Derive the count rather than freezing it: adding a language is a normal
    // change and both the guard and the bump script pick the new po up on their
    // own. package-lock.json is the only file with two markers.
    assert.equal(markers.length, markerFiles(ROOT).length + 1,
        'collectMarkers found a different number of markers than markerFiles lists');
    assert.deepEqual(findMismatches(ROOT), []);
});

test('every catalog carries exactly one Project-Id-Version header', () => {
    for (const rel of markerFiles(ROOT)) {
        if (!rel.endsWith('.po') && rel !== POT) {
            continue;
        }
        const hits = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('Project-Id-Version:').length - 1;
        assert.equal(hits, 1, `${rel}: expected exactly one Project-Id-Version header, found ${hits}`);
    }
});

test('a po header that drifts from metadata.json is reported', (t) => {
    const dir = makeVersionTree(t);
    const de = path.join(dir, 'po', 'de.po');
    fs.writeFileSync(de, fs.readFileSync(de, 'utf8')
        .replace(/Project-Id-Version: greenTile [^\\"]*/, 'Project-Id-Version: greenTile 0.0.0'));
    const mismatches = findMismatches(dir);
    assert.equal(mismatches.length, 1, `expected exactly the drifted catalog to be reported: ${mismatches.join(', ')}`);
    assert.match(mismatches[0], /po\/de\.po: 0\.0\.0/);
});

test('a package-lock.json entry that drifts from metadata.json is reported', (t) => {
    const dir = makeVersionTree(t);
    const lock = path.join(dir, 'package-lock.json');
    const obj = JSON.parse(fs.readFileSync(lock, 'utf8'));
    obj.packages[''].version = '0.0.0';
    fs.writeFileSync(lock, `${JSON.stringify(obj, null, 4)}\n`);
    const mismatches = findMismatches(dir);
    assert.equal(mismatches.length, 1, `expected exactly the drifted lock entry to be reported: ${mismatches.join(', ')}`);
    assert.match(mismatches[0], /package-lock\.json: 0\.0\.0/);
});

test('a missing marker is reported, not ignored', (t) => {
    const dir = makeVersionTree(t);
    const ja = path.join(dir, 'po', 'ja.po');
    fs.writeFileSync(ja, fs.readFileSync(ja, 'utf8').replace(/^"Project-Id-Version:[^\n]*\n/m, ''));
    const mismatches = findMismatches(dir);
    assert.equal(mismatches.length, 1, `expected the removed marker to be reported: ${mismatches.join(', ')}`);
    assert.match(mismatches[0], /po\/ja\.po: no marker found/);
});
